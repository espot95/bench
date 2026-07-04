/** Elo rating: initialisation, expectation and update. See SPEC.md §4. */

import { computeTeamStrength } from '../domain/ratings.js';
import type { League, World } from '../domain/types.js';
import { ELO } from './constants.js';

/** Expected score for the home side, factoring home-field advantage. */
export function expectedHomeScore(eloHome: number, eloAway: number): number {
  return 1 / (1 + 10 ** (-(eloHome + ELO.HFA - eloAway) / 400));
}

export interface EloUpdate {
  home: number;
  away: number;
}

/**
 * New Elo ratings after a result. `homeScore` is 1 (home win), 0.5 (draw) or 0 (away win);
 * `goalDiff` is the absolute goal difference, used for the margin-of-victory multiplier.
 */
export function updateElo(
  eloHome: number,
  eloAway: number,
  homeScore: number,
  goalDiff: number,
): EloUpdate {
  const expHome = expectedHomeScore(eloHome, eloAway);
  const g = 1 + ELO.MOV_SCALE * Math.log(1 + Math.abs(goalDiff));
  const delta = ELO.K * g * (homeScore - expHome);
  return { home: eloHome + delta, away: eloAway - delta };
}

/**
 * Initialise every club's Elo from its squad strength, centred on ELO.BASE.
 * Mutates the clubs in place. See SPEC.md §4.
 */
export function initialiseElo(world: World, league: League): void {
  const clubs = league.clubIds
    .map((id) => world.clubs.get(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  const strengths = clubs.map((c) => computeTeamStrength(c, world).overall);
  const mean = avg(strengths);
  const std = stdDev(strengths, mean) || 1; // avoid divide-by-zero

  for (const club of clubs) {
    const strength = computeTeamStrength(club, world).overall;
    club.elo = ELO.BASE + ELO.SPREAD * ((strength - mean) / std);
  }
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[], mean: number): number {
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}
