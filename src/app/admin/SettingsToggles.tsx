"use client";

import { useState, useTransition } from "react";

import { setSetting, type SettingKey } from "@/app/admin/actions";

/**
 * Les deux interrupteurs d'exploitation.
 *
 * Optimistes: l'interrupteur bascule à l'appui, avant la réponse du serveur, et
 * revient en arrière si l'écriture échoue. Attendre l'aller-retour donnerait
 * l'impression d'un appui non pris en compte, et la cuisine appuierait deux
 * fois.
 *
 * L'effet est immédiat côté client: la vitrine relit `settings` à chaque rendu
 * de page, sans cache. Fermer ici ferme la boutique au prochain chargement,
 * sans redéploiement et sans délai de propagation.
 */

interface ToggleProps {
  id: SettingKey;
  label: string;
  onLabel: string;
  offLabel: string;
  detail: string;
  value: boolean;
}

function Toggle({
  setting,
  onError,
}: {
  setting: ToggleProps;
  onError: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(setting.value);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);

    startTransition(async () => {
      const result = await setSetting(setting.id, next);
      if (!result.ok) {
        setEnabled(!next);
        onError(result.message);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={enabled}
      className={`mt-3 flex w-full items-center justify-between gap-4 border px-4 py-4 text-left ${
        enabled ? "border-olive bg-raised" : "border-meat-border bg-sunken"
      }`}
    >
      <span>
        <span className="block font-display text-item text-ink">
          {setting.label}
        </span>
        <span className="mt-0.5 block text-micro text-muted">
          {setting.detail}
        </span>
      </span>

      <span
        className={`label shrink-0 rounded-full border px-3 py-2 ${
          enabled ? "border-olive bg-olive text-bone" : "border-meat text-meat"
        }`}
      >
        {enabled ? setting.onLabel : setting.offLabel}
      </span>
    </button>
  );
}

export function SettingsToggles({
  storeOpen,
  deliveryEnabled,
}: {
  storeOpen: boolean;
  deliveryEnabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const settings: ToggleProps[] = [
    {
      id: "store_open",
      label: "Boutique ouverte",
      onLabel: "Ouverte",
      offLabel: "Fermée",
      detail:
        "Fermée, la carte reste consultable mais aucune commande ne peut être payée.",
      value: storeOpen,
    },
    {
      id: "delivery_enabled",
      label: "Livraison proposée",
      onLabel: "Active",
      offLabel: "Suspendue",
      detail: "Suspendue, seul le retrait sur place reste possible.",
      value: deliveryEnabled,
    },
  ];

  return (
    <section className="mt-6">
      <h2 className="label text-muted">Exploitation</h2>

      {settings.map((setting) => (
        <Toggle key={setting.id} setting={setting} onError={setError} />
      ))}

      {error ? (
        <p className="mt-3 text-fine text-terracotta" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}
