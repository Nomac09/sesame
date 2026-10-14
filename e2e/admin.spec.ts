import { expect, test } from "@playwright/test";

/**
 * Porte de l'espace cuisine.
 *
 * Ce fichier ne teste pas ce que l'admin voit une fois connecté: il teste ce
 * qu'un visiteur non connecté ne voit pas. C'est la partie vérifiable sans
 * compte Google, et c'est aussi la partie dont l'échec serait le plus grave,
 * puisqu'une commande porte le nom, le téléphone et l'adresse d'un client.
 *
 * La redirection n'est que la première des trois barrières. Les deux autres
 * vivent en base, dans la policy `admin_read_orders` et dans l'absence totale
 * de policy d'écriture sur `orders`, et ne peuvent pas être éprouvées depuis un
 * navigateur puisqu'aucune requête n'y parvient.
 */

const PROTECTED = ["/admin", "/admin/reglages"];

for (const path of PROTECTED) {
  test(`${path} renvoie un visiteur non connecté vers la connexion`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/connexion/);

    // Aucune donnée de commande ne doit avoir traversé la redirection.
    await expect(page.getByRole("heading", { name: "Cuisine" })).toBeVisible();
    await expect(page.getByText(/SES-/)).toHaveCount(0);
  });
}

test("la page de connexion n'offre aucune inscription", async ({ page }) => {
  await page.goto("/admin/connexion");

  // Un seul bouton d'authentification, et pas de formulaire de mot de passe.
  await expect(
    page.getByRole("button", { name: "Se connecter avec Google" }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
});

test("le retour de connexion refuse un code absent", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/admin\/connexion\?erreur=code_absent/);
  await expect(page.getByText(/retour de Google était incomplet/)).toBeVisible();
});
