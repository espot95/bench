/**
 * Fictional world generator: 1 league, ~20 clubs, full squads with plausible
 * attributes scaled by club reputation. Deterministic given the Rng. See SPEC.md §1.
 */

import {
  type Attributes,
  type CommonAttributes,
  type GoalkeeperAttributes,
  type OutfieldAttributes,
  clampAttr,
} from '../domain/attributes.js';
import { asClubId, asContractId, asLeagueId, asPlayerId } from '../domain/ids.js';
import { computeOverall } from '../domain/ratings.js';
import type {
  Club,
  Contract,
  League,
  Player,
  Position,
  PreferredFoot,
  World,
} from '../domain/types.js';
import type { Rng } from '../rng/rng.js';
import { CLUB_CITIES, CLUB_SUFFIXES, FIRST_NAMES, LAST_NAMES, NATIONALITIES } from './names.js';

export interface GenerateOptions {
  /** Number of divisions in the pyramid (tier 1 = top). */
  divisions?: number;
  clubsPerDivision?: number;
  squadSize?: number;
  year?: number;
}

const DEFAULTS = {
  divisions: 2,
  clubsPerDivision: 20,
  squadSize: 25,
  year: 2026,
};

const DIVISION_NAMES = ['Prima Divisione', 'Seconda Divisione', 'Terza Divisione'];

/** Squad composition (sums to squadSize when squadSize = 25). */
export const SQUAD_COMPOSITION: Record<Position, number> = { GK: 3, DF: 8, MF: 9, FW: 5 };

/**
 * How much each attribute deviates from the player's centre, by position (1-100 scale).
 * Positive => that role tends to be strong there. Keeps generated players
 * looking specialised (a striker finishes well, tackles poorly).
 */
const OUTFIELD_PROFILE: Record<Exclude<Position, 'GK'>, Partial<OutfieldAttributes>> = {
  DF: { tackling: 15, marking: 15, strength: 10, positioning: 10, finishing: -15, dribbling: -10 },
  MF: { passing: 15, workRate: 10, stamina: 10, decisions: 10, finishing: -5 },
  FW: { finishing: 15, dribbling: 10, pace: 10, composure: 5, tackling: -15, marking: -15 },
};

const GK_PROFILE: Partial<GoalkeeperAttributes> = {
  reflexes: 15,
  handling: 10,
  oneOnOne: 10,
  positioning: 5,
  pace: -15,
  stamina: -10,
};

export function generateWorld(rng: Rng, options: GenerateOptions = {}): World {
  const opts = { ...DEFAULTS, ...options };

  const clubs = new Map<Club['id'], Club>();
  const players = new Map<Player['id'], Player>();
  const contracts = new Map<Contract['id'], Contract>();
  const leagues: League[] = [];
  const usedNames = new Set<string>();

  let clubSeq = 0;
  let playerSeq = 0;
  let contractSeq = 0;

  for (let d = 0; d < opts.divisions; d++) {
    const clubIds: Club['id'][] = [];
    const reputations = spreadReputations(
      rng,
      opts.clubsPerDivision,
      bottomForTier(d),
      rangeForTier(d),
    );
    const clubNames = generateClubNames(rng, opts.clubsPerDivision, usedNames);

    for (let c = 0; c < opts.clubsPerDivision; c++) {
      const clubId = asClubId(`club-${++clubSeq}`);
      clubIds.push(clubId);
      const reputation = reputations[c] as number;
      const playerIds: Player['id'][] = [];

      for (const [position, count] of Object.entries(SQUAD_COMPOSITION) as [Position, number][]) {
        for (let i = 0; i < count; i++) {
          const player = generatePlayer(rng, asPlayerId(`p-${++playerSeq}`), position, reputation);
          const contract = makeContract(
            rng,
            asContractId(`ct-${++contractSeq}`),
            player.id,
            clubId,
            opts.year,
            reputation,
          );
          player.contractId = contract.id;
          players.set(player.id, player);
          contracts.set(contract.id, contract);
          playerIds.push(player.id);
        }
      }

      clubs.set(clubId, {
        id: clubId,
        name: clubNames[c] as string,
        shortName: shortNameFor(clubNames[c] as string),
        reputation,
        stadiumCapacity: 8000 + Math.round((reputation / 100) * 55000),
        budget: Math.round((reputation / 100) * 100_000_000),
        elo: 1500, // set properly by engine.initialiseElo once all clubs exist
        playerIds,
      });
    }

    leagues.push({
      id: asLeagueId(`league-${d + 1}`),
      name: DIVISION_NAMES[d] ?? `Divisione ${d + 1}`,
      tier: d + 1,
      clubIds,
    });
  }

  return { leagues, clubs, players, contracts };
}

/** Bottom reputation of a tier: lower tiers sit lower (with overlap to the tier above). */
function bottomForTier(tier: number): number {
  return Math.max(15, 42 - tier * 14);
}

/** Reputation spread of a tier: top = bottom + range. */
function rangeForTier(tier: number): number {
  return Math.max(30, 55 - tier * 17);
}

/**
 * Reputation values with a convex (top-heavy) shape: a clear elite at the top,
 * a compressed chasing pack. `rank` runs 1 (best) -> 0 (worst); the exponent > 1
 * separates the leaders and bunches the rest — like a real division.
 */
function spreadReputations(rng: Rng, n: number, bottom: number, range: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const rank = (n - 1 - i) / Math.max(1, n - 1);
    const base = bottom + range * rank ** 2.0;
    out.push(Math.round(clampReputation(base + rng.gaussian(0, 2.5))));
  }
  return out;
}

function clampReputation(x: number): number {
  return Math.max(20, Math.min(95, x));
}

/**
 * Generate one player for a club of the given reputation. `ageOverride` forces an
 * age (used to spawn youth prospects); otherwise a peak-centred age is drawn.
 */
export function generatePlayer(
  rng: Rng,
  id: Player['id'],
  position: Position,
  reputation: number,
  ageOverride?: number,
): Player {
  // Club centre from reputation; player centre adds star-quality variance (1-100 scale).
  // Wide mapping so the league has a genuine elite and clear strugglers.
  const clubCentre = 22.5 + (reputation / 100) * 60; // rep 42 -> ~48, rep 97 -> ~81
  const playerCentre = clubCentre + rng.gaussian(0, 6.5);

  const attributes = generateAttributes(rng, position, playerCentre);
  const overall = computeOverall(position, attributes);
  const age = ageOverride ?? generateAge(rng);

  return {
    id,
    name: uniqueFullName(rng),
    age,
    nationality: rng.pick(NATIONALITIES),
    position,
    preferredFoot: pickFoot(rng),
    attributes,
    overall,
    potential: computePotential(rng, overall, age),
    personality: {
      professionalism: rng.uniform(0, 1),
      determination: rng.uniform(0, 1),
      leadership: rng.uniform(0, 1),
      ambition: rng.uniform(0, 1),
    },
    contractId: null,
  };
}

/** Hidden ceiling: young players have headroom above their current overall. */
function computePotential(rng: Rng, overall: number, age: number): number {
  const headroom = Math.max(0, 23 - age) * rng.uniform(0.5, 2.5);
  return Math.round(Math.max(overall, Math.min(99, overall + headroom + rng.gaussian(0, 2))));
}

function generateAttributes(rng: Rng, position: Position, centre: number): Attributes {
  const common = (bonus: Partial<CommonAttributes> = {}): CommonAttributes => ({
    pace: attr(rng, centre, bonus.pace),
    stamina: attr(rng, centre, bonus.stamina),
    strength: attr(rng, centre, bonus.strength),
    workRate: attr(rng, centre, bonus.workRate),
    positioning: attr(rng, centre, bonus.positioning),
    decisions: attr(rng, centre, bonus.decisions),
    composure: attr(rng, centre, bonus.composure),
  });

  if (position === 'GK') {
    const p = GK_PROFILE;
    return {
      ...common(p),
      reflexes: attr(rng, centre, p.reflexes),
      handling: attr(rng, centre, p.handling),
      aerial: attr(rng, centre, p.aerial),
      oneOnOne: attr(rng, centre, p.oneOnOne),
    } satisfies GoalkeeperAttributes;
  }

  const p = OUTFIELD_PROFILE[position];
  return {
    ...common(p),
    finishing: attr(rng, centre, p.finishing),
    passing: attr(rng, centre, p.passing),
    tackling: attr(rng, centre, p.tackling),
    dribbling: attr(rng, centre, p.dribbling),
    marking: attr(rng, centre, p.marking),
  } satisfies OutfieldAttributes;
}

function attr(rng: Rng, centre: number, bonus = 0): number {
  return Math.round(clampAttr(centre + bonus + rng.gaussian(0, 8.5)));
}

function generateAge(rng: Rng): number {
  // Peak around 24-27, tails to 17 and 35.
  return Math.max(17, Math.min(35, Math.round(rng.gaussian(25, 4))));
}

function pickFoot(rng: Rng): PreferredFoot {
  const x = rng.next();
  if (x < 0.62) return 'R';
  if (x < 0.9) return 'L';
  return 'both';
}

export function makeContract(
  rng: Rng,
  id: Contract['id'],
  playerId: Player['id'],
  clubId: Club['id'],
  year: number,
  reputation: number,
): Contract {
  const wage = Math.round((5000 + (reputation / 100) * 120_000) * rng.uniform(0.6, 1.4));
  return {
    id,
    playerId,
    clubId,
    wage,
    startYear: year,
    endYear: year + rng.int(1, 4),
  };
}

function uniqueFullName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

function generateClubNames(rng: Rng, count: number, used: Set<string>): string[] {
  const names: string[] = [];
  let guard = 0;
  while (names.length < count && guard < count * 50) {
    guard++;
    const name = `${rng.pick(CLUB_CITIES)} ${rng.pick(CLUB_SUFFIXES)}`;
    if (used.has(name)) continue;
    used.add(name);
    names.push(name);
  }
  // Fallback if the pool is exhausted: append an index.
  while (names.length < count) names.push(`Club ${names.length + 1}`);
  return names;
}

function shortNameFor(name: string): string {
  const city = name.split(' ')[0] ?? name;
  return city.slice(0, 3).toUpperCase();
}
