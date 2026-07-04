/**
 * Full-league Monte Carlo: simulate many seasons and assert the aggregate numbers
 * land in realistic bands. This is the automated version of the `calibrate` CLI
 * command and encodes the "engine is credible" gate. See SPEC.md §8.
 */

import { describe, expect, it } from 'vitest';
import type { Match } from '../domain/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { createSeason, seasonStandings, simulateSeason } from './season.js';
import { computeMatchStats } from './stats.js';

const SEASONS = 40;

function runSeasons(): {
  matches: Match[];
  champions: number[];
  relegated: number[];
} {
  const matches: Match[] = [];
  const champions: number[] = [];
  const relegated: number[] = [];
  for (let s = 0; s < SEASONS; s++) {
    const seed = 1000 + s;
    const world = generateWorld(createRng(seed));
    const season = createSeason(world, world.leagues[0]!, 2026, seed);
    simulateSeason(world, season, createRng(seed));
    matches.push(...season.fixtures);
    const table = seasonStandings(world, season);
    champions.push(table[0]?.points ?? 0);
    relegated.push(table[table.length - 1]?.points ?? 0);
  }
  return { matches, champions, relegated };
}

const { matches, champions, relegated } = runSeasons();
const stats = computeMatchStats(matches);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe(`league realism over ${SEASONS} seasons (${SEASONS * 380} matches)`, () => {
  it('home wins ~43-48%', () => {
    expect(stats.homeWinPct).toBeGreaterThan(0.42);
    expect(stats.homeWinPct).toBeLessThan(0.49);
  });

  it('draws ~24-28%', () => {
    expect(stats.drawPct).toBeGreaterThan(0.23);
    expect(stats.drawPct).toBeLessThan(0.28);
  });

  it('away wins ~26-32%', () => {
    expect(stats.awayWinPct).toBeGreaterThan(0.26);
    expect(stats.awayWinPct).toBeLessThan(0.33);
  });

  it('average goals per match ~2.5-2.9', () => {
    expect(stats.avgGoals).toBeGreaterThan(2.5);
    expect(stats.avgGoals).toBeLessThan(2.9);
  });

  it('0-0 share ~6-10%', () => {
    expect(stats.nilNilPct).toBeGreaterThan(0.06);
    expect(stats.nilNilPct).toBeLessThan(0.1);
  });

  it('the most frequent scoreline is 1-1', () => {
    expect(stats.topScorelines[0]?.score).toBe('1-1');
  });

  it('champion points average is realistic (~78-90)', () => {
    expect(avg(champions)).toBeGreaterThan(77);
    expect(avg(champions)).toBeLessThan(90);
  });

  it('relegated points average is realistic (~22-32)', () => {
    expect(avg(relegated)).toBeGreaterThan(21);
    expect(avg(relegated)).toBeLessThan(33);
  });
});
