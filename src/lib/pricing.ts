/**
 * Tarification serveur.
 *
 * Le client n'envoie jamais de prix. Il envoie un identifiant d'article, un
 * identifiant de variante et une quantité, rien d'autre. Tout montant est
 * résolu ici depuis src/config/menu.ts. C'est le seul chemin autorisé pour
 * construire les lignes d'une session Stripe et les lignes d'une commande.
 */

import {
  getItem,
  getVariant,
  isOrderable,
  priceFor,
  type Allergen,
  type DietaryTag,
  type MenuItem,
} from "@/config/menu";
import { deliveryFeeCents, type FulfilmentMode } from "@/config/zones";
import { referralDiscountCents } from "@/config/referral";

/** Doit rester aligné sur la contrainte quantity de order_items. */
export const MAX_LINE_QUANTITY = 50;

/**
 * Tout ce que le client a le droit d'envoyer. Volontairement dépourvu de
 * montant: ajouter un prix ici serait la faille.
 */
export interface CartLineInput {
  itemId: string;
  variantId?: string;
  quantity: number;
}

/**
 * Résultat tarifé, en lecture seule.
 *
 * `readonly` partout, y compris sur les tableaux: entre le calcul du prix et
 * l'appel à Stripe, plus rien ne doit pouvoir toucher un montant. Le compilateur
 * l'interdit désormais, ce n'est plus une règle de relecture.
 */
export interface PricedLine {
  readonly itemId: string;
  readonly itemName: string;
  readonly variantId: string | null;
  readonly variantName: string | null;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
  readonly allergens: readonly Allergen[];
  readonly tags: readonly DietaryTag[];
  readonly containsAlcohol: boolean;
}

export interface PricedOrder {
  readonly lines: readonly PricedLine[];
  readonly subtotalCents: number;
  readonly referralDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly totalCents: number;
  /** Déclenche la case de confirmation d'âge au paiement. */
  readonly containsAlcohol: boolean;
}

/**
 * `message` est destiné au client et ne doit jamais contenir d'identifiant
 * technique. `detail` porte la précision utile au débogage et reste côté
 * serveur: il est journalisé, jamais renvoyé au navigateur.
 */
export class CartError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "CartError";
  }
}

function requireItem(itemId: string): MenuItem {
  const item = getItem(itemId);
  if (!item) {
    throw new CartError(
      "Un article de votre panier n'est plus au menu. Merci de le retirer.",
      "item_inconnu",
      `identifiant absent du menu: ${itemId}`,
    );
  }
  if (!isOrderable(item)) {
    throw new CartError(
      `L'article ${item.name} n'est pas disponible à la vente.`,
      "item_non_commandable",
    );
  }
  return item;
}

function requireQuantity(quantity: unknown, itemName: string): number {
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_LINE_QUANTITY
  ) {
    throw new CartError(
      `Quantité invalide pour ${itemName}.`,
      "quantite_invalide",
    );
  }
  return quantity;
}

/** Résout une ligne de panier en ligne tarifée, prix pris dans le menu. */
export function priceLine(input: CartLineInput): PricedLine {
  const item = requireItem(input.itemId);
  const quantity = requireQuantity(input.quantity, item.name);

  let variantId: string | null = null;
  let variantName: string | null = null;

  if (item.variants && item.variants.length > 0) {
    if (!input.variantId) {
      throw new CartError(
        `Une variante est requise pour ${item.name}.`,
        "variante_requise",
      );
    }
    const variant = getVariant(item, input.variantId);
    if (!variant) {
      throw new CartError(
        `Ce choix n'est plus proposé pour ${item.name}.`,
        "variante_inconnue",
        `variante inconnue pour ${item.id}: ${input.variantId}`,
      );
    }
    variantId = variant.id;
    variantName = variant.name;
  } else if (input.variantId) {
    throw new CartError(
      `${item.name} n'a pas de variante.`,
      "variante_inattendue",
    );
  }

  const unitPriceCents = priceFor(item, variantId ?? undefined);
  return {
    itemId: item.id,
    itemName: item.name,
    variantId,
    variantName,
    quantity,
    unitPriceCents,
    lineTotalCents: unitPriceCents * quantity,
    allergens: item.allergens,
    tags: item.tags,
    containsAlcohol: item.containsAlcohol === true,
  };
}

export interface PriceCartOptions {
  mode: FulfilmentMode;
  referralCode?: string | null;
}

/**
 * Tarifie un panier entier. Lève une CartError sur toute entrée invalide,
 * plutôt que d'ignorer silencieusement une ligne, pour qu'un panier corrompu
 * n'atteigne jamais Stripe.
 */
export function priceCart(
  input: CartLineInput[],
  { mode, referralCode }: PriceCartOptions,
): PricedOrder {
  if (!Array.isArray(input) || input.length === 0) {
    throw new CartError("Le panier est vide.", "panier_vide");
  }

  // Deux lignes portant le même article et la même variante sont fusionnées,
  // sinon la même commande pourrait dépasser la limite de quantité par ligne.
  const merged = new Map<string, CartLineInput>();
  for (const line of input) {
    const key = `${line.itemId}::${line.variantId ?? ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      merged.set(key, { ...line });
    }
  }

  const lines = [...merged.values()].map(priceLine);

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const discount = referralDiscountCents(referralCode, subtotalCents);
  const fee = deliveryFeeCents(mode, subtotalCents);

  return {
    lines,
    subtotalCents,
    referralDiscountCents: discount,
    deliveryFeeCents: fee,
    totalCents: subtotalCents - discount + fee,
    containsAlcohol: lines.some((line) => line.containsAlcohol),
  };
}
