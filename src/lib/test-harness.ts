/**
 * Harnais de test minimal, utilisé uniquement par les fichiers *.test.ts.
 * Volontairement sans dépendance: ces tests tournent sous tsx, pas sous un
 * runner complet, et doivent rester lisibles sans configuration.
 */

let passed = 0;
let failed = 0;

export function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

export function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${label}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${label}: ${(error as Error).message}`);
    failed++;
  }
}

export async function checkAsync(
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${label}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${label}: ${(error as Error).message}`);
    failed++;
  }
}

/** Vérifie qu'un appel lève une erreur satisfaisant le prédicat donné. */
export function expectError(
  label: string,
  matches: (error: unknown) => boolean,
  fn: () => unknown,
): void {
  check(label, () => {
    try {
      fn();
    } catch (error) {
      if (matches(error)) return;
      throw new Error(`erreur inattendue: ${error}`);
    }
    throw new Error("aucune erreur levée");
  });
}

/** Affiche le total et termine le process avec le bon code de sortie. */
export function summary(): void {
  console.log(`\n${passed} ok, ${failed} echecs`);
  process.exit(failed === 0 ? 0 : 1);
}
