/**
 * Piazza pressure (GAME_DESIGN §5, SPEC §18): a DERIVED club-level pressure — big stages
 * plus underperformance — that modulates each player's match contribution through his
 * character. Bidirectional: fragile characters collapse, couldn't-care-less types dip a
 * little, strong leaders get a boost (the "Ronaldo al Real" effect). Pure, never stored.
 */

import type { Personality } from '../core/types.js';
import { PRESSURE } from './constants.js';

/**
 * Ambient pressure of a club [0,1]: reputation base + underperformance heat.
 * `expectedRank`/`currentRank` are 0-based; pass currentRank = expectedRank early on.
 */
export function clubPressure(
  reputation: number,
  expectedRank: number,
  currentRank: number,
): number {
  const base =
    Math.max(0, Math.min(1, (reputation - PRESSURE.REP_LO) / (PRESSURE.REP_HI - PRESSURE.REP_LO))) *
    PRESSURE.BASE_MAX;
  const under = Math.max(0, currentRank - expectedRank) / 10;
  return Math.max(0, Math.min(1, base + PRESSURE.UNDER_K * under));
}

/**
 * Per-player contribution multiplier delta for a given ambient pressure (SPEC §18.2).
 * Returns `effetto` in [MALUS_CAP, BONUS_CAP]; apply as ×(1 + effetto).
 */
export function pressureEffect(personality: Personality, pressure: number): number {
  // How much he FEELS the piazza: the menefreghista (low prof/ambition) barely does.
  const sensitivity =
    PRESSURE.SENS_BASE +
    (1 - PRESSURE.SENS_BASE) * Math.max(personality.professionalism, personality.ambition);
  // What it does to him: fragile → negative, composed leader → positive.
  const response =
    2 * (personality.composure - 0.5) + PRESSURE.LEAD_K * 2 * (personality.leadership - 0.5);

  let effect = PRESSURE.K * pressure * sensitivity * response;
  if (effect < 0) effect *= 1 - PRESSURE.DET_ATT * (personality.determination - 0.5);
  return Math.max(PRESSURE.MALUS_CAP, Math.min(PRESSURE.BONUS_CAP, effect));
}
