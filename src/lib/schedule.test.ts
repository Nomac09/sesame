import {
  availableSlotDays,
  availableSlots,
  formatParisTime,
  formatSlotRange,
  isSlotBookable,
  parisWallClockToUtc,
} from "@/lib/schedule";
import { SLOT_MINUTES } from "@/config/zones";
import { check, section, summary } from "@/lib/test-harness";

/** Instant UTC, écrit tel quel pour que les tests restent déterministes. */
const utc = (iso: string) => new Date(iso);

// Repères choisis à la main, vérifiés par le premier test.
const MERCREDI_ETE = "2026-07-15";
const LUNDI = "2026-07-13";
const DIMANCHE_PASSAGE_ETE = "2026-03-29"; // bascule CET -> CEST
const DIMANCHE_PASSAGE_HIVER = "2026-10-25"; // bascule CEST -> CET

const jsDayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

section("Les repères de date sont bien ceux qu'on croit");
check("2026-07-15 est un mercredi", () => {
  if (jsDayOf(MERCREDI_ETE) !== 3) throw new Error(String(jsDayOf(MERCREDI_ETE)));
});
check("2026-07-13 est un lundi", () => {
  if (jsDayOf(LUNDI) !== 1) throw new Error(String(jsDayOf(LUNDI)));
});
check("les deux dimanches de bascule sont des dimanches", () => {
  if (jsDayOf(DIMANCHE_PASSAGE_ETE) !== 0) throw new Error("mars");
  if (jsDayOf(DIMANCHE_PASSAGE_HIVER) !== 0) throw new Error("octobre");
});

section("Conversion heure de Paris vers UTC");
check("en été, 18h00 à Paris vaut 16h00 UTC", () => {
  const result = parisWallClockToUtc(2026, 7, 15, 18 * 60);
  if (result.toISOString() !== "2026-07-15T16:00:00.000Z") {
    throw new Error(result.toISOString());
  }
});
check("en hiver, 18h00 à Paris vaut 17h00 UTC", () => {
  const result = parisWallClockToUtc(2026, 1, 15, 18 * 60);
  if (result.toISOString() !== "2026-01-15T17:00:00.000Z") {
    throw new Error(result.toISOString());
  }
});
check("le jour du passage à l'heure d'été, le soir est déjà en CEST", () => {
  const result = parisWallClockToUtc(2026, 3, 29, 18 * 60);
  if (result.toISOString() !== "2026-03-29T16:00:00.000Z") {
    throw new Error(result.toISOString());
  }
});
check("le jour du retour à l'heure d'hiver, le soir est déjà en CET", () => {
  const result = parisWallClockToUtc(2026, 10, 25, 18 * 60);
  if (result.toISOString() !== "2026-10-25T17:00:00.000Z") {
    throw new Error(result.toISOString());
  }
});
check("le service du midi du jour de bascule de mars est en CEST", () => {
  // La bascule a lieu à 02h00, donc 11h00 est déjà à +2.
  const result = parisWallClockToUtc(2026, 3, 29, 11 * 60);
  if (result.toISOString() !== "2026-03-29T09:00:00.000Z") {
    throw new Error(result.toISOString());
  }
});

section("Génération des créneaux");
check("un jour ouvert offre 8 créneaux le midi et 10 le soir", () => {
  const days = availableSlotDays(utc(`${MERCREDI_ETE}T06:00:00Z`));
  if (days.length !== 2) throw new Error(`${days.length} jours`);
  if (days[0].slots.length !== 18) throw new Error(`${days[0].slots.length} créneaux`);
  if (days[0].label !== "aujourd'hui") throw new Error(days[0].label);
  if (days[1].label !== "demain") throw new Error(days[1].label);
});
check("le premier créneau du jour est 11h00, le dernier 22h30", () => {
  const [today] = availableSlotDays(utc(`${MERCREDI_ETE}T06:00:00Z`));
  if (formatParisTime(today.slots[0].start) !== "11h00") {
    throw new Error(formatParisTime(today.slots[0].start));
  }
  const last = today.slots[today.slots.length - 1];
  if (formatParisTime(last.start) !== "22h30") throw new Error(formatParisTime(last.start));
  if (formatParisTime(last.end) !== "23h00") throw new Error(formatParisTime(last.end));
});
check("aucun créneau ne franchit la coupure entre les deux services", () => {
  const slots = availableSlots(utc(`${MERCREDI_ETE}T06:00:00Z`));
  for (const slot of slots) {
    const start = formatParisTime(slot.start);
    if (start >= "15h00" && start < "18h00") throw new Error(`créneau à ${start}`);
  }
});
check("chaque créneau dure exactement la durée configurée", () => {
  for (const slot of availableSlots(utc(`${MERCREDI_ETE}T06:00:00Z`))) {
    const minutes = (slot.end.getTime() - slot.start.getTime()) / 60_000;
    if (minutes !== SLOT_MINUTES) throw new Error(`${minutes} minutes`);
  }
});

section("Fermeture du lundi");
check("le lundi n'apparaît pas, seul demain est proposé", () => {
  const days = availableSlotDays(utc(`${LUNDI}T06:00:00Z`));
  if (days.length !== 1) throw new Error(`${days.length} jours`);
  if (days[0].label !== "demain") throw new Error(days[0].label);
  if (days[0].jsDay !== 2) throw new Error("le lendemain n'est pas un mardi");
  if (days[0].slots.length !== 18) throw new Error(`${days[0].slots.length} créneaux`);
});
check("un dimanche, demain est un lundi fermé, donc un seul jour", () => {
  const days = availableSlotDays(utc(`${DIMANCHE_PASSAGE_HIVER}T06:00:00Z`));
  if (days.length !== 1) throw new Error(`${days.length} jours`);
  if (days[0].label !== "aujourd'hui") throw new Error(days[0].label);
});

section("Temps de préparation");
check("à 11h10, le créneau de 11h00 a disparu et 11h30 ouvre la liste", () => {
  // 11h10 à Paris en été = 09h10 UTC. Au plus tôt: 11h30.
  const [today] = availableSlotDays(utc(`${MERCREDI_ETE}T09:10:00Z`));
  if (formatParisTime(today.slots[0].start) !== "11h30") {
    throw new Error(formatParisTime(today.slots[0].start));
  }
});
check("à 11h05, le créneau de 11h30 est le premier réservable", () => {
  const [today] = availableSlotDays(utc(`${MERCREDI_ETE}T09:05:00Z`));
  if (formatParisTime(today.slots[0].start) !== "11h30") {
    throw new Error(formatParisTime(today.slots[0].start));
  }
});
check("tard le soir, la journée bascule entièrement sur demain", () => {
  // 22h45 à Paris en été = 20h45 UTC. Au plus tôt: 23h05, après la fermeture.
  const days = availableSlotDays(utc(`${MERCREDI_ETE}T20:45:00Z`));
  if (days[0].label !== "demain") throw new Error(days[0].label);
});

section("Validation serveur d'un créneau");
const now = utc(`${MERCREDI_ETE}T06:00:00Z`);
const realSlot = availableSlots(now)[0];

check("un créneau réellement proposé est accepté", () => {
  if (!isSlotBookable(realSlot.start, realSlot.end, now)) {
    throw new Error("créneau valide refusé");
  }
});
check("un créneau à 3h du matin est refusé", () => {
  const start = parisWallClockToUtc(2026, 7, 15, 3 * 60);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
  if (isSlotBookable(start, end, now)) throw new Error("créneau nocturne accepté");
});
check("un créneau au lundi de fermeture est refusé", () => {
  const start = parisWallClockToUtc(2026, 7, 20, 19 * 60);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
  if (isSlotBookable(start, end, now)) throw new Error("lundi accepté");
});
check("une durée trafiquée est refusée", () => {
  const end = new Date(realSlot.start.getTime() + 4 * 60 * 60_000);
  if (isSlotBookable(realSlot.start, end, now)) throw new Error("durée libre acceptée");
});
check("un début décalé de cinq minutes est refusé", () => {
  const start = new Date(realSlot.start.getTime() + 5 * 60_000);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
  if (isSlotBookable(start, end, now)) throw new Error("créneau désaligné accepté");
});
check("un créneau passé est refusé", () => {
  const later = utc(`${MERCREDI_ETE}T20:00:00Z`);
  if (isSlotBookable(realSlot.start, realSlot.end, later)) {
    throw new Error("créneau passé accepté");
  }
});
check("une date invalide est refusée sans lever d'exception", () => {
  if (isSlotBookable(new Date("nawak"), new Date("nawak"), now)) {
    throw new Error("date invalide acceptée");
  }
});

section("Libellés");
check("un créneau s'écrit 11h00 - 11h30", () => {
  if (formatSlotRange(realSlot) !== "11h00 - 11h30") {
    throw new Error(formatSlotRange(realSlot));
  }
});

summary();
