import { describe, expect, it } from 'vitest';
import { leagueOfClub } from '../core/types.js';
import { closeSeason } from '../engine/career.js';
import { createRunner, createSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { clubSeasonLines } from './season-economy.js';
import {
  FISCAL,
  expectedPositionByReputation,
  overdraftLimit,
  spendingRoom,
  sustainability,
  syncUserBudgets,
  tickUserFinances,
} from './treasury.js';

const YEAR = 2026;
const SEED = 51;

function career(seed = SEED) {
  const world = generateWorld(createRng(seed));
  const club = [...world.clubs.values()][2]!;
  const season = createSeason(world, leagueOfClub(world, club.id), YEAR, seed + YEAR);
  const runner = createRunner(world, season, createRng(seed + YEAR));
  return { world, club, season, runner };
}

describe('tesoreria del club utente (MODULE_FINANCES §5)', () => {
  it('per-round flows sum to the annual formulas; AI clubs stay silent in-season', () => {
    const { world, club, season, runner } = career();
    const league = leagueOfClub(world, club.id);
    const nationCode = world.nations?.find((n) => n.id === league.nationId)?.code ?? 'DEFAULT';
    const expLines = clubSeasonLines(
      world,
      club,
      expectedPositionByReputation(world, club),
      league.clubIds.length,
      nationCode,
      league.tier,
    );
    while (!runner.isFinished()) runner.playRound(club.id);

    const sum = (list: { type: string; amount: number; year: number }[], type: string) =>
      list.filter((e) => e.type === type && e.year === YEAR).reduce((s, e) => s + e.amount, 0);
    const f = club.finances;
    // Botteghino: 19 gare in casa, formula annuale spalmata (posizione attesa).
    expect(sum(f.incomes, 'gate')).toBeGreaterThan(expLines.gate * 0.95);
    expect(sum(f.incomes, 'gate')).toBeLessThan(expLines.gate * 1.05);
    // TV quota-uguale in 3 tranche; la quota merito arriva solo col conguaglio.
    expect(sum(f.incomes, 'tv')).toBeGreaterThan(expLines.tvEqual * 0.95);
    expect(sum(f.incomes, 'tv')).toBeLessThan(expLines.tvEqual * 1.05);
    // Stipendi spalmati su tutte le giornate (il bill può muoversi col mercato: banda).
    expect(sum(f.expenses, 'wages')).toBeGreaterThan(expLines.wages * 0.7);
    expect(sum(f.expenses, 'wages')).toBeLessThan(expLines.wages * 1.3);
    // Costi del matchday presenti.
    expect(sum(f.expenses, 'matchday')).toBeGreaterThan(0);

    // I club AI non hanno flussi STRUTTURALI infra-stagione (solo mercato; il resto
    // arriva col conguaglio annuale — bande salve).
    const structural = new Set(['gate', 'tv', 'sponsor', 'wages', 'matchday', 'interessi']);
    const other = [...world.clubs.values()].find((c) => c.id !== club.id)!;
    expect(
      [...other.finances.incomes, ...other.finances.expenses].filter(
        (e) => e.year === YEAR && structural.has(e.type),
      ),
    ).toHaveLength(0);
  });

  it('the settle completes the season: merit TV, prize, sponsor bonus, upkeep — books balance', () => {
    const { world, club, season, runner } = career(52);
    while (!runner.isFinished()) runner.playRound(club.id);
    const cashBefore = club.finances.cash;
    const closed = closeSeason(world, season, 52, YEAR, { userClubId: club.id });
    const acc = closed.report.accounts.find((a) => a.clubId === club.id);
    expect(acc).toBeDefined();
    // I conti dell'anno = somme di ledger; la cassa si è mossa di conseguenza.
    expect(acc!.net).not.toBe(0);
    expect(club.finances.cash).not.toBe(cashBefore);
    const f = club.finances;
    const notes = [...f.incomes, ...f.expenses].map((e) => e.note ?? '');
    expect(notes.some((n) => n.includes('quota merito'))).toBe(true);
    expect(f.expenses.some((e) => e.note === 'staff tecnico')).toBe(true);
  });

  it('fido: room, mirrors and the bank saying no; interests only when in the red', () => {
    const { world, club, season } = career(53);
    const od = overdraftLimit(world, club, YEAR);
    expect(od).toBeGreaterThanOrEqual(FISCAL.OVERDRAFT_MIN);
    club.finances.cash = -Math.round(od * 0.5);
    syncUserBudgets(world, club, YEAR);
    expect(club.finances.transferBudget).toBe(spendingRoom(world, club, YEAR));
    expect(club.finances.transferBudget).toBeGreaterThan(0); // in rosso ma dentro il fido
    // Tick col rosso → maturano interessi.
    tickUserFinances(world, club, season, 5, 38);
    expect(club.finances.expenses.some((e) => e.type === 'interessi')).toBe(true);
    // Oltre il fido non c'è più spazio.
    club.finances.cash = -od - 1_000_000;
    expect(spendingRoom(world, club, YEAR)).toBe(0);
  });

  it('sustainability caps the wage mirror; an inflated bill flips the status to blocco', () => {
    const { world, club } = career(54);
    const before = sustainability(world, club, YEAR);
    expect(before.capWeekly).toBeGreaterThan(0);
    // Gonfia il monte oltre il cap: lo status passa a blocco e lo specchio si appoggia al bill.
    for (const pid of club.playerIds) {
      const p = world.players.get(pid);
      const c = p?.contractId ? world.contracts.get(p.contractId) : undefined;
      if (c) c.wage = Math.round(c.wage * 6);
    }
    const after = sustainability(world, club, YEAR);
    expect(after.ratio).toBeGreaterThan(before.ratio);
    expect(after.status).toBe('blocco');
    syncUserBudgets(world, club, YEAR);
    // Il tetto non straccia i contratti: si appoggia al bill (blocco aumenti, non tagli).
    expect(club.finances.wageBudget).toBeGreaterThanOrEqual(after.capWeekly);
  });
});
