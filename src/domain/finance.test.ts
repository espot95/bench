import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  ECONOMY,
  canAffordWage,
  clubWageBill,
  deriveBudgets,
  freeAgents,
  isFreeAgent,
  netFromGross,
  wageBudgetStatus,
} from './finance.js';

describe('club economics (SPEC §15)', () => {
  it('net wage is about half of gross', () => {
    expect(netFromGross(100_000)).toBe(50_000);
  });

  it('derives a wage budget above the wage bill and reputation-scaled cash', () => {
    const { wageBudget, cash } = deriveBudgets(80, 2_000_000);
    expect(wageBudget).toBe(Math.round(2_000_000 * ECONOMY.WAGE_BUDGET_HEADROOM));
    expect(cash).toBe(Math.round(0.8 * ECONOMY.CASH_AT_MAX_REP));
    // Higher reputation → more cash.
    expect(deriveBudgets(40, 1_000_000).cash).toBeLessThan(cash);
  });

  it('every freshly generated club is within its wage budget with headroom', () => {
    const world = generateWorld(createRng(1));
    for (const club of world.clubs.values()) {
      const status = wageBudgetStatus(world, club);
      expect(status.withinBudget).toBe(true);
      expect(status.headroom).toBeGreaterThan(0); // room to sign someone
      expect(club.cash).toBeGreaterThan(0);
    }
  });

  it('a fresh world has no free agents (everyone is on a squad)', () => {
    const world = generateWorld(createRng(2));
    expect(freeAgents(world)).toHaveLength(0);
  });

  it('a player dropped from his squad becomes a free agent', () => {
    const world = generateWorld(createRng(3));
    const club = [...world.clubs.values()][0]!;
    const dropped = club.playerIds[0]!;
    club.playerIds = club.playerIds.slice(1); // release him
    const p = world.players.get(dropped)!;
    expect(isFreeAgent(world, p)).toBe(true);
    expect(freeAgents(world).map((x) => x.id)).toContain(dropped);
  });

  it('canAffordWage respects the remaining budget headroom', () => {
    const world = generateWorld(createRng(4));
    const club = [...world.clubs.values()][0]!;
    const { headroom } = wageBudgetStatus(world, club);
    expect(canAffordWage(world, club, headroom - 1)).toBe(true);
    expect(canAffordWage(world, club, headroom + 1)).toBe(false);
  });

  it('a wage bill equals the sum of squad contract wages', () => {
    const world = generateWorld(createRng(5));
    const club = [...world.clubs.values()][0]!;
    const manual = club.playerIds.reduce((sum, id) => {
      const p = world.players.get(id)!;
      return sum + (p.contractId ? world.contracts.get(p.contractId)!.wage : 0);
    }, 0);
    expect(clubWageBill(world, club)).toBe(manual);
  });
});
