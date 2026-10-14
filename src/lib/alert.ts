"use client";

/**
 * Alerte de nouvelle commande.
 *
 * Le téléphone est posé sur un plan de travail, l'écran verrouillé ou couvert
 * de farine. Une pastille rouge ne suffit pas: il faut un son.
 *
 * Deux contraintes de navigateur commandent la forme de ce fichier.
 *
 * 1. Aucun son ne peut démarrer sans un geste préalable de l'utilisateur.
 *    D'où `unlockAudio()`, appelé sur un appui explicite, et un bouton dédié
 *    dans l'interface. Sans ce bouton, le son échouerait en silence et la
 *    cuisine croirait être prévenue.
 * 2. Un fichier audio devrait être téléchargé, décodé, et resterait muet si le
 *    réseau lâche. Les bips sont donc synthétisés: rien à charger, rien à
 *    manquer.
 */

type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | null = null;

function contextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Ouvre le canal audio. À appeler depuis un gestionnaire d'événement d'appui,
 * jamais depuis un effet: hors geste utilisateur, le contexte naît suspendu et
 * ne joue rien.
 */
export async function unlockAudio(): Promise<boolean> {
  const Ctor = contextConstructor();
  if (!Ctor) return false;

  try {
    context ??= new Ctor();
    if (context.state === "suspended") await context.resume();
    return context.state === "running";
  } catch {
    return false;
  }
}

export function isAudioReady(): boolean {
  return context?.state === "running";
}

export function closeAudio(): void {
  context?.close().catch(() => {});
  context = null;
}

/** Un bip, à une fréquence et un instant donnés. */
function beep(at: number, frequency: number): void {
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  // Enveloppe courte: une attaque franche puis une extinction douce. Un
  // créneau brut produirait un claquement à l'arrêt.
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.28, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + 0.36);
}

/**
 * Trois notes montantes. Assez pour être reconnue d'une pièce à l'autre,
 * assez brève pour ne pas gêner si elle se déclenche pendant un appel.
 */
export function ring(): void {
  if (context?.state === "running") {
    const now = context.currentTime;
    beep(now, 784);
    beep(now + 0.22, 988);
    beep(now + 0.44, 1319);
  }

  // Vibration en parallèle, pas en remplacement: le son peut être coupé au
  // niveau du système sans que la page le sache.
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.([180, 90, 180, 90, 260]);
  }
}
