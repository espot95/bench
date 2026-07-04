/** Core domain entities. Pure data — no behaviour, no I/O. See SPEC.md §1. */

import type { Attributes } from './attributes.js';
import type { ClubId, ContractId, LeagueId, MatchId, PlayerId, SeasonId } from './ids.js';

export type Position = 'GK' | 'DF' | 'MF' | 'FW';
export const POSITIONS: readonly Position[] = ['GK', 'DF', 'MF', 'FW'];

export type PreferredFoot = 'L' | 'R' | 'both';

export interface Player {
  id: PlayerId;
  name: string;
  age: number;
  nationality: string;
  position: Position;
  preferredFoot: PreferredFoot;
  attributes: Attributes;
  /** Derived from attributes via ratings.ts; stored for convenience. */
  overall: number;
  contractId: ContractId | null;
}

export interface Contract {
  id: ContractId;
  playerId: PlayerId;
  clubId: ClubId;
  wage: number;
  startYear: number;
  endYear: number;
}

export interface Club {
  id: ClubId;
  name: string;
  shortName: string;
  /** 1-100, drives squad strength during generation. */
  reputation: number;
  stadiumCapacity: number;
  budget: number;
  /** Dynamic Elo rating; initialised from squad strength. */
  elo: number;
  playerIds: PlayerId[];
}

export interface League {
  id: LeagueId;
  name: string;
  tier: number;
  clubIds: ClubId[];
}

export type SeasonStatus = 'scheduled' | 'in_progress' | 'finished';

export type MatchEventType = 'goal' | 'yellow' | 'red' | 'sub';

/** A single in-match event (goal/card/substitution). See SPEC.md §6.4-§6.6. */
export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  clubId: ClubId;
  /** Goal: scorer. Card: booked player. Sub: player coming ON. */
  playerId: PlayerId;
  /** Assisting player for a goal, if any; null for cards and unassisted goals. */
  assistId: PlayerId | null;
  /** For a substitution: the player going OFF. Null otherwise. */
  subOutId: PlayerId | null;
}

export interface Match {
  id: MatchId;
  seasonId: SeasonId;
  round: number;
  homeClubId: ClubId;
  awayClubId: ClubId;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  /** Narrative events over the scoreline (scorers, assists, cards). See SPEC.md §6.4. */
  events: MatchEvent[];
}

export interface Season {
  id: SeasonId;
  leagueId: LeagueId;
  year: number;
  rngSeed: number;
  status: SeasonStatus;
  fixtures: Match[];
}

export interface StandingRow {
  clubId: ClubId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/** A fully materialised world: everything needed to simulate. */
export interface World {
  league: League;
  clubs: Map<ClubId, Club>;
  players: Map<PlayerId, Player>;
  contracts: Map<ContractId, Contract>;
}
