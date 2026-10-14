import Link from "next/link";
import { connection } from "next/server";

import { CartBar } from "@/components/cart/CartBar";
import { ItemCard } from "@/components/menu/ItemCard";
import { LEGAL, nationalPhone } from "@/config/legal";
import { formatEuros, VISIBLE_MENU } from "@/config/menu";
import {
  DELIVERY_FEE_CENTS,
  DELIVERY_ZONES,
  FREE_DELIVERY_THRESHOLD_CENTS,
} from "@/config/zones";
import type { Availability } from "@/lib/availability";
import { closedDays, serviceWindows } from "@/lib/hours";
import { getStoreState } from "@/lib/store-state";

/**
 * La carte.
 *
 * `VISIBLE_MENU` a déjà retiré les articles soumis à la grande licence, donc
 * les spiritueux n'apparaissent nulle part dans ce rendu tant que
 * GRANDE_LICENCE_HELD est à false: ils ne sont pas masqués en CSS, ils ne sont
 * pas envoyés.
 *
 * Aucune animation d'entrée sur cette page. La carte est ce que le client est
 * venu lire: elle est lisible et cliquable au premier rendu, sans attendre le
 * moindre script. Le mouvement commence au premier geste, dans le panier.
 */

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 border border-rule bg-raised px-4 py-3 text-fine text-ink">
      {children}
    </p>
  );
}

export default async function MenuPage() {
  // getStoreState() n'utilise aucune API de requête, donc sans cette ligne
  // Next prérendrait la page à la compilation et servirait un état figé: un
  // article remis en stock ne réapparaîtrait jamais.
  await connection();
  const state = await getStoreState();

  const availability: Availability = {
    storeOpen: state.storeOpen,
    deliveryEnabled: state.deliveryEnabled,
    unavailableItemIds: [...state.unavailableItemIds],
    degraded: state.degraded,
  };
  const orderingEnabled = state.storeOpen && !state.degraded;

  // La première photo de la carte porterait le LCP. Aucune n'est publiée pour
  // l'instant, donc ceci reste inerte, prêt pour le jour où il y en aura.
  const firstPhotoItemId = VISIBLE_MENU.flatMap((category) => category.items).find(
    (item) => item.image,
  )?.id;

  const services = serviceWindows();
  const closed = closedDays();
  const phone = nationalPhone();

  return (
    // Le dégagement bas de la barre de panier flottante est porté par le pied
    // de page du layout, qui suit ce bloc. Le doubler ici ouvrirait un vide.
    <div className="mx-auto max-w-2xl px-4">
      <header className="pt-10">
        <h1 className="font-display text-display tracking-tight text-olive">
          Sesame
        </h1>
        <p className="mt-2 max-w-sm text-fine text-muted">
          Cuisine palestinienne préparée à la commande, à Bondues. Livraison
          dans la métropole lilloise ou retrait sur place.
        </p>

        {/*
         * Commande par téléphone, en haut de la carte et non dans le pied de
         * page: c'est un second chemin de commande, pas une mention légale.
         * Placé ici, il se voit sans défiler, ce qui est le seul endroit où il
         * sert à quelque chose pour un client qui préfère parler.
         *
         * Le numéro reste un lien `tel:`: sur un téléphone il compose, sur un
         * ordinateur il se copie. Une chasse fixe pour qu'il se lise par
         * groupes de deux chiffres, comme sur la carte imprimée.
         */}
        {phone && LEGAL.contactPhone ? (
          <a
            href={`tel:${LEGAL.contactPhone.replace(/\s/g, "")}`}
            className="mt-5 flex items-baseline justify-between gap-3 border border-field px-4 py-3"
          >
            <span className="label text-muted">Commander par téléphone</span>
            <span className="tabular shrink-0 font-display text-item text-terracotta">
              {phone}
            </span>
          </a>
        ) : null}

        {/*
         * Deux services par jour, présentés comme deux blocs. C'est le rythme
         * réel de la cuisine, pas une plage horaire à déchiffrer.
         */}
        <div className="rule-t mt-6 pt-5">
          <h2 className="label text-muted">Services</h2>
          <dl className="mt-3 flex gap-8">
            {services.map((service) => (
              <div key={service.name}>
                <dt className="label text-terracotta">{service.name}</dt>
                <dd className="tabular mt-1 font-display text-item text-ink">
                  {service.hours}
                </dd>
              </div>
            ))}
          </dl>
          {closed.length > 0 ? (
            <p className="mt-3 text-micro text-muted">
              Fermé le {closed.join(", ")}.
            </p>
          ) : null}
        </div>

        <div className="rule-t mt-5 pt-5">
          <h2 className="label text-muted">Livraison et retrait</h2>
          <p className="mt-3 text-fine text-muted">
            {DELIVERY_ZONES.map((zone) => zone.commune).join(", ")}.
          </p>
          <p className="mt-1 text-fine text-muted">
            {DELIVERY_FEE_CENTS !== null
              ? `Frais de ${formatEuros(DELIVERY_FEE_CENTS)}`
              : "Frais de livraison à confirmer"}
            {DELIVERY_FEE_CENTS !== null && FREE_DELIVERY_THRESHOLD_CENTS !== null
              ? `, offerts à partir de ${formatEuros(FREE_DELIVERY_THRESHOLD_CENTS)}`
              : ""}
            . Retrait sur place sans frais.
          </p>
        </div>

        {!orderingEnabled ? (
          <Banner>
            {state.degraded
              ? "Les commandes sont momentanément indisponibles. Merci de réessayer dans quelques minutes."
              : "La boutique est fermée pour le moment. La carte reste consultable."}
          </Banner>
        ) : null}

        {orderingEnabled && !state.deliveryEnabled ? (
          <Banner>
            La livraison est suspendue pour le moment. Le retrait sur place
            reste possible.
          </Banner>
        ) : null}
      </header>

      {/*
       * Rail de navigation. Trente et un articles sur un téléphone font une
       * page longue: sauter à une catégorie est une nécessité, pas un ornement.
       * Ce sont des ancres, donc cela fonctionne sans JavaScript.
       */}
      {/*
       * Fond entièrement opaque: à 95% le texte des fiches transparaissait
       * sous le rail pendant le défilement, et deux textes superposés se
       * lisent moins bien qu'un seul.
       *
       * Le dégradé de droite signale que la liste continue au-delà du bord.
       * Sans lui, le dernier libellé paraît coupé plutôt que défilable.
       */}
      <nav
        aria-label="Catégories de la carte"
        className="rule-b sticky top-0 z-20 -mx-4 mt-8 bg-bone px-4"
      >
        <ul
          className="flex gap-5 overflow-x-auto py-3 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
        >
          {VISIBLE_MENU.map((category) => (
            <li key={category.id} className="shrink-0">
              <a href={`#${category.id}`} className="label text-muted">
                {category.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main>
        {VISIBLE_MENU.map((category) => (
          <section key={category.id} id={category.id} className="mt-10 scroll-mt-16">
            <div className="leader">
              <h2 className="font-display text-section text-olive">
                {category.name}
              </h2>
              <span className="leader__fill" aria-hidden="true" />
              <span className="tabular label shrink-0 text-muted">
                {category.items.length}
              </span>
            </div>

            {category.note ? (
              <p className="mt-2 text-fine text-muted">{category.note}</p>
            ) : null}

            <div className="mt-1">
              {category.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  available={!state.unavailableItemIds.has(item.id)}
                  orderingEnabled={orderingEnabled}
                  priorityPhoto={item.id === firstPhotoItemId}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <p className="mt-12 text-micro text-muted">
        Les allergènes sont indiqués sur chaque article, et récapitulés sur la{" "}
        <Link
          href="/allergenes"
          className="text-olive underline underline-offset-4"
        >
          page des allergènes
        </Link>
        . Une intolérance, une question? Précisez-le en commandant, nous le
        lisons.
      </p>

      <CartBar availability={availability} />
    </div>
  );
}
