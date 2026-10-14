import type Stripe from "stripe";

import { notifyOrderConfirmed } from "@/lib/notify";
import { stripe } from "@/lib/stripe";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Webhook Stripe.
 *
 * Route handler et non server action: Stripe appelle depuis l'extérieur, et la
 * vérification de signature exige le corps brut de la requête.
 *
 * Trois règles:
 *
 * 1. Signature vérifiée avant toute lecture du contenu. Un corps non signé
 *    n'est jamais interprété.
 * 2. Idempotence sur l'identifiant d'événement, pas sur celui de session:
 *    Stripe rejoue le même événement après un délai, et plusieurs événements
 *    différents portent la même session.
 * 3. Tout échec laisse une trace dans stripe_events, avec `error` renseigné et
 *    `processed_at` nul, pour rester visible dans l'admin.
 *
 * Ce que le webhook ne fait pas: un paiement refusé ne tue pas la commande. Un
 * client dont la carte est rejetée reste sur la page Stripe et réessaie souvent
 * avec succès. Seul checkout.session.expired est terminal.
 */

/** Statuts de commande qui signifient "déjà payée". */
const PAID_STATUSES = [
  "confirmee",
  "en_preparation",
  "prete",
  "livree",
  "retiree",
] as const;

type Db = ReturnType<typeof serviceClient>;

interface Outcome {
  /** Renseigné en cas d'anomalie: la ligne stripe_events restera visible. */
  error?: string;
  /** Résumé pour la réponse HTTP, sans donnée sensible. */
  action: string;
  /** Renseigné uniquement quand cet appel a réellement fait basculer la
   *  commande en confirmee. C'est la condition d'envoi des notifications. */
  confirmedOrderId?: string;
}

function requireWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET manquante. Impossible de vérifier la signature Stripe.",
    );
  }
  return secret;
}

function sessionOf(event: Stripe.Event): Stripe.Checkout.Session | null {
  return event.type.startsWith("checkout.session.")
    ? (event.data.object as Stripe.Checkout.Session)
    : null;
}

function paymentIntentOf(event: Stripe.Event): Stripe.PaymentIntent | null {
  return event.type.startsWith("payment_intent.")
    ? (event.data.object as Stripe.PaymentIntent)
    : null;
}

/** Identifiant de commande porté par les métadonnées, dans les deux formes. */
function orderIdOf(event: Stripe.Event): string | null {
  const metadata =
    sessionOf(event)?.metadata ?? paymentIntentOf(event)?.metadata ?? null;
  return metadata?.order_id ?? null;
}

function sessionIdOf(event: Stripe.Event): string | null {
  return sessionOf(event)?.id ?? null;
}

async function findOrder(db: Db, event: Stripe.Event) {
  const orderId = orderIdOf(event);
  if (orderId) {
    const { data } = await db
      .from("orders")
      .select("id, status, total_cents, reference")
      .eq("id", orderId)
      .maybeSingle();
    if (data) return data;
  }
  // Repli: la session a pu être créée sans que l'écriture de stripe_session_id
  // aboutisse. Les métadonnées restent la voie principale.
  const sessionId = sessionIdOf(event);
  if (sessionId) {
    const { data } = await db
      .from("orders")
      .select("id, status, total_cents, reference")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/**
 * Passage en confirmee, sous conditions.
 *
 * Le montant facturé par Stripe est comparé à notre propre total avant toute
 * confirmation. En cas d'écart, on ne confirme pas et on ne fait pas confiance
 * au chiffre de Stripe: l'écart est enregistré et demande un examen humain.
 */
async function confirmPaidOrder(db: Db, event: Stripe.Event): Promise<Outcome> {
  const session = sessionOf(event);
  if (!session) return { action: "ignore", error: "événement sans session" };

  const order = await findOrder(db, event);
  if (!order) {
    return {
      action: "commande_introuvable",
      error: `aucune commande pour la session ${session.id}`,
    };
  }

  if ((PAID_STATUSES as readonly string[]).includes(order.status)) {
    return { action: "deja_confirmee" };
  }
  if (order.status !== "en_attente_paiement") {
    return {
      action: "statut_inattendu",
      error: `commande ${order.reference} en statut ${order.status}, confirmation refusée`,
    };
  }

  // Filet de sécurité. Les cartes se règlent de façon synchrone et aucun moyen
  // de paiement différé n'est activé, donc ce cas ne devrait pas se produire.
  // S'il survenait, il faudrait abonner la destination à
  // checkout.session.async_payment_succeeded, qui n'est pas géré ici.
  if (session.payment_status !== "paid") {
    return {
      action: "paiement_en_attente",
      error: `payment_status=${session.payment_status}, commande laissée en attente`,
    };
  }

  if (session.currency !== "eur") {
    return {
      action: "devise_inattendue",
      error: `devise ${session.currency} pour la commande ${order.reference}`,
    };
  }

  if (session.amount_total !== order.total_cents) {
    return {
      action: "montant_incoherent",
      error:
        `montant Stripe ${session.amount_total} != total commande ` +
        `${order.total_cents} pour ${order.reference}, commande non confirmée`,
    };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  // Mise à jour conditionnelle: si un autre traitement a déjà fait basculer la
  // commande entre la lecture et l'écriture, celle-ci ne touche rien.
  const { data, error } = await db
    .from("orders")
    .update({
      status: "confirmee",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      stripe_session_id: session.id,
    })
    .eq("id", order.id)
    .eq("status", "en_attente_paiement")
    .select("id");

  if (error) throw new Error(`confirmation impossible: ${error.message}`);
  // Zéro ligne: une livraison concurrente a confirmé entre la lecture et
  // l'écriture. Pas de confirmedOrderId, donc pas de seconde notification.
  if (!data || data.length === 0) return { action: "deja_confirmee" };

  return { action: "confirmee", confirmedOrderId: order.id };
}

/** Seul cas terminal: la session a expiré sans paiement. */
async function expireOrder(db: Db, event: Stripe.Event): Promise<Outcome> {
  const order = await findOrder(db, event);
  if (!order) {
    return {
      action: "commande_introuvable",
      error: `aucune commande pour la session ${sessionIdOf(event)}`,
    };
  }
  if (order.status !== "en_attente_paiement") {
    // Une commande payée entre-temps ne doit surtout pas être tuée.
    return { action: "sans_effet" };
  }

  const { error } = await db
    .from("orders")
    .update({ status: "paiement_echoue" })
    .eq("id", order.id)
    .eq("status", "en_attente_paiement");

  if (error) throw new Error(`expiration impossible: ${error.message}`);
  return { action: "paiement_echoue" };
}

/**
 * Paiement refusé: on enregistre, on n'agit pas.
 *
 * Une carte refusée n'est pas une commande morte. Le client reste sur la page
 * Stripe et réessaie, souvent avec succès. Marquer la commande terminale ici
 * produirait deux événements contradictoires, le terminal arrivant en premier,
 * et la réussite suivante ne pourrait plus rien réparer.
 */
async function recordOnly(db: Db, event: Stripe.Event): Promise<Outcome> {
  const order = await findOrder(db, event);
  return {
    action: order ? `enregistre_sans_effet (${order.reference})` : "enregistre_sans_effet",
  };
}

async function handle(db: Db, event: Stripe.Event): Promise<Outcome> {
  switch (event.type) {
    case "checkout.session.completed":
      return confirmPaidOrder(db, event);
    case "checkout.session.expired":
      return expireOrder(db, event);
    case "payment_intent.payment_failed":
      return recordOnly(db, event);
    default:
      return { action: `type_non_traite:${event.type}` };
  }
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Signature absente.", { status: 400 });
  }

  // Corps brut obligatoire: toute reconstruction JSON invaliderait la signature.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      rawBody,
      signature,
      requireWebhookSecret(),
    );
  } catch (error) {
    // Message seul: cet endpoint est public et une signature refusée ne doit
    // pas remplir les journaux avec la trace complète du SDK.
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[stripe-webhook] signature refusée: ${reason}`);
    return new Response("Signature invalide.", { status: 400 });
  }

  const db = serviceClient();

  const { data: existing } = await db
    .from("stripe_events")
    .select("id, processed_at, attempts")
    .eq("id", event.id)
    .maybeSingle();

  if (existing?.processed_at) {
    // Stripe rejoue: on acquitte sans retraiter.
    return Response.json({ received: true, action: "deja_traite" });
  }

  if (!existing) {
    const { error } = await db.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      session_id: sessionIdOf(event),
      order_id: orderIdOf(event),
      payload: event as unknown as Record<string, unknown>,
    });
    // 23505: livraison concurrente du même événement. L'autre traitement s'en
    // charge, on acquitte.
    if (error && error.code !== "23505") {
      console.error("[stripe-webhook] journalisation impossible", error);
      return new Response("Journalisation impossible.", { status: 500 });
    }
  }

  const attempts = (existing?.attempts ?? 0) + 1;

  let outcome: Outcome;
  try {
    outcome = await handle(db, event);

    await db
      .from("stripe_events")
      .update({
        // Une anomalie métier ne sera pas réparée par un réessai: on marque
        // l'événement traité, avec l'erreur en clair pour l'admin.
        processed_at: new Date().toISOString(),
        error: outcome.error ?? null,
        attempts,
        order_id: orderIdOf(event),
      })
      .eq("id", event.id);

    if (outcome.error) {
      console.error(`[stripe-webhook] ${event.type}: ${outcome.error}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[stripe-webhook] échec ${event.type}`, error);

    await db
      .from("stripe_events")
      .update({ error: message, attempts })
      .eq("id", event.id);

    // 500: panne technique, Stripe doit réessayer.
    return new Response("Traitement impossible.", { status: 500 });
  }

  // Notifications: délibérément hors du try ci-dessus.
  //
  // La commande est déjà confirmée et l'événement déjà marqué traité. Un envoi
  // raté ne doit donc ni provoquer un 500, ni déclencher un rejeu Stripe, ni
  // revenir en arrière sur le statut: le client a payé, la commande tient.
  // L'échec est enregistré sur l'événement et reste visible dans l'admin, et
  // les horodatages restent nuls, ce qui rend l'envoi rejouable.
  //
  // Envoi conditionné à confirmedOrderId: seul l'appel qui a réellement fait
  // basculer la commande notifie. Un rejeu ou une livraison concurrente
  // n'envoie rien.
  if (outcome.confirmedOrderId) {
    const notified = await notifyOrderConfirmed(outcome.confirmedOrderId);
    if (notified.errors.length > 0) {
      const message = `notification: ${notified.errors.join(" | ")}`;
      console.error(`[stripe-webhook] ${message}`);
      await db
        .from("stripe_events")
        .update({ error: [outcome.error, message].filter(Boolean).join(" | ") })
        .eq("id", event.id);
    }
    return Response.json({
      received: true,
      action: outcome.action,
      cuisine: notified.kitchen,
      client: notified.customer,
    });
  }

  return Response.json({ received: true, action: outcome.action });
}
