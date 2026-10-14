"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getItem } from "@/config/menu";
import { NotAdminError, requireAdminAction } from "@/lib/admin-guard";
import { notifyOrderCancelled, notifyOrderReady } from "@/lib/notify";
import { ACTIVE_STATUSES, type OrderStatus } from "@/lib/orders";
import { stripe } from "@/lib/stripe";
import {
  sessionClient,
  serviceClient,
} from "@/lib/supabase/server";

/**
 * Actions de l'espace cuisine.
 *
 * Chaque action commence par `requireAdminAction()`. Ce n'est pas la seule
 * protection, ni la principale: la base refuse déjà tout à un autre compte.
 * C'est la protection qui donne un message lisible au lieu d'une erreur SQL,
 * et qui évite d'appeler Stripe avant même de savoir qui demande.
 *
 * Le choix du client Supabase suit une règle simple: la session tant qu'elle
 * suffit, la clé service_role seulement là où aucune policy n'existe. Avancer
 * un statut passe par la session, parce que `advance_order_status()` revérifie
 * `is_admin()` en base. Annuler passe par service_role, parce qu'aucune
 * écriture directe sur `orders` n'est ouverte à qui que ce soit, et parce que
 * cette écriture-là touche des colonnes de remboursement qu'un navigateur ne
 * doit jamais pouvoir viser.
 */

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

const REFUSED: ActionResult = {
  ok: false,
  message: "Accès refusé. Reconnectez-vous.",
};

/** Statuts qu'une main en cuisine a le droit de viser. */
const ADVANCEABLE: OrderStatus[] = [
  "en_preparation",
  "prete",
  "livree",
  "retiree",
];

/**
 * Avancement du statut.
 *
 * L'action ne calcule pas le statut suivant: elle transmet la cible et laisse
 * la base juger. Le trigger `orders_status_transition` connaît l'ordre des
 * étapes et le mode de retrait, et il est le seul à les connaître de façon
 * inviolable. Dupliquer ces règles ici créerait un second exemplaire à tenir
 * à jour, qui finirait par diverger.
 */
export async function advanceStatus(
  orderId: string,
  target: OrderStatus,
): Promise<ActionResult> {
  try {
    await requireAdminAction();
  } catch (error) {
    if (error instanceof NotAdminError) return REFUSED;
    throw error;
  }

  if (!ADVANCEABLE.includes(target)) {
    return { ok: false, message: "Ce statut ne s'obtient pas depuis la cuisine." };
  }

  const supabase = await sessionClient();
  const { error } = await supabase.rpc("advance_order_status", {
    p_order_id: orderId,
    p_target: target,
  });

  if (error) {
    console.error("[admin] avancement refusé", error);
    return {
      ok: false,
      // Le message de la base cite le statut de départ et la cible, ce qui est
      // exactement ce qu'il faut lire quand deux téléphones agissent en même
      // temps sur la même commande.
      message: error.message.includes("Transition")
        ? "Cette commande a déjà changé d'état. Rechargez le flux."
        : "L'avancement n'a pas abouti.",
    };
  }

  revalidatePath("/admin");

  // L'annonce au client vient après: la base a accepté la transition, donc la
  // commande est réellement prête. Un envoi raté ne remet pas en cause
  // l'avancement, qui est acquis; il est seulement signalé à la cuisine.
  if (target === "prete") {
    const notified = await notifyOrderReady(orderId);
    if (notified.errors.length > 0) {
      console.error(`[admin] annonce prête: ${notified.errors.join(" | ")}`);
      return {
        ok: true,
        message:
          "Commande marquée prête. L'email n'est pas parti: prévenez le client vous-même.",
      };
    }
    if (notified.customer === "envoye") {
      return { ok: true, message: "Client prévenu par email." };
    }
  }

  return { ok: true };
}

/**
 * Annulation d'une commande payée, avec remboursement.
 *
 * L'ordre des opérations est la seule chose qui compte ici, et il n'est pas
 * réversible: Stripe d'abord, la base ensuite.
 *
 * Rembourser puis échouer à écrire laisse une commande active alors que
 * l'argent est rendu. C'est visible, réparable d'un coup d'oeil, et le message
 * ci-dessous le dit. Écrire puis échouer à rembourser laisserait une commande
 * annulée et un client débité, sans que rien ne le signale. La contrainte
 * `cancelled_paid_order_must_be_refunded` refuse d'ailleurs cette seconde
 * forme au niveau de la base, même si ce code se trompait.
 *
 * La clé d'idempotence est dérivée de l'identifiant de commande: deux appuis
 * sur le bouton, ou un réessai après un réseau coupé, produisent le même
 * remboursement chez Stripe et non deux.
 */
export async function cancelOrder(orderId: string): Promise<ActionResult> {
  try {
    await requireAdminAction();
  } catch (error) {
    if (error instanceof NotAdminError) return REFUSED;
    throw error;
  }

  const db = serviceClient();

  const { data: order, error: readError } = await db
    .from("orders")
    .select(
      "id, reference, status, confirmed_at, total_cents, stripe_payment_intent_id, stripe_refund_id, refunded_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (readError || !order) {
    console.error("[admin] commande introuvable à l'annulation", readError);
    return { ok: false, message: "Commande introuvable." };
  }

  if (!ACTIVE_STATUSES.includes(order.status as OrderStatus)) {
    return {
      ok: false,
      message: `La commande ${order.reference} n'est plus annulable.`,
    };
  }

  const paid = order.confirmed_at !== null;

  // Commande jamais payée: rien à rembourser, la contrainte de la base
  // l'autorise, on annule directement.
  if (!paid) {
    const { error } = await db
      .from("orders")
      .update({ status: "annulee" })
      .eq("id", order.id)
      .in("status", ACTIVE_STATUSES);
    if (error) {
      console.error("[admin] annulation impossible", error);
      return { ok: false, message: "L'annulation n'a pas abouti." };
    }
    revalidatePath("/admin");
    return {
      ok: true,
      message: await cancellationNotice(order.id, order.reference, null),
    };
  }

  if (!order.stripe_payment_intent_id) {
    // Payée mais sans intention de paiement enregistrée: le remboursement ne
    // peut pas être automatisé, et annuler sans rembourser est exclu.
    console.error(
      `[admin] ${order.reference} confirmée sans stripe_payment_intent_id`,
    );
    return {
      ok: false,
      message: `Remboursement impossible depuis ici pour ${order.reference}: aucun paiement Stripe rattaché. À traiter dans le tableau de bord Stripe.`,
    };
  }

  let refundId: string;
  let refundAmount: number;

  try {
    const refund = await stripe().refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        reason: "requested_by_customer",
        metadata: { order_id: order.id, reference: order.reference },
      },
      { idempotencyKey: `refund-${order.id}` },
    );

    // Un remboursement carte est synchrone et revient `succeeded`. Tout autre
    // état signifie que l'argent n'est pas encore rendu: la commande reste
    // active, ce que le cahier des charges impose. Le rejouer plus tard est
    // sans risque, la clé d'idempotence renverra le même objet.
    if (refund.status !== "succeeded") {
      console.error(
        `[admin] remboursement ${refund.id} en statut ${refund.status} pour ${order.reference}`,
      );
      return {
        ok: false,
        message: `Le remboursement de ${order.reference} est en cours de traitement chez Stripe. La commande reste active tant qu'il n'est pas confirmé.`,
      };
    }

    refundId = refund.id;
    refundAmount = refund.amount;
  } catch (error) {
    console.error("[admin] remboursement Stripe refusé", error);
    return {
      ok: false,
      message: `Le remboursement de ${order.reference} a échoué. La commande n'a pas été annulée.`,
    };
  }

  const { error: updateError } = await db
    .from("orders")
    .update({
      status: "annulee",
      stripe_refund_id: refundId,
      refunded_at: new Date().toISOString(),
      refund_amount_cents: refundAmount,
    })
    .eq("id", order.id)
    .in("status", ACTIVE_STATUSES);

  if (updateError) {
    // Argent rendu, statut non écrit. Le dire tel quel: c'est le seul cas où
    // l'opérateur doit intervenir, et le taire produirait un double
    // remboursement au prochain essai si la clé d'idempotence changeait.
    console.error(
      `[admin] ${order.reference} remboursée (${refundId}) mais statut non mis à jour`,
      updateError,
    );
    return {
      ok: false,
      message: `${order.reference} a bien été remboursée, mais son statut n'a pas pu être enregistré. Réessayez: le remboursement ne sera pas fait deux fois.`,
    };
  }

  revalidatePath("/admin");
  return {
    ok: true,
    message: await cancellationNotice(order.id, order.reference, refundAmount),
  };
}

/**
 * Prévient le client, puis rédige le message que la cuisine lira.
 *
 * L'envoi vient après le remboursement et après l'écriture du statut, jamais
 * avant: annoncer un remboursement non acquis serait un mensonge.
 *
 * Un envoi raté ne transforme pas l'annulation en échec. L'argent est rendu et
 * le statut est écrit; c'est acquis. Mais la cuisine doit le savoir, parce que
 * le client, lui, ne sait encore rien, et que c'est alors à elle de l'appeler.
 */
async function cancellationNotice(
  orderId: string,
  reference: string,
  refundedCents: number | null,
): Promise<string> {
  const base =
    refundedCents !== null
      ? `${reference} annulée et remboursée.`
      : `${reference} annulée.`;

  const notified = await notifyOrderCancelled(orderId, { refundedCents });

  if (notified.errors.length > 0) {
    console.error(`[admin] ${reference}: ${notified.errors.join(" | ")}`);
    return `${base} L'email n'est pas parti: prévenez le client vous-même.`;
  }

  return notified.customer === "envoye"
    ? `${base} Le client a été prévenu par email.`
    : base;
}

/** Les deux seuls réglages, nommés pour qu'aucune autre clé ne soit joignable. */
export type SettingKey = "store_open" | "delivery_enabled";

const SETTING_KEYS: SettingKey[] = ["store_open", "delivery_enabled"];

/**
 * Bascule d'un réglage.
 *
 * Effet immédiat: la vitrine lit `settings` à chaque rendu, sans cache, donc
 * le prochain chargement de page voit la nouvelle valeur. Il n'y a rien à
 * invalider côté vitrine, seulement la page d'où part le geste.
 */
export async function setSetting(
  key: SettingKey,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    await requireAdminAction();
  } catch (error) {
    if (error instanceof NotAdminError) return REFUSED;
    throw error;
  }

  if (!SETTING_KEYS.includes(key)) {
    return { ok: false, message: "Réglage inconnu." };
  }

  const supabase = await sessionClient();
  const { error } = await supabase
    .from("settings")
    .update({ enabled })
    .eq("key", key);

  if (error) {
    console.error("[admin] réglage non enregistré", error);
    return { ok: false, message: "Le réglage n'a pas été enregistré." };
  }

  revalidatePath("/admin/reglages");
  return { ok: true };
}

/**
 * Disponibilité d'un article.
 *
 * L'identifiant est vérifié contre la carte avant écriture: `item_availability`
 * n'a pas de clé étrangère vers le menu, qui reste du code, donc rien
 * n'empêcherait d'y créer une ligne pour un article inexistant. Une telle
 * ligne serait invisible et resterait indéfiniment.
 */
export async function setItemAvailability(
  itemId: string,
  available: boolean,
): Promise<ActionResult> {
  try {
    await requireAdminAction();
  } catch (error) {
    if (error instanceof NotAdminError) return REFUSED;
    throw error;
  }

  if (!getItem(itemId)) {
    return { ok: false, message: "Article inconnu." };
  }

  const supabase = await sessionClient();
  const { error } = await supabase
    .from("item_availability")
    .upsert(
      { item_id: itemId, available, updated_at: new Date().toISOString() },
      { onConflict: "item_id" },
    );

  if (error) {
    console.error("[admin] disponibilité non enregistrée", error);
    return { ok: false, message: "La disponibilité n'a pas été enregistrée." };
  }

  revalidatePath("/admin/reglages");
  return { ok: true };
}

export async function signOutAdmin(): Promise<void> {
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  redirect("/admin/connexion");
}
