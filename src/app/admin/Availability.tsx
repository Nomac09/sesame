"use client";

import { useState, useTransition } from "react";

import { setItemAvailability } from "@/app/admin/actions";

/**
 * Disponibilité article par article.
 *
 * Un appui par article, sur toute la largeur de la ligne. Pas de case à
 * cocher, pas de menu, pas de confirmation: marquer un article épuisé se fait
 * en plein service, une main occupée, et doit coûter un seul geste. La cible
 * fait 56px de haut, ce qui reste atteignable sans regarder.
 *
 * Un article épuisé disparaît du panier suivant, pas du panier en cours: la
 * vitrine relit la disponibilité à chaque rendu, et le serveur la revérifie
 * avant de créer la session de paiement.
 */

interface Item {
  id: string;
  name: string;
  available: boolean;
}

interface Category {
  id: string;
  name: string;
  items: Item[];
}

function Row({
  item,
  onError,
  onCount,
}: {
  item: Item;
  onError: (message: string) => void;
  onCount: (delta: number) => void;
}) {
  const [available, setAvailable] = useState(item.available);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !available;
    setAvailable(next);
    onCount(next ? -1 : 1);

    startTransition(async () => {
      const result = await setItemAvailability(item.id, next);
      if (!result.ok) {
        setAvailable(!next);
        onCount(next ? 1 : -1);
        onError(result.message);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={!available}
      className="rule-b flex min-h-14 w-full items-center justify-between gap-3 text-left"
    >
      <span
        className={`text-fine ${available ? "text-ink" : "text-muted line-through"}`}
      >
        {item.name}
      </span>
      <span
        className={`label shrink-0 rounded-full border px-3 py-1.5 ${
          available ? "border-field text-muted" : "border-meat bg-meat text-bone"
        }`}
      >
        {available ? "Dispo" : "Épuisé"}
      </span>
    </button>
  );
}

export function Availability({
  categories,
  initialUnavailable,
}: {
  categories: Category[];
  initialUnavailable: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(initialUnavailable);

  return (
    <section className="mt-10">
      <h2 className="label text-muted">Disponibilité du jour</h2>
      <p className="mt-2 text-micro text-muted">
        {unavailable === 0
          ? "Tous les articles de la carte sont disponibles."
          : unavailable === 1
            ? "1 article marqué épuisé."
            : `${unavailable} articles marqués épuisés.`}{" "}
        Un appui suffit, dans les deux sens.
      </p>

      {error ? (
        <p className="mt-3 text-fine text-terracotta" role="status">
          {error}
        </p>
      ) : null}

      {categories.map((category) => (
        <div key={category.id} className="mt-6">
          <h3 className="font-display text-item text-olive">{category.name}</h3>
          <div className="mt-1">
            {category.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                onError={setError}
                onCount={(delta) => setUnavailable((count) => count + delta)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
