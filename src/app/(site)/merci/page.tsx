import Link from "next/link";

import { ClearCart } from "@/app/(site)/merci/ClearCart";
import { formatEuros } from "@/config/menu";
import { LEGAL } from "@/config/legal";
import { COLLECTION_ADDRESS_LABEL, TIMEZONE } from "@/config/zones";
import { isValidReference } from "@/lib/reference";
import { formatSlotRange } from "@/lib/schedule";
import { serviceClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Merci, Sesame",
};

/**
 * Page de retour de Stripe, cible de `success_url`.
 *
 * Le paiement est confirmé par le webhook, pas par ce retour: un client qui
 * ferme son navigateur au mauvais moment ne passe jamais ici, et sa commande
 * est confirmée quand même. Cette page ne fait donc que lire l'état, elle ne
 * le modifie jamais. Elle sait aussi afficher l'entre-deux, quand Stripe a
 * redirigé avant que le webhook soit arrivé.
 *
 * Volontairement, aucune donnée personnelle n'est affichée: ni nom, ni
 * téléphone, ni adresse, ni email. L'URL porte une référence, et une référence
 * peut être devinée. Le créneau et le montant suffisent au client qui arrive
 * ici, et ne révèlent l'identité de personne.
 */

interface OrderView {
  reference: string;
  status: string;
  mode: "livraison" | "retrait";
  postcode: string | null;
  slotStart: string;
  slotEnd: string;
  totalCents: number;
}

async function findOrder(reference: string): Promise<OrderView | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("orders")
    .select("reference, status, mode, postcode, slot_start, slot_end, total_cents")
    .eq("reference", reference)
    .maybeSingle();

  if (error || !data) return null;

  return {
    reference: data.reference,
    status: data.status,
    mode: data.mode,
    postcode: data.postcode,
    slotStart: data.slot_start,
    slotEnd: data.slot_end,
    totalCents: data.total_cents,
  };
}

function slotSentence(order: OrderView): string {
  const start = new Date(order.slotStart);
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);
  const range = formatSlotRange({ start, end: new Date(order.slotEnd) });
  return `${day}, ${range}`;
}

/** Ce qui se passe ensuite, selon l'état réel de la commande. */
function nextSteps(order: OrderView): { heading: string; body: string[] } {
  if (order.status === "en_attente_paiement") {
    return {
      heading: "Paiement en cours de confirmation",
      body: [
        "Votre banque n'a pas encore fini de confirmer le paiement. Cela prend en général quelques secondes.",
        "Actualisez cette page dans un instant. Dès que le paiement est confirmé, vous recevez un email et la cuisine reçoit votre commande.",
      ],
    };
  }

  if (order.status === "paiement_echoue") {
    return {
      heading: "Le paiement n'a pas abouti",
      body: [
        "Aucun montant n'a été débité et la commande n'a pas été transmise à la cuisine.",
        "Vous pouvez reprendre votre commande depuis la carte.",
      ],
    };
  }

  if (order.status === "annulee") {
    return {
      heading: "Commande annulée",
      body: [
        "Cette commande a été annulée. Si elle avait été payée, le remboursement a été effectué.",
      ],
    };
  }

  const collection =
    order.mode === "livraison"
      ? "Nous vous livrons pendant votre créneau. Gardez votre téléphone à portée, le livreur peut appeler en arrivant."
      : `Votre commande est à retirer pendant votre créneau. ${COLLECTION_ADDRESS_LABEL}.`;

  return {
    heading: "Commande confirmée",
    body: [
      "Votre paiement est enregistré et la cuisine a reçu votre commande.",
      "Un email de confirmation part vers votre adresse, avec le détail de la commande.",
      collection,
    ],
  };
}

export default async function MerciPage(props: PageProps<"/merci">) {
  const params = await props.searchParams;
  const raw = typeof params.ref === "string" ? params.ref : undefined;

  // On valide le format avant d'interroger la base, pour qu'une URL fabriquée
  // ne déclenche pas de requête.
  const order = raw && isValidReference(raw) ? await findOrder(raw) : null;

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14">
        <h1 className="font-display text-display text-olive">
          Commande introuvable
        </h1>
        <p className="mt-4 text-fine text-muted">
          Nous ne trouvons pas de commande pour cette référence. Si vous venez
          de payer, votre email de confirmation fait foi.
        </p>
        {LEGAL.contactEmail ? (
          <p className="mt-3 text-fine text-muted">
            Un doute? Écrivez-nous à{" "}
            <a
              className="text-olive underline underline-offset-4"
              href={`mailto:${LEGAL.contactEmail}`}
            >
              {LEGAL.contactEmail}
            </a>
            .
          </p>
        ) : null}
        <Link
          href="/"
          className="label mt-8 inline-block rounded-full border border-olive px-5 py-3 text-olive"
        >
          Retour à la carte
        </Link>
      </div>
    );
  }

  const steps = nextSteps(order);
  const settled = order.status !== "paiement_echoue" && order.status !== "annulee";

  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      {settled ? <ClearCart /> : null}

      <h1 className="font-display text-display text-olive">{steps.heading}</h1>

      {/*
       * La référence est ce que le client relira au téléphone. Elle est donc
       * traitée comme l'information principale de la page, pas comme une
       * mention de bas de page.
       */}
      <div className="rule-t rule-b mt-8 py-5">
        <p className="label text-muted">Référence de commande</p>
        <p className="tabular mt-2 font-display text-display tracking-wide text-ink">
          {order.reference}
        </p>
      </div>

      {settled ? (
        <dl className="mt-5 space-y-2.5 text-fine">
          <div className="leader">
            <dt className="text-muted">
              {order.mode === "livraison" ? "Livraison" : "Retrait"}
            </dt>
            <dd className="leader__fill" aria-hidden="true" />
            <dd className="shrink-0 text-ink">{slotSentence(order)}</dd>
          </div>
          {order.mode === "livraison" && order.postcode ? (
            <div className="leader">
              <dt className="text-muted">Code postal</dt>
              <dd className="leader__fill" aria-hidden="true" />
              <dd className="tabular shrink-0 text-ink">{order.postcode}</dd>
            </div>
          ) : null}
          <div className="leader">
            <dt className="text-muted">Total payé</dt>
            <dd className="leader__fill" aria-hidden="true" />
            <dd className="tabular shrink-0 text-terracotta">
              {formatEuros(order.totalCents)}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-7 space-y-3">
        {steps.body.map((paragraph) => (
          <p key={paragraph} className="text-fine text-muted">
            {paragraph}
          </p>
        ))}
      </div>

      {LEGAL.contactEmail ? (
        <p className="mt-6 text-fine text-muted">
          Une question, un changement? Écrivez à{" "}
          <a
            className="text-olive underline underline-offset-4"
            href={`mailto:${LEGAL.contactEmail}`}
          >
            {LEGAL.contactEmail}
          </a>
          , nous lisons cette boîte.
        </p>
      ) : null}

      <Link
        href="/"
        className="label mt-9 inline-block rounded-full border border-olive px-5 py-3 text-olive"
      >
        Retour à la carte
      </Link>
    </div>
  );
}
