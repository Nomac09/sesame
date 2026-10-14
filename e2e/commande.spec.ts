import { expect, test } from "@playwright/test";

import {
  addToCart,
  centsFromText,
  addToCartTimes,
  chooseFirstSlot,
  chooseMode,
  cleanUpTestOrders,
  commanderLink,
  euro,
  formAlert,
  expectNoHorizontalScroll,
  fillContactDetails,
  latestTestOrder,
  orderItems,
  TEST_EMAIL,
} from "./helpers";

/**
 * Le parcours qui prend l'argent.
 *
 * Ces tests s'arrêtent à la redirection vers Stripe. Ils vérifient qu'une
 * session de paiement est créée, que le navigateur y arrive, et surtout que la
 * commande écrite en base porte bien le montant affiché au client. Aucun moyen
 * de paiement n'est saisi: au-delà de la redirection, c'est Stripe qui est
 * testé, pas cette application.
 */

test.afterAll(async () => {
  await cleanUpTestOrders();
});

test("la carte est lisible et toute la carte des boissons est proposée", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Sesame", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Houmous" })).toBeVisible();
  await expect(page.getByText(euro(750)).first()).toBeVisible();

  // Les allergènes sont visibles sur la fiche, jamais derrière une fenêtre.
  await expect(page.getByText("Allergènes: sésame").first()).toBeVisible();

  // Petite licence: bière et vin.
  await expect(page.getByRole("heading", { name: "Bière blonde" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Vin rouge libanais, Bekaa" }),
  ).toBeVisible();

  // Grande licence, désormais détenue: les spiritueux sont proposés.
  await expect(page.getByRole("heading", { name: "Arak / Ouzo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pastis Ricard" })).toBeVisible();

  // Le numéro de commande par téléphone est joignable sans défiler.
  await expect(page.getByRole("link", { name: /Commander par téléphone/ })).toBeVisible();

  await expectNoHorizontalScroll(page);
});

/**
 * L'avertissement de l'article L3342-1 doit accompagner l'alcool partout où il
 * apparaît, et non seulement dans les conditions de vente. Trois surfaces: le
 * panier, le récapitulatif de commande et la case de confirmation d'âge.
 */
test("l'avertissement d'âge suit l'alcool du panier au paiement", async ({
  page,
}) => {
  await page.goto("/");

  // Panier sans alcool: aucun avertissement.
  await addToCart(page, "Houmous");
  await page.getByRole("button", { name: "Voir le détail du panier" }).click();
  await expect(page.getByText(/L3342-1/)).toHaveCount(0);

  await addToCart(page, "Bière blonde");
  await expect(
    page.getByTestId("barre-panier").getByText(/L3342-1/),
  ).toBeVisible();

  await commanderLink(page).click();

  // Récapitulatif et case à cocher portent tous deux la mention.
  await expect(page.getByText(/L3342-1/).first()).toBeVisible();
  await expect(page.getByText(/interdite aux mineurs/).first()).toBeVisible();
  await expect(page.getByText(/à consommer avec modération/).first()).toBeVisible();

  await expectNoHorizontalScroll(page);
});

test("ajouter, ajuster et vider le panier", async ({ page }) => {
  await page.goto("/");

  const commander = commanderLink(page);
  await expect(commander).toHaveCount(0);

  await addToCart(page, "Houmous");
  await expect(commander).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter un Houmous" })).toBeVisible();

  // Deuxième appui: le compteur suit.
  await page.getByRole("button", { name: "Ajouter un Houmous" }).click();
  await expect(page.getByText("2 Houmous au panier")).toBeAttached();

  // Le détail s'ouvre et montre le prix unitaire.
  await page.getByRole("button", { name: "Voir le détail du panier" }).click();
  await expect(page.getByText(euro(750, "l'unité")).first()).toBeVisible();

  await expectNoHorizontalScroll(page);

  // Retirer les deux fait disparaître la barre.
  const minus = page.getByRole("button", { name: "Retirer un Houmous" }).first();
  await minus.click();
  await page
    .getByRole("button", { name: "Retirer Houmous du panier" })
    .first()
    .click();
  await expect(commander).toHaveCount(0);
});

test("le panier survit à un rechargement", async ({ page }) => {
  await page.goto("/");
  await addToCart(page, "Baba ghanouj");
  await expect(commanderLink(page)).toBeVisible();

  await page.reload();
  await expect(commanderLink(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ajouter un Baba ghanouj" }),
  ).toBeVisible();
});

test("retrait: du panier à la redirection Stripe, au bon montant", async ({
  page,
}) => {
  await page.goto("/");
  await addToCart(page, "Houmous");
  await addToCart(page, "Taboulé");

  await commanderLink(page).click();
  await expect(page).toHaveURL(/\/commander/);

  // Le mode est choisi d'abord: il change les frais, donc le total. Le lire
  // avant reviendrait à comparer le montant d'un autre mode.
  await chooseMode(page, "Retrait sur place");

  // Le total affiché au client, que le serveur devra confirmer au centime.
  const displayed = centsFromText(
    (await page.getByTestId("total-indicatif").textContent()) ?? "",
  );
  expect(displayed).toBe(1500); // 7,50 + 7,50, retrait, sans frais

  await fillContactDetails(page);

  // Premier créneau proposé.
  await chooseFirstSlot(page);

  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Payer en ligne" }).click();

  // La redirection part vers Stripe en mode test.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  expect(page.url()).toContain("checkout.stripe.com");

  // Ce que le serveur a réellement enregistré.
  const order = await latestTestOrder();
  expect(order, "aucune commande écrite en base").not.toBeNull();
  expect(order!.mode).toBe("retrait");
  expect(order!.status).toBe("en_attente_paiement");
  expect(order!.postcode).toBeNull();
  expect(order!.stripe_session_id).toMatch(/^cs_test_/);

  // La propriété qui compte: l'affiché et le débité sont le même nombre.
  expect(order!.total_cents).toBe(displayed);
  expect(order!.delivery_fee_cents).toBe(0);

  const items = await orderItems(order!.reference);
  expect(items.map((line) => line.item_id).sort()).toEqual(["houmous", "taboule"]);
});

test("livraison: les champs suivent le mode, et la zone est contrôlée", async ({
  page,
}) => {
  await page.goto("/");
  await addToCart(page, "Houmous");
  await commanderLink(page).click();

  // En retrait, aucun champ d'adresse.
  await chooseMode(page, "Retrait sur place");
  await expect(page.locator("#addressLine")).toHaveCount(0);

  // En livraison, ils apparaissent.
  await chooseMode(page, "Livraison");
  await expect(page.locator("#addressLine")).toBeVisible();
  await expect(page.locator("#postcode")).toBeVisible();

  await fillContactDetails(page);
  await page.locator("#addressLine").fill("12 rue de la Gare");

  // Un code hors zone doit produire un message lisible, pas un code technique.
  await page.locator("#postcode").fill("75001");
  await chooseFirstSlot(page);
  await page.getByRole("button", { name: "Payer en ligne" }).click();

  const alert = formAlert(page);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Nous ne livrons pas encore à cette adresse");
  // Aucun identifiant technique ne doit fuir vers le client.
  await expect(alert).not.toContainText("hors_zone");

  // Un code dans la zone est reconnu et nommé.
  await page.locator("#postcode").fill("59910");
  await expect(page.getByText("Bondues, dans la zone de livraison.")).toBeVisible();
});

test("livraison: les frais apparaissent et disparaissent au seuil", async ({
  page,
}) => {
  await page.goto("/");
  await addToCart(page, "Houmous");
  await commanderLink(page).click();
  await chooseMode(page, "Livraison");

  // Sous le seuil: les frais sont annoncés.
  await expect(page.getByText("Livraison").last()).toBeVisible();
  await expect(page.getByText(euro(350)).first()).toBeVisible();

  // Au-dessus du seuil de 30 €: la livraison est offerte.
  await page.goto("/");
  await addToCartTimes(page, "Fattouche", 4);
  await commanderLink(page).click();
  await chooseMode(page, "Livraison");
  await expect(page.getByText("Offerte")).toBeVisible();
});

test("alcool: la confirmation d'âge est exigée", async ({ page }) => {
  await page.goto("/");
  await addToCart(page, "Bière blonde");
  await commanderLink(page).click();
  await chooseMode(page, "Retrait sur place");

  const ageBox = page.getByRole("checkbox", { name: /18 ans ou plus/ });
  await expect(ageBox).toBeVisible();

  await fillContactDetails(page);
  await chooseFirstSlot(page);
  await page.getByRole("button", { name: "Payer en ligne" }).click();

  // Non cochée, le serveur refuse en français.
  const alert = formAlert(page);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("confirmer votre âge");
  await expect(alert).not.toContainText("age_non_confirme");
});

test("la commande est refusée sans email valide, sans code technique", async ({
  page,
}) => {
  await page.goto("/");
  await addToCart(page, "Houmous");
  await commanderLink(page).click();
  await chooseMode(page, "Retrait sur place");

  await page.locator("#firstName").fill("Camille");
  await page.locator("#lastName").fill("Durand");
  await page.locator("#phone").fill("0612345678");
  await page.locator("#email").fill("pas-un-email");
  await chooseFirstSlot(page);
  await page.getByRole("button", { name: "Payer en ligne" }).click();

  const alert = formAlert(page);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("vérifier les informations saisies");
  await expect(alert).not.toContainText("champ_invalide");
});

test("la page de remerciement affiche la référence sans donnée personnelle", async ({
  page,
}) => {
  // Crée une commande réelle, puis consulte sa page de retour.
  await page.goto("/");
  await addToCart(page, "Houmous");
  await commanderLink(page).click();
  await chooseMode(page, "Retrait sur place");
  await fillContactDetails(page);
  await chooseFirstSlot(page);
  await page.getByRole("button", { name: "Payer en ligne" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  const order = await latestTestOrder();
  expect(order).not.toBeNull();

  await page.goto(`/merci?ref=${order!.reference}`);
  await expect(page.getByText(order!.reference)).toBeVisible();

  // Le paiement n'est pas confirmé: la page dit l'attente, pas une erreur.
  await expect(
    page.getByRole("heading", { name: /Paiement en cours de confirmation/ }),
  ).toBeVisible();

  // Aucune donnée personnelle sur une page dont l'URL est devinable.
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body).not.toContain(TEST_EMAIL);
  expect(body).not.toContain("Camille");
  expect(body).not.toContain("0612345678");

  await expectNoHorizontalScroll(page);
});

test("une référence inconnue ne révèle rien", async ({ page }) => {
  await page.goto("/merci?ref=SES-ZZZZ");
  await expect(
    page.getByRole("heading", { name: "Commande introuvable" }),
  ).toBeVisible();
});
