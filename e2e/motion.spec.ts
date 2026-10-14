import { expect, test } from "@playwright/test";

import { addToCart, commanderLink } from "./helpers";

/**
 * Preuve que `prefers-reduced-motion` atteint réellement le navigateur.
 *
 * Ces tests existent à cause d'une erreur réelle: `reducedMotion` avait été
 * placé à la racine de `use` au lieu de `contextOptions`. Playwright l'ignore
 * silencieusement à cet endroit. Le projet "mouvement réduit" tournait donc
 * sans la préférence, et tout passait au vert en n'éprouvant rien.
 *
 * La leçon est générale: un test qui n'observe que les conséquences d'un
 * réglage ne peut pas distinguer "le réglage est appliqué et tout va bien" de
 * "le réglage n'est jamais arrivé". On vérifie donc d'abord le réglage
 * lui-même, puis ses effets sur chacune des deux couches.
 */

/** Vrai si le projet courant est censé demander moins de mouvement. */
function expectsReducedMotion(projectName: string): boolean {
  return projectName.includes("reduced-motion");
}

test("la préférence de mouvement atteint le navigateur", async ({ page }, info) => {
  await page.goto("/");

  const applied = await page.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  expect(
    applied,
    `Le projet ${info.project.name} devrait ${
      expectsReducedMotion(info.project.name) ? "" : "ne pas "
    }appliquer prefers-reduced-motion, mais le navigateur rapporte ${applied}.`,
  ).toBe(expectsReducedMotion(info.project.name));
});

test("la couche CSS répond à la préférence", async ({ page }, info) => {
  await page.goto("/");

  // globals.css réduit toute transition à 0,01ms sous la préférence. On lit
  // donc la durée calculée d'un élément quelconque: c'est déterministe, sans
  // dépendre d'un instant précis de l'animation.
  const duration = await page.evaluate(() => {
    const probe = document.querySelector("h1");
    return probe ? getComputedStyle(probe).transitionDuration : null;
  });

  expect(duration).not.toBeNull();
  const seconds = Number.parseFloat(duration!);

  if (expectsReducedMotion(info.project.name)) {
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThan(0.001);
  } else {
    expect(seconds).toBe(0);
  }
});

test("la couche JavaScript répond à la préférence", async ({ page }, info) => {
  await page.goto("/");
  await addToCart(page, "Houmous");

  const bar = page.locator("[data-testid='barre-panier']");
  await expect(bar).toBeVisible();

  // Une fois l'animation terminée, la barre est au même endroit dans les deux
  // cas. La différence est dans le chemin: avec mouvement, Framer Motion
  // anime `y` et laisse une transformation en style inline; en mouvement
  // réduit, le preset ne touche qu'à l'opacité et ne pose aucune
  // transformation.
  await page.waitForTimeout(600);
  const inlineTransform = await bar.evaluate(
    (el) => (el as HTMLElement).style.transform,
  );

  if (expectsReducedMotion(info.project.name)) {
    expect(
      inlineTransform,
      "En mouvement réduit, aucune transformation ne doit être posée sur la barre.",
    ).toBe("");
  } else {
    expect(
      inlineTransform,
      "Avec mouvement, Framer Motion doit avoir animé la barre en translation.",
    ).not.toBe("");
  }

  // Dans les deux cas la barre finit lisible et utilisable: réduire le
  // mouvement ne doit jamais retirer une fonction.
  await expect(commanderLink(page)).toBeVisible();
});
