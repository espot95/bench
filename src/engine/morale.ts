/**
 * Individual morale (SPEC §13, layer 1): an event-driven per-player scalar in [0,1],
 * neutral 0.5. Updated after each match from the result, minutes-vs-expectation
 * (the main lever), and the team's league standing, then pulled back toward neutral.
 * Pure — mutates `player.morale` in place.
 */

import { playerOverall } from '../core/ratings.js';
import type { Club, Player, World } from '../core/types.js';
import { MORALE } from './constants.js';

/** How a player featured in his club's match. */
export type Appearance = 'started' | 'sub' | 'unused' | 'unavailable';

const APPEARANCE_VALUE: Record<Exclude<Appearance, 'unavailable'>, number> = {
  started: 1,
  sub: 0.5,
  unused: 0,
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Coarse morale label for display (morale is a shown state, not a hidden trait). */
export function moraleLabel(morale: number): string {
  if (morale >= 0.7) return 'Felice';
  if (morale >= 0.55) return 'Sereno';
  if (morale >= 0.4) return 'Nella norma';
  if (morale >= 0.25) return 'Scontento';
  return 'Giù di morale';
}

/** Expected play level [0,1] from squad rating rank + ambition (SPEC §13.2). */
function playExpectation(rankIndex: number, ambition: number): number {
  const byRank = clamp01(1 - rankIndex / 13); // top ~11 expect to feature, fringe don't
  return clamp01(byRank + (ambition - 0.5) * MORALE.AMBITION_EXPECTATION);
}

/**
 * Update the morale of every player in a club after its match.
 * `positionDelta` = expectedRank − actualRank (positive = doing better than expected).
 */
export function updateMoraleForClub(
  world: World,
  club: Club,
  appearance: Map<string, Appearance>,
  result: 'win' | 'draw' | 'loss',
  positionDelta: number,
): void {
  const squad = club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => playerOverall(b) - playerOverall(a));
  const rankOf = new Map(squad.map((p, i) => [p.id, i]));

  const resultSign = result === 'win' ? 1 : result === 'loss' ? -1 : 0;
  const teamDelta = Math.max(-1, Math.min(1, positionDelta / 10)) * MORALE.TEAM_WEIGHT;

  for (const player of squad) {
    const app = appearance.get(player.id) ?? 'unused';

    if (app === 'unavailable') {
      // Injured/suspended: not their fault → only drift back toward neutral.
      player.morale = decayToNeutral(player.morale);
      continue;
    }

    const played = APPEARANCE_VALUE[app];
    const expectation = playExpectation(
      rankOf.get(player.id) ?? squad.length,
      player.personality.ambition,
    );

    const dMinutes = (played - expectation) * MORALE.MINUTES_WEIGHT;
    const dResult = resultSign * MORALE.RESULT_WEIGHT * (0.4 + 0.6 * played);
    let delta = dMinutes + dResult + teamDelta;

    // Determination cushions the bad days.
    if (delta < 0) delta *= 1 - (player.personality.determination - 0.5) * MORALE.DET_ATTENUATE;

    player.morale = decayToNeutral(clamp01(player.morale + delta));
  }
}

function decayToNeutral(morale: number): number {
  return clamp01(morale + (MORALE.NEUTRAL - morale) * MORALE.DECAY);
}
