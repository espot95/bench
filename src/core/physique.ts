/**
 * Fisico derivato (SPEC §19): altezza e baricentro. NIENTE campo memorizzato per i
 * generati (stessa regola dell'overall): l'altezza si deriva da ruolo+attributi+hash —
 * così i piccoletti del mondo SONO i dribblomani agili e i marcatori torreggiano,
 * senza toccare lo stream di generazione. Il RosterPack può autorare `Player.height`.
 */

import type { Player, Position } from './types.js';

export const PHYSIQUE = {
  /** Altezza base per ruolo (cm). */
  BASE: { GK: 190, DF: 186, MF: 180, FW: 179 } as Record<Position, number>,
  /** Contributi degli attributi (cm per punto sopra 60). */
  STRENGTH_CM: 0.14,
  DRIBBLING_CM: -0.1,
  PACE_CM: -0.04,
  /** Rumore hash ±NOISE_CM. */
  NOISE_CM: 6,
  MIN: 165,
  MAX: 202,
  /** Altezza "neutra" e scala per il fattore baricentro. */
  NEUTRAL: 183,
  SPAN: 18,
} as const;

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

function attr(player: Player, key: string): number {
  return (player.attributes as unknown as Record<string, number>)[key] ?? 60;
}

/** Altezza in cm: autorata se presente, altrimenti DERIVATA (deterministica). */
export function playerHeight(player: Player): number {
  if (player.height !== undefined) return player.height;
  let h = PHYSIQUE.BASE[player.position];
  h += (attr(player, 'strength') - 60) * PHYSIQUE.STRENGTH_CM;
  if (player.position !== 'GK') {
    h += (attr(player, 'dribbling') - 60) * PHYSIQUE.DRIBBLING_CM;
    h += (attr(player, 'pace') - 60) * PHYSIQUE.PACE_CM;
  }
  h += (hash01(`${player.id}|height`) - 0.5) * 2 * PHYSIQUE.NOISE_CM;
  return Math.round(Math.max(PHYSIQUE.MIN, Math.min(PHYSIQUE.MAX, h)));
}

/** Baricentro come fattore [-1, 1]: negativo = basso (agile), positivo = alto. */
export function baricentroFactor(player: Player): number {
  const f = (playerHeight(player) - PHYSIQUE.NEUTRAL) / PHYSIQUE.SPAN;
  return Math.max(-1, Math.min(1, f));
}

/** Etichetta per report e UI. */
export function baricentroLabel(player: Player): 'basso' | 'medio' | 'alto' {
  const f = baricentroFactor(player);
  if (f <= -0.3) return 'basso';
  if (f >= 0.35) return 'alto';
  return 'medio';
}
