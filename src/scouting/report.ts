/**
 * Scouting with uncertainty — base layer (GAME_DESIGN §7, spec docs/MODULE_SCOUTING.md).
 * Event-driven: each observation resamples the report with shrinking noise; accuracy
 * converges but NEVER reaches the truth (sigma floors). Pure + RNG-injected.
 *
 * State is LOCAL to this module (never in core): ScoutingState = Map<PlayerId, ScoutReport>.
 */

import { clampAttr } from '../core/attributes.js';
import type { ClubId, PlayerId } from '../core/ids.js';
import { PERSONALITY_LABELS, personalityLabel } from '../core/personality.js';
import { playerOverall } from '../core/ratings.js';
import type { Player, World } from '../core/types.js';
import { baseMarketValue } from '../market/value.js';
import type { Rng } from '../rng/rng.js';

/** Tuning (docs/MODULE_SCOUTING.md §3-§4). */
export const SCOUTING = {
  /** Overall-estimate noise: starts at SIGMA_0, floors at SIGMA_MIN (never perfect). */
  SIGMA_0: 9,
  SIGMA_MIN: 2,
  /** Potential noise (wider: potential is harder to judge than current level). */
  SIGMAP_0: 12,
  SIGMAP_MIN: 3,
  /** Half-width of the potential interval, in sigmaP units; and its minimum width. */
  WIDTH_K: 1.8,
  MIN_WIDTH: 6,
  /** Probability of guessing the right personality label: P_0 + P_K·obs, capped at P_MAX. */
  P_0: 0.35,
  P_K: 0.08,
  P_MAX: 0.9,
  /** Institutional-context effect on perceived value (GAME_DESIGN §7). */
  CTX: 0.35,
  REF_REP: 55,
  /** Perceived-value noise: starts high, floors low. */
  SIGMAV_0: 0.35,
  SIGMAV_MIN: 0.08,
} as const;

/** A scout's belief about one player. LOCAL state — the truth never leaks here. */
export interface ScoutReport {
  playerId: PlayerId;
  /** How many times the player has been observed (≥1). */
  observations: number;
  /** Estimated current level, 1-100 (1 decimal). */
  estimatedOverall: number;
  /** Potential shown as an interval — never the hidden number (GAME_DESIGN §7). */
  potentialLow: number;
  potentialHigh: number;
  /** Estimated character label — plausible, possibly wrong. */
  personalityGuess: string;
  /** Perceived market value (context-inflated, noisy). */
  estimatedValue: number;
}

/** Per-career scouting memory (the user's club perspective in Fase 1). */
export type ScoutingState = Map<PlayerId, ScoutReport>;

function sigmaAt(obs: number, start: number, floor: number): number {
  return Math.max(floor, start / Math.sqrt(obs));
}

/** Reputation of the club a player belongs to (context); 50 if clubless (free agent). */
function contextReputation(world: World, player: Player): number {
  for (const club of world.clubs.values()) {
    if (club.playerIds.includes(player.id)) return club.reputation;
  }
  return 50;
}

/** Remaining contract years (for the base-value residual factor); 0 if none. */
function contractYearsLeft(world: World, player: Player, year: number): number {
  if (!player.contractId) return 0;
  const c = world.contracts.get(player.contractId);
  return c ? Math.max(0, c.endYear - year + 1) : 0;
}

/**
 * Record one observation of `player`, refining (or creating) his report.
 * Event-driven (GAME_DESIGN §1.3): call on real events only — a match played against him,
 * or an assigned scout watching his club for a matchday.
 */
export function observePlayer(
  state: ScoutingState,
  player: Player,
  world: World,
  year: number,
  rng: Rng,
): ScoutReport {
  const obs = (state.get(player.id)?.observations ?? 0) + 1;

  const trueOverall = playerOverall(player);
  const sigma = sigmaAt(obs, SCOUTING.SIGMA_0, SCOUTING.SIGMA_MIN);
  const estimatedOverall = Math.round(clampAttr(trueOverall + rng.gaussian(0, sigma)) * 10) / 10;

  const sigmaP = sigmaAt(obs, SCOUTING.SIGMAP_0, SCOUTING.SIGMAP_MIN);
  const centre = clampAttr(player.potential + rng.gaussian(0, sigmaP));
  const halfWidth = Math.max(SCOUTING.MIN_WIDTH / 2, SCOUTING.WIDTH_K * sigmaP);
  const potentialLow = Math.round(clampAttr(centre - halfWidth));
  const potentialHigh = Math.round(clampAttr(centre + halfWidth));

  const pRight = Math.min(SCOUTING.P_MAX, SCOUTING.P_0 + SCOUTING.P_K * obs);
  const personalityGuess = rng.chance(pRight)
    ? personalityLabel(player)
    : rng.pick(PERSONALITY_LABELS);

  // Perceived value: base value from ESTIMATES (not truth) × institutional context × noise.
  const estPotential = (potentialLow + potentialHigh) / 2;
  const base = baseMarketValue(
    estimatedOverall,
    player.age,
    Math.max(estimatedOverall, estPotential),
    contractYearsLeft(world, player, year),
  );
  const context = 1 + SCOUTING.CTX * ((contextReputation(world, player) - SCOUTING.REF_REP) / 100);
  const noise = 1 + rng.gaussian(0, sigmaAt(obs, SCOUTING.SIGMAV_0, SCOUTING.SIGMAV_MIN));
  const estimatedValue = Math.max(
    0,
    Math.round((base * context * Math.max(0.2, noise)) / 10_000) * 10_000,
  );

  const report: ScoutReport = {
    playerId: player.id,
    observations: obs,
    estimatedOverall,
    potentialLow,
    potentialHigh,
    personalityGuess,
    estimatedValue,
  };
  state.set(player.id, report);
  return report;
}

/** Observe every player of a club once (an assigned scout's matchday pass). */
export function observeClub(
  state: ScoutingState,
  world: World,
  clubId: ClubId,
  year: number,
  rng: Rng,
): void {
  const club = world.clubs.get(clubId);
  if (!club) return;
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    if (p) observePlayer(state, p, world, year, rng);
  }
}

/** True while the club a player plays for is unknown to the user (no report yet). */
export function isUnknown(state: ScoutingState, playerId: PlayerId): boolean {
  return !state.has(playerId);
}

/** One-line render of a report (CLI helper — kept here so the format stays canonical). */
export function renderReportLine(report: ScoutReport, player: Player): string {
  const pot = `pot. ${report.potentialLow}-${report.potentialHigh}`;
  const value = `~${(report.estimatedValue / 1_000_000).toFixed(1)}M`;
  return (
    `${player.name.padEnd(22)} ${player.position}  età ${player.age}  ` +
    `overall≈${String(Math.round(report.estimatedOverall)).padStart(3)}  ${pot}  ` +
    `${value}  ${report.personalityGuess}  (oss. ${report.observations})`
  );
}

/** Unused-club placeholder line for players never observed. */
export function renderUnknownLine(player: Player): string {
  return `${player.name.padEnd(22)} ${player.position}  età ${player.age}  overall≈???  pot. ???  (mai osservato)`;
}
