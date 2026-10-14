/**
 * État d'exploitation, sous une forme transmissible au navigateur.
 *
 * `StoreState` porte un `ReadonlySet`, qui ne traverse pas la frontière
 * serveur/client. Ce type plat est ce que les Server Components passent en
 * props aux composants clients. Il ne contient que ce que la vitrine a besoin
 * de savoir pour afficher, jamais pour décider: la décision d'accepter une
 * commande est reprise côté serveur par assertOrderable().
 */

export interface Availability {
  storeOpen: boolean;
  deliveryEnabled: boolean;
  /** Articles marqués épuisés. Absent de la liste = disponible. */
  unavailableItemIds: string[];
  /** L'état n'a pas pu être lu. La vitrine se comporte comme fermée. */
  degraded: boolean;
}

export function isAvailable(
  availability: Availability,
  itemId: string,
): boolean {
  return !availability.unavailableItemIds.includes(itemId);
}

/** Vrai si la vitrine peut proposer d'ajouter au panier et de commander. */
export function canOrder(availability: Availability): boolean {
  return availability.storeOpen && !availability.degraded;
}
