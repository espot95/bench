/**
 * Drizzle schema for the SQLite save file. One file = one save game.
 * The DB layer lives only here + repository.ts; the rest of the app never sees SQL.
 */

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const nations = sqliteTable('nations', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  euMember: integer('eu_member', { mode: 'boolean' }).notNull(),
  homeNationality: text('home_nationality').notNull(),
  /** RosterRules as JSON. */
  rosterRules: text('roster_rules', { mode: 'json' }).notNull(),
});

export const agencies = sqliteTable('agencies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  reputation: integer('reputation').notNull(),
  size: text('size').notNull(),
  /** AgencyStaff[] as JSON (sub-agents/scouts). */
  staff: text('staff', { mode: 'json' }).notNull(),
});

export const managers = sqliteTable('managers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  nationality: text('nationality').notNull(),
  personality: text('personality', { mode: 'json' }).notNull(),
  morale: real('morale').notNull(), // [0,1] float
  reputation: integer('reputation').notNull(),
  exPlayer: integer('ex_player', { mode: 'boolean' }).notNull(),
  style: text('style'), // CoachStyle (nullable for legacy saves → 'motivator')
  clubId: text('club_id'),
});

export const presidents = sqliteTable('presidents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  nationality: text('nationality').notNull(),
  personality: text('personality', { mode: 'json' }).notNull(),
  reputation: integer('reputation').notNull(),
  exPlayer: integer('ex_player', { mode: 'boolean' }).notNull(),
  clubId: text('club_id'),
});

/** Sparse locker-room relations (GAME_DESIGN par.8 layer 2). Empty container in Fase 0. */
export const relationships = sqliteTable('relationships', {
  clubId: text('club_id').notNull(),
  pairKey: text('pair_key').notNull(), // relationKey(a, b)
  value: real('value').notNull(), // [-1,1] float
});

/** Scouting reports (owner: src/scouting — ARCHITECTURE §6, MODULE_SCOUTING §2). */
export const scoutReports = sqliteTable('scout_reports', {
  playerId: text('player_id').primaryKey(),
  observations: integer('observations').notNull(),
  estimatedOverall: real('estimated_overall').notNull(),
  potentialLow: integer('potential_low').notNull(),
  potentialHigh: integer('potential_high').notNull(),
  personalityGuess: text('personality_guess').notNull(),
  estimatedValue: integer('estimated_value').notNull(),
});

export const leagues = sqliteTable('leagues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tier: integer('tier').notNull(),
  nationId: text('nation_id').references(() => nations.id),
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
  transferBudget: integer('transfer_budget').notNull().default(0),
  wageBudget: integer('wage_budget').notNull().default(0), // weekly wage cap
  cash: integer('cash').notNull().default(0),
  /** FinanceEntry[] ledgers as JSON (empty in Fase 0). */
  incomes: text('incomes', { mode: 'json' }),
  expenses: text('expenses', { mode: 'json' }),
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
  potential: integer('potential').notNull().default(50),
  /** Attributes stored as JSON — compact and flexible for Phase 1. */
  attributes: text('attributes', { mode: 'json' }).notNull(),
  /** Personality traits as JSON (nullable for legacy saves). */
  personality: text('personality', { mode: 'json' }),
  injuryProneness: real('injury_proneness'), // [0,1] float (nullable for legacy)
  morale: real('morale'), // [0,1] float (nullable for legacy)
  trainedClubId: text('trained_club_id'), // club that trained him; null = trained abroad
  agencyId: text('agency_id'), // player's agent; null = self-represented
  rampTotal: integer('ramp_total'), // transferStatus (nullable when not adapting)
  rampRemaining: integer('ramp_remaining'),
  pricePressure: integer('price_pressure'), // stored ×1000
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
  // Extended economics (SPEC §15); all nullable for legacy/plain contracts.
  signingBonus: integer('signing_bonus'),
  bonuses: text('bonuses', { mode: 'json' }),
  agencyId: text('agency_id'),
  agencyCommission: integer('agency_commission'),
  agencyWagePct: real('agency_wage_pct'), // [0,1] float
  merchandisingPct: real('merchandising_pct'), // [0,1] float
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
  subOutId: text('sub_out_id').references(() => players.id),
});

/** Raw DDL, used to initialise a fresh save file without drizzle-kit migrations. */
export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS nations (
    id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
    eu_member INTEGER NOT NULL, home_nationality TEXT NOT NULL, roster_rules TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agencies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, reputation INTEGER NOT NULL, size TEXT NOT NULL,
    staff TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS managers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL, nationality TEXT NOT NULL,
    personality TEXT NOT NULL, morale REAL NOT NULL, reputation INTEGER NOT NULL,
    ex_player INTEGER NOT NULL, style TEXT, club_id TEXT
  );
  CREATE TABLE IF NOT EXISTS presidents (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL, nationality TEXT NOT NULL,
    personality TEXT NOT NULL, reputation INTEGER NOT NULL,
    ex_player INTEGER NOT NULL, club_id TEXT
  );
  CREATE TABLE IF NOT EXISTS relationships (
    club_id TEXT NOT NULL, pair_key TEXT NOT NULL, value REAL NOT NULL,
    PRIMARY KEY (club_id, pair_key)
  );
  CREATE TABLE IF NOT EXISTS scout_reports (
    player_id TEXT PRIMARY KEY, observations INTEGER NOT NULL, estimated_overall REAL NOT NULL,
    potential_low INTEGER NOT NULL, potential_high INTEGER NOT NULL,
    personality_guess TEXT NOT NULL, estimated_value INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, tier INTEGER NOT NULL,
    nation_id TEXT REFERENCES nations(id)
  );
  CREATE TABLE IF NOT EXISTS clubs (
    id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(id),
    name TEXT NOT NULL, short_name TEXT NOT NULL, reputation INTEGER NOT NULL,
    stadium_capacity INTEGER NOT NULL, transfer_budget INTEGER NOT NULL DEFAULT 0,
    wage_budget INTEGER NOT NULL DEFAULT 0, cash INTEGER NOT NULL DEFAULT 0,
    incomes TEXT, expenses TEXT, elo INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, club_id TEXT REFERENCES clubs(id), name TEXT NOT NULL,
    age INTEGER NOT NULL, nationality TEXT NOT NULL, position TEXT NOT NULL,
    preferred_foot TEXT NOT NULL, potential INTEGER NOT NULL DEFAULT 50,
    attributes TEXT NOT NULL, personality TEXT, injury_proneness REAL, morale REAL,
    trained_club_id TEXT, agency_id TEXT,
    ramp_total INTEGER, ramp_remaining INTEGER, price_pressure INTEGER
  );
  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id),
    club_id TEXT NOT NULL REFERENCES clubs(id), wage INTEGER NOT NULL,
    start_year INTEGER NOT NULL, end_year INTEGER NOT NULL,
    signing_bonus INTEGER, bonuses TEXT, agency_id TEXT, agency_commission INTEGER,
    agency_wage_pct REAL, merchandising_pct REAL
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
    player_id TEXT NOT NULL REFERENCES players(id), assist_id TEXT REFERENCES players(id),
    sub_out_id TEXT REFERENCES players(id)
  );
  CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
  CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);
  CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id);
`;
