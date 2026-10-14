import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Rafraîchissement de la session Supabase.
 *
 * Nommé `proxy` et non `middleware`: Next 16 a renommé la convention, et le
 * fichier `middleware.ts` est déprécié.
 *
 * Ce fichier ne décide rien. Il ne fait qu'une chose: rejouer le jeton d'accès
 * arrivé en cookie et réécrire les cookies mis à jour sur la réponse. C'est
 * nécessaire parce qu'un Server Component n'a pas le droit d'écrire de
 * cookies: sans ce passage, la session de la cuisine expirerait au bout d'une
 * heure et déconnecterait le téléphone en plein service.
 *
 * L'autorisation, elle, est vérifiée deux fois ailleurs et jamais ici:
 * dans le layout de l'espace cuisine, qui appelle `getUser()` et compare à
 * ADMIN_EMAIL, et dans la base, où les policies RLS et `is_admin()` décident
 * de ce qui est lisible. Un contrôle d'accès posé dans un proxy est un
 * contrôle qu'on croit avoir: il se contourne dès qu'une route est atteinte
 * autrement, et il travaille sur un cookie qu'il n'a pas validé.
 */

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sans configuration, on laisse passer: la page protégée refusera de toute
  // façon, et faire échouer le proxy rendrait le site entier inaccessible.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // La réponse est reconstruite après mise à jour de la requête, pour
        // que le rendu qui suit voie les cookies rafraîchis et non les anciens.
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() et non getSession(): seul getUser valide le jeton auprès de
  // Supabase, ce qui déclenche le rafraîchissement quand il est expiré.
  await supabase.auth.getUser();

  return response;
}

/**
 * Limité à l'espace cuisine et au retour de connexion. La vitrine n'a pas de
 * session à entretenir: on commande sans compte, et lui faire traverser ce
 * proxy coûterait un appel réseau par page pour rien.
 */
export const config = {
  matcher: ["/admin/:path*", "/auth/:path*"],
};
