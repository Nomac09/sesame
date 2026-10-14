-- Correctif de sécurité.
--
-- 1. La vue referral_performance contournait RLS.
--
-- Une vue Postgres s'exécute par défaut avec les droits de son propriétaire,
-- ici postgres, et non de l'appelant. La vue lisait donc orders en ignorant
-- la policy admin_read_orders, et anon avait SELECT dessus. Résultat vérifié
-- avant correctif: la clé anon, publique et présente dans le navigateur,
-- renvoyait le chiffre d'affaires par code de parrainage.
--
-- security_invoker rend à la vue les droits de l'appelant, donc RLS sur orders
-- s'applique de nouveau: l'admin voit, anon ne voit rien.
--
-- 2. Les REVOKE d'écriture de 0001 ne couvraient qu'orders et order_items.
--
-- Supabase accorde INSERT, UPDATE et DELETE à anon et authenticated sur toute
-- table du schéma public à sa création. RLS bloquait déjà ces écritures, mais
-- une seule policy ajoutée sans précaution plus tard suffirait à les ouvrir.
-- On aligne donc les autres tables sur le traitement déjà appliqué à orders.

alter view public.referral_performance set (security_invoker = on);

revoke all on public.referral_performance from anon;
grant select on public.referral_performance to authenticated;

-- settings et item_availability: l'admin écrit via ses policies, jamais anon.
revoke insert, update, delete on public.settings from anon;
revoke insert, update, delete on public.item_availability from anon;

-- stripe_events: écrit uniquement par le webhook, via service_role.
revoke insert, update, delete on public.stripe_events from anon, authenticated;

-- admin_emails: table de référence de l'autorisation. Personne n'y touche en
-- dehors de service_role. is_admin() reste opérante car elle est
-- SECURITY DEFINER et s'exécute avec les droits de son propriétaire.
revoke all on public.admin_emails from anon, authenticated;
