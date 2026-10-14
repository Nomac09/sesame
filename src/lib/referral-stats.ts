import "server-only";

import { serviceClient } from "@/lib/supabase/server";

/**
 * Mesure du rendement des QR codes imprimés, sous forme agrégée.
 *
 * Le cookie `sesame_ref` n'est jamais recopié sur la commande. Il n'alimente
 * qu'un compteur par code et par jour, sans identifiant de commande ni donnée
 * personnelle: c'est cette absence de lien qui dispense le cookie de
 * consentement, et elle ne tient que tant que personne n'ajoute une colonne
 * pour "retrouver quelle commande". Si ce besoin apparaît un jour, il faudra
 * un bandeau de consentement, pas une jointure.
 *
 * Ce que la mesure compte: les commandes arrivées jusqu'à la page de paiement.
 * Pas les commandes payées. Compter les paiements imposerait de conserver le
 * code attaché à la commande jusqu'au webhook, c'est-à-dire exactement ce
 * qu'on a supprimé. Pour juger un support imprimé, "combien de personnes ont
 * poussé jusqu'au paiement" est de toute façon la question la plus directe.
 */

/**
 * Incrémente le compteur d'un code. Ne lève jamais.
 *
 * Une statistique ratée ne doit pas coûter une commande: l'appelant vient de
 * créer une session de paiement et le client est en route vers Stripe. Un
 * échec est journalisé et oublié.
 */
export async function recordReferralHit(
  code: string | null | undefined,
  subtotalCents: number,
): Promise<void> {
  if (!code || code.trim() === "") return;

  try {
    const { error } = await serviceClient().rpc("record_referral_hit", {
      p_code: code,
      p_subtotal_cents: subtotalCents,
    });
    if (error) throw error;
  } catch (error) {
    console.error("[attribution] compteur non incrémenté", error);
  }
}
