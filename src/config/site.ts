/**
 * Résolution de l'URL de base.
 *
 * Personne ne doit avoir à éditer un fichier avant un test local. L'ordre de
 * résolution est:
 *
 *   1. NEXT_PUBLIC_SITE_URL, s'il est renseigné. Surcharge explicite.
 *   2. VERCEL_ENV === "production" -> le domaine de production.
 *   3. VERCEL_URL -> le déploiement de preview courant.
 *   4. sinon, localhost.
 *
 * VERCEL_URL n'est pas préfixé NEXT_PUBLIC, donc il n'existe que côté serveur.
 * C'est suffisant: les seuls usages sont les URL de retour Stripe et les liens
 * des emails, tous construits côté serveur.
 */

export const PRODUCTION_SITE_URL = "https://sesamerestaurant.fr";
export const LOCAL_SITE_URL = "http://localhost:3000";

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function siteUrl(): string {
  const override = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (override) return withoutTrailingSlash(override);

  if (process.env.VERCEL_ENV === "production") return PRODUCTION_SITE_URL;

  const previewHost = process.env.VERCEL_URL?.trim();
  if (previewHost) return withoutTrailingSlash(`https://${previewHost}`);

  return LOCAL_SITE_URL;
}

/** URL absolue à partir d'un chemin, pour Stripe et les emails. */
export function absoluteUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${suffix}`;
}
