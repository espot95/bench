import { describe, expect, it } from 'vitest';
import { createRng } from '../rng/rng.js';
import { XG_PROFILES, type XgProfile } from './constants.js';
import type { EffectiveRatings, LeagueContext } from './league-context.js';
import { integrateManDown, scoreMatrix, simulateMatch } from './match.js';

/** Synthetic league where the average team has attack=12, defense=12. */
function makeContext(): LeagueContext {
  return {
    strengths: new Map(),
    avgAttack: 12,
    avgDefense: 12,
    meanOverall: 12,
    stdOverall: 1,
    xgProfile: XG_PROFILES.DEFAULT as XgProfile,
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

const md = (reds: number[], reshapeFrom: number | null = null) => ({ reds, reshapeFrom });

describe('man-down effect (integrateManDown)', () => {
  it('is a no-op when nobody is sent off', () => {
    const r = integrateManDown(1.5, 1.2, md([]), md([]));
    expect(r.lambdaHome).toBe(1.5);
    expect(r.lambdaAway).toBe(1.2);
  });

  it('a team down a man scores less and concedes more', () => {
    const r = integrateManDown(1.5, 1.5, md([1]), md([])); // home reduced to 10 from minute 1
    expect(r.lambdaHome).toBeLessThan(1.5);
    expect(r.lambdaAway).toBeGreaterThan(1.5);
  });

  it('an earlier red swings the lambdas more than a late one', () => {
    const early = integrateManDown(1.5, 1.5, md([10]), md([]));
    const late = integrateManDown(1.5, 1.5, md([80]), md([]));
    expect(early.lambdaHome).toBeLessThan(late.lambdaHome);
    expect(early.lambdaAway).toBeGreaterThan(late.lambdaAway);
  });

  it('roughly conserves total goals (redistribution, not creation)', () => {
    const base = 1.5 + 1.5;
    const down = integrateManDown(1.5, 1.5, md([1]), md([]));
    expect(down.lambdaHome + down.lambdaAway).toBeGreaterThan(base * 0.95);
    expect(down.lambdaHome + down.lambdaAway).toBeLessThan(base * 1.1);
  });

  it('a defensive reshape concedes less but attacks even less than standard man-down', () => {
    const standard = integrateManDown(1.5, 1.5, md([1]), md([]));
    const reshaped = integrateManDown(1.5, 1.5, md([1], 1), md([]));
    expect(reshaped.lambdaAway).toBeLessThan(standard.lambdaAway); // concedes less
    expect(reshaped.lambdaHome).toBeLessThan(standard.lambdaHome); // scores even less
  });
});

describe('man-down effect (end-to-end)', () => {
  it('an early sending-off swings results toward the opponent', () => {
    const ctx = makeContext();
    const n = 20000;

    // Same seed and same number of rng draws => the only difference is the man-down lambda.
    const rngA = createRng(2468);
    let homeWinsNormal = 0;
    for (let i = 0; i < n; i++) {
      const r = simulateMatch(AVG, AVG, ctx, rngA);
      if (r.homeGoals > r.awayGoals) homeWinsNormal++;
    }

    const rngB = createRng(2468);
    let homeWinsDown = 0;
    for (let i = 0; i < n; i++) {
      const r = simulateMatch(AVG, AVG, ctx, rngB, { home: md([10]), away: md([]) });
      if (r.homeGoals > r.awayGoals) homeWinsDown++;
    }

    expect(homeWinsDown).toBeLessThan(homeWinsNormal);
  });
});
