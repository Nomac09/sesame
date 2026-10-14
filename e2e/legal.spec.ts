import { expect, test } from "@playwright/test";

import { expectNoHorizontalScroll } from "./helpers";

/**
 * Les pages légales décrivent un comportement. Ce fichier vérifie qu'elles ne
 * s'en écartent pas.
 *
 * Une politique de confidentialité qui décrit un traitement que le site ne fait
 * plus, ou une mention fiscale qui ne correspond pas au régime réel, sont des
 * déclarations fausses au client. Elles ne produisent aucune erreur, aucun
 * test unitaire ne les attrape, et elles ne se voient qu'en relisant la page.
 * D'où ces vérifications.
 */

test("les quatre pages légales sont joignables depuis n'importe où", async ({
  page,
}) => {
  await page.goto("/");

  for (const name of [
    "Conditions de vente",
    "Allergènes",
    "Confidentialité",
    "Mentions légales",
  ]) {
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name }),
    ).toBeVisible();
  }
});

/**
 * Plus aucune mention obligatoire ne manque.
 *
 * L'encart "Information à compléter" est piloté par `missingLegalFields()`:
 * il réapparaît dès qu'un champ de LEGAL repasse à null. Ce test est donc la
 * garde qui empêche une page légale de redevenir incomplète sans qu'on s'en
 * aperçoive, et il échouera bruyamment le jour où c'est le cas.
 */
test("aucune page légale ne signale d'information manquante", async ({
  page,
}) => {
  for (const path of [
    "/mentions-legales",
    "/cgv",
    "/confidentialite",
    "/allergenes",
  ]) {
    await page.goto(path);
    await expect(page.getByText("Information à compléter")).toHaveCount(0);
    await expect(page.getByText(/Champs manquants/)).toHaveCount(0);
    await page.goto("about:blank");
  }
});

test("les coordonnées postales du médiateur sont publiées", async ({ page }) => {
  await page.goto("/cgv");
  await expect(page.getByText("14 rue Saint Jean, 75017 Paris").first()).toBeVisible();

  // R616-1 demande les coordonnées postales ET électroniques.
  await expect(page.getByRole("link", { name: "cm2c@cm2c.net" }).first()).toBeVisible();

  // L'encart d'attente de l'adresse postale doit avoir disparu.
  await expect(page.getByText(/adresse postale du médiateur sera publiée/)).toHaveCount(0);
});

test("aucun numéro de TVA n'est publié, la mention 293 B l'est", async ({
  page,
}) => {
  for (const path of ["/mentions-legales", "/cgv", "/confidentialite"]) {
    await page.goto(path);

    // Franchise en base: pas de numéro, pas de ventilation, pas de HT / TTC.
    await expect(page.getByText(/FR\s?\d{2}\s?\d{9}/)).toHaveCount(0);
    await expect(page.getByText(/TVA intracommunautaire/)).toHaveCount(0);
    await expect(page.getByText(/dont TVA/)).toHaveCount(0);
    await expect(page.getByText(/toutes taxes comprises/)).toHaveCount(0);

    await page.goto("about:blank");
  }

  await page.goto("/mentions-legales");
  await expect(page.getByText(/TVA non applicable, article 293 B/)).toBeVisible();
  await expect(page.getByText("RCS Lille Métropole 123456789")).toBeVisible();
  await expect(page.getByText("12345678900012")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("la page de confidentialité décrit bien une attribution agrégée", async ({
  page,
}) => {
  await page.goto("/confidentialite");

  await expect(
    page.getByText(/n'est jamais rattaché à votre commande/),
  ).toBeVisible();
  await expect(page.getByText(/incrémente un simple compteur/)).toBeVisible();

  // L'ancienne rédaction promettait l'inverse. Elle ne doit pas revenir.
  await expect(page.getByText(/recopié sur la commande/)).toHaveCount(0);

  await expectNoHorizontalScroll(page);
});

test("le médiateur est publié dans les CGV et dans le pied de page", async ({
  page,
}) => {
  await page.goto("/cgv");

  await expect(page.getByText(/CM2C/).first()).toBeVisible();
  // Pas de comptage de liens ici: le nombre change dès qu'on ajoute une
  // coordonnée au médiateur, et une assertion qui casse pour cette raison
  // n'apprend rien. On vérifie que chacun des deux emplacements exigés porte
  // bien les coordonnées, l'article et le pied de page.
  await expect(page.getByRole("link", { name: "https://www.cm2c.net" })).toBeVisible();
  await expect(page.getByRole("link", { name: "cm2c@cm2c.net" }).first()).toBeVisible();
  await expect(page.getByText(/gratuite pour le client/)).toBeVisible();
  // Le délai d'un an figure dans l'article et rappelé en pied de page.
  await expect(page.getByText(/délai d'un an/).first()).toBeVisible();
  await expect(page.getByText(/Commission d'évaluation et de contrôle/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /economie\.gouv\.fr\/mediation-conso/ }),
  ).toBeVisible();

  await page.goto("about:blank");

  // R616-1 demande que le client puisse trouver ces coordonnées sans ouvrir
  // les conditions de vente: elles sont donc aussi en pied de page, partout.
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText(/Médiation de la consommation/)).toBeVisible();
  await expect(footer.getByText(/CM2C/)).toBeVisible();
  await expect(footer.getByRole("link", { name: "cm2c@cm2c.net" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "www.cm2c.net" })).toBeVisible();
});

test("les CGV portent les trois points imposés à la vente à distance", async ({
  page,
}) => {
  await page.goto("/cgv");

  // Rétractation: l'exclusion et son fondement.
  await expect(page.getByText(/ne s'applique pas aux commandes/)).toBeVisible();
  await expect(page.getByText(/L221-28/).first()).toBeVisible();

  // Allergènes.
  await expect(page.getByText(/1169\/2011/)).toBeVisible();

  // Zone et créneaux, tirés de la configuration et non écrits à la main.
  await expect(page.getByText("59910", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/créneau de 30 minutes/)).toBeVisible();

  // Alcool.
  await expect(page.getByText(/L3342-1/).first()).toBeVisible();

  await expectNoHorizontalScroll(page);
});
