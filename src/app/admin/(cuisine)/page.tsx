import { OrderFeed } from "@/app/admin/OrderFeed";
import { fetchFeed } from "@/lib/orders";
import { sessionClient } from "@/lib/supabase/server";

/**
 * Flux des commandes.
 *
 * Le premier chargement se fait côté serveur, avec la session de la cuisine:
 * la liste est donc lisible immédiatement, sans attendre l'ouverture du
 * WebSocket. C'est ce qui compte quand on rouvre le téléphone entre deux
 * plats.
 *
 * Aucune mise en cache: la page dépend des cookies de session, donc Next la
 * rend à la demande de toute façon, et une commande qui aurait une minute de
 * retard en cuisine serait une commande perdue.
 */
export default async function AdminCommandesPage() {
  const supabase = await sessionClient();
  const { orders, error } = await fetchFeed(supabase);

  return <OrderFeed initialOrders={orders} initialError={error} />;
}
