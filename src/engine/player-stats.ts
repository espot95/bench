/** Season-level player aggregates from match events. Pure. See SPEC.md §6.4. */

import type { ClubId, PlayerId } from '../core/ids.js';
import type { Match } from '../core/types.js';

export interface ScorerRow {
  playerId: PlayerId;
  clubId: ClubId;
  goals: number;
  assists: number;
}

export interface CardRow {
  playerId: PlayerId;
  clubId: ClubId;
  yellows: number;
  reds: number;
}

interface Acc {
  clubId: ClubId;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
}

function accumulate(matches: readonly Match[]): Map<PlayerId, Acc> {
  const acc = new Map<PlayerId, Acc>();
  const get = (playerId: PlayerId, clubId: ClubId): Acc => {
    let a = acc.get(playerId);
    if (!a) {
      a = { clubId, goals: 0, assists: 0, yellows: 0, reds: 0 };
      acc.set(playerId, a);
    }
    return a;
  };

  for (const m of matches) {
    for (const e of m.events) {
      if (e.type === 'goal') {
        get(e.playerId, e.clubId).goals++;
        if (e.assistId) get(e.assistId, e.clubId).assists++;
      } else if (e.type === 'yellow') {
        get(e.playerId, e.clubId).yellows++;
      } else if (e.type === 'red') {
        get(e.playerId, e.clubId).reds++;
      }
    }
  }
  return acc;
}

/** Top scorers, sorted by goals then assists. */
export function topScorers(matches: readonly Match[], limit = 10): ScorerRow[] {
  const acc = accumulate(matches);
  const rows: ScorerRow[] = [];
  for (const [playerId, a] of acc) {
    if (a.goals > 0 || a.assists > 0) {
      rows.push({ playerId, clubId: a.clubId, goals: a.goals, assists: a.assists });
    }
  }
  rows.sort((x, y) => y.goals - x.goals || y.assists - x.assists);
  return rows.slice(0, limit);
}

/** Top assist providers, sorted by assists then goals. */
export function topAssists(matches: readonly Match[], limit = 10): ScorerRow[] {
  const rows = topScorers(matches, Number.POSITIVE_INFINITY);
  rows.sort((x, y) => y.assists - x.assists || y.goals - x.goals);
  return rows.slice(0, limit);
}

/** Booking table, sorted by reds then yellows. */
export function cardTable(matches: readonly Match[], limit = 10): CardRow[] {
  const acc = accumulate(matches);
  const rows: CardRow[] = [];
  for (const [playerId, a] of acc) {
    if (a.yellows > 0 || a.reds > 0) {
      rows.push({ playerId, clubId: a.clubId, yellows: a.yellows, reds: a.reds });
    }
  }
  rows.sort((x, y) => y.reds - x.reds || y.yellows - x.yellows);
  return rows.slice(0, limit);
}
