/**
 * Match-event generation: given a scoreline and the two starting XIs, attribute
 * goals to scorers/assisters and generate cards. Pure & deterministic, driven by
 * a dedicated events RNG so the scoreline stream is untouched. See SPEC.md §6.4.
 */

import type { ClubId, PlayerId } from '../domain/ids.js';
import type { MatchEvent, Player, Position } from '../domain/types.js';
import type { Rng } from '../rng/rng.js';
import { EVENTS } from './constants.js';

export interface TeamSide {
  clubId: ClubId;
  xi: Player[];
}

/** Read a numeric attribute if present (GK lacks finishing/passing, etc.). */
function attrValue(player: Player, key: string): number {
  return (player.attributes as unknown as Record<string, number>)[key] ?? 0;
}

/** Weighted index pick; returns -1 if all weights are zero. */
function weightedPick(weights: number[], rng: Rng): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let target = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    target -= weights[i] as number;
    if (target < 0) return i;
  }
  return weights.length - 1;
}

function goalWeights(xi: Player[]): number[] {
  return xi.map((p) => {
    const base = EVENTS.GOAL_POS_WEIGHT[p.position as Position];
    return base * (attrValue(p, 'finishing') / 50);
  });
}

function assistWeights(xi: Player[], scorerIndex: number): number[] {
  return xi.map((p, i) => {
    if (i === scorerIndex) return 0; // no assisting your own goal
    const base = EVENTS.ASSIST_POS_WEIGHT[p.position as Position];
    return base * (attrValue(p, 'passing') / 50);
  });
}

function cardWeights(xi: Player[]): number[] {
  return xi.map((p) => EVENTS.CARD_POS_WEIGHT[p.position as Position]);
}

/** Generate goal events (with optional assists) for one team's tally. */
function goalEvents(side: TeamSide, goals: number, rng: Rng): MatchEvent[] {
  const events: MatchEvent[] = [];
  const gWeights = goalWeights(side.xi);

  for (let g = 0; g < goals; g++) {
    const scorerIdx = weightedPick(gWeights, rng);
    const scorer = side.xi[scorerIdx] ?? side.xi[0];
    if (!scorer) continue;

    let assistId: PlayerId | null = null;
    if (rng.chance(EVENTS.ASSIST_RATE)) {
      const assistIdx = weightedPick(assistWeights(side.xi, scorerIdx), rng);
      if (assistIdx >= 0) assistId = (side.xi[assistIdx] as Player).id;
    }

    events.push({
      minute: rng.int(1, 90),
      type: 'goal',
      clubId: side.clubId,
      playerId: scorer.id,
      assistId,
    });
  }
  return events;
}

/**
 * Generate card events for one team. A player's second yellow in the match becomes
 * a red (sending off); a sent-off player receives no further cards. Straight reds
 * are separate. See SPEC.md §6.4.
 */
function cardEvents(side: TeamSide, rng: Rng): MatchEvent[] {
  const events: MatchEvent[] = [];
  const baseWeights = cardWeights(side.xi);
  const yellowCount = new Array(side.xi.length).fill(0);
  const firstYellowMinute = new Array(side.xi.length).fill(0);
  const sentOff = new Array(side.xi.length).fill(false);

  // Weighted pick that excludes dismissed players and makes already-booked
  // players much less likely to be booked again (caution / substitution).
  const pickEligible = (): number =>
    weightedPick(
      baseWeights.map((w, i) => {
        if (sentOff[i]) return 0;
        return yellowCount[i] >= 1 ? w * EVENTS.BOOKED_CAUTION : w;
      }),
      rng,
    );

  const card = (type: 'yellow' | 'red', playerId: MatchEvent['playerId'], minute: number) => {
    events.push({ minute, type, clubId: side.clubId, playerId, assistId: null });
  };

  // Yellow bookings; a second yellow on the same player triggers a dismissal.
  // The second yellow (and its red) is placed strictly after the first, so the
  // timeline stays coherent despite minutes being sampled independently.
  const yellows = rng.poisson(EVENTS.YELLOW_LAMBDA);
  for (let i = 0; i < yellows; i++) {
    const idx = pickEligible();
    if (idx < 0) break;
    const player = side.xi[idx] as Player;
    if (yellowCount[idx] === 0) {
      const minute = rng.int(1, 90);
      firstYellowMinute[idx] = minute;
      card('yellow', player.id, minute);
      yellowCount[idx] = 1;
    } else {
      const first = firstYellowMinute[idx] as number;
      const minute = first >= 90 ? 90 : rng.int(first + 1, 90);
      card('yellow', player.id, minute);
      card('red', player.id, minute); // second yellow => sent off
      yellowCount[idx] = 2;
      sentOff[idx] = true;
    }
  }

  // Straight (direct) reds.
  const straightReds = rng.poisson(EVENTS.RED_LAMBDA);
  for (let i = 0; i < straightReds; i++) {
    const idx = pickEligible();
    if (idx < 0) break;
    card('red', (side.xi[idx] as Player).id, rng.int(1, 90));
    sentOff[idx] = true;
  }

  return events;
}

/**
 * All events for a match. The number of 'goal' events per side equals that side's
 * score (invariant relied upon by player-stats aggregation). Ordered by minute.
 */
export function generateMatchEvents(
  home: TeamSide,
  away: TeamSide,
  homeGoals: number,
  awayGoals: number,
  rng: Rng,
): MatchEvent[] {
  const events: MatchEvent[] = [
    ...goalEvents(home, homeGoals, rng),
    ...goalEvents(away, awayGoals, rng),
    ...cardEvents(home, rng),
    ...cardEvents(away, rng),
  ];
  events.sort((a, b) => a.minute - b.minute);
  return events;
}
