import { describe, expect, it } from 'vitest';
import { personalityLabel } from '../core/personality.js';
import { playerOverall } from '../core/ratings.js';
import { generateWorld } from '../generation/generate-world.js';
import { baseMarketValue } from '../market/value.js';
import { openSave } from '../persistence/db.js';
import { loadScouting, saveScouting } from '../persistence/repository.js';
import { createRng } from '../rng/rng.js';
import { SCOUTING, type ScoutingState, observePlayer } from './report.js';

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('scouting with uncertainty (MODULE_SCOUTING §6)', () => {
  const world = generateWorld(createRng(1));
  const players = [...world.players.values()].slice(0, 300);

  /** Observe everyone `n` times with a fresh state; return the final reports + errors. */
  function afterObservations(n: number, seed: number) {
    const state: ScoutingState = new Map();
    const rng = createRng(seed);
    for (let i = 0; i < n; i++) {
      for (const p of players) observePlayer(state, p, world, 2026, rng);
    }
    const errors = players.map((p) =>
      Math.abs(state.get(p.id)!.estimatedOverall - playerOverall(p)),
    );
    return { state, errors };
  }

  it('estimates converge with observations (1 obs is much worse than 20)', () => {
    const early = afterObservations(1, 7);
    const late = afterObservations(20, 7);
    expect(avg(late.errors)).toBeLessThan(avg(early.errors) / 2);
  });

  it('is never perfect: error floor and label cap survive heavy observation', () => {
    const { state, errors } = afterObservations(40, 3);
    // Mean error stays clearly above zero (sigma floor).
    expect(avg(errors)).toBeGreaterThan(SCOUTING.SIGMA_MIN / 3);
    // Character label never becomes certain across the population.
    const right = players.filter(
      (p) => state.get(p.id)!.personalityGuess === personalityLabel(p),
    ).length;
    expect(right / players.length).toBeLessThan(0.98);
    expect(right / players.length).toBeGreaterThan(0.6);
  });

  it('the potential interval usually covers the truth and never collapses to a point', () => {
    const { state } = afterObservations(15, 5);
    let covered = 0;
    for (const p of players) {
      const r = state.get(p.id)!;
      expect(r.potentialHigh - r.potentialLow).toBeGreaterThanOrEqual(SCOUTING.MIN_WIDTH - 1);
      if (p.potential >= r.potentialLow && p.potential <= r.potentialHigh) covered++;
    }
    expect(covered / players.length).toBeGreaterThan(0.8);
  });

  it('institutional context inflates perceived value (same player, richer club)', () => {
    // Same player observed many times under two contexts: high-rep vs low-rep club.
    const clubs = [...world.clubs.values()].sort((a, b) => b.reputation - a.reputation);
    const rich = clubs[0]!;
    const poor = clubs[clubs.length - 1]!;
    const p = world.players.get(rich.playerIds[5]!)!;

    const valueIn = (host: typeof rich, seed: number): number => {
      // Move the player's squad membership to the host club (context only).
      const original = { rich: rich.playerIds, poor: poor.playerIds };
      rich.playerIds = rich.playerIds.filter((id) => id !== p.id);
      poor.playerIds = poor.playerIds.filter((id) => id !== p.id);
      host.playerIds = [...host.playerIds, p.id];
      const state: ScoutingState = new Map();
      const rng = createRng(seed);
      const samples: number[] = [];
      for (let i = 0; i < 30; i++)
        samples.push(observePlayer(state, p, world, 2026, rng).estimatedValue);
      rich.playerIds = original.rich;
      poor.playerIds = original.poor;
      return avg(samples);
    };

    expect(valueIn(rich, 11)).toBeGreaterThan(valueIn(poor, 11) * 1.2);
  });

  it('is deterministic for a given seed', () => {
    const a = afterObservations(5, 42);
    const b = afterObservations(5, 42);
    for (const p of players) {
      expect(a.state.get(p.id)).toEqual(b.state.get(p.id));
    }
  });

  it('round-trips the scouting state through SQLite', () => {
    const { state } = afterObservations(3, 9);
    const { db, close } = openSave(':memory:');
    try {
      saveScouting(db, state);
      const loaded = loadScouting(db);
      expect(loaded.size).toBe(state.size);
      for (const [id, r] of state) expect(loaded.get(id)).toEqual(r);
    } finally {
      close();
    }
  });
});

describe('base market value (GAME_DESIGN §6.4)', () => {
  it('grows superlinearly with overall', () => {
    const v70 = baseMarketValue(70, 25, 70, 3);
    const v85 = baseMarketValue(85, 25, 85, 3);
    expect(v85).toBeGreaterThan(v70 * 1.8);
  });

  it('peaks at prime age and decays for veterans', () => {
    const prime = baseMarketValue(75, 25, 75, 3);
    const veteran = baseMarketValue(75, 33, 75, 3);
    const teen = baseMarketValue(75, 18, 75, 3);
    expect(prime).toBeGreaterThan(veteran);
    expect(prime).toBeGreaterThan(teen);
    expect(veteran).toBeLessThan(prime * 0.6);
  });

  it('young high-potential players carry a premium', () => {
    const flat = baseMarketValue(65, 19, 65, 3);
    const gem = baseMarketValue(65, 19, 90, 3);
    expect(gem).toBeGreaterThan(flat * 1.2);
  });

  it('an expiring contract crushes the fee', () => {
    const long = baseMarketValue(75, 26, 75, 4);
    const expiring = baseMarketValue(75, 26, 75, 0);
    expect(expiring).toBeLessThan(long * 0.4);
  });
});
