import { Availability } from "@/app/admin/Availability";
import { SettingsToggles } from "@/app/admin/SettingsToggles";
import { SignOut } from "@/app/admin/SignOut";
import { ADMIN_EMAIL } from "@/config/admin";
import { VISIBLE_MENU } from "@/config/menu";
import { getStoreState } from "@/lib/store-state";

export const metadata = {
  title: "Réglages, cuisine Sesame",
  robots: { index: false, follow: false },
};

/**
 * Réglages du jour.
 *
 * Trois choses, dans l'ordre d'urgence: fermer la boutique, suspendre la
 * livraison, marquer un article épuisé. Les deux premières se voient en haut,
 * sans défilement, parce qu'on les cherche quand quelque chose va mal.
 *
 * `getStoreState()` lit la même chose que la vitrine, avec le même client
 * public et sans cache. Ce que la cuisine voit ici est donc exactement ce que
 * le client verra au prochain chargement de la carte: aucune traduction, aucun
 * décalage possible entre les deux écrans.
 */
export default async function ReglagesPage() {
  const state = await getStoreState();

  const categories = VISIBLE_MENU.map((category) => ({
    id: category.id,
    name: category.name,
    items: category.items.map((item) => ({
      id: item.id,
      name: item.name,
      available: !state.unavailableItemIds.has(item.id),
    })),
  }));

  const unavailableCount = categories.reduce(
    (total, category) =>
      total + category.items.filter((item) => !item.available).length,
    0,
  );

  return (
    <div className="px-4 pt-4">
      <h1 className="font-display text-section text-olive">Réglages</h1>

      {state.degraded ? (
        <p className="mt-4 border border-meat-border bg-raised px-4 py-3 text-fine text-ink">
          L&apos;état de la boutique n&apos;a pas pu être lu. La vitrine est
          fermée par sécurité tant que la lecture échoue, et les bascules
          ci-dessous risquent de ne pas aboutir.
        </p>
      ) : null}

      <SettingsToggles
        storeOpen={state.storeOpen}
        deliveryEnabled={state.deliveryEnabled}
      />

      <Availability categories={categories} initialUnavailable={unavailableCount} />

      <div className="rule-t mt-10 pt-6">
        <p className="text-micro text-muted">Connecté en tant que {ADMIN_EMAIL}.</p>
        <SignOut />
      </div>
    </div>
  );
}
