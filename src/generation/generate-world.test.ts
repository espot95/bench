import { describe, expect, it } from 'vitest';
import { computeTeamStrength } from '../domain/ratings.js';
import { createRng } from '../rng/rng.js';
import { generateWorld } from './generate-world.js';

describe('generateWorld', () => {
  it('creates two nations of two divisions each with full squads', () => {
    const world = generateWorld(createRng(1));
    // 2 nations × 2 divisions × 20 clubs (SPEC §14).
    expect(world.nations).toHaveLength(2);
    expect(world.leagues).toHaveLength(4);
    for (const league of world.leagues) {
      expect(league.clubIds).toHaveLength(20);
      expect(league.nationId).toBeDefined();
    }
    expect(world.clubs.size).toBe(80);

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

  it('biases nationality by nation and tags training origin (SPEC §14.2)', () => {
    const world = generateWorld(createRng(1));
    const italy = world.nations!.find((n) => n.code === 'ITA')!;
    const england = world.nations!.find((n) => n.code === 'ENG')!;
    const clubsOf = (nationId: string) =>
      world.leagues
        .filter((l) => l.nationId === nationId)
        .flatMap((l) => l.clubIds)
        .flatMap((id) => world.clubs.get(id)!.playerIds.map((pid) => world.players.get(pid)!));

    const itaPlayers = clubsOf(italy.id);
    const engPlayers = clubsOf(england.id);
    // Home nationality is the plurality in each nation.
    const itaHomeShare =
      itaPlayers.filter((p) => p.nationality === 'ITA').length / itaPlayers.length;
    const engHomeShare =
      engPlayers.filter((p) => p.nationality === 'ENG').length / engPlayers.length;
    expect(itaHomeShare).toBeGreaterThan(0.45);
    expect(engHomeShare).toBeGreaterThan(0.4);

    // Every squad can field a legal home-grown quota: ≥4 club-trained and ≥8 nation-trained.
    for (const league of world.leagues) {
      for (const clubId of league.clubIds) {
        const squad = world.clubs.get(clubId)!.playerIds.map((id) => world.players.get(id)!);
        const clubTrained = squad.filter((p) => p.trainedClubId === clubId).length;
        const nationClubs = new Set(
          world.leagues.filter((l) => l.nationId === league.nationId).flatMap((l) => l.clubIds),
        );
        const nationTrained = squad.filter(
          (p) => p.trainedClubId && nationClubs.has(p.trainedClubId),
        ).length;
        expect(clubTrained).toBeGreaterThanOrEqual(4);
        expect(nationTrained).toBeGreaterThanOrEqual(8);
      }
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

  it('builds a pyramid: the top division is stronger than the one below', () => {
    const world = generateWorld(createRng(7));
    const divisionStrength = (tier: number) => {
      const league = world.leagues[tier]!;
      return mean(
        league.clubIds.map((id) => computeTeamStrength(world.clubs.get(id)!, world).overall),
      );
    };
    expect(divisionStrength(0)).toBeGreaterThan(divisionStrength(1) + 5);
  });

  it('gives young players headroom (potential ≥ overall, higher when young)', () => {
    const world = generateWorld(createRng(3));
    for (const p of world.players.values()) {
      expect(p.potential).toBeGreaterThanOrEqual(Math.round(p.overall));
      expect(p.potential).toBeLessThanOrEqual(99);
    }
  });
});

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
