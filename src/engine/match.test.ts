import { describe, expect, it } from 'vitest';
import { createRng } from '../rng/rng.js';
import type { EffectiveRatings, LeagueContext } from './league-context.js';
import { scoreMatrix, simulateMatch } from './match.js';

/** Synthetic league where the average team has attack=12, defense=12. */
function makeContext(): LeagueContext {
  return {
    strengths: new Map(),
    avgAttack: 12,
    avgDefense: 12,
    meanOverall: 12,
    stdOverall: 1,
  };
}

const AVG: EffectiveRatings = { attack: 12, defense: 12 };

interface Tally {
  homeWins: number;
  draws: number;
  awayWins: number;
  goals: number;
  matches: number;
  nilNil: number;
}

function simulateMany(
  home: EffectiveRatings,
  away: EffectiveRatings,
  n: number,
  seed: number,
): Tally {
  const rng = createRng(seed);
  const ctx = makeContext();
  const t: Tally = { homeWins: 0, draws: 0, awayWins: 0, goals: 0, matches: n, nilNil: 0 };
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(home, away, ctx, rng);
    if (r.homeGoals > r.awayGoals) t.homeWins++;
    else if (r.homeGoals === r.awayGoals) t.draws++;
    else t.awayWins++;
    t.goals += r.homeGoals + r.awayGoals;
    if (r.homeGoals === 0 && r.awayGoals === 0) t.nilNil++;
  }
  return t;
}

describe('match engine — statistical realism (equal teams)', () => {
  const t = simulateMany(AVG, AVG, 40000, 20260704);

  it('home win rate is in the 43-48% band', () => {
    expect(t.homeWins / t.matches).toBeGreaterThan(0.42);
    expect(t.homeWins / t.matches).toBeLessThan(0.49);
  });

  it('draw rate is in the 24-30% band (evenly matched sides draw a bit more)', () => {
    // Equal teams draw more often than the league-wide average, which mixes in
    // lopsided games. The full-league draw rate is checked by `calibrate`.
    expect(t.draws / t.matches).toBeGreaterThan(0.24);
    expect(t.draws / t.matches).toBeLessThan(0.3);
  });

  it('away win rate is in the 27-32% band', () => {
    expect(t.awayWins / t.matches).toBeGreaterThan(0.26);
    expect(t.awayWins / t.matches).toBeLessThan(0.33);
  });

  it('average goals per match is in the 2.5-2.9 band', () => {
    expect(t.goals / t.matches).toBeGreaterThan(2.4);
    expect(t.goals / t.matches).toBeLessThan(3.0);
  });

  it('0-0 share is in the 6-10% band', () => {
    expect(t.nilNil / t.matches).toBeGreaterThan(0.05);
    expect(t.nilNil / t.matches).toBeLessThan(0.11);
  });
});

describe('match engine — strength matters', () => {
  it('a much stronger home team wins the large majority of games', () => {
    const strong: EffectiveRatings = { attack: 16, defense: 16 };
    const weak: EffectiveRatings = { attack: 9, defense: 9 };
    const t = simulateMany(strong, weak, 20000, 7);
    expect(t.homeWins / t.matches).toBeGreaterThan(0.7);
  });

  it('a much stronger away team still wins most games despite home advantage', () => {
    const strong: EffectiveRatings = { attack: 16, defense: 16 };
    const weak: EffectiveRatings = { attack: 9, defense: 9 };
    const t = simulateMany(weak, strong, 20000, 8);
    expect(t.awayWins / t.matches).toBeGreaterThan(0.55);
  });
});

describe('scoreMatrix', () => {
  it('is a normalised probability distribution', () => {
    const m = scoreMatrix(1.4, 1.1);
    const sum = m.flat().reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});
