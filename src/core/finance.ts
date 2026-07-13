/**
 * Club economics: wages, budgets and free-agent identification (SPEC §15). Pure — no I/O.
 * Domain-level money math shared by generation, the (future) market and the CLI.
 */

import type { Club, Contract, FinancialState, Player, World } from './types.js';

/** Economy tuning (SPEC §15.0). Budgets derive from reputation; net ≈ half of gross. */
export const ECONOMY = {
  /** Net take-home as a fraction of gross wage (player's "contezza del netto"). */
  NET_RATIO: 0.5,
  /** Wage budget = current wage bill × this headroom, so a fresh club can sign a little. */
  WAGE_BUDGET_HEADROOM: 1.2,
  /** Cash at reputation 100 (scales linearly with reputation). */
  CASH_AT_MAX_REP: 80_000_000,
  /** Transfer budget at reputation 100 (scales linearly with reputation). */
  TRANSFER_AT_MAX_REP: 100_000_000,
} as const;

/** Net (take-home) wage from a gross wage. */
export function netFromGross(gross: number): number {
  return Math.round(gross * ECONOMY.NET_RATIO);
}

/** A player's current gross wage, or 0 if he has no (looked-up) contract. */
export function grossWage(world: World, player: Player): number {
  if (!player.contractId) return 0;
  return world.contracts.get(player.contractId)?.wage ?? 0;
}

/** Total weekly wage bill of a club's squad. */
export function clubWageBill(world: World, club: Club): number {
  let total = 0;
  for (const id of club.playerIds) {
    const p = world.players.get(id);
    if (p) total += grossWage(world, p);
  }
  return total;
}

/** A club's wage budget. */
export function wageBudgetOf(club: Club): number {
  return club.finances.wageBudget;
}

/** An empty financial state (useful for tests/minimal worlds). */
export function emptyFinances(): FinancialState {
  return { transferBudget: 0, wageBudget: 0, cash: 0, incomes: [], expenses: [] };
}

export interface WageBudgetStatus {
  bill: number;
  budget: number;
  /** Budget − bill; room left for new wages (Infinity if unconstrained). */
  headroom: number;
  withinBudget: boolean;
}

/** How a club stands against its wage budget. */
export function wageBudgetStatus(world: World, club: Club): WageBudgetStatus {
  const bill = clubWageBill(world, club);
  const budget = wageBudgetOf(club);
  return { bill, budget, headroom: budget - bill, withinBudget: bill <= budget };
}

/** Would adding `extraWage` keep the club within its wage budget? */
export function canAffordWage(world: World, club: Club, extraWage: number): boolean {
  return clubWageBill(world, club) + extraWage <= wageBudgetOf(club);
}

/**
 * Derive a club's fresh FinancialState from its reputation and current wage bill (SPEC §15.0):
 * the wage budget sits a headroom above the wage bill; transfer budget and cash scale with
 * reputation. Ledgers start empty (GAME_DESIGN §6.2 — data only in Fase 0).
 */
export function deriveFinances(reputation: number, wageBill: number): FinancialState {
  return {
    transferBudget: Math.round((reputation / 100) * ECONOMY.TRANSFER_AT_MAX_REP),
    wageBudget: Math.round(wageBill * ECONOMY.WAGE_BUDGET_HEADROOM),
    cash: Math.round((reputation / 100) * ECONOMY.CASH_AT_MAX_REP),
    incomes: [],
    expenses: [],
  };
}

/** Ids of every player currently on some club's squad. */
function squadMembership(world: World): Set<Player['id']> {
  const ids = new Set<Player['id']>();
  for (const club of world.clubs.values()) for (const id of club.playerIds) ids.add(id);
  return ids;
}

/** Players not on any club's squad — the free agents (SPEC §15). */
export function freeAgents(world: World): Player[] {
  const onSquad = squadMembership(world);
  return [...world.players.values()].filter((p) => !onSquad.has(p.id));
}

/** Is this player a free agent (not on any squad)? */
export function isFreeAgent(world: World, player: Player): boolean {
  return !squadMembership(world).has(player.id);
}

/** Whether a contract has ended by the given (new) year. */
export function isExpired(contract: Contract, year: number): boolean {
  return contract.endYear < year;
}
