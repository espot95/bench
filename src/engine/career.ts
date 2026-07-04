/**
 * Career orchestration (SPEC §10): play every division's season, then advance the
 * off-season (promotions, aging, retirements, youth). Pure + RNG-derived from seed.
 */

import type { LeagueId } from '../domain/ids.js';
import type { StandingRow, World } from '../domain/types.js';
import { createRng } from '../rng/rng.js';
import { type OffseasonReport, advanceOffseason } from './progression.js';
import { createSeason, seasonStandings, simulateSeason } from './season.js';

export interface DivisionResult {
  leagueId: LeagueId;
  leagueName: string;
  tier: number;
  standings: StandingRow[];
}

export interface CareerSeason {
  year: number;
  divisions: DivisionResult[];
  offseason: OffseasonReport;
}

/** Simulate every division's season for one year; returns per-division standings. */
export function playAllDivisions(
  world: World,
  year: number,
  seed: number,
): { divisions: DivisionResult[]; standingsByLeague: Map<LeagueId, StandingRow[]> } {
  const divisions: DivisionResult[] = [];
  const standingsByLeague = new Map<LeagueId, StandingRow[]>();

  world.leagues.forEach((league, i) => {
    const season = createSeason(world, league, year, seed + i);
    simulateSeason(world, season, createRng(seed + i));
    const standings = seasonStandings(world, season);
    standingsByLeague.set(league.id, standings);
    divisions.push({
      leagueId: league.id,
      leagueName: league.name,
      tier: league.tier,
      standings,
    });
  });

  return { divisions, standingsByLeague };
}

/** Run a full auto career of `seasons` years, mutating the world each off-season. */
export function runCareer(
  world: World,
  startYear: number,
  seasons: number,
  seed: number,
): CareerSeason[] {
  const out: CareerSeason[] = [];
  for (let s = 0; s < seasons; s++) {
    const year = startYear + s;
    const { divisions, standingsByLeague } = playAllDivisions(world, year, seed + s * 100);
    const offseason = advanceOffseason(
      world,
      standingsByLeague,
      createRng(seed + s * 100 + 7777),
      year + 1,
    );
    out.push({ year, divisions, offseason });
  }
  return out;
}
