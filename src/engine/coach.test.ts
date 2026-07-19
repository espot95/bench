import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { createSeason, seasonStandings, simulateSeason } from './season.js';

describe('coach quality → lineup policy (MODULE_MANAGER §1)', () => {
  it('the free-coach market exists from worldgen', () => {
    const world = generateWorld(createRng(1));
    const free = [...world.managers!.values()].filter((m) => m.clubId === null);
    expect(free.length).toBeGreaterThanOrEqual(10);
    // Every club still has its own coach.
    for (const club of world.clubs.values()) {
      expect([...world.managers!.values()].some((m) => m.clubId === club.id)).toBe(true);
    }
  });

  it('a terrible coach costs points versus a great one, on average', () => {
    let totalDelta = 0;
    for (const seed of [3, 7, 21, 40]) {
      const points = (coachRep: number): number => {
        const world = generateWorld(createRng(seed));
        const club = [...world.clubs.values()][6]!; // mid-table Serie A side
        const coach = [...world.managers!.values()].find((m) => m.clubId === club.id)!;
        coach.reputation = coachRep;
        const season = createSeason(world, world.leagues[0]!, 2026, seed);
        simulateSeason(world, season, createRng(seed));
        return seasonStandings(world, season).find((r) => r.clubId === club.id)!.points;
      };
      totalDelta += points(95) - points(15);
    }
    // Great coach beats awful coach across seeds (a few points per season on average).
    expect(totalDelta).toBeGreaterThan(0);
  });
});
