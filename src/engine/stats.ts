/** Aggregate statistics over a set of played matches, for validating realism. */

import type { Match } from '../core/types.js';

export interface MatchStats {
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  totalGoals: number;
  avgGoals: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  /** Share of matches that ended 0-0. */
  nilNilPct: number;
  /** Most frequent scorelines, "h-a" -> count, sorted desc. */
  topScorelines: Array<{ score: string; count: number; pct: number }>;
  /** Goals-per-match frequency: index = total goals in match. */
  goalsHistogram: number[];
}

export function computeMatchStats(matches: readonly Match[], topN = 8): MatchStats {
  const played = matches.filter((m) => m.played && m.homeGoals !== null && m.awayGoals !== null);
  const n = played.length;

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let homeGoals = 0;
  let awayGoals = 0;
  let nilNil = 0;
  const scorelines = new Map<string, number>();
  const goalsHistogram: number[] = [];

  for (const m of played) {
    const h = m.homeGoals as number;
    const a = m.awayGoals as number;
    homeGoals += h;
    awayGoals += a;
    if (h > a) homeWins++;
    else if (h === a) draws++;
    else awayWins++;
    if (h === 0 && a === 0) nilNil++;

    const key = `${h}-${a}`;
    scorelines.set(key, (scorelines.get(key) ?? 0) + 1);

    const total = h + a;
    goalsHistogram[total] = (goalsHistogram[total] ?? 0) + 1;
  }

  for (let i = 0; i < goalsHistogram.length; i++) {
    if (goalsHistogram[i] === undefined) goalsHistogram[i] = 0;
  }

  const totalGoals = homeGoals + awayGoals;
  const safe = n === 0 ? 1 : n;

  const topScorelines = [...scorelines.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([score, count]) => ({ score, count, pct: count / safe }));

  return {
    matches: n,
    homeWins,
    draws,
    awayWins,
    homeWinPct: homeWins / safe,
    drawPct: draws / safe,
    awayWinPct: awayWins / safe,
    totalGoals,
    avgGoals: totalGoals / safe,
    avgHomeGoals: homeGoals / safe,
    avgAwayGoals: awayGoals / safe,
    nilNilPct: nilNil / safe,
    topScorelines,
    goalsHistogram,
  };
}
