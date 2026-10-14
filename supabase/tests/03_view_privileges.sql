-- Privilèges des rôles publics dans le schéma public.
--
-- Ce fichier gardait à l'origine la vue referral_performance, qui s'exécutait
-- avec les droits de son propriétaire et avait exposé le chiffre d'affaires par
-- code de parrainage à la clé anon. La vue a disparu en 0004: l'attribution ne
-- lit plus les commandes, elle vit dans un compteur agrégé.
--
-- Les vérifications restantes portent donc sur ce qui a remplacé la vue, et sur
-- les règles qui avaient permis la fuite: aucun droit d'écriture pour anon,
-- rien d'accessible sur les tables d'autorisation, et RLS partout.
--
-- À exécuter après 0001, 0002 puis 0004.

\set ON_ERROR_STOP off

\echo '--- 1. la vue referral_performance ne doit plus exister'
select case count(*) when 0 then 'ok   vue supprimee'
  else 'FAIL la vue est revenue, verifier security_invoker' end as resultat
from pg_class where relname = 'referral_performance';

\echo '--- 2. orders ne doit plus porter de code de campagne'
select case count(*) when 0 then 'ok   orders.referral_code supprimee'
  else 'FAIL le code de campagne est de nouveau rattache a la commande' end as resultat
from information_schema.columns
where table_name = 'orders' and column_name = 'referral_code';

\echo '--- 3. referral_hits ne doit rattacher le compteur a personne'
select case count(*) when 0 then 'ok   compteur sans lien vers une personne'
  else 'FAIL colonnes suspectes: ' || string_agg(column_name, ', ') end as resultat
from information_schema.columns
where table_name = 'referral_hits'
  and column_name <> 'orders'
  and (column_name like '%order%' or column_name like '%email%'
       or column_name like '%phone%' or column_name like '%name%'
       or column_name like '%customer%' or column_name like '%address%');

\echo '--- 4. anon ne doit avoir aucun acces au compteur'
select case count(*) when 0 then 'ok   anon sans acces a referral_hits'
  else 'FAIL anon conserve ' || string_agg(privilege_type, ', ') end as resultat
from information_schema.role_table_grants
where table_name = 'referral_hits' and grantee = 'anon';

\echo '--- 5. anon ne doit avoir aucun droit d ecriture dans public'
select case count(*) when 0 then 'ok   anon ne peut rien ecrire'
  else 'FAIL anon peut ecrire sur ' || string_agg(distinct table_name, ', ') end as resultat
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

\echo '--- 6. admin_emails doit rester hors de portee des roles publics'
select case count(*) when 0 then 'ok   admin_emails verrouillee'
  else 'FAIL ' || string_agg(distinct grantee, ', ') || ' y ont acces' end as resultat
from information_schema.role_table_grants
where table_name = 'admin_emails' and grantee in ('anon', 'authenticated');

\echo '--- 7. record_referral_hit ne doit etre appelable que par service_role'
select case count(*) when 0 then 'ok   fonction hors de portee des roles publics'
  else 'FAIL ' || string_agg(distinct grantee, ', ') || ' peuvent l executer' end as resultat
from information_schema.role_routine_grants
where routine_name = 'record_referral_hit'
  and grantee in ('anon', 'authenticated', 'PUBLIC');

\echo '--- 8. RLS doit rester active sur referral_hits'
select case when relrowsecurity then 'ok   RLS active'
  else 'FAIL RLS desactivee sur le compteur' end as resultat
from pg_class where relname = 'referral_hits';
