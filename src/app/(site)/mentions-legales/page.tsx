import {
  Article,
  A,
  LegalPage,
  P,
  Row,
  Rows,
  Strong,
} from "@/components/legal/prose";
import { LEGAL, nationalPhone, vatMention } from "@/config/legal";

export const metadata = {
  title: "Mentions légales, Sesame",
  description:
    "Éditeur, hébergeur et coordonnées du site de commande de Sesame, cuisine palestinienne à Bondues.",
};

/**
 * Mentions légales, article 6 III de la LCEN.
 *
 * Tout ce qui s'affiche vient de src/config/legal.ts. Un champ non renseigné
 * n'apparaît pas ici et remonte dans l'encart d'alerte de LegalPage, plutôt
 * que d'être remplacé par une formule creuse.
 */

export default function MentionsLegalesPage() {
  const phone = nationalPhone();
  const vat = vatMention();

  return (
    <LegalPage
      title="Mentions légales"
      intro="Informations sur l'éditeur et l'hébergeur de ce site, publiées en application de l'article 6 de la loi pour la confiance dans l'économie numérique."
    >
      <Article title="Éditeur du site">
        <Rows>
          <Row label="Enseigne" value={LEGAL.tradingName} />
          <Row label="Dénomination" value={LEGAL.legalName} />
          <Row label="Forme juridique" value={LEGAL.legalForm} />
          <Row label="Exploitant" value={LEGAL.operatorName} />
          {LEGAL.address ? <Row label="Siège" value={LEGAL.address} /> : null}
          <Row label="SIREN" value={<span className="tabular">{LEGAL.siren}</span>} />
          {LEGAL.siret ? (
            <Row label="SIRET" value={<span className="tabular">{LEGAL.siret}</span>} />
          ) : null}
          {LEGAL.rcs ? <Row label="Immatriculation" value={LEGAL.rcs} /> : null}
          {LEGAL.publicationDirector ? (
            <Row
              label="Directeur de la publication"
              value={LEGAL.publicationDirector}
            />
          ) : null}
          {LEGAL.contactEmail ? (
            <Row
              label="Email"
              value={<A href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</A>}
            />
          ) : null}
          {phone && LEGAL.contactPhone ? (
            <Row
              label="Téléphone"
              value={
                <A href={`tel:${LEGAL.contactPhone.replace(/\s/g, "")}`}>
                  <span className="tabular">{phone}</span>
                </A>
              }
            />
          ) : null}
        </Rows>
        {/*
         * Mention fiscale sortie du tableau d'identité: ce n'est pas un
         * identifiant de l'entreprise mais une information sur le prix, et la
         * placer entre le SIRET et l'email la ferait lire comme un numéro
         * absent. Aucun numéro de TVA n'est publié, et c'est correct sous ce
         * régime.
         */}
        {vat ? <Strong>{vat}</Strong> : null}

        {LEGAL.contactPhoneNonSurcharged ? (
          <P>
            Appel non surtaxé, au tarif normal de votre opérateur. Aucun
            supplément n&apos;est facturé pour joindre la cuisine au sujet
            d&apos;une commande.
          </P>
        ) : null}
      </Article>

      <Article title="Activité">
        <P>
          Préparation et vente de plats à emporter, en livraison et en retrait
          sur place, depuis une cuisine à Bondues. Il n&apos;y a pas de salle: aucune
          consommation sur place n&apos;est proposée.
        </P>
      </Article>

      <Article title="Hébergeur">
        <Rows>
          {LEGAL.hostName ? <Row label="Société" value={LEGAL.hostName} /> : null}
          {LEGAL.hostAddress ? <Row label="Adresse" value={LEGAL.hostAddress} /> : null}
          {LEGAL.hostUrl ? (
            <Row label="Contact" value={<A href={LEGAL.hostUrl}>{LEGAL.hostUrl}</A>} />
          ) : null}
        </Rows>
        <P>
          L&apos;hébergeur ne publie pas de numéro de téléphone d&apos;assistance. Le
          formulaire ci-dessus est le moyen de contact qu&apos;il met à disposition.
        </P>
      </Article>

      <Article title="Propriété intellectuelle">
        <P>
          Les textes, la carte, les photographies et la mise en page de ce site
          appartiennent à l&apos;éditeur. Leur reproduction, même partielle, demande
          un accord écrit préalable.
        </P>
      </Article>

      <Article title="Données personnelles et cookies">
        <P>
          Le traitement des données des clients est décrit dans la{" "}
          <A href="/confidentialite">politique de confidentialité</A>, qui
          détaille aussi les cookies et le stockage local utilisés par le site.
        </P>
      </Article>

      <Article title="Conditions de vente">
        <P>
          Les commandes passées sur ce site sont régies par les{" "}
          <A href="/cgv">conditions générales de vente</A>, qui précisent
          notamment les modalités de livraison, l&apos;absence de droit de
          rétractation sur les denrées périssables et le recours à la médiation
          de la consommation.
        </P>
      </Article>
    </LegalPage>
  );
}
