/**
 * Duelli di giornata (SPEC §19): il miglior dribblatore contro il difensore più ruvido
 * avversario. Il duello REDISTRIBUISCE cartellini (pesi, non conteggi: la Poisson resta
 * quella) e aggiunge un piccolo rischio-infortunio al dribblatore, attenuato dal
 * baricentro basso (gli scivola via). Puro, deterministico, zero draw RNG in planning.
 */

import type { PlayerId } from '../core/ids.js';
import { baricentroFactor } from '../core/physique.js';
import type { Player } from '../core/types.js';

export const DUEL = {
  /** Sotto questa intensità il duello non morde. */
  MIN_INTENSITY: 0.15,
  /** Peso-cartellino del ruvido: ×(1 + CARD_BOOST·I). */
  CARD_BOOST: 1.6,
  /** Rischio-infortunio extra del dribblatore: ×(1 + INJ_BOOST·I·(1 − SLIP·bassoBaricentro)). */
  INJ_BOOST: 0.9,
  SLIP: 0.5,
  /** Il gap di velocità scala l'intensità (il lento può solo far fallo). */
  PACE_GAP_SPAN: 40,
} as const;

function attr(p: Player, key: string): number {
  return (p.attributes as unknown as Record<string, number>)[key] ?? 0;
}

/** Quanto sono duri gli interventi del difensore [0..1] (forza+contrasto, testa calda). */
export function roughness(p: Player): number {
  const base = (0.5 * attr(p, 'tackling') + 0.5 * attr(p, 'strength')) / 100;
  const head = 0.25 * p.personality.temperament - 0.2 * p.personality.composure;
  return Math.max(0, Math.min(1, base + head - 0.15));
}

/** Quanto il dribblatore costringe al duello [0..1]; il baricentro basso lo esalta. */
export function duelThreat(p: Player): number {
  const base = (0.6 * attr(p, 'dribbling') + 0.4 * attr(p, 'pace')) / 100;
  const lowBari = Math.max(0, -baricentroFactor(p));
  return Math.max(0, Math.min(1, base + 0.12 * lowBari - 0.2));
}

export interface DuelModEntry {
  cardMult: number;
  injMult: number;
}
export type DuelMods = Map<PlayerId, DuelModEntry>;

export interface MatchDuel {
  attackerId: PlayerId;
  attackerName: string;
  defenderId: PlayerId;
  defenderName: string;
  intensity: number;
}

function bestAttacker(xi: readonly Player[]): Player | undefined {
  return [...xi]
    .filter((p) => p.position === 'FW' || p.position === 'MF')
    .sort((a, b) => duelThreat(b) - duelThreat(a))[0];
}

function roughestDefender(xi: readonly Player[]): Player | undefined {
  return [...xi].filter((p) => p.position === 'DF').sort((a, b) => roughness(b) - roughness(a))[0];
}

function pairUp(attackXI: readonly Player[], defendXI: readonly Player[]): MatchDuel | null {
  const attacker = bestAttacker(attackXI);
  const defender = roughestDefender(defendXI);
  if (!attacker || !defender) return null;
  const gap = Math.max(
    0,
    Math.min(1, (attr(attacker, 'pace') - attr(defender, 'pace')) / DUEL.PACE_GAP_SPAN),
  );
  const intensity = duelThreat(attacker) * roughness(defender) * (0.5 + 0.8 * gap);
  if (intensity < DUEL.MIN_INTENSITY) return null;
  return {
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    intensity,
  };
}

/** I due duelli della partita (uno per direzione d'attacco) + i modificatori per-giocatore. */
export function planDuels(
  homeXI: readonly Player[],
  awayXI: readonly Player[],
  players: ReadonlyMap<PlayerId, Player>,
): { mods: DuelMods; duels: MatchDuel[] } {
  const mods: DuelMods = new Map();
  const duels: MatchDuel[] = [];
  for (const duel of [pairUp(homeXI, awayXI), pairUp(awayXI, homeXI)]) {
    if (!duel) continue;
    duels.push(duel);
    const attacker = players.get(duel.attackerId);
    const lowBari = attacker ? Math.max(0, -baricentroFactor(attacker)) : 0;
    const def = mods.get(duel.defenderId) ?? { cardMult: 1, injMult: 1 };
    def.cardMult *= 1 + DUEL.CARD_BOOST * duel.intensity;
    mods.set(duel.defenderId, def);
    const att = mods.get(duel.attackerId) ?? { cardMult: 1, injMult: 1 };
    att.injMult *= 1 + DUEL.INJ_BOOST * duel.intensity * (1 - DUEL.SLIP * lowBari);
    mods.set(duel.attackerId, att);
  }
  return { mods, duels };
}
