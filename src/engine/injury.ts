/**
 * Injuries (SPEC §12): proneness, per-match injury roll, severity/duration, and the
 * permanent physical hit of a severe injury. Pure + RNG-injected.
 */

import { clampAttr } from '../core/attributes.js';
import type { Player } from '../core/types.js';
import type { Rng } from '../rng/rng.js';
import { INJURY } from './constants.js';

export type InjurySeverity = 'minor' | 'moderate' | 'severe';

export interface Injury {
  severity: InjurySeverity;
  durationMatches: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Effective proneness: base + age (over 29) + explosive-pace modifiers. See SPEC §12.1. */
export function effectiveProneness(player: Player): number {
  const ageMod = Math.max(0, player.age - 29) * INJURY.AGE_K;
  const paceMod = (Math.max(0, player.attributes.pace - 75) / 100) * INJURY.PACE_K;
  return clamp01(player.injuryProneness + ageMod + paceMod);
}

/** Probability this starter gets injured during a match. */
export function injuryChance(player: Player): number {
  return INJURY.BASE_PROB * (INJURY.PRONE_MIN + INJURY.PRONE_SPAN * effectiveProneness(player));
}

/** Roll severity + duration for a player who is being injured (proneness fattens the severe tail). */
export function rollInjury(player: Player, rng: Rng): Injury {
  const severeShift = INJURY.SEVERE_PRONE_SHIFT * effectiveProneness(player);
  const pMinor = INJURY.P_MINOR - severeShift;
  const pModerate = INJURY.P_MODERATE;

  const r = rng.next();
  let severity: InjurySeverity;
  let range: readonly [number, number];
  if (r < pMinor) {
    severity = 'minor';
    range = INJURY.DUR_MINOR;
  } else if (r < pMinor + pModerate) {
    severity = 'moderate';
    range = INJURY.DUR_MODERATE;
  } else {
    severity = 'severe';
    range = INJURY.DUR_SEVERE;
  }
  return { severity, durationMatches: rng.int(range[0], range[1]) };
}

/** Injury label for the squad view (SPEC §12.1); null when unremarkable. */
export function injuryLabel(player: Player): string | null {
  if (player.injuryProneness >= 0.8) return 'Di cristallo';
  if (player.injuryProneness <= 0.2) return 'Di ferro';
  return null;
}

/**
 * Apply the permanent physical toll of a severe injury: removes a few points from
 * pace/stamina/strength. Repeated severe injuries compound. Overall is derived (§1.2).
 */
export function applySevereHit(player: Player, rng: Rng): void {
  const total = rng.int(INJURY.SEVERE_HIT[0], INJURY.SEVERE_HIT[1]);
  const attrs = player.attributes as unknown as Record<string, number>;
  const each = Math.floor(total / 3);
  const remainder = total - each * 3;
  attrs.pace = clampAttr((attrs.pace as number) - each - remainder);
  attrs.stamina = clampAttr((attrs.stamina as number) - each);
  attrs.strength = clampAttr((attrs.strength as number) - each);
  // Overall is derived; the hit shows up automatically via playerOverall().
}
