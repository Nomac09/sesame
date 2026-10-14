\set ON_ERROR_STOP off

-- Une commande payée, en livraison.
insert into public.orders (
  reference, first_name, last_name, phone, email, mode, address_line, postcode,
  slot_start, slot_end,
  subtotal_cents, referral_discount_cents, delivery_fee_cents, total_cents
) values (
  'SES-5KLM', 'Rana', 'Odeh', '0655443322', 'rana@exemple.fr',
  'livraison', '3 rue Nationale', '59000',
  now() + interval '1 hour', now() + interval '90 minutes',
  3350, 0, 350, 3700
);
update public.orders set status = 'confirmee' where reference = 'SES-5KLM';

-- Une commande jamais payée.
insert into public.orders (
  reference, first_name, last_name, phone, email, mode,
  slot_start, slot_end,
  subtotal_cents, referral_discount_cents, delivery_fee_cents, total_cents
) values (
  'SES-6NPQ', 'Sami', 'Barghouti', '0644332211', 'sami@exemple.fr', 'retrait',
  now() + interval '1 hour', now() + interval '90 minutes',
  1920, 0, 0, 1920
);

\echo ''
\echo '=== RPC advance_order_status ==='

\echo '--- A. appel sans jwt admin, doit ECHOUER'
select public.advance_order_status(
  (select id from public.orders where reference = 'SES-5KLM'), 'en_preparation');

set test.jwt = '{"email":"admin@example.com"}';

\echo '--- B. admin, confirmee -> en_preparation, doit PASSER'
select (public.advance_order_status(
  (select id from public.orders where reference = 'SES-5KLM'),
  'en_preparation')).status;

\echo '--- C. admin vise annulee, doit ECHOUER (remboursement obligatoire)'
select public.advance_order_status(
  (select id from public.orders where reference = 'SES-5KLM'), 'annulee');

\echo '--- D. admin vise confirmee, doit ECHOUER (pilote par le paiement)'
select public.advance_order_status(
  (select id from public.orders where reference = 'SES-6NPQ'), 'confirmee');

\echo '--- E. admin saute en_preparation -> livree, doit ECHOUER (trigger)'
select public.advance_order_status(
  (select id from public.orders where reference = 'SES-5KLM'), 'livree');

\echo '--- F. commande introuvable, doit ECHOUER'
select public.advance_order_status(
  '00000000-0000-0000-0000-000000000000'::uuid, 'en_preparation');

\echo ''
\echo '=== Privileges du role authenticated ==='

set role authenticated;

\echo '--- G. UPDATE direct du statut, doit ECHOUER (privilege revoque)'
update public.orders set status = 'prete' where reference = 'SES-5KLM';

\echo '--- H. UPDATE direct d un montant, doit ECHOUER'
update public.orders set total_cents = 1 where reference = 'SES-5KLM';

\echo '--- I. DELETE direct, doit ECHOUER'
delete from public.orders where reference = 'SES-5KLM';

\echo '--- J. SELECT en tant qu admin, doit voir les lignes'
select count(*) as lignes_visibles_admin from public.orders;

\echo '--- K. SELECT en tant que non-admin, doit renvoyer 0'
set test.jwt = '{"email":"intrus@exemple.fr"}';
select count(*) as lignes_visibles_intrus from public.orders;

\echo '--- L. RPC en tant que non-admin, doit ECHOUER'
select public.advance_order_status(
  (select id from public.orders where reference = 'SES-5KLM'), 'prete');

reset role;
reset test.jwt;

\echo ''
\echo '=== Contrainte remboursement ==='

\echo '--- M. commande payee -> annulee sans remboursement, doit ECHOUER'
update public.orders set status = 'annulee' where reference = 'SES-5KLM';

\echo '--- N. commande payee -> annulee avec remboursement, doit PASSER'
update public.orders
   set status = 'annulee',
       stripe_refund_id = 're_test_123',
       refunded_at = now(),
       refund_amount_cents = 3700
 where reference = 'SES-5KLM';
select reference, status, refunded_at is not null as rembourse
from public.orders where reference = 'SES-5KLM';

\echo '--- O. commande jamais payee -> annulee sans remboursement, doit PASSER'
update public.orders set status = 'annulee' where reference = 'SES-6NPQ';
select reference, status, confirmed_at is null as jamais_payee
from public.orders where reference = 'SES-6NPQ';
