import { AdminNav } from "@/app/admin/AdminNav";
import { requireAdminPage } from "@/lib/admin-guard";

export const metadata = {
  title: "Commandes, cuisine Sesame",
  robots: { index: false, follow: false },
};

/**
 * Coquille de l'espace cuisine.
 *
 * La porte est ici: `requireAdminPage()` s'exécute avant le rendu de la moindre
 * page du groupe. La page de connexion vit délibérément hors de ce groupe,
 * sans quoi elle exigerait d'être déjà connecté pour s'afficher.
 *
 * Pas de panier, pas de pied de page légal: cet écran ne s'adresse pas à un
 * client. Il partage seulement les couleurs et les fontes de la vitrine, pour
 * que la même main lise les deux sans changer de repères.
 */
export default async function CuisineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="min-h-dvh">
      {/*
       * Le rembourrage bas dégage la barre de navigation fixe, et
       * `env(safe-area-inset-bottom)` la maintient au-dessus de la barre de
       * gestes des iPhone récents.
       */}
      <main className="pb-28">{children}</main>
      <AdminNav />
    </div>
  );
}
