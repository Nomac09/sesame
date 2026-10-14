"use client";

import { useState } from "react";

import { browserClient } from "@/lib/supabase/client";

/**
 * Bouton de connexion Google.
 *
 * Client, parce que le flux PKCE commence dans le navigateur: la bibliothèque
 * y génère un secret éphémère, le dépose en cookie, puis Google renvoie un
 * code que `/auth/callback` échange contre une session. Déclencher cela depuis
 * le serveur casserait le lien entre le secret et le code.
 *
 * `redirectTo` est construit depuis l'origine réelle et non depuis une
 * constante: préproduction, production et localhost n'ont pas le même
 * domaine, et une URL figée renverrait la cuisine sur le mauvais déploiement.
 * Chaque origine utilisée doit être déclarée dans les URL de redirection du
 * projet Supabase.
 */

export function GoogleButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);

    try {
      const supabase = browserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/admin`,
          // Le téléphone de la cuisine peut porter plusieurs comptes Google.
          // Sans cela, Google reconnecte silencieusement le dernier utilisé,
          // qui n'est pas forcément le bon.
          queryParams: { prompt: "select_account" },
        },
      });

      if (authError) throw authError;
      // Succès: la page part vers Google. On laisse `pending` à true, l'état
      // de chargement doit durer jusqu'à la navigation.
    } catch (caught) {
      console.error("[auth] connexion Google impossible", caught);
      setError(
        "La connexion n'a pas pu démarrer. Vérifiez la connexion réseau et réessayez.",
      );
      setPending(false);
    }
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="label w-full rounded-full bg-olive px-4 py-4 text-bone disabled:opacity-40"
      >
        {pending ? "Ouverture de Google" : "Se connecter avec Google"}
      </button>

      {error ? (
        <p className="mt-3 text-fine text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
