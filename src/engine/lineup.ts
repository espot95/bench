/**
 * Player-manager lineups: assign players to explicit 4-4-2 slots and derive team
 * strength from their rating IN THE SLOT they play. Out-of-position players are
 * penalised, so both weak reserves and wrong roles hurt. See SPEC.md §9.
 */

import { isGoalkeeperAttributes } from '../domain/attributes.js';
import type { PlayerId } from '../domain/ids.js';
import {
  type TeamStrength,
  computeOverall,
  computeStrengthFromSlots,
  selectStartingXI,
} from '../domain/ratings.js';
import type { Club, Player, Position, World } from '../domain/types.js';

/** The fixed 4-4-2 shape: one slot per listed position. */
export const LINEUP_SHAPE: readonly Position[] = [
  'GK',
  'DF',
  'DF',
  'DF',
  'DF',
  'MF',
  'MF',
  'MF',
  'MF',
  'FW',
  'FW',
];

/** Rating multiplier for a keeper↔outfield mismatch (totally out of position). */
const OOP_GK_PENALTY = 0.3;

/** A user's slot assignment: exactly 11 (slot, player) pairs. */
export type SlotAssignment = { slot: Position; playerId: PlayerId }[];

/** A player's effective rating when played in `slot`. See SPEC.md §9.2. */
export function effectiveOverall(player: Player, slot: Position): number {
  if (player.position === slot) return player.overall;
  const gkSlot = slot === 'GK';
  const gkPlayer = isGoalkeeperAttributes(player.attributes);
  if (gkSlot === gkPlayer) {
    // Both outfield (or both GK, which the first check already covered): re-rate in the slot.
    return computeOverall(slot, player.attributes);
  }
  // Keeper played outfield, or outfielder played in goal.
  return Math.max(1, player.overall * OOP_GK_PENALTY);
}

export interface Replacement {
  out: Player;
  in: Player;
  slot: Position;
}

export interface Fielded {
  /** The 11 players actually on the pitch. */
  players: Player[];
  /** Their slots (parallel to a strength computation). */
  entries: { player: Player; slot: Position }[];
  strength: TeamStrength;
  /** Auto-replacements applied because an assigned player was unavailable. */
  replacements: Replacement[];
}

function playersOf(club: Club, world: World): Player[] {
  return club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined);
}

function strengthOf(entries: { player: Player; slot: Position }[]): TeamStrength {
  return computeStrengthFromSlots(
    entries.map((e) => ({ overall: effectiveOverall(e.player, e.slot), slot: e.slot })),
  );
}

/** Field a club's best natural XI (opponents / default). Slots = natural positions. */
export function naturalFielded(
  club: Club,
  world: World,
  unavailable?: ReadonlySet<PlayerId>,
): Fielded {
  const xi = selectStartingXI(club, world, unavailable);
  const entries = xi.map((p) => ({ player: p, slot: p.position }));
  return { players: xi, entries, strength: strengthOf(entries), replacements: [] };
}

/**
 * Field a user's slot assignment. Unavailable (suspended) players are auto-replaced
 * for this match by the best available bench player for that slot; the base
 * assignment is unchanged. See SPEC.md §9.3.
 */
export function resolveAssignment(
  assignment: SlotAssignment,
  club: Club,
  world: World,
  unavailable?: ReadonlySet<PlayerId>,
): Fielded {
  const banned = unavailable ?? new Set<PlayerId>();
  const inLineup = new Set(assignment.map((a) => a.playerId));
  const used = new Set<PlayerId>();
  const benchPool = playersOf(club, world).filter((p) => !banned.has(p.id) && !inLineup.has(p.id));

  const entries: { player: Player; slot: Position }[] = [];
  const replacements: Replacement[] = [];

  for (const a of assignment) {
    const assigned = world.players.get(a.playerId);
    if (assigned && !banned.has(a.playerId)) {
      entries.push({ player: assigned, slot: a.slot });
      used.add(assigned.id);
      continue;
    }
    // Assigned player unavailable: bring on the best bench player for this slot.
    const replacement = benchPool
      .filter((p) => !used.has(p.id))
      .sort((x, y) => effectiveOverall(y, a.slot) - effectiveOverall(x, a.slot))[0];
    if (replacement) {
      entries.push({ player: replacement, slot: a.slot });
      used.add(replacement.id);
      if (assigned) replacements.push({ out: assigned, in: replacement, slot: a.slot });
    }
  }

  const players = entries.map((e) => e.player);
  return { players, entries, strength: strengthOf(entries), replacements };
}

/** Default lineup = the club's best natural XI, as a slot assignment. */
export function bestAssignment(club: Club, world: World): SlotAssignment {
  return selectStartingXI(club, world).map((p) => ({ slot: p.position, playerId: p.id }));
}

/**
 * A deliberately poor lineup for validation: the 11 lowest-rated players dropped
 * into slots regardless of role (reserves + wrong roles). See SPEC.md §9.4.
 */
export function worstAssignment(club: Club, world: World): SlotAssignment {
  const worst = playersOf(club, world)
    .slice()
    .sort((a, b) => a.overall - b.overall)
    .slice(0, LINEUP_SHAPE.length);
  return LINEUP_SHAPE.map((slot, i) => ({ slot, playerId: (worst[i] as Player).id }));
}

/** Validate a user assignment; returns a list of human-readable problems (empty = ok). */
export function validateAssignment(assignment: SlotAssignment, club: Club, world: World): string[] {
  const errors: string[] = [];
  if (assignment.length !== LINEUP_SHAPE.length) {
    errors.push(`Servono ${LINEUP_SHAPE.length} giocatori, forniti ${assignment.length}.`);
  }

  const counts = countSlots(assignment.map((a) => a.slot));
  const need = countSlots(LINEUP_SHAPE);
  for (const pos of ['GK', 'DF', 'MF', 'FW'] as Position[]) {
    if ((counts[pos] ?? 0) !== (need[pos] ?? 0)) {
      errors.push(`Slot ${pos}: attesi ${need[pos] ?? 0}, forniti ${counts[pos] ?? 0}.`);
    }
  }

  const squad = new Set(club.playerIds);
  const seen = new Set<PlayerId>();
  for (const a of assignment) {
    if (!squad.has(a.playerId)) errors.push(`Giocatore ${a.playerId} non è in rosa.`);
    if (seen.has(a.playerId)) errors.push(`Giocatore ${a.playerId} schierato due volte.`);
    seen.add(a.playerId);
  }
  return errors;
}

function countSlots(slots: readonly Position[]): Partial<Record<Position, number>> {
  const c: Partial<Record<Position, number>> = {};
  for (const s of slots) c[s] = (c[s] ?? 0) + 1;
  return c;
}
