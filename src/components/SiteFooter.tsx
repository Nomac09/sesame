import Link from "next/link";

import { LEGAL, nationalPhone } from "@/config/legal";

/**
 * Pied de page, monté dans le layout racine.
 *
 * Les mentions légales et les conditions de vente doivent être accessibles
 * depuis toutes les pages, pas seulement depuis l'accueil: c'est la raison
 * d'être de ce composant, et la raison pour laquelle il vit dans le layout et
 * non dans la page de la carte.
 *
 * Le rembourrage bas dégage la barre de panier flottante, qui est en position
 * fixe et recouvrirait sinon la dernière ligne de liens sur la carte.
 */

const LINKS = [
  { href: "/cgv", label: "Conditions de vente" },
  { href: "/allergenes", label: "Allergènes" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/mentions-legales", label: "Mentions légales" },
];

export function SiteFooter() {
  const phone = nationalPhone();

  return (
    <footer className="rule-t mx-auto mt-12 max-w-2xl px-4 pb-32 pt-6">
      <nav aria-label="Informations légales">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="label text-muted">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mt-5 text-micro text-muted">
        {LEGAL.tradingName}, {LEGAL.legalForm.toLowerCase()}
        {LEGAL.address ? `, ${LEGAL.address}` : ""}. Livraison et retrait
        uniquement, pas de service en salle.
      </p>

      <p className="mt-1.5 text-micro text-muted">
        {LEGAL.contactEmail ? (
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL.contactEmail}`}
          >
            {LEGAL.contactEmail}
          </a>
        ) : null}
        {LEGAL.contactEmail && phone && LEGAL.contactPhone ? " - " : ""}
        {phone && LEGAL.contactPhone ? (
          <a
            className="tabular underline underline-offset-4"
            href={`tel:${LEGAL.contactPhone.replace(/\s/g, "")}`}
          >
            {phone}
          </a>
        ) : null}
      </p>

      {/*
       * Médiateur en pied de page et pas seulement dans les CGV: l'article
       * R616-1 demande que ses coordonnées soient communiquées au
       * consommateur, et un client mécontent ne pense pas à ouvrir les
       * conditions de vente pour les chercher.
       */}
      {LEGAL.mediatorName ? (
        <p className="mt-3 text-micro text-muted">
          Médiation de la consommation: {LEGAL.mediatorName}
          {LEGAL.mediatorAddress ? `, ${LEGAL.mediatorAddress}` : ""}
          {LEGAL.mediatorEmail ? (
            <>
              {", "}
              <a
                className="underline underline-offset-4"
                href={`mailto:${LEGAL.mediatorEmail}`}
              >
                {LEGAL.mediatorEmail}
              </a>
            </>
          ) : null}
          {LEGAL.mediatorUrl ? (
            <>
              {", "}
              <a
                className="underline underline-offset-4"
                href={LEGAL.mediatorUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {LEGAL.mediatorUrl.replace(/^https?:\/\//, "")}
              </a>
            </>
          ) : null}
          . Saisine gratuite, dans un délai d&apos;un an après une réclamation
          écrite restée sans réponse satisfaisante.
        </p>
      ) : null}

      <p className="mt-3 text-micro text-muted">
        L&apos;abus d&apos;alcool est dangereux pour la santé, à consommer avec
        modération. La vente d&apos;alcool est interdite aux mineurs de moins de
        dix-huit ans.
      </p>
    </footer>
  );
}
