/**
 * Totaux indicatifs, pour l'affichage seulement.
 *
 * Ces montants sont recalculés dans le navigateur depuis src/config/menu.ts
 * pour que le client voie un total pendant qu'il compose son panier. Ils ne
 * sont jamais transmis: le serveur retarife intégralement au paiement, via
 * priceCart(), et c'est ce total-là qui est débité et enregistré.
 *
 * La remise de parrainage n'apparaît pas ici. Le code vit dans un cookie lu
 * côté serveur, donc le navigateur ne peut pas la connaître de façon fiable.
 * Une remise qui apparaît au paiement est une bonne surprise; une remise
 * annoncée puis retirée serait une mauvaise.
 */

import { getItem, getVariant, priceFor, type MenuItem } from "@/config/menu";
import { deliveryFeeCents, type FulfilmentMode } from "@/config/zones";
import type { CartLine } from "@/lib/cart-storage";

export interface DisplayLine {
  itemId: string;
  variantId: string | null;
  /** Nom tel qu'il figure sur la carte, variante comprise. */
  label: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  item: MenuItem;
}

export interface DisplayTotals {
  lines: DisplayLine[];
  subtotalCents: number;
  /** null en retrait, ou tant qu'aucun mode n'est choisi. */
  deliveryFeeCents: number | null;
  totalCents: number;
  containsAlcohol: boolean;
}

/** Nom affiché d'une ligne, variante comprise. */
export function displayLabel(item: MenuItem, variantId: string | null): string {
  if (!variantId) return item.name;
  const variant = getVariant(item, variantId);
  return variant ? `${item.name}, ${variant.name}` : item.name;
}

/**
 * Développe un panier en lignes affichables.
 *
 * Une ligne dont l'article a disparu de la carte est ignorée plutôt que rendue
 * avec un nom vide. Le panier est nettoyé au chargement, donc ce cas ne
 * devrait pas se produire; il reste traité pour ne jamais afficher un prix
 * fantôme.
 */
export function displayTotals(
  lines: readonly CartLine[],
  mode: FulfilmentMode | null,
): DisplayTotals {
  const display: DisplayLine[] = [];

  for (const line of lines) {
    const item = getItem(line.itemId);
    if (!item) continue;

    const unitPriceCents = priceFor(item, line.variantId ?? undefined);
    display.push({
      itemId: item.id,
      variantId: line.variantId,
      label: displayLabel(item, line.variantId),
      quantity: line.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * line.quantity,
      item,
    });
  }

  const subtotalCents = display.reduce((sum, line) => sum + line.lineTotalCents, 0);
  // Tant que le mode n'est pas choisi, les frais restent inconnus: afficher 0
  // laisserait croire à une livraison gratuite.
  const fee = mode === null ? null : deliveryFeeCents(mode, subtotalCents);

  return {
    lines: display,
    subtotalCents,
    deliveryFeeCents: fee,
    totalCents: subtotalCents + (fee ?? 0),
    containsAlcohol: display.some((line) => line.item.containsAlcohol === true),
  };
}
