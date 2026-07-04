/**
 * Headless match engine: given two clubs' effective strengths, produce a
 * credible scoreline. Poisson expected-goals + Dixon-Coles low-score correction
 * + per-match form variance. Deterministic given the Rng. See SPEC.md §6.
 */

import type { Rng } from '../rng/rng.js';
import { MATCH } from './constants.js';
import type { EffectiveRatings, LeagueContext } from './league-context.js';

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  lambdaHome: number;
  lambdaAway: number;
}

/** A team's in-match man-down state: red-card minutes + optional defensive reshape. */
export interface TeamManDown {
  /** Minutes at which the team was reduced by a man (red cards). */
  reds: number[];
  /** Minute from which the team plays "reshaped" (attacker sacrificed for a defender). */
  reshapeFrom: number | null;
}

/** Sending-off / reshape state for both teams. See SPEC.md §6.5-§6.6. */
export interface SendOffs {
  home: TeamManDown;
  away: TeamManDown;
}

/** Own-attack and opponent-boost multipliers for a team that is a man down. */
function manDownMultipliers(reshaped: boolean): { own: number; opp: number } {
  return reshaped
    ? { own: MATCH.MAN_DOWN_OWN_RESHAPE, opp: MATCH.MAN_DOWN_OPP_RESHAPE }
    : { own: MATCH.MAN_DOWN_OWN, opp: MATCH.MAN_DOWN_OPP };
}

/**
 * Redistribute base expected goals across the match given sending-off minutes.
 * Splits [0,90] at every red; in each segment a short-handed team scores less
 * (×OWN per man down) and its opponent scores more (×OPP). A team that has
 * reshaped defensively uses gentler-conceding / weaker-attacking multipliers.
 * Pure. See SPEC.md §6.5-§6.6.
 */
export function integrateManDown(
  baseHome: number,
  baseAway: number,
  home: TeamManDown,
  away: TeamManDown,
): { lambdaHome: number; lambdaAway: number } {
  if (home.reds.length === 0 && away.reds.length === 0) {
    return { lambdaHome: baseHome, lambdaAway: baseAway };
  }
  const breaks = [
    ...new Set([0, 90, ...home.reds, ...away.reds].filter((t) => t >= 0 && t <= 90)),
  ].sort((a, b) => a - b);

  let lambdaHome = 0;
  let lambdaAway = 0;
  for (let i = 0; i < breaks.length - 1; i++) {
    const t0 = breaks[i] as number;
    const t1 = breaks[i + 1] as number;
    const frac = (t1 - t0) / 90;
    if (frac <= 0) continue;

    const hDown = home.reds.filter((t) => t <= t0).length;
    const aDown = away.reds.filter((t) => t <= t0).length;
    const hMul = manDownMultipliers(home.reshapeFrom !== null && home.reshapeFrom <= t0);
    const aMul = manDownMultipliers(away.reshapeFrom !== null && away.reshapeFrom <= t0);

    // Home rate: hurt by its own men down (hMul.own), boosted by away's men down (aMul.opp).
    lambdaHome += baseHome * hMul.own ** hDown * aMul.opp ** aDown * frac;
    lambdaAway += baseAway * aMul.own ** aDown * hMul.opp ** hDown * frac;
  }
  return { lambdaHome, lambdaAway };
}

/** Expected goals (lambda) for both sides, before sampling; `sendOffs` applies §6.5. */
export function expectedGoals(
  home: EffectiveRatings,
  away: EffectiveRatings,
  ctx: LeagueContext,
  rng: Rng,
  sendOffs?: SendOffs,
): { lambdaHome: number; lambdaAway: number } {
  const e = MATCH.RATING_ELASTICITY;
  const formHome = clampForm(rng.gaussian(1, MATCH.SIGMA_FORM));
  const formAway = clampForm(rng.gaussian(1, MATCH.SIGMA_FORM));

  const baseHome =
    MATCH.MU *
    MATCH.HOME *
    (home.attack / ctx.avgAttack) ** e *
    (ctx.avgDefense / away.defense) ** e *
    formHome;

  const baseAway =
    (MATCH.MU / MATCH.HOME) *
    (away.attack / ctx.avgAttack) ** e *
    (ctx.avgDefense / home.defense) ** e *
    formAway;

  const { lambdaHome, lambdaAway } = sendOffs
    ? integrateManDown(baseHome, baseAway, sendOffs.home, sendOffs.away)
    : { lambdaHome: baseHome, lambdaAway: baseAway };

  return {
    lambdaHome: clampLambda(lambdaHome),
    lambdaAway: clampLambda(lambdaAway),
  };
}

/** Simulate a single match. Pass `sendOffs` to apply the man-down effect (§6.5). */
export function simulateMatch(
  home: EffectiveRatings,
  away: EffectiveRatings,
  ctx: LeagueContext,
  rng: Rng,
  sendOffs?: SendOffs,
): MatchResult {
  const { lambdaHome, lambdaAway } = expectedGoals(home, away, ctx, rng, sendOffs);
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const [homeGoals, awayGoals] = sampleScore(matrix, rng);
  return { homeGoals, awayGoals, lambdaHome, lambdaAway };
}

function clampForm(x: number): number {
  return Math.max(MATCH.FORM_MIN, Math.min(MATCH.FORM_MAX, x));
}

function clampLambda(x: number): number {
  return Math.max(MATCH.LAMBDA_MIN, Math.min(MATCH.LAMBDA_MAX, x));
}

/** Poisson pmf p(k; lambda). */
function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

const FACT: number[] = (() => {
  const f = [1];
  for (let i = 1; i <= MATCH.MAX_GOALS + 1; i++) f[i] = (f[i - 1] as number) * i;
  return f;
})();

function factorial(k: number): number {
  return FACT[k] ?? Number.POSITIVE_INFINITY;
}

/** Dixon-Coles tau correction for low scores. See SPEC.md §6.2. */
function tau(x: number, y: number, lambdaHome: number, lambdaAway: number): number {
  const rho = MATCH.RHO;
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/**
 * Joint score probability matrix (home goals x away goals), Dixon-Coles adjusted
 * and normalised so it sums to 1.
 */
export function scoreMatrix(lambdaHome: number, lambdaAway: number): number[][] {
  const n = MATCH.MAX_GOALS;
  const matrix: number[][] = [];
  let total = 0;

  for (let x = 0; x <= n; x++) {
    const row: number[] = [];
    for (let y = 0; y <= n; y++) {
      const p =
        poissonPmf(x, lambdaHome) *
        poissonPmf(y, lambdaAway) *
        Math.max(0, tau(x, y, lambdaHome, lambdaAway));
      row.push(p);
      total += p;
    }
    matrix.push(row);
  }

  // Normalise.
  for (const row of matrix) {
    for (let y = 0; y < row.length; y++) row[y] = (row[y] as number) / total;
  }
  return matrix;
}

/** Sample a (homeGoals, awayGoals) pair from a normalised score matrix. */
export function sampleScore(matrix: number[][], rng: Rng): [number, number] {
  const target = rng.next();
  let cumulative = 0;
  for (let x = 0; x < matrix.length; x++) {
    const row = matrix[x] as number[];
    for (let y = 0; y < row.length; y++) {
      cumulative += row[y] as number;
      if (target < cumulative) return [x, y];
    }
  }
  // Floating-point remainder: return the top score.
  const last = matrix.length - 1;
  return [last, (matrix[last]?.length ?? 1) - 1];
}
