/**
 * xG match engine — Strada 2 (SPEC §17, GAME_DESIGN §9.1). Simulates chances instead of
 * sampling a score directly: shot volume (Poisson) × chance quality (LogNormal xG, fit on
 * StatsBomb Serie A 2015/16) × per-shot finishing (Bernoulli). Same MatchResult interface
 * as the Poisson engine; the whole downstream pipeline (events, cards, man-down, morale)
 * is unchanged. Deterministic given the Rng.
 */

import type { Rng } from '../rng/rng.js';
import type { StyleMatchMods } from './coach-styles.js';
import { NEUTRAL_MODS } from './coach-styles.js';
import { MATCH, XG } from './constants.js';
import type { EffectiveRatings, LeagueContext } from './league-context.js';
import { type MatchResult, type SendOffs, integrateManDown } from './match.js';

/** Simulate one match with the xG engine. `sendOffs` scales shot volume per segment (§6.5). */
export function simulateMatchXg(
  home: EffectiveRatings,
  away: EffectiveRatings,
  ctx: LeagueContext,
  rng: Rng,
  sendOffs?: SendOffs,
  styles?: { home: StyleMatchMods; away: StyleMatchMods },
): MatchResult {
  const profile = ctx.xgProfile;
  const sh = styles?.home ?? NEUTRAL_MODS;
  const sa = styles?.away ?? NEUTRAL_MODS;
  // One match, one pace: a SHARED tempo factor correlates the two sides' volumes
  // (open games/blocked games) — this is what pushes draws up to real levels.
  const tempo = clampForm(rng.gaussian(1, XG.TEMPO_SIGMA));
  const formHome = tempo * clampForm(rng.gaussian(1, MATCH.SIGMA_FORM));
  const formAway = tempo * clampForm(rng.gaussian(1, MATCH.SIGMA_FORM));

  // 1) Shot volume: strength moves how OFTEN you create (SPEC §17.1 punto 1).
  const baseShotsHome =
    profile.shotsHome *
    (home.attack / ctx.avgAttack) ** XG.SHOTS_ALPHA *
    (ctx.avgDefense / away.defense) ** XG.SHOTS_BETA *
    formHome *
    sh.ownShots *
    sa.oppShots;
  const baseShotsAway =
    profile.shotsAway *
    (away.attack / ctx.avgAttack) ** XG.SHOTS_ALPHA *
    (ctx.avgDefense / home.defense) ** XG.SHOTS_BETA *
    formAway *
    sa.ownShots *
    sh.oppShots;

  // Man-down: fewer/more shots per segment, reusing the §6.5 integration on volumes.
  const volumes = sendOffs
    ? integrateManDown(baseShotsHome, baseShotsAway, sendOffs.home, sendOffs.away)
    : { lambdaHome: baseShotsHome, lambdaAway: baseShotsAway };

  const shotsHome = clampShots(rng.poisson(volumes.lambdaHome));
  const shotsAway = clampShots(rng.poisson(volumes.lambdaAway));

  // 2) Chance quality tilt: strength also moves how CLEAN the chances are (punto 2).
  const tiltHome = (home.attack / away.defense) ** XG.GAMMA * sh.ownTilt * sa.oppTilt;
  const tiltAway = (away.attack / home.defense) ** XG.GAMMA * sa.ownTilt * sh.oppTilt;

  // 3) Play the shots interleaved with a running score: GAME-STATE feedback — the
  // trailing side converts better (all-out push), the leading side manages (SPEC §17.1).
  const scaleHome = tiltHome * profile.finishHome;
  const scaleAway = tiltAway * profile.finishAway;
  let goalsHome = 0;
  let goalsAway = 0;
  let xgHome = 0;
  let xgAway = 0;
  let remHome = shotsHome;
  let remAway = shotsAway;

  while (remHome + remAway > 0) {
    const isHome = rng.chance(remHome / (remHome + remAway));
    if (isHome) remHome--;
    else remAway--;

    const raw = Math.exp(rng.gaussian(XG.MU_XG, XG.SIGMA_XG));
    const chance = Math.min(XG.XG_CAP, Math.max(XG.XG_MIN, raw));
    const diff = isHome ? goalsHome - goalsAway : goalsAway - goalsHome;
    const gameState =
      diff < 0 ? 1 + XG.GS_PUSH * profile.gsScale : diff > 0 ? 1 - XG.GS_SIT * profile.gsScale : 1;
    const p = Math.min(
      XG.P_MAX,
      Math.max(XG.P_MIN, chance * (isHome ? scaleHome : scaleAway) * gameState),
    );
    if (isHome) xgHome += p;
    else xgAway += p;
    if (rng.chance(p)) {
      if (isHome) goalsHome++;
      else goalsAway++;
    }
  }

  return {
    homeGoals: goalsHome,
    awayGoals: goalsAway,
    // Expected-goals equivalents, for downstream compatibility with the Poisson engine.
    lambdaHome: xgHome,
    lambdaAway: xgAway,
  };
}

function clampForm(x: number): number {
  return Math.max(MATCH.FORM_MIN, Math.min(MATCH.FORM_MAX, x));
}

function clampShots(n: number): number {
  return Math.max(XG.SHOTS_MIN, Math.min(XG.SHOTS_MAX, n));
}
