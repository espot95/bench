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
  /** Man-down effect (SPEC §6.5): a team's own scoring rate ×= OWN per man it is down. */
  MAN_DOWN_OWN: 0.8,
  /** ...and the opponent's scoring rate ×= OPP per man the team is down (weaker defence). */
  MAN_DOWN_OPP: 1.25,
  /** Reshaped man-down (SPEC §6.6): attacker sacrificed for a defender after a DF/GK red.
   * Own attack drops more (OWN_RESHAPE < OWN) but the opponent is boosted less (OPP_RESHAPE < OPP). */
  MAN_DOWN_OWN_RESHAPE: 0.7,
  MAN_DOWN_OPP_RESHAPE: 1.15,
} as const;

/** Personality effects on the match (SPEC §11.7). */
export const PERSONALITY = {
  /** Per-player per-match performance swing amplitude: SD = PERF_K · (1 − consistency). */
  PERF_K: 0.06,
  /** Captain (highest leadership fielded) bonus to team ratings: ×(1 + leadership · CAPTAIN_LAMBDA). */
  CAPTAIN_LAMBDA: 0.03,
} as const;

/** Injuries (SPEC §12). */
export const INJURY = {
  /** Base per-starter per-match injury probability (at effective proneness 0.5). */
  BASE_PROB: 0.01,
  /** Effective proneness → frequency multiplier: PRONE_MIN..PRONE_MIN+PRONE_SPAN over [0,1]. */
  PRONE_MIN: 0.4,
  PRONE_SPAN: 1.6,
  /** Effective proneness modifiers. */
  AGE_K: 0.01, // per year over 29
  PACE_K: 0.5, // per (pace−75)/100
  /** Severity split at average proneness (minor / moderate / severe). */
  P_MINOR: 0.7,
  P_MODERATE: 0.25,
  /** Extra severe share added at max proneness (shifts from minor). */
  SEVERE_PRONE_SHIFT: 0.15,
  /** Duration ranges in matches [min, max]. */
  DUR_MINOR: [1, 2],
  DUR_MODERATE: [3, 8],
  DUR_SEVERE: [10, 30],
  /** Permanent physical hit per severe injury: total points removed across pace/stamina/strength. */
  SEVERE_HIT: [3, 6],
  /** Max substitutions a team can make (shared by tactical/routine/injury subs). */
  SUB_BUDGET: 5,
} as const;

/** Individual morale (SPEC §13.1). */
export const MORALE = {
  NEUTRAL: 0.5,
  /** Pull back toward neutral each update, so shocks fade. */
  DECAY: 0.15,
  /** Minutes-vs-expectation is the main lever. */
  MINUTES_WEIGHT: 0.06,
  RESULT_WEIGHT: 0.03,
  TEAM_WEIGHT: 0.02,
  /** How much ambition raises a player's minutes expectation. */
  AMBITION_EXPECTATION: 0.3,
  /** How much determination attenuates morale drops (0..1). */
  DET_ATTENUATE: 0.6,
  /** Match-strength modifier at morale extremes: ×(1 + (morale−0.5)·EFFECT). */
  EFFECT: 0.08,
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
  /** Substitutions (SPEC §6.6): routine subs per team, made across 3 windows. */
  SUB_MIN: 3,
  SUB_MAX: 5,
  /** Minute ranges of the three substitution windows [lo, hi]. */
  SUB_WINDOWS: [
    [40, 52],
    [55, 68],
    [70, 84],
  ],
} as const;
