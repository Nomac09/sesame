/**
 * Fiche d'un article de la carte.
 *
 * Server Component: le nom, la description, les allergènes et le prix sont
 * dans le HTML initial. Seul l'ajout au panier est une île cliente. Un client
 * qui a faim doit pouvoir lire la carte avant que le moindre script soit
 * chargé, et rien ici n'attend une animation pour devenir lisible.
 *
 * Sans photo, la fiche repose entièrement sur la typographie: le nom en Lora,
 * la ligne pointillée jusqu'au prix en terre cuite, la description en petit
 * corps. C'est le geste de la carte imprimée, et il tient sans image.
 *
 * Aucun prix, aucun nom, aucun allergène n'est écrit ici: tout vient de
 * src/config/menu.ts.
 */

import Image from "next/image";

import {
  ALLERGENS_PENDING_LABEL,
  ALLERGEN_LABELS,
  DIETARY_LABELS,
  formatEuros,
  type DietaryTag,
  type MenuItem,
} from "@/config/menu";
import { AddControl } from "@/components/menu/AddControl";
import { photoUrl } from "@/lib/photos";

/**
 * Photo du plat, quand il y en a une.
 *
 * Aucune photo n'est publiée pour l'instant et la carte est conçue pour s'en
 * passer: sans fichier, rien n'est rendu, ni cadre, ni image de remplacement,
 * ni espace réservé. L'emplacement reste câblé pour le jour où de vraies
 * photos des plats existeront.
 *
 * Rapport 16:9, aligné sur le format des sources.
 */
function ItemPhoto({ item, priority }: { item: MenuItem; priority: boolean }) {
  const source = photoUrl(item.image);
  if (!source) return null;

  return (
    <div className="relative mb-3 aspect-video w-full overflow-hidden bg-sunken">
      <Image
        src={source}
        alt={`${item.name}, photographié`}
        fill
        sizes="(max-width: 704px) calc(100vw - 32px), 640px"
        className="object-cover"
        priority={priority}
      />
    </div>
  );
}

function DietaryTags({ tags }: { tags: readonly DietaryTag[] }) {
  return (
    <ul className="flex flex-wrap gap-x-1.5 gap-y-1">
      {tags.map((tag) => {
        // Le seul tag qui change de couleur est celui qui signale la viande:
        // c'est le seul dont la lecture erronée a une conséquence réelle.
        const meat = tag === "non-vegetalien";
        return (
          <li
            key={tag}
            className={`label rounded-full border px-2 py-1 ${
              meat
                ? "border-meat-border text-meat"
                : "border-rule text-muted"
            }`}
          >
            {DIETARY_LABELS[tag]}
          </li>
        );
      })}
    </ul>
  );
}

function AllergenLine({ item }: { item: MenuItem }) {
  if (item.allergensPending) {
    return <p className="mt-2 text-micro text-muted">{ALLERGENS_PENDING_LABEL}</p>;
  }
  if (item.allergens.length === 0) return null;
  return (
    <p className="mt-2 text-micro text-muted">
      Allergènes: {item.allergens.map((code) => ALLERGEN_LABELS[code]).join(", ")}
    </p>
  );
}

/** Nom, points de conduite, prix. Le geste de la carte imprimée. */
function LeaderLine({
  name,
  priceCents,
  marker,
  muted,
}: {
  name: React.ReactNode;
  priceCents: number;
  marker?: string;
  muted?: boolean;
}) {
  return (
    <div className="leader">
      <span
        className={`font-display text-item ${muted ? "text-muted" : "text-ink"}`}
      >
        {name}
        {marker ? (
          <span className="label ml-2 align-middle text-terracotta">{marker}</span>
        ) : null}
      </span>
      <span className="leader__fill" aria-hidden="true" />
      <span
        className={`tabular font-display text-item shrink-0 ${
          muted ? "text-muted" : "text-terracotta"
        }`}
      >
        {formatEuros(priceCents)}
      </span>
    </div>
  );
}

export function ItemCard({
  item,
  available,
  orderingEnabled,
  priorityPhoto = false,
}: {
  item: MenuItem;
  available: boolean;
  /** Faux quand la boutique est fermée: on montre la carte, sans l'ajout. */
  orderingEnabled: boolean;
  /** Vrai pour la première photo de la page, celle qui porte le LCP. */
  priorityPhoto?: boolean;
}) {
  const addable = available && orderingEnabled;
  const hasVariants = Boolean(item.variants?.length);

  return (
    <article className="rule-b py-5" aria-label={item.name}>
      <ItemPhoto item={item} priority={priorityPhoto} />

      {/*
       * Avec variantes, le prix descend sur chaque ligne de variante: deux
       * plateaux de tailles différentes n'ont pas un prix commun à afficher
       * en tête.
       */}
      {hasVariants ? (
        <h3 className="font-display text-item text-ink">
          {item.name}
          {item.signature ? (
            <span className="label ml-2 align-middle text-terracotta">
              Signature
            </span>
          ) : null}
        </h3>
      ) : (
        <h3>
          <LeaderLine
            name={item.name}
            priceCents={item.priceCents}
            marker={item.signature ? "Signature" : undefined}
            muted={!available}
          />
        </h3>
      )}

      {!available ? (
        <p className="label mt-2 text-terracotta">Épuisé aujourd&apos;hui</p>
      ) : null}

      {item.description ? (
        <p className="mt-2 text-fine text-muted">{item.description}</p>
      ) : null}

      {item.contents ? (
        <p className="mt-2 text-fine text-muted">{item.contents.join(", ")}.</p>
      ) : null}

      <div className="mt-3">
        <DietaryTags tags={item.tags} />
      </div>

      <AllergenLine item={item} />

      {hasVariants ? (
        <ul className="mt-4 space-y-3">
          {item.variants?.map((variant) => (
            <li key={variant.id} className="rule-t pt-3">
              <LeaderLine
                name={variant.name}
                priceCents={variant.priceCents ?? item.priceCents}
                marker={variant.flagship ? "Le plus commandé" : undefined}
                muted={!available}
              />
              {variant.description ? (
                <p className="mt-1 text-micro text-muted">{variant.description}</p>
              ) : null}
              {addable ? (
                <div className="mt-2">
                  <AddControl
                    itemId={item.id}
                    variantId={variant.id}
                    label={`${item.name}, ${variant.name}`}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : addable ? (
        <div className="mt-3">
          <AddControl itemId={item.id} label={item.name} />
        </div>
      ) : null}
    </article>
  );
}
