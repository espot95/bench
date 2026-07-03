import { describe, expect, it } from 'vitest';
import { computeTeamStrength } from '../domain/ratings.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { createSeason, seasonStandings, simulateSeason } from './season.js';

describe('season engine', () => {
  it('plays every fixture and produces a complete table', () => {
    const world = generateWorld(createRng(1));
    const season = createSeason(world, 2026, 1);
    simulateSeason(world, season, createRng(1));

    expect(season.status).toBe('finished');
    expect(season.fixtures.every((m) => m.played)).toBe(true);

    const table = seasonStandings(world, season);
    expect(table).toHaveLength(20);
    // Each club plays 38 games.
    for (const row of table) expect(row.played).toBe(38);

    // Points accounting: total points = 3*decisiveGames + 2*draws.
    const draws = season.fixtures.filter((m) => m.homeGoals === m.awayGoals).length;
    const decisive = season.fixtures.length - draws;
    const totalPoints = table.reduce((a, r) => a + r.points, 0);
    expect(totalPoints).toBe(3 * decisive + 2 * draws);
  });

  it('is reproducible for a fixed seed', () => {
    const runTable = (seed: number) => {
      const world = generateWorld(createRng(seed));
      const season = createSeason(world, 2026, seed);
      simulateSeason(world, season, createRng(seed));
      return seasonStandings(world, season).map((r) => `${r.clubId}:${r.points}`);
    };
    expect(runTable(99)).toEqual(runTable(99));
  });

  it('champion earns a realistic points total (~80-98)', () => {
    const world = generateWorld(createRng(4));
    const season = createSeason(world, 2026, 4);
    simulateSeason(world, season, createRng(4));
    const table = seasonStandings(world, season);
    const champion = table[0];
    expect(champion?.points).toBeGreaterThan(74);
    expect(champion?.points).toBeLessThan(104);
  });

  it('final position correlates with squad strength (winner is a strong side)', () => {
    const world = generateWorld(createRng(6));
    const season = createSeason(world, 2026, 6);

    // Strength is measured on the pre-season squad, before Elo drifts.
    const strengthByClub = new Map(
      [...world.clubs.values()].map((c) => [c.id, computeTeamStrength(c, world).overall]),
    );
    const strengthRank = [...strengthByClub.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    simulateSeason(world, season, createRng(6));
    const table = seasonStandings(world, season);

    // The champion should come from the strongest third of the league.
    const topThird = new Set(strengthRank.slice(0, Math.ceil(strengthRank.length / 3)));
    expect(topThird.has(table[0]!.clubId)).toBe(true);
  });
});
