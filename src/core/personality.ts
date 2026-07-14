/**
 * Derived personality label (SPEC §11.8). Raw trait numbers are never shown; the UI
 * exposes a composite label from trait clusters, as in real management games.
 */

import type { Personality, Player } from './types.js';

const HI = 0.66;
const LO = 0.34;

/**
 * Every label `personalityLabel()` can produce. Exposed for systems that need a plausible
 * WRONG guess (scouting uncertainty, ARCHITECTURE §6) — never for direct display of traits.
 */
export const PERSONALITY_LABELS: readonly string[] = [
  'Testa calda',
  'Spirito libero',
  'Professionista modello',
  'Talento sregolato',
  'Trascinatore',
  'Leader nato',
  'Mercenario',
  'Silenzioso professionista',
  'Anima della festa',
  'Discontinuo',
  'Nella media',
];

/** A neutral personality (used as a fallback for legacy saves). */
export function neutralPersonality(): Personality {
  return {
    professionalism: 0.5,
    determination: 0.5,
    consistency: 0.5,
    leadership: 0.5,
    temperament: 0.5,
    ambition: 0.5,
    loyalty: 0.5,
    adaptability: 0.5,
    composure: 0.5,
    socialita: 0.5,
    divergente: false,
  };
}

/**
 * How a captain's leadership bonus propagates (SPEC §11.10). Only the MODE is chosen
 * now (a predisposition); the full diffused effect awaits a morale system, so the
 * numeric captain bonus (§11.7) is unchanged.
 */
export function captainBonusMode(player: Player): 'local' | 'diffused' {
  return player.personality.socialita >= 0.5 ? 'diffused' : 'local';
}

/** Composite label from the dominant trait cluster; first match wins. */
export function personalityLabel(player: Player): string {
  const p = player.personality;
  if (p.divergente) {
    return p.temperament >= HI || p.determination <= LO ? 'Testa calda' : 'Spirito libero';
  }
  if (p.professionalism >= HI && p.determination >= HI) return 'Professionista modello';
  if (p.professionalism <= LO && player.potential >= 75) return 'Talento sregolato';
  if (p.socialita >= HI && p.leadership >= HI) return 'Trascinatore';
  if (p.leadership >= HI && p.determination >= HI) return 'Leader nato';
  if (p.ambition >= HI && p.loyalty <= LO) return 'Mercenario';
  if (p.socialita <= LO && p.professionalism >= HI) return 'Silenzioso professionista';
  if (p.socialita >= HI && p.determination <= LO) return 'Anima della festa';
  if (p.consistency <= LO) return 'Discontinuo';
  return 'Nella media';
}
