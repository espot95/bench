import { describe, expect, it } from 'vitest';
import { wageBudgetStatus } from '../core/finance.js';
import { asPresidentId } from '../core/ids.js';
import { neutralPersonality } from '../core/personality.js';
import { playerOverall } from '../core/ratings.js';
import type { Club, Personality, Player, President, World } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { evaluateTransferProposal } from '../president/decisions.js';
import { createRng } from '../rng/rng.js';
import {
  TRANSFER,
  askingPrice,
  executeTransfer,
  negotiateTransfer,
  startAdaptation,
} from './transfers.js';

const pres = (traits: Partial<Personality>, clubId: Club['id']): President => ({
  id: asPresidentId(`pr-${Math.abs(JSON.stringify(traits).length)}-${clubId}`),
  name: 'Presidente',
  age: 60,
  nationality: 'ITA',
  personality: { ...neutralPersonality(), ...traits },
  reputation: 70,
  exPlayer: false,
  clubId,
});

describe('asking price & negotiation (MODULE_MARKET §1-§2)', () => {
  const world = generateWorld(createRng(4));
  const seller = [...world.clubs.values()][2]!;
  const star = seller.playerIds
    .map((id) => world.players.get(id)!)
    .sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;

  it('seller character moves the ask: composed up, ambitious down', () => {
    const calm = askingPrice(
      world,
      seller,
      pres({ composure: 0.95, ambition: 0.2 }, seller.id),
      star,
      2026,
    );
    const eager = askingPrice(
      world,
      seller,
      pres({ composure: 0.2, ambition: 0.95 }, seller.id),
      star,
      2026,
    );
    expect(calm).toBeGreaterThan(eager * 1.15);
  });

  it('an expiring contract crushes the fee', () => {
    const full = askingPrice(world, seller, undefined, star, 2026);
    const c = world.contracts.get(star.contractId!)!;
    const oldEnd = c.endYear;
    c.endYear = 2026; // expiring
    const expiring = askingPrice(world, seller, undefined, star, 2026);
    c.endYear = oldEnd;
    expect(expiring).toBeLessThan(full * 0.55);
  });

  it('negotiation: full bid accepted, lowball rejected, counter within budget can close', () => {
    const buyerP = pres({ ambition: 0.8, temperament: 0 }, seller.id);
    expect(
      negotiateTransfer(10_000_000, 10_000_000, buyerP, undefined, 50_000_000, createRng(1)).agreed,
    ).toBe(true);
    expect(
      negotiateTransfer(5_000_000, 10_000_000, buyerP, undefined, 50_000_000, createRng(1)).agreed,
    ).toBe(false);
    const counter = negotiateTransfer(
      9_000_000,
      10_000_000,
      buyerP,
      undefined,
      50_000_000,
      createRng(1),
    );
    expect(counter.agreed).toBe(true);
    expect(counter.fee).toBeGreaterThan(9_000_000);
    expect(counter.fee).toBeLessThan(10_000_000);
    // A pricey counter (above ask×0.95): the prudent buyer walks, the ambitious closes.
    const prudent = pres({ ambition: 0.1, temperament: 0 }, seller.id);
    expect(
      negotiateTransfer(9_400_000, 10_000_000, prudent, undefined, 50_000_000, createRng(1)).agreed,
    ).toBe(false);
    expect(
      negotiateTransfer(9_400_000, 10_000_000, buyerP, undefined, 50_000_000, createRng(1)).agreed,
    ).toBe(true);
  });
});

describe('adaptation ramp & price-tag pressure (MODULE_MARKET §4)', () => {
  const world = generateWorld(createRng(5));
  const club = [...world.clubs.values()][0]!;
  const player = world.players.get(club.playerIds[10]!)!;

  it('adaptability sets the ramp length; overpay at a big club sets price pressure', () => {
    player.personality.adaptability = 0.95;
    startAdaptation(player, 0, 90, 2026, world);
    expect(player.transferStatus!.rampTotal).toBeLessThanOrEqual(4);
    expect(player.transferStatus!.pricePressure).toBe(0); // free transfer: no tag

    player.personality.adaptability = 0.05;
    startAdaptation(player, 1_000_000_000, 90, 2026, world); // wild overpay
    expect(player.transferStatus!.rampTotal).toBeGreaterThanOrEqual(15);
    expect(player.transferStatus!.pricePressure).toBeCloseTo(TRANSFER.PRICE_PRESSURE_CAP, 5);
    player.transferStatus = undefined;
  });
});

describe('transfer execution & hard constraints (MODULE_MARKET §3, §6)', () => {
  it('moves the player, the contract and the money on both ledgers', () => {
    const world = generateWorld(createRng(6));
    const clubs = [...world.clubs.values()];
    const seller = clubs[5]!;
    const buyer = clubs[1]!;
    const player = world.players.get(seller.playerIds[4]!)!;
    const oldContract = player.contractId!;
    const buyerCash = buyer.finances.cash;
    const buyerBudget = buyer.finances.transferBudget;
    const sellerCash = seller.finances.cash;

    const contract = executeTransfer(
      world,
      seller,
      buyer,
      player,
      12_000_000,
      50_000,
      3,
      500_000,
      2026,
    );

    expect(seller.playerIds).not.toContain(player.id);
    expect(buyer.playerIds).toContain(player.id);
    expect(world.contracts.has(oldContract)).toBe(false);
    expect(player.contractId).toBe(contract.id);
    expect(contract.clubId).toBe(buyer.id);
    expect(buyer.finances.cash).toBe(buyerCash - 12_500_000);
    expect(buyer.finances.transferBudget).toBe(buyerBudget - 12_000_000);
    expect(
      buyer.finances.expenses.some((e) => e.type === 'transfer_in' && e.amount === 12_000_000),
    ).toBe(true);
    expect(seller.finances.cash).toBe(sellerCash + 12_000_000);
    expect(
      seller.finances.incomes.some((e) => e.type === 'transfer_out' && e.amount === 12_000_000),
    ).toBe(true);
    expect(player.transferStatus).toBeDefined();
  });

  it('approved transfer proposals never violate budget, cash or wage constraints', () => {
    for (const seed of [2, 9]) {
      const world = generateWorld(createRng(seed));
      const clubs = [...world.clubs.values()];
      const buyer = clubs[0]!;
      const buyerP = [...world.presidents!.values()].find((p) => p.clubId === buyer.id)!;
      const rng = createRng(seed + 50);
      for (const seller of clubs.slice(1, 8)) {
        const sellerP = [...world.presidents!.values()].find((p) => p.clubId === seller.id);
        const { headroom } = wageBudgetStatus(world, buyer);
        for (const pid of seller.playerIds.slice(0, 6)) {
          const player = world.players.get(pid)!;
          const v = evaluateTransferProposal(
            world,
            buyer,
            buyerP,
            seller,
            sellerP,
            player,
            2026,
            0,
            rng,
          );
          if (v.approved) {
            expect(v.fee!).toBeLessThanOrEqual(buyer.finances.transferBudget);
            expect(v.fee! + (v.commission ?? 0)).toBeLessThanOrEqual(buyer.finances.cash);
            expect(v.wage!).toBeLessThanOrEqual(headroom);
          }
        }
      }
    }
  });
});
