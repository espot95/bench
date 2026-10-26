/**
 * Free-agent signing execution (MODULE_PRESIDENT §4). This module is the ONLY one
 * authorised to move players between clubs / into the world (ARCHITECTURE §6).
 * Constraint checks (budget/cash/quotas) happen BEFORE calling this — in the president's
 * decision — because the season runner does not recompute eligibility mid-season.
 */

import { asContractId } from '../core/ids.js';
import type { Club, Contract, Player, World } from '../core/types.js';
import { startAdaptation } from './transfers.js';

export interface SigningTerms {
  /** Gross weekly wage agreed. */
  wage: number;
  /** Contract length in seasons. */
  years: number;
  /** One-off agency commission (0 if self-represented), paid from cash. */
  commission: number;
}

/**
 * Id firma deterministico e UNIVOCO, ancorato al giocatore (il contatore per
 * prefisso poteva collidere quando un contratto dello stesso anno veniva
 * cancellato: l'id "nuovo" sovrascriveva un contratto esistente).
 */
function nextSigningId(world: World, year: number, playerId: string): string {
  const base = `ct-fa-${year}-${playerId}`;
  if (!world.contracts.has(asContractId(base))) return base;
  let n = 2;
  while (world.contracts.has(asContractId(`${base}-${n}`))) n++;
  return `${base}-${n}`;
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
  // Maglia nuova, storia nuova (MODULE_STADIUM §3.3).
  player.clubSeasons = 0;
  player.titlesWithClub = 0;
  player.bigSeasons = 0;

  const contract: Contract = {
    id: asContractId(nextSigningId(world, year, player.id as string)),
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
  startAdaptation(player, 0, club.reputation, year, world);
  return contract;
}
