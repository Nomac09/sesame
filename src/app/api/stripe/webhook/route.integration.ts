/**
 * Test d'intégration du webhook, contre la vraie base.
 *
 * Les signatures sont fabriquées localement avec generateTestHeaderString, donc
 * le handler est exercé exactement comme en production, vérification de
 * signature comprise, sans appel réseau à Stripe.
 *
 * Lancer avec `npm run test:webhook`.
 */

// AVANT tout import qui lirait la clé: on force le repli console pour que ce
// test n'envoie jamais d'email réel, ni à la cuisine ni à une adresse fictive.
delete process.env.RESEND_API_KEY;

import { POST } from "@/app/api/stripe/webhook/route";
import {
  notifyOrderConfirmed,
  transport,
  type NotificationTransport,
} from "@/lib/notify";
import { generateReference } from "@/lib/reference";
import { stripe } from "@/lib/stripe";
import { serviceClient } from "@/lib/supabase/server";

const db = serviceClient();
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label} ${detail}`);
    failed++;
  }
}

const RUN = Math.random().toString(36).slice(2, 8);
const eventIds: string[] = [];
const references: string[] = [];

function secret(): string {
  const value = process.env.STRIPE_WEBHOOK_SECRET;
  if (!value) throw new Error("STRIPE_WEBHOOK_SECRET absente de l'environnement.");
  return value;
}

async function createOrder(totalCents: number) {
  // Le vrai générateur: format garanti conforme à la contrainte de colonne, et
  // une référence distincte par commande.
  const reference = generateReference();
  references.push(reference);
  const { data, error } = await db
    .from("orders")
    .insert({
      reference,
      first_name: "Webhook",
      last_name: "Test",
      phone: "0600000000",
      email: "webhook@exemple.fr",
      mode: "retrait",
      slot_start: new Date(Date.now() + 3_600_000).toISOString(),
      slot_end: new Date(Date.now() + 5_400_000).toISOString(),
      subtotal_cents: totalCents,
      referral_discount_cents: 0,
      delivery_fee_cents: 0,
      total_cents: totalCents,
    })
    .select("id, reference, status")
    .single();
  if (error) throw new Error(`${reference}: ${error.message}`);
  return data;
}

function buildEvent(
  type: string,
  object: Record<string, unknown>,
  id = `evt_${RUN}_${eventIds.length}`,
) {
  if (!eventIds.includes(id)) eventIds.push(id);
  return {
    id,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  };
}

/** Appelle le handler avec une signature valide, comme le ferait Stripe. */
async function deliver(event: Record<string, unknown>, signed = true) {
  const payload = JSON.stringify(event);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signed) {
    headers["stripe-signature"] = stripe().webhooks.generateTestHeaderString({
      payload,
      secret: secret(),
    });
  }
  const response = await POST(
    new Request("https://sesamerestaurant.fr/api/stripe/webhook", {
      method: "POST",
      body: payload,
      headers,
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text };
}

const statusOf = async (reference: string) => {
  const { data } = await db
    .from("orders")
    .select("status, paid_at, stripe_payment_intent_id")
    .eq("reference", reference)
    .single();
  return data;
};

const eventRow = async (id: string) => {
  const { data } = await db
    .from("stripe_events")
    .select("id, type, error, processed_at, order_id")
    .eq("id", id)
    .maybeSingle();
  return data;
};

function sessionObject(order: { id: string; reference: string }, overrides = {}) {
  return {
    id: `cs_test_${RUN}_${order.reference}`,
    object: "checkout.session",
    amount_total: 3350,
    currency: "eur",
    payment_status: "paid",
    payment_intent: `pi_test_${RUN}`,
    metadata: { order_id: order.id, reference: order.reference },
    ...overrides,
  };
}

async function guard(): Promise<void> {
  const { count, error } = await db
    .from("orders")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Base injoignable: ${error.message}`);
  if ((count ?? 0) > 0 && process.env.SESAME_ALLOW_LIVE_TEST !== "1") {
    throw new Error(
      `La base contient ${count} commande(s). Ce test en insère puis les supprime. ` +
        `Relancer avec SESAME_ALLOW_LIVE_TEST=1 si c'est voulu.`,
    );
  }
}

const notifyState = async (reference: string) => {
  const { data } = await db
    .from("orders")
    .select("kitchen_notified_at, customer_emailed_at, status")
    .eq("reference", reference)
    .single();
  return data;
};

async function run(): Promise<void> {
  console.log("\n=== Aucun email reel ne partira ===");
  check(
    "le transport est bien le repli console",
    transport().name === "console",
    `transport: ${transport().name}`,
  );

  console.log("\n=== Signature ===");
  const unsigned = await deliver(buildEvent("checkout.session.completed", {}), false);
  check("sans en-tete de signature: 400", unsigned.status === 400, `recu ${unsigned.status}`);

  const badPayload = JSON.stringify(buildEvent("checkout.session.completed", {}));
  const forged = await POST(
    new Request("https://sesamerestaurant.fr/api/stripe/webhook", {
      method: "POST",
      body: badPayload,
      headers: { "stripe-signature": "t=1,v1=faux" },
    }),
  );
  check("signature forgee: 400", forged.status === 400, `recu ${forged.status}`);

  console.log("\n=== Paiement conforme ===");
  const paid = await createOrder(3350);
  const okEvent = buildEvent("checkout.session.completed", sessionObject(paid));
  const first = await deliver(okEvent);
  check("acquitte en 200", first.status === 200, first.body);
  const afterPaid = await statusOf(paid.reference);
  check("commande confirmee", afterPaid?.status === "confirmee", `statut ${afterPaid?.status}`);
  check("paid_at renseigne", afterPaid?.paid_at !== null);
  check(
    "payment_intent enregistre",
    afterPaid?.stripe_payment_intent_id === `pi_test_${RUN}`,
    String(afterPaid?.stripe_payment_intent_id),
  );

  console.log("\n=== Notifications apres confirmation ===");
  const notifiedPaid = await notifyState(paid.reference);
  check("bon de cuisine horodate", notifiedPaid?.kitchen_notified_at !== null);
  check("confirmation client horodatee", notifiedPaid?.customer_emailed_at !== null);
  check("le corps de reponse rend compte des envois", first.body.includes("cuisine"), first.body);

  console.log("\n=== Idempotence ===");
  const replay = await deliver(okEvent);
  check("rejeu acquitte en 200", replay.status === 200);
  check("rejeu detecte", replay.body.includes("deja_traite"), replay.body);
  const afterReplay = await statusOf(paid.reference);
  check(
    "le rejeu ne change rien",
    afterReplay?.status === "confirmee" && afterReplay.paid_at === afterPaid?.paid_at,
  );
  const notifiedAfterReplay = await notifyState(paid.reference);
  check(
    "le rejeu ne renotifie pas",
    notifiedAfterReplay?.kitchen_notified_at === notifiedPaid?.kitchen_notified_at &&
      notifiedAfterReplay?.customer_emailed_at === notifiedPaid?.customer_emailed_at,
  );

  console.log("\n=== Un envoi qui echoue ne defait pas la commande ===");
  const fragile = await createOrder(1500);
  await db
    .from("orders")
    .update({ status: "confirmee", paid_at: new Date().toISOString() })
    .eq("id", fragile.id);
  const brokenTransport: NotificationTransport = {
    name: "casse",
    async sendKitchenTicket() {
      throw new Error("SMTP indisponible");
    },
    async sendCustomerConfirmation() {
      throw new Error("adresse rejetee");
    },
    async sendReadyNotice() {
      throw new Error("annonce prete non envoyee");
    },
    async sendCancellationNotice() {
      throw new Error("annulation non envoyee");
    },
  };
  const failed = await notifyOrderConfirmed(fragile.id, brokenTransport);
  check("l envoi cuisine est signale en echec", failed.kitchen === "echec");
  check("l envoi client est signale en echec", failed.customer === "echec");
  check("les deux erreurs sont remontees", failed.errors.length === 2, failed.errors.join(" | "));
  const afterFailure = await notifyState(fragile.reference);
  check(
    "la commande reste confirmee",
    afterFailure?.status === "confirmee",
    `statut ${afterFailure?.status}`,
  );
  check(
    "les horodatages restent nuls, l envoi reste rejouable",
    afterFailure?.kitchen_notified_at === null && afterFailure?.customer_emailed_at === null,
  );

  console.log("\n=== Rejeu manuel apres reparation ===");
  const repaired = await notifyOrderConfirmed(fragile.id);
  check("l envoi passe cette fois", repaired.kitchen === "envoye" && repaired.customer === "envoye");
  const second = await notifyOrderConfirmed(fragile.id);
  check(
    "un second appel ne renvoie rien",
    second.kitchen === "deja_envoye" && second.customer === "deja_envoye",
  );

  console.log("\n=== Commande absente ===");
  const missing = await notifyOrderConfirmed("00000000-0000-0000-0000-000000000000");
  check("signale sans lever", missing.kitchen === "commande_absente");

  console.log("\n=== Montant incoherent ===");
  const mismatched = await createOrder(1920);
  const badAmount = buildEvent(
    "checkout.session.completed",
    sessionObject(mismatched, { amount_total: 100 }),
    `evt_${RUN}_montant`,
  );
  const bad = await deliver(badAmount);
  check("acquitte en 200, pas de reessai inutile", bad.status === 200, bad.body);
  const afterBad = await statusOf(mismatched.reference);
  check(
    "commande NON confirmee",
    afterBad?.status === "en_attente_paiement",
    `statut ${afterBad?.status}`,
  );
  const badRow = await eventRow(`evt_${RUN}_montant`);
  check("l ecart est enregistre", (badRow?.error ?? "").includes("montant Stripe"), String(badRow?.error));
  check("l evenement reste visible dans l admin", badRow?.error !== null);

  console.log("\n=== Session expiree ===");
  const expired = await createOrder(750);
  const expiredEvent = buildEvent(
    "checkout.session.expired",
    sessionObject(expired, { payment_status: "unpaid" }),
    `evt_${RUN}_expire`,
  );
  const exp = await deliver(expiredEvent);
  check("acquitte en 200", exp.status === 200, exp.body);
  const afterExpired = await statusOf(expired.reference);
  check(
    "commande en paiement_echoue",
    afterExpired?.status === "paiement_echoue",
    `statut ${afterExpired?.status}`,
  );

  console.log("\n=== Paiement refuse: enregistre, sans effet ===");
  const declined = await createOrder(890);
  const failEvent = buildEvent(
    "payment_intent.payment_failed",
    {
      id: `pi_test_${RUN}_refus`,
      object: "payment_intent",
      metadata: { order_id: declined.id, reference: declined.reference },
    },
    `evt_${RUN}_refus`,
  );
  const declinedResult = await deliver(failEvent);
  check("acquitte en 200", declinedResult.status === 200, declinedResult.body);
  const afterDeclined = await statusOf(declined.reference);
  check(
    "la commande reste en attente de paiement",
    afterDeclined?.status === "en_attente_paiement",
    `statut ${afterDeclined?.status}`,
  );
  const failRow = await eventRow(`evt_${RUN}_refus`);
  check("l echec est journalise", failRow?.type === "payment_intent.payment_failed");
  check("rattache a la commande", failRow?.order_id === declined.id);
  check("aucune erreur signalee, c est un cas normal", failRow?.error === null);

  console.log("\n=== Un refus suivi d une reussite confirme bien ===");
  const retryEvent = buildEvent(
    "checkout.session.completed",
    sessionObject(declined, { amount_total: 890 }),
    `evt_${RUN}_retry`,
  );
  await deliver(retryEvent);
  const afterRetry = await statusOf(declined.reference);
  check(
    "la commande est confirmee malgre le refus precedent",
    afterRetry?.status === "confirmee",
    `statut ${afterRetry?.status}`,
  );
}

async function cleanup(): Promise<void> {
  await db.from("stripe_events").delete().in("id", eventIds);
  await db.from("orders").delete().in("reference", references);
}

async function main(): Promise<void> {
  await guard();
  try {
    await run();
  } finally {
    await cleanup();
    // Compté sur les seules références créées ici. Compter toute la table
    // ferait échouer un nettoyage pourtant correct dès qu'une commande
    // étrangère au test existe, ce qui est le cas avec SESAME_ALLOW_LIVE_TEST.
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("reference", references);
    check("nettoyage: aucune commande restante", (count ?? 0) === 0, `restantes: ${count}`);
  }
  console.log(`\n${passed} ok, ${failed} echecs`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exit(1);
});
