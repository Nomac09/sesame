"use client";

/**
 * Panier flottant.
 *
 * Le seul élément de la vitrine qui porte une ombre. Tout le reste est posé à
 * plat, réglé par des filets: l'ombre dit "ceci flotte au-dessus de la carte",
 * et n'a de sens que si elle est unique.
 *
 * Le mouvement sert deux gestes réels: la barre monte quand le panier cesse
 * d'être vide, le panneau se déplie quand on veut le détail. Rien ne bouge
 * sans qu'on l'ait demandé.
 *
 * Le total affiché est indicatif. Le serveur retarife au paiement et c'est son
 * montant qui est débité, donc la mention est explicite plutôt que
 * sous-entendue. Le mode n'étant choisi qu'à l'étape suivante, les frais de
 * livraison ne sont pas connus ici: on montre le sous-total des articles, pas
 * un total qui changerait en arrivant sur /commander.
 */

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { formatEuros } from "@/config/menu";
import { isAvailable, type Availability } from "@/lib/availability";
import { displayTotals } from "@/lib/cart-totals";
import { useCart } from "@/lib/cart";
import { useMotionPresets } from "@/lib/motion";

export function CartBar({ availability }: { availability: Availability }) {
  const { lines, hydrated, count, add, setQuantity, remove } = useCart();
  const { cartBar, panel, digit, transition, spring, press } = useMotionPresets();
  const [open, setOpen] = useState(false);

  const totals = displayTotals(lines, null);
  const soldOut = totals.lines.filter(
    (line) => !isAvailable(availability, line.itemId),
  );
  const blocked = soldOut.length > 0 || !availability.storeOpen;

  // Rien tant que le panier n'est pas lu: une barre qui apparaît puis
  // disparaît serait pire qu'une barre qui apparaît une fois.
  const visible = hydrated && count > 0;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="cart"
          variants={cartBar}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={transition}
          data-testid="barre-panier"
          className="rule-t fixed inset-x-0 bottom-0 z-30 bg-raised shadow-[0_-10px_28px_-14px_rgba(34,31,27,0.3)]"
        >
          <div className="mx-auto max-w-2xl">
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  key="panel"
                  variants={panel}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={transition}
                  className="overflow-hidden"
                >
                  <ul className="rule-b max-h-[50vh] overflow-y-auto px-4 py-3">
                    {totals.lines.map((line) => {
                      const available = isAvailable(availability, line.itemId);
                      return (
                        <li
                          key={`${line.itemId}::${line.variantId ?? ""}`}
                          className="flex items-start justify-between gap-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="font-display text-body text-ink">
                              {line.label}
                            </p>
                            {available ? (
                              // Chaîne construite en JS plutôt qu'assemblée
                              // en JSX: la transformation supprimait l'espace
                              // entre le montant et "l'unité", ce qui donnait
                              // "7,50 €l'unité" à l'écran.
                              <p className="tabular text-micro text-muted">
                                {`${formatEuros(line.unitPriceCents)} l'unité`}
                              </p>
                            ) : (
                              <p className="label mt-1 text-terracotta">
                                Épuisé, à retirer
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-3">
                            <span className="tabular text-body text-terracotta">
                              {formatEuros(line.lineTotalCents)}
                            </span>
                            {available ? (
                              <div className="flex items-center gap-1">
                                <motion.button
                                  type="button"
                                  whileTap={press}
                                  onClick={() =>
                                    setQuantity(
                                      line.itemId,
                                      line.variantId,
                                      line.quantity - 1,
                                    )
                                  }
                                  className="flex h-8 w-8 items-center justify-center rounded-full border border-field"
                                  aria-label={`Retirer un ${line.label}`}
                                >
                                  <span aria-hidden="true">&minus;</span>
                                </motion.button>
                                <span className="tabular w-5 text-center text-fine">
                                  {line.quantity}
                                </span>
                                <motion.button
                                  type="button"
                                  whileTap={press}
                                  onClick={() => add(line.itemId, line.variantId)}
                                  className="flex h-8 w-8 items-center justify-center rounded-full border border-field"
                                  aria-label={`Ajouter un ${line.label}`}
                                >
                                  <span aria-hidden="true">+</span>
                                </motion.button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => remove(line.itemId, line.variantId)}
                                className="label rounded-full border border-field px-3 py-1.5 text-muted"
                              >
                                Retirer
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/*
                   * Avertissement d'âge, article L3342-1 du code de la santé
                   * publique. Affiché dès que l'alcool entre dans le panier,
                   * et pas seulement à l'étape de paiement: un client doit
                   * savoir que sa commande sera soumise à un contrôle d'âge
                   * avant d'arriver au formulaire, pas en le découvrant sur la
                   * dernière page.
                   */}
                  {totals.containsAlcohol ? (
                    <p className="rule-b bg-sunken px-4 py-3 text-micro text-meat">
                      Votre panier contient de l&apos;alcool. La vente est
                      interdite aux mineurs de moins de dix-huit ans, article
                      L3342-1 du code de la santé publique. Une preuve
                      d&apos;âge peut être demandée à la remise.
                    </p>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              {/*
               * Nom accessible explicite. Sans lui, le nom du bouton serait la
               * concaténation de tout ce qu'il contient, du genre
               * "2 articles 15,00 € Détail", ce qui ne dit pas ce que l'appui
               * fait.
               */}
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex items-baseline gap-2 text-left"
                aria-expanded={open}
                aria-label={
                  open ? "Masquer le détail du panier" : "Voir le détail du panier"
                }
              >
                <span className="relative inline-block h-5 w-6 overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={count}
                      variants={digit}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={spring}
                      className="tabular absolute inset-0 font-display text-item text-ink"
                    >
                      {count}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="text-fine text-muted">
                  {count === 1 ? "article" : "articles"}
                </span>
                <span className="tabular text-fine text-terracotta">
                  {formatEuros(totals.subtotalCents)}
                </span>
                <span className="label text-muted">
                  {open ? "Fermer" : "Détail"}
                </span>
              </button>

              {blocked ? (
                <span className="label max-w-[9rem] text-right text-muted">
                  {availability.storeOpen
                    ? "Retirez les articles épuisés"
                    : "Commandes fermées"}
                </span>
              ) : (
                <Link
                  href="/commander"
                  className="label rounded-full bg-olive px-5 py-3 text-bone"
                >
                  Commander
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
