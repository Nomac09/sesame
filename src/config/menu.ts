/**
 * Single source of truth for the menu.
 *
 * Prices are the prices the customer pays, in integer cents. There is no
 * platform comparison and no derived discount: what is written here is what is
 * charged. No component may hardcode a price, a name, or an allergen.
 */

export type Allergen =
  | "sesame"
  | "gluten"
  | "lait"
  | "fruits-a-coque"
  | "sulfites";

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  sesame: "sésame",
  gluten: "gluten",
  lait: "lait",
  "fruits-a-coque": "fruits à coque",
  sulfites: "sulfites",
};

/**
 * Affiché à la place de la liste d'allergènes quand celle-ci n'est pas encore
 * établie. Une ligne vide se lirait comme "aucun allergène", ce qui serait une
 * affirmation, pas une absence d'information.
 */
export const ALLERGENS_PENDING_LABEL = "Allergènes en cours de confirmation";

/** Tags shown on every item card, never behind a modal. */
export type DietaryTag =
  | "vegetalien"
  | "sans-gluten"
  | "contient-du-lait"
  | "non-vegetalien";

export const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetalien: "Végétalien",
  "sans-gluten": "Sans gluten",
  "contient-du-lait": "Contient du lait",
  "non-vegetalien": "Non végétalien",
};

export type CategoryId =
  | "mezzes"
  | "frit"
  | "sucre"
  | "plateaux"
  | "pains-sauces"
  | "boissons";

export interface MenuVariant {
  id: string;
  name: string;
  /** Price in integer cents. Omit to inherit the item price. */
  priceCents?: number;
  description?: string;
  /** Rendered with a marker. Used for the larger platter. */
  flagship?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  /** Price in integer cents. With variants, this is the entry price. */
  priceCents: number;
  /**
   * Nom du fichier photo dans le bucket menu-photos, extension comprise, par
   * exemple "houmous.jpg". Optionnel: un article sans photo s'affiche en texte
   * seul, sans emplacement réservé ni image de remplacement.
   *
   * Volontairement un nom de fichier et non une URL. L'adresse complète est
   * construite par photoUrl() dans src/lib/photos.ts, pour que le bucket
   * puisse changer sans réécrire la carte.
   */
  image?: string;
  allergens: Allergen[];
  /**
   * Les allergènes ne sont pas encore établis pour cet article. L'interface
   * affiche un état d'attente explicite au lieu d'une liste vide, qui se
   * lirait comme une absence d'allergènes.
   */
  allergensPending?: boolean;
  tags: DietaryTag[];
  signature?: boolean;
  /** Platter contents, rendered as a list. */
  contents?: string[];
  variants?: MenuVariant[];
  /** Drives the age-confirmation checkbox at checkout. */
  containsAlcohol?: boolean;
  /**
   * Boisson fermentée, bière ou vin. Retirée de la carte si la petite licence
   * à emporter n'est pas détenue. Voir PETITE_LICENCE_HELD.
   */
  requiresPetiteLicence?: boolean;
  /**
   * Spiritueux. Retiré de la carte si la grande licence n'est pas détenue.
   * La grande licence ne se déduit pas de la petite: voir GRANDE_LICENCE_HELD.
   */
  requiresGrandeLicence?: boolean;
}

export interface MenuCategory {
  id: CategoryId;
  name: string;
  note?: string;
  items: MenuItem[];
}

/**
 * Licences de vente d'alcool à emporter.
 *
 * Deux catégories, deux licences, deux drapeaux distincts:
 *
 * - bière et vin sont des boissons fermentées et relèvent de la petite licence
 *   à emporter;
 * - Arak, Ouzo et Pastis sont des spiritueux et relèvent de la grande licence,
 *   qui est une catégorie plus lourde et non incluse dans la précédente.
 *
 * Les deux sont confirmées auprès de la mairie, donc les deux drapeaux sont à
 * true et toute la carte des boissons est commandable. Ils restent séparés:
 * une licence peut être suspendue ou non renouvelée sans l'autre, et remettre
 * un drapeau à false doit suffire à retirer les articles concernés. Un article
 * ainsi retiré n'est pas masqué en CSS, il n'est pas envoyé au navigateur.
 */
export const PETITE_LICENCE_HELD = true;
export const GRANDE_LICENCE_HELD = true;

export const MENU: MenuCategory[] = [
  {
    id: "mezzes",
    name: "Mezzés",
    items: [
      {
        id: "houmous",
        name: "Houmous",
        description:
          "Purée de pois chiches, crème de sésame, jus de citron, filet d'huile d'olive, pois chiches entiers et persil.",
        priceCents: 750,
        allergens: ["sesame"],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "baba-ghanouj",
        name: "Baba ghanouj",
        description:
          "Caviar d'aubergine fumée, crème de sésame, citron, huile d'olive, grains de grenade et persil.",
        priceCents: 790,
        allergens: ["sesame"],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "taboule",
        name: "Taboulé",
        description:
          "Persil plat, tomate, oignon, menthe fraîche, boulgour fin, citron et huile d'olive.",
        priceCents: 750,
        allergens: ["gluten"],
        tags: ["vegetalien"],
      },
      {
        id: "fattouche",
        name: "Fattouche",
        description:
          "Salade verte, chou rouge et blanc, tomate, concombre, radis, menthe, sumac, citron, huile d'olive et pain palestinien croustillant.",
        priceCents: 850,
        allergens: ["gluten"],
        tags: ["vegetalien"],
      },
      {
        id: "feuilles-de-vigne",
        name: "Feuilles de vigne",
        description:
          "Six feuilles roulées à la main, riz, tomate, oignon et herbes. Recette palestinienne de la maison.",
        priceCents: 890,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
        signature: true,
      },
      {
        id: "zaitoun",
        name: "Zaitoun",
        description: "Olives marinées, herbes fraîches, citron et huile d'olive.",
        priceCents: 550,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "laban-khiar",
        name: "Laban khiar",
        description:
          "Yaourt épais, concombre, ail doux, menthe fraîche et huile d'olive.",
        priceCents: 650,
        allergens: ["lait"],
        tags: ["contient-du-lait", "sans-gluten"],
      },
      {
        id: "batonnets-concombre-carotte",
        name: "Bâtonnets concombre et carotte",
        description:
          "Bâtonnets frais de concombre et carotte, idéal pour accompagner les mezzés sans gluten.",
        priceCents: 450,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "boulgour-nature",
        name: "Boulgour nature",
        description: "Boulgour poêlé à l'oignon et au cumin.",
        priceCents: 450,
        allergens: ["gluten"],
        tags: ["vegetalien"],
      },
      {
        id: "moussaka",
        name: "Moussaka",
        description:
          "Aubergines mijotées à la sauce tomate avec pois chiches, ail et menthe.",
        priceCents: 790,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "tartare-vegetal",
        name: "Tartare végétal",
        description:
          "Boulgour fin, pâte de tomate, pâte de poivron, noix et épices, pétris à froid. Servi en feuilles de laitue.",
        priceCents: 790,
        // Fruits à coque confirmés: la recette contient des noix.
        allergens: ["gluten", "fruits-a-coque"],
        tags: ["vegetalien"],
      },
      {
        id: "croustis-legumes",
        name: "Croustis légumes",
        description: "Petits feuilletés aux épinards, cuits au four. 3 pièces.",
        priceCents: 690,
        allergens: ["gluten"],
        tags: ["vegetalien"],
      },
    ],
  },
  {
    id: "frit",
    name: "Frit à la commande",
    items: [
      {
        id: "kubbeh",
        name: "Kubbeh",
        description:
          "Croquettes de blé concassé farcies de viande et pignons, frites à la commande. 2 pièces.",
        priceCents: 890,
        allergens: ["gluten"],
        tags: ["non-vegetalien"],
      },
      {
        id: "croustis-fromage",
        name: "Croustis fromage",
        description:
          "Rouleaux de feuille de brick farcis au fromage, frits à la commande. 3 pièces.",
        priceCents: 750,
        allergens: ["gluten", "lait"],
        tags: ["contient-du-lait"],
      },
      {
        id: "falafel",
        name: "Falafel",
        description:
          "Boulettes de pois chiches, persil, coriandre et épices, frites à la commande. 5 pièces.",
        priceCents: 690,
        // Statut gluten dépendant du produit surgelé effectivement
        // approvisionné. Tant qu'il n'est pas vérifié contre l'emballage,
        // l'article affiche un état d'attente explicite plutôt qu'une liste
        // vide, qui se lirait comme "aucun allergène".
        allergens: [],
        allergensPending: true,
        tags: ["vegetalien"],
      },
    ],
  },
  {
    id: "sucre",
    name: "Sucré",
    items: [
      {
        id: "tamriyeh",
        name: "Tamriyeh",
        description: "Dattes Medjool farcies aux noix, filet de tahin. 3 pièces.",
        priceCents: 590,
        // Sésame confirmé: le tahin est du sésame.
        allergens: ["fruits-a-coque", "sesame"],
        tags: ["vegetalien"],
      },
    ],
  },
  {
    id: "plateaux",
    name: "Plateaux à partager",
    items: [
      {
        id: "mezze-mix",
        name: "Mezzé Mix",
        priceCents: 1920,
        contents: [
          "Houmous",
          "Baba ghanouj",
          "Taboulé",
          "Feuilles de vigne",
          "Falafel",
          "Croustis légumes",
          "Tamriyeh",
        ],
        allergens: ["sesame", "gluten", "fruits-a-coque"],
        tags: ["vegetalien"],
        variants: [
          {
            id: "pour-1",
            name: "Pour 1",
            priceCents: 1920,
            description: "Portions individuelles, servi avec un pain palestinien.",
          },
          {
            id: "pour-2-3",
            name: "Pour 2 à 3",
            priceCents: 3350,
            description: "Portions complètes, servi avec deux pains palestiniens.",
            flagship: true,
          },
        ],
      },
    ],
  },
  {
    id: "pains-sauces",
    name: "Pains et sauces",
    items: [
      {
        id: "pain-palestinien",
        name: "Pain palestinien",
        priceCents: 100,
        allergens: ["gluten"],
        tags: ["vegetalien"],
      },
      {
        id: "creme-sesame-citron",
        name: "Crème de sésame au citron",
        priceCents: 200,
        allergens: ["sesame"],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "creme-ail",
        name: "Crème d'ail",
        priceCents: 200,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "supplement-huile-zaatar",
        name: "Supplément huile d'olive et za'atar",
        priceCents: 150,
        // Sésame confirmé: le za'atar est un mélange sumac, thym et sésame.
        allergens: ["sesame"],
        tags: ["vegetalien"],
      },
      {
        id: "harissa-maison",
        name: "Harissa maison",
        priceCents: 200,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "supplement-grenade",
        name: "Supplément grains de grenade",
        priceCents: 150,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
    ],
  },
  {
    id: "boissons",
    name: "Boissons",
    items: [
      {
        id: "eau-plate",
        name: "Eau plate",
        description: "33 cl",
        priceCents: 190,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "eau-petillante",
        name: "Eau pétillante",
        description: "33 cl",
        priceCents: 220,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "soft",
        name: "Soft",
        description: "33 cl",
        priceCents: 320,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
        variants: [
          { id: "coca-cola", name: "Coca-Cola" },
          { id: "coca-zero", name: "Coca zero" },
          { id: "fanta", name: "Fanta" },
          { id: "sprite", name: "Sprite" },
        ],
      },
      {
        id: "ice-tea-peche",
        name: "Ice tea pêche",
        description: "33 cl",
        priceCents: 320,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "limonade",
        name: "Limonade",
        description: "33 cl",
        priceCents: 420,
        allergens: [],
        tags: ["vegetalien", "sans-gluten"],
      },
      {
        id: "biere-blonde",
        name: "Bière blonde",
        description: "33 cl",
        priceCents: 520,
        // Gluten confirmé: bière d'orge.
        allergens: ["gluten"],
        tags: ["vegetalien"],
        containsAlcohol: true,
        requiresPetiteLicence: true,
      },
      {
        id: "biere-ambree",
        name: "Bière ambrée du Nord",
        description: "33 cl",
        priceCents: 590,
        // Gluten confirmé: bière d'orge.
        allergens: ["gluten"],
        tags: ["vegetalien"],
        containsAlcohol: true,
        requiresPetiteLicence: true,
      },
      {
        id: "vin-rouge-libanais",
        name: "Vin rouge libanais, Bekaa",
        description: "75 cl",
        priceCents: 2490,
        allergens: ["sulfites"],
        tags: ["vegetalien"],
        containsAlcohol: true,
        requiresPetiteLicence: true,
      },
      {
        id: "arak-ouzo",
        name: "Arak / Ouzo",
        description: "70 cl",
        priceCents: 2990,
        allergens: [],
        tags: ["vegetalien"],
        containsAlcohol: true,
        requiresGrandeLicence: true,
      },
      {
        id: "pastis-ricard",
        name: "Pastis Ricard",
        description: "20 cl",
        priceCents: 1390,
        allergens: [],
        tags: ["vegetalien"],
        containsAlcohol: true,
        requiresGrandeLicence: true,
      },
    ],
  },
];

/** True when an item may be shown and ordered, given the licences held. */
export function isOrderable(item: MenuItem): boolean {
  if (item.requiresPetiteLicence && !PETITE_LICENCE_HELD) return false;
  if (item.requiresGrandeLicence && !GRANDE_LICENCE_HELD) return false;
  return true;
}

/**
 * The menu as the storefront should render it. Items gated behind a licence we
 * do not hold are removed here, once, rather than in each component.
 */
export const VISIBLE_MENU: MenuCategory[] = MENU.map((category) => ({
  ...category,
  items: category.items.filter(isOrderable),
})).filter((category) => category.items.length > 0);

/** Flat index of every item, including gated ones, for cart lookups by id. */
export const MENU_ITEMS: Record<string, MenuItem> = Object.fromEntries(
  MENU.flatMap((category) => category.items).map((item) => [item.id, item]),
);

export function getItem(id: string): MenuItem | undefined {
  return MENU_ITEMS[id];
}

export function getVariant(
  item: MenuItem,
  variantId: string,
): MenuVariant | undefined {
  return item.variants?.find((variant) => variant.id === variantId);
}

/** Price for an item, taking the chosen variant into account. */
export function priceFor(item: MenuItem, variantId?: string): number {
  if (!variantId) return item.priceCents;
  return getVariant(item, variantId)?.priceCents ?? item.priceCents;
}

/** Formats integer cents as a French price, e.g. 3350 -> "33,50 €". */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
