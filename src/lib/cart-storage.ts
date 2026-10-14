/**
 * Persistance du panier et remise en état de confiance.
 *
 * Séparé du composant React pour deux raisons: c'est du code sans rendu, et
 * c'est le point d'entrée d'une donnée que le client contrôle entièrement.
 * Un panier vient de localStorage, donc il a pu être écrit par une version
 * précédente du site, ou modifié à la main. Il est revalidé contre la carte
 * avant d'être utilisé, exactement comme le serveur revalide au paiement.
 */

import { getItem, getVariant, isOrderable } from "@/config/menu";
import { MAX_LINE_QUANTITY } from "@/lib/pricing";

export interface CartLine {
  itemId: string;
  variantId: string | null;
  quantity: number;
}

export const STORAGE_KEY = "sesame_panier_v1";

/** Clé d'unicité d'une ligne. Même règle de fusion que priceCart(). */
export function lineKey(itemId: string, variantId: string | null): string {
  return `${itemId}::${variantId ?? ""}`;
}

/**
 * Filtre un panier restauré contre la carte du jour.
 *
 * Écarte silencieusement les lignes qu'un paiement refuserait de toute façon:
 * article retiré du menu, article soumis à une licence non détenue, variante
 * disparue, variante absente là où elle est requise, quantité aberrante. Mieux
 * vaut un panier amputé qu'un paiement qui échoue sur une ligne que le client
 * n'a pas choisie aujourd'hui.
 *
 * La disponibilité du jour n'est pas traitée ici: elle vient de la base, pas
 * de la carte, et un article épuisé reste affiché dans le panier avec un
 * bouton pour le retirer, plutôt que de disparaître sans explication.
 */
export function sanitiseCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];

  const merged = new Map<string, CartLine>();

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Record<string, unknown>;

    if (typeof candidate.itemId !== "string") continue;
    const item = getItem(candidate.itemId);
    if (!item || !isOrderable(item)) continue;

    const rawVariant =
      typeof candidate.variantId === "string" ? candidate.variantId : null;

    // Une variante est requise si et seulement si l'article en propose.
    let variantId: string | null = null;
    if (item.variants && item.variants.length > 0) {
      if (!rawVariant || !getVariant(item, rawVariant)) continue;
      variantId = rawVariant;
    } else if (rawVariant) {
      continue;
    }

    const quantity =
      typeof candidate.quantity === "number" && Number.isInteger(candidate.quantity)
        ? candidate.quantity
        : 0;
    if (quantity < 1) continue;

    const key = lineKey(item.id, variantId);
    const existing = merged.get(key);
    merged.set(key, {
      itemId: item.id,
      variantId,
      quantity: Math.min(MAX_LINE_QUANTITY, (existing?.quantity ?? 0) + quantity),
    });
  }

  return [...merged.values()];
}

function readCart(): CartLine[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? sanitiseCart(JSON.parse(stored)) : [];
  } catch {
    // Stockage indisponible ou contenu illisible: panier vide plutôt que page
    // cassée.
    return [];
  }
}

function writeCart(lines: readonly CartLine[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Navigation privée, quota atteint: le panier reste utilisable en mémoire.
  }
}

/**
 * Petit magasin externe, lu par useSyncExternalStore.
 *
 * localStorage est un système extérieur à React: le brancher ainsi, plutôt que
 * de recopier son contenu dans un état via un effet, évite le rendu en cascade
 * au montage et laisse React gérer lui-même la bascule entre le rendu serveur
 * et le rendu client.
 *
 * Les instantanés doivent être stables d'un appel à l'autre, sans quoi
 * useSyncExternalStore boucle: `cache` n'est remplacé que dans setCart.
 */
const EMPTY: CartLine[] = [];

let cache: CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

// Lecture au chargement du module, donc avant tout rendu: le rendu lui-même
// reste pur. Sans fenêtre, on est côté serveur et le panier reste vide.
if (typeof window !== "undefined") {
  cache = readCart();
  loaded = true;
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCartSnapshot(): CartLine[] {
  return cache;
}

export function getLoadedSnapshot(): boolean {
  return loaded;
}

/**
 * Instantanés du rendu serveur, utilisés aussi pendant l'hydratation. Ils
 * décrivent l'état que le HTML porte réellement: panier vide, pas encore lu.
 */
export function getCartServerSnapshot(): CartLine[] {
  return EMPTY;
}

export function getLoadedServerSnapshot(): boolean {
  return false;
}

/** Seul chemin de modification: écrit, puis prévient les abonnés. */
export function setCart(
  update: CartLine[] | ((current: CartLine[]) => CartLine[]),
): void {
  const next = typeof update === "function" ? update(cache) : update;
  if (next === cache) return;
  cache = next;
  writeCart(next);
  for (const listener of listeners) listener();
}
