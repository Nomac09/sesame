import { test } from "@playwright/test";

import {
  addToCart,
  chooseMode,
  commanderLink,
  fillContactDetails,
} from "./helpers";

/**
 * Captures d'écran, pour regarder la vitrine plutôt que la lire.
 *
 * Ce n'est pas un test: rien n'est affirmé ici. C'est un outil de relecture
 * visuelle, à lancer avec `npm run apercu`. Les fichiers atterrissent dans
 * test-results/apercu, qui est ignoré par git.
 */

const DIR = "test-results/apercu";

test("captures de la vitrine @capture", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: `${DIR}/01-carte-haut.png` });
  await page.screenshot({ path: `${DIR}/02-carte-entiere.png`, fullPage: true });

  await addToCart(page, "Houmous");
  await addToCart(page, "Feuilles de vigne");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/03-panier-barre.png` });

  await page.getByRole("button", { name: "Voir le détail du panier" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/04-panier-ouvert.png` });

  await commanderLink(page).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/05-commander-haut.png` });

  await chooseMode(page, "Livraison");
  await fillContactDetails(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/06-commander-entier.png`, fullPage: true });

  await page.goto("/merci?ref=SES-TGST");
  await page.screenshot({ path: `${DIR}/07-merci.png`, fullPage: true });
});

/**
 * Pages légales et porte de l'espace cuisine.
 *
 * Séparé de la capture du tunnel: ces pages ne dépendent ni du panier ni de
 * l'état de la boutique, donc elles se relisent seules, sans rejouer une
 * commande.
 */
test("captures des pages légales @capture", async ({ page }) => {
  const pages = [
    ["08-mentions-legales", "/mentions-legales"],
    ["09-cgv", "/cgv"],
    ["10-confidentialite", "/confidentialite"],
    ["11-allergenes", "/allergenes"],
    ["12-admin-connexion", "/admin/connexion"],
  ] as const;

  for (const [name, path] of pages) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });

    /*
     * Le pied de page précharge les autres pages légales. En développement,
     * ce préchargement échoue parfois côté RSC et Next se rabat sur une
     * navigation complète, qui interrompt alors la capture suivante. Passer
     * par une page vide coupe les préchargements en cours avant d'enchaîner.
     */
    await page.goto("about:blank");
  }
});
