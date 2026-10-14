"use client";

import { useState, useTransition } from "react";

import { advanceStatus, cancelOrder } from "@/app/admin/actions";
import { ALLERGEN_LABELS, formatEuros, type Allergen } from "@/config/menu";
import { TIMEZONE } from "@/config/zones";
import {
  isCancellable,
  nextStep,
  STATUS_LABELS,
  type AdminOrder,
} from "@/lib/orders";

/**
 * Un bon de cuisine.
 *
 * Dessiné pour une seule main, à 390px, sur un téléphone posé à côté d'une
 * plaque. Trois conséquences:
 *
 * - le bouton d'action fait toute la largeur et 56px de haut, en bas de la
 *   fiche, là où le pouce arrive sans que la main se déplace;
 * - l'annulation demande deux appuis, jamais un seul, parce qu'elle rend de
 *   l'argent et qu'un appui accidentel est banal avec des doigts gras;
 * - rien n'est caché derrière un dépliant. Les articles, les allergènes, la
 *   note du client et le téléphone sont visibles d'un coup d'oeil, parce que
 *   la fiche se lit en cuisinant, pas en explorant.
 */

/**
 * Libellé lisible d'un allergène.
 *
 * `order_items.allergens` est un instantané figé à la commande, en texte
 * libre: il contient les identifiants de la carte du jour, pas des libellés.
 * Affichés bruts, ils donnaient "fruits-a-coque" sur le bon de cuisine.
 *
 * Repli sur la valeur brute plutôt qu'omission: un identifiant disparu de la
 * carte depuis la commande doit rester visible, même mal orthographié. Une
 * ligne d'allergène manquante est plus grave qu'une ligne inélégante.
 */
function allergenLabel(key: string): string {
  return ALLERGEN_LABELS[key as Allergen] ?? key;
}

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/**
 * Ancienneté, en clair. Calculée au rendu et non stockée: le flux se relit
 * régulièrement, donc l'affichage suit sans horloge dédiée.
 */
function since(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return dayOf(iso);
}

/** Pastille de statut. L'olive pour ce qui avance, la terre cuite pour la fin. */
function StatusPill({ order }: { order: AdminOrder }) {
  const tone =
    order.status === "annulee"
      ? "border-meat-border text-meat"
      : order.status === "livree" || order.status === "retiree"
        ? "border-rule text-muted"
        : "border-olive text-olive";

  return (
    <span className={`label shrink-0 rounded-full border px-2.5 py-1 ${tone}`}>
      {STATUS_LABELS[order.status]}
    </span>
  );
}

export function OrderCard({
  order,
  highlighted,
  onChanged,
}: {
  order: AdminOrder;
  highlighted: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const step = nextStep(order.status, order.mode);
  const alcohol = order.lines.some((line) => line.containsAlcohol);
  const allergens = [...new Set(order.lines.flatMap((line) => line.allergens))];

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setMessage(result.message ?? "Action impossible.");
      else if (result.message) setMessage(result.message);
      setConfirmingCancel(false);
      await onChanged();
    });
  }

  return (
    <article
      className={`mt-4 border bg-raised px-4 py-4 ${
        highlighted ? "border-olive" : "border-rule"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tabular font-display text-section tracking-wide text-ink">
            {order.reference}
          </p>
          <p className="mt-0.5 text-micro text-muted">{since(order.createdAt)}</p>
        </div>
        <StatusPill order={order} />
      </div>

      {/* Ce qui décide de l'ordre de préparation: le mode et le créneau. */}
      <div className="rule-t mt-3 flex items-baseline justify-between gap-3 pt-3">
        <span className="label text-terracotta">
          {order.mode === "livraison" ? "Livraison" : "Retrait"}
        </span>
        <span className="tabular text-fine text-ink">
          {dayOf(order.slotStart)} {timeOf(order.slotStart)} -{" "}
          {timeOf(order.slotEnd)}
        </span>
      </div>

      <p className="mt-2 text-fine text-ink">
        {order.firstName} {order.lastName}
      </p>
      <p className="mt-0.5">
        <a
          href={`tel:${order.phone.replace(/\s/g, "")}`}
          className="tabular text-fine text-olive underline underline-offset-4"
        >
          {order.phone}
        </a>
      </p>
      {order.mode === "livraison" && order.addressLine ? (
        <p className="mt-1 text-fine text-muted">
          {order.addressLine}
          {order.postcode ? `, ${order.postcode}` : ""}
        </p>
      ) : null}

      <ul className="rule-t mt-3 space-y-1.5 pt-3">
        {order.lines.map((line, index) => (
          <li key={`${line.itemName}-${line.variantName ?? ""}-${index}`}>
            <div className="flex items-baseline gap-2">
              <span className="tabular font-display text-item text-terracotta">
                {line.quantity}
              </span>
              <span className="text-fine text-ink">
                {line.itemName}
                {line.variantName ? ` (${line.variantName})` : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {allergens.length > 0 ? (
        <p className="mt-2 text-micro text-muted">
          Allergènes du bon: {allergens.map(allergenLabel).join(", ")}.
        </p>
      ) : null}

      {alcohol ? (
        <p className="mt-2 border border-meat-border px-3 py-2 text-micro text-meat">
          Contient de l&apos;alcool. Vérifier la majorité à la remise.
        </p>
      ) : null}

      {order.customerNote ? (
        <p className="mt-2 border border-field px-3 py-2 text-fine text-ink">
          Note du client: {order.customerNote}
        </p>
      ) : null}

      <div className="rule-t mt-3 flex items-baseline justify-between pt-3">
        <span className="label text-muted">
          Total{order.mode === "livraison" ? " avec livraison" : ""}
        </span>
        <span className="tabular font-display text-item text-terracotta">
          {formatEuros(order.totalCents)}
        </span>
      </div>

      {order.refundedAt ? (
        <p className="mt-2 text-micro text-muted">
          Remboursée le {dayOf(order.refundedAt)} à {timeOf(order.refundedAt)}
          {order.refundAmountCents !== null
            ? `, ${formatEuros(order.refundAmountCents)}`
            : ""}
          .
        </p>
      ) : null}

      {message ? (
        <p className="mt-3 text-fine text-terracotta" role="status">
          {message}
        </p>
      ) : null}

      {step ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => advanceStatus(order.id, step.target))}
          className="label mt-4 min-h-14 w-full rounded-full bg-olive px-4 text-bone disabled:opacity-40"
        >
          {pending ? "En cours" : step.label}
        </button>
      ) : null}

      {isCancellable(order.status) ? (
        confirmingCancel ? (
          <div className="mt-3 border border-meat-border px-3 py-3">
            <p className="text-fine text-ink">
              Annuler {order.reference} et rembourser{" "}
              <span className="tabular">{formatEuros(order.totalCents)}</span>?
              Le remboursement part chez Stripe immédiatement et n&apos;est pas
              réversible.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => cancelOrder(order.id))}
                className="label min-h-12 flex-1 rounded-full bg-meat px-3 text-bone disabled:opacity-40"
              >
                {pending ? "Remboursement" : "Confirmer"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmingCancel(false)}
                className="label min-h-12 flex-1 rounded-full border border-field px-3 text-muted"
              >
                Non
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingCancel(true)}
            className="label mt-3 min-h-12 w-full text-muted underline underline-offset-4"
          >
            Annuler et rembourser
          </button>
        )
      ) : null}
    </article>
  );
}
