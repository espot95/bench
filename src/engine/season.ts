/**
 * Season engine: build the calendar, simulate every round in order (updating Elo
 * live so form feeds back into strength), and expose the final table. See SPEC.md §4-§6.
 */

import { asSeasonId } from '../domain/ids.js';
import type { Match, Season, StandingRow, World } from '../domain/types.js';
import type { Rng } from '../rng/rng.js';
import { initialiseElo, updateElo } from './elo.js';
import { buildLeagueContext, effectiveRatings } from './league-context.js';
import { simulateMatch } from './match.js';
import { generateSchedule } from './scheduler.js';
import { computeStandings } from './standings.js';

/** Create a scheduled (unplayed) season for the world's league. */
export function createSeason(world: World, year: number, rngSeed: number): Season {
  const seasonId = asSeasonId(`season-${year}`);
  return {
    id: seasonId,
    leagueId: world.league.id,
    year,
    rngSeed,
    status: 'scheduled',
    fixtures: generateSchedule(seasonId, world.league.clubIds),
  };
}

/**
 * Simulate all remaining fixtures in round order. Mutates the matches (fills in
 * goals) and the clubs' Elo. Returns the season for chaining.
 */
export function simulateSeason(world: World, season: Season, rng: Rng): Season {
  initialiseElo(world);
  const ctx = buildLeagueContext(world);

  const byRound = [...season.fixtures].sort((a, b) => a.round - b.round);
  season.status = 'in_progress';

  for (const match of byRound) {
    if (match.played) continue;
    playMatch(world, ctx, match, rng);
  }

  season.status = 'finished';
  return season;
}

function playMatch(
  world: World,
  ctx: ReturnType<typeof buildLeagueContext>,
  match: Match,
  rng: Rng,
): void {
  const home = world.clubs.get(match.homeClubId);
  const away = world.clubs.get(match.awayClubId);
  if (!home || !away) throw new Error(`Match ${match.id} references unknown club`);

  const result = simulateMatch(effectiveRatings(home, ctx), effectiveRatings(away, ctx), ctx, rng);

  match.homeGoals = result.homeGoals;
  match.awayGoals = result.awayGoals;
  match.played = true;

  const homeScore =
    result.homeGoals > result.awayGoals ? 1 : result.homeGoals === result.awayGoals ? 0.5 : 0;
  const updated = updateElo(home.elo, away.elo, homeScore, result.homeGoals - result.awayGoals);
  home.elo = updated.home;
  away.elo = updated.away;
}

/** Final (or current) standings for a season. */
export function seasonStandings(world: World, season: Season): StandingRow[] {
  return computeStandings(world.league.clubIds, season.fixtures);
}
