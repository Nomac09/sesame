"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderCard } from "@/app/admin/OrderCard";
import { ring, unlockAudio } from "@/lib/alert";
import { useMotionPresets } from "@/lib/motion";
import {
  ACTIVE_STATUSES,
  fetchFeed,
  type AdminOrder,
  type OrderStatus,
} from "@/lib/orders";
import { browserClient } from "@/lib/supabase/client";

/**
 * Flux de commandes.
 *
 * Le premier rendu vient du serveur, ce qui rend la page utile avant que le
 * moindre script soit exécuté. Ensuite, deux sources la tiennent à jour.
 *
 * 1. Le temps réel Supabase, abonné à `orders`. Soumis à RLS comme le reste:
 *    seul le compte de la cuisine reçoit les événements.
 * 2. Un rechargement périodique, en filet. Un abonnement WebSocket sur un
 *    téléphone se perd: écran verrouillé, passage du wifi à la 4G, veille
 *    système. Le temps réel seul manquerait alors une commande sans rien
 *    signaler, ce qui est le pire des échecs pour cet écran.
 *
 * Un événement ne sert jamais de source de vérité: il déclenche une relecture
 * complète du flux. C'est un aller-retour de plus, mais l'état affiché est
 * alors toujours celui de la base, jamais un état reconstitué à partir de
 * messages qui ont pu arriver dans le désordre ou se perdre.
 */

interface Filter {
  id: string;
  label: string;
  statuses: OrderStatus[] | null;
}

const FILTERS: Filter[] = [
  { id: "en-cours", label: "En cours", statuses: ACTIVE_STATUSES },
  { id: "confirmee", label: "Confirmées", statuses: ["confirmee"] },
  { id: "en_preparation", label: "En préparation", statuses: ["en_preparation"] },
  { id: "prete", label: "Prêtes", statuses: ["prete"] },
  { id: "terminees", label: "Terminées", statuses: ["livree", "retiree"] },
  { id: "annulee", label: "Annulées", statuses: ["annulee"] },
  { id: "toutes", label: "Toutes", statuses: null },
];

/** Filet de sécurité si le temps réel se tait. */
const POLL_MS = 45_000;

export function OrderFeed({
  initialOrders,
  initialError,
}: {
  initialOrders: AdminOrder[];
  initialError: string | null;
}) {
  const { transition, panel } = useMotionPresets();

  const [orders, setOrders] = useState(initialOrders);
  const [error, setError] = useState<string | null>(initialError);
  const [filterId, setFilterId] = useState("en-cours");
  const [live, setLive] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [arrivals, setArrivals] = useState<string[]>([]);

  /*
   * Références et non états: ces valeurs sont lues à l'intérieur de callbacks
   * abonnés une seule fois. En état, chaque relecture recréerait l'abonnement,
   * et le canal se fermerait puis se rouvrirait à chaque commande.
   */
  const known = useRef<Set<string>>(
    new Set(initialOrders.map((order) => order.id)),
  );
  const primed = useRef(false);
  const soundRef = useRef(false);

  const refresh = useCallback(async () => {
    const supabase = browserClient();
    const { orders: next, error: failure } = await fetchFeed(supabase);

    if (failure) {
      setError(failure);
      return;
    }
    setError(null);

    // Nouveauté = commande jamais vue par cet écran. La comparaison porte sur
    // les identifiants et non sur un horodatage: une commande confirmée avec
    // du retard, après un webhook rejoué, doit sonner elle aussi.
    const fresh = next.filter((order) => !known.current.has(order.id));
    for (const order of next) known.current.add(order.id);

    setOrders(next);

    // `primed` évite de sonner pour les commandes déjà présentes au premier
    // chargement. Il n'est armé qu'après la première relecture réussie.
    if (primed.current && fresh.length > 0) {
      setArrivals((current) => [
        ...current,
        ...fresh.map((order) => order.reference),
      ]);
      if (soundRef.current) ring();
    }
    primed.current = true;
  }, []);

  // Abonnement temps réel. Une seule fois, pour la durée de la page.
  useEffect(() => {
    const supabase = browserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    // Deux événements arrivent souvent ensemble, la confirmation puis
    // l'écriture des identifiants Stripe. Une seule relecture suffit.
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 300);
    };

    /*
     * Le jeton est posé sur la socket avant l'abonnement, explicitement.
     *
     * RLS s'applique aussi au temps réel: sans jeton, le serveur refuse
     * l'abonnement à `orders` et le canal part en erreur. La bibliothèque
     * transmet bien le jeton d'elle-même, mais au moment où elle restaure la
     * session, ce qui peut arriver après ce premier abonnement. La course est
     * silencieuse et ne se voit qu'en service, sous la forme d'un flux qui ne
     * bouge plus.
     */
    async function connect() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;

      channel = supabase
        .channel("cuisine-commandes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          schedule,
        )
        .subscribe((status) => {
          setLive(status === "SUBSCRIBED");
        });
    }

    void connect();

    const poll = setInterval(() => void refresh(), POLL_MS);

    // Retour au premier plan: le téléphone sort de veille, l'abonnement a pu
    // mourir sans que le navigateur le dise. On relit immédiatement.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Titre de l'onglet: la seule alerte qui survive à un changement d'onglet.
  useEffect(() => {
    document.title =
      arrivals.length > 0
        ? `(${arrivals.length}) Nouvelle commande`
        : "Commandes, cuisine Sesame";
  }, [arrivals]);

  async function toggleSound() {
    if (soundOn) {
      soundRef.current = false;
      setSoundOn(false);
      return;
    }

    const ready = await unlockAudio();
    soundRef.current = ready;
    setSoundOn(ready);
    // Un bip de confirmation: la cuisine doit entendre que le son marche
    // maintenant, pas le découvrir au moment d'une vraie commande.
    if (ready) ring();
  }

  const filter = FILTERS.find((entry) => entry.id === filterId) ?? FILTERS[0];
  const shown = filter.statuses
    ? orders.filter((order) => filter.statuses!.includes(order.status))
    : orders;

  function countFor(entry: Filter): number {
    if (!entry.statuses) return orders.length;
    return orders.filter((order) => entry.statuses!.includes(order.status))
      .length;
  }

  return (
    <div>
      {/*
       * En-tête collant. Le rail de filtres reste sous la main pendant qu'on
       * fait défiler une longue journée, et la bannière d'arrivée s'affiche
       * au-dessus de tout le reste.
       */}
      <div className="sticky top-0 z-20 bg-bone">
        <div className="flex items-center justify-between px-4 pt-4">
          <h1 className="font-display text-section text-olive">Commandes</h1>

          <div className="flex items-center gap-3">
            <span
              className="label flex items-center gap-1.5 text-muted"
              title={live ? "Temps réel actif" : "Temps réel interrompu"}
            >
              <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full ${
                  live ? "bg-olive" : "bg-terracotta"
                }`}
              />
              {live ? "En direct" : "Hors ligne"}
            </span>

            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              className={`label rounded-full border px-3 py-2 ${
                soundOn
                  ? "border-olive bg-olive text-bone"
                  : "border-field text-muted"
              }`}
            >
              {soundOn ? "Son actif" : "Activer le son"}
            </button>
          </div>
        </div>

        <nav aria-label="Filtrer par statut" className="rule-b mt-3">
          <ul className="flex gap-2 overflow-x-auto px-4 pb-3">
            {FILTERS.map((entry) => {
              const selected = entry.id === filter.id;
              return (
                <li key={entry.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterId(entry.id)}
                    aria-pressed={selected}
                    className={`label rounded-full border px-3 py-2 ${
                      selected
                        ? "border-olive bg-olive text-bone"
                        : "border-field text-muted"
                    }`}
                  >
                    {entry.label}
                    <span className="tabular ml-1.5 opacity-70">
                      {countFor(entry)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <AnimatePresence initial={false}>
        {arrivals.length > 0 ? (
          <motion.div
            variants={panel}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={transition}
            className="overflow-hidden px-4"
          >
            <button
              type="button"
              onClick={() => setArrivals([])}
              className="mt-3 w-full border border-olive bg-olive px-4 py-3 text-left text-bone"
            >
              <span className="label block">
                {arrivals.length === 1
                  ? "Nouvelle commande"
                  : `${arrivals.length} nouvelles commandes`}
              </span>
              <span className="tabular mt-1 block text-fine">
                {arrivals.join(", ")}
              </span>
              <span className="label mt-1.5 block opacity-70">
                Toucher pour effacer
              </span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p className="mx-4 mt-4 border border-meat-border bg-raised px-4 py-3 text-fine text-ink">
          Le flux n&apos;a pas pu être relu: {error}
        </p>
      ) : null}

      {!soundOn ? (
        <p className="mx-4 mt-4 text-micro text-muted">
          Le son est coupé tant qu&apos;il n&apos;a pas été activé une fois:
          un navigateur refuse de jouer un son sans un appui préalable.
        </p>
      ) : null}

      <div className="px-4">
        {shown.length === 0 ? (
          <p className="py-16 text-center text-fine text-muted">
            Aucune commande dans ce filtre.
          </p>
        ) : (
          shown.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              highlighted={arrivals.includes(order.reference)}
              onChanged={refresh}
            />
          ))
        )}
      </div>
    </div>
  );
}
