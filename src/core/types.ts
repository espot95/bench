/** Core domain entities. Pure data — no behaviour, no I/O. See SPEC.md §1. */

import type { Attributes } from './attributes.js';
import type {
  AgencyId,
  ClubId,
  ContractId,
  LeagueId,
  ManagerId,
  MatchId,
  NationId,
  PlayerId,
  PresidentId,
  SeasonId,
  StaffId,
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
  // NOTE: deliberately NO `overall` field — it is DERIVED via `playerOverall()` in
  // ratings.ts (GAME_DESIGN §1.2), never stored, never persisted.
  /** Hidden ceiling the player can develop toward (1-100). Used by career progression. */
  potential: number;
  /** Hidden personality traits; drive development/decline (SPEC §11). */
  personality: Personality;
  /** Hidden injury proneness [0,1]; drives injury frequency/severity (SPEC §12). */
  injuryProneness: number;
  /** Individual morale [0,1], neutral 0.5; event-driven state (SPEC §13). */
  morale: number;
  /**
   * Player's agency (GAME_DESIGN §3.3). `null` = self-represented (professionalism ≥ 0.8).
   * Optional: legacy worlds omit it.
   */
  agencyId?: AgencyId | null;
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
  /** The agency brokering this deal (null = self-represented). */
  agencyId?: AgencyId | null;
  /** One-off commission paid to the agency at signing. */
  agencyCommission?: number;
  /** Agency's recurring cut as a fraction of the wage [0,1]. */
  agencyWagePct?: number;
  /** Star merchandising clause: fraction of merch revenue owed to the player (payout suspended). */
  merchandisingPct?: number;
}

/** One income/expense ledger entry (GAME_DESIGN §6.2). Data only in Fase 0 — no logic. */
export interface FinanceEntry {
  type: FinanceEntryType;
  /** Positive amount in the abstract money unit (the entry's list decides its sign). */
  amount: number;
  /** Season year the entry belongs to. */
  year: number;
  note?: string;
}

export type FinanceEntryType =
  // incomes
  | 'gate' // biglietteria
  | 'sponsor'
  | 'tv' // diritti TV
  | 'prize' // premi/competizioni
  | 'transfer_out' // cessioni
  // expenses
  | 'wages' // monte ingaggi
  | 'facilities' // costi struttura
  | 'transfer_in' // acquisti
  | 'agency_fees'
  | 'other';

/**
 * A club's financial state (GAME_DESIGN §6.2). Structure only in Fase 0: the ledgers stay
 * empty until the president/finances modules write them.
 */
export interface FinancialState {
  /** Budget for buying players (distinct from wages, GAME_DESIGN §6.2). */
  transferBudget: number;
  /** Weekly wage cap: the squad's total wages must stay under it. */
  wageBudget: number;
  /** Liquid cash for one-off payments (signing bonuses, agency commissions). */
  cash: number;
  /** Income ledger (empty in Fase 0). */
  incomes: FinanceEntry[];
  /** Expense ledger (empty in Fase 0). */
  expenses: FinanceEntry[];
}

export interface Club {
  id: ClubId;
  name: string;
  shortName: string;
  /** 1-100, drives squad strength during generation. */
  reputation: number;
  stadiumCapacity: number;
  /** Finances (GAME_DESIGN §6.2): budgets + ledgers. */
  finances: FinancialState;
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

/** A person employed by an agency: a sub-agent or a scout/observer (GAME_DESIGN §3.3). */
export interface AgencyStaff {
  id: StaffId;
  name: string;
  role: 'agent' | 'scout';
  /** 1-100. */
  reputation: number;
}

/**
 * A players' agency (GAME_DESIGN §3.3, §6.3). Big agencies are rigid and deal in packages;
 * small ones are flexible and float youths on free trials. Data only in Fase 0.
 */
export interface Agency {
  id: AgencyId;
  name: string;
  /** 1-100; drives leverage in negotiation and which clients it can attract. */
  reputation: number;
  /** Agency size: 'big' = rigid/packages, 'small' = elastic/free-trial youths. */
  size: 'big' | 'small';
  /** Players currently represented. */
  clientIds: PlayerId[];
  /** Hired sub-agents and scouts (GAME_DESIGN §3.3 punto 4). Empty until Fase 3. */
  staff: AgencyStaff[];
}

/**
 * A club's head coach (GAME_DESIGN §3.1). Shares the player personality system (§5).
 * Data only in Fase 0 — no AI behaviour.
 */
export interface Manager {
  id: ManagerId;
  name: string;
  age: number;
  nationality: string;
  /** Same hidden trait system as players (GAME_DESIGN §5). */
  personality: Personality;
  /** Individual morale [0,1], neutral 0.5 (GAME_DESIGN §3.1). */
  morale: number;
  /** 1-100; results + history. Drives which benches he can aim for. */
  reputation: number;
  /** Ex-player flag (GAME_DESIGN §3.1): inherits character/history from a playing past. */
  exPlayer: boolean;
  /** Club currently coached; null = free. */
  clubId: ClubId | null;
}

/**
 * A club's owner/chairman (GAME_DESIGN §3.2). Shares the player personality system (§5).
 * Data only in Fase 0 — no AI behaviour.
 */
export interface President {
  id: PresidentId;
  name: string;
  age: number;
  nationality: string;
  /** Same hidden trait system as players (GAME_DESIGN §5): impulsivo vs stratega, ecc. */
  personality: Personality;
  /** 1-100. */
  reputation: number;
  /** Ex-player flag (rarer than for managers). */
  exPlayer: boolean;
  /** Club owned/chaired; null = none. */
  clubId: ClubId | null;
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

// ---------------------------------------------------------------------------
// Future-system containers (GAME_DESIGN §8) — TYPES ONLY in Fase 0, no logic.
// ---------------------------------------------------------------------------

/**
 * Locker-room relationships, layer 2 (GAME_DESIGN §8): SPARSE by design. Only pairs that
 * deviate from neutral are stored; an absent pair IS neutral. Key = `relationKey(a, b)`.
 * Value in [-1, +1] (negative = friction, positive = bond). Empty until the morale module.
 */
export type RelationshipStore = Map<string, number>;

/** Canonical (order-independent) key for a player pair in a RelationshipStore. */
export function relationKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Cultural/linguistic affinity group (GAME_DESIGN §8): a cluster of nationalities with a
 * tunable social-cohesion coefficient. Overlapping groups are intended; the effective bonus
 * between two players is the MAX of shared coefficients, never the sum. Data only in Fase 0.
 */
export interface AffinityGroup {
  id: string;
  name: string;
  /** Nationality codes belonging to the cluster (overlaps with other groups allowed). */
  nationalities: string[];
  /** Social cohesion coefficient [0,1] — "some groups bond more than others". */
  cohesion: number;
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
  /** Player agencies (GAME_DESIGN §3.3). Optional: minimal worlds omit it. */
  agencies?: Agency[];
  /** Head coaches, one per club + free ones (GAME_DESIGN §3.1). Optional. */
  managers?: Map<ManagerId, Manager>;
  /** Club presidents (GAME_DESIGN §3.2). Optional. */
  presidents?: Map<PresidentId, President>;
  clubs: Map<ClubId, Club>;
  players: Map<PlayerId, Player>;
  contracts: Map<ContractId, Contract>;
  /**
   * Locker-room relationships per club (GAME_DESIGN §8 layer 2). Sparse; empty maps (or the
   * absence of a club key) mean "all neutral". No system writes this in Fase 0.
   */
  relationships?: Map<ClubId, RelationshipStore>;
  /** Affinity-group config (GAME_DESIGN §8). Empty in Fase 0; tuned when morale layer 2 lands. */
  affinityGroups?: AffinityGroup[];
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
