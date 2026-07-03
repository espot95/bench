/**
 * Rating derivation: player overall + team attack/defense strength.
 * Pure functions over domain data. See SPEC.md §2.
 */

import { type Attributes, isGoalkeeperAttributes } from './attributes.js';
import type { Club, Player, Position, World } from './types.js';

/** Per-position attribute weights used to compute a player's overall (1-100). */
type WeightMap = Partial<Record<keyof Attributes | string, number>>;

const OUTFIELD_WEIGHTS: Record<Exclude<Position, 'GK'>, WeightMap> = {
  DF: {
    tackling: 5,
    marking: 5,
    positioning: 4,
    decisions: 3,
    strength: 3,
    pace: 3,
    composure: 2,
    passing: 2,
    stamina: 2,
    workRate: 2,
    dribbling: 1,
    finishing: 1,
  },
  MF: {
    passing: 5,
    decisions: 4,
    positioning: 3,
    workRate: 3,
    stamina: 3,
    tackling: 3,
    dribbling: 3,
    composure: 3,
    pace: 2,
    finishing: 2,
    marking: 2,
    strength: 2,
  },
  FW: {
    finishing: 5,
    dribbling: 4,
    pace: 4,
    composure: 3,
    decisions: 3,
    positioning: 3,
    passing: 2,
    strength: 2,
    workRate: 2,
    stamina: 2,
    marking: 1,
    tackling: 1,
  },
};

const GK_WEIGHTS: WeightMap = {
  reflexes: 5,
  handling: 4,
  oneOnOne: 4,
  positioning: 4,
  aerial: 3,
  decisions: 3,
  composure: 3,
  strength: 2,
  pace: 1,
  stamina: 1,
  workRate: 1,
};

function weightedOverall(attrs: Attributes, weights: WeightMap): number {
  let sum = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (weight === undefined) continue;
    const value = (attrs as unknown as Record<string, number>)[key];
    if (value === undefined) continue;
    sum += value * weight;
    weightSum += weight;
  }
  return weightSum === 0 ? 0 : sum / weightSum;
}

/** Player overall on the 1-100 scale, derived from attributes + position. */
export function computeOverall(position: Position, attrs: Attributes): number {
  if (position === 'GK') {
    if (!isGoalkeeperAttributes(attrs)) {
      throw new Error('GK player must have goalkeeper attributes');
    }
    return round1(weightedOverall(attrs, GK_WEIGHTS));
  }
  if (isGoalkeeperAttributes(attrs)) {
    throw new Error('Outfield player must have outfield attributes');
  }
  return round1(weightedOverall(attrs, OUTFIELD_WEIGHTS[position]));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Default formation for picking a starting XI. See SPEC.md §2.2. */
export const DEFAULT_FORMATION: Record<Position, number> = {
  GK: 1,
  DF: 4,
  MF: 4,
  FW: 2,
};

/**
 * Contribution weights of each line to attack vs defense strength.
 * Attack leans on FW/MF, defense on GK/DF. See SPEC.md §2.2.
 */
const ATTACK_LINE_WEIGHTS: Record<Position, number> = { GK: 0.2, DF: 0.6, MF: 1.0, FW: 1.4 };
const DEFENSE_LINE_WEIGHTS: Record<Position, number> = { GK: 1.3, DF: 1.4, MF: 0.9, FW: 0.4 };

export interface TeamStrength {
  attack: number;
  defense: number;
  /** Overall squad strength scalar (mean of best XI overalls). */
  overall: number;
}

/** Pick the best XI from a club's squad according to DEFAULT_FORMATION. */
export function selectStartingXI(club: Club, world: World): Player[] {
  const byPosition = new Map<Position, Player[]>();
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    if (!p) continue;
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  }

  const xi: Player[] = [];
  for (const pos of ['GK', 'DF', 'MF', 'FW'] as Position[]) {
    const need = DEFAULT_FORMATION[pos];
    const pool = (byPosition.get(pos) ?? []).slice().sort((a, b) => b.overall - a.overall);
    xi.push(...pool.slice(0, need));
  }
  return xi;
}

/** Attack/defense/overall strength for a club, from its best XI. */
export function computeTeamStrength(club: Club, world: World): TeamStrength {
  const xi = selectStartingXI(club, world);
  if (xi.length === 0) {
    throw new Error(`Club ${club.name} has no players to field`);
  }

  let attackNum = 0;
  let attackDen = 0;
  let defenseNum = 0;
  let defenseDen = 0;
  let overallSum = 0;

  for (const p of xi) {
    const aw = ATTACK_LINE_WEIGHTS[p.position];
    const dw = DEFENSE_LINE_WEIGHTS[p.position];
    attackNum += p.overall * aw;
    attackDen += aw;
    defenseNum += p.overall * dw;
    defenseDen += dw;
    overallSum += p.overall;
  }

  return {
    attack: attackNum / attackDen,
    defense: defenseNum / defenseDen,
    overall: overallSum / xi.length,
  };
}
