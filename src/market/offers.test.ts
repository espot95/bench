import { describe, expect, it } from 'vitest';
import { offerRenewal } from '../contracts/renewals.js';
import { clubWageBill } from '../core/finance.js';
import { playerOverall } from '../core/ratings.js';
import type { Player } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { collectOffers } from './offers.js';
import { executeTransfer } from './transfers.js';

describe('passive-responsive sale offers (MODULE_PRESIDENT §7.1)', () => {
  const world = generateWorld(createRng(8));
  const seller = [...world.clubs.values()][12]!; // mid-table Serie A club
  const sellerPres = [...world.presidents!.values()].find((p) => p.clubId === seller.id);
  const star = seller.playerIds
    .map((id) => world.players.get(id)!)
    .sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;

  it('finds buyers for a good player, never violating THEIR budgets', () => {
    const offers = collectOffers(world, seller, sellerPres, star, 2026, createRng(1));
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(3);
    for (const o of offers) {
      const buyer = world.clubs.get(o.buyerClubId)!;
      expect(o.fee).toBeLessThanOrEqual(buyer.finances.transferBudget);
      expect(o.fee + o.commission).toBeLessThanOrEqual(buyer.finances.cash);
      expect(buyer.id).not.toBe(seller.id);
    }
  });

  it('finds no buyers for a fringe veteran nobody upgrades with', () => {
    const fringe = seller.playerIds
      .map((id) => world.players.get(id)!)
      .sort((a, b) => playerOverall(a) - playerOverall(b))[0]!;
    fringe.age = 34;
    const offers = collectOffers(world, seller, sellerPres, fringe, 2026, createRng(2));
    // A bottom-of-squad 34-year-old is an upgrade for almost nobody.
    expect(offers.length).toBeLessThanOrEqual(1);
  });

  it('an accepted offer moves the player and the money in the right direction', () => {
    const offers = collectOffers(world, seller, sellerPres, star, 2026, createRng(3));
    const offer = offers[0]!;
    const buyer = world.clubs.get(offer.buyerClubId)!;
    const sellerCash = seller.finances.cash;
    const buyerCash = buyer.finances.cash;

    executeTransfer(
      world,
      seller,
      buyer,
      star,
      offer.fee,
      offer.wage,
      offer.years,
      offer.commission,
      2026,
    );

    expect(seller.playerIds).not.toContain(star.id);
    expect(buyer.playerIds).toContain(star.id);
    expect(seller.finances.cash).toBe(sellerCash + offer.fee);
    expect(buyer.finances.cash).toBe(buyerCash - offer.fee - offer.commission);
  });
});

describe('user-side renewals (contracts/renewals.ts)', () => {
  it('renews at the market wage within the budget, and respects the wage cap', () => {
    const world = generateWorld(createRng(11));
    const club = [...world.clubs.values()][3]!;
    const player = world.players.get(club.playerIds[5]!)!;
    const out = offerRenewal(world, club, player, 2026);
    expect(out.accepted).toBe(true);
    const contract = world.contracts.get(player.contractId!)!;
    expect(contract.wage).toBe(out.wage);
    expect(contract.endYear).toBe(out.endYear);
    expect(clubWageBill(world, club)).toBeLessThanOrEqual(club.finances.wageBudget);
  });

  it('a star refuses a deep pay cut', () => {
    const world = generateWorld(createRng(12));
    const club = [...world.clubs.values()][0]!;
    const player: Player = world.players.get(club.playerIds[4]!)!;
    const contract = world.contracts.get(player.contractId!)!;
    contract.wage = 1_000_000; // absurdly above his market wage → renewal would be a big cut
    const out = offerRenewal(world, club, player, 2026);
    expect(out.accepted).toBe(false);
    expect(out.reason).toMatch(/taglio/i);
  });
});
