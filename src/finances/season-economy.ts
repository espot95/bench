/**
 * Club economy — the season cycle (GAME_DESIGN §6.2, spec docs/MODULE_FINANCES.md).
 * Event-driven: runs ONCE per off-season on the season just played. Pure — no RNG, no I/O.
 * This module is the owner of FinancialState ledgers (ARCHITECTURE §6).
 */

import { clubWageBill } from '../core/finance.js';
import type { ClubId, LeagueId } from '../core/ids.js';
import { commercialSeasonIncome, stadiumCapacity, ticketFactors } from '../core/stadium.js';
import {
  type Club,
  type President,
  type StandingRow,
  type World,
  leaguesByNation,
  nationById,
} from '../core/types.js';

/** Economy tuning. Per-nation TV pools & sponsor bases mirror real proportions (ENG ≈ 3× ITA). */
export const FINANCES = {
  TICKET_PRICE: 35,
  HOME_GAMES: 19,
  /** Attendance fill from reputation + league position bonus. */
  FILL_BASE: 0.4,
  FILL_REP: 0.55,
  FILL_POS_BONUS: 0.15, // linearly from last (0) to first (max)
  FILL_MIN: 0.25,
  /** Sponsor base by nation code (tier-1; tier-2 scaled). */
  SPONSOR_BASE: { ITA: 55_000_000, ENG: 75_000_000, DEFAULT: 55_000_000 } as Record<string, number>,
  SPONSOR_TITLE: 1.3,
  SPONSOR_TOP4: 1.15,
  SPONSOR_RELEGATED: 0.7,
  /** TV pools per nation per tier (whole-league, split 50% equal / 50% merit). */
  TV_POOLS: {
    ITA: [1_000_000_000, 70_000_000],
    ENG: [3_000_000_000, 220_000_000],
    DEFAULT: [900_000_000, 60_000_000],
  } as Record<string, [number, number]>,
  TV_EQUAL_SHARE: 0.5,
  /** Prize money for 1st place, declining linearly to ~10% for last (tier scaled). */
  PRIZE_TOP: {
    ITA: [25_000_000, 3_000_000],
    ENG: [40_000_000, 5_000_000],
    DEFAULT: [22_000_000, 3_000_000],
  } as Record<string, [number, number]>,
  /** Solidarity/parachute per tier-2 club (real: Serie A shares ~10% of TV with B). */
  SOLIDARITY: { ITA: 10_000_000, ENG: 8_000_000, DEFAULT: 8_000_000 } as Record<string, number>,
  /** Facilities upkeep per stadium seat. */
  FACILITY_PER_SEAT: 260,
  /** Ledger retention (seasons) — sparse by default. */
  LEDGER_KEEP_YEARS: 3,
  /** Budget policy (MODULE_FINANCES §2). */
  REINVEST_BASE: 0.35,
  REINVEST_AMBITION: 0.4,
  TRANSFER_SHARE: 0.6,
  WAGE_SHARE_BASE: 0.55,
  WAGE_SHARE_AMBITION: 0.15,
} as const;

export interface ClubSeasonAccounts {
  clubId: ClubId;
  revenue: number;
  costs: number;
  net: number;
}

/** Run the yearly economy for every league in the world. Returns per-club accounts. */
export function runWorldEconomy(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
  year: number,
): ClubSeasonAccounts[] {
  const out: ClubSeasonAccounts[] = [];
  for (const pyramid of leaguesByNation(world).values()) {
    for (const league of pyramid) {
      const table = standingsByLeague.get(league.id);
      if (!table || table.length === 0) continue;
      const nationCode = nationById(world, league.nationId)?.code ?? 'DEFAULT';
      out.push(...runLeagueEconomy(world, table, nationCode, league.tier, year));
    }
  }
  return out;
}

function runLeagueEconomy(
  world: World,
  table: StandingRow[],
  nationCode: string,
  tier: number,
  year: number,
): ClubSeasonAccounts[] {
  const n = table.length;
  const tvPool = (FINANCES.TV_POOLS[nationCode] ?? FINANCES.TV_POOLS.DEFAULT)?.[tier - 1] ?? 0;
  const [prizeTop, prizeBottom] = scalePrize(nationCode, tier);
  const sponsorBase =
    (FINANCES.SPONSOR_BASE[nationCode] ?? FINANCES.SPONSOR_BASE.DEFAULT ?? 0) / tier ** 1.5;

  const accounts: ClubSeasonAccounts[] = [];
  table.forEach((row, index) => {
    const club = world.clubs.get(row.clubId);
    if (!club) return;
    const position = index + 1;
    const posFrac = (n - position) / (n - 1); // 1 = champion, 0 = last

    // --- Incomes ---
    // Biglietteria (MODULE_STADIUM §3.2): il prezzo scelto muove incasso E riempimento.
    const ticket = ticketFactors(club.stadium.ticketPrice);
    const fill = Math.min(
      1,
      Math.max(
        FINANCES.FILL_MIN,
        FINANCES.FILL_BASE +
          FINANCES.FILL_REP * ((club.reputation - 40) / 55) +
          FINANCES.FILL_POS_BONUS * posFrac +
          ticket.fillDelta,
      ),
    );
    const capacity = stadiumCapacity(club);
    const gate = Math.round(
      capacity * fill * FINANCES.HOME_GAMES * FINANCES.TICKET_PRICE * ticket.gate,
    );
    // Attività commerciali dello stadio (MODULE_STADIUM §3); 0 finché non costruite.
    const commercial = commercialSeasonIncome(club, fill);

    const resultMult =
      position === 1
        ? FINANCES.SPONSOR_TITLE
        : position <= 4
          ? FINANCES.SPONSOR_TOP4
          : position > n - 3
            ? FINANCES.SPONSOR_RELEGATED
            : 1;
    const sponsor = Math.round(sponsorBase * (club.reputation / 100) ** 2 * resultMult);

    const tvEqual = (tvPool * FINANCES.TV_EQUAL_SHARE) / n;
    const meritPool = tvPool * (1 - FINANCES.TV_EQUAL_SHARE);
    // Linear merit weights: champion gets 2×/n, last ~0.
    const tvMerit = (meritPool * 2 * posFrac) / n;
    const tv = Math.round(tvEqual + tvMerit);

    const prize = Math.round(prizeBottom + (prizeTop - prizeBottom) * posFrac);
    const solidarity =
      tier >= 2 ? (FINANCES.SOLIDARITY[nationCode] ?? FINANCES.SOLIDARITY.DEFAULT ?? 0) : 0;

    // --- Costs ---
    const wages = clubWageBill(world, club) * 52;
    const facilities = capacity * FINANCES.FACILITY_PER_SEAT;
    const coach = [...(world.managers?.values() ?? [])].find((m) => m.clubId === club.id);
    const staff = Math.round(400_000 + ((coach?.reputation ?? 40) / 100) ** 2 * 6_000_000);

    const f = club.finances;
    f.incomes.push(
      { type: 'gate', amount: gate, year },
      { type: 'sponsor', amount: sponsor, year },
      { type: 'tv', amount: tv, year },
      { type: 'prize', amount: prize, year },
    );
    if (solidarity > 0)
      f.incomes.push({ type: 'other', amount: solidarity, year, note: 'mutualità' });
    if (commercial > 0) f.incomes.push({ type: 'commerciale', amount: commercial, year });
    f.expenses.push(
      { type: 'wages', amount: wages, year },
      { type: 'facilities', amount: facilities, year },
      { type: 'other', amount: staff, year, note: 'staff tecnico' },
    );
    pruneLedgers(club, year);

    const revenue = gate + sponsor + tv + prize + solidarity + commercial;
    const costs = wages + facilities + staff;
    f.cash += revenue - costs;
    accounts.push({ clubId: club.id, revenue, costs, net: revenue - costs });
  });
  return accounts;
}

function scalePrize(nationCode: string, tier: number): [number, number] {
  const [top, bottom] = FINANCES.PRIZE_TOP[nationCode] ?? FINANCES.PRIZE_TOP.DEFAULT ?? [0, 0];
  return [top / tier ** 2, bottom / tier ** 2];
}

/** Sparse by default: keep only the last LEDGER_KEEP_YEARS seasons of entries. */
function pruneLedgers(club: Club, year: number): void {
  const cutoff = year - FINANCES.LEDGER_KEEP_YEARS + 1;
  club.finances.incomes = club.finances.incomes.filter((e) => e.year >= cutoff);
  club.finances.expenses = club.finances.expenses.filter((e) => e.year >= cutoff);
}

/**
 * Turn the books into next season's budgets, bent by the president's character
 * (MODULE_FINANCES §2). Austerity when the cash is red; running contracts are never torn up.
 */
export function applyBudgetPolicy(
  world: World,
  accounts: ClubSeasonAccounts[],
  presidentsByClub: Map<ClubId, President>,
): void {
  for (const acc of accounts) {
    const club = world.clubs.get(acc.clubId);
    if (!club) continue;
    const bill = clubWageBill(world, club);
    const f = club.finances;

    if (f.cash < 0) {
      // Austerity: freeze — no transfer money, wage budget pinned to the current bill.
      f.transferBudget = 0;
      f.wageBudget = bill;
      continue;
    }
    const ambition = presidentsByClub.get(club.id)?.personality.ambition ?? 0.5;
    const reinvest = FINANCES.REINVEST_BASE + FINANCES.REINVEST_AMBITION * ambition;
    // Capped at one season's revenue: cash can pile up until the AI market exists (2b).
    f.transferBudget = Math.round(
      Math.min(f.cash * reinvest * FINANCES.TRANSFER_SHARE, acc.revenue),
    );
    const wageShare = FINANCES.WAGE_SHARE_BASE + FINANCES.WAGE_SHARE_AMBITION * ambition;
    f.wageBudget = Math.max(bill, Math.round((acc.revenue * wageShare) / 52));
  }
}
