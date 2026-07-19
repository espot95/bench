/**
 * Passive-responsive AI offers for a listed player (MODULE_PRESIDENT §7.1): the user
 * (president) lists someone, interested clubs respond. The AI never violates ITS OWN
 * budgets or quotas. No proactive AI market — that is a dedicated future chapter.
 */

import type { ClubId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type { Club, Player, President, World } from '../core/types.js';
import { checkHardConstraints } from '../president/decisions.js';
import type { Rng } from '../rng/rng.js';
import { askingPrice, playerAcceptsMove } from './transfers.js';

export const OFFERS = {
  /** How far below their squad average a buyer still considers the player an upgrade. */
  UPGRADE_MARGIN: 2,
  /** Offer = ask × (BASE + SPAN·ambition of the buying president). */
  BASE: 0.85,
  SPAN: 0.25,
  /** Max offers surfaced to the user. */
  MAX: 3,
} as const;

export interface TransferOffer {
  buyerClubId: ClubId;
  buyerName: string;
  fee: number;
  /** Terms the buyer would give the player (from checkHardConstraints). */
  wage: number;
  years: number;
  commission: number;
}

/**
 * Collect offers for `player` of `seller`. Buyers must: see him as an upgrade, afford the
 * fee (their transferBudget + cash) AND the wage (their headroom + quotas — v1: their
 * seasonal non-EU usage is not tracked, MODULE_PRESIDENT §7.2), and be a club he accepts.
 */
export function collectOffers(
  world: World,
  seller: Club,
  sellerPresident: President | undefined,
  player: Player,
  year: number,
  rng: Rng,
): TransferOffer[] {
  const ask = askingPrice(world, seller, sellerPresident, player, year);
  const overall = playerOverall(player);
  const presidentsByClub = new Map(
    [...(world.presidents?.values() ?? [])].map((p) => [p.clubId, p]),
  );

  const offers: TransferOffer[] = [];
  for (const buyer of world.clubs.values()) {
    if (buyer.id === seller.id) continue;
    const buyerPres = presidentsByClub.get(buyer.id);
    if (!buyerPres) continue;

    const squad = buyer.playerIds
      .map((id) => world.players.get(id))
      .filter((p): p is Player => p !== undefined);
    const avg = squad.reduce((s, p) => s + playerOverall(p), 0) / Math.max(1, squad.length);
    if (overall < avg - OFFERS.UPGRADE_MARGIN) continue; // not an upgrade for them

    const fee =
      Math.round((ask * (OFFERS.BASE + OFFERS.SPAN * buyerPres.personality.ambition)) / 100_000) *
      100_000;
    const check = checkHardConstraints(world, buyer, player, year, 0);
    if (check.problem !== null) continue;
    if (fee > buyer.finances.transferBudget) continue;
    if (fee + check.commission > buyer.finances.cash) continue;
    if (!playerAcceptsMove(world, player, seller, buyer, year)) continue;

    offers.push({
      buyerClubId: buyer.id,
      buyerName: buyer.name,
      fee,
      wage: check.wage,
      years: check.years,
      commission: check.commission,
    });
  }

  // Best fees first; a touch of rng breaks exact ties deterministically.
  offers.sort((a, b) => b.fee - a.fee || (rng.chance(0.5) ? -1 : 1));
  return offers.slice(0, OFFERS.MAX);
}
