/**
 * Double round-robin fixture generator (circle method). See SPEC.md §5.
 * Pure: same input clubs => same schedule.
 */

import { asMatchId } from '../domain/ids.js';
import type { ClubId, SeasonId } from '../domain/ids.js';
import type { Match } from '../domain/types.js';

interface Pairing {
  home: ClubId;
  away: ClubId;
}

/**
 * Generate all fixtures for a double round-robin among `clubIds`.
 * Requires an even number of clubs. Produces 2*(N-1) rounds.
 */
export function generateSchedule(seasonId: SeasonId, clubIds: readonly ClubId[]): Match[] {
  if (clubIds.length < 2) throw new Error('Need at least 2 clubs to schedule');
  if (clubIds.length % 2 !== 0) throw new Error('Club count must be even (no BYE support yet)');

  const firstLeg = circleMethod(clubIds);
  const rounds = firstLeg.length; // N-1
  const matches: Match[] = [];
  let seq = 0;

  // First leg.
  firstLeg.forEach((pairings, r) => {
    for (const p of pairings) {
      matches.push(makeMatch(seasonId, ++seq, r + 1, p.home, p.away));
    }
  });

  // Second leg: same pairings, venue reversed, later rounds.
  firstLeg.forEach((pairings, r) => {
    for (const p of pairings) {
      matches.push(makeMatch(seasonId, ++seq, rounds + r + 1, p.away, p.home));
    }
  });

  return matches;
}

/**
 * Circle method: fix club 0, rotate the rest. Alternate home/away for the fixed
 * slot each round so venues stay balanced.
 */
function circleMethod(clubIds: readonly ClubId[]): Pairing[][] {
  const n = clubIds.length;
  const arr = clubIds.slice();
  const rounds: Pairing[][] = [];

  for (let r = 0; r < n - 1; r++) {
    const pairings: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i] as ClubId;
      const b = arr[n - 1 - i] as ClubId;
      // Alternate venue for the pivot pairing each round for balance.
      const homeFirst = i === 0 ? r % 2 === 0 : true;
      pairings.push(homeFirst ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(pairings);
    // Rotate all but the first element.
    arr.splice(1, 0, arr.pop() as ClubId);
  }

  return rounds;
}

function makeMatch(
  seasonId: SeasonId,
  seq: number,
  round: number,
  home: ClubId,
  away: ClubId,
): Match {
  return {
    id: asMatchId(`${seasonId}-m${seq}`),
    seasonId,
    round,
    homeClubId: home,
    awayClubId: away,
    played: false,
    homeGoals: null,
    awayGoals: null,
  };
}
