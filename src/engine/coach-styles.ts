/**
 * Coach tactical styles (MODULE_MANAGER §5-§6): match modifiers scaled by reputation ×
 * squad FIT, and the development "bottega" — target attributes per target positions.
 * Pure data + pure functions; consumed by the season runner and by progression.
 */

import { playerOverall } from '../core/ratings.js';
import type { Club, CoachStyle, Manager, Player, Position, World } from '../core/types.js';

/** Multipliers applied to the xG engine for one side (all default 1). */
export interface StyleMatchMods {
  ownShots: number;
  ownTilt: number;
  oppShots: number;
  oppTilt: number;
}

export const NEUTRAL_MODS: StyleMatchMods = { ownShots: 1, ownTilt: 1, oppShots: 1, oppTilt: 1 };

interface StyleDef {
  /** Italian label for the CLI. */
  label: string;
  /** Positions whose attributes define the squad fit (empty = whole squad or no fit). */
  fitPositions: Position[];
  /** Attribute names (outfield/GK union — validated at use site). */
  fitAttrs: string[];
  /** Match modifiers at FULL power (p=1); linearly scaled by p = rep/100 × fit. */
  mods: Partial<StyleMatchMods>;
  /** Development targets (MODULE_MANAGER §6). */
  devPositions: Position[];
  devAttrs: string[];
  /** Youth style: boosts EVERYTHING for under-22s at this weight instead. */
  devYouthAll?: number;
}

export const COACH_STYLES: Record<CoachStyle, StyleDef> = {
  wings: {
    label: 'Gioco sulle ali',
    fitPositions: ['MF', 'FW'],
    fitAttrs: ['pace', 'dribbling'],
    mods: { ownShots: 1.1, ownTilt: 0.95 },
    devPositions: ['MF', 'FW'],
    devAttrs: ['pace', 'dribbling'],
  },
  pressing: {
    label: 'Pressing alto',
    fitPositions: ['DF', 'MF', 'FW'],
    fitAttrs: ['stamina', 'workRate'],
    mods: { ownShots: 1.08, ownTilt: 1.04, oppTilt: 1.06 },
    devPositions: ['DF', 'MF', 'FW'],
    devAttrs: ['stamina', 'workRate'],
  },
  catenaccio: {
    label: 'Catenaccio',
    fitPositions: ['DF'],
    fitAttrs: ['marking', 'tackling', 'positioning'],
    mods: { oppShots: 0.9, oppTilt: 0.94, ownShots: 0.94 },
    devPositions: ['DF'],
    devAttrs: ['marking', 'tackling', 'positioning'],
  },
  possession: {
    label: 'Possesso palla',
    fitPositions: ['MF'],
    fitAttrs: ['passing', 'decisions'],
    mods: { oppShots: 0.92, ownTilt: 1.04 },
    devPositions: ['MF'],
    devAttrs: ['passing', 'decisions'],
  },
  counter: {
    label: 'Contropiede',
    fitPositions: ['FW'],
    fitAttrs: ['pace', 'finishing'],
    mods: { ownShots: 0.94, ownTilt: 1.1 },
    devPositions: ['FW'],
    devAttrs: ['pace', 'finishing'],
  },
  motivator: {
    label: 'Motivatore',
    fitPositions: [],
    fitAttrs: [],
    mods: {},
    devPositions: [],
    devAttrs: [],
  },
  youth: {
    label: 'Sviluppatore di giovani',
    fitPositions: [],
    fitAttrs: [],
    mods: {},
    devPositions: [],
    devAttrs: [],
    devYouthAll: 0.6,
  },
};

/** How well the squad interprets the style: mean of the key attrs, normalised, clamp [0.3, 1]. */
export function squadFit(world: World, club: Club, style: CoachStyle): number {
  const def = COACH_STYLES[style];
  if (def.fitAttrs.length === 0) return 1;
  const players = club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .filter((p) => def.fitPositions.includes(p.position));
  if (players.length === 0) return 0.3;
  let sum = 0;
  let n = 0;
  for (const p of players) {
    const attrs = p.attributes as unknown as Record<string, number>;
    for (const a of def.fitAttrs) {
      const v = attrs[a];
      if (typeof v === 'number') {
        sum += v;
        n++;
      }
    }
  }
  const mean = n > 0 ? sum / n : 50;
  return Math.max(0.3, Math.min(1, 0.3 + ((mean - 45) / 35) * 0.7));
}

/** Match modifiers for a club under its coach: neutral without a coach (caretaker). */
export function styleMods(world: World, club: Club, coach: Manager | undefined): StyleMatchMods {
  if (!coach) return NEUTRAL_MODS;
  const def = COACH_STYLES[coach.style];
  const p = (coach.reputation / 100) * squadFit(world, club, coach.style);
  const scale = (full: number | undefined): number => (full === undefined ? 1 : 1 + (full - 1) * p);
  return {
    ownShots: scale(def.mods.ownShots),
    ownTilt: scale(def.mods.ownTilt),
    oppShots: scale(def.mods.oppShots),
    oppTilt: scale(def.mods.oppTilt),
  };
}

/** Development tuning (MODULE_MANAGER §6). */
export const COACH_DEV = {
  K: 1.2,
  RESULTS_MIN: 0.7,
  RESULTS_MAX: 1.3,
  YOUTH_AGE: 22,
} as const;

/** Per-player-attribute yearly development boost from the club's coach ("bottega"). */
export function coachDevBoost(
  coach: Manager,
  resultsFactor: number,
): (attr: string, position: Position, age: number) => number {
  const def = COACH_STYLES[coach.style];
  const charisma =
    0.5 + 0.5 * (0.7 * coach.personality.leadership + 0.3 * coach.personality.socialita);
  const base = COACH_DEV.K * (coach.reputation / 100) * charisma * resultsFactor;
  return (attr, position, age) => {
    if (def.devYouthAll !== undefined) {
      return age < COACH_DEV.YOUTH_AGE ? base * def.devYouthAll : 0;
    }
    if (!def.devPositions.includes(position)) return 0;
    return def.devAttrs.includes(attr) ? base : 0;
  };
}

/** Italian label for the CLI. */
export function styleLabel(style: CoachStyle): string {
  return COACH_STYLES[style].label;
}

// Re-exported for style assignment coherence checks (generation-side bias uses raw traits).
export const STYLE_KEYS = Object.keys(COACH_STYLES) as CoachStyle[];

// Silence unused-import pattern for Player type narrowing helper above.
export type { Player as _CoachStylesPlayerRef };

/** Fit expressed as a label for the CLI (MODULE_MANAGER §5). */
export function fitLabel(fit: number): string {
  if (fit >= 0.8) return 'rosa perfetta per lo stile';
  if (fit >= 0.6) return 'rosa adatta';
  if (fit >= 0.45) return 'rosa così così';
  return 'rosa inadatta allo stile';
}

/** Average overall helper kept local to avoid engine↔core duplication. */
export function squadAverage(world: World, club: Club): number {
  const xs = club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => playerOverall(p));
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
