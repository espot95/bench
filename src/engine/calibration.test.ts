/**
 * Full-league Monte Carlo: simulate many seasons and assert the aggregates land in the
 * REAL per-league bands — the "engine is credible" gate (SPEC §17.2, §17.5). The xG engine
 * is gated PER LEAGUE on pooled football-data 2015/16-2025/26 (Serie A and Premier League
 * have different signatures); the Poisson engine stays as a regression reference (SPEC §8).
 */

import { afterAll, describe, expect, it } from 'vitest';
import type { Match } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { REALISM_BANDS, type RealismBands } from './constants.js';
import { type ScoreEngine, setMatchEngine } from './score-engine.js';
import { createSeason, seasonStandings, simulateSeason } from './season.js';
import { type MatchStats, computeMatchStats } from './stats.js';

const SEASONS = 30;

function runSeasons(
  engine: ScoreEngine,
  nationCode: string,
): { stats: MatchStats; champions: number[]; relegated: number[] } {
  setMatchEngine(engine);
  const matches: Match[] = [];
  const champions: number[] = [];
  const relegated: number[] = [];
  for (let s = 0; s < SEASONS; s++) {
    const seed = 1000 + s;
    const world = generateWorld(createRng(seed));
    const nation = world.nations?.find((n) => n.code === nationCode);
    const league =
      world.leagues.find((l) => l.nationId === nation?.id && l.tier === 1) ?? world.leagues[0]!;
    const season = createSeason(world, league, 2026, seed);
    simulateSeason(world, season, createRng(seed));
    matches.push(...season.fixtures);
    const table = seasonStandings(world, season);
    champions.push(table[0]?.points ?? 0);
    relegated.push(table[table.length - 1]?.points ?? 0);
  }
  setMatchEngine(); // restore the default for the rest of the suite
  return { stats: computeMatchStats(matches), champions, relegated };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function assertBands(stats: MatchStats, bands: RealismBands): void {
  expect(stats.homeWinPct).toBeGreaterThan(bands.home[0]);
  expect(stats.homeWinPct).toBeLessThan(bands.home[1]);
  expect(stats.drawPct).toBeGreaterThan(bands.draw[0]);
  expect(stats.drawPct).toBeLessThan(bands.draw[1]);
  expect(stats.awayWinPct).toBeGreaterThan(bands.away[0]);
  expect(stats.awayWinPct).toBeLessThan(bands.away[1]);
  expect(stats.avgGoals).toBeGreaterThan(bands.goals[0]);
  expect(stats.avgGoals).toBeLessThan(bands.goals[1]);
  expect(stats.nilNilPct).toBeGreaterThan(bands.nilNil[0]);
  expect(stats.nilNilPct).toBeLessThan(bands.nilNil[1]);
}

afterAll(() => setMatchEngine());

describe(`xG engine — Serie A profile vs real 2015-26 bands (${SEASONS} seasons)`, () => {
  const { stats, champions, relegated } = runSeasons('xg', 'ITA');

  it('matches the pooled Serie A signature (42.3/25.5/32.2, gol 2.73, 0-0 6.9%)', () => {
    assertBands(stats, REALISM_BANDS.ITA as RealismBands);
  });

  it('keeps champion/relegated points realistic', () => {
    expect(avg(champions)).toBeGreaterThan(77);
    expect(avg(champions)).toBeLessThan(91);
    expect(avg(relegated)).toBeGreaterThan(20);
    expect(avg(relegated)).toBeLessThan(33);
  });
});

describe(`xG engine — Premier League profile vs real 2015-26 bands (${SEASONS} seasons)`, () => {
  const { stats, champions } = runSeasons('xg', 'ENG');

  it('matches the pooled Premier League signature (44.3/23.7/32.0, gol 2.82, 0-0 6.3%)', () => {
    assertBands(stats, REALISM_BANDS.ENG as RealismBands);
  });

  it('is measurably different from Serie A: more goals, fewer draws', () => {
    const ita = runSeasons('xg', 'ITA');
    expect(stats.avgGoals).toBeGreaterThan(ita.stats.avgGoals);
    expect(stats.drawPct).toBeLessThan(ita.stats.drawPct);
  });

  it('keeps champion points realistic', () => {
    expect(avg(champions)).toBeGreaterThan(77);
    expect(avg(champions)).toBeLessThan(92);
  });
});

describe('Poisson engine regression reference (SPEC §8 bands)', () => {
  const { stats, champions, relegated } = runSeasons('poisson', 'ITA');

  it('stays in its historical bands', () => {
    assertBands(stats, REALISM_BANDS.POISSON_REF as RealismBands);
    expect(stats.topScorelines[0]?.score).toBe('1-1');
    expect(avg(champions)).toBeGreaterThan(77);
    expect(avg(champions)).toBeLessThan(90);
    expect(avg(relegated)).toBeGreaterThan(21);
    expect(avg(relegated)).toBeLessThan(33);
  });
});
