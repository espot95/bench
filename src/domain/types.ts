/** Core domain entities. Pure data — no behaviour, no I/O. See SPEC.md §1. */

import type { Attributes } from './attributes.js';
import type {
  AgentId,
  ClubId,
  ContractId,
  LeagueId,
  MatchId,
  NationId,
  PlayerId,
  SeasonId,
} from './ids.js';

export type Position = 'GK' | 'DF' | 'MF' | 'FW';
export const POSITIONS: readonly Position[] = ['GK', 'DF', 'MF', 'FW'];

export type PreferredFoot = 'L' | 'R' | 'both';

/**
 * Hidden personality traits in [0,1] (SPEC §11.6). Every trait must have a mechanical
 * effect. Tier A is active now; Tier B is stored but wired to future systems (except
 * `temperament`, active on cards). Tier C (sportsmanship) is not generated yet.
 */
export interface Personality {
  // Tier A — active
  professionalism: number; // aging (primary)
  determination: number; // aging (secondary)
  consistency: number; // match-to-match performance variance
  leadership: number; // captain bonus to team ratings
  temperament: number; // card propensity (§6.4)
  // Tier B — stored, effect wired later (market/contracts/high-stakes)
  ambition: number;
  loyalty: number;
  adaptability: number;
  composure: number;
  // Social axis (SPEC §11.10) — generated now, inert until a morale system exists.
  /** 0 = introvert … 1 = extrovert. A modulator of morale/leadership propagation. */
  socialita: number;
  /** Rare (~4%) flag, orthogonal to `socialita`: unpredictable social dynamics. */
  divergente: boolean;
}

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
  /** Hidden ceiling the player can develop toward (1-100). Used by career progression. */
  potential: number;
  /** Hidden personality traits; drive development/decline (SPEC §11). */
  personality: Personality;
  /** Hidden injury proneness [0,1]; drives injury frequency/severity (SPEC §12). */
  injuryProneness: number;
  /** Individual morale [0,1], neutral 0.5; event-driven state (SPEC §13). */
  morale: number;
  /**
   * Club that developed the player (SPEC §14.2). `null` = trained abroad (foreigner).
   * Optional: legacy/minimal worlds omit it; real generation always sets it.
   * A player is *club-trained* for club X if `trainedClubId === X`; *nation-trained* if
   * `trainedClubId` belongs to a club of that nation.
   */
  trainedClubId?: ClubId | null;
  contractId: ContractId | null;
}

/** Performance bonuses paid at season end per unit/event (SPEC §15). All optional. */
export interface ContractBonuses {
  /** Paid per league appearance. */
  perAppearance?: number;
  /** Paid per goal scored. */
  perGoal?: number;
  /** Paid per assist. */
  perAssist?: number;
  /** Lump paid if the club wins its league. */
  trophy?: number;
  /** Lump paid if the club avoids relegation. */
  survival?: number;
}

export interface Contract {
  id: ContractId;
  playerId: PlayerId;
  clubId: ClubId;
  /** Gross weekly wage (abstract unit). Net ≈ 50% (see `domain/finance.ts`). */
  wage: number;
  startYear: number;
  endYear: number;
  // --- Extended economics (SPEC §15). Optional: legacy/plain contracts omit them. ---
  /** One-off signing bonus to the player (rare). */
  signingBonus?: number;
  /** Objective-based bonuses, paid at season end. */
  bonuses?: ContractBonuses;
  /** The player's agent for this deal (null = no agent / self-represented). */
  agentId?: AgentId | null;
  /** One-off commission paid to the agent at signing. */
  agentCommission?: number;
  /** Agent's recurring cut as a fraction of the wage [0,1]. */
  agentWagePct?: number;
  /** Star merchandising clause: fraction of merch revenue owed to the player (payout suspended). */
  merchandisingPct?: number;
}

export interface Club {
  id: ClubId;
  name: string;
  shortName: string;
  /** 1-100, drives squad strength during generation. */
  reputation: number;
  stadiumCapacity: number;
  budget: number;
  /**
   * Weekly wage budget — the squad's total wages must stay under it (SPEC §15). Optional:
   * legacy worlds omit it (treated as unconstrained). Derived from reputation at generation.
   */
  wageBudget?: number;
  /** Cash available for signing bonuses / commissions (SPEC §15). Optional for legacy worlds. */
  cash?: number;
  /** Dynamic Elo rating; initialised from squad strength. */
  elo: number;
  playerIds: PlayerId[];
}

export interface League {
  id: LeagueId;
  name: string;
  tier: number;
  clubIds: ClubId[];
  /**
   * Nation this division belongs to (SPEC §14). Optional: legacy/minimal worlds omit it
   * and behave as a single anonymous nation. Real generation always sets it.
   */
  nationId?: NationId;
}

/**
 * Registration quotas for a nation's over-21 squad list (SPEC §14.4). Faithful to
 * Serie A-style rules; `enabled = false` disables all quotas (min-age only).
 */
export interface RosterRules {
  /** Whether list quotas are enforced at all. */
  enabled: boolean;
  /** Max players on the over-21 list. */
  listSize: number;
  /** Minimum goalkeepers on the list. */
  minGoalkeepers: number;
  /** Min nation-trained players required on the list (Serie A: 8). */
  minNationTrained: number;
  /** Of which, min club-trained (Serie A: 4). */
  minClubTrained: number;
  /** Players strictly under this age are exempt from the list (U22 unlimited). */
  under22Age: number;
  /**
   * Cap on non-EU players registrable. For a non-EU nation (England) this counts *every*
   * foreigner; for an EU nation (Italy) only extra-comunitari. `null` = uncapped.
   */
  nonEuCap: number | null;
  /** Minimum age to be eligible to play at all. */
  minPlayAge: number;
}

/** A footballing nation: owns leagues (a pyramid), EU status and its roster rules (SPEC §14.1). */
export interface Nation {
  id: NationId;
  /** Short code, e.g. ITA / ENG. */
  code: string;
  name: string;
  /** Whether the nation is an EU member (drives foreigner classification). */
  euMember: boolean;
  /** Nationality code of home-grown players (e.g. ITA for Italy). */
  homeNationality: string;
  rosterRules: RosterRules;
}

export type SeasonStatus = 'scheduled' | 'in_progress' | 'finished';

export type MatchEventType = 'goal' | 'yellow' | 'red' | 'sub' | 'injury';

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
  /**
   * All divisions across all nations, kept flat and ordered (nation-major, then tier).
   * `index 0` = the first nation's top flight. Group by `League.nationId` for a pyramid.
   */
  leagues: League[];
  /** Nations present in the world (SPEC §14). Optional: legacy single-nation worlds omit it. */
  nations?: Nation[];
  clubs: Map<ClubId, Club>;
  players: Map<PlayerId, Player>;
  contracts: Map<ContractId, Contract>;
}

/** The league (division) a club currently plays in. */
export function leagueOfClub(world: World, clubId: ClubId): League {
  const league = world.leagues.find((l) => l.clubIds.includes(clubId));
  if (!league) throw new Error(`Club ${clubId} is not in any league`);
  return league;
}

/** Find a league by id. */
export function leagueById(world: World, leagueId: LeagueId): League {
  const league = world.leagues.find((l) => l.id === leagueId);
  if (!league) throw new Error(`No league ${leagueId}`);
  return league;
}

/** The leagues of one nation, ordered by tier (its pyramid). */
export function leaguesOfNation(world: World, nationId: NationId): League[] {
  return world.leagues.filter((l) => l.nationId === nationId).sort((a, b) => a.tier - b.tier);
}

/** Look up a nation by id, or undefined for legacy worlds / unknown ids. */
export function nationById(world: World, nationId: NationId | undefined): Nation | undefined {
  if (nationId === undefined) return undefined;
  return world.nations?.find((n) => n.id === nationId);
}

/** The nation a club plays in, if the world is nation-aware. */
export function nationOfClub(world: World, clubId: ClubId): Nation | undefined {
  return nationById(world, leagueOfClub(world, clubId).nationId);
}

/**
 * Group leagues into pyramids keyed by nation. Legacy worlds (no nationId) collapse into a
 * single group under an empty key so callers can treat them uniformly.
 */
export function leaguesByNation(world: World): Map<string, League[]> {
  const groups = new Map<string, League[]>();
  for (const league of world.leagues) {
    const key = (league.nationId as string | undefined) ?? '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(league);
    else groups.set(key, [league]);
  }
  for (const bucket of groups.values()) bucket.sort((a, b) => a.tier - b.tier);
  return groups;
}
