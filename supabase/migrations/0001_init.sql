-- Sesame, schéma initial.
--
-- Paiement en ligne uniquement, via Stripe Checkout hébergé. Aucune espèce.
-- Aucun compte obligatoire: la commande invité est le chemin par défaut.
-- Connexion Google via Supabase Auth, uniquement comme confort de pré-remplissage.
--
-- Les écritures de commande passent par les server actions et le webhook Stripe
-- avec la clé service_role, qui contourne RLS. Les policies ci-dessous ne servent
-- qu'à l'admin (lecture temps réel du flux) et à la lecture publique des réglages.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Statuts
-- ---------------------------------------------------------------------------
-- en_attente_paiement -> confirmee -> en_preparation -> prete -> livree | retiree
-- paiement_echoue n'est atteignable que depuis en_attente_paiement.
-- annulee est atteignable depuis tout statut non terminal, voir la note sur le
-- trigger plus bas.

create type public.order_status as enum (
  'en_attente_paiement',
  'paiement_echoue',
  'confirmee',
  'en_preparation',
  'prete',
  'livree',
  'retiree',
  'annulee'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
-- L'email admin doit aussi exister côté base, sinon les policies RLS ne peuvent
-- pas autoriser l'abonnement temps réel du flux de commandes.

create table public.admin_emails (
  email text primary key
);

alter table public.admin_emails enable row level security;

-- Doit rester identique à ADMIN_EMAIL dans .env.local.
insert into public.admin_emails (email) values ('admin@example.com');

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),

  -- Référence courte et lisible, ex. SES-4B2K. Générée côté serveur sur un
  -- alphabet sans caractères ambigus (ni I, ni O, ni 0, ni 1).
  reference text not null unique
    check (reference ~ '^SES-[2-9A-HJ-NP-Z]{4}$'),

  created_at timestamptz not null default now(),

  status public.order_status not null default 'en_attente_paiement',
  -- Alimenté par le trigger, sert à afficher "prête depuis 6 min" en cuisine.
  status_changed_at timestamptz not null default now(),
  confirmed_at timestamptz,

  -- Client connecté, ou null pour une commande invité. Une suppression de compte
  -- ne doit jamais supprimer l'historique de commande.
  customer_id uuid references auth.users (id) on delete set null,

  -- Coordonnées saisies à la commande. Seule identité pour un invité, et source
  -- du pré-remplissage sur retour, par téléphone.
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name  text not null check (length(trim(last_name))  between 1 and 80),
  phone      text not null check (length(trim(phone)) between 6 and 30),
  email      text not null check (position('@' in email) > 1),

  mode text not null check (mode in ('livraison', 'retrait')),
  address_line text,
  postcode text check (postcode ~ '^[0-9]{5}$'),
  constraint address_required_for_delivery check (
    (mode = 'livraison'
      and address_line is not null
      and length(trim(address_line)) > 0
      and postcode is not null)
    or
    (mode = 'retrait' and address_line is null and postcode is null)
  ),

  slot_start timestamptz not null,
  slot_end   timestamptz not null,
  constraint slot_ordered check (slot_end > slot_start),

  -- Stripe. La ligne est créée avant la session, donc ces colonnes sont nulles
  -- le temps d'un aller-retour.
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  paid_at timestamptz,

  -- Remboursement. Renseigné par l'action d'annulation, uniquement après un
  -- remboursement Stripe réussi.
  stripe_refund_id text,
  refunded_at timestamptz,
  refund_amount_cents integer check (refund_amount_cents >= 0),

  -- Une commande déjà payée ne peut pas être annulée sans remboursement. La
  -- base refuse le cas "annulée mais toujours débitée", même si le code se
  -- trompe ou si quelqu'un écrit à la main.
  constraint cancelled_paid_order_must_be_refunded check (
    status <> 'annulee'
    or confirmed_at is null
    or refunded_at is not null
  ),

  -- Montants, tous en centimes entiers, tous recalculés côté serveur à partir
  -- de src/config/menu.ts. Aucun montant transmis par le client n'est utilisé.
  subtotal_cents          integer not null check (subtotal_cents >= 0),
  referral_discount_cents integer not null default 0 check (referral_discount_cents >= 0),
  delivery_fee_cents      integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents             integer not null check (total_cents >= 0),
  constraint totals_consistent check (
    total_cents = subtotal_cents - referral_discount_cents + delivery_fee_cents
  ),

  -- Attribution. Tout code est enregistré, même s'il ne donne pas de remise.
  referral_code text,

  -- Consentements. Les deux défauts sont false, la case n'est jamais pré-cochée.
  marketing_opt_in boolean not null default false,
  age_confirmed boolean not null default false,

  customer_note text check (length(customer_note) <= 500),

  -- Suivi des effets de bord, pour pouvoir rejouer un envoi raté.
  customer_emailed_at timestamptz,
  kitchen_notified_at timestamptz
);

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);
create index orders_slot_start_idx on public.orders (slot_start);
create index orders_customer_id_idx on public.orders (customer_id)
  where customer_id is not null;
create index orders_referral_code_idx on public.orders (referral_code)
  where referral_code is not null;
-- Sert au pré-remplissage d'un invité qui revient, jamais à l'authentifier.
create index orders_phone_idx on public.orders (phone, created_at desc);

comment on column public.orders.customer_id is
  'Null pour une commande invité. Le rapprochement par téléphone sert au pré-remplissage, jamais à authentifier.';
comment on column public.orders.age_confirmed is
  'Coché uniquement quand le panier contient de la bière alcoolisée.';

-- ---------------------------------------------------------------------------
-- Transitions de statut
-- ---------------------------------------------------------------------------
-- La préparation ne démarre que depuis confirmee: c'est le paiement qui déclenche,
-- pas un clic. Le trigger rend cette règle impossible à contourner, y compris
-- depuis le SQL editor.
--
-- Note: annulee est autorisée depuis tout statut non terminal, et pas seulement
-- avant confirmee. Sans cela une commande payée ne pourrait plus jamais être
-- annulée, ce qui bloque la cuisine en cas de rupture. Le remboursement Stripe
-- n'est pas géré ici.

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('livree', 'retiree', 'annulee', 'paiement_echoue') then
    raise exception 'Statut % terminal, transition vers % refusée', old.status, new.status;
  end if;

  if new.status <> 'annulee' then
    if old.status = 'en_attente_paiement'
       and new.status not in ('confirmee', 'paiement_echoue') then
      raise exception 'Transition % vers % refusée', old.status, new.status;
    elsif old.status = 'confirmee' and new.status <> 'en_preparation' then
      raise exception 'Transition % vers % refusée', old.status, new.status;
    elsif old.status = 'en_preparation' and new.status <> 'prete' then
      raise exception 'Transition % vers % refusée', old.status, new.status;
    elsif old.status = 'prete' then
      if new.status not in ('livree', 'retiree') then
        raise exception 'Transition % vers % refusée', old.status, new.status;
      end if;
      if new.status = 'livree' and new.mode <> 'livraison' then
        raise exception 'Une commande en retrait ne peut pas être livrée';
      end if;
      if new.status = 'retiree' and new.mode <> 'retrait' then
        raise exception 'Une commande en livraison ne peut pas être retirée';
      end if;
    end if;
  end if;

  new.status_changed_at := now();
  if new.status = 'confirmee' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;

  return new;
end;
$$;

create trigger orders_status_transition
  before update of status on public.orders
  for each row
  execute function public.enforce_order_status_transition();

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
-- Instantané du panier, figé à la création de la commande, donc avant paiement.
-- Modifier src/config/menu.ts ne doit jamais réécrire l'historique.

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,

  -- Identifiants issus de src/config/menu.ts, sans FK: le menu reste du code.
  item_id text not null,
  item_name text not null,
  variant_id text,
  variant_name text,

  quantity integer not null check (quantity > 0 and quantity <= 50),

  -- Prix figé, résolu côté serveur depuis menu.ts au moment de la commande.
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  constraint line_total_consistent check (
    line_total_cents = unit_price_cents * quantity
  ),

  -- Figés aussi: le bon de cuisine doit rester lisible et exact des mois plus
  -- tard, même si la recette a changé entre-temps.
  allergens text[] not null default '{}',
  tags text[] not null default '{}',
  contains_alcohol boolean not null default false
);

create index order_items_order_id_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- stripe_events
-- ---------------------------------------------------------------------------
-- Idempotence et journal visible des échecs. Stripe rejoue les événements: la PK
-- sur l'id d'événement absorbe les doublons, et session_id permet de retrouver
-- tout ce qui a touché une session donnée.
-- Un échec laisse une ligne avec error non nul et processed_at nul, ce qui rend
-- le problème lisible dans l'admin au lieu de disparaître.

create table public.stripe_events (
  id text primary key,
  type text not null,
  session_id text,
  order_id uuid references public.orders (id) on delete set null,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error text
);

create index stripe_events_session_id_idx on public.stripe_events (session_id);
create index stripe_events_unprocessed_idx on public.stripe_events (received_at desc)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
-- Deux interrupteurs lus par la vitrine à chaque chargement de page.
-- store_open à false: vitrine en état fermé, commande impossible, on n'atteint
-- jamais Stripe. delivery_enabled à false: retrait uniquement.

create table public.settings (
  key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, enabled) values
  ('store_open', true),
  ('delivery_enabled', true);

-- ---------------------------------------------------------------------------
-- item_availability
-- ---------------------------------------------------------------------------
-- Disponibilité au jour le jour uniquement. Le menu lui-même reste dans
-- src/config/menu.ts. Un item absent de cette table est considéré disponible,
-- donc ajouter un item au menu ne demande aucune écriture en base.

create table public.item_availability (
  item_id text primary key,
  available boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

create trigger item_availability_touch_updated_at
  before update on public.item_availability
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stripe_events enable row level security;
alter table public.settings enable row level security;
alter table public.item_availability enable row level security;

-- Admin: lecture du flux, y compris en temps réel. Rien d'autre.
-- Aucune policy d'écriture sur orders: l'admin ne peut pas faire d'UPDATE direct,
-- il passe obligatoirement par advance_order_status(). Les autres écritures
-- viennent des server actions et du webhook, via service_role.
create policy admin_read_orders on public.orders
  for select to authenticated using (public.is_admin());

-- Ceinture et bretelles: même si une policy était ajoutée par erreur, le rôle
-- n'a de toute façon aucun privilège d'écriture sur la table.
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;

create policy admin_read_order_items on public.order_items
  for select to authenticated using (public.is_admin());
create policy admin_read_stripe_events on public.stripe_events
  for select to authenticated using (public.is_admin());

-- Réglages et disponibilité: lecture publique, la vitrine en a besoin à chaque
-- chargement. Écriture réservée à l'admin.
create policy public_read_settings on public.settings
  for select to anon, authenticated using (true);
create policy admin_write_settings on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy public_read_item_availability on public.item_availability
  for select to anon, authenticated using (true);
create policy admin_write_item_availability on public.item_availability
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Avancement du statut par l'admin
-- ---------------------------------------------------------------------------
-- Seul point d'entrée en écriture sur orders pour l'admin. Accepte un id et un
-- statut cible, rien d'autre: aucune autre colonne n'est joignable depuis le
-- navigateur, ni les montants, ni les coordonnées, ni les champs Stripe.
--
-- Les statuts pilotés par le paiement (confirmee, paiement_echoue) sont refusés
-- ici: ils appartiennent au webhook. annulee est refusée aussi, car une
-- annulation doit passer par le remboursement Stripe.

create or replace function public.advance_order_status(
  p_order_id uuid,
  p_target public.order_status
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  if p_target = 'annulee' then
    raise exception 'Une annulation doit passer par le remboursement Stripe'
      using errcode = '22023';
  end if;

  if p_target in ('en_attente_paiement', 'confirmee', 'paiement_echoue') then
    raise exception 'Le statut % est piloté par le paiement, pas par la cuisine', p_target
      using errcode = '22023';
  end if;

  update public.orders
     set status = p_target
   where id = p_order_id
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Commande introuvable' using errcode = 'P0002';
  end if;

  return v_order;
end;
$$;

revoke all on function public.advance_order_status(uuid, public.order_status)
  from public, anon;
grant execute on function public.advance_order_status(uuid, public.order_status)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Temps réel
-- ---------------------------------------------------------------------------
-- Le flux de commandes s'abonne à orders. RLS s'applique aussi au temps réel,
-- donc seul l'admin reçoit les événements.

alter publication supabase_realtime add table public.orders;

-- ---------------------------------------------------------------------------
-- Vue d'attribution, pour mesurer le rendement des QR codes sur les sacs.
-- ---------------------------------------------------------------------------
-- Ne compte que les commandes payées.

create view public.referral_performance as
select
  referral_code,
  count(*) as orders,
  sum(total_cents) as revenue_cents,
  sum(referral_discount_cents) as discount_cents,
  min(created_at) as first_order_at,
  max(created_at) as last_order_at
from public.orders
where referral_code is not null
  and status in ('confirmee', 'en_preparation', 'prete', 'livree', 'retiree')
group by referral_code;
