import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import { createSeason, seasonStandings, simulateSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { openSave } from './db.js';
import { loadLatestSeason, loadWorld, saveSeason, saveWorld } from './repository.js';
import { CREATE_TABLES_SQL } from './schema.js';

describe('persistence round-trip (Fase 0 gate)', () => {
  it(
    'saves and reloads a world identically — deep equality on every entity',
    { timeout: 30000 },
    () => {
      const world = generateWorld(createRng(42));
      const { db, close } = openSave(':memory:');
      try {
        saveWorld(db, world);
        const loaded = loadWorld(db);

        // Players: identical, field by field (order-independent lookup by id).
        expect(loaded.players.size).toBe(world.players.size);
        for (const [id, p] of world.players) {
          expect(loaded.players.get(id)).toEqual(p);
        }
        // Clubs incl. FinancialState (elo is rounded on save; compare rounded).
        expect(loaded.clubs.size).toBe(world.clubs.size);
        for (const [id, c] of world.clubs) {
          expect(loaded.clubs.get(id)).toEqual({ ...c, elo: Math.round(c.elo) });
        }
        // Contracts, leagues, nations, agencies, managers, presidents.
        expect(loaded.contracts.size).toBe(world.contracts.size);
        for (const [id, ct] of world.contracts) expect(loaded.contracts.get(id)).toEqual(ct);
        expect(loaded.leagues).toEqual(world.leagues);
        expect(loaded.nations).toEqual(world.nations);
        expect(loaded.agencies).toEqual(world.agencies);
        expect(loaded.managers).toEqual(world.managers);
        expect(loaded.presidents).toEqual(world.presidents);
      } finally {
        close();
      }
    },
  );

  it('never persists the overall: no column exists, and it recomputes from attributes', () => {
    // Schema-level guarantee (GAME_DESIGN §1.2): the overall is derived, not stored.
    expect(CREATE_TABLES_SQL).not.toMatch(/\boverall\b/);

    const world = generateWorld(createRng(9));
    const { db, close } = openSave(':memory:');
    try {
      saveWorld(db, world);
      const loaded = loadWorld(db);
      // Recomputed from reloaded attributes === recomputed from the original ones.
      for (const [id, p] of world.players) {
        expect(playerOverall(loaded.players.get(id)!)).toBe(playerOverall(p));
      }
    } finally {
      close();
    }
  });

  it('persists a simulated season and its results', { timeout: 30000 }, () => {
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
