/**
 * Panier: revalidation du contenu restauré, et accord des totaux affichés avec
 * la tarification serveur.
 *
 * Deux propriétés valent d'être tenues:
 *
 * 1. Un panier venant de localStorage ne peut pas faire échouer un paiement.
 *    Il a pu être écrit par une version précédente du site ou modifié à la
 *    main, donc il est revalidé contre la carte avant usage.
 * 2. Le total montré au client est celui qu'il paiera. Le serveur retarife,
 *    et si les deux calculs divergeaient, le client verrait un prix et serait
 *    débité d'un autre.
 */

import { GRANDE_LICENCE_HELD } from "@/config/menu";
import { FREE_DELIVERY_THRESHOLD_CENTS } from "@/config/zones";
import { sanitiseCart } from "@/lib/cart-storage";
import { displayTotals } from "@/lib/cart-totals";
import { priceCart } from "@/lib/pricing";

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

function equal(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  check(label, same, same ? "" : `attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
console.log("\nsanitiseCart");
// ---------------------------------------------------------------------------

equal("contenu illisible donne un panier vide", sanitiseCart("nope"), []);
equal("null donne un panier vide", sanitiseCart(null), []);

equal(
  "ligne valide conservée",
  sanitiseCart([{ itemId: "houmous", variantId: null, quantity: 2 }]),
  [{ itemId: "houmous", variantId: null, quantity: 2 }],
);

equal(
  "article absent de la carte écarté",
  sanitiseCart([{ itemId: "shawarma-inexistant", variantId: null, quantity: 1 }]),
  [],
);

// Le cas qui compte pour la licence: un panier enregistré avant l'obtention de
// la grande licence ne doit pas ressusciter un spiritueux, et inversement.
equal(
  "spiritueux écarté tant que la grande licence n'est pas détenue",
  sanitiseCart([{ itemId: "arak-ouzo", variantId: null, quantity: 1 }]),
  GRANDE_LICENCE_HELD
    ? [{ itemId: "arak-ouzo", variantId: null, quantity: 1 }]
    : [],
);

equal(
  "variante requise mais absente: ligne écartée",
  sanitiseCart([{ itemId: "mezze-mix", variantId: null, quantity: 1 }]),
  [],
);

equal(
  "variante inconnue: ligne écartée",
  sanitiseCart([{ itemId: "mezze-mix", variantId: "pour-12", quantity: 1 }]),
  [],
);

equal(
  "variante sur un article qui n'en a pas: ligne écartée",
  sanitiseCart([{ itemId: "houmous", variantId: "grand", quantity: 1 }]),
  [],
);

equal(
  "quantité nulle, négative ou fractionnaire: ligne écartée",
  sanitiseCart([
    { itemId: "houmous", variantId: null, quantity: 0 },
    { itemId: "taboule", variantId: null, quantity: -3 },
    { itemId: "zaitoun", variantId: null, quantity: 1.5 },
  ]),
  [],
);

equal(
  "lignes identiques fusionnées",
  sanitiseCart([
    { itemId: "houmous", variantId: null, quantity: 2 },
    { itemId: "houmous", variantId: null, quantity: 3 },
  ]),
  [{ itemId: "houmous", variantId: null, quantity: 5 }],
);

equal(
  "quantité plafonnée à la limite d'une ligne de commande",
  sanitiseCart([{ itemId: "houmous", variantId: null, quantity: 9999 }]),
  [{ itemId: "houmous", variantId: null, quantity: 50 }],
);

equal(
  "variantes distinctes du même article restent séparées",
  sanitiseCart([
    { itemId: "mezze-mix", variantId: "pour-1", quantity: 1 },
    { itemId: "mezze-mix", variantId: "pour-2-3", quantity: 1 },
  ]),
  [
    { itemId: "mezze-mix", variantId: "pour-1", quantity: 1 },
    { itemId: "mezze-mix", variantId: "pour-2-3", quantity: 1 },
  ],
);

// Un panier sain ne doit jamais être amputé au passage.
{
  const sane = [
    { itemId: "houmous", variantId: null, quantity: 1 },
    { itemId: "mezze-mix", variantId: "pour-2-3", quantity: 2 },
    { itemId: "biere-blonde", variantId: null, quantity: 3 },
  ];
  equal("panier sain traversé sans perte", sanitiseCart(sane), sane);
}

// ---------------------------------------------------------------------------
console.log("\ndisplayTotals accorde avec priceCart");
// ---------------------------------------------------------------------------

/**
 * Le total affiché doit valoir le total serveur, sinon le client voit un prix
 * et paie l'autre. On compare sur des paniers de part et d'autre du seuil de
 * livraison offerte, là où les deux calculs pourraient diverger.
 */
const scenarios: { label: string; lines: { itemId: string; variantId: string | null; quantity: number }[] }[] = [
  {
    label: "petit panier",
    lines: [{ itemId: "houmous", variantId: null, quantity: 1 }],
  },
  {
    label: "panier sous le seuil de livraison offerte",
    lines: [
      { itemId: "houmous", variantId: null, quantity: 1 },
      { itemId: "taboule", variantId: null, quantity: 1 },
    ],
  },
  {
    label: "panier au-dessus du seuil de livraison offerte",
    lines: [{ itemId: "mezze-mix", variantId: "pour-2-3", quantity: 1 }],
  },
  {
    label: "panier avec variantes et alcool",
    lines: [
      { itemId: "mezze-mix", variantId: "pour-1", quantity: 2 },
      { itemId: "soft", variantId: "coca-zero", quantity: 2 },
      { itemId: "biere-blonde", variantId: null, quantity: 1 },
    ],
  },
];

for (const scenario of scenarios) {
  for (const mode of ["livraison", "retrait"] as const) {
    const shown = displayTotals(scenario.lines, mode);
    const server = priceCart(
      scenario.lines.map((line) => ({
        itemId: line.itemId,
        variantId: line.variantId ?? undefined,
        quantity: line.quantity,
      })),
      { mode, referralCode: null },
    );

    check(
      `${scenario.label}, ${mode}: sous-total identique`,
      shown.subtotalCents === server.subtotalCents,
      `affiché ${shown.subtotalCents}, serveur ${server.subtotalCents}`,
    );
    check(
      `${scenario.label}, ${mode}: frais de livraison identiques`,
      (shown.deliveryFeeCents ?? 0) === server.deliveryFeeCents,
      `affiché ${shown.deliveryFeeCents}, serveur ${server.deliveryFeeCents}`,
    );
    check(
      `${scenario.label}, ${mode}: total identique`,
      shown.totalCents === server.totalCents,
      `affiché ${shown.totalCents}, serveur ${server.totalCents}`,
    );
    check(
      `${scenario.label}, ${mode}: présence d'alcool identique`,
      shown.containsAlcohol === server.containsAlcohol,
    );
  }
}

// Le seuil de gratuité doit se voir des deux côtés au même endroit.
if (FREE_DELIVERY_THRESHOLD_CENTS !== null) {
  const above = displayTotals(
    [{ itemId: "mezze-mix", variantId: "pour-2-3", quantity: 1 }],
    "livraison",
  );
  check(
    "livraison offerte au-dessus du seuil",
    above.subtotalCents >= FREE_DELIVERY_THRESHOLD_CENTS && above.deliveryFeeCents === 0,
    `sous-total ${above.subtotalCents}, frais ${above.deliveryFeeCents}`,
  );
}

// Tant que le mode n'est pas choisi, aucun frais n'est annoncé.
{
  const undecided = displayTotals(
    [{ itemId: "houmous", variantId: null, quantity: 1 }],
    null,
  );
  check(
    "mode non choisi: frais inconnus plutôt que nuls",
    undecided.deliveryFeeCents === null,
  );
  check(
    "mode non choisi: total égal au sous-total",
    undecided.totalCents === undecided.subtotalCents,
  );
}

console.log(`\n${passed} ok, ${failed} échec(s)`);
if (failed > 0) process.exitCode = 1;
