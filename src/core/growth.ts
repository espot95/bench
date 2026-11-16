/**
 * Curva di carriera DERIVATA (SPEC §11.11) — la stessa regola dell'overall e
 * dell'archetipo: MAI memorizzata, MAI mostrata come dato. Hash deterministico
 * sull'id (zero draw di RNG: i mondi restano byte-identici e i save legacy
 * ottengono le curve senza migrazione), reparto dal ruolo (per i DF conta
 * l'archetipo derivato: il terzino invecchia prima del centrale).
 */

import { playerArchetype } from './archetypes.js';
import type { Player } from './types.js';

export type GrowthCurve = 'precoce' | 'lineare' | 'tardivo' | 'esplosivo' | 'evergreen';

export interface GrowthProfile {
  curve: GrowthCurve;
  /** Età d'inizio del declino (offset di reparto incluso). */
  declineAge: number;
  /** Solo 'esplosivo': prima delle 2 stagioni della finestra di esplosione. */
  surgeAge?: number;
  /** Finestra di realizzazione del potenziale (SPEC §11.12), estremi inclusi. */
  windowStart: number;
  windowEnd: number;
  /** Pendenza del declino FISICO del reparto (GK 0.75 · centrali 0.9 · terzini 1.15). */
  declineSlope: number;
}

/** FNV-1a → [0,1), come l'hash di tiebreak degli archetipi. */
function h01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/** Pesi delle curve (SPEC §11.11): 12/55/15/10/8. */
export function growthKindOf(id: string): GrowthCurve {
  const h = h01(`${id}|curva`);
  if (h < 0.12) return 'precoce';
  if (h < 0.67) return 'lineare';
  if (h < 0.82) return 'tardivo';
  if (h < 0.92) return 'esplosivo';
  return 'evergreen';
}

/** [base dell'estrazione, ampiezza] di declineAge per curva. */
const DECLINE_BASE: Record<GrowthCurve, readonly [number, number]> = {
  precoce: [27, 3],
  lineare: [31, 3], // richiesta utente: il "normale" cala tra i 31 e i 33
  tardivo: [31, 3],
  esplosivo: [30, 3],
  evergreen: [33, 3],
};

const WINDOW: Record<GrowthCurve, readonly [number, number]> = {
  precoce: [19, 21],
  lineare: [20, 23],
  tardivo: [22, 26],
  esplosivo: [20, 24],
  evergreen: [20, 23],
};

/**
 * Età efficace per il potenziale alla GENERAZIONE (SPEC §11.11): il tardivo ha
 * ancora margine a 24, il precoce lo ha già speso a 21.
 */
export function potentialAgeShift(curve: GrowthCurve): number {
  return curve === 'tardivo' ? -3 : curve === 'precoce' ? 2 : 0;
}

/** Il profilo completo di crescita di un giocatore — derivato, mai persistito. */
export function growthOf(player: Player): GrowthProfile {
  const id = player.id as string;
  const curve = growthKindOf(id);
  const [base, span] = DECLINE_BASE[curve];
  let declineAge = base + (Math.floor(h01(`${id}|declino`) * span) % span);

  // Reparto (richiesta utente): GK lenti (ma col rischio-crollo, gestito in
  // progressione), centrali più dolci dei terzini.
  let declineSlope = 1;
  if (player.position === 'GK') {
    declineAge += 2;
    declineSlope = 0.75;
  } else if (player.position === 'DF') {
    const terzino = playerArchetype(player).id.startsWith('df-fascia');
    declineAge += terzino ? -1 : 1;
    declineSlope = terzino ? 1.15 : 0.9;
  }

  const [windowStart, windowEnd] = WINDOW[curve];
  return {
    curve,
    declineAge,
    surgeAge: curve === 'esplosivo' ? 19 + Math.floor(h01(`${id}|surge`) * 6) : undefined,
    windowStart,
    windowEnd,
    declineSlope,
  };
}
