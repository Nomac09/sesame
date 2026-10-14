/**
 * Vérifie contre une vraie base que l'attribution reste agrégée.
 *
 * Ce test a changé de nature. Il vérifiait autrefois que le code de campagne
 * était bien recopié sur la commande. C'est précisément ce qu'on a supprimé:
 * rattacher un cookie de mesure à une ligne portant un nom, un téléphone et
 * une adresse faisait sortir ce cookie de la dispense de consentement.
 *
 * Il vérifie donc maintenant l'inverse, et c'est le test le plus utile du
 * fichier: la colonne n'existe plus, et le compteur compte sans rien
 * rattacher à personne.
 *
 * Lancer avec `npm run test:referral-db`.
 */

import { referralDiscountCents } from "@/config/referral";
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

const REFERENCE = "SES-4TTA";
const CODES = ["SACQR-TEST", "JAMAIS-VU-42"];

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
  await db.from("orders").delete().eq("reference", REFERENCE);
  await db.from("referral_hits").delete().in("code", CODES);
}

async function hitsFor(code: string): Promise<{ orders: number; subtotal: number }> {
  const { data, error } = await db
    .from("referral_hits")
    .select("orders, subtotal_cents")
    .eq("code", code);
  if (error) throw new Error(error.message);
  return {
    orders: (data ?? []).reduce((total, row) => total + row.orders, 0),
    subtotal: (data ?? []).reduce((total, row) => total + row.subtotal_cents, 0),
  };
}

async function run(): Promise<void> {
  console.log("\n=== La colonne d'attribution n'existe plus sur orders ===");
  const { error: columnError } = await db
    .from("orders")
    .select("referral_code")
    .limit(1);
  check(
    "lire orders.referral_code echoue",
    columnError !== null,
    columnError ? "" : "la colonne repond encore",
  );

  console.log("\n=== Une commande ne porte aucune trace du code ===");
  const { error: insertError } = await db.from("orders").insert({
    reference: REFERENCE,
    first_name: "Attribution",
    last_name: "Test",
    phone: "0600000000",
    email: "attribution@exemple.fr",
    mode: "retrait",
    slot_start: new Date(Date.now() + 3_600_000).toISOString(),
    slot_end: new Date(Date.now() + 5_400_000).toISOString(),
    subtotal_cents: 750,
    referral_discount_cents: 0,
    delivery_fee_cents: 0,
    total_cents: 750,
  });
  if (insertError) throw new Error(insertError.message);

  const { data: row, error: readError } = await db
    .from("orders")
    .select("*")
    .eq("reference", REFERENCE)
    .single();
  if (readError) throw new Error(readError.message);

  check(
    "aucune colonne de la commande ne contient de code de campagne",
    !Object.keys(row).some((column) => column.includes("referral_code")),
    Object.keys(row).join(", "),
  );

  console.log("\n=== Le compteur compte, sans rien rattacher ===");
  check(
    "le code de test ne donne aucune remise",
    referralDiscountCents("SACQR-TEST", 750) === 0,
  );

  await db.rpc("record_referral_hit", {
    p_code: "sacqr-test",
    p_subtotal_cents: 750,
  });
  await db.rpc("record_referral_hit", {
    p_code: " SACQR-TEST ",
    p_subtotal_cents: 1250,
  });

  const hits = await hitsFor("SACQR-TEST");
  check("deux passages comptes", hits.orders === 2, `lu: ${hits.orders}`);
  check(
    "les paniers sont cumules",
    hits.subtotal === 2000,
    `lu: ${hits.subtotal}`,
  );

  // Un code inconnu de FIRST_ORDER_CODES doit compter lui aussi: la mesure ne
  // dépend pas de l'existence d'une remise.
  await db.rpc("record_referral_hit", {
    p_code: "JAMAIS-VU-42",
    p_subtotal_cents: 900,
  });
  const unknown = await hitsFor("JAMAIS-VU-42");
  check("un code inconnu est compte aussi", unknown.orders === 1);

  console.log("\n=== Le compteur ne porte aucune donnee personnelle ===");
  const { data: columns, error: columnsError } = await db
    .from("referral_hits")
    .select("*")
    .limit(1);
  if (columnsError) throw new Error(columnsError.message);
  const names = Object.keys(columns?.[0] ?? {});
  const forbidden = ["order", "email", "phone", "name", "customer", "address"];
  check(
    "aucune colonne rattachant le compteur a une commande ou a une personne",
    // `orders` est un compteur, pas une reference: on l'ecarte explicitement.
    !names.some(
      (name) => name !== "orders" && forbidden.some((word) => name.includes(word)),
    ),
    names.join(", "),
  );

  console.log("\n=== Un code vide n'invente pas de ligne ===");
  await db.rpc("record_referral_hit", { p_code: "", p_subtotal_cents: 500 });
  await db.rpc("record_referral_hit", { p_code: null, p_subtotal_cents: 500 });
  const { count: total } = await db
    .from("referral_hits")
    .select("code", { count: "exact", head: true })
    .in("code", CODES);
  check("seuls les deux codes de test existent", (total ?? 0) === 2, `lu: ${total}`);
}

async function main(): Promise<void> {
  await guard();
  try {
    await run();
  } finally {
    await cleanup();
    // Compté sur la seule référence créée ici: la base peut légitimement
    // contenir d'autres commandes.
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("reference", REFERENCE);
    check("nettoyage: aucune commande de test restante", (count ?? 0) === 0);
  }
  console.log(`\n${passed} ok, ${failed} echecs`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exit(1);
});
