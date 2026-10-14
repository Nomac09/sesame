import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vocabulaire des commandes, partagé entre le serveur et le navigateur.
 *
 * Ce fichier n'importe rien de `server-only`: le flux de la cuisine est chargé
 * une première fois côté serveur, puis rechargé côté client à chaque événement
 * temps réel. Les deux chemins doivent lire exactement les mêmes colonnes,
 * sans quoi une commande arrivée en direct s'afficherait autrement qu'une
 * commande arrivée au chargement. D'où une seule requête, ici.
 */

export type OrderStatus =
  | "en_attente_paiement"
  | "paiement_echoue"
  | "confirmee"
  | "en_preparation"
  | "prete"
  | "livree"
  | "retiree"
  | "annulee";

export type FulfilmentMode = "livraison" | "retrait";

/**
 * Ce que la cuisine voit.
 *
 * `en_attente_paiement` et `paiement_echoue` sont exclus: une commande non
 * payée n'existe pas pour la cuisine, et l'afficher ferait cuisiner pour rien.
 */
export const FEED_STATUSES: OrderStatus[] = [
  "confirmee",
  "en_preparation",
  "prete",
  "livree",
  "retiree",
  "annulee",
];

/** Statuts qui demandent encore une action. */
export const ACTIVE_STATUSES: OrderStatus[] = [
  "confirmee",
  "en_preparation",
  "prete",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  en_attente_paiement: "En attente de paiement",
  paiement_echoue: "Paiement échoué",
  confirmee: "Confirmée",
  en_preparation: "En préparation",
  prete: "Prête",
  livree: "Livrée",
  retiree: "Retirée",
  annulee: "Annulée",
};

/**
 * Statut suivant et libellé du bouton.
 *
 * Le mode décide de la fin du parcours: une commande en livraison se termine
 * en `livree`, une commande en retrait en `retiree`. Le trigger de la base
 * refuse le contraire, donc proposer le mauvais bouton produirait une erreur
 * illisible plutôt qu'un simple refus.
 */
export function nextStep(
  status: OrderStatus,
  mode: FulfilmentMode,
): { target: OrderStatus; label: string } | null {
  switch (status) {
    case "confirmee":
      return { target: "en_preparation", label: "Commencer la préparation" };
    case "en_preparation":
      return { target: "prete", label: "Marquer prête" };
    case "prete":
      return mode === "livraison"
        ? { target: "livree", label: "Marquer livrée" }
        : { target: "retiree", label: "Marquer retirée" };
    default:
      return null;
  }
}

/** Vrai si la commande peut encore être annulée. */
export function isCancellable(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export interface AdminOrderLine {
  itemName: string;
  variantName: string | null;
  quantity: number;
  allergens: string[];
  containsAlcohol: boolean;
}

export interface AdminOrder {
  id: string;
  reference: string;
  status: OrderStatus;
  createdAt: string;
  statusChangedAt: string;
  confirmedAt: string | null;
  refundedAt: string | null;
  refundAmountCents: number | null;

  firstName: string;
  lastName: string;
  phone: string;
  email: string;

  mode: FulfilmentMode;
  addressLine: string | null;
  postcode: string | null;

  slotStart: string;
  slotEnd: string;

  subtotalCents: number;
  deliveryFeeCents: number;
  referralDiscountCents: number;
  totalCents: number;

  customerNote: string | null;
  lines: AdminOrderLine[];
}

/**
 * Colonnes lues par le flux. Les lignes du panier voyagent avec la commande,
 * en une seule requête: un bon de cuisine sans ses articles ne sert à rien, et
 * une requête par commande ferait autant d'allers-retours que de commandes.
 */
const FEED_SELECT = `
  id, reference, status, created_at, status_changed_at, confirmed_at,
  refunded_at, refund_amount_cents,
  first_name, last_name, phone, email,
  mode, address_line, postcode,
  slot_start, slot_end,
  subtotal_cents, delivery_fee_cents, referral_discount_cents, total_cents,
  customer_note,
  order_items ( item_name, variant_name, quantity, allergens, contains_alcohol )
`;

/**
 * Fenêtre du flux. Assez large pour couvrir un service oublié la veille,
 * assez courte pour que la page reste légère au bout d'un an d'activité.
 */
export const FEED_LIMIT = 80;

type Row = Record<string, unknown>;

function toOrder(row: Row): AdminOrder {
  const items = (row.order_items as Row[] | null) ?? [];

  return {
    id: row.id as string,
    reference: row.reference as string,
    status: row.status as OrderStatus,
    createdAt: row.created_at as string,
    statusChangedAt: row.status_changed_at as string,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
    refundedAt: (row.refunded_at as string | null) ?? null,
    refundAmountCents: (row.refund_amount_cents as number | null) ?? null,

    firstName: row.first_name as string,
    lastName: row.last_name as string,
    phone: row.phone as string,
    email: row.email as string,

    mode: row.mode as FulfilmentMode,
    addressLine: (row.address_line as string | null) ?? null,
    postcode: (row.postcode as string | null) ?? null,

    slotStart: row.slot_start as string,
    slotEnd: row.slot_end as string,

    subtotalCents: row.subtotal_cents as number,
    deliveryFeeCents: row.delivery_fee_cents as number,
    referralDiscountCents: row.referral_discount_cents as number,
    totalCents: row.total_cents as number,

    customerNote: (row.customer_note as string | null) ?? null,
    lines: items.map((item) => ({
      itemName: item.item_name as string,
      variantName: (item.variant_name as string | null) ?? null,
      quantity: item.quantity as number,
      allergens: (item.allergens as string[] | null) ?? [],
      containsAlcohol: Boolean(item.contains_alcohol),
    })),
  };
}

/**
 * Le flux, du plus récent au plus ancien.
 *
 * Le client passé en paramètre porte toujours la session de l'admin, jamais la
 * clé service_role: c'est la base qui décide de ce qui est lisible, via la
 * policy `admin_read_orders`. Un jour où l'email admin changerait sans que la
 * table suive, la page se viderait, ce qui est le bon échec.
 */
export async function fetchFeed(
  supabase: SupabaseClient,
): Promise<{ orders: AdminOrder[]; error: string | null }> {
  const { data, error } = await supabase
    .from("orders")
    .select(FEED_SELECT)
    .in("status", FEED_STATUSES)
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);

  if (error) return { orders: [], error: error.message };
  return { orders: ((data as Row[]) ?? []).map(toOrder), error: null };
}
