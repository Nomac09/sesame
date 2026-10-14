import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Clients Supabase côté serveur.
 *
 * Trois clients, trois niveaux de privilège, jamais interchangeables:
 *
 * - `serviceClient()` porte la clé service_role et contourne RLS. Réservé aux
 *   écritures de commande: server actions de paiement, webhook Stripe,
 *   annulation avec remboursement. Aucune policy d'écriture n'existe sur
 *   orders, donc c'est le seul chemin possible.
 * - `publicClient()` porte la clé anon, sans session. Lecture de la
 *   configuration publique uniquement, `settings` et `item_availability`.
 * - `sessionClient()` porte la clé anon et la session de l'utilisateur. Soumis
 *   à RLS, ce qui est exactement ce qu'on veut pour l'admin: la base décide de
 *   ce qu'il voit, pas le code applicatif.
 *
 * Règle: prendre le client le moins privilégié qui suffit. Lire des réglages
 * publics avec la clé service_role marcherait, et serait un mauvais réflexe.
 *
 * `import "server-only"` fait échouer la compilation si ce fichier est tiré
 * dans un bundle client, ce qui empêche la clé service_role de fuir.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante: ${name}. Lancer \`vercel env pull\` ou compléter .env.local.`,
    );
  }
  return value;
}

/**
 * Client à privilèges complets. Ne jamais l'exposer à une entrée utilisateur
 * non validée, et ne jamais s'en servir pour décider ce qu'un admin a le droit
 * de lire: il ignore RLS par construction.
 */
export function serviceClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        // Aucune session à conserver: chaque appel serveur est isolé, et
        // persister un token service_role serait une fuite en puissance.
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { "X-Client-Info": "sesame-server" },
      },
    },
  );
}

/**
 * Client anonyme, sans session ni cookies. Soumis à RLS, donc limité à ce que
 * les policies de lecture publique autorisent: `settings` et
 * `item_availability`, rien d'autre.
 *
 * Existe pour ne pas lire de la configuration publique avec une clé qui
 * contourne RLS, et pour rester utilisable hors contexte de requête, là où
 * `cookies()` n'est pas disponible.
 */
export function publicClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "sesame-public" } },
    },
  );
}

/**
 * Client lié à la session du visiteur, pour les Server Components et les
 * server actions. Soumis à RLS.
 *
 * En Server Component, l'écriture de cookies est interdite par Next: le bloc
 * catch absorbe ce cas. Le rafraîchissement de session est alors assuré par le
 * middleware, qui lui a le droit d'écrire.
 */
export async function sessionClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component: lecture seule sur les cookies. Sans effet.
          }
        },
      },
    },
  );
}

/**
 * Utilisateur connecté, ou null.
 *
 * Utilise getUser() et non getSession(): getSession lit le cookie sans le
 * vérifier auprès de Supabase, donc un cookie forgé passerait. getUser valide
 * le jeton côté serveur. C'est la seule forme acceptable pour une décision
 * d'autorisation.
 */
export async function currentUser() {
  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}
