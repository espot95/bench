/**
 * Drizzle schema for the SQLite save file. One file = one save game.
 * The DB layer lives only here + repository.ts; the rest of the app never sees SQL.
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const leagues = sqliteTable('leagues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tier: integer('tier').notNull(),
});

export const clubs = sqliteTable('clubs', {
  id: text('id').primaryKey(),
  leagueId: text('league_id')
    .notNull()
    .references(() => leagues.id),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  reputation: integer('reputation').notNull(),
  stadiumCapacity: integer('stadium_capacity').notNull(),
  budget: integer('budget').notNull(),
  elo: integer('elo').notNull(),
});

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  clubId: text('club_id').references(() => clubs.id),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  nationality: text('nationality').notNull(),
  position: text('position').notNull(),
  preferredFoot: text('preferred_foot').notNull(),
  overall: integer('overall').notNull(),
  /** Attributes stored as JSON — compact and flexible for Phase 1. */
  attributes: text('attributes', { mode: 'json' }).notNull(),
});

export const contracts = sqliteTable('contracts', {
  id: text('id').primaryKey(),
  playerId: text('player_id')
    .notNull()
    .references(() => players.id),
  clubId: text('club_id')
    .notNull()
    .references(() => clubs.id),
  wage: integer('wage').notNull(),
  startYear: integer('start_year').notNull(),
  endYear: integer('end_year').notNull(),
});

export const seasons = sqliteTable('seasons', {
  id: text('id').primaryKey(),
  leagueId: text('league_id')
    .notNull()
    .references(() => leagues.id),
  year: integer('year').notNull(),
  rngSeed: integer('rng_seed').notNull(),
  status: text('status').notNull(),
});

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  seasonId: text('season_id')
    .notNull()
    .references(() => seasons.id),
  round: integer('round').notNull(),
  homeClubId: text('home_club_id')
    .notNull()
    .references(() => clubs.id),
  awayClubId: text('away_club_id')
    .notNull()
    .references(() => clubs.id),
  played: integer('played', { mode: 'boolean' }).notNull().default(false),
  homeGoals: integer('home_goals'),
  awayGoals: integer('away_goals'),
});

export const matchEvents = sqliteTable('match_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id')
    .notNull()
    .references(() => matches.id),
  minute: integer('minute').notNull(),
  type: text('type').notNull(),
  clubId: text('club_id')
    .notNull()
    .references(() => clubs.id),
  playerId: text('player_id')
    .notNull()
    .references(() => players.id),
  assistId: text('assist_id').references(() => players.id),
});

/** Raw DDL, used to initialise a fresh save file without drizzle-kit migrations. */
export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, tier INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clubs (
    id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(id),
    name TEXT NOT NULL, short_name TEXT NOT NULL, reputation INTEGER NOT NULL,
    stadium_capacity INTEGER NOT NULL, budget INTEGER NOT NULL, elo INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, club_id TEXT REFERENCES clubs(id), name TEXT NOT NULL,
    age INTEGER NOT NULL, nationality TEXT NOT NULL, position TEXT NOT NULL,
    preferred_foot TEXT NOT NULL, overall INTEGER NOT NULL, attributes TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id),
    club_id TEXT NOT NULL REFERENCES clubs(id), wage INTEGER NOT NULL,
    start_year INTEGER NOT NULL, end_year INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(id),
    year INTEGER NOT NULL, rng_seed INTEGER NOT NULL, status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id),
    round INTEGER NOT NULL, home_club_id TEXT NOT NULL REFERENCES clubs(id),
    away_club_id TEXT NOT NULL REFERENCES clubs(id), played INTEGER NOT NULL DEFAULT 0,
    home_goals INTEGER, away_goals INTEGER
  );
  CREATE TABLE IF NOT EXISTS match_events (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id),
    minute INTEGER NOT NULL, type TEXT NOT NULL, club_id TEXT NOT NULL REFERENCES clubs(id),
    player_id TEXT NOT NULL REFERENCES players(id), assist_id TEXT REFERENCES players(id)
  );
  CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
  CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);
  CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id);
`;
