-- Bucket des photos de la carte.
--
-- Lecture publique, écriture fermée.
--
-- Le contrôle d'accès de Storage tient en deux mécanismes distincts, qu'il
-- vaut mieux ne pas confondre:
--
-- 1. `storage.buckets.public`. À true, les objets sont servis par l'URL
--    publique /storage/v1/object/public/<bucket>/<chemin>, sans jeton et sans
--    consulter RLS. C'est ce qui rend les photos affichables par n'importe quel
--    navigateur, et cacheables par le CDN. C'est exactement ce qu'on veut d'une
--    photo de houmous.
--
-- 2. Les policies RLS sur `storage.objects`. Elles gouvernent l'API (lister,
--    téléverser, remplacer, supprimer). RLS y est déjà activé par Supabase.
--
-- L'écriture est donc fermée par omission, pas par interdiction: RLS refuse
-- tout ce qu'aucune policy n'autorise. Comme aucune policy d'écriture n'est
-- créée ici, ni anon ni authenticated ne peuvent téléverser, remplacer ou
-- supprimer une photo. Seul service_role, qui contourne RLS par construction,
-- écrit dans ce bucket: depuis le tableau de bord Supabase, ou avec la clé de
-- service. C'est le même principe que orders, où aucune policy d'écriture
-- n'existe non plus.
--
-- Aucune policy de SELECT n'est créée, et c'est délibéré. Un bucket public n'en
-- a pas besoin pour servir ses fichiers, et en ajouter une aurait un effet de
-- bord: elle autoriserait aussi anon à *lister* le contenu du bucket. Les
-- photos seraient alors énumérables, y compris celles d'un plat pas encore
-- annoncé. En l'état, une photo est lisible par son chemin, et le chemin ne
-- s'obtient que depuis la carte.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-photos',
  'menu-photos',
  true,
  -- 5 Mo. Large pour une photo de plat déjà redimensionnée, assez bas pour
  -- qu'un envoi accidentel de fichier brut d'appareil photo soit refusé.
  5242880,
  -- Le format est contraint ici plutôt que par convention: un bucket public
  -- qui accepterait text/html servirait des pages sur notre domaine.
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ceinture et bretelles, dans l'esprit de 0002: si une policy d'écriture était
-- ajoutée un jour sur ce bucket pour un rôle public, la migration doit le
-- signaler bruyamment plutôt que de laisser passer.
do $$
declare
  offending text;
begin
  select string_agg(policyname, ', ')
    into offending
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and (roles::text[] && array['anon', 'authenticated', 'public'])
    and qual || coalesce(with_check, '') like '%menu-photos%';

  if offending is not null then
    raise exception
      'Policy d''écriture publique sur menu-photos: %. Le bucket doit rester en lecture seule pour anon et authenticated.',
      offending;
  end if;
end $$;
