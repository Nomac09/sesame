import type { Metadata } from "next";
import { Lora, Poppins } from "next/font/google";

import "./globals.css";

/**
 * Lora pour l'affichage, Poppins pour le texte courant, comme la carte
 * imprimée. `display: swap` pour que le texte de la carte soit lisible avant
 * que les fontes arrivent: un client qui a faim ne doit pas attendre une
 * police pour lire un prix.
 */
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Sesame, cuisine palestinienne à Bondues",
  description:
    "Mezzés palestiniens préparés à la commande. Livraison dans la métropole lilloise et retrait sur place à Bondues.",
};

/**
 * Layout racine, réduit au strict nécessaire: la langue, les fontes, le fond.
 *
 * Le panier et le pied de page légal ne vivent plus ici mais dans le layout du
 * groupe (site). L'espace de gestion de la cuisine partage les mêmes fontes et
 * les mêmes couleurs, mais ne doit ni monter le panier, ni afficher les liens
 * destinés aux clients.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${lora.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
