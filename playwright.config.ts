import { defineConfig, devices } from "@playwright/test";

/**
 * Parcours de bout en bout.
 *
 * Le téléphone est la cible réelle, donc le projet par défaut est un iPhone à
 * 390px de large. Un second projet rejoue le même parcours avec
 * `prefers-reduced-motion: reduce`, parce qu'une animation qui ne respecte pas
 * la préférence ne se voit pas en la lisant dans le code.
 *
 * Les tests pilotent Stripe en mode test et s'arrêtent à la redirection: ils
 * vérifient qu'une session de paiement est bien créée et que le navigateur y
 * arrive, sans jamais saisir de moyen de paiement.
 */
export default defineConfig({
  testDir: "./e2e",
  // Les tests écrivent des commandes en base et basculent l'état de la
  // boutique: en parallèle ils se marcheraient dessus.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  /*
   * apercu.spec.ts ne teste rien, il photographie. Il est écarté des
   * exécutions normales et ne se lance que via `npm run apercu`.
   */
  grepInvert: process.env.E2E_CAPTURE ? undefined : /@capture/,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "mobile",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "mobile-reduced-motion",
      use: {
        ...devices["iPhone 14"],
        // `reducedMotion` vit dans contextOptions, pas à la racine de `use`.
        // Placé à la racine il est silencieusement ignoré: les tests passent
        // en croyant éprouver la préférence, sans qu'elle atteigne jamais le
        // navigateur. C'est pour cela que motion.spec.ts vérifie la
        // préférence elle-même et pas seulement ses effets.
        contextOptions: { reducedMotion: "reduce" },
      },
    },
  ],

  // Réutilise le serveur déjà lancé, sinon en démarre un.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
