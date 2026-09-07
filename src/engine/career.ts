/**
 * Career orchestration (SPEC §10): play every division's season, then advance the
 * off-season (promotions, aging, retirements, youth). Pure + RNG-derived from seed.
 */

import type { ClubId, LeagueId, PlayerId } from '../core/ids.js';
import {
  type Club,
  type League,
  type Match,
  type Position,
  type Season,
  type StandingRow,
  type World,
  leagueById,
  leagueOfClub,
} from '../core/types.js';
import { type PlayerSeasonLine, settleContractBonuses } from '../finances/bonus-settlement.js';
import { type SponsorSettleResult, settleSponsors } from '../finances/sponsors.js';
import { createRng } from '../rng/rng.js';
import { createNationalCups, playCupToEnd } from './cup.js';
import { topScorers } from './player-stats.js';
import { type OffseasonReport, advanceOffseason } from './progression.js';
import { createSeason, seasonStandings, simulateSeason } from './season.js';

/** Goals/assists per player from a season's fixtures, flat (for finances). */
function seasonStats(fixtures: readonly Match[]): Map<PlayerId, PlayerSeasonLine> {
  return new Map(
    topScorers(fixtures, Number.POSITIVE_INFINITY).map((r) => [
      r.playerId,
      { goals: r.goals, assists: r.assists },
    ]),
  );
}

/** The league has a division below it in the same nation (relegation exists). */
function leagueHasRelegation(world: World, league: League): boolean {
  return world.leagues.some((l) => l.nationId === league.nationId && l.tier === league.tier + 1);
}

/**
 * Close a PLAYED user season (MODULE_UI §6 / CLI manage): simulate the other divisions
 * of the world for the same year, settle contract bonuses (MODULE_CONTRACTS §5), then
 * run the off-season. Seeds derive from (seed, year, league index) so the closure is
 * deterministic and shell-independent — the CLI and the browser UI go through this
 * exact function. `opts.userClubId` disables auto-renewals for that club (§1: expired,
 * non-renewed players leave for free).
 */
export function closeSeason(
  world: World,
  season: Season,
  seed: number,
  year: number,
  opts: { userClubId?: ClubId; touredNation?: string } = {},
): {
  report: OffseasonReport;
  standingsByLeague: Map<LeagueId, StandingRow[]>;
  finalTable: StandingRow[];
  bonusPaid: Map<ClubId, number>;
  sponsorResult: SponsorSettleResult;
} {
  const finalTable = seasonStandings(world, season);
  const standingsByLeague = new Map<LeagueId, StandingRow[]>();
  const fixturesByLeague = new Map<LeagueId, readonly Match[]>();
  standingsByLeague.set(season.leagueId, finalTable);
  fixturesByLeague.set(season.leagueId, season.fixtures);
  world.leagues.forEach((other, i) => {
    if (other.id === season.leagueId) return;
    const s = seed + year + (i + 1) * 1000;
    const os = createSeason(world, other, year, s);
    simulateSeason(world, os, createRng(s));
    standingsByLeague.set(other.id, seasonStandings(world, os));
    fixturesByLeague.set(other.id, os.fixtures);
  });

  // I bonus contrattuali si pagano sulla stagione appena chiusa, prima dei conti annuali.
  const bonusPaid = new Map<ClubId, number>();
  for (const league of world.leagues) {
    const standings = standingsByLeague.get(league.id);
    const fixtures = fixturesByLeague.get(league.id);
    if (!standings || !fixtures) continue;
    const payouts = settleContractBonuses(
      world,
      league.id,
      seasonStats(fixtures),
      standings,
      year,
      leagueHasRelegation(world, league),
    );
    for (const p of payouts) bonusPaid.set(p.clubId, (bonusPaid.get(p.clubId) ?? 0) + p.amount);
  }

  // Sponsor del club utente (MODULE_SPONSORS §5): soddisfazione, clausole, scadenze —
  // sulla classifica finale, prima che l'offseason muova il mondo.
  let sponsorResult: SponsorSettleResult = { expired: [], headlines: [], bonusPaid: 0 };
  if (opts.userClubId) {
    const userClub = world.clubs.get(opts.userClubId);
    if (userClub?.sponsors !== undefined) {
      const table = standingsByLeague.get(leagueOfClub(world, userClub.id).id) ?? [];
      sponsorResult = settleSponsors(world, userClub, table, year, opts.touredNation);
    }
  }

  const report = advanceOffseason(
    world,
    standingsByLeague,
    createRng(seed + year + 99999),
    year + 1,
    { userClubId: opts.userClubId },
  );
  return { report, standingsByLeague, finalTable, bonusPaid, sponsorResult };
}

/** Plain-data digest of an off-season from ONE club's point of view (UI/CLI report, saveable). */
export interface OffseasonSummary {
  /** Season just closed / the one about to start. */
  year: number;
  nextYear: number;
  clubName: string;
  oldLeagueName: string;
  newLeagueName: string;
  outcome: 'promoted' | 'relegated' | 'stayed';
  finalPosition: number;
  finalTable: { name: string; played: number; goalDiff: number; points: number; mine: boolean }[];
  /** Per league (world order): champion + who went up/down from there. */
  verdicts: { league: string; champion: string; promoted: string[]; relegated: string[] }[];
  accounts: { revenue: number; costs: number; net: number };
  /** After the president's budget policy for the new season. */
  cash: number;
  transferBudget: number;
  wageBudget: number;
  retiredMine: { name: string; age: number; position: Position }[];
  releasedMine: { name: string; age: number; position: Position }[];
  retiredTotal: number;
  youthCount: number;
  /** Bonus contrattuali pagati dal club sulla stagione chiusa (MODULE_CONTRACTS §5). */
  bonusPaid: number;
  /** Notizie sponsor del conguaglio (MODULE_SPONSORS §5): rotture, scadenze, piazza. */
  sponsorNews: string[];
}

/**
 * Build the digest. Call AFTER `closeSeason` (league membership and budgets are the new
 * ones); `squadBefore` = the club's player ids captured BEFORE closing, so released players
 * (already gone from the world) can be attributed to the club.
 */
export function offseasonSummary(
  world: World,
  club: Club,
  oldLeague: League,
  closed: ReturnType<typeof closeSeason>,
  year: number,
  squadBefore: readonly string[],
): OffseasonSummary {
  const name = (id: ClubId) => world.clubs.get(id)?.name ?? String(id);
  const newLeague = leagueOfClub(world, club.id);
  const wasMine = new Set(squadBefore);
  const promotedAll = new Set(closed.report.swaps.flatMap((s) => s.promoted));
  const relegatedAll = new Set(closed.report.swaps.flatMap((s) => s.relegated));
  const verdicts = world.leagues.map((l) => {
    const table = closed.standingsByLeague.get(l.id) ?? [];
    const ids = table.map((r) => r.clubId);
    return {
      league: l.name,
      champion: table[0] ? name(table[0].clubId) : '—',
      promoted: ids.filter((id) => promotedAll.has(id)).map(name),
      relegated: ids.filter((id) => relegatedAll.has(id)).map(name),
    };
  });
  const acc = closed.report.accounts.find((a) => a.clubId === club.id);
  return {
    year,
    nextYear: year + 1,
    clubName: club.name,
    oldLeagueName: oldLeague.name,
    newLeagueName: newLeague.name,
    outcome:
      newLeague.tier < oldLeague.tier
        ? 'promoted'
        : newLeague.tier > oldLeague.tier
          ? 'relegated'
          : 'stayed',
    finalPosition: closed.finalTable.findIndex((r) => r.clubId === club.id) + 1,
    finalTable: closed.finalTable.map((r) => ({
      name: name(r.clubId),
      played: r.played,
      goalDiff: r.goalDiff,
      points: r.points,
      mine: r.clubId === club.id,
    })),
    verdicts,
    accounts: acc
      ? { revenue: acc.revenue, costs: acc.costs, net: acc.net }
      : { revenue: 0, costs: 0, net: 0 },
    cash: club.finances.cash,
    transferBudget: club.finances.transferBudget,
    wageBudget: club.finances.wageBudget,
    retiredMine: closed.report.retired
      .filter((r) => r.clubId === club.id)
      .map((r) => ({ name: r.player.name, age: r.player.age, position: r.player.position })),
    releasedMine: closed.report.released
      .filter((p) => wasMine.has(p.id))
      .map((p) => ({ name: p.name, age: p.age, position: p.position })),
    retiredTotal: closed.report.retired.length,
    youthCount: closed.report.youthCount,
    bonusPaid: closed.bonusPaid.get(club.id) ?? 0,
    sponsorNews: closed.sponsorResult.headlines,
  };
}

/** Convenience for shells: the league the club plays in for `season`. */
export function seasonLeague(world: World, season: Season): League {
  return leagueById(world, season.leagueId);
}

export interface DivisionResult {
  leagueId: LeagueId;
  leagueName: string;
  tier: number;
  standings: StandingRow[];
}

export interface CareerSeason {
  year: number;
  divisions: DivisionResult[];
  /** Vincitrici delle coppe nazionali dell'anno (MODULE_CUPS). */
  cupWinners: { cup: string; winner: string }[];
  offseason: OffseasonReport;
}

/** Simulate every division's season for one year; returns per-division standings. */
export function playAllDivisions(
  world: World,
  year: number,
  seed: number,
): { divisions: DivisionResult[]; standingsByLeague: Map<LeagueId, StandingRow[]> } {
  const divisions: DivisionResult[] = [];
  const standingsByLeague = new Map<LeagueId, StandingRow[]>();

  world.leagues.forEach((league, i) => {
    const season = createSeason(world, league, year, seed + i);
    simulateSeason(world, season, createRng(seed + i));
    const standings = seasonStandings(world, season);
    standingsByLeague.set(league.id, standings);
    divisions.push({
      leagueId: league.id,
      leagueName: league.name,
      tier: league.tier,
      standings,
    });
  });

  return { divisions, standingsByLeague };
}

/** Run a full auto career of `seasons` years, mutating the world each off-season. */
export function runCareer(
  world: World,
  startYear: number,
  seasons: number,
  seed: number,
): CareerSeason[] {
  const out: CareerSeason[] = [];
  for (let s = 0; s < seasons; s++) {
    const year = startYear + s;
    const { divisions, standingsByLeague } = playAllDivisions(world, year, seed + s * 100);
    // Coppe nazionali (MODULE_CUPS): stream propri, i campionati restano byte-identici.
    const cupWinners: CareerSeason['cupWinners'] = [];
    for (const cup of createNationalCups(world, year, seed + s * 100)) {
      playCupToEnd(world, cup);
      cupWinners.push({
        cup: cup.name,
        winner: cup.winnerId ? (world.clubs.get(cup.winnerId)?.name ?? '—') : '—',
      });
    }
    const offseason = advanceOffseason(
      world,
      standingsByLeague,
      createRng(seed + s * 100 + 7777),
      year + 1,
    );
    out.push({ year, divisions, cupWinners, offseason });
  }
  return out;
}
