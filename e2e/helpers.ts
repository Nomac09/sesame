import { expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Accès direct à la base pour les assertions de bout en bout.
 *
 * Les tests tournent dans Node, pas dans le navigateur: la clé de service ne
 * quitte jamais le processus de test. Elle sert à vérifier ce que le serveur a
 * réellement écrit, et à nettoyer les commandes créées par les tests.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis. Lancer via `npm run test:e2e`, qui charge .env.local.",
  );
}

/** Adresse utilisée par tous les tests, et seule clé de nettoyage. */
export const TEST_EMAIL = "playwright@exemple.fr";

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export interface OrderRow {
  reference: string;
  status: string;
  mode: string;
  total_cents: number;
  subtotal_cents: number;
  delivery_fee_cents: number;
  postcode: string | null;
  stripe_session_id: string | null;
}

/** Dernière commande écrite par les tests, ou null. */
export async function latestTestOrder(): Promise<OrderRow | null> {
  const response = await rest(
    `orders?email=eq.${encodeURIComponent(TEST_EMAIL)}&order=created_at.desc&limit=1&select=reference,status,mode,total_cents,subtotal_cents,delivery_fee_cents,postcode,stripe_session_id`,
  );
  const rows = (await response.json()) as OrderRow[];
  return rows[0] ?? null;
}

export async function orderItems(
  reference: string,
): Promise<{ item_id: string; quantity: number; line_total_cents: number }[]> {
  const orders = (await (
    await rest(`orders?reference=eq.${reference}&select=id`)
  ).json()) as { id: string }[];
  if (!orders[0]) return [];
  return (await (
    await rest(
      `order_items?order_id=eq.${orders[0].id}&select=item_id,quantity,line_total_cents`,
    )
  ).json()) as { item_id: string; quantity: number; line_total_cents: number }[];
}

/**
 * Supprime les commandes de test. Ciblé sur l'adresse de test uniquement, pour
 * qu'un lancement accidentel contre une base peuplée ne touche rien d'autre.
 */
export async function cleanUpTestOrders(): Promise<void> {
  const orders = (await (
    await rest(`orders?email=eq.${encodeURIComponent(TEST_EMAIL)}&select=id`)
  ).json()) as { id: string }[];

  for (const order of orders) {
    await rest(`order_items?order_id=eq.${order.id}`, { method: "DELETE" });
    await rest(`orders?id=eq.${order.id}`, { method: "DELETE" });
  }
}

/** Bascule un réglage de la boutique. Restaurer dans un finally. */
export async function setFlag(flag: string, enabled: boolean): Promise<void> {
  await rest(`settings?key=eq.${flag}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

/** Marque un article épuisé, ou le remet en stock. */
export async function setItemAvailable(
  itemId: string,
  available: boolean,
): Promise<void> {
  await rest("item_availability", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ item_id: itemId, available }),
  });
}

/**
 * Convertit "7,50 EUR" en 750.
 *
 * Intl.NumberFormat insère une espace fine insécable (U+202F) avant le symbole
 * euro. La classe \s la couvre, un espace ordinaire non.
 */
export function centsFromText(text: string): number {
  const match = text.replace(/\s/gu, "").match(/(\d+),(\d{2})/);
  if (!match) throw new Error(`Prix illisible: ${text}`);
  return Number(match[1]) * 100 + Number(match[2]);
}

/**
 * Expression tolérante pour un prix formaté.
 *
 * Comparer un montant à une chaîne littérale échoue de façon déroutante à
 * cause de cette même espace fine: le texte se lit pareil à l'écran et ne
 * correspond pas. Toute assertion portant sur un prix passe par ici.
 */
export function euro(cents: number, suffix?: string): RegExp {
  const whole = Math.floor(cents / 100);
  const decimals = String(cents % 100).padStart(2, "0");
  // \s+ et non \s*: un suffixe doit être réellement séparé du montant. Avec
  // \s*, "7,50 €l'unité" passait pour correct, ce qui a laissé filer un vrai
  // défaut d'affichage.
  const tail = suffix ? `\\s+${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` : "";
  return new RegExp(`${whole},${decimals}\\s*\u20ac${tail}`);
}

/** Choisit le mode de retrait en cliquant le libellé, comme un client. */
export async function chooseMode(
  page: Page,
  label: "Livraison" | "Retrait sur place",
): Promise<void> {
  await page
    .getByRole("radiogroup", { name: "Mode de retrait" })
    .getByText(label, { exact: true })
    .click();
}

/** Choisit le premier créneau proposé. */
export async function chooseFirstSlot(page: Page): Promise<void> {
  await page
    .getByRole("radiogroup", { name: "Heure du créneau" })
    .getByRole("radio")
    .first()
    .click();
}

/**
 * Ouvre une vraie session admin dans le navigateur de test.
 *
 * La connexion réelle passe par Google, qu'un navigateur piloté ne peut pas
 * traverser. Plutôt que d'ajouter au site une porte d'entrée de test, ce qui
 * reviendrait à créer un second chemin d'authentification à sécuriser, on
 * fabrique la session par l'API d'administration de Supabase, hors du site,
 * et on dépose le cookie que la bibliothèque aurait écrit.
 *
 * La session obtenue est authentique: même utilisateur, même jeton signé,
 * mêmes règles RLS. Rien n'est contourné, ni le contrôle de l'email dans le
 * layout, ni les policies de la base. Seul l'écran de Google est court-circuité.
 *
 * Le format du cookie est celui de @supabase/ssr: `base64-` suivi du JSON de
 * la session en base64url, sous le nom `sb-<ref>-auth-token`, découpé au-delà
 * de 3180 caractères.
 */
const COOKIE_CHUNK_SIZE = 3180;

export async function signInAsAdmin(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!email || !anonKey) {
    throw new Error(
      "ADMIN_EMAIL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requis pour ouvrir une session admin.",
    );
  }

  const admin = createClient(url!, key!, { auth: { persistSession: false } });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link.properties?.hashed_token) {
    throw new Error(`Lien de connexion impossible: ${linkError?.message}`);
  }

  const anon = createClient(url!, anonKey, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (verifyError || !verified.session) {
    throw new Error(`Session impossible: ${verifyError?.message}`);
  }

  const projectRef = new URL(url!).hostname.split(".")[0];
  const name = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(
    JSON.stringify(verified.session),
    "utf8",
  ).toString("base64url")}`;

  // Même règle que createChunks: un seul cookie tant que la valeur tient,
  // des cookies suffixés .0, .1 au-delà.
  const cookies =
    encodeURIComponent(encoded).length <= COOKIE_CHUNK_SIZE
      ? [{ name, value: encoded }]
      : (encoded.match(new RegExp(`.{1,${COOKIE_CHUNK_SIZE}}`, "g")) ?? []).map(
          (value, index) => ({ name: `${name}.${index}`, value }),
        );

  // domaine + chemin plutôt qu'url: Playwright refuse les deux à la fois, et
  // le couple explicite pose le cookie à la racine, comme le ferait le site.
  const target = new URL(baseURL);

  await context.addCookies(
    cookies.map((cookie) => ({
      ...cookie,
      domain: target.hostname,
      path: "/",
      httpOnly: false,
      secure: target.protocol === "https:",
      sameSite: "Lax" as const,
    })),
  );
}

/**
 * Le lien "Commander" de la barre de panier.
 *
 * Restreint à la barre: l'en-tête de la carte porte désormais un lien
 * "Commander par téléphone", et un sélecteur par rôle et par nom attrape les
 * deux. Le passer par cette fonction évite que le prochain lien contenant le
 * mot "commander" ne casse dix tests d'un coup.
 */
export function commanderLink(page: Page) {
  return page.getByTestId("barre-panier").getByRole("link", { name: "Commander" });
}

/** Ajoute un article à la carte par son nom affiché. */
export async function addToCart(page: Page, itemName: string): Promise<void> {
  await page
    .getByRole("button", { name: `Ajouter ${itemName} au panier`, exact: true })
    .click();
}

/** Remplit les coordonnées du client de test. */
export async function fillContactDetails(page: Page): Promise<void> {
  await page.locator("#firstName").fill("Camille");
  await page.locator("#lastName").fill("Durand");
  await page.locator("#phone").fill("0612345678");
  await page.locator("#email").fill(TEST_EMAIL);
}

/**
 * Vérifie qu'aucun débordement horizontal n'existe.
 *
 * Le cahier des charges impose 390px comme cible réelle: une page qui défile
 * latéralement y est immédiatement pénible, et c'est le défaut le plus courant
 * d'une mise en page conçue au large.
 */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `La page déborde de ${overflow.scrollWidth - overflow.clientWidth}px`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/**
 * Le message d'erreur du formulaire.
 *
 * Restreint au formulaire: Next monte un annonceur de route global qui porte
 * lui aussi role="alert", et un sélecteur non restreint attraperait les deux.
 */
export function formAlert(page: Page) {
  return page.locator("form").getByRole("alert").first();
}

/**
 * Ajoute le même article plusieurs fois.
 *
 * Après le premier ajout, le bouton "Ajouter X au panier" a laissé place au
 * compteur: les appuis suivants visent "Ajouter un X". Répéter le premier
 * sélecteur échouerait, ce qui est exactement le piège que ce parcours doit
 * éviter de tendre à quiconque écrira le prochain test.
 */
export async function addToCartTimes(
  page: Page,
  itemName: string,
  times: number,
): Promise<void> {
  await addToCart(page, itemName);
  for (let i = 1; i < times; i++) {
    await page.getByRole("button", { name: `Ajouter un ${itemName}` }).click();
  }
}
