import { priceCart, CartError } from "@/lib/pricing";
import {
  formatEuros,
  getItem,
  isOrderable,
  GRANDE_LICENCE_HELD,
  MENU_ITEMS,
  PETITE_LICENCE_HELD,
  VISIBLE_MENU,
} from "@/config/menu";
import { check, expectError, section, summary } from "@/lib/test-harness";

/** Attend une CartError portant le code donné. */
function expectThrows(label: string, code: string, fn: () => unknown) {
  expectError(
    label,
    (error) => error instanceof CartError && error.code === code,
    fn,
  );
}

section("Le prix client est ignoré");
check("un prix injecté par le client n'a aucun effet", () => {
  const hostile = [
    // Champs supplémentaires que du code client hostile pourrait envoyer.
    { itemId: "mezze-mix", variantId: "pour-2-3", quantity: 1,
      unitPriceCents: 1, lineTotalCents: 1, priceCents: 1 },
  ] as never;
  const priced = priceCart(hostile, { mode: "retrait" });
  if (priced.totalCents !== 3350) {
    throw new Error(`total ${priced.totalCents}, attendu 3350`);
  }
  if (priced.lines[0].unitPriceCents !== 3350) {
    throw new Error(`prix unitaire ${priced.lines[0].unitPriceCents}`);
  }
});

check("la variante pour-1 est facturée 19,20", () => {
  const priced = priceCart([{ itemId: "mezze-mix", variantId: "pour-1", quantity: 1 }],
    { mode: "retrait" });
  if (priced.totalCents !== 1920) throw new Error(String(priced.totalCents));
});

section("Validation du panier");
expectThrows("article inconnu", "item_inconnu", () =>
  priceCart([{ itemId: "caviar", quantity: 1 }], { mode: "retrait" }));

/*
 * Les deux licences sont détenues, donc plus aucun article n'est refusé pour
 * ce motif. Ces vérifications ne codent pas en dur la réponse du jour: elles
 * comparent ce que la carte publie à l'état des drapeaux. Si une licence
 * n'était pas renouvelée, il suffirait de repasser le drapeau à false et ces
 * mêmes tests continueraient de dire la vérité.
 */
check("les spiritueux sont commandables tant que la grande licence est détenue", () => {
  if (!GRANDE_LICENCE_HELD) return;
  const priced = priceCart([{ itemId: "arak-ouzo", quantity: 1 }], {
    mode: "retrait",
  });
  if (priced.totalCents !== 2990) throw new Error(String(priced.totalCents));
  if (!priced.containsAlcohol) throw new Error("alcool non signalé");
});

check("bière et vin sont commandables tant que la petite licence est détenue", () => {
  if (!PETITE_LICENCE_HELD) return;
  const priced = priceCart([{ itemId: "vin-rouge-libanais", quantity: 1 }], {
    mode: "retrait",
  });
  if (priced.totalCents !== 2490) throw new Error(String(priced.totalCents));
  if (!priced.containsAlcohol) throw new Error("alcool non signalé");
});

check("la carte publiée suit exactement les drapeaux de licence", () => {
  const visible = new Set(
    VISIBLE_MENU.flatMap((category) => category.items).map((item) => item.id),
  );

  for (const item of Object.values(MENU_ITEMS)) {
    const allowed =
      (!item.requiresPetiteLicence || PETITE_LICENCE_HELD) &&
      (!item.requiresGrandeLicence || GRANDE_LICENCE_HELD);
    if (allowed !== visible.has(item.id)) {
      throw new Error(
        `${item.id}: autorisé=${allowed}, publié=${visible.has(item.id)}`,
      );
    }
    if (allowed !== isOrderable(item)) {
      throw new Error(`${item.id}: isOrderable diverge du drapeau`);
    }
  }
});

/*
 * La classification, elle, ne dépend d'aucun drapeau: une boisson fermentée
 * relève de la petite licence, un spiritueux de la grande, et confondre les
 * deux ferait vendre du pastis sous une licence qui ne le couvre pas.
 */
check("chaque boisson alcoolisée relève de la bonne licence", () => {
  const expected: Record<string, "petite" | "grande"> = {
    "biere-blonde": "petite",
    "biere-ambree": "petite",
    "vin-rouge-libanais": "petite",
    "arak-ouzo": "grande",
    "pastis-ricard": "grande",
  };

  for (const [id, licence] of Object.entries(expected)) {
    const item = MENU_ITEMS[id];
    if (!item) throw new Error(`${id} absent de la carte`);
    if (!item.containsAlcohol) throw new Error(`${id} non marqué alcoolisé`);

    const actual = item.requiresGrandeLicence
      ? "grande"
      : item.requiresPetiteLicence
        ? "petite"
        : "aucune";
    if (actual !== licence) {
      throw new Error(`${id}: licence ${actual}, attendu ${licence}`);
    }
  }
});

expectThrows("variante obligatoire", "variante_requise", () =>
  priceCart([{ itemId: "mezze-mix", quantity: 1 }], { mode: "retrait" }));

expectThrows("variante inconnue", "variante_inconnue", () =>
  priceCart([{ itemId: "soft", variantId: "pepsi", quantity: 1 }], { mode: "retrait" }));

expectThrows("variante sur un article qui n'en a pas", "variante_inattendue", () =>
  priceCart([{ itemId: "houmous", variantId: "grand", quantity: 1 }], { mode: "retrait" }));

expectThrows("quantité nulle", "quantite_invalide", () =>
  priceCart([{ itemId: "houmous", quantity: 0 }], { mode: "retrait" }));

expectThrows("quantité fractionnaire", "quantite_invalide", () =>
  priceCart([{ itemId: "houmous", quantity: 1.5 }], { mode: "retrait" }));

expectThrows("quantité au-delà de la limite", "quantite_invalide", () =>
  priceCart([{ itemId: "houmous", quantity: 51 }], { mode: "retrait" }));

expectThrows("panier vide", "panier_vide", () =>
  priceCart([], { mode: "retrait" }));

section("Fusion des lignes");
check("deux lignes identiques sont fusionnées", () => {
  const priced = priceCart(
    [
      { itemId: "houmous", quantity: 2 },
      { itemId: "houmous", quantity: 3 },
    ],
    { mode: "retrait" },
  );
  if (priced.lines.length !== 1) throw new Error(`${priced.lines.length} lignes`);
  if (priced.lines[0].quantity !== 5) throw new Error("quantité non fusionnée");
  if (priced.lines[0].lineTotalCents !== 3750) throw new Error("total de ligne faux");
});

check("des variantes différentes restent des lignes distinctes", () => {
  const priced = priceCart(
    [
      { itemId: "soft", variantId: "coca-cola", quantity: 1 },
      { itemId: "soft", variantId: "fanta", quantity: 1 },
    ],
    { mode: "retrait" },
  );
  if (priced.lines.length !== 2) throw new Error(`${priced.lines.length} lignes`);
});

expectThrows(
  "scinder le panier ne contourne pas la limite de quantité",
  "quantite_invalide",
  () =>
    priceCart(
      [
        { itemId: "houmous", quantity: 30 },
        { itemId: "houmous", quantity: 30 },
      ],
      { mode: "retrait" },
    ),
);

section("Alcool");
check("la bière déclenche la confirmation d'âge", () => {
  const priced = priceCart([{ itemId: "biere-blonde", quantity: 1 }], { mode: "retrait" });
  if (!priced.containsAlcohol) throw new Error("alcool non détecté");
});
check("le vin aussi", () => {
  const priced = priceCart([{ itemId: "vin-rouge-libanais", quantity: 1 }], { mode: "retrait" });
  if (!priced.containsAlcohol) throw new Error("alcool non détecté");
});
check("un panier sans alcool ne la déclenche pas", () => {
  const priced = priceCart([{ itemId: "houmous", quantity: 1 }], { mode: "retrait" });
  if (priced.containsAlcohol) throw new Error("faux positif");
});

section("Frais de livraison");
check("sous le seuil, les frais s'appliquent", () => {
  const priced = priceCart([{ itemId: "houmous", quantity: 1 }], { mode: "livraison" });
  if (priced.deliveryFeeCents !== 350) throw new Error(String(priced.deliveryFeeCents));
  if (priced.totalCents !== 1100) throw new Error(String(priced.totalCents));
});
check("au seuil exact de 30 euros, la livraison est offerte", () => {
  // 4 x houmous = 30,00 exactement.
  const priced = priceCart([{ itemId: "houmous", quantity: 4 }], { mode: "livraison" });
  if (priced.subtotalCents !== 3000) throw new Error(String(priced.subtotalCents));
  if (priced.deliveryFeeCents !== 0) throw new Error("frais appliqués au seuil");
});
check("juste sous le seuil, les frais s'appliquent encore", () => {
  const priced = priceCart([{ itemId: "mezze-mix", variantId: "pour-1", quantity: 1 }],
    { mode: "livraison" });
  if (priced.subtotalCents !== 1920) throw new Error(String(priced.subtotalCents));
  if (priced.deliveryFeeCents !== 350) throw new Error("frais absents sous le seuil");
});
check("le retrait n'a jamais de frais", () => {
  const priced = priceCart([{ itemId: "houmous", quantity: 1 }], { mode: "retrait" });
  if (priced.deliveryFeeCents !== 0) throw new Error("frais non nuls en retrait");
});

section("Codes de parrainage");
check("aucun code n'accorde de remise, SAC5 compris", () => {
  for (const code of ["SAC5", "sac5", "PROMO", ""]) {
    const priced = priceCart([{ itemId: "houmous", quantity: 4 }], {
      mode: "retrait",
      referralCode: code,
    });
    if (priced.referralDiscountCents !== 0) {
      throw new Error(`le code ${code} a accordé une remise`);
    }
    if (priced.totalCents !== 3000) throw new Error("total altéré");
  }
});

section("Allergènes en attente");
check("le falafel est marqué en attente, pas sans allergène", () => {
  const falafel = getItem("falafel");
  if (!falafel) throw new Error("falafel introuvable");
  if (falafel.allergensPending !== true) {
    throw new Error("falafel non marqué en attente");
  }
  if (falafel.tags.includes("sans-gluten")) {
    throw new Error("falafel revendique sans gluten");
  }
});
check("un article confirmé n'est pas marqué en attente", () => {
  const houmous = getItem("houmous");
  if (houmous?.allergensPending) throw new Error("houmous marqué en attente");
});
check("les allergènes confirmés sont bien déclarés", () => {
  const cases: [string, string][] = [
    ["tartare-vegetal", "fruits-a-coque"],
    ["tamriyeh", "sesame"],
    ["biere-blonde", "gluten"],
    ["biere-ambree", "gluten"],
    ["supplement-huile-zaatar", "sesame"],
  ];
  for (const [id, allergen] of cases) {
    const item = getItem(id);
    if (!item?.allergens.includes(allergen as never)) {
      throw new Error(`${id} ne déclare pas ${allergen}`);
    }
  }
});

section("Hygiene des messages d'erreur");

/** Le message part au navigateur, le detail reste dans les journaux serveur. */
function cartErrorFrom(fn: () => unknown): CartError {
  try {
    fn();
  } catch (error) {
    if (error instanceof CartError) return error;
    throw error;
  }
  throw new Error("aucune CartError levée");
}

check("un identifiant d'article inconnu ne fuit pas vers le client", () => {
  const error = cartErrorFrom(() =>
    priceCart([{ itemId: "identifiant-secret-42", quantity: 1 }], { mode: "retrait" }),
  );
  if (error.message.includes("identifiant-secret-42")) {
    throw new Error(`message client: ${error.message}`);
  }
  if (!error.detail?.includes("identifiant-secret-42")) {
    throw new Error("le detail serveur a perdu l'information de debogage");
  }
});

check("un identifiant de variante inconnu ne fuit pas non plus", () => {
  const error = cartErrorFrom(() =>
    priceCart([{ itemId: "soft", variantId: "pepsi-max-99", quantity: 1 }], {
      mode: "retrait",
    }),
  );
  if (error.message.includes("pepsi-max-99")) {
    throw new Error(`message client: ${error.message}`);
  }
  if (!error.detail?.includes("pepsi-max-99")) {
    throw new Error("le detail serveur a perdu l'information de debogage");
  }
});

check("aucun message client ne contient d'identifiant de la carte", () => {
  const slugs = ["mezze-mix", "biere-blonde", "supplement-huile-zaatar", "arak-ouzo"];
  const cases: Array<() => unknown> = [
    () => priceCart([{ itemId: "mezze-mix", quantity: 1 }], { mode: "retrait" }),
    // Quantité aberrante et non licence: l'article est désormais commandable,
    // mais son identifiant ne doit toujours pas fuir dans un message client.
    () => priceCart([{ itemId: "arak-ouzo", quantity: 999 }], { mode: "retrait" }),
    () => priceCart([{ itemId: "houmous", variantId: "grand", quantity: 1 }], { mode: "retrait" }),
    () => priceCart([{ itemId: "biere-blonde", quantity: 0 }], { mode: "retrait" }),
  ];
  for (const run of cases) {
    const { message } = cartErrorFrom(run);
    for (const slug of slugs) {
      if (message.includes(slug)) throw new Error(`"${slug}" dans: ${message}`);
    }
  }
});

section("Exemple de panier");
const example = priceCart(
  [
    { itemId: "mezze-mix", variantId: "pour-2-3", quantity: 1 },
    { itemId: "kubbeh", quantity: 2 },
    { itemId: "biere-blonde", quantity: 2 },
  ],
  { mode: "retrait" },
);
for (const line of example.lines) {
  console.log(
    `  ${line.quantity} x ${line.itemName}${line.variantName ? ` (${line.variantName})` : ""}`.padEnd(40),
    formatEuros(line.lineTotalCents).padStart(10),
    line.allergens.length ? `allergenes: ${line.allergens.join(", ")}` : "",
  );
}
console.log("  total".padEnd(40), formatEuros(example.totalCents).padStart(10));
console.log("  alcool:", example.containsAlcohol);

summary();
