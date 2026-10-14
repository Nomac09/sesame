-- Contrôle d'accès du bucket des photos de la carte.
--
-- Le bucket est en lecture publique et en écriture fermée. La lecture passe
-- par l'URL publique, hors RLS; l'écriture passe par l'API, sous RLS. Comme
-- aucune policy d'écriture n'existe, RLS refuse tout à anon et authenticated.
--
-- Ces vérifications échouent si quelqu'un rend le bucket privé, ce qui
-- casserait l'affichage des photos, ou lui ajoute une policy d'écriture
-- publique, ce qui ferait de la vitrine un espace de dépôt de fichiers.
--
-- À exécuter après 0003.

\set ON_ERROR_STOP off

\echo '--- 1. le bucket menu-photos doit exister'
select case count(*) when 1 then 'ok   bucket present'
  else 'FAIL bucket menu-photos absent' end as resultat
from storage.buckets where id = 'menu-photos';

\echo '--- 2. le bucket doit rester public, sinon les photos ne s affichent plus'
select case when public then 'ok   lecture publique active'
  else 'FAIL bucket prive, les photos de la carte ne se chargeront pas' end as resultat
from storage.buckets where id = 'menu-photos';

\echo '--- 3. aucune policy d ecriture publique sur storage.objects'
select case count(*) when 0 then 'ok   ni anon ni authenticated ne peuvent ecrire'
  else 'FAIL policies d ecriture publiques: ' || string_agg(policyname, ', ') end as resultat
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and (roles::text[] && array['anon', 'authenticated', 'public']);

\echo '--- 4. RLS doit rester actif sur storage.objects'
select case when relrowsecurity then 'ok   RLS actif'
  else 'FAIL RLS desactive, tout le stockage est ouvert' end as resultat
from pg_class where oid = 'storage.objects'::regclass;

\echo '--- 5. les types de fichiers doivent rester limites aux images'
select case
  when allowed_mime_types is null
    then 'FAIL aucun type impose, le bucket public accepterait du HTML'
  when allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    then 'ok   types limites aux images'
  else 'FAIL types inattendus: ' || array_to_string(allowed_mime_types, ', ')
end as resultat
from storage.buckets where id = 'menu-photos';

\echo '--- 6. une taille maximale doit rester imposee'
select case
  when file_size_limit is null then 'FAIL aucune taille maximale'
  when file_size_limit <= 10485760 then 'ok   taille maximale ' || file_size_limit || ' octets'
  else 'FAIL taille maximale trop permissive: ' || file_size_limit
end as resultat
from storage.buckets where id = 'menu-photos';
