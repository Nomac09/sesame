"use client";

/**
 * Vocabulaire de mouvement.
 *
 * Deux règles gouvernent tout ce fichier.
 *
 * 1. Le mouvement récompense une action, il ne raconte pas l'arrivée d'une
 *    page. Ajouter au panier, ouvrir le panier, choisir un créneau, passer
 *    d'une étape à l'autre: ces gestes méritent une réponse. La carte, elle,
 *    s'affiche d'un coup. Un client qui a faim ne doit pas attendre qu'un
 *    article apparaisse en fondu pour pouvoir le toucher.
 *
 * 2. `prefers-reduced-motion` n'est pas un repli, c'est un chemin de premier
 *    plan. Chaque preset ci-dessous existe en deux versions, et la version
 *    réduite ne se contente pas d'accélérer: elle retire le déplacement et ne
 *    garde que l'opacité, comme l'exige le cahier des charges.
 *
 * Les composants ne rédigent pas de variantes à la main, ils prennent un
 * preset ici. C'est ce qui garantit qu'aucune animation n'échappe au contrôle
 * de la préférence système.
 */

import { useReducedMotion, type Transition, type Variants } from "framer-motion";

/** Courbe unique pour toute la vitrine. Sortie franche, arrivée posée. */
export const EASE: Transition["ease"] = [0.2, 0, 0, 1];

export const DURATION = {
  /** Réponse à un appui: doit paraître instantanée. */
  tap: 0.14,
  /** Apparition ou disparition d'un élément d'interface. */
  base: 0.22,
  /** Panneau qui s'ouvre, changement d'étape. */
  panel: 0.3,
} as const;

/** Ressort court, pour les compteurs et les bascules de bouton. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 34,
  mass: 0.7,
};

export interface MotionPresets {
  /** Vrai si le système demande moins de mouvement. */
  reduced: boolean;
  /** Barre de panier entrant par le bas. */
  cartBar: Variants;
  /** Panneau dépliable: contenu du panier, champs conditionnels. */
  panel: Variants;
  /** Échange de deux contenus au même endroit, par exemple Ajouter -> compteur. */
  swap: Variants;
  /** Chiffre qui change: quantité, total. */
  digit: Variants;
  /** Message d'erreur qui apparaît sous un champ. */
  notice: Variants;
  /** Transition à appliquer aux presets ci-dessus. */
  transition: Transition;
  /** Ressort, ou transition plate si le mouvement est réduit. */
  spring: Transition;
  /**
   * Retour tactile sur un bouton. Vide quand le mouvement est réduit: un
   * changement d'échelle n'a pas d'équivalent en opacité, donc il disparaît
   * plutôt que d'être remplacé.
   */
  press: { scale: number } | undefined;
}

export function useMotionPresets(): MotionPresets {
  const reduced = useReducedMotion() ?? false;

  const transition: Transition = reduced
    ? { duration: DURATION.tap, ease: "linear" }
    : { duration: DURATION.base, ease: EASE };

  if (reduced) {
    // Une seule forme, en opacité pure, pour tous les presets. Aucun
    // déplacement, aucune échelle, aucune hauteur animée.
    const fade: Variants = {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    };

    return {
      reduced,
      cartBar: fade,
      panel: fade,
      swap: fade,
      digit: fade,
      notice: fade,
      transition,
      spring: transition,
      press: undefined,
    };
  }

  return {
    reduced,
    cartBar: {
      hidden: { y: "100%" },
      visible: { y: 0 },
      exit: { y: "100%" },
    },
    panel: {
      hidden: { opacity: 0, height: 0 },
      visible: { opacity: 1, height: "auto" },
      exit: { opacity: 0, height: 0 },
    },
    swap: {
      hidden: { opacity: 0, scale: 0.92 },
      visible: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.92 },
    },
    digit: {
      hidden: { opacity: 0, y: 8 },
      visible: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -8 },
    },
    notice: {
      hidden: { opacity: 0, y: -4 },
      visible: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -4 },
    },
    transition,
    spring: SPRING,
    press: { scale: 0.96 },
  };
}
