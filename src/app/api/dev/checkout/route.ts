import { createCheckoutSession } from "@/app/(site)/commander/actions";
import { availableSlots } from "@/lib/schedule";

/**
 * TEMPORAIRE. Sert uniquement à exercer le parcours de paiement de bout en
 * bout avant que la vitrine existe. À supprimer une fois la page /commander en
 * place.
 */
export async function POST(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Indisponible.", { status: 404 });
  }

  const slot = availableSlots()[0];
  if (!slot) {
    return Response.json({ ok: false, message: "aucun créneau disponible" }, { status: 409 });
  }

  const result = await createCheckoutSession({
    firstName: "Test",
    lastName: "Bout-en-bout",
    phone: "0600000000",
    email: "e2e@exemple.fr",
    mode: "retrait",
    slotStart: slot.start.toISOString(),
    slotEnd: slot.end.toISOString(),
    marketingOptIn: false,
    ageConfirmed: false,
    lines: [{ itemId: "houmous", quantity: 1 }],
  });

  return Response.json(result);
}
