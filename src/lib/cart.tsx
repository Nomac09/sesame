"use client";

/**
 * État du panier, côté client.
 *
 * Le panier ne contient que des identifiants d'article, des identifiants de
 * variante et des quantités. Jamais un prix. C'est la même règle que
 * `CartLineInput` dans src/lib/pricing.ts, et c'est volontaire: le panier est
 * la seule structure qui traverse le navigateur, donc la seule qu'un client
 * pourrait fabriquer à la main. Elle ne doit rien porter de monétaire.
 *
 * Les montants affichés sont recalculés à l'écran depuis src/config/menu.ts, à
 * titre indicatif. Le montant qui fait foi est celui que le serveur recalcule
 * au paiement.
 *
 * Le stockage et la revalidation du panier restauré vivent dans
 * cart-storage.ts, qui est testable sans rendu.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import { MAX_LINE_QUANTITY } from "@/lib/pricing";
import {
  getCartServerSnapshot,
  getCartSnapshot,
  getLoadedServerSnapshot,
  getLoadedSnapshot,
  lineKey,
  setCart,
  subscribeCart,
  type CartLine,
} from "@/lib/cart-storage";

export type { CartLine } from "@/lib/cart-storage";
export { lineKey } from "@/lib/cart-storage";

interface CartContextValue {
  lines: CartLine[];
  /** Faux tant que le panier stocké n'a pas été lu, pour ne rien afficher de faux. */
  hydrated: boolean;
  /** Nombre total d'articles, toutes lignes confondues. */
  count: number;
  quantityOf(itemId: string, variantId: string | null): number;
  add(itemId: string, variantId: string | null): void;
  setQuantity(itemId: string, variantId: string | null, quantity: number): void;
  remove(itemId: string, variantId: string | null): void;
  clear(): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const lines = useSyncExternalStore(
    subscribeCart,
    getCartSnapshot,
    getCartServerSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribeCart,
    getLoadedSnapshot,
    getLoadedServerSnapshot,
  );

  const setQuantity = useCallback(
    (itemId: string, variantId: string | null, quantity: number) => {
      const key = lineKey(itemId, variantId);
      setCart((current) => {
        if (quantity < 1) {
          return current.filter(
            (line) => lineKey(line.itemId, line.variantId) !== key,
          );
        }

        const clamped = Math.min(MAX_LINE_QUANTITY, Math.floor(quantity));
        const exists = current.some(
          (line) => lineKey(line.itemId, line.variantId) === key,
        );
        if (!exists) return [...current, { itemId, variantId, quantity: clamped }];

        return current.map((line) =>
          lineKey(line.itemId, line.variantId) === key
            ? { ...line, quantity: clamped }
            : line,
        );
      });
    },
    [],
  );

  const add = useCallback((itemId: string, variantId: string | null) => {
    const key = lineKey(itemId, variantId);
    setCart((current) => {
      const exists = current.some(
        (line) => lineKey(line.itemId, line.variantId) === key,
      );
      if (!exists) return [...current, { itemId, variantId, quantity: 1 }];
      return current.map((line) =>
        lineKey(line.itemId, line.variantId) === key
          ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + 1) }
          : line,
      );
    });
  }, []);

  const remove = useCallback(
    (itemId: string, variantId: string | null) => setQuantity(itemId, variantId, 0),
    [setQuantity],
  );

  const clear = useCallback(() => setCart([]), []);

  const value = useMemo<CartContextValue>(() => {
    const quantities = new Map(
      lines.map((line) => [lineKey(line.itemId, line.variantId), line.quantity]),
    );
    return {
      lines,
      hydrated,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      quantityOf: (itemId, variantId) =>
        quantities.get(lineKey(itemId, variantId)) ?? 0,
      add,
      setQuantity,
      remove,
      clear,
    };
  }, [lines, hydrated, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart doit être utilisé dans un CartProvider.");
  }
  return context;
}
