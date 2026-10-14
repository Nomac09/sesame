import {
  A,
  Article,
  LegalPage,
  P,
  Row,
  Rows,
  Strong,
  Ul,
} from "@/components/legal/prose";
import { LEGAL, nationalPhone, vatMention } from "@/config/legal";
import { formatEuros } from "@/config/menu";
import {
  COLLECTION_ADDRESS_LABEL,
  DELIVERY_FEE_CENTS,
  DELIVERY_ZONES,
  FREE_DELIVERY_THRESHOLD_CENTS,
  LEAD_TIME_MINUTES,
  SLOT_DAYS_AHEAD,
  SLOT_MINUTES,
} from "@/config/zones";
import { openingLines } from "@/lib/hours";

export const metadata = {
  title: "Conditions générales de vente, Sesame",
  description:
    "Conditions générales de vente applicables aux commandes passées sur le site de Sesame: prix, paiement, livraison, retrait, allergènes et réclamations.",
};

/**
 * Conditions générales de vente, vente à distance de denrées préparées.
 *
 * Les chiffres ne sont jamais recopiés à la main: zone, frais, seuil de
 * gratuité, durée des créneaux, délai de préparation et horaires viennent de
 * src/config/zones.ts. Modifier un tarif sans penser aux CGV est le défaut
 * classique de ce genre de page; ici c'est impossible.
 *
 * Deux points méritent d'être repérés au premier coup d'oeil, parce qu'ils
 * sont les plus souvent contestés: l'absence de droit de rétractation sur les
 * denrées périssables et la remise des informations sur les allergènes. Ils
 * ont chacun leur article, avec le texte applicable cité.
 */

const CGV_VERSION = "2 août 2026";

export default function CgvPage() {
  const phone = nationalPhone();
  const vat = vatMention();
  const communes = DELIVERY_ZONES.map((zone) => zone.commune).join(", ");
  const hours = openingLines();

  return (
    <LegalPage
      title="Conditions générales de vente"
      intro={`Version du ${CGV_VERSION}. Elles s'appliquent à toute commande passée sur ce site.`}
    >
      <Article n={1} title="Objet et acceptation">
        <P>
          Les présentes conditions régissent la vente de plats préparés,
          boissons et accompagnements proposés sur ce site, à emporter ou en
          livraison, par {LEGAL.legalName} sous l&apos;enseigne {LEGAL.tradingName}.
        </P>
        <P>
          Elles sont portées à la connaissance du client avant la validation de
          sa commande. La validation de la commande et le paiement valent
          acceptation sans réserve de la version en vigueur à cette date. Le
          client déclare être un consommateur au sens du code de la
          consommation et avoir la capacité de contracter.
        </P>
      </Article>

      <Article n={2} title="Vendeur">
        <Rows>
          <Row label="Dénomination" value={LEGAL.legalName} />
          {LEGAL.address ? <Row label="Adresse" value={LEGAL.address} /> : null}
          {LEGAL.siret ? (
            <Row label="SIRET" value={<span className="tabular">{LEGAL.siret}</span>} />
          ) : null}
          {LEGAL.contactEmail ? (
            <Row
              label="Email"
              value={<A href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</A>}
            />
          ) : null}
          {phone ? <Row label="Téléphone" value={<span className="tabular">{phone}</span>} /> : null}
        </Rows>
        <P>
          Les autres mentions figurent dans les{" "}
          <A href="/mentions-legales">mentions légales</A>.
        </P>
      </Article>

      <Article n={3} title="Produits, allergènes et composition">
        <P>
          Les plats sont préparés à la commande dans une cuisine unique. Les
          descriptions, la composition et les allergènes de chaque article sont
          affichés sur la carte, sur la fiche de l&apos;article, avant l&apos;ajout au
          panier et sans manipulation supplémentaire.
        </P>
        <Strong>
          Quatorze allergènes à déclaration obligatoire sont signalés au titre
          du règlement (UE) n° 1169/2011 et du décret n° 2015-447. Ceux présents
          dans nos préparations sont récapitulés sur la{" "}
          <A href="/allergenes">page des allergènes</A>.
        </Strong>
        <P>
          La cuisine manipule sésame, gluten, lait et fruits à coque dans un
          même espace, et une même huile sert à plusieurs préparations frites.
          L&apos;absence de trace ne peut donc pas être garantie, même pour un
          article dont la recette ne contient pas l&apos;allergène. Une allergie
          sévère doit être signalée dans le champ de commentaire de la commande,
          ou par téléphone avant de commander.
        </P>
        <P>
          Les photographies éventuelles sont illustratives. Le dressage réel
          peut différer sans que le produit soit non conforme.
        </P>
      </Article>

      <Article n={4} title="Prix">
        {/*
         * Pas de "toutes taxes comprises", pas de HT, pas de ventilation.
         * L'entreprise relève de la franchise en base: le prix affiché est le
         * prix payé, et la seule mention fiscale à publier est celle de
         * l'article 293 B, rendue par vatMention().
         */}
        <P>
          Les prix sont indiqués en euros. Le prix affiché sur la carte est le
          prix payé par le client, sans supplément d&apos;aucune sorte, et le
          prix applicable est celui affiché au moment de la validation de la
          commande.
        </P>
        {vat ? <Strong>{vat}</Strong> : null}
        <P>
          {DELIVERY_FEE_CENTS !== null
            ? `Les frais de livraison s'élèvent à ${formatEuros(DELIVERY_FEE_CENTS)}`
            : "Les frais de livraison sont indiqués avant paiement"}
          {DELIVERY_FEE_CENTS !== null && FREE_DELIVERY_THRESHOLD_CENTS !== null
            ? `, offerts à partir de ${formatEuros(FREE_DELIVERY_THRESHOLD_CENTS)} de sous-total`
            : ""}
          . Le retrait sur place est sans frais. Le montant total, frais compris,
          est affiché avant le paiement.
        </P>
      </Article>

      <Article n={5} title="Commande">
        <P>
          Le client compose son panier, choisit la livraison ou le retrait, un
          créneau, puis saisit ses coordonnées. Aucun compte n&apos;est nécessaire:
          la connexion Google est proposée uniquement pour pré-remplir le
          formulaire et reste facultative.
        </P>
        <P>
          Un récapitulatif détaillé, articles, quantités, frais et total, est
          présenté avant le paiement. Le client peut corriger son panier jusqu&apos;à
          cette étape. La validation du paiement forme le contrat.
        </P>
        <P>
          Un email de confirmation, valant confirmation sur support durable au
          sens de l&apos;article L221-11 du code de la consommation, est adressé au
          client après encaissement. Il reprend le détail de la commande, le
          créneau et le montant payé.
        </P>
        <P>
          Conformément à l&apos;article L213-1 du code de la consommation, les
          commandes d&apos;un montant égal ou supérieur à 120 euros sont conservées
          pendant dix ans et le client peut en demander l&apos;accès à tout moment.
        </P>
      </Article>

      <Article n={6} title="Paiement">
        <Strong>
          Le paiement se fait exclusivement en ligne par carte bancaire, au
          moment de la commande. Aucun paiement en espèces n&apos;est accepté, ni à
          la livraison, ni au retrait.
        </Strong>
        <P>
          Le paiement est traité par Stripe sur une page sécurisée qui lui
          appartient. Les coordonnées bancaires sont saisies chez Stripe et ne
          sont ni reçues ni conservées par le vendeur.
        </P>
        <P>
          Tant que le paiement n&apos;est pas confirmé, la commande n&apos;est pas
          transmise à la cuisine. Un paiement refusé ou une session de paiement
          expirée laisse la commande sans suite, sans débit.
        </P>
      </Article>

      <Article n={7} title="Livraison">
        <P>
          La livraison est proposée dans les communes suivantes: {communes}.
          Les codes postaux desservis sont{" "}
          <span className="tabular">
            {DELIVERY_ZONES.map((zone) => zone.postcode).join(", ")}
          </span>
          . Une adresse hors de cette zone ne peut pas être servie en livraison;
          le retrait sur place reste possible.
        </P>
        <P>
          La commande est livrée pendant le créneau de {SLOT_MINUTES} minutes
          choisi par le client. Les créneaux sont proposés sur{" "}
          {SLOT_DAYS_AHEAD === 2 ? "le jour même et le lendemain" : `${SLOT_DAYS_AHEAD} jours`}
          , à partir d&apos;un délai de préparation de {LEAD_TIME_MINUTES} minutes,
          dans la limite des horaires de service.
        </P>
        <P>
          Le client doit être joignable au numéro indiqué et présent à l&apos;adresse
          pendant son créneau. En cas d&apos;absence après appel, la commande est
          conservée pendant trente minutes à la cuisine, où elle peut être
          retirée. Passé ce délai, elle est perdue et n&apos;est pas remboursée: il
          s&apos;agit de denrées périssables.
        </P>
        <P>
          Un créneau peut être dépassé en cas d&apos;affluence, d&apos;incident de
          circulation ou de force majeure. Le client en est informé par
          téléphone ou par email. Un retard n&apos;ouvre pas droit à indemnité, sans
          préjudice des articles L216-6 et L216-7 du code de la consommation
          lorsque la livraison n&apos;intervient pas dans un délai raisonnable.
        </P>
      </Article>

      <Article n={8} title="Retrait sur place">
        <P>
          Le retrait est sans frais. {COLLECTION_ADDRESS_LABEL}. L&apos;adresse exacte
          figure dans l&apos;email de confirmation. La commande est à retirer pendant
          le créneau choisi, sur présentation de la référence de commande.
        </P>
        <P>Horaires de service:</P>
        <Ul>
          {hours.map((line) => (
            <li key={line.days}>
              {/* Première lettre seulement: "Mardi à dimanche", pas
                  "Mardi À Dimanche". */}
              <span className="first-letter:uppercase">{line.days}</span>:{" "}
              {line.hours}
            </li>
          ))}
        </Ul>
      </Article>

      <Article n={9} title="Absence de droit de rétractation">
        <Strong>
          Le droit de rétractation de quatorze jours ne s&apos;applique pas aux
          commandes passées sur ce site.
        </Strong>
        <P>
          L&apos;article L221-28 du code de la consommation écarte ce droit pour les
          contrats de fourniture de biens susceptibles de se détériorer ou de se
          périmer rapidement, ce qui est le cas des plats préparés et des
          denrées fraîches vendus ici.
        </P>
        <P>
          Le même article l&apos;écarte également pour les prestations de restauration
          qui doivent être fournies à une date ou à une période déterminée, ce
          qui est le cas de toute commande rattachée à un créneau de livraison ou
          de retrait.
        </P>
        <P>
          Le client reconnaît en avoir été informé avant de valider sa commande.
          Cette exclusion ne prive le client d&apos;aucun de ses autres droits,
          notamment en cas de produit non conforme.
        </P>
      </Article>

      <Article n={10} title="Boissons alcoolisées">
        <Strong>
          La vente de boissons alcoolisées à des mineurs de moins de dix-huit ans
          est interdite, conformément à l&apos;article L3342-1 du code de la santé
          publique.
        </Strong>
        <P>
          Lorsque le panier contient une boisson alcoolisée, le client confirme
          sa majorité avant de payer. Une preuve d&apos;âge peut être demandée à la
          remise de la commande. En cas de refus ou de doute, la boisson n&apos;est
          pas remise et son montant est remboursé, le reste de la commande étant
          livré normalement.
        </P>
        <P>L&apos;abus d&apos;alcool est dangereux pour la santé, à consommer avec modération.</P>
      </Article>

      <Article n={11} title="Annulation et remboursement">
        <P>
          Le client ne peut pas annuler une commande une fois le paiement
          confirmé, la préparation démarrant immédiatement. Une demande formulée
          avant le début de la préparation est étudiée au cas par cas: écrire à{" "}
          {LEGAL.contactEmail ? (
            <A href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</A>
          ) : (
            "la cuisine"
          )}{" "}
          ou appeler.
        </P>
        <P>
          Le vendeur peut annuler une commande en cas de rupture d&apos;un article,
          d&apos;incident en cuisine, d&apos;adresse hors zone ou de force majeure. Dans ce
          cas, la commande est remboursée intégralement sur le moyen de paiement
          d&apos;origine. Le remboursement est déclenché au moment de l&apos;annulation et
          apparaît sous cinq à dix jours ouvrés selon la banque.
        </P>
      </Article>

      <Article n={12} title="Réclamations et conformité">
        <P>
          Une commande incomplète, non conforme ou impropre à la consommation
          doit être signalée le jour même, par téléphone ou par email, avec la
          référence de commande et si possible une photographie. Selon le cas, le
          produit est remplacé ou remboursé.
        </P>
        <P>
          Le vendeur répond de la garantie légale de conformité dans les
          conditions des articles L217-3 et suivants du code de la consommation,
          et de la garantie des vices cachés des articles 1641 et suivants du
          code civil. La nature périssable des produits limite en pratique la
          mise en oeuvre de ces garanties au jour de la livraison.
        </P>
      </Article>

      <Article n={13} title="Médiation de la consommation">
        <P>
          Conformément aux articles L612-1 et suivants du code de la
          consommation, le client a le droit de recourir gratuitement à un
          médiateur de la consommation en vue de la résolution amiable d&apos;un
          litige qui l&apos;oppose au vendeur.
        </P>
        <Strong>
          La saisine du médiateur est gratuite pour le client.
        </Strong>
        <P>
          Deux conditions encadrent cette saisine. Le client doit d&apos;abord
          avoir adressé une réclamation écrite au vendeur, par email ou par
          courrier, et ne pas avoir obtenu de réponse satisfaisante. Il dispose
          ensuite d&apos;un délai d&apos;un an à compter de cette réclamation
          écrite pour saisir le médiateur. Passé ce délai, la demande est
          irrecevable.
        </P>
        {LEGAL.mediatorName ? (
          <>
            <Rows>
              <Row label="Médiateur" value={LEGAL.mediatorName} />
              {LEGAL.mediatorAddress ? (
                <Row label="Adresse" value={LEGAL.mediatorAddress} />
              ) : null}
              {LEGAL.mediatorEmail ? (
                <Row
                  label="Email"
                  value={
                    <A href={`mailto:${LEGAL.mediatorEmail}`}>
                      {LEGAL.mediatorEmail}
                    </A>
                  }
                />
              ) : null}
              {LEGAL.mediatorUrl ? (
                <Row
                  label="Saisine"
                  value={<A href={LEGAL.mediatorUrl}>{LEGAL.mediatorUrl}</A>}
                />
              ) : null}
            </Rows>
            <P>
              CM2C est référencé par la Commission d&apos;évaluation et de
              contrôle de la médiation de la consommation. La liste officielle
              des médiateurs référencés est consultable sur{" "}
              <A href={LEGAL.mediationRegistryUrl}>
                economie.gouv.fr/mediation-conso
              </A>
              .
            </P>
            {!LEGAL.mediatorAddress ? (
              <div className="border border-meat-border bg-raised px-4 py-3">
                <p className="text-fine text-ink">
                  L&apos;adresse postale du médiateur sera publiée ici sous peu.
                  La saisine par email et en ligne, elle, est déjà possible
                  avec les coordonnées ci-dessus.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="border border-meat-border bg-raised px-4 py-3">
            <p className="text-fine text-ink">
              Les coordonnées du médiateur seront publiées ici dès la
              souscription du dispositif. En attendant, toute réclamation peut
              être adressée directement au vendeur, qui y répond.
            </p>
          </div>
        )}
      </Article>

      <Article n={14} title="Données personnelles">
        <P>
          Les données recueillies servent à préparer, livrer et facturer la
          commande. Leur traitement, les durées de conservation et les droits du
          client sont décrits dans la{" "}
          <A href="/confidentialite">politique de confidentialité</A>.
        </P>
      </Article>

      <Article n={15} title="Droit applicable et litiges">
        <P>
          Les présentes conditions sont soumises au droit français. En cas de
          litige, et à défaut de résolution amiable, les tribunaux français sont
          compétents. Le consommateur peut saisir soit la juridiction du lieu où
          il demeurait au moment de la conclusion du contrat, soit celle du lieu
          de livraison, soit celle du domicile du vendeur.
        </P>
        <P>
          Le vendeur peut modifier les présentes conditions. La version
          applicable à une commande est celle publiée au jour de cette commande.
        </P>
      </Article>
    </LegalPage>
  );
}
