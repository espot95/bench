/**
 * Il TESORO del club utente (MODULE_FINANCES §5): cassa unica, fido bancario, regola di
 * sostenibilità. I flussi corrono PER GIORNATA (stesse formule dell'economia annuale,
 * spalmate) e il conguaglio di fine stagione posta ciò che dipende dalla classifica
 * finale. `transferBudget`/`wageBudget` del club utente diventano SPECCHI derivati:
 * tutti i vincoli macchina esistenti continuano a funzionare, guidati dal tesoro.
 * Puro, deterministico, zero RNG (i salvataggi restano byte-identici).
 */

import { clubWageBill } from '../core/finance.js';
import type { ClubId, LeagueId } from '../core/ids.js';
import { stadiumCapacity } from '../core/stadium.js';
import {
  type Club,
  type Season,
  type StandingRow,
  type World,
  leagueOfClub,
  nationById,
} from '../core/types.js';
import { type ClubSeasonAccounts, FINANCES, clubSeasonLines } from './season-economy.js';

export const FISCAL = {
  /** Fido = quota dei ricavi attesi (min assoluto). */
  OVERDRAFT_SHARE: 0.35,
  OVERDRAFT_MIN: 8_000_000,
  /** Interessi annui sul rosso, addebitati pro-quota a giornata. */
  INTEREST_RATE: 0.08,
  /** Sostenibilità squad-cost (stile UEFA): monte ingaggi ≤ CAP × ricavi attesi. */
  SQUAD_COST_CAP: 0.8,
  SQUAD_COST_WARN: 0.7,
  /** Tranche infra-stagione. */
  TV_TRANCHES: 3,
  SPONSOR_TRANCHES: 2,
  /** Costi del matchday per spettatore (steward/sicurezza/logistica). */
  MATCHDAY_COST_PER_FAN: 4,
} as const;

function leagueContextOf(world: World, club: Club) {
  const league = leagueOfClub(world, club.id);
  const nationCode = nationById(world, league.nationId)?.code ?? 'DEFAULT';
  return { league, nationCode, tier: league.tier, size: league.clubIds.length };
}

/** Posizione ATTESA = rank di reputazione nella propria lega (stabile in stagione). */
export function expectedPositionByReputation(world: World, club: Club): number {
  const { league } = leagueContextOf(world, club);
  const reps = league.clubIds
    .map((id) => world.clubs.get(id)?.reputation ?? 0)
    .sort((a, b) => b - a);
  return Math.max(1, reps.findIndex((r) => r <= club.reputation) + 1);
}

/** Le linee economiche del club alla posizione attesa (fonte unica: season-economy). */
function expectedLines(world: World, club: Club) {
  const { nationCode, tier, size } = leagueContextOf(world, club);
  return clubSeasonLines(
    world,
    club,
    expectedPositionByReputation(world, club),
    size,
    nationCode,
    tier,
  );
}

/** Ricavi attesi: incassi REALI dell'anno scorso se esistono, altrimenti proiezione. */
export function projectedRevenues(world: World, club: Club, year: number): number {
  const prev = club.finances.incomes
    .filter((e) => e.year === year - 1)
    .reduce((s, e) => s + e.amount, 0);
  if (prev > 0) return prev;
  const l = expectedLines(world, club);
  return l.gate + l.sponsor + l.tv + l.prize + l.solidarity + l.commercial;
}

export function overdraftLimit(world: World, club: Club, year: number): number {
  return Math.max(
    FISCAL.OVERDRAFT_MIN,
    Math.round(projectedRevenues(world, club, year) * FISCAL.OVERDRAFT_SHARE),
  );
}

/** Quanto puoi spendere DAVVERO: cassa + fido residuo. Il vincolo macchina della banca. */
export function spendingRoom(world: World, club: Club, year: number): number {
  return Math.max(0, club.finances.cash + overdraftLimit(world, club, year));
}

export interface Sustainability {
  /** Monte ingaggi annuo / ricavi attesi. */
  ratio: number;
  status: 'ok' | 'allerta' | 'blocco';
  /** Tetto settimanale implicito dal cap (lo specchio di wageBudget). */
  capWeekly: number;
}

export function sustainability(world: World, club: Club, year: number): Sustainability {
  const revenues = Math.max(1, projectedRevenues(world, club, year));
  const ratio = (clubWageBill(world, club) * 52) / revenues;
  return {
    ratio,
    status:
      ratio >= FISCAL.SQUAD_COST_CAP
        ? 'blocco'
        : ratio >= FISCAL.SQUAD_COST_WARN
          ? 'allerta'
          : 'ok',
    capWeekly: Math.round((revenues * FISCAL.SQUAD_COST_CAP) / 52),
  };
}

/**
 * Gli SPECCHI (MODULE_FINANCES §5.1): i vincoli macchina esistenti restano al loro
 * posto, ma per il club utente li guida il tesoro. I contratti in essere non si
 * stracciano: se il bill sfora già il cap, il tetto si appoggia al bill (blocco aumenti).
 */
export function syncUserBudgets(world: World, club: Club, year: number): void {
  const f = club.finances;
  f.transferBudget = spendingRoom(world, club, year);
  const s = sustainability(world, club, year);
  f.wageBudget = Math.max(clubWageBill(world, club), s.capWeekly);
}

/**
 * Il tick per-giornata (§5.2), chiamato dal runner SOLO per il club utente:
 * stipendi spalmati, botteghino e costi del matchday nelle gare in casa, tranche
 * TV/sponsor, interessi sul rosso. Stesse formule dell'annuale, posizione attesa.
 */
export function tickUserFinances(
  world: World,
  club: Club,
  season: Season,
  round: number,
  totalRounds: number,
): void {
  const year = season.year;
  const f = club.finances;
  const lines = expectedLines(world, club);

  const post = (list: 'incomes' | 'expenses', type: string, amount: number, note?: string) => {
    if (amount <= 0) return;
    const entry = { type: type as never, amount: Math.round(amount), year, note };
    f[list].push(entry);
    f.cash += list === 'incomes' ? entry.amount : -entry.amount;
  };

  // Stipendi: il monte corre ogni giornata (bill CORRENTE, non quello di inizio anno).
  post('expenses', 'wages', (clubWageBill(world, club) * 52) / totalRounds, `g.${round}`);

  // Partita in casa: botteghino e costi del matchday.
  const home = season.fixtures.some((m) => m.round === round && m.homeClubId === club.id);
  if (home) {
    post('incomes', 'gate', lines.gate / FINANCES.HOME_GAMES, `g.${round}`);
    const attendance = stadiumCapacity(club) * lines.fill;
    post('expenses', 'matchday', attendance * FISCAL.MATCHDAY_COST_PER_FAN, `g.${round}`);
  }

  // Diritti TV (quota uguale) in tranche; la quota merito arriva col conguaglio.
  const mid = Math.ceil(totalRounds / 2);
  if (round === 1 || round === mid || round === totalRounds) {
    post('incomes', 'tv', lines.tvEqual / FISCAL.TV_TRANCHES, 'tranche quota-uguale');
  }
  // Sponsor (base) in due tranche; il bonus/malus da risultato arriva col conguaglio.
  if (round === 1 || round === mid) {
    post('incomes', 'sponsor', lines.sponsorBase / FISCAL.SPONSOR_TRANCHES, 'tranche');
  }
  // Interessi sul fido usato.
  if (f.cash < 0) {
    post('expenses', 'interessi', (-f.cash * FISCAL.INTEREST_RATE) / totalRounds, `g.${round}`);
  }

  syncUserBudgets(world, club, year);
}

/**
 * Il conguaglio di fine stagione del club utente (§5.3): ciò che dipende dalla
 * classifica FINALE + le uscite annuali non spalmate. Ritorna i conti dell'anno
 * (somme di ledger, così il riepilogo quadra con tutto ciò che è transitato).
 */
export function settleUserSeason(
  world: World,
  club: Club,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
  year: number,
): ClubSeasonAccounts {
  const { league, nationCode, tier, size } = leagueContextOf(world, club);
  const table = standingsByLeague.get(league.id) ?? [];
  const position = Math.max(1, table.findIndex((r) => r.clubId === club.id) + 1);
  const lines = clubSeasonLines(world, club, position, Math.max(2, size), nationCode, tier);
  const f = club.finances;

  const post = (list: 'incomes' | 'expenses', type: string, amount: number, note?: string) => {
    if (Math.round(amount) === 0) return;
    const entry = { type: type as never, amount: Math.abs(Math.round(amount)), year, note };
    const asIncome = (list === 'incomes') === amount > 0;
    f[asIncome ? 'incomes' : 'expenses'].push(entry);
    f.cash += asIncome ? entry.amount : -entry.amount;
  };

  post('incomes', 'tv', lines.tvMerit, 'quota merito');
  post('incomes', 'prize', lines.prize, `campionato: ${position}°`);
  post('incomes', 'sponsor', lines.sponsor - lines.sponsorBase, 'bonus/malus risultato');
  if (lines.solidarity > 0) post('incomes', 'other', lines.solidarity, 'mutualità');
  if (lines.commercial > 0) post('incomes', 'commerciale', lines.commercial);
  post('expenses', 'facilities', lines.facilities);
  post('expenses', 'other', lines.staff, 'staff tecnico');

  // Conti dell'anno = somme del ledger (tutto ciò che è transitato, mercato incluso).
  const revenue = f.incomes.filter((e) => e.year === year).reduce((s, e) => s + e.amount, 0);
  const costs = f.expenses.filter((e) => e.year === year).reduce((s, e) => s + e.amount, 0);

  // Pruning (sparse by default), come l'economia annuale.
  const cutoff = year - FINANCES.LEDGER_KEEP_YEARS + 1;
  f.incomes = f.incomes.filter((e) => e.year >= cutoff);
  f.expenses = f.expenses.filter((e) => e.year >= cutoff);

  syncUserBudgets(world, club, year + 1);
  return { clubId: club.id, revenue, costs, net: revenue - costs };
}

/** Proiezione annuale semplice per la UI (posizione attesa): entrate/uscite strutturali. */
export function projectedStatement(
  world: World,
  club: Club,
  year: number,
): { revenues: number; wages: number; upkeep: number; net: number } {
  const revenues = projectedRevenues(world, club, year);
  const l = expectedLines(world, club);
  const wages = clubWageBill(world, club) * 52;
  const upkeep = l.facilities + l.staff;
  return { revenues, wages, upkeep, net: revenues - wages - upkeep };
}
