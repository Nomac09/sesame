"use client";

/**
 * Tunnel de commande.
 *
 * Le formulaire n'envoie que des identifiants, des quantités et des
 * coordonnées. Aucun montant ne part d'ici: les totaux affichés sont
 * indicatifs, et `createCheckoutSession` retarife tout depuis menu.ts.
 *
 * Les erreurs renvoyées par l'action portent un `code` technique et un
 * `message` destiné au client. Seul le `message` est affiché. Le code sert au
 * rattachement à un champ, jamais à la lecture.
 *
 * Le mouvement accompagne trois décisions: le choix du mode, l'apparition des
 * champs de livraison qui en découlent, et le choix du créneau. Ce sont les
 * seuls endroits où le client fait un choix réversible et a besoin de voir
 * que son geste a porté.
 */

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, useTransition } from "react";

import { createCheckoutSession } from "@/app/(site)/commander/actions";
import { formatEuros } from "@/config/menu";
import { findZone, type FulfilmentMode } from "@/config/zones";
import { displayTotals } from "@/lib/cart-totals";
import { useCart } from "@/lib/cart";
import { useMotionPresets } from "@/lib/motion";
import { isAvailable, type Availability } from "@/lib/availability";

export interface SerialSlot {
  /** Début du créneau, ISO. Sert aussi d'identifiant dans le sélecteur. */
  start: string;
  end: string;
  /** Déjà mis en forme côté serveur, en heure de Paris. */
  label: string;
}

export interface SerialSlotDay {
  date: string;
  label: string;
  slots: SerialSlot[];
}

interface CheckoutFormProps {
  availability: Availability;
  modes: FulfilmentMode[];
  days: SerialSlotDay[];
}

const INPUT =
  "mt-1.5 w-full rounded-sm border border-field bg-raised px-3 py-2.5 text-body text-ink placeholder:text-muted/60";

/**
 * Un champ et son libellé.
 *
 * Le libellé est relié par `htmlFor` et l'aide par `aria-describedby`, plutôt
 * qu'en enveloppant le champ. Enveloppé, le nom accessible de l'input
 * absorberait aussi le texte d'aide: un lecteur d'écran annoncerait
 * "Téléphone Pour vous joindre le jour de la commande" comme nom du champ.
 * Le nom nomme, l'aide décrit.
 */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <label htmlFor={id} className="label text-muted">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-micro text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rule-t mt-8 pt-6">
      <h2 className="font-display text-section text-olive">{title}</h2>
      {children}
    </section>
  );
}

export function CheckoutForm({ availability, modes, days }: CheckoutFormProps) {
  const { lines, hydrated, remove, clear } = useCart();
  const { panel, notice, swap, transition, spring, press, reduced } =
    useMotionPresets();
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<FulfilmentMode>(modes[0] ?? "retrait");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [postcode, setPostcode] = useState("");
  const [dayDate, setDayDate] = useState(days[0]?.date ?? "");
  const [slotStart, setSlotStart] = useState(days[0]?.slots[0]?.start ?? "");
  const [note, setNote] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(
    null,
  );

  const totals = useMemo(() => displayTotals(lines, mode), [lines, mode]);
  const soldOut = totals.lines.filter(
    (line) => !isAvailable(availability, line.itemId),
  );

  const day = days.find((entry) => entry.date === dayDate) ?? days[0];
  const slot = day?.slots.find((entry) => entry.start === slotStart);
  const zone = findZone(postcode);

  if (!hydrated) {
    return <p className="py-12 text-fine text-muted">Chargement du panier.</p>;
  }

  if (lines.length === 0) {
    return (
      <div className="py-12">
        <p className="font-display text-item text-ink">Votre panier est vide.</p>
        <Link
          href="/"
          className="label mt-4 inline-block rounded-full border border-olive px-5 py-3 text-olive"
        >
          Voir la carte
        </Link>
      </div>
    );
  }

  const canSubmit =
    modes.length > 0 && soldOut.length === 0 && Boolean(slot) && !pending;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot) {
      setError({ message: "Merci de choisir un créneau.", field: "slotStart" });
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await createCheckoutSession({
        firstName,
        lastName,
        phone,
        email,
        mode,
        addressLine: mode === "livraison" ? addressLine : undefined,
        postcode: mode === "livraison" ? postcode : undefined,
        slotStart: slot!.start,
        slotEnd: slot!.end,
        marketingOptIn,
        ageConfirmed,
        note: note.trim() === "" ? undefined : note,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          variantId: line.variantId ?? undefined,
          quantity: line.quantity,
        })),
      });

      if (result.ok) {
        // Le panier est vidé au retour sur /merci, pas ici: un client qui
        // abandonne sur la page Stripe doit retrouver sa commande intacte.
        window.location.href = result.url;
        return;
      }

      setError({ message: result.message, field: result.field });
    });
  }

  /**
   * Champs réellement rendus en ce moment. L'action peut renvoyer un `field`
   * qui n'a pas d'équivalent à l'écran, par exemple un chemin zod tel que
   * "lines.0.quantity", ou "postcode" alors que le retrait est sélectionné.
   * Sans ce filtre, le message serait rattaché à un champ inexistant et ne
   * s'afficherait nulle part: le client verrait un bouton qui ne fait rien.
   */
  const shownFields = new Set<string>([
    "firstName",
    "lastName",
    "phone",
    "email",
    "slotStart",
    ...(mode === "livraison" ? ["addressLine", "postcode"] : []),
    ...(totals.containsAlcohol ? ["ageConfirmed"] : []),
  ]);

  const attachedToField = error?.field !== undefined && shownFields.has(error.field);

  const fieldError = (name: string) => (
    <AnimatePresence>
      {attachedToField && error?.field === name ? (
        <motion.span
          variants={notice}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={transition}
          role="alert"
          className="mt-1.5 block text-micro text-terracotta"
        >
          {error.message}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );

  return (
    <form onSubmit={submit} noValidate>
      {soldOut.length > 0 ? (
        <div className="border border-meat-border bg-raised px-4 py-4">
          <p className="font-display text-body text-ink">
            {soldOut.length === 1
              ? "Un article de votre panier n'est plus disponible aujourd'hui."
              : "Des articles de votre panier ne sont plus disponibles aujourd'hui."}
          </p>
          <ul className="mt-3 space-y-2">
            {soldOut.map((line) => (
              <li
                key={`${line.itemId}::${line.variantId ?? ""}`}
                className="flex items-center justify-between gap-3 text-fine"
              >
                <span>{line.label}</span>
                <button
                  type="button"
                  onClick={() => remove(line.itemId, line.variantId)}
                  className="label rounded-full border border-field px-3 py-1.5 text-muted"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AnimatePresence>
        {error && !attachedToField ? (
          <motion.p
            variants={notice}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={transition}
            role="alert"
            className="mb-2 mt-4 border border-meat-border bg-raised px-4 py-3 text-fine text-ink"
          >
            {error.message}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/* --- Récapitulatif ------------------------------------------------ */}
      <section className="mt-6">
        <h2 className="label text-muted">Votre commande</h2>
        <ul className="mt-3">
          {totals.lines.map((line) => (
            <li
              key={`${line.itemId}::${line.variantId ?? ""}`}
              className="rule-b py-2.5"
            >
              <div className="leader">
                <span className="text-fine text-ink">
                  <span className="tabular text-muted">{line.quantity}</span>
                  <span className="text-muted"> &times; </span>
                  {line.label}
                </span>
                <span className="leader__fill" aria-hidden="true" />
                <span className="tabular shrink-0 text-fine text-terracotta">
                  {formatEuros(line.lineTotalCents)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 text-fine">
          <div className="flex justify-between">
            <dt className="text-muted">Sous-total</dt>
            <dd className="tabular">{formatEuros(totals.subtotalCents)}</dd>
          </div>
          {mode === "livraison" ? (
            <div className="flex justify-between">
              <dt className="text-muted">Livraison</dt>
              <dd className="tabular">
                {totals.deliveryFeeCents === 0
                  ? "Offerte"
                  : formatEuros(totals.deliveryFeeCents ?? 0)}
              </dd>
            </div>
          ) : null}
          <div className="rule-t flex justify-between pt-2 font-display text-item">
            <dt>Total</dt>
            {/*
             * Repère de test: c'est ce nombre précis que le parcours de bout
             * en bout compare au total réellement enregistré en base.
             */}
            <dd data-testid="total-indicatif" className="tabular text-terracotta">
              {formatEuros(totals.totalCents)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-micro text-muted">
          Total indicatif. Le montant exact est calculé au paiement.
        </p>

        {/*
         * Avertissement d'âge attaché au récapitulatif, en plus de la case à
         * cocher plus bas. La case demande un engagement; ce bloc énonce la
         * règle. Les deux ne se remplacent pas: un client qui parcourt la page
         * sans aller jusqu'au bout du formulaire doit quand même avoir lu
         * l'interdiction, article L3342-1 du code de la santé publique.
         */}
        {totals.containsAlcohol ? (
          <div className="mt-4 border border-meat-border bg-raised px-4 py-3">
            <p className="text-fine text-ink">
              Cette commande contient de l&apos;alcool. Sa vente est interdite
              aux mineurs de moins de dix-huit ans, article L3342-1 du code de
              la santé publique. Une preuve d&apos;âge peut être demandée à la
              remise, et la boisson n&apos;est pas remise en cas de refus.
            </p>
            <p className="mt-2 text-micro text-muted">
              L&apos;abus d&apos;alcool est dangereux pour la santé, à consommer
              avec modération.
            </p>
          </div>
        ) : null}
      </section>

      {/* --- Mode --------------------------------------------------------- */}
      <Section title="Livraison ou retrait">
        {modes.length === 0 ? (
          <p className="mt-3 text-fine text-muted">
            Aucun mode de retrait n&apos;est disponible pour le moment.
          </p>
        ) : (
          // Groupe nommé: les deux choix forment une seule question, et un
          // lecteur d'écran doit l'annoncer comme telle plutôt que comme deux
          // cases sans rapport.
          <div
            role="radiogroup"
            aria-label="Mode de retrait"
            className="mt-4 flex gap-2"
          >
            {modes.map((option) => {
              const selected = mode === option;
              return (
                <label
                  key={option}
                  className="relative flex-1 cursor-pointer overflow-hidden rounded-full border border-field px-4 py-3 text-center"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={option}
                    checked={selected}
                    onChange={() => setMode(option)}
                    className="sr-only"
                  />
                  {selected ? (
                    <motion.span
                      // Sans mouvement réduit, l'aplat glisse d'un choix à
                      // l'autre. Avec, il change de place sans transition.
                      layoutId={reduced ? undefined : "mode-indicator"}
                      transition={spring}
                      className="absolute inset-0 bg-olive"
                    />
                  ) : null}
                  <span
                    className={`label relative ${selected ? "text-bone" : "text-muted"}`}
                  >
                    {option === "livraison" ? "Livraison" : "Retrait sur place"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </Section>

      {/* --- Coordonnées -------------------------------------------------- */}
      <Section title="Vos coordonnées">
        <Field id="firstName" label="Prénom">
          <input
            id="firstName"
            className={INPUT}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            autoComplete="given-name"
            required
            maxLength={80}
          />
          {fieldError("firstName")}
        </Field>

        <Field id="lastName" label="Nom">
          <input
            id="lastName"
            className={INPUT}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
            required
            maxLength={80}
          />
          {fieldError("lastName")}
        </Field>

        <Field id="phone" label="Téléphone" hint="Pour vous joindre le jour de la commande.">
          <input
            id="phone"
            aria-describedby="phone-hint"
            className={INPUT}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            autoComplete="tel"
            required
            maxLength={30}
          />
          {fieldError("phone")}
        </Field>

        <Field id="email" label="Email" hint="Sert à envoyer la confirmation de commande.">
          <input
            id="email"
            aria-describedby="email-hint"
            className={INPUT}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            required
            maxLength={200}
          />
          {fieldError("email")}
        </Field>

        {/*
         * Les champs d'adresse suivent le mode choisi. Leur apparition est
         * animée parce qu'elle est la conséquence directe d'un appui: sans
         * cela, deux champs surgiraient sans qu'on sache d'où.
         */}
        <AnimatePresence initial={false}>
          {mode === "livraison" ? (
            <motion.div
              key="adresse"
              variants={panel}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={transition}
              className="overflow-hidden"
            >
              <Field id="addressLine" label="Adresse">
                <input
                  id="addressLine"
                  className={INPUT}
                  value={addressLine}
                  onChange={(event) => setAddressLine(event.target.value)}
                  autoComplete="street-address"
                  required
                  maxLength={200}
                />
                {fieldError("addressLine")}
              </Field>

              <Field id="postcode" label="Code postal">
                <input
                  id="postcode"
                  className={INPUT}
                  value={postcode}
                  onChange={(event) => setPostcode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  required
                  maxLength={10}
                />
                <AnimatePresence>
                  {zone ? (
                    <motion.span
                      variants={notice}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={transition}
                      className="mt-1.5 block text-micro text-olive"
                    >
                      {zone.commune}, dans la zone de livraison.
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                {fieldError("postcode")}
              </Field>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Section>

      {/* --- Créneau ------------------------------------------------------ */}
      <Section title="Créneau">
        {days.length === 0 ? (
          <p className="mt-3 text-fine text-muted">
            Aucun créneau n&apos;est disponible pour le moment.
          </p>
        ) : (
          <>
            <div className="mt-4 flex gap-2">
              {days.map((entry) => {
                const selected = day?.date === entry.date;
                return (
                  <button
                    key={entry.date}
                    type="button"
                    onClick={() => {
                      setDayDate(entry.date);
                      setSlotStart(entry.slots[0]?.start ?? "");
                    }}
                    className="relative overflow-hidden rounded-full border border-field px-4 py-2.5"
                    aria-pressed={selected}
                  >
                    {selected ? (
                      <motion.span
                        layoutId={reduced ? undefined : "day-indicator"}
                        transition={spring}
                        className="absolute inset-0 bg-olive"
                      />
                    ) : null}
                    <span
                      className={`label relative ${selected ? "text-bone" : "text-muted"}`}
                    >
                      {entry.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              role="radiogroup"
              aria-label="Heure du créneau"
              className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4"
            >
              {(day?.slots ?? []).map((entry) => {
                const selected = slot?.start === entry.start;
                return (
                  <motion.button
                    key={entry.start}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    whileTap={press}
                    onClick={() => setSlotStart(entry.start)}
                    transition={transition}
                    className={`tabular rounded-sm border px-1 py-2.5 text-micro ${
                      selected
                        ? "border-olive bg-olive text-bone"
                        : "border-field bg-raised text-muted"
                    }`}
                  >
                    {entry.label}
                  </motion.button>
                );
              })}
            </div>
            {fieldError("slotStart")}
          </>
        )}
      </Section>

      {/* --- Précisions --------------------------------------------------- */}
      <Section title="Précisions">
        <Field id="note" label="Note pour la cuisine">
          <textarea
            id="note"
            className={INPUT}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={500}
          />
        </Field>

        <AnimatePresence initial={false}>
          {totals.containsAlcohol ? (
            <motion.div
              key="age"
              variants={panel}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={transition}
              className="overflow-hidden"
            >
              <label className="mt-5 flex items-start gap-3 text-fine">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(event) => setAgeConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#3E4A37]"
                />
                <span>
                  Je certifie avoir 18 ans ou plus. La vente d&apos;alcool aux
                  mineurs de moins de dix-huit ans est interdite, article
                  L3342-1 du code de la santé publique.
                </span>
              </label>
              {fieldError("ageConfirmed")}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <label className="mt-5 flex items-start gap-3 text-fine">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(event) => setMarketingOptIn(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[#3E4A37]"
          />
          <span className="text-muted">
            Je souhaite recevoir les nouveautés de la carte par email.
          </span>
        </label>
      </Section>

      <motion.button
        type="submit"
        disabled={!canSubmit}
        whileTap={canSubmit ? press : undefined}
        className="mt-8 w-full rounded-full bg-olive px-4 py-4 text-bone disabled:opacity-40"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={pending ? "pending" : "idle"}
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={transition}
            className="label block"
          >
            {pending ? "Redirection vers le paiement" : "Payer en ligne"}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/*
       * Information précontractuelle, article L221-5 du code de la
       * consommation. Elle est placée au contact du bouton et non dans un pied
       * de page: le client doit la voir au moment où il s'engage, pas après.
       *
       * L'absence de droit de rétractation est nommée ici plutôt que
       * seulement dans les CGV, parce que c'est la seule règle du contrat qui
       * surprend, et qu'une surprise se dit avant le paiement.
       */}
      <p className="mt-3 text-center text-micro text-muted">
        Paiement par carte, sur la page sécurisée de Stripe. En payant, vous
        acceptez les{" "}
        <Link href="/cgv" className="text-olive underline underline-offset-4">
          conditions de vente
        </Link>{" "}
        et reconnaissez que les plats préparés, denrées périssables, ne sont pas
        soumis au droit de rétractation.
      </p>

      <button
        type="button"
        onClick={clear}
        className="label mx-auto mt-8 block text-muted underline underline-offset-4"
      >
        Vider le panier
      </button>
    </form>
  );
}
