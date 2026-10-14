import Link from "next/link";

import { hasBlockingLegalGap, missingLegalFields } from "@/config/legal";

/**
 * Primitives typographiques des pages légales.
 *
 * Un texte légal se lit mal dans les tailles de la carte: les paragraphes sont
 * longs, les listes nombreuses et la lecture est linéaire. Ces composants
 * fixent une fois pour toutes l'interlignage, la largeur de colonne et la
 * hiérarchie, pour qu'aucune page n'improvise sa mise en page.
 *
 * Même système que la vitrine, mêmes jetons: fond os, titres olive, filets
 * capillaires. Rien de neuf n'est introduit ici.
 */

/** Titre d'article, numéroté quand la page en a besoin. */
export function Article({
  n,
  title,
  children,
}: {
  n?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rule-t mt-9 pt-6">
      <h2 className="font-display text-section text-olive">
        {n !== undefined ? (
          <span className="tabular mr-2 text-terracotta">{n}.</span>
        ) : null}
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-fine text-muted">{children}</p>;
}

/** Paragraphe qui porte une règle, plutôt qu'un commentaire. */
export function Strong({ children }: { children: React.ReactNode }) {
  return <p className="text-fine text-ink">{children}</p>;
}

export function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5 text-fine text-muted marker:text-rule">
      {children}
    </ul>
  );
}

/**
 * Ligne de définition, dans la langue graphique de la carte: libellé à gauche,
 * valeur à droite, points entre les deux. Sur un écran étroit la valeur passe
 * sous le libellé plutôt que de se comprimer.
 */
export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rule-b flex flex-wrap items-baseline gap-x-2 py-2.5">
      <dt className="label shrink-0 text-muted">{label}</dt>
      <dd className="ml-auto text-fine text-ink">{value}</dd>
    </div>
  );
}

export function Rows({ children }: { children: React.ReactNode }) {
  return <dl className="mt-4">{children}</dl>;
}

/** Lien interne, même traitement partout dans les pages légales. */
export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  const className = "text-olive underline underline-offset-4";

  if (external) {
    return (
      <a
        className={className}
        href={href}
        {...(href.startsWith("http")
          ? { target: "_blank", rel: "noreferrer noopener" }
          : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

/**
 * Encart affiché tant qu'une mention obligatoire manque.
 *
 * Volontairement visible par tout le monde, et non réservé au développement.
 * Une page légale incomplète qui se présente comme complète est le seul cas
 * réellement risqué; l'admettre à l'écran coûte peu et se voit tout de suite.
 */
export function GapNotice() {
  if (!hasBlockingLegalGap()) return null;

  return (
    <div className="mt-6 border border-meat-border bg-raised px-4 py-4">
      <p className="label text-meat">Information à compléter</p>
      <p className="mt-2 text-fine text-ink">
        Certaines mentions obligatoires ne sont pas encore renseignées. Elles
        seront publiées dès qu&apos;elles seront disponibles. En attendant, écrivez
        à la cuisine pour toute demande: la réponse ne dépend pas de cette page.
      </p>
      <p className="mt-2 text-micro text-muted">
        Champs manquants: {missingLegalFields().join(", ")}.
      </p>
    </div>
  );
}

/**
 * Coquille commune. Colonne étroite, retour vers la carte en haut, date de
 * version en bas: un document légal doit dire quand il a été écrit.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10">
      <Link href="/" className="label text-muted">
        Retour à la carte
      </Link>

      <h1 className="mt-6 font-display text-display tracking-tight text-olive">
        {title}
      </h1>

      {intro ? <p className="mt-3 text-fine text-muted">{intro}</p> : null}

      <GapNotice />

      {children}
    </div>
  );
}
