import { describe, expect, it } from 'vitest';
import { leagueOfClub } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { closeSeason, offseasonSummary } from './career.js';
import { createSeason, simulateSeason } from './season.js';

const SEED = 5;
const YEAR = 2026;

function playAndClose(seed = SEED) {
  const world = generateWorld(createRng(seed));
  const club = [...world.clubs.values()][2]!;
  const oldLeague = leagueOfClub(world, club.id);
  const season = createSeason(world, oldLeague, YEAR, seed + YEAR);
  simulateSeason(world, season, createRng(seed + YEAR));
  const squadBefore = [...club.playerIds];
  const playersBefore = world.players.size;
  const closed = closeSeason(world, season, seed, YEAR);
  const summary = offseasonSummary(world, club, oldLeague, closed, YEAR, squadBefore);
  return { world, club, closed, summary, playersBefore };
}

describe('closeSeason + offseasonSummary (engine/career)', () => {
  it('is deterministic and keeps the world consistent', () => {
    const a = playAndClose();
    const b = playAndClose();
    expect(b.summary).toEqual(a.summary);
    expect(b.world).toEqual(a.world);

    // Every division has final standings; population in the career band (the AI market
    // shifts players, youth refills — same invariant as career.test); leagues still 20 clubs.
    expect(a.closed.standingsByLeague.size).toBe(a.world.leagues.length);
    expect(a.world.players.size).toBeGreaterThanOrEqual(a.playersBefore);
    expect(a.world.players.size).toBeLessThanOrEqual(a.playersBefore + 45);
    for (const l of a.world.leagues) expect(l.clubIds).toHaveLength(20);
    for (const c of a.world.clubs.values()) {
      expect(c.playerIds.length).toBeGreaterThanOrEqual(21);
      expect(c.playerIds.length).toBeLessThanOrEqual(28);
    }
  });

  it('digests the season from the club point of view', () => {
    const { summary, closed, world, club } = playAndClose();
    expect(summary.year).toBe(YEAR);
    expect(summary.nextYear).toBe(YEAR + 1);
    expect(summary.finalTable).toHaveLength(20);
    expect(summary.finalTable.filter((r) => r.mine)).toHaveLength(1);
    expect(summary.finalPosition).toBeGreaterThanOrEqual(1);
    expect(summary.finalPosition).toBeLessThanOrEqual(20);
    expect(['promoted', 'relegated', 'stayed']).toContain(summary.outcome);
    expect(summary.newLeagueName).toBe(leagueOfClub(world, club.id).name);

    // Verdicts: one per league, a champion each, 3 up from each tier-2 / 3 down from tier-1.
    expect(summary.verdicts).toHaveLength(world.leagues.length);
    for (const v of summary.verdicts) expect(v.champion).not.toBe('—');
    const ups = summary.verdicts.reduce((n, v) => n + v.promoted.length, 0);
    const downs = summary.verdicts.reduce((n, v) => n + v.relegated.length, 0);
    expect(ups).toBe(downs);
    expect(ups).toBe(closed.report.swaps.reduce((n, s) => n + s.promoted.length, 0));

    // Books: the club has accounts and the new budgets are what the world says.
    expect(summary.accounts.net).toBe(summary.accounts.revenue - summary.accounts.costs);
    expect(summary.cash).toBe(club.finances.cash);
    expect(summary.transferBudget).toBe(club.finances.transferBudget);
    // Released "mine" players are really gone from the club.
    for (const r of summary.releasedMine) {
      expect(club.playerIds.map((id) => world.players.get(id)?.name)).not.toContain(r.name);
    }
    expect(summary.retiredTotal).toBe(closed.report.retired.length);
  });
});
