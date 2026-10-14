/**
 * Identité légale de l'entreprise, source unique des pages légales.
 *
 * Deux règles tiennent ce fichier:
 *
 * 1. Aucune valeur inventée. Un champ inconnu reste `null` avec un TODO, et
 *    les pages légales affichent alors un encart d'alerte au lieu de combler
 *    le trou avec une formule vague. Une mention légale fausse expose plus
 *    qu'une mention légale incomplète.
 * 2. Les durées de conservation et la liste des sous-traitants vivent ici et
 *    non dans le JSX de la politique de confidentialité. La page RGPD est un
 *    rendu de ces données, pas un texte à réécrire à la main.
 */

export const LEGAL = {
  /** Dénomination commerciale. */
  tradingName: "Sesame",

  /** Forme juridique. */
  legalForm: "Entreprise individuelle",

  /** Exploitant, personne physique. En EI, il n'y a pas de personne morale. */
  operatorName: "Prénom Nom",

  /** Dénomination complète telle qu'immatriculée. */
  legalName: "EI Prénom Nom",

  siren: "123456789",

  siret: "12345678900012" as string | null,

  /** Adresse du siège et de la cuisine. Livraison uniquement, pas de salle. */
  address: "1 rue de l'Exemple, 59910 Bondues, France" as string | null,

  /**
   * Régime de TVA: franchise en base, régime auto-entrepreneur.
   *
   * Conséquence directe et non négociable: aucun numéro de TVA
   * intracommunautaire n'est publié, et aucun écran ni aucun email n'affiche
   * de ligne de TVA, de ventilation "dont TVA" ni de découpage HT / TTC. Un
   * prix est un prix. La seule mention exigée est celle de l'article 293 B,
   * rendue par `vatMention()`, et elle doit figurer sur la facture du client,
   * c'est-à-dire sur l'email de confirmation.
   *
   * `vatNumber` reste nul par construction. Le renseigner sous ce régime
   * serait une fausse déclaration au client, pas un oubli d'affichage.
   */
  vatRegime: "franchise" as "franchise" | "assujetti" | null,
  vatNumber: null as string | null,

  /** Greffe d'immatriculation, relevé sur l'extrait d'immatriculation. */
  rcs: "RCS Lille Métropole 123456789" as string | null,

  /** Directeur de la publication. En EI, l'exploitant lui-même. */
  publicationDirector: "Prénom Nom" as string | null,

  /**
   * Hébergeur du site. Coordonnées publiques de Vercel.
   *
   * L'article 6 III de la LCEN demande aussi le téléphone de l'hébergeur.
   * Vercel ne publie pas de numéro d'assistance, seulement un formulaire.
   * L'URL ci-dessous tient lieu de moyen de contact, et l'écart est assumé.
   */
  hostName: "Vercel Inc." as string | null,
  hostAddress: "440 N Barranca Ave #4133, Covina, CA 91723, USA" as string | null,
  hostUrl: "https://vercel.com/help" as string | null,

  /**
   * Boîte réelle, relevée par la cuisine. Sert aussi d'expéditeur des emails
   * de confirmation, donc les réponses des clients y arrivent. Pas de
   * no-reply: un client qui répond à sa confirmation doit être lu.
   */
  contactEmail: "commandes@sesamerestaurant.fr" as string | null,

  /**
   * Ligne publiée, pour les commandes et les questions. Stockée en forme
   * internationale pour que `tel:` compose depuis l'étranger; `nationalPhone()`
   * la rend en "03 20 00 00 00" à l'écran.
   *
   * Numéro en 09, non surtaxé. Ce n'est pas un détail de présentation:
   * l'article L221-16 du code de la consommation interdit de faire payer un
   * supplément à un client qui appelle au sujet de sa commande, et le dire à
   * l'écran évite qu'on hésite à appeler.
   */
  contactPhone: "+33 3 20 00 00 00" as string | null,

  /** Vrai si la ligne publiée est au tarif normal, sans surcoût. */
  contactPhoneNonSurcharged: true,

  /**
   * Médiateur de la consommation, article L612-1 du code de la consommation.
   *
   * L'article R616-1 demande les coordonnées postales et électroniques du
   * médiateur, ainsi que l'adresse de son site. Les quatre valeurs ci-dessous
   * proviennent de l'attestation d'adhésion, et d'elle seule: une adresse de
   * médiateur recopiée d'ailleurs enverrait la réclamation d'un client dans
   * le vide.
   */
  mediatorName:
    "CM2C - Centre de la Médiation de la Consommation de Conciliateurs de Justice" as
      | string
      | null,
  mediatorAddress: "14 rue Saint Jean, 75017 Paris" as string | null,
  mediatorUrl: "https://www.cm2c.net" as string | null,

  /**
   * Adresse électronique du médiateur. L'article R616-1 demande les
   * coordonnées postales et électroniques: celle-ci couvre la seconde moitié,
   * et permet déjà une saisine pendant que l'adresse postale manque.
   */
  mediatorEmail: "cm2c@cm2c.net" as string | null,

  /**
   * Liste officielle des médiateurs référencés, tenue par la Commission
   * d'évaluation et de contrôle de la médiation de la consommation.
   *
   * Publiée à côté du nom du médiateur: elle permet à un client de vérifier
   * lui-même que le dispositif annoncé est bien référencé, sans avoir à nous
   * croire sur parole.
   */
  mediationRegistryUrl: "https://www.economie.gouv.fr/mediation-conso",
} as const;

/** Numéro de téléphone en forme lisible: "+33 6 12 34 56 78" -> "06 12 34 56 78". */
export function nationalPhone(): string | null {
  if (!LEGAL.contactPhone) return null;
  const digits = LEGAL.contactPhone.replace(/[^0-9+]/g, "");
  if (!digits.startsWith("+33")) return LEGAL.contactPhone;
  const national = `0${digits.slice(3)}`;
  return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

/**
 * Mention de TVA à afficher, ou null tant que le régime n'est pas tranché.
 * Les deux formes s'excluent: publier un numéro sous franchise serait faux,
 * omettre le numéro en étant assujetti le serait aussi.
 */
export function vatMention(): string | null {
  if (LEGAL.vatRegime === "franchise") {
    return "TVA non applicable, article 293 B du code général des impôts.";
  }
  if (LEGAL.vatRegime === "assujetti" && LEGAL.vatNumber) {
    return `Numéro de TVA intracommunautaire: ${LEGAL.vatNumber}.`;
  }
  return null;
}

/**
 * Coordonnées du médiateur, en lignes de texte brut.
 *
 * Sert aux emails, qui n'ont pas de mise en page. Renvoie un tableau vide tant
 * qu'aucun médiateur n'est renseigné, pour qu'un email ne parte jamais avec un
 * intitulé "Médiation" suivi de rien.
 */
export function mediatorLines(): string[] {
  if (!LEGAL.mediatorName) return [];

  return [
    "Médiation de la consommation",
    `  ${LEGAL.mediatorName}`,
    ...(LEGAL.mediatorAddress ? [`  ${LEGAL.mediatorAddress}`] : []),
    ...(LEGAL.mediatorEmail ? [`  ${LEGAL.mediatorEmail}`] : []),
    ...(LEGAL.mediatorUrl ? [`  ${LEGAL.mediatorUrl}`] : []),
    `  Liste officielle des médiateurs: ${LEGAL.mediationRegistryUrl}`,
    "  Saisine gratuite, dans un délai d'un an après une réclamation écrite",
    "  restée sans réponse satisfaisante.",
  ];
}

/**
 * Sous-traitants au sens du RGPD, avec le pays d'hébergement réel des données.
 *
 * Le projet Supabase tourne en us-east-1 et Stripe, Resend et Vercel sont des
 * sociétés américaines: le transfert hors Union européenne est réel et doit
 * être annoncé, pas passé sous silence.
 */
export interface Processor {
  name: string;
  purpose: string;
  /** Pays ou zone d'hébergement des données confiées. */
  location: string;
  /** Vrai si les données sortent de l'Union européenne. */
  outsideEu: boolean;
  privacyUrl: string;
}

export const PROCESSORS: Processor[] = [
  {
    name: "Stripe Payments Europe, Ltd.",
    purpose:
      "Encaissement du paiement par carte et remboursement en cas d'annulation. Les coordonnées bancaires sont saisies chez Stripe et ne transitent jamais par ce site.",
    location: "Irlande, avec traitements aux États-Unis",
    outsideEu: true,
    privacyUrl: "https://stripe.com/fr/privacy",
  },
  {
    name: "Supabase, Inc.",
    purpose:
      "Base de données des commandes et gestion de la connexion Google facultative.",
    location: "États-Unis, région us-east-1",
    outsideEu: true,
    privacyUrl: "https://supabase.com/privacy",
  },
  {
    name: "Vercel Inc.",
    purpose: "Hébergement du site et journaux techniques du serveur.",
    location: "États-Unis, diffusion depuis la région de Paris",
    outsideEu: true,
    privacyUrl: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "Resend, Inc.",
    purpose:
      "Envoi des emails de confirmation de commande et des bons de cuisine.",
    location: "États-Unis",
    outsideEu: true,
    privacyUrl: "https://resend.com/legal/privacy-policy",
  },
  {
    name: "Google Ireland Limited",
    purpose:
      "Connexion Google facultative, utilisée uniquement pour pré-remplir le formulaire. Aucun compte n'est nécessaire pour commander.",
    location: "Irlande, avec traitements aux États-Unis",
    outsideEu: true,
    privacyUrl: "https://policies.google.com/privacy",
  },
];

/**
 * Traitements, finalité et base légale, article 13 du RGPD.
 *
 * Une base légale par finalité, et pas une base unique pour tout le
 * traitement: le consentement à la prospection est retirable, l'exécution du
 * contrat ne l'est pas, et confondre les deux rendrait le retrait impossible
 * à honorer.
 */
export interface Purpose {
  data: string;
  purpose: string;
  basis: string;
}

export const PURPOSES: Purpose[] = [
  {
    data: "Nom, prénom, téléphone, email.",
    purpose:
      "Identifier la commande, envoyer la confirmation, joindre le client pendant la préparation ou la livraison.",
    basis: "Exécution du contrat de vente.",
  },
  {
    data: "Adresse de livraison et code postal.",
    purpose: "Livrer la commande et vérifier qu'elle relève de la zone desservie.",
    basis:
      "Exécution du contrat. Ces champs ne sont pas demandés en retrait sur place.",
  },
  {
    data: "Contenu du panier, créneau, montants, commentaire éventuel.",
    purpose: "Préparer la commande, tenir la comptabilité, traiter une réclamation.",
    basis: "Exécution du contrat et obligation légale comptable.",
  },
  {
    data: "Confirmation de majorité, uniquement si le panier contient de l'alcool.",
    purpose: "Respecter l'interdiction de vente d'alcool aux mineurs.",
    basis: "Obligation légale, article L3342-1 du code de la santé publique.",
  },
  {
    data: "Identifiants de paiement Stripe rattachés à la commande.",
    purpose:
      "Rapprocher un paiement, un remboursement ou une contestation avec la commande correspondante.",
    basis: "Exécution du contrat et obligation légale de conservation.",
  },
  {
    data: "Adresse email, si la case dédiée est cochée.",
    purpose: "Envoyer les nouveautés de la carte.",
    basis:
      "Consentement, jamais pré-coché, retirable à tout moment depuis chaque message.",
  },
  {
    data: "Compte Google, si la connexion facultative est utilisée.",
    purpose: "Pré-remplir le formulaire de commande.",
    basis:
      "Consentement. Aucun compte n'est nécessaire pour commander, et la connexion peut être ignorée.",
  },
];

/**
 * Durées de conservation, exprimées telles qu'elles seront lues par un client.
 * La base légale accompagne chaque ligne: sans elle, une durée n'est qu'un
 * chiffre invérifiable.
 */
export interface RetentionRule {
  data: string;
  duration: string;
  basis: string;
}

export const RETENTION: RetentionRule[] = [
  {
    data: "Commandes et pièces comptables: articles commandés, montants, mode de retrait, adresse de livraison.",
    duration: "10 ans à compter de la clôture de l'exercice",
    basis:
      "Obligation légale de conservation des livres et pièces comptables, article L123-22 du code de commerce.",
  },
  {
    data: "Coordonnées du client: nom, téléphone, email.",
    duration: "3 ans après la dernière commande ou le dernier contact",
    basis:
      "Intérêt légitime à traiter les réclamations et à reconnaître un client qui revient. Les mêmes données figurant sur une pièce comptable suivent la durée ci-dessus.",
  },
  {
    data: "Consentement à recevoir les nouveautés de la carte par email.",
    duration: "Jusqu'au retrait du consentement, et au plus 3 ans après le dernier contact",
    basis: "Consentement, retirable à tout moment sans justification.",
  },
  {
    data: "Journal technique des événements de paiement Stripe.",
    duration: "12 mois",
    basis:
      "Intérêt légitime: retrouver l'origine d'un paiement contesté ou d'une commande non transmise.",
  },
  {
    data: "Cookie de mesure déposé par un QR code ou un lien de campagne.",
    duration: "60 jours dans le navigateur",
    basis:
      "Exemption de consentement: le code n'est rattaché à aucune commande et n'alimente qu'un compteur par support, sans donnée personnelle.",
  },
  {
    data: "Compteur de commandes par support imprimé.",
    duration: "Conservé sans limite",
    basis:
      "Donnée non personnelle: un code, une date et un nombre. Rien ne permet d'y retrouver une personne ou une commande.",
  },
];

/**
 * Champs encore manquants, pour signaler une page légale incomplète.
 *
 * `vatNumber` n'est pas compté quand le régime est la franchise en base: dans
 * ce cas, l'absence de numéro est la réponse correcte et non une lacune.
 */
export function missingLegalFields(): string[] {
  const exempt = new Set<string>(
    LEGAL.vatRegime === "franchise" ? ["vatNumber"] : [],
  );

  return Object.entries(LEGAL)
    .filter(([key, value]) => value === null && !exempt.has(key))
    .map(([key]) => key);
}

/**
 * Vrai quand une mention obligatoire pour la vente à distance manque encore.
 * Sert à afficher un avertissement en haut des pages légales, pour qu'un
 * trou ne parte pas en production sans se voir.
 */
export function hasBlockingLegalGap(): boolean {
  return missingLegalFields().length > 0;
}
