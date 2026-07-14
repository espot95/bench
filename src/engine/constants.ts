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

/**
 * xG engine (SPEC §17) — SHAPE shared across leagues (StatsBomb Serie A 15/16 shot-xG fit),
 * LEVELS per league via XG_PROFILES (football-data.co.uk, 11 stagioni 2015/16-2025/26,
 * docs/calibration/football-data-leagues-2015-2026.json).
 */
export const XG = {
  /** Attack→shot-volume elasticity and defense→volume suppression (shared). */
  SHOTS_ALPHA: 1.0,
  SHOTS_BETA: 0.75,
  SHOTS_MIN: 2,
  SHOTS_MAX: 40,
  /** LogNormal xG-per-shot: median 0.046, q90/q50 ≈ 4.07 (StatsBomb fit, shared shape). */
  MU_XG: Math.log(0.046),
  SIGMA_XG: 1.1,
  XG_MIN: 0.01,
  XG_CAP: 0.85,
  /** Strength tilt on chance QUALITY: better sides create cleaner chances (shared). */
  GAMMA: 0.55,
  /** Shared match-tempo swing: one game, one pace — correlates the two scores (draws). */
  TEMPO_SIGMA: 0.18,
  /** Game-state (SPEC §17.1): trailing sides push, leading sides manage the game. */
  GS_PUSH: 0.08,
  GS_SIT: 0.05,
  /** Bernoulli clamp per shot. */
  P_MIN: 0.01,
  P_MAX: 0.95,
} as const;

/** Per-league xG levels (SPEC §17.5): every nation plays with its own numbers. */
export interface XgProfile {
  /** Shots per match, league baseline (home/away). */
  shotsHome: number;
  shotsAway: number;
  /** Per-side finishing scale: absorbs penalties, league conversion and home edge. */
  finishHome: number;
  finishAway: number;
  /** Game-state intensity scale (×GS_PUSH/GS_SIT): drawish leagues manage the score more. */
  gsScale: number;
}

/**
 * Keyed by Nation.code; DEFAULT for nations without a tuned profile.
 * Targets (pooled 2015-2026): ITA 42.3/25.5/32.2, gol 1.48/1.25, 0-0 6.9% ·
 * ENG 44.3/23.7/32.0, gol 1.55/1.27, 0-0 6.3%.
 */
export const XG_PROFILES: Record<string, XgProfile> = {
  ITA: { shotsHome: 13.24, shotsAway: 11.02, finishHome: 1.31, finishAway: 1.33, gsScale: 1.0 },
  ENG: { shotsHome: 13.91, shotsAway: 11.47, finishHome: 1.33, finishAway: 1.27, gsScale: 0.25 },
  DEFAULT: { shotsHome: 13.5, shotsAway: 11.2, finishHome: 1.3, finishAway: 1.31, gsScale: 0.8 },
};

export const ENGINE_DEFAULT: 'poisson' | 'xg' = 'xg';

/**
 * Realism bands per league (SPEC §17.2): pooled football-data 2015/16-2025/26 ± margine.
 * Single source of truth for the calibrate CLI and the calibration tests.
 */
export interface RealismBands {
  home: [number, number];
  draw: [number, number];
  away: [number, number];
  goals: [number, number];
  nilNil: [number, number];
}

export const REALISM_BANDS: Record<string, RealismBands> = {
  // Reale ITA 2015-26: 42.3 / 25.5 / 32.2 · gol 2.73 · 0-0 6.9%
  ITA: {
    home: [0.4, 0.445],
    draw: [0.235, 0.275],
    away: [0.3, 0.345],
    goals: [2.6, 2.9],
    nilNil: [0.055, 0.09],
  },
  // Reale ENG 2015-26: 44.3 / 23.7 / 32.0 · gol 2.82 · 0-0 6.3%
  ENG: {
    home: [0.42, 0.465],
    draw: [0.215, 0.26],
    away: [0.3, 0.34],
    goals: [2.7, 3.0],
    nilNil: [0.05, 0.085],
  },
  // Riferimento di regressione per il motore Poisson (bande storiche SPEC §8).
  POISSON_REF: {
    home: [0.42, 0.49],
    draw: [0.23, 0.28],
    away: [0.26, 0.33],
    goals: [2.5, 2.9],
    nilNil: [0.06, 0.1],
  },
};
