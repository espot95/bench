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

/** Expected goals (lambda) for both sides, before sampling. */
export function expectedGoals(
  home: EffectiveRatings,
  away: EffectiveRatings,
  ctx: LeagueContext,
  rng: Rng,
): { lambdaHome: number; lambdaAway: number } {
  const e = MATCH.RATING_ELASTICITY;
  const formHome = clampForm(rng.gaussian(1, MATCH.SIGMA_FORM));
  const formAway = clampForm(rng.gaussian(1, MATCH.SIGMA_FORM));

  const lambdaHome =
    MATCH.MU *
    MATCH.HOME *
    (home.attack / ctx.avgAttack) ** e *
    (ctx.avgDefense / away.defense) ** e *
    formHome;

  const lambdaAway =
    (MATCH.MU / MATCH.HOME) *
    (away.attack / ctx.avgAttack) ** e *
    (ctx.avgDefense / home.defense) ** e *
    formAway;

  return {
    lambdaHome: clampLambda(lambdaHome),
    lambdaAway: clampLambda(lambdaAway),
  };
}

/** Simulate a single match. */
export function simulateMatch(
  home: EffectiveRatings,
  away: EffectiveRatings,
  ctx: LeagueContext,
  rng: Rng,
): MatchResult {
  const { lambdaHome, lambdaAway } = expectedGoals(home, away, ctx, rng);
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
