/**
 * Season engine: build the calendar, simulate every round in order (updating Elo
 * live so form feeds back into strength), and expose the final table. See SPEC.md §4-§6.
 */

import { asSeasonId } from '../domain/ids.js';
import type { ClubId } from '../domain/ids.js';
import { selectStartingXI } from '../domain/ratings.js';
import type { Match, Player, Season, StandingRow, World } from '../domain/types.js';
import { type Rng, createRng } from '../rng/rng.js';
import { initialiseElo, updateElo } from './elo.js';
import { buildLeagueContext, effectiveRatings } from './league-context.js';
import { generateMatchEvents } from './match-events.js';
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
 * goals + events) and the clubs' Elo. Returns the season for chaining.
 *
 * Match events use a SEPARATE rng derived from the season seed, so the scoreline
 * rng stream (and thus the calibrated results) is untouched. See SPEC.md §6.4.
 */
export function simulateSeason(world: World, season: Season, rng: Rng): Season {
  initialiseElo(world);
  const ctx = buildLeagueContext(world);
  const eventsRng = createRng((season.rngSeed ^ 0x9e3779b9) >>> 0);

  // Starting XIs are fixed for the season; compute once.
  const xiByClub = new Map<ClubId, Player[]>();
  for (const club of world.clubs.values()) {
    xiByClub.set(club.id, selectStartingXI(club, world));
  }

  const byRound = [...season.fixtures].sort((a, b) => a.round - b.round);
  season.status = 'in_progress';

  for (const match of byRound) {
    if (match.played) continue;
    playMatch(world, ctx, xiByClub, match, rng, eventsRng);
  }

  season.status = 'finished';
  return season;
}

function playMatch(
  world: World,
  ctx: ReturnType<typeof buildLeagueContext>,
  xiByClub: Map<ClubId, Player[]>,
  match: Match,
  rng: Rng,
  eventsRng: Rng,
): void {
  const home = world.clubs.get(match.homeClubId);
  const away = world.clubs.get(match.awayClubId);
  if (!home || !away) throw new Error(`Match ${match.id} references unknown club`);

  const result = simulateMatch(effectiveRatings(home, ctx), effectiveRatings(away, ctx), ctx, rng);

  match.homeGoals = result.homeGoals;
  match.awayGoals = result.awayGoals;
  match.played = true;
  match.events = generateMatchEvents(
    { clubId: home.id, xi: xiByClub.get(home.id) ?? [] },
    { clubId: away.id, xi: xiByClub.get(away.id) ?? [] },
    result.homeGoals,
    result.awayGoals,
    eventsRng,
  );

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
