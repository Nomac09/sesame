"use client";

import { useEffect } from "react";

import { useCart } from "@/lib/cart";

/**
 * Vide le panier une fois la commande enregistrée.
 *
 * Monté seulement quand une commande a bien été retrouvée. Vider le panier sur
 * un simple retour de Stripe, sans vérifier que la commande existe, ferait
 * perdre son panier à un client revenu par erreur sur cette page.
 */
export function ClearCart() {
  const { clear, hydrated } = useCart();

  useEffect(() => {
    if (hydrated) clear();
  }, [hydrated, clear]);

  return null;
}
