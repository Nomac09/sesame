import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { isAdminEmail } from "@/config/admin";
import { currentUser } from "@/lib/supabase/server";

/**
 * Contrôle d'accès de l'espace cuisine.
 *
 * Trois barrières indépendantes protègent les commandes, et celle-ci n'est que
 * la première:
 *
 * 1. ici, l'email du compte connecté doit être exactement ADMIN_EMAIL;
 * 2. dans la base, la policy `admin_read_orders` interdit la lecture à tout
 *    autre compte, y compris via l'abonnement temps réel;
 * 3. toujours dans la base, aucune policy d'écriture n'existe sur `orders`:
 *    l'avancement passe par `advance_order_status()`, qui revérifie.
 *
 * La barrière applicative pourrait sauter sans exposer une seule commande.
 * C'est voulu: un contrôle unique est un contrôle qui tombe.
 */

/** Redirige vers la connexion. Pour les pages. */
export async function requireAdminPage(): Promise<User> {
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/admin/connexion");
  }
  return user;
}

export class NotAdminError extends Error {
  constructor() {
    super("Accès refusé.");
    this.name = "NotAdminError";
  }
}

/**
 * Lève une erreur. Pour les server actions, où une redirection masquerait
 * l'échec derrière une navigation et laisserait croire que l'action a abouti.
 */
export async function requireAdminAction(): Promise<User> {
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) {
    throw new NotAdminError();
  }
  return user;
}
