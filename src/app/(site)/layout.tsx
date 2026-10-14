import { SiteFooter } from "@/components/SiteFooter";
import { CartProvider } from "@/lib/cart";

/**
 * Layout de la vitrine.
 *
 * Le panier est monté ici, au-dessus des pages clientes, pour survivre à la
 * navigation entre la carte et le tunnel de commande. Le pied de page légal
 * est monté au même endroit, parce que les mentions légales et les conditions
 * de vente doivent rester joignables depuis n'importe quelle page vue par un
 * client, y compris les pages légales elles-mêmes.
 *
 * L'espace de gestion, lui, est hors de ce groupe: il n'a pas de panier et pas
 * de pied de page client.
 */
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CartProvider>
      {children}
      <SiteFooter />
    </CartProvider>
  );
}
