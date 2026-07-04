import { describe, expect, it } from 'vitest';
import { createSeason, seasonStandings, simulateSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { openSave } from './db.js';
import { loadLatestSeason, loadWorld, saveSeason, saveWorld } from './repository.js';

describe('persistence round-trip', () => {
  it('saves and reloads a world identically', () => {
    const world = generateWorld(createRng(42));
    const { db, close } = openSave(':memory:');
    try {
      saveWorld(db, world);
      const loaded = loadWorld(db);

      expect(loaded.clubs.size).toBe(world.clubs.size);
      expect(loaded.players.size).toBe(world.players.size);
      expect(loaded.contracts.size).toBe(world.contracts.size);
      expect(loaded.leagues).toHaveLength(world.leagues.length);
      expect(loaded.leagues[0]?.clubIds.length).toBe(world.leagues[0]?.clubIds.length);
      // Player potential + personality survive the round-trip.
      const someId = [...world.players.keys()][0]!;
      expect(loaded.players.get(someId)?.potential).toBe(world.players.get(someId)?.potential);
      expect(loaded.players.get(someId)?.personality).toEqual(
        world.players.get(someId)?.personality,
      );

      for (const club of world.clubs.values()) {
        const reloaded = loaded.clubs.get(club.id);
        expect(reloaded?.name).toBe(club.name);
        expect(reloaded?.playerIds.length).toBe(club.playerIds.length);
      }
    } finally {
      close();
    }
  });

  it('persists a simulated season and its results', () => {
    const world = generateWorld(createRng(7));
    const season = createSeason(world, world.leagues[0]!, 2026, 7);
    simulateSeason(world, season, createRng(7));
    const originalTable = seasonStandings(world, season);

    const { db, close } = openSave(':memory:');
    try {
      saveWorld(db, world);
      saveSeason(db, season);

      const loadedWorld = loadWorld(db);
      const loadedSeason = loadLatestSeason(db);
      expect(loadedSeason).not.toBeNull();
      expect(loadedSeason?.status).toBe('finished');
      expect(loadedSeason?.fixtures).toHaveLength(380);
      expect(loadedSeason?.fixtures.every((m) => m.played)).toBe(true);

      // Standings recomputed from the reloaded data match the original.
      const reloadedTable = seasonStandings(loadedWorld, loadedSeason!);
      expect(reloadedTable.map((r) => `${r.clubId}:${r.points}`)).toEqual(
        originalTable.map((r) => `${r.clubId}:${r.points}`),
      );

      // Match events survive the round-trip: same count and same goal tally.
      const originalEvents = season.fixtures.reduce((n, m) => n + m.events.length, 0);
      const reloadedEvents = loadedSeason!.fixtures.reduce((n, m) => n + m.events.length, 0);
      expect(reloadedEvents).toBe(originalEvents);
      expect(reloadedEvents).toBeGreaterThan(0);

      const originalGoals = season.fixtures.reduce(
        (n, m) => n + m.events.filter((e) => e.type === 'goal').length,
        0,
      );
      const reloadedGoals = loadedSeason!.fixtures.reduce(
        (n, m) => n + m.events.filter((e) => e.type === 'goal').length,
        0,
      );
      expect(reloadedGoals).toBe(originalGoals);
    } finally {
      close();
    }
  });
});
