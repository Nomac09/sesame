"use server";

import { cookies } from "next/headers";
import type Stripe from "stripe";
import { z } from "zod";

import { absoluteUrl } from "@/config/site";
import { REFERRAL_COOKIE } from "@/config/referral";
import { findZone, isInDeliveryZone, normalisePostcode } from "@/config/zones";
import {
  CartError,
  priceCart,
  type CartLineInput,
  type PriceCartOptions,
  type PricedOrder,
} from "@/lib/pricing";
import { recordReferralHit } from "@/lib/referral-stats";
import { insertWithReference } from "@/lib/reference";
import { isSlotBookable } from "@/lib/schedule";
import {
  assertOrderable,
  getStoreState,
  StoreClosedError,
} from "@/lib/store-state";
import { stripe } from "@/lib/stripe";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Création de la commande et de la session de paiement.
 *
 * Le client n'envoie aucun montant. Il envoie des identifiants d'article, des
 * quantités et ses coordonnées; tout le reste est recalculé ici. Les mêmes
 * règles que la vitrine sont rejouées côté serveur, parce que l'état a pu
 * changer depuis l'affichage de la page et parce qu'un formulaire fabriqué à
 * la main ne passe par aucun rendu.
 *
 * La commande est écrite en `en_attente_paiement` avec son instantané de
 * panier avant d'appeler Stripe. C'est le webhook, et lui seul, qui la fera
 * passer en `confirmee`.
 */

const CheckoutInput = z
  .object({
    // Longueurs alignées sur les contraintes de la table orders.
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email().max(200),

    mode: z.enum(["livraison", "retrait"]),
    addressLine: z.string().trim().max(200).optional(),
    postcode: z.string().trim().max(10).optional(),

    slotStart: z.string().datetime({ offset: true }),
    slotEnd: z.string().datetime({ offset: true }),

    marketingOptIn: z.boolean().default(false),
    ageConfirmed: z.boolean().default(false),
    note: z.string().trim().max(500).optional(),

    // Aucun prix ici, volontairement. Ajouter un montant à ce schéma
    // reviendrait à faire confiance au navigateur.
    lines: z
      .array(
        z.object({
          itemId: z.string().min(1).max(80),
          variantId: z.string().min(1).max(80).optional(),
          quantity: z.number().int().min(1).max(50),
        }),
      )
      .min(1)
      .max(60),
  })
  .strict();

export type CheckoutInputShape = z.input<typeof CheckoutInput>;

export type CheckoutResult =
  | { ok: true; url: string; reference: string }
  | { ok: false; code: string; message: string; field?: string };

function fail(code: string, message: string, field?: string): CheckoutResult {
  return { ok: false, code, message, field };
}

type PricingOutcome =
  | { ok: true; value: PricedOrder }
  | { ok: false; code: string; message: string };

/**
 * Enveloppe priceCart pour que l'appelant puisse lier le résultat à un `const`.
 * Le détail technique d'une CartError est journalisé ici et ne repart jamais
 * vers le navigateur.
 */
function priceOrError(
  lines: CartLineInput[],
  options: PriceCartOptions,
): PricingOutcome {
  try {
    return { ok: true, value: priceCart(lines, options) };
  } catch (error) {
    if (error instanceof CartError) {
      if (error.detail) console.error(`[commander] ${error.code}: ${error.detail}`);
      return { ok: false, code: error.code, message: error.message };
    }
    throw error;
  }
}

export async function createCheckoutSession(
  raw: unknown,
): Promise<CheckoutResult> {
  const parsed = CheckoutInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "champ_invalide",
      "Merci de vérifier les informations saisies.",
      issue?.path.join("."),
    );
  }
  const input = parsed.data;

  // Le code de parrainage vient du cookie, jamais du formulaire: il pilote une
  // éventuelle remise et alimente un compteur, et ne doit pas être choisi par
  // le client. Il n'est écrit nulle part sur la commande, voir referral-stats.
  const jar = await cookies();
  const referralCode = jar.get(REFERRAL_COOKIE)?.value ?? null;

  const pricing = priceOrError(input.lines, { mode: input.mode, referralCode });
  if (!pricing.ok) return fail(pricing.code, pricing.message);
  // const, et PricedOrder est entièrement readonly: à partir d'ici plus aucun
  // montant ne peut changer avant Stripe.
  const priced = pricing.value;

  // Boutique ouverte, mode proposé, aucun article épuisé.
  const state = await getStoreState();
  try {
    assertOrderable(
      state,
      input.mode,
      priced.lines.map((line) => line.itemId),
    );
  } catch (error) {
    if (error instanceof StoreClosedError) return fail(error.code, error.message);
    throw error;
  }

  // Adresse et zone, uniquement en livraison.
  let addressLine: string | null = null;
  let postcode: string | null = null;
  if (input.mode === "livraison") {
    if (!input.addressLine) {
      return fail("adresse_requise", "Merci d'indiquer votre adresse.", "addressLine");
    }
    if (!input.postcode) {
      return fail("code_postal_requis", "Merci d'indiquer votre code postal.", "postcode");
    }
    const normalised = normalisePostcode(input.postcode);
    if (!/^[0-9]{5}$/.test(normalised)) {
      return fail("code_postal_invalide", "Le code postal doit comporter cinq chiffres.", "postcode");
    }
    if (!isInDeliveryZone(normalised)) {
      return fail(
        "hors_zone",
        "Nous ne livrons pas encore à cette adresse. Le retrait sur place reste possible.",
        "postcode",
      );
    }
    addressLine = input.addressLine;
    postcode = normalised;
  }

  // Créneau: on régénère la liste et on compare, plutôt que de faire confiance
  // à une paire de dates envoyée par le navigateur.
  const slotStart = new Date(input.slotStart);
  const slotEnd = new Date(input.slotEnd);
  if (!isSlotBookable(slotStart, slotEnd)) {
    return fail(
      "creneau_indisponible",
      "Ce créneau n'est plus disponible. Merci d'en choisir un autre.",
      "slotStart",
    );
  }

  // Alcool: la case n'apparaît que si le panier en contient, et sa valeur est
  // revérifiée ici.
  if (priced.containsAlcohol && !input.ageConfirmed) {
    return fail(
      "age_non_confirme",
      "La vente d'alcool est interdite aux mineurs. Merci de confirmer votre âge.",
      "ageConfirmed",
    );
  }

  const db = serviceClient();

  const order = await insertWithReference(async (reference) => {
    const { data, error } = await db
      .from("orders")
      .insert({
        reference,
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        email: input.email,
        mode: input.mode,
        address_line: addressLine,
        postcode,
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        subtotal_cents: priced.subtotalCents,
        referral_discount_cents: priced.referralDiscountCents,
        delivery_fee_cents: priced.deliveryFeeCents,
        total_cents: priced.totalCents,
        marketing_opt_in: input.marketingOptIn,
        age_confirmed: input.ageConfirmed,
        customer_note: input.note ?? null,
      })
      .select("id, reference")
      .single();

    if (error) throw error;
    return data;
  });

  // Instantané du panier. En cas d'échec on retire la commande: une ligne sans
  // articles ne doit pas rester en base, même invisible pour la cuisine.
  const { error: itemsError } = await db.from("order_items").insert(
    priced.lines.map((line) => ({
      order_id: order.id,
      item_id: line.itemId,
      item_name: line.itemName,
      variant_id: line.variantId,
      variant_name: line.variantName,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      line_total_cents: line.lineTotalCents,
      allergens: line.allergens,
      tags: line.tags,
      contains_alcohol: line.containsAlcohol,
    })),
  );
  if (itemsError) {
    await db.from("orders").delete().eq("id", order.id);
    console.error("[commander] echec insertion des lignes", itemsError);
    return fail("panier_non_enregistre", "Votre commande n'a pas pu être enregistrée. Merci de réessayer.");
  }

  try {
    const client = stripe();

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priced.lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: "eur",
        unit_amount: line.unitPriceCents,
        product_data: {
          name: line.variantName
            ? `${line.itemName} (${line.variantName})`
            : line.itemName,
        },
      },
    }));

    if (priced.deliveryFeeCents > 0) {
      const zone = postcode ? findZone(postcode) : undefined;
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: priced.deliveryFeeCents,
          product_data: {
            name: zone ? `Livraison ${zone.commune}` : "Livraison",
          },
        },
      });
    }

    // Stripe n'accepte pas de ligne négative: une remise passe par un coupon.
    const discounts =
      priced.referralDiscountCents > 0
        ? [
            {
              coupon: (
                await client.coupons.create({
                  amount_off: priced.referralDiscountCents,
                  currency: "eur",
                  duration: "once",
                  name: "Code première commande",
                })
              ).id,
            },
          ]
        : undefined;

    const session = await client.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      customer_email: input.email,
      client_reference_id: order.reference,
      line_items: lineItems,
      discounts,
      // Repris par le webhook pour retrouver la commande sans dépendre d'une
      // recherche par montant.
      metadata: { order_id: order.id, reference: order.reference },
      payment_intent_data: {
        metadata: { order_id: order.id, reference: order.reference },
      },
      success_url: absoluteUrl(`/merci?ref=${order.reference}`),
      cancel_url: absoluteUrl(`/commander?annule=1`),
      // Minimum autorisé par Stripe. Passé ce délai, checkout.session.expired
      // fait basculer la commande en paiement_echoue.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    if (!session.url) throw new Error("Stripe n'a pas renvoyé d'URL de paiement.");

    const { error: linkError } = await db
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);
    if (linkError) {
      // La session existe déjà: on n'annule pas le paiement pour autant. Le
      // webhook sait aussi retrouver la commande par metadata.order_id.
      console.error("[commander] session non rattachee a la commande", linkError);
    }

    // Attribution, après la création réussie de la session et pas avant: on
    // compte un client réellement arrivé au paiement, et non une panne de
    // notre côté. Le code n'est écrit sur aucune ligne de commande.
    await recordReferralHit(referralCode, priced.subtotalCents);

    return { ok: true, url: session.url, reference: order.reference };
  } catch (error) {
    console.error("[commander] echec creation session Stripe", error);
    await db
      .from("orders")
      .update({ status: "paiement_echoue" })
      .eq("id", order.id);
    return fail(
      "paiement_indisponible",
      "Le paiement est momentanément indisponible. Merci de réessayer dans quelques minutes.",
    );
  }
}
