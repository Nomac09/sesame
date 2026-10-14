/**
 * Génération et validation des créneaux.
 *
 * Les horaires de `zones.ts` sont exprimés en heure locale de Paris. Le serveur
 * tourne en UTC, et Paris change d'offset deux fois par an. Toute la conversion
 * passe donc par Intl plutôt que par une constante d'offset, sinon les créneaux
 * se décalent d'une heure une semaine sur deux à la fin mars et fin octobre.
 */

import {
  DAY_LABELS,
  LEAD_TIME_MINUTES,
  SLOT_DAYS_AHEAD,
  SLOT_MINUTES,
  TIMEZONE,
  windowsForDay,
} from "@/config/zones";

export interface Slot {
  start: Date;
  end: Date;
}

export interface SlotDay {
  /** Date civile à Paris, format AAAA-MM-JJ. */
  date: string;
  /** Jour JS, 0 = dimanche. */
  jsDay: number;
  /** "aujourd'hui", "demain", sinon le nom du jour. */
  label: string;
  slots: Slot[];
}

const PARIS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInParis(date: Date): ZonedParts {
  const parts: Record<string, number> = {};
  for (const part of PARIS_FORMAT.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts as unknown as ZonedParts;
}

/** Décalage de Paris par rapport à UTC, en millisecondes, à cet instant. */
function parisOffsetMs(date: Date): number {
  const parts = partsInParis(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * Convertit une heure murale parisienne en instant UTC.
 *
 * Deux passes: la première estime l'offset à partir de l'instant naïf, la
 * seconde le recalcule à l'instant corrigé. Cela règle les jours de bascule,
 * où l'offset du matin n'est pas celui du soir.
 */
export function parisWallClockToUtc(
  year: number,
  month: number,
  day: number,
  minutesFromMidnight: number,
): Date {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = naive - parisOffsetMs(new Date(naive));
  const secondPass = naive - parisOffsetMs(new Date(firstPass));
  return new Date(secondPass);
}

/** Date civile parisienne décalée de `offsetDays` jours. */
function parisCalendarDay(from: Date, offsetDays: number) {
  const parts = partsInParis(from);
  const cursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  cursor.setUTCDate(cursor.getUTCDate() + offsetDays);
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
    jsDay: cursor.getUTCDay(),
  };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayLabel(offsetDays: number, jsDay: number): string {
  if (offsetDays === 0) return "aujourd'hui";
  if (offsetDays === 1) return "demain";
  return DAY_LABELS[jsDay];
}

/**
 * Créneaux réservables, aujourd'hui et demain, services du midi et du soir.
 *
 * Un créneau n'est proposé que si son début respecte le temps de préparation.
 * Les jours sans créneau, fermeture ou journée déjà écoulée, sont omis plutôt
 * que rendus vides.
 */
export function availableSlotDays(now: Date = new Date()): SlotDay[] {
  const earliest = now.getTime() + LEAD_TIME_MINUTES * 60_000;
  const days: SlotDay[] = [];

  for (let offset = 0; offset < SLOT_DAYS_AHEAD; offset++) {
    const calendar = parisCalendarDay(now, offset);
    const slots: Slot[] = [];

    for (const window of windowsForDay(calendar.jsDay)) {
      for (
        let minutes = window.opensAt;
        minutes + SLOT_MINUTES <= window.closesAt;
        minutes += SLOT_MINUTES
      ) {
        const start = parisWallClockToUtc(
          calendar.year,
          calendar.month,
          calendar.day,
          minutes,
        );
        if (start.getTime() < earliest) continue;
        slots.push({
          start,
          end: new Date(start.getTime() + SLOT_MINUTES * 60_000),
        });
      }
    }

    if (slots.length > 0) {
      days.push({
        date: isoDate(calendar.year, calendar.month, calendar.day),
        jsDay: calendar.jsDay,
        label: dayLabel(offset, calendar.jsDay),
        slots,
      });
    }
  }

  return days;
}

/** Tous les créneaux réservables, à plat. */
export function availableSlots(now: Date = new Date()): Slot[] {
  return availableSlotDays(now).flatMap((day) => day.slots);
}

/**
 * Validation serveur d'un créneau soumis au paiement.
 *
 * On régénère la liste et on compare, plutôt que de vérifier des bornes: un
 * client ne peut donc pas réserver 3h du matin, un créneau déjà passé, un lundi
 * de fermeture, ni un horaire décalé de quelques minutes.
 */
export function isSlotBookable(
  start: Date,
  end: Date,
  now: Date = new Date(),
): boolean {
  const startTime = start.getTime();
  const endTime = end.getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return false;
  return availableSlots(now).some(
    (slot) => slot.start.getTime() === startTime && slot.end.getTime() === endTime,
  );
}

/** Heure parisienne d'un instant, au format 18h30. */
export function formatParisTime(date: Date): string {
  const parts = partsInParis(date);
  return `${String(parts.hour).padStart(2, "0")}h${String(parts.minute).padStart(2, "0")}`;
}

/** Libellé d'un créneau, par exemple "18h30 - 19h00". */
export function formatSlotRange(slot: Slot): string {
  return `${formatParisTime(slot.start)} - ${formatParisTime(slot.end)}`;
}
