import { redirect } from "next/navigation";

import { GoogleButton } from "@/app/admin/connexion/GoogleButton";
import { ADMIN_EMAIL, isAdminEmail } from "@/config/admin";
import { currentUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Connexion, cuisine Sesame",
  robots: { index: false, follow: false },
};

/**
 * Connexion de l'espace cuisine.
 *
 * Un seul moyen d'entrer: Google, sur un seul email. Il n'y a pas de mot de
 * passe à retenir ni de compte à créer, donc rien à voler, rien à réinitialiser
 * et aucun formulaire d'inscription à protéger.
 */

const MESSAGES: Record<string, string> = {
  refus:
    "Ce compte Google n'est pas celui de la cuisine. Vous avez été déconnecté.",
  annule: "Connexion abandonnée.",
  echec: "La connexion n'a pas abouti. Réessayez dans un instant.",
  code_absent: "Le retour de Google était incomplet. Réessayez.",
};

export default async function ConnexionPage(
  props: PageProps<"/admin/connexion">,
) {
  const user = await currentUser();
  if (user && isAdminEmail(user.email)) redirect("/admin");

  const params = await props.searchParams;
  const key = typeof params.erreur === "string" ? params.erreur : undefined;
  const message = key ? MESSAGES[key] : undefined;

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-12">
      <p className="label text-muted">Sesame</p>
      <h1 className="mt-2 font-display text-display text-olive">Cuisine</h1>
      <p className="mt-3 text-fine text-muted">
        Espace de gestion des commandes. Accès réservé au compte de la cuisine.
      </p>

      {message ? (
        <p className="mt-6 border border-meat-border bg-raised px-4 py-3 text-fine text-ink">
          {message}
        </p>
      ) : null}

      <GoogleButton />

      {ADMIN_EMAIL ? (
        <p className="mt-5 text-micro text-muted">
          Seul {ADMIN_EMAIL} peut entrer. Tout autre compte est refusé et
          déconnecté aussitôt.
        </p>
      ) : (
        <p className="mt-5 border border-meat-border bg-raised px-4 py-3 text-fine text-ink">
          ADMIN_EMAIL n&apos;est pas renseignée sur cet environnement. Aucune
          connexion ne peut aboutir tant qu&apos;elle manque.
        </p>
      )}
    </div>
  );
}
