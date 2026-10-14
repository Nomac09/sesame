/**
 * Accès admin. Un seul email autorisé, via Supabase Auth.
 * Pas d'inscription, pas de mot de passe, pas de second compte.
 *
 * Cette valeur doit être identique à la ligne présente dans la table
 * `admin_emails`. Le contrôle applicatif ci-dessous protège les pages, la table
 * protège les données via RLS, y compris l'abonnement temps réel.
 */

export const ADMIN_EMAIL: string = (process.env.ADMIN_EMAIL ?? "")
  .trim()
  .toLowerCase();

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!ADMIN_EMAIL) return false;
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}
