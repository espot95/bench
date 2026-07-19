/**
 * User-side contract renewals (MODULE_PRESIDENT §7.1) — the president offers a new deal to
 * his own player. First real content of the contracts system module. Pure.
 * The AI-passive renewal cycle for the rest of the world stays in engine/progression.
 */

import { clubWageBill, wageBudgetStatus } from '../core/finance.js';
import { playerOverall } from '../core/ratings.js';
import type { Club, Player, World } from '../core/types.js';
import { expectedWage, offeredYears } from '../market/value.js';

export interface RenewalOutcome {
  accepted: boolean;
  reason: string;
  wage?: number;
  endYear?: number;
}

/**
 * Offer `player` a renewal at his market-standard wage and an age-based length.
 * He refuses cuts deeper than 10%; the wage budget is a machine constraint (the delta
 * between old and new wage must fit the headroom).
 */
export function offerRenewal(
  world: World,
  club: Club,
  player: Player,
  year: number,
): RenewalOutcome {
  const contract = player.contractId ? world.contracts.get(player.contractId) : undefined;
  if (!contract) return { accepted: false, reason: 'Nessun contratto attivo da rinnovare.' };

  const wage = expectedWage(playerOverall(player), player.age);
  if (wage < contract.wage * 0.9) {
    return {
      accepted: false,
      reason: `Rifiuta il taglio: chiede almeno ${Math.round((contract.wage * 0.9) / 1000)}k/sett.`,
    };
  }
  const { budget } = wageBudgetStatus(world, club);
  const newBill = clubWageBill(world, club) - contract.wage + wage;
  if (newBill > budget) {
    return { accepted: false, reason: 'Il nuovo ingaggio sfora il monte stipendi.' };
  }

  const years = offeredYears(player.age);
  contract.wage = wage;
  contract.startYear = year;
  contract.endYear = year + years;
  return { accepted: true, reason: 'Rinnovo firmato.', wage, endYear: contract.endYear };
}
