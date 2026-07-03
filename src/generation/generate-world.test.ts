import { describe, expect, it } from 'vitest';
import { computeTeamStrength } from '../domain/ratings.js';
import { createRng } from '../rng/rng.js';
import { generateWorld } from './generate-world.js';

describe('generateWorld', () => {
  it('creates the requested league, clubs and full squads', () => {
    const world = generateWorld(createRng(1));
    expect(world.league.clubIds).toHaveLength(20);
    expect(world.clubs.size).toBe(20);

    for (const club of world.clubs.values()) {
      expect(club.playerIds).toHaveLength(25);
      // Enough players per line to field a 4-4-2.
      const positions = club.playerIds.map((id) => world.players.get(id)?.position);
      expect(positions.filter((p) => p === 'GK').length).toBeGreaterThanOrEqual(1);
      expect(positions.filter((p) => p === 'DF').length).toBeGreaterThanOrEqual(4);
      expect(positions.filter((p) => p === 'MF').length).toBeGreaterThanOrEqual(4);
      expect(positions.filter((p) => p === 'FW').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateWorld(createRng(123));
    const b = generateWorld(createRng(123));
    const overallsA = [...a.players.values()].map((p) => p.overall);
    const overallsB = [...b.players.values()].map((p) => p.overall);
    expect(overallsA).toEqual(overallsB);
  });

  it('keeps all attributes within 1-100', () => {
    const world = generateWorld(createRng(5));
    for (const player of world.players.values()) {
      for (const value of Object.values(player.attributes)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(100);
      }
      expect(player.overall).toBeGreaterThanOrEqual(1);
      expect(player.overall).toBeLessThanOrEqual(100);
    }
  });

  it('makes higher-reputation clubs stronger on average', () => {
    const world = generateWorld(createRng(7));
    const clubs = [...world.clubs.values()];
    const strengths = clubs.map((c) => ({
      reputation: c.reputation,
      overall: computeTeamStrength(c, world).overall,
    }));
    // Split into top and bottom half by reputation; top should be stronger.
    strengths.sort((a, b) => b.reputation - a.reputation);
    const half = Math.floor(strengths.length / 2);
    const topAvg = mean(strengths.slice(0, half).map((s) => s.overall));
    const bottomAvg = mean(strengths.slice(half).map((s) => s.overall));
    expect(topAvg).toBeGreaterThan(bottomAvg);
  });
});

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
