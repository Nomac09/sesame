/**
 * Zone de livraison, frais, horaires et créneaux.
 *
 * Tous les montants en centimes entiers. Toutes les heures en Europe/Paris,
 * exprimées en minutes depuis minuit.
 */

export const TIMEZONE = "Europe/Paris";

export interface DeliveryZone {
  postcode: string;
  /** Commune renvoyée au client une fois le code postal validé. */
  commune: string;
}

/** Les seuls codes postaux livrés. Ailleurs, on propose le retrait. */
export const DELIVERY_ZONES: DeliveryZone[] = [
  { postcode: "59910", commune: "Bondues" },
  { postcode: "59700", commune: "Marcq-en-Barœul" },
  { postcode: "59290", commune: "Wasquehal" },
  { postcode: "59650", commune: "Villeneuve-d'Ascq" },
  { postcode: "59000", commune: "Lille" },
];

/** Frais de livraison, en centimes. */
export const DELIVERY_FEE_CENTS: number | null = 350;

/**
 * Sous-total à partir duquel la livraison est offerte, en centimes.
 * null signifie qu'aucun seuil n'est appliqué.
 */
export const FREE_DELIVERY_THRESHOLD_CENTS: number | null = 3000;

/** La livraison ne peut être proposée que si le tarif est renseigné. */
export const DELIVERY_PRICING_CONFIGURED: boolean = DELIVERY_FEE_CENTS !== null;

export type FulfilmentMode = "livraison" | "retrait";

export function isInDeliveryZone(postcode: string): boolean {
  return DELIVERY_ZONES.some(
    (zone) => zone.postcode === normalisePostcode(postcode),
  );
}

export function findZone(postcode: string): DeliveryZone | undefined {
  const normalised = normalisePostcode(postcode);
  return DELIVERY_ZONES.find((zone) => zone.postcode === normalised);
}

/** Retire les espaces, pour que "59 910" valide comme "59910". */
export function normalisePostcode(input: string): string {
  return input.replace(/\s/g, "");
}

/**
 * Échoue bruyamment si une commande en livraison est tentée sans tarif défini.
 * Appelé côté serveur avant toute création de session Stripe, pour qu'aucune
 * commande ne parte avec des frais devinés.
 */
export function requireDeliveryFeeCents(): number {
  if (DELIVERY_FEE_CENTS === null) {
    throw new Error(
      "Frais de livraison non configurés. La livraison reste indisponible tant que DELIVERY_FEE_CENTS n'est pas renseigné.",
    );
  }
  return DELIVERY_FEE_CENTS;
}

export function deliveryFeeCents(
  mode: FulfilmentMode,
  subtotalCents: number,
): number {
  if (mode === "retrait") return 0;
  const fee = requireDeliveryFeeCents();
  if (
    FREE_DELIVERY_THRESHOLD_CENTS !== null &&
    subtotalCents >= FREE_DELIVERY_THRESHOLD_CENTS
  ) {
    return 0;
  }
  return fee;
}

/** Une fenêtre de service, en minutes depuis minuit. */
export interface OpeningWindow {
  opensAt: number;
  closesAt: number;
}

const HM = (hours: number, minutes = 0) => hours * 60 + minutes;

const SERVICE_MIDI: OpeningWindow = { opensAt: HM(11), closesAt: HM(15) };
const SERVICE_SOIR: OpeningWindow = { opensAt: HM(18), closesAt: HM(23) };

/**
 * Fenêtres de service par jour, indexées par jour JS (0 = dimanche).
 * Un tableau vide signifie fermé. Plusieurs fenêtres par jour sont la norme
 * ici, pas l'exception: deux services, midi et soir.
 */
export const OPENING_HOURS: OpeningWindow[][] = [
  [SERVICE_MIDI, SERVICE_SOIR], // dimanche
  [], // lundi, fermé
  [SERVICE_MIDI, SERVICE_SOIR], // mardi
  [SERVICE_MIDI, SERVICE_SOIR], // mercredi
  [SERVICE_MIDI, SERVICE_SOIR], // jeudi
  [SERVICE_MIDI, SERVICE_SOIR], // vendredi
  [SERVICE_MIDI, SERVICE_SOIR], // samedi
];

/** Fenêtres de service d'un jour donné. Tableau vide si fermé. */
export function windowsForDay(jsDay: number): OpeningWindow[] {
  return OPENING_HOURS[jsDay] ?? [];
}

export function isClosedOn(jsDay: number): boolean {
  return windowsForDay(jsDay).length === 0;
}

/** Vrai si l'heure donnée, en minutes depuis minuit, tombe dans un service. */
export function isWithinService(jsDay: number, minutes: number): boolean {
  return windowsForDay(jsDay).some(
    (window) => minutes >= window.opensAt && minutes < window.closesAt,
  );
}

/** Durée d'un créneau de livraison ou de retrait, en minutes. */
export const SLOT_MINUTES = 30;

/** Temps de préparation minimum avant le début du premier créneau proposé. */
export const LEAD_TIME_MINUTES = 20;

/** Nombre de jours proposés dans le sélecteur. 2 = aujourd'hui et demain. */
export const SLOT_DAYS_AHEAD = 2;

/** Affiché sur la page de confirmation et dans l'email. */
export const COLLECTION_ADDRESS_LABEL = "Retrait sur place, Bondues";

/** Libellés des jours, pour l'en-tête du sélecteur de créneaux. */
export const DAY_LABELS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;
