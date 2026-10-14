import "server-only";

import { publicClient } from "@/lib/supabase/server";
import { getItem } from "@/config/menu";
import type { FulfilmentMode } from "@/config/zones";

/**
 * État d'exploitation, lu par la vitrine à chaque chargement de page.
 *
 * Trois informations, toutes modifiables depuis l'admin sans redéploiement:
 * la boutique est ouverte ou non, la livraison est proposée ou non, et la
 * liste des articles épuisés du jour.
 *
 * Volontairement non mis en cache. Le cahier des charges demande un effet
 * immédiat: mettre un article en rupture doit le retirer du panier suivant,
 * pas au bout d'une minute. La base est en us-east-1 et les fonctions en
 * cdg1, donc chaque aller-retour coûte cher: les deux lectures partent
 * ensemble et ne comptent que pour un aller-retour.
 */

export interface StoreState {
  storeOpen: boolean;
  deliveryEnabled: boolean;
  /** Articles explicitement marqués indisponibles. Absent = disponible. */
  unavailableItemIds: ReadonlySet<string>;
  /**
   * Vrai si l'état n'a pas pu être lu. On ferme alors par sécurité: prendre
   * une commande que la cuisine ne verra pas est pire que refuser une
   * commande pendant une panne.
   */
  degraded: boolean;
}

const CLOSED_ON_ERROR: StoreState = {
  storeOpen: false,
  deliveryEnabled: false,
  unavailableItemIds: new Set(),
  degraded: true,
};

export async function getStoreState(): Promise<StoreState> {
  const supabase = publicClient();

  try {
    const [settings, availability] = await Promise.all([
      supabase.from("settings").select("key, enabled"),
      // Seules les lignes indisponibles voyagent: un article absent de la
      // table est disponible, donc la liste reste courte même si la carte
      // s'allonge.
      supabase.from("item_availability").select("item_id").eq("available", false),
    ]);

    if (settings.error) throw settings.error;
    if (availability.error) throw availability.error;

    const flags = new Map(
      (settings.data ?? []).map((row) => [row.key, row.enabled]),
    );

    return {
      // Un réglage absent est traité comme désactivé. Une ligne manquante est
      // une anomalie, et l'anomalie ne doit pas ouvrir la boutique.
      storeOpen: flags.get("store_open") === true,
      deliveryEnabled: flags.get("delivery_enabled") === true,
      unavailableItemIds: new Set(
        (availability.data ?? []).map((row) => row.item_id),
      ),
      degraded: false,
    };
  } catch (error) {
    console.error("[store-state] lecture impossible, fermeture par sécurité", error);
    return CLOSED_ON_ERROR;
  }
}

export function isItemAvailable(state: StoreState, itemId: string): boolean {
  return !state.unavailableItemIds.has(itemId);
}

/** Modes de retrait proposables, dans l'ordre d'affichage. */
export function availableModes(state: StoreState): FulfilmentMode[] {
  if (!state.storeOpen) return [];
  return state.deliveryEnabled ? ["livraison", "retrait"] : ["retrait"];
}

export function isModeAllowed(
  state: StoreState,
  mode: FulfilmentMode,
): boolean {
  return availableModes(state).includes(mode);
}

export class StoreClosedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "StoreClosedError";
  }
}

/**
 * Contrôle serveur avant toute création de session Stripe.
 *
 * Rejoue les mêmes règles que la vitrine, parce que l'état a pu changer entre
 * l'affichage de la page et l'envoi du formulaire, et parce qu'un panier
 * fabriqué à la main ne passe par aucun rendu.
 */
export function assertOrderable(
  state: StoreState,
  mode: FulfilmentMode,
  itemIds: readonly string[],
): void {
  if (state.degraded) {
    throw new StoreClosedError(
      "Les commandes sont momentanément indisponibles. Merci de réessayer dans quelques minutes.",
      "etat_indisponible",
    );
  }
  if (!state.storeOpen) {
    throw new StoreClosedError(
      "La boutique est fermée pour le moment.",
      "boutique_fermee",
    );
  }
  if (!isModeAllowed(state, mode)) {
    throw new StoreClosedError(
      mode === "livraison"
        ? "La livraison est momentanément suspendue. Le retrait sur place reste possible."
        : "Ce mode de retrait n'est pas disponible.",
      "mode_indisponible",
    );
  }

  const unavailable = itemIds.filter((id) => !isItemAvailable(state, id));
  if (unavailable.length > 0) {
    // Le message nomme les articles tels qu'ils figurent sur la carte. Un
    // identifiant technique comme "mezze-mix" ne veut rien dire pour un client.
    const names = unavailable.map((id) => getItem(id)?.name ?? id);
    throw new StoreClosedError(
      names.length === 1
        ? `${names[0]} n'est plus disponible aujourd'hui.`
        : `Ces articles ne sont plus disponibles: ${names.join(", ")}.`,
      "article_epuise",
    );
  }
}
