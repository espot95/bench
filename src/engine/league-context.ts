/**
 * Precomputed, league-wide strength context. Squad strengths are fixed for a
 * season; Elo is read live per match to fold in form. See SPEC.md §2.3, §3.
 */

import type { ClubId } from '../domain/ids.js';
import { computeTeamStrength } from '../domain/ratings.js';
import type { Club, World } from '../domain/types.js';
import { ELO } from './constants.js';

interface ClubStrength {
  attack: number;
  defense: number;
  overall: number;
}

export interface LeagueContext {
  strengths: Map<ClubId, ClubStrength>;
  avgAttack: number;
  avgDefense: number;
  meanOverall: number;
  stdOverall: number;
}

export function buildLeagueContext(world: World): LeagueContext {
  const strengths = new Map<ClubId, ClubStrength>();
  const attacks: number[] = [];
  const defenses: number[] = [];
  const overalls: number[] = [];

  for (const club of world.clubs.values()) {
    const s = computeTeamStrength(club, world);
    strengths.set(club.id, s);
    attacks.push(s.attack);
    defenses.push(s.defense);
    overalls.push(s.overall);
  }

  const meanOverall = avg(overalls);
  return {
    strengths,
    avgAttack: avg(attacks),
    avgDefense: avg(defenses),
    meanOverall,
    stdOverall: stdDev(overalls, meanOverall) || 1,
  };
}

export interface EffectiveRatings {
  attack: number;
  defense: number;
}

/**
 * Effective attack/defense for a club, blending fixed squad strength with the
 * club's current Elo (form). Reads `club.elo`, so it changes across the season.
 */
export function effectiveRatings(club: Club, ctx: LeagueContext): EffectiveRatings {
  const base = ctx.strengths.get(club.id);
  if (!base) throw new Error(`No strength context for club ${club.id}`);

  const strengthFromElo = ctx.meanOverall + ((club.elo - ELO.BASE) / ELO.SPREAD) * ctx.stdOverall;
  const strengthEff = (1 - ELO.BLEND_WEIGHT) * base.overall + ELO.BLEND_WEIGHT * strengthFromElo;
  const mult = base.overall > 0 ? strengthEff / base.overall : 1;

  return { attack: base.attack * mult, defense: base.defense * mult };
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[], mean: number): number {
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}
