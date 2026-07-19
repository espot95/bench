/**
 * Off-season progression for a career: promotions/relegations (SPEC §10) + per-attribute
 * aging/personality development, retirements, and youth intake (SPEC §11). Pure +
 * RNG-injected — mutates the world in place, deterministically.
 */

import { attributeKind, clampAttr } from '../core/attributes.js';
import { type ClubId, type LeagueId, asContractId, asPlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import {
  type Club,
  type League,
  type Personality,
  type Player,
  type Position,
  type StandingRow,
  type World,
  leaguesByNation,
} from '../core/types.js';
import { applyBudgetPolicy, runWorldEconomy } from '../finances/season-economy.js';
import type { ClubSeasonAccounts } from '../finances/season-economy.js';
import { SQUAD_COMPOSITION, generatePlayer, makeContract } from '../generation/generate-world.js';
import type { Rng } from '../rng/rng.js';
import { COACH_DEV, coachDevBoost } from './coach-styles.js';

/** Aging/personality tuning (SPEC §11), on the 1-100 attribute scale. */
const PROGRESSION = {
  /** Attenuation of the *decline* on technical/mental attributes (physical = 1.0). */
  TECH_DECLINE_FACTOR: 0.4,
  /** Per-attribute per-year random noise, so identical players diverge. */
  NOISE_SD: 0.8,
  /** Personality effect strength on growth/decline. */
  PERSONALITY_SPAN: 0.8,
  /** Retirement: outfield players start ageing out here, keepers later. */
  RETIRE_START_OUTFIELD: 33,
  RETIRE_START_GK: 35,
  RETIRE_SLOPE: 0.15,
  /** Weak veterans (low overall) are more likely to hang up the boots. */
  WEAK_VETERAN_OVERALL: 50,
  WEAK_VETERAN_AGE: 31,
  WEAK_VETERAN_BONUS: 0.25,
  RETIRE_CERTAIN_AGE: 40,
} as const;

/** Clubs promoted/relegated between adjacent divisions each season. */
const PROMO_COUNT = 3;

export interface PromotionSwap {
  /** Lower division tier (the one clubs are promoted FROM / relegated TO). */
  lowerTier: number;
  promoted: ClubId[];
  relegated: ClubId[];
}

export interface OffseasonReport {
  swaps: PromotionSwap[];
  retired: { player: Player; clubId: ClubId }[];
  /** Players whose contracts the (passive) AI did not renew — they left their club (SPEC §15). */
  released: Player[];
  youthCount: number;
  /** Season accounts per club (GAME_DESIGN §6.2), settled by the finances module. */
  accounts: ClubSeasonAccounts[];
}

/**
 * Advance the world by one off-season, given the final standings of each division.
 * Ordered per SPEC §11/§15: age/develop → retire → contract renew/release → newgen →
 * promotions/relegations. Released players leave `world.players`; youth backfills the gaps, so
 * the total stays constant.
 */
export function advanceOffseason(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
  rng: Rng,
  newYear: number,
): OffseasonReport {
  // Books first: the season just played is settled on its final standings and OLD wages
  // (GAME_DESIGN §6.2, MODULE_FINANCES §1). Budgets are set at the end, on the NEW bill.
  const accounts = runWorldEconomy(world, standingsByLeague, newYear - 1);
  ageAndDevelop(world, rng, buildCoachInfluence(world, standingsByLeague));
  const retired = retire(world, rng);
  const released = renewOrRelease(world, rng, newYear);
  const youthCount = youthIntake(world, rng, newYear);
  const swaps = promoteRelegate(world, standingsByLeague);
  const presidentsByClub = new Map(
    [...(world.presidents?.values() ?? [])]
      .filter((pr) => pr.clubId !== null)
      .map((pr) => [pr.clubId as ClubId, pr]),
  );
  applyBudgetPolicy(world, accounts, presidentsByClub);
  return { swaps, retired, released, youthCount, accounts };
}

/**
 * "Bottega" influence per club (MODULE_MANAGER §6): coach style/charisma × results factor
 * (expected rank by reputation vs final rank — the overperformer teaches more).
 */
function buildCoachInfluence(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
): Map<ClubId, (attr: string, position: Player['position'], age: number) => number> {
  const out = new Map<
    ClubId,
    (attr: string, position: Player['position'], age: number) => number
  >();
  const coaches = [...(world.managers?.values() ?? [])].filter((m) => m.clubId !== null);
  if (coaches.length === 0) return out;
  const coachByClub = new Map(coaches.map((m) => [m.clubId as ClubId, m]));

  for (const league of world.leagues) {
    const table = standingsByLeague.get(league.id);
    if (!table) continue;
    const expected = [...league.clubIds]
      .map((id) => ({ id, rep: world.clubs.get(id)?.reputation ?? 0 }))
      .sort((a, b) => b.rep - a.rep);
    const expectedRank = new Map(expected.map((e, i) => [e.id, i]));
    table.forEach((row, finalRank) => {
      const coach = coachByClub.get(row.clubId);
      if (!coach) return;
      const exp = expectedRank.get(row.clubId) ?? finalRank;
      const results = Math.max(
        COACH_DEV.RESULTS_MIN,
        Math.min(COACH_DEV.RESULTS_MAX, 1 + (0.5 * (exp - finalRank)) / 10),
      );
      out.set(row.clubId, coachDevBoost(coach, results));
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Promotions / relegations
// ---------------------------------------------------------------------------

export function promoteRelegate(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
): PromotionSwap[] {
  const swaps: PromotionSwap[] = [];

  // Promotions/relegations happen *within* each nation's pyramid (SPEC §14.1), never across.
  for (const pyramid of leaguesByNation(world).values()) {
    for (let t = 0; t < pyramid.length - 1; t++) {
      const upper = pyramid[t] as League;
      const lower = pyramid[t + 1] as League;
      const upperTable = standingsByLeague.get(upper.id);
      const lowerTable = standingsByLeague.get(lower.id);
      if (!upperTable || !lowerTable) continue;

      const relegated = upperTable.slice(-PROMO_COUNT).map((r) => r.clubId);
      const promoted = lowerTable.slice(0, PROMO_COUNT).map((r) => r.clubId);
      const relSet = new Set(relegated);
      const promSet = new Set(promoted);

      upper.clubIds = upper.clubIds.filter((id) => !relSet.has(id)).concat(promoted);
      lower.clubIds = lower.clubIds.filter((id) => !promSet.has(id)).concat(relegated);
      swaps.push({ lowerTier: lower.tier, promoted, relegated });
    }
  }
  return swaps;
}

// ---------------------------------------------------------------------------
// Aging & development
// ---------------------------------------------------------------------------

/** Base per-attribute delta range [min, max] for an age, from the curve (SPEC §11). */
function ageDeltaRange(age: number): [number, number] {
  if (age <= 20) return [3, 6];
  if (age <= 24) return [1, 3];
  if (age <= 28) return [0, 1];
  if (age <= 31) return [-3, -1];
  return [-6, -3];
}

/**
 * Personality modifier, sign-aware: high professionalism/determination grows faster
 * (closer to potential) and declines slower. See SPEC §11 (design note).
 */
function personalityModifier(personality: Personality, isDecline: boolean): number {
  // Professionalism primary, determination secondary (SPEC §11.2).
  const trait = 0.7 * personality.professionalism + 0.3 * personality.determination;
  const span = PROGRESSION.PERSONALITY_SPAN;
  return isDecline ? 1 + span / 2 - span * trait : 1 - span / 2 + span * trait;
}

/**
 * Age one player's attributes for a new season. Physical attributes decline at full
 * rate, technical/mental far slower; personality bends the curve; noise diverges
 * identical players; growth never exceeds the player's potential. Overall is derived.
 */
export function developAttributes(
  player: Player,
  rng: Rng,
  coachBoost?: (attr: string, position: Player['position'], age: number) => number,
): void {
  const [lo, hi] = ageDeltaRange(player.age);
  const attrs = player.attributes as unknown as Record<string, number>;

  for (const key of Object.keys(attrs)) {
    const base = rng.uniform(lo, hi);
    const isDecline = base < 0;
    const category =
      isDecline && attributeKind(key) === 'technical' ? PROGRESSION.TECH_DECLINE_FACTOR : 1;
    // La bottega dell'allenatore (MODULE_MANAGER §6): additiva, mai oltre il potenziale (clamp sotto).
    const bottega = coachBoost ? coachBoost(key, player.position, player.age) : 0;
    const delta =
      base * personalityModifier(player.personality, isDecline) * category +
      bottega +
      rng.gaussian(0, PROGRESSION.NOISE_SD);

    let next = (attrs[key] as number) + delta;
    if (next > (attrs[key] as number)) {
      // Growth cannot exceed the potential (nor push a specialist above himself).
      next = Math.min(next, Math.max(attrs[key] as number, player.potential));
    }
    attrs[key] = clampAttr(Math.round(next));
  }

  // Overall is derived (GAME_DESIGN §1.2): nothing to update here.
}

export function ageAndDevelop(
  world: World,
  rng: Rng,
  influence?: Map<ClubId, (attr: string, position: Player['position'], age: number) => number>,
): void {
  const clubOf = new Map<string, ClubId>();
  if (influence) {
    for (const club of world.clubs.values()) {
      for (const pid of club.playerIds) clubOf.set(pid, club.id);
    }
  }
  for (const player of world.players.values()) {
    player.age += 1;
    const clubId = clubOf.get(player.id);
    const boost = clubId !== undefined ? influence?.get(clubId) : undefined;
    developAttributes(player, rng, boost);
  }
}

// ---------------------------------------------------------------------------
// Retirements
// ---------------------------------------------------------------------------

/** Probability a player retires this off-season, by age and (low) rating. See SPEC §11. */
export function retireProbability(age: number, position: Position, overall: number): number {
  if (age >= PROGRESSION.RETIRE_CERTAIN_AGE) return 1;
  const start = position === 'GK' ? PROGRESSION.RETIRE_START_GK : PROGRESSION.RETIRE_START_OUTFIELD;
  let p = age >= start ? (age - start + 1) * PROGRESSION.RETIRE_SLOPE : 0;
  if (overall < PROGRESSION.WEAK_VETERAN_OVERALL && age >= PROGRESSION.WEAK_VETERAN_AGE) {
    p += PROGRESSION.WEAK_VETERAN_BONUS;
  }
  return Math.min(1, p);
}

export function retire(world: World, rng: Rng): { player: Player; clubId: ClubId }[] {
  const clubOfPlayer = new Map<string, ClubId>();
  for (const club of world.clubs.values()) {
    for (const pid of club.playerIds) clubOfPlayer.set(pid, club.id);
  }

  const retired: { player: Player; clubId: ClubId }[] = [];
  for (const player of [...world.players.values()]) {
    if (!rng.chance(retireProbability(player.age, player.position, playerOverall(player))))
      continue;
    const clubId = clubOfPlayer.get(player.id);
    if (clubId) {
      const club = world.clubs.get(clubId);
      if (club) club.playerIds = club.playerIds.filter((id) => id !== player.id);
      retired.push({ player, clubId });
    }
    if (player.contractId) world.contracts.delete(player.contractId);
    world.players.delete(player.id);
  }
  return retired;
}

// ---------------------------------------------------------------------------
// Contract renewal / release (SPEC §15, passive AI)
// ---------------------------------------------------------------------------

const MARKET = {
  /** Max non-renewals per club per off-season (keeps churn realistic). */
  MAX_RELEASE_PER_CLUB: 2,
  /** How far below the squad average overall counts a player as "fringe". */
  WEAK_MARGIN: 8,
  /** Non-renewal probability by profile (only expiring contracts are candidates). */
  RELEASE_PROB_OLD_WEAK: 0.6,
  RELEASE_PROB_OLD: 0.3,
  RELEASE_PROB_WEAK: 0.2,
  RELEASE_PROB_OTHER: 0.04,
  RELEASE_OLD_AGE: 31,
} as const;

/**
 * Process expiring contracts with a passive AI (SPEC §15.0): renew most, let a few lapse.
 * Released players **leave `world.players`** (their gap is backfilled by youth intake, so the
 * total is unchanged); they are returned so the transfer window can offer them to the user.
 */
export function renewOrRelease(world: World, rng: Rng, newYear: number): Player[] {
  const released: Player[] = [];
  for (const club of world.clubs.values()) {
    const squad = club.playerIds
      .map((id) => world.players.get(id))
      .filter((p): p is Player => p !== undefined);
    const avg = squad.reduce((s, p) => s + playerOverall(p), 0) / Math.max(1, squad.length);

    let releasedCount = 0;
    for (const pid of [...club.playerIds]) {
      const player = world.players.get(pid);
      if (!player?.contractId) continue;
      const contract = world.contracts.get(player.contractId);
      if (!contract || contract.endYear >= newYear) continue; // not expired

      if (
        releasedCount < MARKET.MAX_RELEASE_PER_CLUB &&
        rng.chance(releaseProbability(player, avg))
      ) {
        releasePlayer(world, club, player);
        released.push(player);
        releasedCount++;
      } else {
        renewContract(contract, player, newYear, rng, club.finances.cash < 0);
      }
    }
  }
  return released;
}

function releaseProbability(player: Player, squadAvg: number): number {
  const old = player.age >= MARKET.RELEASE_OLD_AGE;
  const weak = playerOverall(player) < squadAvg - MARKET.WEAK_MARGIN;
  if (old && weak) return MARKET.RELEASE_PROB_OLD_WEAK;
  if (old) return MARKET.RELEASE_PROB_OLD;
  if (weak) return MARKET.RELEASE_PROB_WEAK;
  return MARKET.RELEASE_PROB_OTHER;
}

function renewContract(
  contract: { startYear: number; endYear: number; wage: number },
  player: Player,
  newYear: number,
  rng: Rng,
  austerity: boolean,
): void {
  const term = player.age < 24 ? rng.int(3, 5) : player.age < 30 ? rng.int(2, 4) : rng.int(1, 2);
  contract.startYear = newYear;
  contract.endYear = newYear + term - 1;
  // Neutral drift when healthy; pay cuts when the club is in the red (MODULE_FINANCES §2).
  const mult = austerity ? rng.uniform(0.8, 0.95) : rng.uniform(0.9, 1.1);
  contract.wage = Math.max(1, Math.round(contract.wage * mult));
}

/** Remove a player from his club and from the world (he becomes a released free agent). */
function releasePlayer(world: World, club: Club, player: Player): void {
  club.playerIds = club.playerIds.filter((id) => id !== player.id);
  if (player.contractId) world.contracts.delete(player.contractId);
  if (player.agencyId && world.agencies) {
    const agent = world.agencies.find((a) => a.id === player.agencyId);
    if (agent) agent.clientIds = agent.clientIds.filter((id) => id !== player.id);
  }
  world.players.delete(player.id);
}

// ---------------------------------------------------------------------------
// Youth intake
// ---------------------------------------------------------------------------

/** Refill each squad back to the standard composition with young prospects. */
export function youthIntake(world: World, rng: Rng, year: number): number {
  let created = 0;
  for (const club of world.clubs.values()) {
    const counts = countByPosition(club, world);
    for (const [position, target] of Object.entries(SQUAD_COMPOSITION) as [Position, number][]) {
      const need = target - (counts[position] ?? 0);
      for (let i = 0; i < need; i++) {
        created++;
        addYouth(world, club, position, rng, year, created);
      }
    }
  }
  return created;
}

function addYouth(
  world: World,
  club: Club,
  position: Position,
  rng: Rng,
  year: number,
  seq: number,
): void {
  const playerId = asPlayerId(`p-y${year}-${seq}`);
  // Academy graduates skew to the nation and are club-trained (SPEC §14.2), sustaining the
  // home-grown pool across seasons. Look up the nation without throwing on minimal worlds.
  const league = world.leagues.find((l) => l.clubIds.includes(club.id));
  const home = league?.nationId
    ? world.nations?.find((n) => n.id === league.nationId)?.homeNationality
    : undefined;
  const nationality = home && rng.chance(0.7) ? home : undefined;
  const player = generatePlayer(
    rng,
    playerId,
    position,
    club.reputation,
    rng.int(16, 19),
    nationality,
  );
  player.trainedClubId = club.id;
  const contract = makeContract(
    rng,
    asContractId(`ct-y${year}-${seq}`),
    playerId,
    club.id,
    year,
    club.reputation,
  );
  player.contractId = contract.id;
  world.players.set(playerId, player);
  world.contracts.set(contract.id, contract);
  club.playerIds.push(playerId);
}

function countByPosition(club: Club, world: World): Partial<Record<Position, number>> {
  const counts: Partial<Record<Position, number>> = {};
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    if (p) counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  return counts;
}
