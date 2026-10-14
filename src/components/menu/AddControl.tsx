"use client";

/**
 * Ajout au panier pour une ligne donnée, article ou variante.
 *
 * Un contrôle par variante plutôt qu'un sélecteur suivi d'un bouton: les deux
 * plateaux n'ont pas le même prix, et la variante choisie ne doit jamais être
 * un état caché que le client aurait à vérifier avant d'ajouter.
 *
 * C'est ici que le mouvement travaille le plus. Ajouter un article est le
 * geste central de la page, et la bascule du bouton vers le compteur est la
 * seule confirmation que le client reçoit: sans elle, il ne saurait pas si
 * son appui a porté.
 *
 * N'est rendu que sur un article réellement commandable. Un article épuisé
 * porte déjà la mention "Épuisé" sur sa fiche, et une boutique fermée porte
 * son bandeau: répéter "Indisponible" sous chacun des trente articles ne dit
 * rien de plus et noie la carte.
 */

import { AnimatePresence, motion } from "framer-motion";

import { useCart } from "@/lib/cart";
import { useMotionPresets } from "@/lib/motion";
import { MAX_LINE_QUANTITY } from "@/lib/pricing";

interface AddControlProps {
  itemId: string;
  variantId?: string | null;
  /** Nom lu par les lecteurs d'écran, variante comprise. */
  label: string;
}

const STEP_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-full border border-field bg-raised text-ink";

export function AddControl({
  itemId,
  variantId = null,
  label,
}: AddControlProps) {
  const { quantityOf, add, setQuantity, hydrated } = useCart();
  const { swap, digit, transition, spring, press } = useMotionPresets();
  const quantity = quantityOf(itemId, variantId);

  // Avant hydratation, la quantité réelle n'est pas encore connue. On rend le
  // bouton d'ajout, qui est de très loin l'état le plus fréquent, plutôt qu'un
  // gabarit vide qui ferait sauter la mise en page.
  const showAdd = !hydrated || quantity === 0;

  return (
    <div className="relative flex h-9 items-center justify-end">
      <AnimatePresence mode="popLayout" initial={false}>
        {showAdd ? (
          <motion.button
            key="add"
            type="button"
            onClick={() => add(itemId, variantId)}
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={transition}
            whileTap={press}
            className="label rounded-full border border-olive px-4 py-2 text-olive"
            aria-label={`Ajouter ${label} au panier`}
          >
            Ajouter
          </motion.button>
        ) : (
          <motion.div
            key="stepper"
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={transition}
            className="flex items-center gap-1"
          >
            <motion.button
              type="button"
              onClick={() => setQuantity(itemId, variantId, quantity - 1)}
              whileTap={press}
              className={STEP_BUTTON}
              aria-label={
                quantity === 1 ? `Retirer ${label} du panier` : `Retirer un ${label}`
              }
            >
              <span aria-hidden="true">&minus;</span>
            </motion.button>

            {/*
             * Largeur fixe et chasse tabulaire: le passage de 9 à 10 ne doit
             * pas déplacer les boutons de part et d'autre.
             */}
            <span className="relative block h-6 w-7 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={quantity}
                  variants={digit}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={spring}
                  className="tabular absolute inset-0 flex items-center justify-center text-body font-medium"
                >
                  {quantity}
                </motion.span>
              </AnimatePresence>
              <span className="sr-only" aria-live="polite">
                {quantity} {label} au panier
              </span>
            </span>

            <motion.button
              type="button"
              onClick={() => add(itemId, variantId)}
              disabled={quantity >= MAX_LINE_QUANTITY}
              whileTap={press}
              className={`${STEP_BUTTON} disabled:opacity-35`}
              aria-label={`Ajouter un ${label}`}
            >
              <span aria-hidden="true">+</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
