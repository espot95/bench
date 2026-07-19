import { describe, expect, it } from 'vitest';
import { clubWageBill } from '../core/finance.js';
import { asPresidentId } from '../core/ids.js';
import type { ClubId, LeagueId } from '../core/ids.js';
import { neutralPersonality } from '../core/personality.js';
import type { President, StandingRow, World } from '../core/types.js';
import { playAllDivisions, runCareer } from '../engine/career.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { applyBudgetPolicy, runWorldEconomy } from './season-economy.js';

function playedWorld(seed: number): {
  world: World;
  standingsByLeague: Map<LeagueId, StandingRow[]>;
} {
  const world = generateWorld(createRng(seed));
  const { standingsByLeague } = playAllDivisions(world, 2026, seed);
  return { world, standingsByLeague };
}

describe('season economy (MODULE_FINANCES §4)', () => {
  const { world, standingsByLeague } = playedWorld(3);
  const accounts = runWorldEconomy(world, standingsByLeague, 2026);

  it('books every club with all income/expense entries and moves the cash', () => {
    expect(accounts).toHaveLength(world.clubs.size);
    for (const club of world.clubs.values()) {
      const types = new Set(club.finances.incomes.map((e) => e.type));
      for (const t of ['gate', 'sponsor', 'tv', 'prize']) expect(types.has(t as never)).toBe(true);
      const out = new Set(club.finances.expenses.map((e) => e.type));
      expect(out.has('wages')).toBe(true);
      expect(out.has('facilities')).toBe(true);
    }
  });

  it('tier-2 clubs receive solidarity money (mutualità), tier-1 do not', () => {
    for (const league of world.leagues) {
      for (const clubId of league.clubIds) {
        const club = world.clubs.get(clubId)!;
        const hasSolidarity = club.finances.incomes.some((e) => e.note === 'mutualità');
        expect(hasSolidarity).toBe(league.tier >= 2);
      }
    }
  });

  it('the Premier League TV pot is ~3× the Serie A one (real proportions)', () => {
    const tvOf = (nationCode: string): number => {
      const nation = world.nations!.find((n) => n.code === nationCode)!;
      const league = world.leagues.find((l) => l.nationId === nation.id && l.tier === 1)!;
      return league.clubIds.reduce((sum, id) => {
        const club = world.clubs.get(id)!;
        return (
          sum +
          club.finances.incomes.filter((e) => e.type === 'tv').reduce((s, e) => s + e.amount, 0)
        );
      }, 0);
    };
    const ratio = tvOf('ENG') / tvOf('ITA');
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.5);
  });

  it('budget policy: austerity freezes, ambition spends', () => {
    const clubs = [...world.clubs.values()];
    const broke = clubs[0]!;
    const rich = clubs[1]!;
    broke.finances.cash = -5_000_000;
    rich.finances.cash = 200_000_000;
    const pres = (ambition: number, clubId: ClubId): President => ({
      id: asPresidentId(`pt-${clubId}`),
      name: 'P',
      age: 60,
      nationality: 'ITA',
      personality: { ...neutralPersonality(), ambition },
      reputation: 70,
      exPlayer: false,
      clubId,
    });
    const accs = accounts.filter((a) => a.clubId === broke.id || a.clubId === rich.id);

    applyBudgetPolicy(world, accs, new Map([[rich.id, pres(0.9, rich.id)]]));
    expect(broke.finances.transferBudget).toBe(0);
    expect(broke.finances.wageBudget).toBe(clubWageBill(world, broke));
    expect(rich.finances.transferBudget).toBeGreaterThan(0);
    expect(rich.finances.wageBudget).toBeGreaterThanOrEqual(clubWageBill(world, rich));

    // Same cash, prudent president → smaller budgets than the ambitious one.
    const richTransferAmbitious = rich.finances.transferBudget;
    applyBudgetPolicy(world, accs, new Map([[rich.id, pres(0.1, rich.id)]]));
    expect(rich.finances.transferBudget).toBeLessThan(richTransferAmbitious);
  });
});

describe('economy over a 10-season career (no spirals)', () => {
  const world = generateWorld(createRng(7));
  runCareer(world, 2026, 10, 7);

  it('losses stay bounded (austerity bites) and top flights stay mostly solvent', () => {
    const cash = [...world.clubs.values()].map((c) => c.finances.cash);
    expect(Math.min(...cash)).toBeGreaterThan(-150_000_000);
    for (const nation of world.nations!) {
      const top = world.leagues.find((l) => l.nationId === nation.id && l.tier === 1)!;
      const red = top.clubIds.filter((id) => world.clubs.get(id)!.finances.cash < 0).length;
      expect(red).toBeLessThanOrEqual(4);
    }
  });

  it('keeps ledgers pruned to the retention window (sparse by default)', () => {
    for (const club of world.clubs.values()) {
      const years = new Set(
        [...club.finances.incomes, ...club.finances.expenses].map((e) => e.year),
      );
      expect(years.size).toBeLessThanOrEqual(3);
    }
  });

  it('richer leagues stay richer: PL cash dwarfs Serie A cash', () => {
    const cashOf = (code: string): number => {
      const nation = world.nations!.find((n) => n.code === code)!;
      const top = world.leagues.find((l) => l.nationId === nation.id && l.tier === 1)!;
      return top.clubIds.reduce((s, id) => s + world.clubs.get(id)!.finances.cash, 0);
    };
    expect(cashOf('ENG')).toBeGreaterThan(cashOf('ITA') * 2);
  });
});
