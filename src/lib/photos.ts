/**
 * Adresses des photos de la carte.
 *
 * menu.ts porte le nom de fichier, ce module sait où vit le bucket. Séparer
 * les deux évite d'écrire une URL complète trente fois dans les données, et
 * permet de déplacer les photos sans toucher à la carte.
 *
 * Le bucket est en lecture publique: l'URL est stable, sans jeton, et
 * cacheable par le CDN. Voir supabase/migrations/0003_menu_photos_bucket.sql
 * pour le détail du contrôle d'accès.
 */

export const PHOTO_BUCKET = "menu-photos";

/**
 * URL publique d'une photo, ou null si l'environnement n'est pas configuré.
 *
 * Renvoie null plutôt que de lever: une variable d'environnement absente doit
 * donner une carte sans photos, pas une page en erreur. Le texte de la carte
 * est ce que le client vient lire, la photo est un supplément.
 */
export function photoUrl(file: string | undefined): string | null {
  if (!file) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;

  const origin = base.replace(/\/+$/, "");
  return `${origin}/storage/v1/object/public/${PHOTO_BUCKET}/${file}`;
}
