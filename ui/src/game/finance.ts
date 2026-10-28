/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { playableRoles } from '../../../src/core/archetypes';
import { clubWageBill } from '../../../src/core/finance';
import { stadiumCapacity } from '../../../src/core/stadium';
import { leagueOfClub, nationOfClub } from '../../../src/core/types';
import {
  amortizationInYear,
  squadAmortization,
  squadBookValue,
} from '../../../src/finances/book-value';
import {
  marketingMatchGate,
  marketingSeasonGate,
  seasonTicketPrice,
  subscriberDemand,
} from '../../../src/finances/marketing';
import {
  FINANCES,
  clubSeasonLines,
  expectedPositionByReputation,
} from '../../../src/finances/season-economy';
import {
  FISCAL,
  overdraftLimit,
  projectedStatement,
  spendingRoom,
  sustainability,
  syncUserBudgets,
} from '../../../src/finances/treasury';
import { LEDGER_LABELS } from './shared';

import type { Player } from '../../../src/core/types';
import type { GameSession } from '../game';

// ---------------------------------------------------------------------------
// Tesoreria (MODULE_FINANCES §5): la vista del bilancio vero del presidente.
// ---------------------------------------------------------------------------

/** Riallinea gli specchi dopo un'operazione di denaro fuori dal tick di giornata. */
/** Una voce della dashboard Finanze (importo su base ANNUA; la UI divide per 52). */
export interface FinanceRow {
  label: string;
  amount: number;
  /** attesa = proiezione strutturale della stagione; consuntivo = già a ledger quest'anno. */
  kind: 'attesa' | 'consuntivo';
  /** Non muove cassa (ammortamenti): fuori dal saldo, pesa solo sul cap. */
  nonCash?: boolean;
}

/**
 * La dashboard decisionale delle Finanze (richiesta utente): TUTTE le entrate e le
 * uscite su base annua (vista settimanale = /52 nel componente), saldo di gestione e
 * verdetto "puoi investire?". Le voci strutturali sono ATTESE (stessa fonte del
 * motore economico, clubSeasonLines); quelle episodiche (coppe, mercato, eventi)
 * sono il CONSUNTIVO dell'anno a ledger.
 */
export function financeDashboard(s: GameSession) {
  const { world, club, year } = s;
  const league = leagueOfClub(world, club.id);
  const nationCode = nationOfClub(world, club.id)?.code ?? 'DEFAULT';
  const lines = clubSeasonLines(
    world,
    club,
    expectedPositionByReputation(world, club),
    league.clubIds.length,
    nationCode,
    league.tier,
  );
  const ledger = (list: 'incomes' | 'expenses', type: string) =>
    club.finances[list]
      .filter((e) => e.year === year && e.type === type)
      .reduce((a, e) => a + e.amount, 0);

  const attesa = (label: string, amount: number): FinanceRow => ({
    label,
    amount: Math.round(amount),
    kind: 'attesa',
  });
  const consuntivo = (label: string, amount: number): FinanceRow => ({
    label,
    amount: Math.round(amount),
    kind: 'consuntivo',
  });

  const sponsorAnnual =
    club.sponsors !== undefined
      ? club.sponsors.reduce((a, c) => a + c.annualValue, 0)
      : lines.sponsorBase;

  // Con l'ufficio marketing il botteghino atteso si SPACCA: abbonamenti (incasso
  // unico d'agosto) + paganti a gara (MODULE_STADIUM §3.4).
  const mkt = club.marketing !== undefined;
  const expPos = expectedPositionByReputation(world, club);
  const n = league.clubIds.length;
  const posFrac = n > 1 ? (n - expPos) / (n - 1) : 0.5;
  const incomes: FinanceRow[] = [];
  if (mkt && club.marketing) {
    const m = club.marketing;
    const level = m.abbPricePaid ?? m.plan.abbPrice ?? 'standard';
    const abbIncome =
      (m.abbonati ?? subscriberDemand(world, club, m, year).abbonati) *
      seasonTicketPrice(world, club, level);
    const abbLedger = ledger('incomes', 'abbonamenti');
    incomes.push(
      attesa(
        'Botteghino (paganti)',
        Math.max(0, marketingSeasonGate(world, club, posFrac, year) - abbIncome),
      ),
      abbLedger > 0 ? consuntivo('Abbonamenti', abbLedger) : attesa('Abbonamenti', abbIncome),
    );
  } else {
    incomes.push(attesa('Botteghino', lines.gate));
  }
  incomes.push(
    attesa('Diritti TV', lines.tvEqual + lines.tvMerit),
    attesa('Sponsor (contratti attivi)', sponsorAnnual),
    attesa('Premi campionato', lines.prize),
  );
  if (lines.solidarity > 0) incomes.push(attesa('Mutualità', lines.solidarity));
  if (lines.commercial > 0) incomes.push(attesa('Attività commerciali', lines.commercial));
  const optIn: [string, number][] = [
    ['Coppe nazionali', ledger('incomes', 'coppa')],
    ['Merchandising e mercati esteri', ledger('incomes', 'merch')],
    ['Eventi (tour e concerti)', ledger('incomes', 'eventi')],
    ['Plusvalenze', ledger('incomes', 'plusvalenza')],
    ['Cessioni (recupero a bilancio)', ledger('incomes', 'transfer_out')],
  ];
  for (const [label, v] of optIn) if (v > 0) incomes.push(consuntivo(label, v));

  const bill = clubWageBill(world, club) * 52;
  const amortization = squadAmortization(world, club);
  const matchday =
    (mkt
      ? marketingMatchGate(world, club, 'campionato', posFrac).attendance
      : stadiumCapacity(club) * lines.fill) *
    FISCAL.MATCHDAY_COST_PER_FAN *
    FINANCES.HOME_GAMES;
  const interest =
    club.finances.cash < 0
      ? -club.finances.cash * FISCAL.INTEREST_RATE
      : ledger('expenses', 'interessi');

  const expenses: FinanceRow[] = [
    attesa('Stipendi calciatori', bill),
    attesa('Gestione impianti', lines.facilities),
    attesa('Staff tecnico', lines.staff),
    attesa('Costi del matchday', matchday),
  ];
  if (amortization > 0)
    expenses.push({
      label: 'Ammortamenti cartellini',
      amount: Math.round(amortization),
      kind: 'attesa',
      nonCash: true,
    });
  const optOut: [string, number][] = [
    ['Interessi sul fido', interest],
    ['Ritiro estivo', ledger('expenses', 'ritiro')],
    ['Eventi (pubblicità, tour in perdita)', ledger('expenses', 'eventi')],
    ['Cartellini acquistati', ledger('expenses', 'transfer_in')],
    ['Commissioni agenti', ledger('expenses', 'agency_fees')],
    ['Cantieri stadio', ledger('expenses', 'stadio')],
  ];
  for (const [label, v] of optOut) if (v > 0) expenses.push(consuntivo(label, v));

  const totalIn = incomes.reduce((a, r) => a + r.amount, 0);
  const totalOut = expenses.filter((r) => !r.nonCash).reduce((a, r) => a + r.amount, 0);
  const saldo = totalIn - totalOut;

  // Il verdetto: si può investire? Margine di gestione + banca + spazio ingaggi.
  const sus = sustainability(world, club, year);
  const room = spendingRoom(world, club, year);
  const wageHeadroom = Math.max(0, (sus.capWeekly - clubWageBill(world, club)) * 52);
  const reasons: string[] = [];
  if (saldo < 0) reasons.push('la gestione brucia cassa: le uscite superano le entrate attese');
  if (sus.status === 'blocco')
    reasons.push('squad-cost oltre il cap: niente aumenti né nuovi ingaggi');
  if (sus.status === 'allerta') reasons.push('squad-cost in allerta: margine ingaggi sottile');
  if (club.finances.cash < 0) reasons.push('cassa in rosso: gli interessi corrono');
  if (reasons.length === 0) reasons.push('conti in ordine: margine positivo e spazio sotto il cap');
  const level: 'verde' | 'giallo' | 'rosso' =
    sus.status === 'blocco' || (saldo < 0 && club.finances.cash < 0)
      ? 'rosso'
      : sus.status === 'allerta' || saldo < 0
        ? 'giallo'
        : 'verde';

  return {
    incomes,
    expenses,
    totalIn,
    totalOut,
    saldo,
    verdict: { level, reasons, room, wageHeadroom, ratio: sus.ratio, status: sus.status },
  };
}

export function treasuryView(s: GameSession) {
  syncUserBudgets(s.world, s.club, s.year);
  const f = s.club.finances;
  const od = overdraftLimit(s.world, s.club, s.year);
  const sus = sustainability(s.world, s.club, s.year);
  const proj = projectedStatement(s.world, s.club, s.year);
  const sumBy = (list: { type: string; amount: number; year: number }[]) => {
    const acc = new Map<string, number>();
    for (const e of list) {
      if (e.year !== s.year) continue;
      acc.set(e.type, (acc.get(e.type) ?? 0) + e.amount);
    }
    return [...acc.entries()]
      .map(([type, amount]) => ({ label: LEDGER_LABELS[type] ?? type, amount }))
      .sort((a, b) => b.amount - a.amount);
  };
  const incomes = sumBy(f.incomes);
  const expenses = sumBy(f.expenses);
  const inTot = incomes.reduce((a, r) => a + r.amount, 0);
  const outTot = expenses.reduce((a, r) => a + r.amount, 0);
  return {
    cash: f.cash,
    overdraft: od,
    overdraftUsed: Math.max(0, -f.cash),
    room: spendingRoom(s.world, s.club, s.year),
    ratio: sus.ratio,
    ratioStatus: sus.status,
    ratioCap: FISCAL.SQUAD_COST_CAP,
    capWeekly: sus.capWeekly,
    billWeekly: clubWageBill(s.world, s.club),
    // F2b — la rosa a bilancio: valore contabile e quote di ammortamento (non-cassa).
    bookValue: squadBookValue(s.world, s.club, s.year),
    amortization: sus.amortization,
    incomes,
    expenses,
    inTot,
    outTot,
    net: inTot - outTot,
    projection: proj,
  };
}

export function financeDetail(s: GameSession) {
  const year = s.year;
  const inc = s.club.finances.incomes.filter((e) => e.year === year);
  const exp = s.club.finances.expenses.filter((e) => e.year === year);
  const sumI = (type: string) =>
    inc.filter((e) => e.type === type).reduce((a, e) => a + e.amount, 0);
  const sumE = (type: string) =>
    exp.filter((e) => e.type === type).reduce((a, e) => a + e.amount, 0);

  // ---- Monte ingaggi scomposto ----
  const squad = s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined);
  const wageOf = (p: Player) => (p.contractId ? s.world.contracts.get(p.contractId)?.wage : 0) ?? 0;
  const billWeekly = squad.reduce((a, p) => a + wageOf(p), 0);
  const topWages = [...squad]
    .sort((a, b) => wageOf(b) - wageOf(a))
    .slice(0, 6)
    .map((p) => ({
      name: p.name,
      role: playableRoles(p).primary,
      gross: wageOf(p) * 52,
      net: Math.round(wageOf(p) * 0.52) * 52,
      pct: billWeekly > 0 ? wageOf(p) / billWeekly : 0,
    }));
  const byPos = (['GK', 'DF', 'MF', 'FW'] as const).map((pos) => ({
    pos,
    gross: squad.filter((p) => p.position === pos).reduce((a, p) => a + wageOf(p), 0) * 52,
  }));

  // ---- Impegni futuri ----
  const rate = new Map<number, number>();
  for (const r of s.installmentsDue ?? []) rate.set(r.year, (rate.get(r.year) ?? 0) + r.amount);
  const futures = [0, 1, 2].map((k) => ({
    year: year + k,
    ammortamenti: amortizationInYear(s.world, s.club, year + k),
    rate: rate.get(year + k) ?? 0,
  }));
  const expiring = squad.filter((p) => {
    const c = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
    return c !== undefined && c.endYear <= year;
  });
  const expiringWages = expiring.reduce((a, p) => a + wageOf(p), 0) * 52;

  // ---- Il mercato dell'anno (ledger vero) ----
  const market = {
    cessioni: sumI('transfer_out') + sumI('plusvalenza'),
    plusvalenze: sumI('plusvalenza'),
    acquisti: sumE('transfer_in'),
    commissioni: sumE('agency_fees'),
  };

  // ---- La giornata-tipo allo stadio ----
  const gateEntries = inc.filter((e) => e.type === 'gate');
  const gamesPlayed = Math.max(1, gateEntries.length);
  const cap = stadiumCapacity(s.club);
  const matchday = {
    incassoTotale: sumI('gate'),
    incassoMedio: sumI('gate') / gamesPlayed,
    gare: gateEntries.length,
    costiMatchday: sumE('matchday'),
    commerciale: sumI('commerciale'),
    abbonamenti: sumI('abbonamenti'),
    capienza: cap,
  };

  return {
    wages: {
      billAnnual: billWeekly * 52,
      capAnnual: s.club.finances.wageBudget * 52,
      top: topWages,
      byPos,
    },
    futures,
    expiring: { count: expiring.length, wagesFreed: expiringWages },
    market,
    matchday,
  };
}

export function financeTrends(s: GameSession) {
  const d = financeDashboard(s);
  const structuralIn = d.incomes
    .filter((r) => r.kind === 'attesa')
    .reduce((a, r) => a + r.amount, 0);
  const structuralOut = d.expenses
    .filter((r) => r.kind === 'attesa' && !r.nonCash)
    .reduce((a, r) => a + r.amount, 0);
  const forecast = [1, 2, 3, 4, 5].map((k) => {
    const year = s.year + k;
    const am = amortizationInYear(s.world, s.club, year);
    return {
      year,
      revenue: structuralIn,
      costs: structuralOut + am,
      net: structuralIn - structuralOut - am,
      amortization: am,
    };
  });
  return { history: s.financeHistory ?? [], forecast, dashboard: d };
}
