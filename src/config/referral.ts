/**
 * Referral codes. A `?code=` parameter is stored in a cookie and written to the
 * order row so QR codes printed on delivery bags are attributable.
 *
 * Every code is tracked for attribution. Only the codes listed in
 * FIRST_ORDER_CODES also carry a discount.
 */

export const REFERRAL_COOKIE = "sesame_ref";

/** Days the attribution cookie survives. */
export const REFERRAL_COOKIE_DAYS = 60;

export interface FirstOrderCode {
  code: string;
  /** Discount in integer cents. */
  discountCents: number;
  /** Shown as the discount line label in the cart. */
  label: string;
  /** Minimum basket subtotal for the code to apply, in integer cents. */
  minSubtotalCents: number;
}

/**
 * Aucun code de réduction actif.
 *
 * L'attribution reste en place: tout `?code=` est stocké en cookie puis écrit
 * sur la commande, ce qui rend les QR codes des sacs mesurables. Seule la
 * remise a été retirée. SAC5 était un placeholder, supprimé volontairement:
 * une remise de lancement sera définie plus tard, si elle est décidée.
 */
export const FIRST_ORDER_CODES: FirstOrderCode[] = [];

/** Codes are matched case-insensitively and stored uppercase. */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Le paramètre `codes` n'existe que pour les tests: il permet d'éprouver les
 * garde-fous contre une liste non vide sans jamais activer une remise en
 * production. En dehors des tests, il n'est jamais fourni.
 */
export function findFirstOrderCode(
  code: string | undefined | null,
  codes: readonly FirstOrderCode[] = FIRST_ORDER_CODES,
): FirstOrderCode | undefined {
  if (!code) return undefined;
  const normalised = normaliseCode(code);
  return codes.find((entry) => entry.code === normalised);
}

/**
 * Remise pour un code donné, en centimes.
 *
 * Renvoie 0 pour un code inconnu, qui reste malgré tout enregistré sur la
 * commande: l'attribution ne dépend pas de l'existence d'une remise.
 */
export function referralDiscountCents(
  code: string | undefined | null,
  subtotalCents: number,
  codes: readonly FirstOrderCode[] = FIRST_ORDER_CODES,
): number {
  const entry = findFirstOrderCode(code, codes);
  if (!entry) return 0;
  if (subtotalCents < entry.minSubtotalCents) return 0;
  // Jamais plus que le panier: une remise ne doit pas produire un total négatif.
  return Math.min(entry.discountCents, subtotalCents);
}
