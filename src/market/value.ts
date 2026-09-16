/**
 * Base market value — the deterministic starting point of every negotiation
 * (GAME_DESIGN §6.4, formulas in docs/MODULE_SCOUTING.md §4). PURE: no RNG, no I/O.
 * The *real* price (what someone actually pays) belongs to the deep-market logic (Fasi 2-3);
 * the *perceived* value (context, hype) is layered on top by scouting/market systems.
 */

export const MARKET_VALUE = {
  /** Value of a 70-overall peak-age player with a running contract. */
  V_REF: 5_000_000,
  /** Superlinear growth of value with overall (stars are disproportionately pricey). */
  ELASTICITY: 3.5,
  /** Youth uplift per point of (potential − overall), only under 24. */
  UPLIFT: 1.5,
  /** Per-year value decay after 30. */
  AGE_DECAY: 0.82,
  AGE_FLOOR: 0.15,
  /** Value granularity (rounded to this step). */
  STEP: 10_000,
} as const;

/**
 * Deterministic base value from technical level, age, potential and remaining contract.
 * Callers pass ESTIMATED inputs (scouting) or TRUE ones (internal AI valuations).
 */
export function baseMarketValue(
  overall: number,
  age: number,
  potential: number,
  contractYearsLeft: number,
): number {
  const overallCurve = MARKET_VALUE.V_REF * (overall / 70) ** MARKET_VALUE.ELASTICITY;
  const value =
    overallCurve *
    ageCurve(age) *
    youthUplift(age, overall, potential) *
    residualFactor(contractYearsLeft);
  return Math.max(0, Math.round(value / MARKET_VALUE.STEP) * MARKET_VALUE.STEP);
}

/** Peak 24-27; younger slightly discounted (raw); older decays hard (floor). */
function ageCurve(age: number): number {
  if (age < 24) return 0.8 + 0.2 * ((age - 17) / 7); // 17→0.8 … 24→1.0
  if (age <= 27) return 1.0;
  if (age <= 30) return 1.0 - 0.05 * (age - 27); // 28→0.95 … 30→0.85
  return Math.max(MARKET_VALUE.AGE_FLOOR, 0.85 * MARKET_VALUE.AGE_DECAY ** (age - 30));
}

/** Young high-potential players carry a premium on their headroom. */
function youthUplift(age: number, overall: number, potential: number): number {
  if (age >= 24) return 1;
  return 1 + MARKET_VALUE.UPLIFT * (Math.max(0, potential - overall) / 100);
}

/** An expiring contract crushes the fee (nearly free agent). */
function residualFactor(yearsLeft: number): number {
  if (yearsLeft <= 0) return 0.3;
  if (yearsLeft === 1) return 0.7;
  if (yearsLeft === 2) return 0.9;
  return 1.0;
}

// ---------------------------------------------------------------------------
// Contract terms for a signing (MODULE_PRESIDENT §2)
// ---------------------------------------------------------------------------

export const SIGNING = {
  BASE_WAGE: 4_000,
  WAGE_SPAN: 180_000,
  /** Agency one-off commission as a share of the gross ANNUAL wage. */
  COMMISSION_PCT: 0.1,
} as const;

/** Weekly gross wage a player of this level/age expects when signing. */
export function expectedWage(overall: number, age: number): number {
  const base = SIGNING.BASE_WAGE + SIGNING.WAGE_SPAN * (overall / 100) ** 3;
  return Math.round(base * wageAgeFactor(age));
}

function wageAgeFactor(age: number): number {
  if (age <= 23) return 0.85;
  if (age <= 29) return 1.0;
  if (age <= 32) return 0.9;
  return 0.75;
}

/** Contract length offered at signing, by age (MODULE_PRESIDENT §2). */
export function offeredYears(age: number): number {
  if (age < 24) return 4;
  if (age < 30) return 3;
  if (age < 33) return 2;
  return 1;
}

/** One-off agency commission for a signing (0 if self-represented). */
export function agencyCommissionFor(wage: number, hasAgency: boolean): number {
  return hasAgency ? Math.round(wage * 52 * SIGNING.COMMISSION_PCT) : 0;
}

// ------------------------------------------------------------------ G3: la forma

import type { Position } from '../core/types.js';
import type { PlayerSeasonStats } from '../engine/player-stats.js';

/** G3 (richiesta utente): il RENDIMENTO muove il valore, per TUTTI i ruoli. */
export const FORM = {
  /** La sufficienza è neutra; ogni punto di media pagella sposta ±22%. */
  RATING_BASE: 6.0,
  RATING_K: 0.22,
  /** Bande di sicurezza: l'economia calibrata non esplode. */
  MIN: 0.7,
  MAX: 1.3,
  /** Sotto questi minuti l'evidenza è poca: il fattore scala verso il neutro. */
  MIN_MINUTES: 450,
  /** La forma in seconda divisione pesa meno (coefficiente campionato). */
  TIER2: 0.6,
} as const;

/**
 * Fattore-forma sul valore di mercato [0.7 .. 1.3]:
 * - la MEDIA PAGELLA muove TUTTI i giocatori (termine universale);
 * - sopra ci va il contributo di ruolo: gol+assist/90 per FW/MF, clean-sheet rate
 *   per DF/GK (+ xG evitati per i portieri);
 * - il coefficiente campionato attenua la forma fatta in divisioni minori;
 * - con pochi minuti l'evidenza scala verso 1. Senza statistiche → 1 (neutro).
 */
export function performanceFactor(
  st: PlayerSeasonStats | undefined,
  position: Position,
  leagueTier: number,
): number {
  if (!st || st.apps === 0) return 1;
  const media = st.ratingSum / st.apps;
  let f = 1 + (media - FORM.RATING_BASE) * FORM.RATING_K;
  const p90 = (v: number) => (v * 90) / Math.max(1, st.minutes);
  if (position === 'FW' || position === 'MF') {
    const bar = position === 'FW' ? 0.45 : 0.2;
    f += Math.max(-0.15, Math.min(0.2, (p90(st.goals + st.assists) - bar) * 0.3));
  } else {
    const cs = st.cleanSheets / st.apps;
    f += Math.max(-0.12, Math.min(0.15, (cs - 0.3) * 0.5));
    if (position === 'GK')
      f += Math.max(-0.08, Math.min(0.12, p90(st.psxgFaced - st.concededOn) * 0.35));
  }
  const coeff = leagueTier >= 2 ? FORM.TIER2 : 1;
  f = 1 + (f - 1) * coeff;
  const evidence = Math.min(1, st.minutes / FORM.MIN_MINUTES);
  f = 1 + (f - 1) * evidence;
  return Math.max(FORM.MIN, Math.min(FORM.MAX, f));
}
