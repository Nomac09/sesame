/**
 * Test d'intégration de store-state, contre une vraie base Supabase.
 *
 * Bascule réellement les interrupteurs, donc il ne fait pas partie de
 * `npm test`, qui reste hors ligne. Lancer avec `npm run test:store-state`.
 *
 * Garde-fou: refuse de tourner si la base contient des commandes, parce que
 * fermer la boutique quelques secondes sur une base de production serait une
 * perte de chiffre d'affaires. Forcer avec SESAME_ALLOW_LIVE_TEST=1.
 *
 * Restaure l'état de départ dans un finally, y compris après un échec.
 */

import {
  assertOrderable,
  availableModes,
  getStoreState,
  isItemAvailable,
  StoreClosedError,
  type StoreState,
} from "@/lib/store-state";
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

function expectCode(label: string, code: string, fn: () => void): void {
  try {
    fn();
    check(label, false, "aucune erreur levée");
  } catch (error) {
    check(
      label,
      error instanceof StoreClosedError && error.code === code,
      `obtenu ${(error as Error).message}`,
    );
  }
}

/** Message de l'erreur levée, ou chaîne vide si l'appel a réussi. */
function messageOf(fn: () => void): string {
  try {
    fn();
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

/** Code de la StoreClosedError levée, ou chaîne vide si l'appel a réussi. */
function codeOf(fn: () => void): string {
  try {
    fn();
    return "";
  } catch (error) {
    return error instanceof StoreClosedError ? error.code : "erreur_inattendue";
  }
}

function allows(state: StoreState, mode: "livraison" | "retrait", ids: string[]) {
  try {
    assertOrderable(state, mode, ids);
    return true;
  } catch {
    return false;
  }
}

const setFlag = (key: string, enabled: boolean) =>
  db.from("settings").update({ enabled }).eq("key", key);

async function guard(): Promise<void> {
  const { count, error } = await db
    .from("orders")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Base injoignable: ${error.message}`);
  if ((count ?? 0) > 0 && process.env.SESAME_ALLOW_LIVE_TEST !== "1") {
    throw new Error(
      `La base contient ${count} commande(s). Ce test bascule store_open et ` +
        `delivery_enabled. Relancer avec SESAME_ALLOW_LIVE_TEST=1 si c'est voulu.`,
    );
  }
}

async function run(): Promise<void> {
  console.log("\n=== Etat initial ===");
  const initial = await getStoreState();
  check("lecture reussie, non degradee", initial.degraded === false);
  check("boutique ouverte", initial.storeOpen === true);
  check("livraison active", initial.deliveryEnabled === true);
  check("les deux modes proposes", availableModes(initial).length === 2);
  check("commande autorisee", allows(initial, "livraison", ["houmous"]));

  console.log("\n=== store_open = false ===");
  await setFlag("store_open", false);
  const closed = await getStoreState();
  check("boutique fermee", closed.storeOpen === false);
  check("aucun mode propose", availableModes(closed).length === 0);
  expectCode("commande refusee", "boutique_fermee", () =>
    assertOrderable(closed, "retrait", ["houmous"]),
  );
  await setFlag("store_open", true);

  console.log("\n=== delivery_enabled = false ===");
  await setFlag("delivery_enabled", false);
  const pickupOnly = await getStoreState();
  check("boutique toujours ouverte", pickupOnly.storeOpen === true);
  check(
    "retrait seul propose",
    availableModes(pickupOnly).join(",") === "retrait",
    availableModes(pickupOnly).join(","),
  );
  expectCode("livraison refusee", "mode_indisponible", () =>
    assertOrderable(pickupOnly, "livraison", ["houmous"]),
  );
  check("retrait accepte", allows(pickupOnly, "retrait", ["houmous"]));
  await setFlag("delivery_enabled", true);

  console.log("\n=== article epuise ===");
  await db.from("item_availability").upsert({ item_id: "falafel", available: false });
  const soldOut = await getStoreState();
  check("falafel indisponible", isItemAvailable(soldOut, "falafel") === false);
  check("houmous disponible", isItemAvailable(soldOut, "houmous") === true);
  check(
    "article absent de la table = disponible",
    isItemAvailable(soldOut, "zaitoun") === true,
  );
  expectCode("panier contenant l article refuse", "article_epuise", () =>
    assertOrderable(soldOut, "retrait", ["houmous", "falafel"]),
  );
  const soldOutMessage = messageOf(() =>
    assertOrderable(soldOut, "retrait", ["falafel"]),
  );
  check(
    "le message nomme l article de la carte, pas son identifiant",
    soldOutMessage.includes("Falafel") && !soldOutMessage.includes("falafel"),
    `message: ${soldOutMessage}`,
  );
  check("panier sans l article accepte", allows(soldOut, "retrait", ["houmous"]));

  console.log("\n=== erreurs distinctes ===");
  const codes = [
    codeOf(() => assertOrderable(soldOut, "retrait", ["falafel"])),
    codeOf(() => assertOrderable({ ...soldOut, storeOpen: false }, "retrait", ["houmous"])),
    codeOf(() =>
      assertOrderable({ ...soldOut, deliveryEnabled: false }, "livraison", ["houmous"]),
    ),
  ];
  check(
    "rupture, fermeture et mode donnent trois codes distincts",
    new Set(codes).size === 3,
    `codes: ${codes.join(", ")}`,
  );
  check(
    "la rupture remonte bien article_epuise",
    codes[0] === "article_epuise",
    `obtenu ${codes[0]}`,
  );

  console.log("\n=== etat degrade ===");
  expectCode("une panne ferme, elle n'ouvre pas", "etat_indisponible", () =>
    assertOrderable(
      {
        storeOpen: false,
        deliveryEnabled: false,
        unavailableItemIds: new Set<string>(),
        degraded: true,
      },
      "retrait",
      ["houmous"],
    ),
  );
}

async function restore(): Promise<void> {
  await setFlag("store_open", true);
  await setFlag("delivery_enabled", true);
  await db.from("item_availability").delete().eq("item_id", "falafel");

  const final = await getStoreState();
  check("restauration: boutique ouverte", final.storeOpen === true);
  check("restauration: livraison active", final.deliveryEnabled === true);
  check("restauration: aucune rupture residuelle", final.unavailableItemIds.size === 0);
}

async function main(): Promise<void> {
  await guard();
  try {
    await run();
  } finally {
    console.log("\n=== restauration ===");
    await restore();
  }
  console.log(`\n${passed} ok, ${failed} echecs`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exit(1);
});
