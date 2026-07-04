/**
 * Off-season progression for a career: promotions/relegations (SPEC §10) + per-attribute
 * aging/personality development, retirements, and youth intake (SPEC §11). Pure +
 * RNG-injected — mutates the world in place, deterministically.
 */

import { attributeKind, clampAttr } from '../domain/attributes.js';
import { type ClubId, type LeagueId, asContractId, asPlayerId } from '../domain/ids.js';
import { computeOverall } from '../domain/ratings.js';
import type { Club, Personality, Player, Position, StandingRow, World } from '../domain/types.js';
import { SQUAD_COMPOSITION, generatePlayer, makeContract } from '../generation/generate-world.js';
import type { Rng } from '../rng/rng.js';

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
  youthCount: number;
}

/**
 * Advance the world by one off-season, given the final standings of each division.
 * Ordered per SPEC §11: age/develop → retire → newgen → promotions/relegations.
 */
export function advanceOffseason(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
  rng: Rng,
  newYear: number,
): OffseasonReport {
  ageAndDevelop(world, rng);
  const retired = retire(world, rng);
  const youthCount = youthIntake(world, rng, newYear);
  const swaps = promoteRelegate(world, standingsByLeague);
  return { swaps, retired, youthCount };
}

// ---------------------------------------------------------------------------
// Promotions / relegations
// ---------------------------------------------------------------------------

export function promoteRelegate(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
): PromotionSwap[] {
  const swaps: PromotionSwap[] = [];

  for (let t = 0; t < world.leagues.length - 1; t++) {
    const upper = world.leagues[t] as (typeof world.leagues)[number];
    const lower = world.leagues[t + 1] as (typeof world.leagues)[number];
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
  const trait = (personality.professionalism + personality.determination) / 2;
  const span = PROGRESSION.PERSONALITY_SPAN;
  return isDecline ? 1 + span / 2 - span * trait : 1 - span / 2 + span * trait;
}

/**
 * Age one player's attributes for a new season. Physical attributes decline at full
 * rate, technical/mental far slower; personality bends the curve; noise diverges
 * identical players; growth never exceeds the player's potential. Overall is derived.
 */
export function developAttributes(player: Player, rng: Rng): void {
  const [lo, hi] = ageDeltaRange(player.age);
  const attrs = player.attributes as unknown as Record<string, number>;

  for (const key of Object.keys(attrs)) {
    const base = rng.uniform(lo, hi);
    const isDecline = base < 0;
    const category =
      isDecline && attributeKind(key) === 'technical' ? PROGRESSION.TECH_DECLINE_FACTOR : 1;
    const delta =
      base * personalityModifier(player.personality, isDecline) * category +
      rng.gaussian(0, PROGRESSION.NOISE_SD);

    let next = (attrs[key] as number) + delta;
    if (next > (attrs[key] as number)) {
      // Growth cannot exceed the potential (nor push a specialist above himself).
      next = Math.min(next, Math.max(attrs[key] as number, player.potential));
    }
    attrs[key] = clampAttr(Math.round(next));
  }

  player.overall = computeOverall(player.position, player.attributes);
}

export function ageAndDevelop(world: World, rng: Rng): void {
  for (const player of world.players.values()) {
    player.age += 1;
    developAttributes(player, rng);
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
    if (!rng.chance(retireProbability(player.age, player.position, player.overall))) continue;
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
  const player = generatePlayer(rng, playerId, position, club.reputation, rng.int(16, 19));
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
