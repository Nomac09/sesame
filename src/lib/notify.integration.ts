/**
 * Vérifie contre une vraie base les deux envois déclenchés par la cuisine:
 * la commande est prête, et la commande est annulée.
 *
 * Trois propriétés comptent, et aucune ne se lit dans le code sans l'éprouver:
 * l'envoi n'a lieu qu'une fois, il ne lève jamais, et un échec laisse
 * l'horodatage nul pour rester rejouable.
 *
 * S'y ajoute une vérification de rédaction. Le cahier des charges interdit
 * d'annoncer un départ ou une heure d'arrivée en livraison: `prete` veut dire
 * prête, pas partie. C'est une règle de contenu qu'aucun type ne protège, donc
 * elle est testée.
 *
 * Lancer avec `npm run test:notify`.
 */

import {
  notifyOrderCancelled,
  notifyOrderReady,
  customerReadyText,
  type NotifiableOrder,
  type NotificationTransport,
} from "@/lib/notify";
import { generateReference } from "@/lib/reference";
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

const references: string[] = [];

/** Transport muet qui retient ce qu'on lui a demandé d'envoyer. */
function spyTransport() {
  const sent: { kind: string; order: NotifiableOrder }[] = [];
  const transport: NotificationTransport = {
    name: "espion",
    async sendKitchenTicket(order) {
      sent.push({ kind: "cuisine", order });
    },
    async sendCustomerConfirmation(order) {
      sent.push({ kind: "confirmation", order });
    },
    async sendReadyNotice(order) {
      sent.push({ kind: "prete", order });
    },
    async sendCancellationNotice(order) {
      sent.push({ kind: "annulation", order });
    },
  };
  return { transport, sent };
}

const brokenTransport: NotificationTransport = {
  name: "casse",
  async sendKitchenTicket() {
    throw new Error("SMTP indisponible");
  },
  async sendCustomerConfirmation() {
    throw new Error("SMTP indisponible");
  },
  async sendReadyNotice() {
    throw new Error("SMTP indisponible");
  },
  async sendCancellationNotice() {
    throw new Error("SMTP indisponible");
  },
};

async function createOrder(mode: "retrait" | "livraison") {
  const reference = generateReference();
  references.push(reference);

  const { data, error } = await db
    .from("orders")
    .insert({
      reference,
      first_name: "Notification",
      last_name: "Test",
      phone: "0600000000",
      email: "notification@exemple.fr",
      mode,
      address_line: mode === "livraison" ? "12 rue des Lilas" : null,
      postcode: mode === "livraison" ? "59910" : null,
      slot_start: new Date(Date.now() + 3_600_000).toISOString(),
      slot_end: new Date(Date.now() + 5_400_000).toISOString(),
      subtotal_cents: 750,
      referral_discount_cents: 0,
      delivery_fee_cents: 0,
      total_cents: 750,
    })
    .select("id, reference")
    .single();

  if (error) throw new Error(`${reference}: ${error.message}`);
  return data;
}

/** Amène la commande jusqu'à `prete`, en respectant les transitions. */
async function advanceToReady(id: string): Promise<void> {
  for (const status of ["confirmee", "en_preparation", "prete"]) {
    const { error } = await db.from("orders").update({ status }).eq("id", id);
    if (error) throw new Error(`${status}: ${error.message}`);
  }
}

async function readTimestamps(id: string) {
  const { data, error } = await db
    .from("orders")
    .select("ready_emailed_at, cancellation_emailed_at, status")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
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

async function cleanup(): Promise<void> {
  await db.from("orders").delete().in("reference", references);
}

async function run(): Promise<void> {
  console.log("\n=== Commande prete: un seul envoi ===");
  const collect = await createOrder("retrait");
  await advanceToReady(collect.id);

  const first = spyTransport();
  const sent = await notifyOrderReady(collect.id, first.transport);
  check("l envoi est signale comme parti", sent.customer === "envoye");
  check("un seul message", first.sent.length === 1, `${first.sent.length}`);
  check("c est bien l annonce prete", first.sent[0]?.kind === "prete");
  check(
    "ready_emailed_at est horodate",
    (await readTimestamps(collect.id)).ready_emailed_at !== null,
  );

  const second = spyTransport();
  const again = await notifyOrderReady(collect.id, second.transport);
  check("le second appel ne renvoie rien", again.customer === "deja_envoye");
  check("aucun message en double", second.sent.length === 0, `${second.sent.length}`);

  console.log("\n=== Un envoi qui echoue ne bloque rien et reste rejouable ===");
  const fragile = await createOrder("livraison");
  await advanceToReady(fragile.id);

  const broken = await notifyOrderReady(fragile.id, brokenTransport);
  check("l echec est signale sans lever", broken.customer === "echec");
  check("l erreur est remontee", broken.errors.length === 1, broken.errors.join(" | "));

  const afterFailure = await readTimestamps(fragile.id);
  check(
    "la commande reste prete malgre l echec d envoi",
    afterFailure.status === "prete",
    `statut ${afterFailure.status}`,
  );
  check(
    "ready_emailed_at reste nul, donc rejouable",
    afterFailure.ready_emailed_at === null,
  );

  const retry = spyTransport();
  const replayed = await notifyOrderReady(fragile.id, retry.transport);
  check("le rejeu part bien", replayed.customer === "envoye");

  console.log("\n=== Redaction: prete ne veut pas dire partie ===");
  const order = retry.sent[0]?.order;
  if (!order) throw new Error("aucune commande capturee");
  const delivery = customerReadyText(order);

  for (const forbidden of [
    "en route",
    "en chemin",
    "est partie",
    "arrivera",
    "arrive à",
    "livraison dans",
  ]) {
    check(
      `le texte de livraison ne dit pas "${forbidden}"`,
      !delivery.toLowerCase().includes(forbidden),
    );
  }
  check(
    "aucune heure d arrivee annoncee",
    !/(arriv|livr)\w*\s+(vers|à)\s+\d{1,2}\s?h/i.test(delivery),
  );
  check("l adresse de livraison est rappelee", delivery.includes("12 rue des Lilas"));
  check("le numero de telephone est present", delivery.includes("03 20 00 00 00"));

  const collectText = customerReadyText({ ...order, mode: "retrait" });
  check(
    "le texte de retrait porte l adresse de la cuisine",
    collectText.includes("rue de l'Exemple"),
  );
  check(
    "le texte de retrait porte le telephone",
    collectText.includes("03 20 00 00 00"),
  );

  console.log("\n=== Annulation: meme contrat ===");
  const cancelled = await createOrder("retrait");
  await advanceToReady(cancelled.id);
  await db.from("orders").update({ status: "annulee" }).eq("id", cancelled.id);

  const notice = spyTransport();
  const one = await notifyOrderCancelled(
    cancelled.id,
    { refundedCents: 750 },
    notice.transport,
  );
  check("l annulation part", one.customer === "envoye");
  check("un seul message", notice.sent.length === 1);
  const twice = await notifyOrderCancelled(
    cancelled.id,
    { refundedCents: 750 },
    spyTransport().transport,
  );
  check("pas de doublon d annulation", twice.customer === "deja_envoye");
}

async function main(): Promise<void> {
  await guard();
  try {
    await run();
  } finally {
    await cleanup();
    // Compté sur les seules références créées ici, et non sur toute la table:
    // avec SESAME_ALLOW_LIVE_TEST, la base peut contenir des commandes qui ne
    // nous appartiennent pas, et les compter ferait échouer un nettoyage
    // pourtant correct.
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("reference", references);
    check("nettoyage: aucune commande de test restante", (count ?? 0) === 0);
  }
  console.log(`\n${passed} ok, ${failed} echecs`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exit(1);
});
