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
