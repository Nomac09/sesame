import { A, Article, LegalPage, P, Strong, Ul } from "@/components/legal/prose";
import {
  LEGAL,
  PROCESSORS,
  PURPOSES,
  RETENTION,
  nationalPhone,
} from "@/config/legal";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from "@/config/referral";
import { STORAGE_KEY } from "@/lib/cart-storage";

export const metadata = {
  title: "Politique de confidentialité, Sesame",
  description:
    "Données collectées lors d'une commande, finalités, durées de conservation, destinataires et droits des clients.",
};

/**
 * Politique de confidentialité, articles 12 à 14 du RGPD.
 *
 * Les finalités, les durées et les sous-traitants viennent de
 * src/config/legal.ts, et les identifiants de cookies des modules qui les
 * posent réellement. Une politique de confidentialité qui décrit un cookie
 * que le site ne dépose plus, ou qui en oublie un, est fausse: la seule
 * défense est de la brancher sur le code.
 */

const CNIL_ADDRESS = "3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07";

/** Bloc à trois lignes: la donnée, ce qu'on en fait, ce qui l'autorise. */
function Entry({
  data,
  first,
  second,
  firstLabel,
  secondLabel,
}: {
  data: string;
  first: string;
  second: string;
  firstLabel: string;
  secondLabel: string;
}) {
  return (
    <div className="rule-b py-3.5">
      <p className="text-fine text-ink">{data}</p>
      <p className="mt-1.5 text-micro text-muted">
        <span className="label text-terracotta">{firstLabel}</span> {first}
      </p>
      <p className="mt-1 text-micro text-muted">
        <span className="label text-terracotta">{secondLabel}</span> {second}
      </p>
    </div>
  );
}

export default function ConfidentialitePage() {
  const phone = nationalPhone();

  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Ce que ce site collecte quand vous commandez, pourquoi, combien de temps, qui y a accès et comment reprendre la main."
    >
      <Article title="Responsable du traitement">
        <P>
          {LEGAL.legalName}
          {LEGAL.address ? `, ${LEGAL.address}` : ""}. Contact pour toute
          question relative aux données:{" "}
          {LEGAL.contactEmail ? (
            <A href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</A>
          ) : (
            "voir les mentions légales"
          )}
          {phone ? (
            <>
              {" "}
              ou <span className="tabular">{phone}</span>
            </>
          ) : null}
          .
        </P>
        <P>
          L&apos;entreprise n&apos;est pas tenue de désigner un délégué à la protection des
          données: son activité principale n&apos;implique ni suivi à grande échelle,
          ni traitement de données sensibles.
        </P>
      </Article>

      <Article title="Ce que nous ne faisons pas">
        <Ul>
          <li>Aucun compte obligatoire. Commander en invité est le chemin normal.</li>
          <li>Aucune revente, aucune location, aucun échange de fichier client.</li>
          <li>
            Aucun cookie publicitaire, aucun pixel de réseau social, aucun outil
            de mesure d&apos;audience tiers.
          </li>
          <li>
            Aucune coordonnée bancaire n&apos;est reçue ni conservée par ce site: la
            saisie a lieu chez Stripe.
          </li>
          <li>Aucune décision automatisée, aucun profilage.</li>
        </Ul>
      </Article>

      <Article title="Données collectées et finalités">
        <div className="mt-1">
          {PURPOSES.map((purpose) => (
            <Entry
              key={purpose.data}
              data={purpose.data}
              firstLabel="Usage"
              first={purpose.purpose}
              secondLabel="Base légale"
              second={purpose.basis}
            />
          ))}
        </div>
        <P>
          Les champs marqués comme obligatoires dans le formulaire de commande
          sont nécessaires pour préparer et remettre la commande. Sans eux, la
          commande ne peut pas être honorée. Le commentaire libre est
          facultatif: n&apos;y indiquez pas d&apos;information de santé au-delà de ce qui
          est utile à la préparation, comme une allergie.
        </P>
      </Article>

      <Article title="Qui accède à ces données">
        <P>
          En interne, la cuisine seule, pour préparer et remettre les commandes.
          En externe, les prestataires suivants agissent comme sous-traitants,
          sur instruction et pour la seule exécution du service.
        </P>
        <div className="mt-1">
          {PROCESSORS.map((processor) => (
            <Entry
              key={processor.name}
              data={processor.name}
              firstLabel="Rôle"
              first={processor.purpose}
              secondLabel="Hébergement"
              second={`${processor.location}. ${processor.outsideEu ? "Transfert hors Union européenne." : "Union européenne."}`}
            />
          ))}
        </div>
        <Strong>
          Une partie de ces traitements a lieu aux États-Unis. Ces transferts
          sont encadrés par les clauses contractuelles types de la Commission
          européenne, complétées le cas échéant par l&apos;adhésion du prestataire au
          cadre de protection des données UE - États-Unis. Les politiques de
          confidentialité de chaque prestataire sont accessibles ci-dessous.
        </Strong>
        <Ul>
          {PROCESSORS.map((processor) => (
            <li key={processor.name}>
              {processor.name}: <A href={processor.privacyUrl}>{processor.privacyUrl}</A>
            </li>
          ))}
        </Ul>
        <P>
          Ces données peuvent également être communiquées à une autorité
          administrative ou judiciaire qui en fait la demande dans les formes
          légales.
        </P>
      </Article>

      <Article title="Durées de conservation">
        <div className="mt-1">
          {RETENTION.map((rule) => (
            <Entry
              key={rule.data}
              data={rule.data}
              firstLabel="Durée"
              first={rule.duration}
              secondLabel="Motif"
              second={rule.basis}
            />
          ))}
        </div>
        <P>
          À l&apos;expiration de ces durées, les données sont supprimées. Les données
          figurant sur une pièce comptable ne peuvent pas être effacées avant le
          terme légal, même à la demande du client: elles sont alors simplement
          retirées de tout autre usage.
        </P>
      </Article>

      <Article title="Cookies et stockage local">
        <P>
          Ce site n&apos;affiche pas de bandeau de consentement parce qu&apos;il ne dépose
          aucun cookie de publicité ni de mesure d&apos;audience. Trois éléments
          seulement sont écrits dans votre navigateur.
        </P>
        <Ul>
          <li>
            <span className="text-ink">Panier</span>, stockage local{" "}
            <span className="tabular">{STORAGE_KEY}</span>: conserve les articles
            choisis entre deux pages et jusqu&apos;à la commande. Strictement
            nécessaire au service demandé, donc exempté de consentement. Il reste
            dans le navigateur, n&apos;est jamais lu par le serveur et se vide avec
            l&apos;historique du navigateur.
          </li>
          <li>
            <span className="text-ink">Session de connexion</span>, cookies posés
            par Supabase: uniquement si vous utilisez la connexion Google
            facultative, ou pour l&apos;accès à l&apos;espace de gestion de la cuisine.
            Nécessaire au fonctionnement de la connexion demandée. Disparaît à la
            déconnexion.
          </li>
          <li>
            <span className="text-ink">Mesure des supports imprimés</span>,
            cookie <span className="tabular">{REFERRAL_COOKIE}</span>, conservé{" "}
            <span className="tabular">{REFERRAL_COOKIE_DAYS}</span> jours: déposé
            seulement si vous arrivez par un lien ou un QR code portant un code,
            par exemple celui imprimé sur un sac. Il sert uniquement à compter
            combien de commandes chaque support a produites. Il ne suit aucune
            navigation sur d&apos;autres sites.
          </li>
        </Ul>
        <Strong>
          Ce code n&apos;est jamais rattaché à votre commande. Il n&apos;est
          écrit ni sur votre commande, ni à côté de votre nom, de votre email ou
          de votre adresse: il incrémente un simple compteur, par code et par
          jour, qui ne contient aucune donnée permettant de remonter à une
          personne. C&apos;est pour cette raison que ce site ne vous demande pas
          de consentement aux cookies: aucun de ceux qu&apos;il dépose ne
          construit de profil.
        </Strong>
        <P>
          Vous pouvez supprimer ces éléments à tout moment depuis les réglages de
          votre navigateur. La suppression du panier vide votre sélection en
          cours; celle du cookie de mesure n&apos;a aucun effet sur vos commandes,
          ni passées ni futures.
        </P>
      </Article>

      <Article title="Vos droits">
        <P>
          Le règlement général sur la protection des données vous ouvre les
          droits suivants sur vos données.
        </P>
        <Ul>
          <li>Accès: obtenir une copie des données vous concernant.</li>
          <li>Rectification: corriger une donnée inexacte ou incomplète.</li>
          <li>
            Effacement: demander la suppression, sous réserve des durées légales
            de conservation comptable.
          </li>
          <li>Limitation: geler l&apos;usage de vos données le temps d&apos;une contestation.</li>
          <li>
            Opposition: vous opposer à un traitement fondé sur l&apos;intérêt légitime.
          </li>
          <li>
            Portabilité: recevoir dans un format lisible les données que vous avez
            fournies.
          </li>
          <li>
            Retrait du consentement: à tout moment, pour les nouveautés de la
            carte et pour la connexion Google, sans effet sur ce qui a été
            légalement fait auparavant.
          </li>
          <li>
            Directives post-mortem: définir le sort de vos données après votre
            décès, article 85 de la loi Informatique et Libertés.
          </li>
        </Ul>
        <P>
          Pour exercer ces droits, écrivez à{" "}
          {LEGAL.contactEmail ? (
            <A href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</A>
          ) : (
            "l'adresse figurant dans les mentions légales"
          )}
          , en précisant si possible la référence d&apos;une commande. Une réponse est
          apportée dans un délai d&apos;un mois, prolongeable de deux mois pour une
          demande complexe. Une pièce d&apos;identité peut être demandée en cas de
          doute sérieux sur l&apos;identité du demandeur, et pour ce seul usage.
        </P>
        <P>
          Vous pouvez également introduire une réclamation auprès de la
          Commission nationale de l&apos;informatique et des libertés, {CNIL_ADDRESS},{" "}
          <A href="https://www.cnil.fr">www.cnil.fr</A>.
        </P>
      </Article>

      <Article title="Sécurité">
        <P>
          Le site est servi en HTTPS. Les données de commande sont stockées dans
          une base à accès restreint, où les règles de sécurité s&apos;appliquent au
          niveau des lignes: la lecture des commandes est réservée au compte de
          la cuisine, authentifié. Le paiement est délégué à un prestataire
          certifié PCI DSS. Les échanges avec ce prestataire sont
          cryptographiquement signés et vérifiés avant tout traitement.
        </P>
      </Article>

      <Article title="Mineurs">
        <P>
          Ce site ne s&apos;adresse pas aux enfants et ne collecte pas sciemment leurs
          données. La vente de boissons alcoolisées est réservée aux personnes
          majeures.
        </P>
      </Article>

      <Article title="Modifications">
        <P>
          Cette politique peut évoluer avec le service. La version applicable est
          celle publiée sur cette page. Un changement affectant vos droits sera
          signalé lors de votre prochaine commande.
        </P>
      </Article>
    </LegalPage>
  );
}
