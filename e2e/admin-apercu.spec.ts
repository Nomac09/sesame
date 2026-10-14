import { expect, test } from "@playwright/test";

import { expectNoHorizontalScroll, signInAsAdmin } from "./helpers";

/**
 * L'espace cuisine, connecté, à 390px.
 *
 * Ce fichier fait deux choses que les autres ne peuvent pas faire: il vérifie
 * les écrans qui n'existent qu'une fois authentifié, et il les photographie
 * pour qu'on puisse les regarder plutôt que les lire.
 *
 * La session est fabriquée par l'API d'administration de Supabase, hors du
 * site. Le contrôle d'accès n'est pas contourné pour autant: le layout compare
 * toujours l'email à ADMIN_EMAIL, et la base applique toujours ses policies.
 * Seul l'écran de Google, qu'un navigateur piloté ne sait pas franchir, est
 * évité.
 */

const DIR = "test-results/apercu";

test.describe("espace cuisine connecté", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAsAdmin(context, baseURL ?? "http://localhost:3000");
  });

  test("le flux de commandes s'affiche @capture", async ({ page }) => {
    await page.goto("/admin");

    // La porte s'est ouverte: on est bien sur le flux et non renvoyé.
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Commandes" })).toBeVisible();

    // Les filtres et leurs compteurs.
    await expect(page.getByRole("button", { name: /En cours/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Prêtes/ })).toBeVisible();

    // Le son est coupé tant qu'aucun appui ne l'a autorisé.
    await expect(page.getByRole("button", { name: "Activer le son" })).toBeVisible();

    // On attend l'ouverture du WebSocket avant de photographier: une capture
    // prise à la seconde du chargement montre "Hors ligne" et donne une fausse
    // idée de l'écran. La connexion elle-même est vérifiée plus bas.
    await expect(page.getByText("En direct")).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: `${DIR}/13-admin-flux.png`, fullPage: true });
    await expectNoHorizontalScroll(page);
  });

  test("les réglages s'affichent et se manipulent d'une main @capture", async ({
    page,
  }) => {
    await page.goto("/admin/reglages");

    await expect(page.getByRole("heading", { name: "Réglages" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Boutique ouverte/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Livraison proposée/ }),
    ).toBeVisible();

    // Disponibilité: un article par ligne, toute la carte visible.
    await expect(page.getByRole("button", { name: /Houmous/ })).toBeVisible();
    await expect(page.getByText(/Tous les articles de la carte/)).toBeVisible();

    await page.screenshot({ path: `${DIR}/14-admin-reglages.png`, fullPage: true });
    await expectNoHorizontalScroll(page);
  });

  test("la navigation basse mène d'un écran à l'autre", async ({ page }) => {
    await page.goto("/admin");

    const nav = page.getByRole("navigation", { name: "Espace cuisine" });
    await nav.getByRole("link", { name: "Réglages" }).click();
    await expect(page).toHaveURL(/\/admin\/reglages$/);

    await nav.getByRole("link", { name: "Commandes" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});

/**
 * Le temps réel doit finir par se connecter.
 *
 * Séparé des captures parce qu'il demande d'attendre l'ouverture d'un
 * WebSocket, et parce que son échec ne doit pas être confondu avec un défaut
 * d'affichage: RLS s'applique aussi au temps réel, donc un abonnement refusé
 * signalerait un problème d'autorisation, pas de rendu.
 */
test("le temps réel se connecte avec la session admin", async ({
  context,
  baseURL,
  page,
}) => {
  await signInAsAdmin(context, baseURL ?? "http://localhost:3000");
  await page.goto("/admin");

  await expect(page.getByText("En direct")).toBeVisible({ timeout: 20_000 });
});
