/**
 * Références de commande, format SES-4B2K.
 *
 * Lisible à voix haute au téléphone et recopiable sans ambiguïté: l'alphabet
 * exclut 0, 1, I et O. Doit rester aligné sur la contrainte de format de la
 * colonne orders.reference.
 */

import { randomBytes } from "node:crypto";

export const REFERENCE_PREFIX = "SES";
export const REFERENCE_LENGTH = 4;

/**
 * 32 caractères: chiffres 2 à 9, lettres A à Z sans I ni O.
 * 256 est un multiple exact de 32, donc le tirage par octet modulo la taille
 * de l'alphabet reste uniforme, sans biais à corriger.
 */
export const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Doit correspondre exactement au check de la colonne orders.reference. */
export const REFERENCE_PATTERN = /^SES-[2-9A-HJ-NP-Z]{4}$/;

export function generateReference(): string {
  const bytes = randomBytes(REFERENCE_LENGTH);
  let suffix = "";
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    suffix += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  }
  return `${REFERENCE_PREFIX}-${suffix}`;
}

export function isValidReference(reference: string): boolean {
  return REFERENCE_PATTERN.test(reference);
}

/** Code d'erreur Postgres pour une violation de contrainte d'unicité. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export const REFERENCE_MAX_ATTEMPTS = 5;

export interface InsertWithReferenceOptions {
  attempts?: number;
  /** Permet d'injecter une autre détection de collision, notamment en test. */
  isCollision?: (error: unknown) => boolean;
}

/**
 * Exécute une insertion avec une référence fraîche, en réessayant uniquement
 * sur collision d'unicité.
 *
 * La référence est tirée au hasard plutôt que dérivée d'un compteur, donc une
 * collision est possible même si elle est rare. On laisse la base trancher:
 * elle seule connaît les références déjà prises, et un contrôle préalable
 * ouvrirait une fenêtre de concurrence entre la lecture et l'écriture.
 * Toute autre erreur remonte immédiatement, sans réessai.
 */
export async function insertWithReference<T>(
  insert: (reference: string) => Promise<T>,
  { attempts = REFERENCE_MAX_ATTEMPTS, isCollision = isUniqueViolation }:
    InsertWithReferenceOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const reference = generateReference();
    try {
      return await insert(reference);
    } catch (error) {
      if (!isCollision(error)) throw error;
      lastError = error;
    }
  }
  throw new Error(
    `Impossible de générer une référence de commande unique après ${attempts} tentatives.`,
    { cause: lastError },
  );
}
