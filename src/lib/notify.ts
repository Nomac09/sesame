import "server-only";

import { Resend } from "resend";

import {
  LEGAL,
  mediatorLines,
  nationalPhone,
  vatMention,
} from "@/config/legal";
import { formatEuros } from "@/config/menu";
import { COLLECTION_ADDRESS_LABEL } from "@/config/zones";
import { formatSlotRange, type Slot } from "@/lib/schedule";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Notifications de commande.
 *
 * Deux envois indépendants: le bon de cuisine et la confirmation client. Ils ne
 * se bloquent pas l'un l'autre, un email client refusé ne doit pas priver la
 * cuisine de son ticket.
 *
 * Le transport est derrière une interface pour qu'il puisse devenir Telegram
 * plus tard sans toucher au webhook. Sans RESEND_API_KEY, on retombe sur la
 * console: en développement, mieux vaut voir le message que d'échouer.
 *
 * Rien ici ne lève jamais. Une commande payée reste payée même si l'envoi
 * échoue; l'échec est renvoyé à l'appelant, qui l'enregistre.
 */

export interface NotifiableItem {
  itemName: string;
  variantName: string | null;
  quantity: number;
  lineTotalCents: number;
  allergens: string[];
  containsAlcohol: boolean;
}

export interface NotifiableOrder {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  mode: "livraison" | "retrait";
  addressLine: string | null;
  postcode: string | null;
  slotStart: string;
  slotEnd: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  customerNote: string | null;
  items: NotifiableItem[];
}

/**
 * Ce qu'il faut savoir pour annoncer une annulation.
 *
 * `refundedCents` à null signifie qu'aucun paiement n'avait été encaissé, et
 * non qu'un remboursement a échoué: la cuisine ne peut annuler une commande
 * payée qu'après un remboursement Stripe réussi. Les deux cas donnent deux
 * phrases différentes, et se tromper de phrase serait grave dans les deux
 * sens.
 */
export interface CancellationDetails {
  refundedCents: number | null;
}

export interface NotificationTransport {
  readonly name: string;
  sendKitchenTicket(order: NotifiableOrder): Promise<void>;
  sendCustomerConfirmation(order: NotifiableOrder): Promise<void>;
  sendReadyNotice(order: NotifiableOrder): Promise<void>;
  sendCancellationNotice(
    order: NotifiableOrder,
    details: CancellationDetails,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

function slotLabel(order: NotifiableOrder): string {
  const slot: Slot = {
    start: new Date(order.slotStart),
    end: new Date(order.slotEnd),
  };
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(slot.start);
  return `${day}, ${formatSlotRange(slot)}`;
}

function itemLines(order: NotifiableOrder): string {
  return order.items
    .map((item) => {
      const name = item.variantName
        ? `${item.itemName} (${item.variantName})`
        : item.itemName;
      const allergens = item.allergens.length
        ? `  [${item.allergens.join(", ")}]`
        : "";
      return `  ${item.quantity} x ${name}${allergens}  ${formatEuros(item.lineTotalCents)}`;
    })
    .join("\n");
}

/**
 * Adresse de retrait, en toutes lettres.
 *
 * COLLECTION_ADDRESS_LABEL dit "Retrait sur place, Bondues", ce qui suffit à
 * l'écran mais pas dans un email: les CGV annoncent que l'adresse exacte
 * figure dans la confirmation, et un client ne doit pas avoir à la chercher
 * dans les mentions légales le soir où il vient chercher sa commande.
 */
function collectionAddress(): string {
  return LEGAL.address ?? COLLECTION_ADDRESS_LABEL;
}

function fulfilmentBlock(order: NotifiableOrder): string {
  if (order.mode === "livraison") {
    return `Livraison\n  ${order.addressLine}\n  ${order.postcode}`;
  }
  return `Retrait sur place\n  ${collectionAddress()}`;
}

export function kitchenTicketText(order: NotifiableOrder): string {
  const alcohol = order.items.some((item) => item.containsAlcohol)
    ? "\nContient de l'alcool: contrôle d'âge à la remise.\n"
    : "";
  const note = order.customerNote ? `\nNote du client:\n  ${order.customerNote}\n` : "";
  return [
    `Commande ${order.reference}`,
    "",
    slotLabel(order),
    "",
    fulfilmentBlock(order),
    "",
    `${order.firstName} ${order.lastName}`,
    `  ${order.phone}`,
    "",
    "Articles",
    itemLines(order),
    "",
    order.deliveryFeeCents > 0
      ? `Sous-total  ${formatEuros(order.subtotalCents)}\nLivraison   ${formatEuros(order.deliveryFeeCents)}`
      : `Sous-total  ${formatEuros(order.subtotalCents)}`,
    `Total       ${formatEuros(order.totalCents)}  (payé en ligne)`,
    alcohol,
    note,
  ].join("\n");
}

/**
 * Pied de facture.
 *
 * Cet email est la facture du client: c'est le seul document qu'il reçoit, et
 * il doit donc porter l'identité du vendeur et la mention fiscale applicable.
 *
 * L'entreprise relève de la franchise en base, donc la mention de l'article
 * 293 B remplace toute information de TVA. Il n'y a ni ligne de TVA, ni
 * ventilation "dont TVA", ni découpage HT / TTC nulle part dans ce message:
 * sous ce régime, ces lignes seraient fausses. Le prix est le prix.
 *
 * Le texte vient de LEGAL et de vatMention(): le jour où le régime change,
 * l'email suit sans qu'on pense à venir le corriger ici.
 */
function invoiceFooter(): string[] {
  const vat = vatMention();

  return [
    "---",
    `${LEGAL.legalName}, ${LEGAL.legalForm.toLowerCase()}`,
    ...(LEGAL.address ? [LEGAL.address] : []),
    ...(LEGAL.siret ? [`SIRET ${LEGAL.siret}`] : []),
    ...(LEGAL.rcs ? [LEGAL.rcs] : []),
    ...(vat ? [vat] : []),
  ];
}

export function customerConfirmationText(order: NotifiableOrder): string {
  const heading =
    order.mode === "livraison"
      ? "Nous vous livrons"
      : "Votre commande sera prête";

  // Répété ici parce que la commande contient effectivement de l'alcool: la
  // mention doit accompagner l'offre partout où elle apparaît, pas seulement
  // dans les conditions de vente.
  const alcohol = order.items.some((item) => item.containsAlcohol)
    ? [
        "",
        "Cette commande contient de l'alcool. Sa vente est interdite aux mineurs",
        "de moins de dix-huit ans (article L3342-1 du code de la santé publique).",
        "Une preuve d'âge peut être demandée à la remise.",
        "L'abus d'alcool est dangereux pour la santé, à consommer avec modération.",
      ]
    : [];

  return [
    `Bonjour ${order.firstName},`,
    "",
    `Votre commande ${order.reference} est confirmée et payée.`,
    "",
    `${heading} ${slotLabel(order)}.`,
    "",
    fulfilmentBlock(order),
    "",
    "Votre commande",
    itemLines(order),
    "",
    order.deliveryFeeCents > 0
      ? `Sous-total  ${formatEuros(order.subtotalCents)}\nLivraison   ${formatEuros(order.deliveryFeeCents)}`
      : `Sous-total  ${formatEuros(order.subtotalCents)}`,
    `Total       ${formatEuros(order.totalCents)}`,
    ...alcohol,
    "",
    "Une question, un changement? Répondez simplement à cet email, nous le lisons.",
    "",
    "Sesame",
    "",
    ...invoiceFooter(),
    // Le médiateur figure sur la facture, et pas seulement dans les CGV: c'est
    // le document que le client garde, et celui qu'il retrouvera le jour où il
    // aura une réclamation à formuler.
    ...(mediatorLines().length > 0 ? ["", ...mediatorLines()] : []),
  ].join("\n");
}

/**
 * Annonce que la commande est prête.
 *
 * Deux textes, parce que les deux situations ne demandent pas la même chose au
 * client: en retrait, il doit se déplacer et il lui faut une adresse et un
 * numéro; en livraison, il n'a rien à faire sauf vérifier que l'adresse est la
 * bonne, tant qu'il est encore temps de la corriger.
 *
 * Ce que ce message ne dit jamais, en livraison: que la commande est partie,
 * ou à quelle heure elle arrive. `prete` veut dire prête, pas partie: le plat
 * peut attendre quelques minutes sur le plan de travail avant que le livreur
 * s'en aille. Annoncer un départ ou une heure d'arrivée créerait une attente
 * que la cuisine n'a pas promise, et un client à la fenêtre pour rien.
 */
export function customerReadyText(order: NotifiableOrder): string {
  // Le numéro est placé dans la phrase qui en a besoin, et non relégué en
  // signature: en livraison, il n'a d'utilité que collé à la demande de
  // vérifier l'adresse, au moment où corriger est encore possible.
  const phone = nationalPhone();

  const body =
    order.mode === "retrait"
      ? [
          `Votre commande ${order.reference} est prête.`,
          "",
          "Vous pouvez venir la retirer, pendant votre créneau:",
          `  ${slotLabel(order)}`,
          "",
          "À l'adresse",
          `  ${collectionAddress()}`,
          "",
          "Présentez simplement votre référence de commande en arrivant.",
          ...(phone
            ? ["", `Un empêchement, un retard? Appelez le ${phone}.`]
            : []),
        ]
      : [
          `Votre commande ${order.reference} est prête. Elle part sous peu.`,
          "",
          "Nous livrons à",
          `  ${order.addressLine}`,
          `  ${order.postcode}`,
          "",
          ...(phone
            ? [
                `Si cette adresse n'est pas la bonne, appelez le ${phone} tout de`,
                "suite: une fois le livreur parti, nous ne pourrons plus la corriger.",
              ]
            : [
                "Si cette adresse n'est pas la bonne, répondez à cet email tout de",
                "suite: une fois le livreur parti, nous ne pourrons plus la corriger.",
              ]),
          "",
          "Gardez votre téléphone à portée, le livreur peut appeler en arrivant.",
        ];

  return [
    `Bonjour ${order.firstName},`,
    "",
    ...body,
    "",
    "Votre commande",
    itemLines(order),
    "",
    "Sesame",
  ].join("\n");
}

/**
 * Annonce d'annulation.
 *
 * Écrit du point de vue du client, dans l'ordre où il se pose les questions:
 * ma commande est annulée, où est mon argent, qu'est-ce que je fais
 * maintenant. Le montant remboursé et le délai bancaire viennent en deuxième
 * position parce que c'est la seule information qui l'inquiète réellement.
 *
 * Aucune excuse automatique élaborée, aucune promesse de geste commercial: la
 * cuisine décidera elle-même si elle en fait un, et un email ne doit pas
 * l'engager à sa place.
 */
export function customerCancellationText(
  order: NotifiableOrder,
  details: CancellationDetails,
): string {
  const money =
    details.refundedCents !== null
      ? [
          // Tournure impersonnelle: "vous êtes remboursé" imposerait un accord
          // de genre qu'aucune donnée de la commande ne permet de faire.
          `Le remboursement de ${formatEuros(details.refundedCents)} est déjà parti, vers la`,
          "carte qui a servi au paiement. Selon votre banque, il apparaît sur",
          "votre compte sous cinq à dix jours ouvrés. Vous n'avez aucune",
          "démarche à faire.",
        ]
      : [
          "Aucun montant n'a été débité pour cette commande, il n'y a donc rien",
          "à rembourser.",
        ];

  return [
    `Bonjour ${order.firstName},`,
    "",
    `Votre commande ${order.reference} a été annulée et ne sera pas préparée.`,
    "",
    ...money,
    "",
    "Ce qui était prévu",
    `  ${slotLabel(order)}`,
    itemLines(order),
    "",
    `Total initial  ${formatEuros(order.totalCents)}`,
    "",
    "Vous pouvez commander à nouveau à tout moment depuis la carte.",
    "Une question sur cette annulation? Répondez à cet email, nous le lisons,",
    `ou appelez le ${nationalPhone() ?? ""}.`,
    "",
    "Sesame",
    "",
    ...invoiceFooter(),
    // Une annulation est le moment le plus propice à une réclamation: les
    // coordonnées du médiateur ont davantage leur place ici que sur une
    // confirmation, où elles figurent aussi.
    ...(mediatorLines().length > 0 ? ["", ...mediatorLines()] : []),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

/**
 * Repli sans Resend. Ne prétend pas envoyer: il affiche, pour qu'un
 * développement local reste lisible sans clé API.
 */
export const consoleTransport: NotificationTransport = {
  name: "console",
  async sendKitchenTicket(order) {
    console.info(`\n--- BON DE CUISINE ${order.reference} ---\n${kitchenTicketText(order)}`);
  },
  async sendCustomerConfirmation(order) {
    console.info(
      `\n--- CONFIRMATION CLIENT ${order.reference} -> ${order.email} ---\n${customerConfirmationText(order)}`,
    );
  },
  async sendReadyNotice(order) {
    console.info(
      `\n--- COMMANDE PRETE ${order.reference} -> ${order.email} ---\n${customerReadyText(order)}`,
    );
  },
  async sendCancellationNotice(order, details) {
    console.info(
      `\n--- ANNULATION ${order.reference} -> ${order.email} ---\n${customerCancellationText(order, details)}`,
    );
  },
};

function resendTransport(apiKey: string, from: string, kitchen: string): NotificationTransport {
  const resend = new Resend(apiKey);
  return {
    name: "resend",
    async sendKitchenTicket(order) {
      const { error } = await resend.emails.send({
        from,
        to: kitchen,
        // La cuisine répond directement au client, sans copier une adresse.
        replyTo: order.email,
        subject: `${order.reference} - ${order.mode} - ${slotLabel(order)}`,
        text: kitchenTicketText(order),
      });
      if (error) throw new Error(`Resend cuisine: ${error.message}`);
    },
    async sendCustomerConfirmation(order) {
      const { error } = await resend.emails.send({
        from,
        to: order.email,
        // Boîte réelle, relevée: une réponse du client doit arriver quelque part.
        replyTo: from,
        subject: `Votre commande ${order.reference} est confirmée`,
        text: customerConfirmationText(order),
      });
      if (error) throw new Error(`Resend client: ${error.message}`);
    },
    async sendReadyNotice(order) {
      const { error } = await resend.emails.send({
        from,
        to: order.email,
        replyTo: from,
        subject:
          order.mode === "retrait"
            ? `Votre commande ${order.reference} est prête à retirer`
            : `Votre commande ${order.reference} est prête`,
        text: customerReadyText(order),
      });
      if (error) throw new Error(`Resend prete: ${error.message}`);
    },
    async sendCancellationNotice(order, details) {
      const { error } = await resend.emails.send({
        from,
        to: order.email,
        replyTo: from,
        // L'objet dit l'annulation, pas le remboursement: c'est l'information
        // que le client doit lire avant d'ouvrir, y compris s'il ne l'ouvre
        // jamais.
        subject: `Votre commande ${order.reference} a été annulée`,
        text: customerCancellationText(order, details),
      });
      if (error) throw new Error(`Resend annulation: ${error.message}`);
    },
  };
}

export function transport(): NotificationTransport {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  const kitchen = process.env.KITCHEN_EMAIL;

  if (!apiKey || !from || !kitchen) {
    console.warn(
      "[notify] RESEND_API_KEY, ORDER_EMAIL_FROM ou KITCHEN_EMAIL absente: repli console.",
    );
    return consoleTransport;
  }
  return resendTransport(apiKey, from, kitchen);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type NotifyStatus = "envoye" | "deja_envoye" | "echec" | "commande_absente";

export interface NotifyResult {
  kitchen: NotifyStatus;
  customer: NotifyStatus;
  errors: string[];
}

type Db = ReturnType<typeof serviceClient>;

async function loadOrder(db: Db, orderId: string): Promise<
  | (NotifiableOrder & {
      kitchenNotifiedAt: string | null;
      customerEmailedAt: string | null;
      readyEmailedAt: string | null;
      cancellationEmailedAt: string | null;
    })
  | null
> {
  // Deux requêtes plutôt qu'une jointure imbriquée: sans types générés, le
  // client Supabase infère mal les embeds et il faudrait effacer le typage à
  // coups d'assertions. La notification tourne une fois par commande, l'aller
  // -retour supplémentaire est sans conséquence.
  const { data, error } = await db
    .from("orders")
    // Une seule chaîne littérale: le typage de Supabase analyse le texte du
    // select à la compilation, et une concaténation le fait retomber sur un
    // type d'erreur générique.
    .select("id, reference, first_name, last_name, phone, email, mode, address_line, postcode, slot_start, slot_end, subtotal_cents, delivery_fee_cents, total_cents, customer_note, kitchen_notified_at, customer_emailed_at, ready_emailed_at, cancellation_emailed_at")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) return null;

  const { data: items, error: itemsError } = await db
    .from("order_items")
    .select("item_name, variant_name, quantity, line_total_cents, allergens, contains_alcohol")
    .eq("order_id", orderId);

  if (itemsError) return null;

  return {
    id: data.id,
    reference: data.reference,
    firstName: data.first_name,
    lastName: data.last_name,
    phone: data.phone,
    email: data.email,
    mode: data.mode,
    addressLine: data.address_line,
    postcode: data.postcode,
    slotStart: data.slot_start,
    slotEnd: data.slot_end,
    subtotalCents: data.subtotal_cents,
    deliveryFeeCents: data.delivery_fee_cents,
    totalCents: data.total_cents,
    customerNote: data.customer_note,
    kitchenNotifiedAt: data.kitchen_notified_at,
    customerEmailedAt: data.customer_emailed_at,
    readyEmailedAt: data.ready_emailed_at,
    cancellationEmailedAt: data.cancellation_emailed_at,
    items: (items ?? []).map((item) => ({
      itemName: item.item_name,
      variantName: item.variant_name,
      quantity: item.quantity,
      lineTotalCents: item.line_total_cents,
      allergens: item.allergens ?? [],
      containsAlcohol: item.contains_alcohol,
    })),
  };
}

/**
 * Envoie le bon de cuisine et la confirmation client pour une commande payée.
 *
 * Idempotence par `kitchen_notified_at` et `customer_emailed_at`: une commande
 * déjà notifiée ne l'est pas deux fois.
 *
 * On envoie d'abord, on horodate ensuite. L'ordre inverse éviterait un doublon
 * en cas de livraison concurrente, mais perdrait définitivement l'envoi si
 * l'horodatage réussissait et l'envoi échouait. Un ticket en double gêne la
 * cuisine; un ticket manquant lui fait rater une commande.
 *
 * Ne lève jamais. Les échecs remontent dans `errors`.
 */
export async function notifyOrderConfirmed(
  orderId: string,
  /** Injectable pour les tests, afin de n'envoyer aucun email réel. */
  post: NotificationTransport = transport(),
): Promise<NotifyResult> {
  const errors: string[] = [];
  const db = serviceClient();

  const order = await loadOrder(db, orderId);
  if (!order) {
    return {
      kitchen: "commande_absente",
      customer: "commande_absente",
      errors: [`commande ${orderId} introuvable pour notification`],
    };
  }

  let kitchen: NotifyStatus = "deja_envoye";
  if (!order.kitchenNotifiedAt) {
    try {
      await post.sendKitchenTicket(order);
      await db
        .from("orders")
        .update({ kitchen_notified_at: new Date().toISOString() })
        .eq("id", order.id);
      kitchen = "envoye";
    } catch (error) {
      kitchen = "echec";
      errors.push(`cuisine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let customer: NotifyStatus = "deja_envoye";
  if (!order.customerEmailedAt) {
    try {
      await post.sendCustomerConfirmation(order);
      await db
        .from("orders")
        .update({ customer_emailed_at: new Date().toISOString() })
        .eq("id", order.id);
      customer = "envoye";
    } catch (error) {
      customer = "echec";
      errors.push(`client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { kitchen, customer, errors };
}

/**
 * Prévient le client que sa commande est prête.
 *
 * Appelé par l'avancement de statut de l'espace cuisine, après que la base a
 * accepté le passage en `prete`. Jamais avant: le trigger peut refuser la
 * transition, et annoncer une commande prête qui ne l'est pas serait pire que
 * ne rien annoncer.
 *
 * Idempotent sur `ready_emailed_at`, et ne lève jamais. Le statut est déjà
 * écrit quand ce code s'exécute: un envoi raté ne doit pas défaire un
 * avancement acquis, ni le faire paraître raté à la cuisine. L'échec revient
 * dans `errors` et l'horodatage reste nul, ce qui rend l'envoi rejouable.
 */
export async function notifyOrderReady(
  orderId: string,
  /** Injectable pour les tests, afin de n'envoyer aucun email réel. */
  post: NotificationTransport = transport(),
): Promise<{ customer: NotifyStatus; errors: string[] }> {
  const db = serviceClient();

  const order = await loadOrder(db, orderId);
  if (!order) {
    return {
      customer: "commande_absente",
      errors: [`commande ${orderId} introuvable pour l'annonce de préparation`],
    };
  }

  if (order.readyEmailedAt) {
    return { customer: "deja_envoye", errors: [] };
  }

  try {
    await post.sendReadyNotice(order);
    await db
      .from("orders")
      .update({ ready_emailed_at: new Date().toISOString() })
      .eq("id", order.id);
    return { customer: "envoye", errors: [] };
  } catch (error) {
    return {
      customer: "echec",
      errors: [`prete: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Prévient le client qu'une commande a été annulée.
 *
 * Appelé par l'action d'annulation de l'espace cuisine, après le
 * remboursement Stripe et après l'écriture du statut. Cet ordre est imposé:
 * annoncer un remboursement avant qu'il soit acquis serait un mensonge, et
 * l'annoncer avant l'écriture du statut promettrait une annulation qui
 * pourrait encore échouer.
 *
 * Ne lève jamais, pour la même raison que les autres envois: la commande est
 * déjà annulée et l'argent déjà rendu quand ce code s'exécute. Un email raté
 * ne doit pas faire remonter une erreur qui laisserait croire à la cuisine que
 * le remboursement n'a pas eu lieu. L'échec revient dans `errors`, et
 * `cancellation_emailed_at` reste nul, ce qui rend l'envoi rejouable.
 */
export async function notifyOrderCancelled(
  orderId: string,
  details: CancellationDetails,
  /** Injectable pour les tests, afin de n'envoyer aucun email réel. */
  post: NotificationTransport = transport(),
): Promise<{ customer: NotifyStatus; errors: string[] }> {
  const db = serviceClient();

  const order = await loadOrder(db, orderId);
  if (!order) {
    return {
      customer: "commande_absente",
      errors: [`commande ${orderId} introuvable pour l'annulation`],
    };
  }

  if (order.cancellationEmailedAt) {
    return { customer: "deja_envoye", errors: [] };
  }

  try {
    await post.sendCancellationNotice(order, details);
    await db
      .from("orders")
      .update({ cancellation_emailed_at: new Date().toISOString() })
      .eq("id", order.id);
    return { customer: "envoye", errors: [] };
  } catch (error) {
    return {
      customer: "echec",
      errors: [
        `annulation: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}
