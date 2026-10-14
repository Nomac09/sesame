import { NextResponse } from "next/server";

import { isAdminEmail } from "@/config/admin";
import { sessionClient } from "@/lib/supabase/server";

/**
 * Retour de la connexion Google.
 *
 * Route handler et non server action: Google renvoie le navigateur ici par une
 * navigation GET, avec un `code` en paramètre. C'est aussi l'un des rares
 * endroits où l'écriture de cookies est permise, ce qui est indispensable pour
 * poser la session.
 *
 * Le contrôle de l'email a lieu ici, immédiatement après l'échange du code, et
 * un compte non autorisé est déconnecté sur-le-champ. Sans cela, n'importe
 * quel compte Google obtiendrait une session valide sur ce domaine. Elle ne
 * lui donnerait accès à rien, RLS refusant tout, mais une session qui traîne
 * pour un compte qui n'a rien à faire ici n'a pas lieu d'exister.
 */

function back(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/admin/connexion", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  // Refus côté Google: l'utilisateur a fermé la fenêtre ou refusé l'accès.
  if (searchParams.get("error")) {
    return back(request, { erreur: "annule" });
  }

  const code = searchParams.get("code");
  if (!code) {
    return back(request, { erreur: "code_absent" });
  }

  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[auth] échange du code impossible", error);
    return back(request, { erreur: "echec" });
  }

  if (!isAdminEmail(data.user.email)) {
    // Journalisé sans l'email: cette route est publique, et recopier dans les
    // journaux l'adresse de quiconque atterrit ici n'apporte rien.
    console.warn("[auth] connexion refusée, compte non autorisé");
    await supabase.auth.signOut();
    return back(request, { erreur: "refus" });
  }

  // `next` reste interne: une valeur venue de l'URL ne doit jamais pouvoir
  // rediriger vers un autre domaine.
  const next = searchParams.get("next");
  const destination = next?.startsWith("/admin") ? next : "/admin";

  return NextResponse.redirect(new URL(destination, request.url));
}
