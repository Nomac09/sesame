-- Deux changements sans rapport l'un avec l'autre, réunis parce qu'ils touchent
-- tous deux la table orders.
--
-- ---------------------------------------------------------------------------
-- 1. L'attribution devient agrégée
-- ---------------------------------------------------------------------------
--
-- Le cookie `sesame_ref` est déposé quand un client arrive par un QR code
-- imprimé sur un sac. Jusqu'ici, son contenu était recopié dans
-- orders.referral_code, donc rattaché à une ligne qui porte aussi un nom, un
-- téléphone, une adresse et un email.
--
-- C'est ce rattachement qui posait problème. Un cookie de mesure n'est
-- dispensé de consentement (article 82 de la loi Informatique et Libertés,
-- lignes directrices de la CNIL) que s'il sert à une statistique, et non à
-- enrichir le dossier d'une personne identifiée. Écrire le code sur la
-- commande faisait sortir le cookie de cette dispense.
--
-- La colonne disparaît donc, et la mesure passe par un compteur: un code, un
-- jour, un nombre de commandes, un cumul de paniers. Aucun identifiant de
-- commande, aucune donnée personnelle, aucun moyen de revenir d'une ligne de
-- compteur vers un client. La mesure du rendement des QR codes reste possible;
-- le lien avec une personne, non.
--
-- Conséquence assumée: le compteur incrémente au moment où le client atteint
-- la page de paiement, pas à l'encaissement. Compter les commandes payées
-- exigerait de conserver le code attaché à la commande jusqu'au webhook, soit
-- exactement ce qu'on supprime ici.

-- La vue dépend de la colonne, elle tombe d'abord.
drop view if exists public.referral_performance;

-- L'index partiel disparaît avec la colonne.
alter table public.orders drop column if exists referral_code;

-- referral_discount_cents reste: c'est un montant, composant du total et
-- soumis à la contrainte totals_consistent, pas un identifiant d'origine.

create table public.referral_hits (
  code text not null check (length(trim(code)) between 1 and 64),
  -- Journée d'exploitation en heure de Paris, et non en UTC: un service du
  -- soir se termine à 23h et doit compter dans la journée où il a eu lieu.
  day date not null default ((now() at time zone 'Europe/Paris')::date),
  orders integer not null default 0 check (orders >= 0),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  primary key (code, day)
);

comment on table public.referral_hits is
  'Compteur agrégé par code et par jour. Ne doit jamais recevoir de colonne rattachant une ligne à une commande ou à une personne: c''est cette absence de lien qui dispense le cookie d''attribution de consentement.';

alter table public.referral_hits enable row level security;

-- Personne n'y touche depuis un navigateur. L'admin peut lire, et c'est tout.
revoke all on public.referral_hits from anon, authenticated;
grant select on public.referral_hits to authenticated;

create policy admin_read_referral_hits on public.referral_hits
  for select to authenticated using (public.is_admin());

-- Incrément atomique. Un upsert PostgREST ne sait pas exprimer "ajoute 1 à la
-- valeur existante", d'où cette fonction.
--
-- Volontairement SECURITY INVOKER: seul le rôle service_role l'appelle, depuis
-- la server action, et ce rôle contourne déjà RLS. Un SECURITY DEFINER ici
-- serait un privilège gratuit, et toute fonction SECURITY DEFINER du schéma
-- public est exécutable par défaut par anon et authenticated.
create or replace function public.record_referral_hit(
  p_code text,
  p_subtotal_cents integer
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  -- Un code vide n'est pas une erreur: la plupart des clients arrivent sans.
  if v_code = '' then
    return;
  end if;

  insert into public.referral_hits (code, orders, subtotal_cents)
  values (left(v_code, 64), 1, greatest(coalesce(p_subtotal_cents, 0), 0))
  on conflict (code, day) do update
    set orders = referral_hits.orders + 1,
        subtotal_cents = referral_hits.subtotal_cents + excluded.subtotal_cents;
end;
$$;

revoke all on function public.record_referral_hit(text, integer)
  from public, anon, authenticated;
grant execute on function public.record_referral_hit(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Email d'annulation
-- ---------------------------------------------------------------------------
--
-- Même logique d'idempotence que customer_emailed_at et kitchen_notified_at:
-- l'horodatage est posé après un envoi réussi, ce qui rend l'envoi rejouable
-- après un échec et non répété après un succès.

alter table public.orders
  add column if not exists cancellation_emailed_at timestamptz;

comment on column public.orders.cancellation_emailed_at is
  'Renseigné après l''envoi réussi de l''email d''annulation. Nul tant que l''envoi n''a pas abouti, ce qui le rend rejouable.';
