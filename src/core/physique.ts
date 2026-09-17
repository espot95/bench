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

/**
 * TIPO DI CORSA (richiesta utente): le leve decidono COME si corre, la velocità
 * decide QUANTO. Leve lunghe (baricentro alto) = falcata ampia, punta di velocità
 * raggiunta tardi ma tenuta a lungo; leve corte = frequenza e ACCELERAZIONE nei
 * primi metri, meno tenuta nel lanciato. Derivato e deterministico, mai memorizzato.
 */
export interface RunningStyle {
  id: 'falcata' | 'diesel' | 'esplosivo' | 'frequenza' | 'mediofondista' | 'equilibrato';
  label: string;
  desc: string;
}

export function runningStyle(player: Player): RunningStyle {
  const lever = baricentroFactor(player); // >0 = leve lunghe, <0 = leve corte
  const pace = attr(player, 'pace');
  const stamina = attr(player, 'stamina');
  if (lever >= 0.3 && pace >= 64)
    return {
      id: 'falcata',
      label: 'Falcata lunga',
      desc: 'leve lunghe: entra in velocità tardi ma la TIENE — lanciato è imprendibile',
    };
  if (lever >= 0.3)
    return {
      id: 'diesel',
      label: 'Diesel',
      desc: 'passo lungo ma lento a mettersi in moto: gli serve campo davanti',
    };
  if (lever <= -0.25 && pace >= 64)
    return {
      id: 'esplosivo',
      label: 'Esplosivo',
      desc: 'leve corte: ACCELERAZIONE bruciante nei primi metri, meno tenuta nel lanciato',
    };
  if (lever <= -0.25)
    return {
      id: 'frequenza',
      label: 'Passo frequente',
      desc: 'leve corte e appoggi rapidi: vivo nei duelli stretti, non nello spazio aperto',
    };
  if (stamina >= 72)
    return {
      id: 'mediofondista',
      label: 'Mediofondista',
      desc: 'stesso ritmo dal 1’ al 90’: non stacca mai la spina',
    };
  return {
    id: 'equilibrato',
    label: 'Corsa equilibrata',
    desc: 'buon primo passo e buona tenuta, senza eccessi',
  };
}
