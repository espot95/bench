/**
 * Map the pure domain world/season to and from the SQLite save file.
 * This is the only place that knows about Drizzle. See CLAUDE.md invariants.
 */

import { eq } from 'drizzle-orm';
import type { Attributes } from '../domain/attributes.js';
import {
  asClubId,
  asContractId,
  asLeagueId,
  asMatchId,
  asPlayerId,
  asSeasonId,
} from '../domain/ids.js';
import type { ClubId } from '../domain/ids.js';
import type {
  Club,
  Contract,
  League,
  Match,
  MatchEvent,
  MatchEventType,
  Player,
  Position,
  PreferredFoot,
  Season,
  SeasonStatus,
  World,
} from '../domain/types.js';
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

    tx.insert(t.leagues)
      .values({ id: world.league.id, name: world.league.name, tier: world.league.tier })
      .run();

    // club_id per player, derived from squad membership.
    const clubOfPlayer = new Map<string, ClubId>();
    for (const club of world.clubs.values()) {
      for (const pid of club.playerIds) clubOfPlayer.set(pid, club.id);
    }

    for (const club of world.clubs.values()) {
      tx.insert(t.clubs)
        .values({
          id: club.id,
          leagueId: world.league.id,
          name: club.name,
          shortName: club.shortName,
          reputation: club.reputation,
          stadiumCapacity: club.stadiumCapacity,
          budget: club.budget,
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
          overall: Math.round(player.overall),
          attributes: player.attributes,
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

/** Rebuild the in-memory world from the save file. */
export function loadWorld(db: Db): World {
  const leagueRow = db.select().from(t.leagues).limit(1).all()[0];
  if (!leagueRow) throw new Error('No league in save file');

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
      overall: r.overall,
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
    });
    const player = players.get(asPlayerId(r.playerId));
    if (player) player.contractId = id;
  }

  const clubs = new Map<ClubId, Club>();
  const clubIds: ClubId[] = [];
  for (const r of clubRows) {
    const id = asClubId(r.id);
    clubIds.push(id);
    clubs.set(id, {
      id,
      name: r.name,
      shortName: r.shortName,
      reputation: r.reputation,
      stadiumCapacity: r.stadiumCapacity,
      budget: r.budget,
      elo: r.elo,
      playerIds: playersByClub.get(id) ?? [],
    });
  }

  const league: League = {
    id: asLeagueId(leagueRow.id),
    name: leagueRow.name,
    tier: leagueRow.tier,
    clubIds,
  };

  return { league, clubs, players, contracts };
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
