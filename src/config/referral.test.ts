import {
  FIRST_ORDER_CODES,
  findFirstOrderCode,
  normaliseCode,
  referralDiscountCents,
  type FirstOrderCode,
} from "@/config/referral";
import { check, section, summary } from "@/lib/test-harness";

/**
 * Liste de test. La liste de production est vide et doit le rester tant
 * qu'aucune remise n'a été décidée; ces cas éprouvent les garde-fous sans
 * jamais activer quoi que ce soit en production.
 */
const FIXTURE: FirstOrderCode[] = [
  {
    code: "SAC5",
    discountCents: 500,
    label: "Code première commande",
    minSubtotalCents: 2000,
  },
  {
    // Remise volontairement supérieure à n'importe quel panier réaliste,
    // pour éprouver le plafonnement.
    code: "DEMESURE",
    discountCents: 100_000,
    label: "Remise démesurée",
    minSubtotalCents: 0,
  },
];

const discount = (code: string | null, subtotal: number) =>
  referralDiscountCents(code, subtotal, FIXTURE);

section("Seuil minimum de panier");

check("juste sous le seuil, aucune remise", () => {
  if (discount("SAC5", 1999) !== 0) throw new Error(String(discount("SAC5", 1999)));
});

check("au seuil exact, la remise s'applique", () => {
  if (discount("SAC5", 2000) !== 500) throw new Error(String(discount("SAC5", 2000)));
});

check("au-dessus du seuil, la remise s'applique", () => {
  if (discount("SAC5", 5000) !== 500) throw new Error(String(discount("SAC5", 5000)));
});

check("un panier vide ne declenche rien", () => {
  if (discount("SAC5", 0) !== 0) throw new Error(String(discount("SAC5", 0)));
});

section("Plafonnement de la remise");

check("une remise plus grande que le panier est ramenee au panier", () => {
  if (discount("DEMESURE", 750) !== 750) throw new Error(String(discount("DEMESURE", 750)));
});

check("le total ne peut jamais devenir negatif", () => {
  for (const subtotal of [0, 1, 100, 750, 3350, 99_999]) {
    const applied = discount("DEMESURE", subtotal);
    if (applied > subtotal) throw new Error(`remise ${applied} > panier ${subtotal}`);
    if (subtotal - applied < 0) throw new Error("total negatif");
  }
});

section("Codes inconnus et absents");

check("un code inconnu ne donne rien, meme avec une liste non vide", () => {
  for (const code of ["INCONNU", "SAC6", "sac", "DEMESUR"]) {
    if (discount(code, 5000) !== 0) throw new Error(`${code} a donne une remise`);
  }
});

check("null, undefined et chaine vide ne donnent rien", () => {
  if (referralDiscountCents(null, 5000, FIXTURE) !== 0) throw new Error("null");
  if (referralDiscountCents(undefined, 5000, FIXTURE) !== 0) throw new Error("undefined");
  if (discount("", 5000) !== 0) throw new Error("chaine vide");
});

check("la casse et les espaces n'empechent pas la correspondance", () => {
  if (discount("sac5", 5000) !== 500) throw new Error("minuscules");
  if (discount("  SaC5  ", 5000) !== 500) throw new Error("espaces");
  if (normaliseCode("  sac5 ") !== "SAC5") throw new Error(normaliseCode("  sac5 "));
});

check("findFirstOrderCode retrouve l'entree, ou rien", () => {
  if (findFirstOrderCode("SAC5", FIXTURE)?.discountCents !== 500) throw new Error("SAC5");
  if (findFirstOrderCode("INCONNU", FIXTURE) !== undefined) throw new Error("INCONNU");
});

section("La liste de production reste vide");

check("aucune remise n'est active en production", () => {
  if (FIRST_ORDER_CODES.length !== 0) {
    throw new Error(`${FIRST_ORDER_CODES.length} code(s) actif(s) en production`);
  }
});

check("meme SAC5 ne donne rien sans la liste de test", () => {
  if (referralDiscountCents("SAC5", 5000) !== 0) throw new Error("remise active");
});

summary();
