/**
 * Precomputed, league-wide strength context. Squad strengths are fixed for a
 * season; Elo is read live per match to fold in form. See SPEC.md §2.3, §3.
 */

import type { ClubId } from '../core/ids.js';
import { type TeamStrength, computeTeamStrength } from '../core/ratings.js';
import type { Club, League, World } from '../core/types.js';
import { ELO, XG_PROFILES, type XgProfile } from './constants.js';

type ClubStrength = TeamStrength;

export interface LeagueContext {
  strengths: Map<ClubId, ClubStrength>;
  avgAttack: number;
  avgDefense: number;
  meanOverall: number;
  stdOverall: number;
  /** Per-league xG levels (SPEC §17.5), resolved from the league's nation. */
  xgProfile: XgProfile;
}

/** Build the strength context for a single division (averages over its clubs only). */
export function buildLeagueContext(world: World, league: League): LeagueContext {
  const strengths = new Map<ClubId, ClubStrength>();
  const attacks: number[] = [];
  const defenses: number[] = [];
  const overalls: number[] = [];

  for (const clubId of league.clubIds) {
    const club = world.clubs.get(clubId);
    if (!club) continue;
    const s = computeTeamStrength(club, world);
    strengths.set(club.id, s);
    attacks.push(s.attack);
    defenses.push(s.defense);
    overalls.push(s.overall);
  }

  const meanOverall = avg(overalls);
  const nationCode = world.nations?.find((n) => n.id === league.nationId)?.code;
  return {
    strengths,
    avgAttack: avg(attacks),
    avgDefense: avg(defenses),
    meanOverall,
    stdOverall: stdDev(overalls, meanOverall) || 1,
    xgProfile: XG_PROFILES[nationCode ?? ''] ?? (XG_PROFILES.DEFAULT as XgProfile),
  };
}

export interface EffectiveRatings {
  attack: number;
  defense: number;
}

/**
 * Blend a concrete team strength (from the fielded XI) with the club's current Elo
 * (form) to get the effective attack/defense used by the match engine. The league
 * baseline (meanOverall/stdOverall) stays fixed, so suspensions only weaken the
 * affected club, not the league norm. See SPEC.md §2.3.
 */
export function effectiveRatingsFor(
  strength: TeamStrength,
  club: Club,
  ctx: LeagueContext,
): EffectiveRatings {
  const strengthFromElo = ctx.meanOverall + ((club.elo - ELO.BASE) / ELO.SPREAD) * ctx.stdOverall;
  const strengthEff =
    (1 - ELO.BLEND_WEIGHT) * strength.overall + ELO.BLEND_WEIGHT * strengthFromElo;
  const mult = strength.overall > 0 ? strengthEff / strength.overall : 1;

  return { attack: strength.attack * mult, defense: strength.defense * mult };
}

/** Effective ratings from a club's full-strength (no suspensions) squad. */
export function effectiveRatings(club: Club, ctx: LeagueContext): EffectiveRatings {
  const base = ctx.strengths.get(club.id);
  if (!base) throw new Error(`No strength context for club ${club.id}`);
  return effectiveRatingsFor(base, club, ctx);
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[], mean: number): number {
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}
