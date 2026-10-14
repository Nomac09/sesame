/**
 * Mise en forme des horaires d'ouverture.
 *
 * Dérivé de OPENING_HOURS plutôt que recopié à la main: deux services par jour
 * sont la norme ici, et une plage modifiée dans zones.ts doit se voir sur la
 * page sans qu'on pense à éditer une phrase ailleurs.
 */

import { DAY_LABELS, OPENING_HOURS, type OpeningWindow } from "@/config/zones";

/** Minutes depuis minuit vers "11h00". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}h${String(rest).padStart(2, "0")}`;
}

function formatWindows(windows: OpeningWindow[]): string {
  if (windows.length === 0) return "fermé";
  return windows
    .map((window) => `${formatMinutes(window.opensAt)} - ${formatMinutes(window.closesAt)}`)
    .join(" et ");
}

/** Signature d'une journée, pour regrouper les jours identiques. */
function signature(windows: OpeningWindow[]): string {
  return windows.map((w) => `${w.opensAt}-${w.closesAt}`).join("|");
}

export interface Service {
  /** "Midi" ou "Soir", déduit de l'heure d'ouverture. */
  name: string;
  hours: string;
}

/**
 * Les services d'une journée type.
 *
 * Deux services par jour sont la norme pour cette cuisine, pas l'exception,
 * donc la vitrine les présente comme deux blocs distincts plutôt que comme une
 * plage unique coupée en deux. Les noms sont déduits de l'heure d'ouverture et
 * non écrits à la main: si zones.ts passait à un service unique, la page
 * suivrait sans retouche.
 */
export function serviceWindows(): Service[] {
  const day = OPENING_HOURS.find((windows) => windows.length > 0) ?? [];

  return day.map((window, index) => ({
    name:
      day.length === 1
        ? "Service"
        : window.opensAt < 15 * 60
          ? "Midi"
          : index === day.length - 1
            ? "Soir"
            : `Service ${index + 1}`,
    hours: `${formatMinutes(window.opensAt)} - ${formatMinutes(window.closesAt)}`,
  }));
}

/** Jours de fermeture, nommés. Vide si la cuisine ouvre tous les jours. */
export function closedDays(): string[] {
  const days: string[] = [];
  OPENING_HOURS.forEach((windows, jsDay) => {
    if (windows.length === 0) days.push(DAY_LABELS[jsDay]);
  });
  return days;
}

export interface OpeningLine {
  days: string;
  hours: string;
}

/**
 * Horaires regroupés par plages de jours consécutifs identiques, en partant du
 * lundi. "Mardi à dimanche" plutôt que sept lignes qui répètent la même chose.
 */
export function openingLines(): OpeningLine[] {
  // Ordre français: lundi en premier, dimanche en dernier.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const lines: OpeningLine[] = [];

  let runStart = 0;
  for (let index = 0; index <= order.length; index++) {
    const current = index < order.length ? signature(OPENING_HOURS[order[index]] ?? []) : null;
    const previous = signature(OPENING_HOURS[order[runStart]] ?? []);

    if (current === previous) continue;

    const firstDay = DAY_LABELS[order[runStart]];
    const lastDay = DAY_LABELS[order[index - 1]];
    lines.push({
      days: runStart === index - 1 ? firstDay : `${firstDay} à ${lastDay}`,
      hours: formatWindows(OPENING_HOURS[order[runStart]] ?? []),
    });
    runStart = index;
  }

  return lines;
}
