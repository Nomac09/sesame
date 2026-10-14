import {
  REFERENCE_ALPHABET,
  REFERENCE_PATTERN,
  generateReference,
  insertWithReference,
  isUniqueViolation,
  isValidReference,
} from "@/lib/reference";
import { check, checkAsync, section, summary } from "@/lib/test-harness";

section("Format des références");
check("mille tirages respectent tous le format de la colonne", () => {
  for (let i = 0; i < 1000; i++) {
    const reference = generateReference();
    if (!REFERENCE_PATTERN.test(reference)) {
      throw new Error(`référence invalide: ${reference}`);
    }
  }
});
check("aucun caractère ambigu n'est jamais tiré", () => {
  const forbidden = /[01IO]/;
  for (let i = 0; i < 1000; i++) {
    const suffix = generateReference().slice(4);
    if (forbidden.test(suffix)) throw new Error(`caractère ambigu: ${suffix}`);
  }
});
check("l'alphabet complet est atteignable, aucun caractère mort", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20000; i++) {
    for (const char of generateReference().slice(4)) seen.add(char);
  }
  const missing = [...REFERENCE_ALPHABET].filter((char) => !seen.has(char));
  if (missing.length > 0) throw new Error(`jamais tirés: ${missing.join("")}`);
});
check("l'alphabet divise 256, donc le tirage reste non biaisé", () => {
  if (256 % REFERENCE_ALPHABET.length !== 0) {
    throw new Error(`taille ${REFERENCE_ALPHABET.length}, biais de modulo`);
  }
});

section("Validation");
check("une référence bien formée est acceptée", () => {
  if (!isValidReference("SES-4B2K")) throw new Error("refusée à tort");
});
check("les caractères ambigus sont rejetés", () => {
  for (const bad of ["SES-01IO", "SES-0B2K", "SES-1B2K", "SES-IB2K", "SES-OB2K"]) {
    if (isValidReference(bad)) throw new Error(`acceptée à tort: ${bad}`);
  }
});
check("les formats hors norme sont rejetés", () => {
  for (const bad of ["SES-4B2", "SES-4B2KK", "4B2K", "ses-4b2k", "SES4B2K", ""]) {
    if (isValidReference(bad)) throw new Error(`acceptée à tort: ${bad}`);
  }
});

section("Détection des collisions");
check("le code Postgres 23505 est reconnu", () => {
  if (!isUniqueViolation({ code: "23505" })) throw new Error("non reconnu");
});
check("les autres erreurs ne sont pas des collisions", () => {
  for (const other of [{ code: "23503" }, new Error("réseau"), null, undefined, "23505"]) {
    if (isUniqueViolation(other)) throw new Error(`faux positif: ${String(other)}`);
  }
});

section("Insertion avec réessai");
const collision = () => Object.assign(new Error("duplicate key"), { code: "23505" });

async function main(): Promise<void> {
  await checkAsync("une insertion qui passe du premier coup n'est pas rejouée", async () => {
    let calls = 0;
    const result = await insertWithReference(async (reference) => {
      calls++;
      return reference;
    });
    if (calls !== 1) throw new Error(`${calls} appels`);
    if (!isValidReference(result)) throw new Error(result);
  });

  await checkAsync("deux collisions puis un succès donnent trois appels", async () => {
    let calls = 0;
    const seen: string[] = [];
    const result = await insertWithReference(async (reference) => {
      calls++;
      seen.push(reference);
      if (calls < 3) throw collision();
      return reference;
    });
    if (calls !== 3) throw new Error(`${calls} appels`);
    if (new Set(seen).size !== 3) throw new Error("référence rejouée à l'identique");
    if (result !== seen[2]) throw new Error("mauvaise référence renvoyée");
  });

  await checkAsync("après le nombre maximum de tentatives, on abandonne", async () => {
    let calls = 0;
    try {
      await insertWithReference(async () => {
        calls++;
        throw collision();
      }, { attempts: 3 });
    } catch (error) {
      if (calls !== 3) throw new Error(`${calls} appels`);
      if (!(error as Error).message.includes("3 tentatives")) {
        throw new Error((error as Error).message);
      }
      return;
    }
    throw new Error("aucune erreur levée");
  });

  await checkAsync("une erreur qui n'est pas une collision remonte sans réessai", async () => {
    let calls = 0;
    try {
      await insertWithReference(async () => {
        calls++;
        throw new Error("connexion perdue");
      });
    } catch (error) {
      if (calls !== 1) throw new Error(`${calls} appels, il y a eu réessai`);
      if ((error as Error).message !== "connexion perdue") {
        throw new Error("erreur d'origine masquée");
      }
      return;
    }
    throw new Error("aucune erreur levée");
  });

  summary();
}

void main();
