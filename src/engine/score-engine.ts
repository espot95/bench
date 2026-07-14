/**
 * Score-engine selection (SPEC §17.3): Poisson (default) vs xG, same interface.
 * The knob is shell-level configuration set ONCE before a simulation (CLI/tests);
 * both engines stay pure and deterministic given the Rng.
 */

import type { Rng } from '../rng/rng.js';
import { ENGINE_DEFAULT } from './constants.js';
import type { EffectiveRatings, LeagueContext } from './league-context.js';
import { type MatchResult, type SendOffs, simulateMatch } from './match.js';
import { simulateMatchXg } from './xg.js';

export type ScoreEngine = 'poisson' | 'xg';

let current: ScoreEngine = ENGINE_DEFAULT;

/** Select the engine (CLI `--engine`, tests). Pass nothing to reset to the default. */
export function setMatchEngine(engine: ScoreEngine = ENGINE_DEFAULT): void {
  current = engine;
}

export function getMatchEngine(): ScoreEngine {
  return current;
}

/** Simulate a match score with the currently selected engine. */
export function simulateScore(
  home: EffectiveRatings,
  away: EffectiveRatings,
  ctx: LeagueContext,
  rng: Rng,
  sendOffs?: SendOffs,
): MatchResult {
  return current === 'xg'
    ? simulateMatchXg(home, away, ctx, rng, sendOffs)
    : simulateMatch(home, away, ctx, rng, sendOffs);
}
