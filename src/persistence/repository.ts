/**
 * Map the pure domain world/season to and from the SQLite save file.
 * This is the only place that knows about Drizzle. See CLAUDE.md invariants.
 */

import { eq } from 'drizzle-orm';
import type { Attributes } from '../core/attributes.js';
import {
  asAgencyId,
  asClubId,
  asContractId,
  asLeagueId,
  asManagerId,
  asMatchId,
  asNationId,
  asPlayerId,
  asPresidentId,
  asSeasonId,
} from '../core/ids.js';
import type { ClubId } from '../core/ids.js';
import { neutralPersonality } from '../core/personality.js';
import type {
  Agency,
  Club,
  Contract,
  FinanceEntry,
  League,
  Manager,
  Match,
  MatchEvent,
  MatchEventType,
  Nation,
  Player,
  Position,
  PreferredFoot,
  President,
  RosterRules,
  Season,
  SeasonStatus,
  World,
} from '../core/types.js';
import type { ScoutingState } from '../scouting/report.js';
import type { Db } from './db.js';
import * as t from './schema.js';

/** Persist a whole world (league + clubs + players + contracts). Replaces any existing data. */
export function saveWorld(db: Db, world: World): void {
  db.transaction((tx) => {
    // Fresh save file semantics: wipe first, respecting FK order.
    tx.delete(t.matches).run();
    tx.delete(t.seasons).run();
    tx.delete(t.contracts).run();
    tx.delete(t.players).run();
    tx.delete(t.clubs).run();
    tx.delete(t.leagues).run();
    tx.delete(t.nations).run();
    tx.delete(t.agencies).run();
    tx.delete(t.managers).run();
    tx.delete(t.presidents).run();
    tx.delete(t.relationships).run();

    // Agencies (GAME_DESIGN par.3.3).
    for (const agency of world.agencies ?? []) {
      tx.insert(t.agencies)
        .values({
          id: agency.id,
          name: agency.name,
          reputation: agency.reputation,
          size: agency.size,
          staff: agency.staff,
        })
        .run();
    }

    // Managers / presidents (GAME_DESIGN par.3.1-3.2).
    for (const m of world.managers?.values() ?? []) {
      tx.insert(t.managers)
        .values({
          id: m.id,
          name: m.name,
          age: m.age,
          nationality: m.nationality,
          personality: m.personality,
          morale: m.morale,
          reputation: m.reputation,
          exPlayer: m.exPlayer,
          style: m.style,
          clubId: m.clubId,
        })
        .run();
    }
    for (const p of world.presidents?.values() ?? []) {
      tx.insert(t.presidents)
        .values({
          id: p.id,
          name: p.name,
          age: p.age,
          nationality: p.nationality,
          personality: p.personality,
          reputation: p.reputation,
          exPlayer: p.exPlayer,
          clubId: p.clubId,
        })
        .run();
    }

    // Sparse locker-room relations (GAME_DESIGN par.8): only non-neutral pairs exist.
    for (const [clubId, store] of world.relationships ?? []) {
      for (const [pairKey, value] of store) {
        tx.insert(t.relationships).values({ clubId, pairKey, value }).run();
      }
    }

    // Nations (SPEC §14). Insert before leagues (leagues reference nations).
    for (const nation of world.nations ?? []) {
      tx.insert(t.nations)
        .values({
          id: nation.id,
          code: nation.code,
          name: nation.name,
          euMember: nation.euMember,
          homeNationality: nation.homeNationality,
          rosterRules: nation.rosterRules,
        })
        .run();
    }

    // league_id per club + insert every division.
    const leagueOfClub = new Map<string, string>();
    for (const league of world.leagues) {
      tx.insert(t.leagues)
        .values({
          id: league.id,
          name: league.name,
          tier: league.tier,
          nationId: league.nationId ?? null,
        })
        .run();
      for (const clubId of league.clubIds) leagueOfClub.set(clubId, league.id);
    }

    // club_id per player, derived from squad membership.
    const clubOfPlayer = new Map<string, ClubId>();
    for (const club of world.clubs.values()) {
      for (const pid of club.playerIds) clubOfPlayer.set(pid, club.id);
    }

    for (const club of world.clubs.values()) {
      tx.insert(t.clubs)
        .values({
          id: club.id,
          leagueId: leagueOfClub.get(club.id) ?? world.leagues[0]?.id ?? '',
          name: club.name,
          shortName: club.shortName,
          reputation: club.reputation,
          stadiumCapacity: club.stadiumCapacity,
          transferBudget: club.finances.transferBudget,
          wageBudget: club.finances.wageBudget,
          cash: club.finances.cash,
          incomes: club.finances.incomes,
          expenses: club.finances.expenses,
          elo: Math.round(club.elo),
        })
        .run();
    }

    for (const player of world.players.values()) {
      tx.insert(t.players)
        .values({
          id: player.id,
          clubId: clubOfPlayer.get(player.id) ?? null,
          name: player.name,
          age: player.age,
          nationality: player.nationality,
          position: player.position,
          preferredFoot: player.preferredFoot,
          potential: player.potential,
          attributes: player.attributes,
          personality: player.personality,
          injuryProneness: player.injuryProneness,
          morale: player.morale,
          trainedClubId: player.trainedClubId ?? null,
          agencyId: player.agencyId === null ? 'SELF' : (player.agencyId ?? null),
          rampTotal: player.transferStatus?.rampTotal ?? null,
          rampRemaining: player.transferStatus?.rampRemaining ?? null,
          pricePressure:
            player.transferStatus === undefined
              ? null
              : Math.round(player.transferStatus.pricePressure * 1000),
        })
        .run();
    }

    for (const contract of world.contracts.values()) {
      tx.insert(t.contracts)
        .values({
          id: contract.id,
          playerId: contract.playerId,
          clubId: contract.clubId,
          wage: contract.wage,
          startYear: contract.startYear,
          endYear: contract.endYear,
          signingBonus: contract.signingBonus ?? null,
          bonuses: contract.bonuses ?? null,
          agencyId: contract.agencyId ?? null,
          agencyCommission: contract.agencyCommission ?? null,
          agencyWagePct: contract.agencyWagePct ?? null,
          merchandisingPct: contract.merchandisingPct ?? null,
        })
        .run();
    }
  });
}

/** Persist a season, its fixtures and all match events. */
export function saveSeason(db: Db, season: Season): void {
  db.transaction((tx) => {
    const matchIds = season.fixtures.map((m) => m.id);
    for (const id of matchIds) {
      tx.delete(t.matchEvents).where(eq(t.matchEvents.matchId, id)).run();
    }
    tx.delete(t.matches).where(eq(t.matches.seasonId, season.id)).run();
    tx.delete(t.seasons).where(eq(t.seasons.id, season.id)).run();

    tx.insert(t.seasons)
      .values({
        id: season.id,
        leagueId: season.leagueId,
        year: season.year,
        rngSeed: season.rngSeed,
        status: season.status,
      })
      .run();

    for (const m of season.fixtures) {
      tx.insert(t.matches)
        .values({
          id: m.id,
          seasonId: m.seasonId,
          round: m.round,
          homeClubId: m.homeClubId,
          awayClubId: m.awayClubId,
          played: m.played,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
        })
        .run();

      m.events.forEach((e, i) => {
        tx.insert(t.matchEvents)
          .values({
            id: `${m.id}-e${i}`,
            matchId: m.id,
            minute: e.minute,
            type: e.type,
            clubId: e.clubId,
            playerId: e.playerId,
            assistId: e.assistId,
            subOutId: e.subOutId,
          })
          .run();
      });
    }
  });
}

/** Persist the user's scouting memory (owner: src/scouting — ARCHITECTURE §6). */
export function saveScouting(db: Db, state: ScoutingState): void {
  db.transaction((tx) => {
    tx.delete(t.scoutReports).run();
    for (const report of state.values()) {
      tx.insert(t.scoutReports)
        .values({
          playerId: report.playerId,
          observations: report.observations,
          estimatedOverall: report.estimatedOverall,
          potentialLow: report.potentialLow,
          potentialHigh: report.potentialHigh,
          personalityGuess: report.personalityGuess,
          estimatedValue: report.estimatedValue,
        })
        .run();
    }
  });
}

/** Reload the scouting memory (empty map if none saved). */
export function loadScouting(db: Db): ScoutingState {
  const rows = db.select().from(t.scoutReports).all();
  const state: ScoutingState = new Map();
  for (const r of rows) {
    state.set(asPlayerId(r.playerId), {
      playerId: asPlayerId(r.playerId),
      observations: r.observations,
      estimatedOverall: r.estimatedOverall,
      potentialLow: r.potentialLow,
      potentialHigh: r.potentialHigh,
      personalityGuess: r.personalityGuess,
      estimatedValue: r.estimatedValue,
    });
  }
  return state;
}

/** Rebuild the in-memory world from the save file. */
export function loadWorld(db: Db): World {
  const leagueRows = db.select().from(t.leagues).all();
  if (leagueRows.length === 0) throw new Error('No league in save file');

  const clubRows = db.select().from(t.clubs).all();
  const playerRows = db.select().from(t.players).all();
  const contractRows = db.select().from(t.contracts).all();

  const players = new Map<Player['id'], Player>();
  const playersByClub = new Map<ClubId, Player['id'][]>();
  for (const r of playerRows) {
    const id = asPlayerId(r.id);
    players.set(id, {
      id,
      name: r.name,
      age: r.age,
      nationality: r.nationality,
      position: r.position as Position,
      preferredFoot: r.preferredFoot as PreferredFoot,
      attributes: r.attributes as Attributes,
      potential: r.potential,
      personality: (r.personality as Player['personality']) ?? neutralPersonality(),
      injuryProneness: r.injuryProneness ?? 0.5,
      morale: r.morale ?? 0.5,
      trainedClubId: r.trainedClubId ? asClubId(r.trainedClubId) : null,
      agencyId: r.agencyId === 'SELF' ? null : r.agencyId ? asAgencyId(r.agencyId) : undefined,
      transferStatus:
        r.rampTotal != null && r.rampRemaining != null
          ? {
              rampTotal: r.rampTotal,
              rampRemaining: r.rampRemaining,
              pricePressure: (r.pricePressure ?? 0) / 1000,
            }
          : undefined,
      contractId: null,
    });
    if (r.clubId) {
      const clubId = asClubId(r.clubId);
      const list = playersByClub.get(clubId) ?? [];
      list.push(id);
      playersByClub.set(clubId, list);
    }
  }

  const contracts = new Map<Contract['id'], Contract>();
  for (const r of contractRows) {
    const id = asContractId(r.id);
    contracts.set(id, {
      id,
      playerId: asPlayerId(r.playerId),
      clubId: asClubId(r.clubId),
      wage: r.wage,
      startYear: r.startYear,
      endYear: r.endYear,
      signingBonus: r.signingBonus ?? undefined,
      bonuses: (r.bonuses as Contract['bonuses']) ?? undefined,
      agencyId: r.agencyId ? asAgencyId(r.agencyId) : undefined,
      agencyCommission: r.agencyCommission ?? undefined,
      agencyWagePct: r.agencyWagePct ?? undefined,
      merchandisingPct: r.merchandisingPct ?? undefined,
    });
    const player = players.get(asPlayerId(r.playerId));
    if (player) player.contractId = id;
  }

  const clubs = new Map<ClubId, Club>();
  const clubIdsByLeague = new Map<string, ClubId[]>();
  for (const r of clubRows) {
    const id = asClubId(r.id);
    (clubIdsByLeague.get(r.leagueId) ?? clubIdsByLeague.set(r.leagueId, []).get(r.leagueId)!).push(
      id,
    );
    clubs.set(id, {
      id,
      name: r.name,
      shortName: r.shortName,
      reputation: r.reputation,
      stadiumCapacity: r.stadiumCapacity,
      finances: {
        transferBudget: r.transferBudget,
        wageBudget: r.wageBudget,
        cash: r.cash,
        incomes: (r.incomes as FinanceEntry[]) ?? [],
        expenses: (r.expenses as FinanceEntry[]) ?? [],
      },
      elo: r.elo,
      playerIds: playersByClub.get(id) ?? [],
    });
  }

  const agencyRows = db.select().from(t.agencies).all();
  const agencies: Agency[] = agencyRows.map((r) => ({
    id: asAgencyId(r.id),
    name: r.name,
    reputation: r.reputation,
    size: r.size as Agency['size'],
    clientIds: [],
    staff: (r.staff as Agency['staff']) ?? [],
  }));
  // Rebuild each agency's client list from the players' agencyId.
  const clientsByAgency = new Map<string, Player['id'][]>();
  for (const p of players.values()) {
    if (p.agencyId) {
      const list = clientsByAgency.get(p.agencyId) ?? [];
      list.push(p.id);
      clientsByAgency.set(p.agencyId, list);
    }
  }
  for (const agency of agencies) agency.clientIds = clientsByAgency.get(agency.id) ?? [];

  const managerRows = db.select().from(t.managers).all();
  const managers = new Map(
    managerRows.map((r) => [
      asManagerId(r.id),
      {
        id: asManagerId(r.id),
        name: r.name,
        age: r.age,
        nationality: r.nationality,
        personality: r.personality as Manager['personality'],
        morale: r.morale,
        reputation: r.reputation,
        exPlayer: r.exPlayer,
        style: (r.style as Manager['style']) ?? 'motivator',
        clubId: r.clubId ? asClubId(r.clubId) : null,
      } satisfies Manager,
    ]),
  );

  const presidentRows = db.select().from(t.presidents).all();
  const presidents = new Map(
    presidentRows.map((r) => [
      asPresidentId(r.id),
      {
        id: asPresidentId(r.id),
        name: r.name,
        age: r.age,
        nationality: r.nationality,
        personality: r.personality as President['personality'],
        reputation: r.reputation,
        exPlayer: r.exPlayer,
        clubId: r.clubId ? asClubId(r.clubId) : null,
      } satisfies President,
    ]),
  );

  const relationRows = db.select().from(t.relationships).all();
  const relationships = new Map<ClubId, Map<string, number>>();
  for (const r of relationRows) {
    const clubId = asClubId(r.clubId);
    const store = relationships.get(clubId) ?? new Map<string, number>();
    store.set(r.pairKey, r.value);
    relationships.set(clubId, store);
  }

  const nationRows = db.select().from(t.nations).all();
  const nations: Nation[] = nationRows.map((r) => ({
    id: asNationId(r.id),
    code: r.code,
    name: r.name,
    euMember: r.euMember,
    homeNationality: r.homeNationality,
    rosterRules: r.rosterRules as RosterRules,
  }));

  // World.leagues is nation-major then tier (see core/types.ts): restore that exact order.
  const nationOrder = new Map(nations.map((n, i) => [n.id as string, i]));
  const leagues: League[] = leagueRows
    .slice()
    .sort(
      (a, b) =>
        (nationOrder.get(a.nationId ?? '') ?? 0) - (nationOrder.get(b.nationId ?? '') ?? 0) ||
        a.tier - b.tier,
    )
    .map((r) => ({
      id: asLeagueId(r.id),
      name: r.name,
      tier: r.tier,
      nationId: r.nationId ? asNationId(r.nationId) : undefined,
      clubIds: clubIdsByLeague.get(r.id) ?? [],
    }));

  const world: World = { leagues, clubs, players, contracts };
  if (nations.length > 0) world.nations = nations;
  if (agencies.length > 0) world.agencies = agencies;
  if (managers.size > 0) world.managers = managers;
  if (presidents.size > 0) world.presidents = presidents;
  if (relationships.size > 0) world.relationships = relationships;
  return world;
}

/** Load the most recent season (by year) with its fixtures. */
export function loadLatestSeason(db: Db): Season | null {
  const seasonRow = db
    .select()
    .from(t.seasons)
    .all()
    .sort((a, b) => b.year - a.year)[0];
  if (!seasonRow) return null;

  const matchRows = db.select().from(t.matches).where(eq(t.matches.seasonId, seasonRow.id)).all();
  const eventRows = db.select().from(t.matchEvents).all();

  const eventsByMatch = new Map<string, MatchEvent[]>();
  for (const e of eventRows) {
    const list = eventsByMatch.get(e.matchId) ?? [];
    list.push({
      minute: e.minute,
      type: e.type as MatchEventType,
      clubId: asClubId(e.clubId),
      playerId: asPlayerId(e.playerId),
      assistId: e.assistId ? asPlayerId(e.assistId) : null,
      subOutId: e.subOutId ? asPlayerId(e.subOutId) : null,
    });
    eventsByMatch.set(e.matchId, list);
  }

  const fixtures: Match[] = matchRows.map((m) => ({
    id: asMatchId(m.id),
    seasonId: asSeasonId(m.seasonId),
    round: m.round,
    homeClubId: asClubId(m.homeClubId),
    awayClubId: asClubId(m.awayClubId),
    played: m.played,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    events: (eventsByMatch.get(m.id) ?? []).sort((a, b) => a.minute - b.minute),
  }));

  return {
    id: asSeasonId(seasonRow.id),
    leagueId: asLeagueId(seasonRow.leagueId),
    year: seasonRow.year,
    rngSeed: seasonRow.rngSeed,
    status: seasonRow.status as SeasonStatus,
    fixtures,
  };
}
