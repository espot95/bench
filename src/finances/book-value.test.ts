import { describe, expect, it } from 'vitest';
import { offerRenewal } from '../contracts/renewals.js';
import { asContractId } from '../core/ids.js';
import type { Contract } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { executeTransfer } from '../market/transfers.js';
import { createRng } from '../rng/rng.js';
import {
  amortizationInYear,
  annualAmortization,
  bookValue,
  squadAmortization,
  squadBookValue,
} from './book-value.js';
import { sustainability } from './treasury.js';

const YEAR = 2026;

function contractOf(fee: number, years: number, start = YEAR): Contract {
  return {
    id: asContractId('ct-test-1'),
    playerId: 'p1' as never,
    clubId: 'c1' as never,
    wage: 50_000,
    startYear: start,
    endYear: start + years - 1,
    transferFee: fee || undefined,
  };
}

describe('valore contabile del cartellino (MODULE_FINANCES §6)', () => {
  it('linear amortization: full at signing, zero past expiry; academy players are worth 0', () => {
    const c = contractOf(60_000_000, 3);
    expect(annualAmortization(c)).toBe(20_000_000);
    expect(bookValue(c, YEAR)).toBe(60_000_000);
    expect(bookValue(c, YEAR + 1)).toBe(40_000_000);
    expect(bookValue(c, YEAR + 2)).toBe(20_000_000); // ultima stagione: una quota residua
    expect(bookValue(c, YEAR + 3)).toBe(0);
    expect(bookValue(contractOf(0, 3), YEAR)).toBe(0); // vivaio/parametro zero
  });

  it('a sale splits the ledger: book-value recovery + plusvalenza, summing EXACTLY to the fee', () => {
    const w = generateWorld(createRng(71));
    const clubs = [...w.clubs.values()];
    const [seller, buyer, thirdClub] = [clubs[0]!, clubs[1]!, clubs[2]!];
    const player = w.players.get(seller.playerIds[0]!)!;
    buyer.finances.cash = 500_000_000;
    thirdClub.finances.cash = 500_000_000;

    // 1° passaggio: il venditore non ha mai pagato cartellino → plusvalenza PIENA.
    executeTransfer(w, seller, buyer, player, 30_000_000, 60_000, 4, 0, YEAR);
    const gain = seller.finances.incomes.filter((e) => e.type === 'plusvalenza');
    expect(gain).toHaveLength(1);
    expect(gain[0]!.amount).toBe(30_000_000);
    expect(seller.finances.incomes.filter((e) => e.type === 'transfer_out')).toHaveLength(0);

    // Il contratto nuovo porta il cartellino: 30M su 4 stagioni.
    const c = w.contracts.get(player.contractId!)!;
    expect(c.transferFee).toBe(30_000_000);
    expect(annualAmortization(c)).toBe(7_500_000);

    // Rivendita dopo 2 stagioni a 40M: residuo 15M → recupero 15M + plusvalenza 25M.
    executeTransfer(w, buyer, thirdClub, player, 40_000_000, 60_000, 3, 0, YEAR + 2);
    const rec = buyer.finances.incomes.filter((e) => e.type === 'transfer_out');
    const gain2 = buyer.finances.incomes.filter((e) => e.type === 'plusvalenza');
    expect(rec[0]!.amount).toBe(15_000_000);
    expect(gain2[0]!.amount).toBe(25_000_000);
    expect(rec[0]!.amount + gain2[0]!.amount).toBe(40_000_000); // somma = fee, cassa invariata
  });

  it('selling below book value posts the fee with a minusvalenza note, no fake expense', () => {
    const w = generateWorld(createRng(72));
    const clubs = [...w.clubs.values()];
    const [a, b, c3] = [clubs[0]!, clubs[1]!, clubs[2]!];
    const player = w.players.get(a.playerIds[0]!)!;
    b.finances.cash = 500_000_000;
    c3.finances.cash = 500_000_000;
    executeTransfer(w, a, b, player, 50_000_000, 60_000, 5, 0, YEAR);
    const expensesBefore = b.finances.expenses.length;
    // Rivendita subito a 10M: residuo 50M → minusvalenza 40M.
    executeTransfer(w, b, c3, player, 10_000_000, 60_000, 3, 0, YEAR);
    const out = b.finances.incomes.filter((e) => e.type === 'transfer_out');
    expect(out[0]!.amount).toBe(10_000_000);
    expect(out[0]!.note).toContain('minusvalenza 40M');
    expect(b.finances.incomes.some((e) => e.type === 'plusvalenza')).toBe(false);
    expect(b.finances.expenses.length).toBe(expensesBefore); // nessuna voce di spesa fittizia
  });

  it('amortization bites sustainability: a big signing raises the ratio and lowers the weekly cap', () => {
    const w = generateWorld(createRng(73));
    const clubs = [...w.clubs.values()].sort((x, y) => y.reputation - x.reputation);
    const [me, other] = [clubs[0]!, clubs[5]!];
    const before = sustainability(w, me, YEAR);
    const player = w.players.get(other.playerIds[0]!)!;
    me.finances.cash = 500_000_000;
    executeTransfer(w, other, me, player, 80_000_000, 60_000, 4, 0, YEAR);
    const after = sustainability(w, me, YEAR);
    expect(squadAmortization(w, me)).toBeGreaterThanOrEqual(20_000_000);
    expect(after.ratio).toBeGreaterThan(before.ratio);
    expect(after.capWeekly).toBeLessThan(before.capWeekly);
    expect(squadBookValue(w, me, YEAR)).toBeGreaterThanOrEqual(80_000_000);
  });

  it('future-year amortization follows the real contract schedule and dies out', () => {
    const w = generateWorld(createRng(75));
    const clubs = [...w.clubs.values()].sort((x, y) => y.reputation - x.reputation);
    const [me, other] = [clubs[0]!, clubs[3]!];
    me.finances.cash = 500_000_000;
    const player = w.players.get(other.playerIds[0]!)!;
    executeTransfer(w, other, me, player, 60_000_000, 60_000, 3, 0, YEAR);
    expect(amortizationInYear(w, me, YEAR)).toBe(20_000_000);
    expect(amortizationInYear(w, me, YEAR + 2)).toBe(20_000_000);
    expect(amortizationInYear(w, me, YEAR + 3)).toBe(0); // il piano si esaurisce
  });

  it('renewal re-spreads the residual over the new length (the club-accounting lever)', () => {
    const w = generateWorld(createRng(74));
    const clubs = [...w.clubs.values()].sort((x, y) => y.reputation - x.reputation);
    const [me, other] = [clubs[0]!, clubs[4]!];
    me.finances.cash = 500_000_000;
    // Un giovane (rinnovo lungo) comprato caro: 40M su 2 stagioni = 20M/anno.
    const player = [...other.playerIds].map((id) => w.players.get(id)!).find((p) => p.age <= 23)!;
    executeTransfer(w, other, me, player, 40_000_000, 60_000, 2, 0, YEAR);
    // Rinnovo l'anno dopo: residuo 20M spalmato su 4+ stagioni → quota ≤ 5M.
    me.finances.wageBudget = 10_000_000; // spazio per l'aumento
    const res = offerRenewal(w, me, player, YEAR + 1);
    expect(res.accepted).toBe(true);
    const c = w.contracts.get(player.contractId!)!;
    expect(c.transferFee).toBe(20_000_000);
    expect(annualAmortization(c)).toBeLessThanOrEqual(10_000_000);
    expect(annualAmortization(c)).toBeLessThan(20_000_000);
  });
});
