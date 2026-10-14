import type { NextConfig } from "next";

/**
 * Hôte des photos de la carte.
 *
 * Dérivé de NEXT_PUBLIC_SUPABASE_URL plutôt que recopié: le projet Supabase
 * n'est pas le même en préproduction et en production, et une URL figée ici
 * ferait échouer l'optimisation d'images sur l'un des deux.
 */
function supabaseImageHost(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

const imageHost = supabaseImageHost();

const nextConfig: NextConfig = {
  /*
   * L'indicateur de développement se place en bas à gauche, exactement où vit
   * la barre du panier. Il ne capte pas seulement le regard sur les captures
   * d'écran: il intercepte les clics, ce qui faisait échouer le parcours de
   * bout en bout sur le bouton de détail du panier. Déplacé en haut à droite,
   * où rien n'est cliquable.
   */
  devIndicators: {
    position: "top-right",
  },

  images: {
    // Autorisation limitée au chemin public du bucket des photos, et non à
    // l'hôte entier: l'optimiseur d'images ne doit pas pouvoir servir de relais
    // vers d'autres chemins du projet Supabase.
    remotePatterns: imageHost
      ? [
          {
            protocol: "https",
            hostname: imageHost,
            pathname: "/storage/v1/object/public/menu-photos/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
