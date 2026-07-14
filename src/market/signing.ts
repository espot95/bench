/**
 * Free-agent signing execution (MODULE_PRESIDENT §4). This module is the ONLY one
 * authorised to move players between clubs / into the world (ARCHITECTURE §6).
 * Constraint checks (budget/cash/quotas) happen BEFORE calling this — in the president's
 * decision — because the season runner does not recompute eligibility mid-season.
 */

import { asContractId } from '../core/ids.js';
import type { Club, Contract, Player, World } from '../core/types.js';

export interface SigningTerms {
  /** Gross weekly wage agreed. */
  wage: number;
  /** Contract length in seasons. */
  years: number;
  /** One-off agency commission (0 if self-represented), paid from cash. */
  commission: number;
}

/** Deterministic next signing id: derived from world state, not from module memory. */
function nextSigningId(world: World, year: number): string {
  const prefix = `ct-fa-${year}-`;
  let n = 0;
  for (const id of world.contracts.keys()) if (id.startsWith(prefix)) n++;
  return `${prefix}${n + 1}`;
}

/**
 * Sign a free agent for `club`, starting `year`. Materialises ephemeral pool prospects into
 * `world.players`, creates the contract, pays the agency commission from cash (first real
 * ledger write, `type: 'agency_fees'`). Returns the created contract.
 */
export function signFreeAgent(
  world: World,
  club: Club,
  player: Player,
  terms: SigningTerms,
  year: number,
): Contract {
  // Ephemeral prospects exist only in the window pool until someone signs them.
  if (!world.players.has(player.id)) world.players.set(player.id, player);
  if (!club.playerIds.includes(player.id)) club.playerIds.push(player.id);

  const contract: Contract = {
    id: asContractId(nextSigningId(world, year)),
    playerId: player.id,
    clubId: club.id,
    wage: terms.wage,
    startYear: year,
    endYear: year + terms.years - 1,
    agencyId: player.agencyId ?? null,
    agencyCommission: terms.commission || undefined,
  };
  world.contracts.set(contract.id, contract);
  player.contractId = contract.id;

  if (terms.commission > 0) {
    club.finances.cash -= terms.commission;
    club.finances.expenses.push({
      type: 'agency_fees',
      amount: terms.commission,
      year,
      note: `Commissione firma ${player.name}`,
    });
  }
  return contract;
}
