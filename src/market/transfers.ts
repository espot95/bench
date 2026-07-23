/**
 * Club-to-club transfers (MODULE_MARKET) — asking price, single-shot negotiation with the
 * selling president's character, execution (the only mover of players, with signing.ts),
 * and post-move adaptation (ramp + price-tag pressure, GAME_DESIGN §5).
 * Pure + RNG-injected.
 */

import { asContractId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type { Club, Contract, Player, President, World } from '../core/types.js';
import type { Rng } from '../rng/rng.js';
import { baseMarketValue } from './value.js';

export const TRANSFER = {
  /** Importance premium: stars cost beyond their base value. */
  IMP_K: 0.35,
  /** Seller character on the ask: the composed don't undersell, the ambitious cash in. */
  PREMIUM_COMPOSURE: 0.3,
  DISCOUNT_AMBITION: 0.25,
  CHAR_MIN: 0.8,
  CHAR_MAX: 1.5,
  /** Counter-offer window: bids ≥ ask×SOFT get a counter at the midpoint. */
  SOFT: 0.85,
  /** Impulsive seller may blow up an otherwise viable counter. */
  BLOWUP: 0.2,
  /** Player refuses a big step down in club reputation unless expiring. */
  REP_GAP: 18,
  // --- Adaptation (MODULE_MARKET §4) ---
  RAMP_MIN: 3,
  RAMP_SPAN: 14,
  FEE_K: 0.6,
  PRICE_PRESSURE_CAP: 0.5,
} as const;

/** Remaining contract years as of `year` (0 = expiring/expired). */
export function contractYearsLeft(world: World, player: Player, year: number): number {
  if (!player.contractId) return 0;
  const c = world.contracts.get(player.contractId);
  return c ? Math.max(0, c.endYear - year) : 0;
}

/** What the selling president asks for his player (MODULE_MARKET §1). */
export function askingPrice(
  world: World,
  seller: Club,
  sellerPresident: President | undefined,
  player: Player,
  year: number,
): number {
  const overall = playerOverall(player);
  const base = baseMarketValue(
    overall,
    player.age,
    player.potential,
    contractYearsLeft(world, player, year),
  );
  const squad = seller.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined);
  const avg = squad.reduce((s, p) => s + playerOverall(p), 0) / Math.max(1, squad.length);
  const importance = 1 + TRANSFER.IMP_K * (Math.max(0, overall - avg) / 10);
  const p = sellerPresident?.personality;
  const character = p
    ? 1 +
      TRANSFER.PREMIUM_COMPOSURE * (p.composure - 0.5) -
      TRANSFER.DISCOUNT_AMBITION * (p.ambition - 0.5)
    : 1;
  const clamped = Math.max(TRANSFER.CHAR_MIN, Math.min(TRANSFER.CHAR_MAX, character));
  return Math.round((base * importance * clamped) / 100_000) * 100_000;
}

export interface TransferOutcome {
  agreed: boolean;
  /** Final fee when agreed; the seller's ask otherwise (for the narrative). */
  fee: number;
  reason: string;
}

/**
 * Single-shot negotiation (MODULE_MARKET §2): the buyer bids, the selling president
 * resolves. A counter at the midpoint is auto-judged with the BUYER president's character.
 */
export function negotiateTransfer(
  bid: number,
  ask: number,
  buyerPresident: President,
  sellerPresident: President | undefined,
  transferBudget: number,
  rng: Rng,
): TransferOutcome {
  if (bid >= ask) return { agreed: true, fee: bid, reason: 'Offerta accettata subito.' };
  if (bid < ask * TRANSFER.SOFT) {
    return {
      agreed: false,
      fee: ask,
      reason: `Rifiutata: ne chiedono ${(ask / 1e6).toFixed(1)}M.`,
    };
  }
  const counter = Math.round((bid + ask) / 2 / 100_000) * 100_000;
  if (sellerPresident && rng.chance(TRANSFER.BLOWUP * sellerPresident.personality.temperament)) {
    return {
      agreed: false,
      fee: ask,
      reason: 'Il presidente venditore si è impuntato: trattativa saltata.',
    };
  }
  if (counter > transferBudget) {
    return {
      agreed: false,
      fee: counter,
      reason: `Contro-offerta ${(counter / 1e6).toFixed(1)}M fuori budget.`,
    };
  }
  const b = buyerPresident.personality;
  const accepts = b.ambition >= 0.5 || counter <= ask * 0.95;
  return accepts
    ? {
        agreed: true,
        fee: counter,
        reason: `Chiusa alla contro-offerta: ${(counter / 1e6).toFixed(1)}M.`,
      }
    : { agreed: false, fee: counter, reason: 'Il tuo presidente non insegue il rilancio.' };
}

/** Does the player accept the move? Big reputation step-down is refused unless expiring. */
export function playerAcceptsMove(
  world: World,
  player: Player,
  seller: Club,
  buyer: Club,
  year: number,
): boolean {
  if (contractYearsLeft(world, player, year) <= 1) return true;
  return buyer.reputation >= seller.reputation - TRANSFER.REP_GAP;
}

/** Attach the settling-in status (MODULE_MARKET §4). `fee=0` (free agents) → ramp only. */
export function startAdaptation(
  player: Player,
  fee: number,
  buyerReputation: number,
  year: number,
  world: World,
): void {
  const base = baseMarketValue(
    playerOverall(player),
    player.age,
    player.potential,
    contractYearsLeft(world, player, year),
  );
  const overpay = base > 0 ? Math.max(0, fee / base - 1) : 0;
  const rampTotal = Math.round(
    TRANSFER.RAMP_MIN + TRANSFER.RAMP_SPAN * (1 - player.personality.adaptability),
  );
  player.transferStatus = {
    rampTotal,
    rampRemaining: rampTotal,
    pricePressure: Math.min(
      TRANSFER.PRICE_PRESSURE_CAP,
      TRANSFER.FEE_K * overpay * (buyerReputation / 100),
    ),
  };
}

/** Deterministic transfer-contract id from world state. */
function nextTransferId(world: World, year: number): string {
  const prefix = `ct-tr-${year}-`;
  let n = 0;
  for (const id of world.contracts.keys()) if (id.startsWith(prefix)) n++;
  return `${prefix}${n + 1}`;
}

/**
 * Execute an agreed transfer (MODULE_MARKET §3). Constraints are checked BEFORE by the
 * president; here the world mutates: rosters, contracts, money on both ledgers, adaptation.
 */
export function executeTransfer(
  world: World,
  seller: Club,
  buyer: Club,
  player: Player,
  fee: number,
  wage: number,
  years: number,
  commission: number,
  year: number,
): Contract {
  // Rosters + old contract.
  seller.playerIds = seller.playerIds.filter((id) => id !== player.id);
  if (player.contractId) world.contracts.delete(player.contractId);
  buyer.playerIds.push(player.id);
  // Maglia nuova, storia nuova: la "bandiera" riparte da zero (MODULE_STADIUM §3.3).
  player.clubSeasons = 0;
  player.titlesWithClub = 0;
  player.bigSeasons = 0;

  const contract: Contract = {
    id: asContractId(nextTransferId(world, year)),
    playerId: player.id,
    clubId: buyer.id,
    wage,
    startYear: year,
    endYear: year + years - 1,
    agencyId: player.agencyId ?? null,
    agencyCommission: commission || undefined,
  };
  world.contracts.set(contract.id, contract);
  player.contractId = contract.id;

  // Money, both sides (MODULE_MARKET §3).
  buyer.finances.cash -= fee + commission;
  buyer.finances.transferBudget -= fee;
  buyer.finances.expenses.push({ type: 'transfer_in', amount: fee, year, note: player.name });
  if (commission > 0) {
    buyer.finances.expenses.push({
      type: 'agency_fees',
      amount: commission,
      year,
      note: `Commissione ${player.name}`,
    });
  }
  seller.finances.cash += fee;
  seller.finances.incomes.push({ type: 'transfer_out', amount: fee, year, note: player.name });

  startAdaptation(player, fee, buyer.reputation, year, world);
  return contract;
}
