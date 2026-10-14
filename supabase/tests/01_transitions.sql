\set ON_ERROR_STOP off
\timing off

insert into public.orders (
  reference, first_name, last_name, phone, email, mode, address_line, postcode,
  slot_start, slot_end,
  subtotal_cents, referral_discount_cents, delivery_fee_cents, total_cents
) values (
  'SES-4B2K', 'Nour', 'Haddad', '0612345678', 'nour@exemple.fr',
  'livraison', '12 rue de la Paix', '59910',
  now() + interval '1 hour', now() + interval '90 minutes',
  3350, 0, 350, 3700
);

insert into public.orders (
  reference, first_name, last_name, phone, email, mode,
  slot_start, slot_end,
  subtotal_cents, referral_discount_cents, delivery_fee_cents, total_cents
) values (
  'SES-7HJ3', 'Karim', 'Nasser', '0698765432', 'karim@exemple.fr',
  'retrait',
  now() + interval '1 hour', now() + interval '90 minutes',
  1920, 0, 0, 1920
);

\echo '--- 1. saut direct vers en_preparation, doit ECHOUER'
update public.orders set status = 'en_preparation' where reference = 'SES-4B2K';

\echo '--- 2. en_attente_paiement -> confirmee, doit PASSER'
update public.orders set status = 'confirmee' where reference = 'SES-4B2K';
select reference, status, confirmed_at is not null as confirmed_at_rempli,
       status_changed_at is not null as horodate
from public.orders where reference = 'SES-4B2K';

\echo '--- 3. confirmee -> prete en sautant la preparation, doit ECHOUER'
update public.orders set status = 'prete' where reference = 'SES-4B2K';

\echo '--- 4. confirmee -> en_preparation -> prete, doit PASSER'
update public.orders set status = 'en_preparation' where reference = 'SES-4B2K';
update public.orders set status = 'prete' where reference = 'SES-4B2K';

\echo '--- 5. commande en livraison marquee retiree, doit ECHOUER'
update public.orders set status = 'retiree' where reference = 'SES-4B2K';

\echo '--- 6. commande en livraison marquee livree, doit PASSER'
update public.orders set status = 'livree' where reference = 'SES-4B2K';

\echo '--- 7. statut terminal, toute transition doit ECHOUER'
update public.orders set status = 'annulee' where reference = 'SES-4B2K';

\echo '--- 8. paiement_echoue depuis en_attente_paiement, doit PASSER'
update public.orders set status = 'paiement_echoue' where reference = 'SES-7HJ3';

\echo '--- 9. paiement_echoue est terminal, doit ECHOUER'
update public.orders set status = 'confirmee' where reference = 'SES-7HJ3';

\echo '--- 10. totaux incoherents, doit ECHOUER'
insert into public.orders (
  reference, first_name, last_name, phone, email, mode,
  slot_start, slot_end,
  subtotal_cents, referral_discount_cents, delivery_fee_cents, total_cents
) values (
  'SES-2ZZZ', 'Test', 'Test', '0600000000', 't@exemple.fr', 'retrait',
  now(), now() + interval '30 minutes', 1920, 0, 0, 9999
);

\echo '--- 11. livraison sans adresse, doit ECHOUER'
insert into public.orders (
  reference, first_name, last_name, phone, email, mode,
  slot_start, slot_end,
  subtotal_cents, referral_discount_cents, delivery_fee_cents, total_cents
) values (
  'SES-3YYY', 'Test', 'Test', '0600000000', 't@exemple.fr', 'livraison',
  now(), now() + interval '30 minutes', 1920, 0, 350, 2270
);

\echo '--- 12. reference au mauvais format, doit ECHOUER'
insert into public.orders (
  reference, first_name, last_name, phone, email, mode,
  slot_start, slot_end,
  subtotal_cents, referral_discount_cents, delivery_fee_cents, total_cents
) values (
  'SES-01IO', 'Test', 'Test', '0600000000', 't@exemple.fr', 'retrait',
  now(), now() + interval '30 minutes', 1920, 0, 0, 1920
);

\echo '--- 13. ligne de commande, total de ligne incoherent, doit ECHOUER'
insert into public.order_items (order_id, item_id, item_name, quantity,
  unit_price_cents, line_total_cents)
select id, 'houmous', 'Houmous', 2, 750, 999
from public.orders where reference = 'SES-7HJ3';

\echo '--- 14. ligne de commande coherente, doit PASSER'
insert into public.order_items (order_id, item_id, item_name, quantity,
  unit_price_cents, line_total_cents, allergens, tags)
select id, 'houmous', 'Houmous', 2, 750, 1500,
       array['sesame'], array['vegetalien','sans-gluten']
from public.orders where reference = 'SES-7HJ3';

\echo '--- 15. is_admin() sans jwt, doit renvoyer false'
select public.is_admin() as sans_jwt;

\echo '--- 16. is_admin() avec l email admin, doit renvoyer true'
set test.jwt = '{"email":"Admin@Example.com"}';
select public.is_admin() as avec_jwt_admin;
set test.jwt = '{"email":"intrus@exemple.fr"}';
select public.is_admin() as avec_jwt_intrus;
reset test.jwt;
