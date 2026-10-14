"use client";

import { useTransition } from "react";

import { signOutAdmin } from "@/app/admin/actions";

/**
 * Déconnexion. Discrète et en bas de page: c'est le geste le moins fréquent de
 * cet espace, et le plus regrettable en plein service si on l'appuie par
 * erreur.
 */
export function SignOut() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOutAdmin())}
      className="label mt-3 min-h-12 rounded-full border border-field px-5 text-muted disabled:opacity-40"
    >
      {pending ? "Déconnexion" : "Se déconnecter"}
    </button>
  );
}
