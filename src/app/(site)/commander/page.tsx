import Link from "next/link";
import { connection } from "next/server";

import { CheckoutForm, type SerialSlotDay } from "@/app/(site)/commander/CheckoutForm";
import type { Availability } from "@/lib/availability";
import { availableSlotDays, formatSlotRange } from "@/lib/schedule";
import { availableModes, getStoreState } from "@/lib/store-state";

export const metadata = {
  title: "Commander, Sesame",
};

/**
 * Les créneaux sont mis en forme ici, côté serveur, en heure de Paris. Les
 * envoyer bruts obligerait le navigateur à refaire la conversion de fuseau,
 * avec le fuseau de l'appareil: un client en voyage verrait des heures fausses.
 */
export default async function CommanderPage(props: PageProps<"/commander">) {
  await connection();
  const state = await getStoreState();

  const availability: Availability = {
    storeOpen: state.storeOpen,
    deliveryEnabled: state.deliveryEnabled,
    unavailableItemIds: [...state.unavailableItemIds],
    degraded: state.degraded,
  };

  // Retour depuis la page Stripe par le bouton d'annulation. Le panier n'a pas
  // été touché, il faut le dire: un client qui a cru payer doit comprendre
  // qu'il n'a rien payé et que rien n'est perdu.
  const params = await props.searchParams;
  const cancelled = params.annule === "1";

  const days: SerialSlotDay[] = availableSlotDays().map((day) => ({
    date: day.date,
    label: day.label,
    slots: day.slots.map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      label: formatSlotRange(slot),
    })),
  }));

  const orderingEnabled = state.storeOpen && !state.degraded;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="rule-b pb-5 pt-8">
        <Link href="/" className="label text-muted underline underline-offset-4">
          Retour à la carte
        </Link>
        <h1 className="mt-4 font-display text-display text-olive">Commander</h1>
      </header>

      {cancelled ? (
        <p className="mt-6 border border-rule bg-raised px-4 py-3 text-fine text-ink">
          Paiement annulé. Aucun montant n&apos;a été débité et votre panier est
          intact.
        </p>
      ) : null}

      {orderingEnabled ? (
        <CheckoutForm
          availability={availability}
          modes={availableModes(state)}
          days={days}
        />
      ) : (
        <div className="py-12">
          <p className="font-display text-item text-ink">
            {state.degraded
              ? "Les commandes sont momentanément indisponibles."
              : "La boutique est fermée pour le moment."}
          </p>
          <p className="mt-2 text-fine text-muted">
            {state.degraded
              ? "Merci de réessayer dans quelques minutes."
              : "Votre panier est conservé."}
          </p>
          <Link
            href="/"
            className="label mt-5 inline-block rounded-full border border-olive px-5 py-3 text-olive"
          >
            Voir la carte
          </Link>
        </div>
      )}
    </div>
  );
}
