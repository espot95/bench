/**
 * Tunable engine constants. Single source of truth for the match/Elo math.
 * Keep in sync with SPEC.md §4 and §6. Calibrated against the validation bands
 * in SPEC.md §8 via the `calibrate` CLI command.
 */

export const MATCH = {
  /** Expected goals per team, league baseline. */
  MU: 1.35,
  /** Home advantage multiplier on expected goals. */
  HOME: 1.15,
  /** Std dev of the per-match form factor (variance / upsets). */
  SIGMA_FORM: 0.095,
  FORM_MIN: 0.6,
  FORM_MAX: 1.4,
  LAMBDA_MIN: 0.15,
  LAMBDA_MAX: 4.5,
  /** Exponent on the attack/defense ratios: >1 sharpens the effect of strength gaps. */
  RATING_ELASTICITY: 1.45,
  /**
   * Dixon-Coles low-score correlation parameter. Negative (as in the original
   * paper) => boosts 0-0 and 1-1 draws, which independent Poisson underestimates.
   */
  RHO: -0.13,
  /** Max goals considered when building the score probability matrix. */
  MAX_GOALS: 8,
} as const;

export const ELO = {
  BASE: 1500,
  /** Elo spread per standard deviation of squad strength. */
  SPREAD: 120,
  /** Home-field advantage expressed in Elo points. */
  HFA: 65,
  /** K-factor for rating updates. */
  K: 24,
  /** Margin-of-victory scaling: G = 1 + MOV_SCALE * ln(1 + |gd|). */
  MOV_SCALE: 0.35,
  /** Weight of Elo (vs squad strength) in effective strength. See SPEC.md §2.3. */
  BLEND_WEIGHT: 0.35,
} as const;

/** Match-event (scorers/assists/cards) parameters. See SPEC.md §6.4. */
export const EVENTS = {
  /** Probability a goal has an assist. */
  ASSIST_RATE: 0.75,
  /** Expected yellow cards per team per match. */
  YELLOW_LAMBDA: 1.7,
  /** Expected STRAIGHT red cards per team per match (second-yellow reds add to this). */
  RED_LAMBDA: 0.06,
  /**
   * Weight multiplier for an already-booked player receiving a further yellow.
   * <1 models that a booked player plays more cautiously (or is substituted), so
   * second yellows — and thus sending-offs — are much rarer than independence implies.
   */
  BOOKED_CAUTION: 0.3,
  /** Per-position base weight for scoring a goal (× finishing/50). */
  GOAL_POS_WEIGHT: { GK: 0, DF: 0.1, MF: 0.35, FW: 1.0 },
  /** Per-position base weight for providing an assist (× passing/50). */
  ASSIST_POS_WEIGHT: { GK: 0.05, DF: 0.4, MF: 1.0, FW: 0.7 },
  /** Per-position weight for receiving a card. */
  CARD_POS_WEIGHT: { GK: 0.2, DF: 1.0, MF: 0.85, FW: 0.5 },
} as const;
