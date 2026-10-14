import "server-only";

import Stripe from "stripe";

/**
 * Client Stripe.
 *
 * Initialisation paresseuse et mise en cache: construire le client au moment
 * de l'import ferait échouer `next build` sur un environnement où la clé
 * n'est pas encore renseignée, alors que rien n'a besoin de Stripe au build.
 */

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY manquante. Impossible de créer une session de paiement.",
    );
  }

  cached = new Stripe(key, { typescript: true });
  return cached;
}

/** Vrai si la clé configurée est une clé de test. */
export function isTestMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_test_") || key.startsWith("rk_test_");
}
