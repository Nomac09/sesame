"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase du navigateur.
 *
 * Utilisé à deux endroits seulement: la connexion Google de l'espace cuisine,
 * et l'abonnement temps réel au flux de commandes. Il porte la clé publique et
 * la session de l'utilisateur, donc tout ce qu'il lit passe par RLS. Aucune
 * donnée de commande n'est accessible sans la session de l'admin, y compris
 * pour un visiteur qui ouvrirait la console.
 *
 * Les deux variables sont écrites en toutes lettres et non lues par une clé
 * calculée: le compilateur remplace `process.env.NEXT_PUBLIC_X` par sa valeur
 * dans le bundle, mais seulement quand il voit le nom littéralement. Un
 * `process.env[nom]` compilerait sans broncher et renverrait `undefined` dans
 * le navigateur.
 *
 * `createBrowserClient` renvoie déjà une instance unique par couple
 * url + clé. La fonction existe pour donner une erreur nommée plutôt qu'un
 * `undefined` opaque quand l'environnement est incomplet.
 */

export function browserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquante. L'espace cuisine ne peut pas se connecter.",
    );
  }

  return createBrowserClient(url, key);
}
