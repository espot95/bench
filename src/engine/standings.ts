/**
 * League table computed from played matches. Pure. See SPEC.md §1.9.
 * Tie-break: points -> goal difference -> goals for -> club id (stable).
 */

import type { ClubId } from '../core/ids.js';
import type { Match, StandingRow } from '../core/types.js';

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

function emptyRow(clubId: ClubId): StandingRow {
  return {
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
  };
}

export function computeStandings(
  clubIds: readonly ClubId[],
  matches: readonly Match[],
): StandingRow[] {
  const table = new Map<ClubId, StandingRow>();
  for (const id of clubIds) table.set(id, emptyRow(id));

  for (const m of matches) {
    if (!m.played || m.homeGoals === null || m.awayGoals === null) continue;
    const home = table.get(m.homeClubId);
    const away = table.get(m.awayClubId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += m.homeGoals;
    home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals;
    away.goalsAgainst += m.homeGoals;

    if (m.homeGoals > m.awayGoals) {
      home.won++;
      home.points += WIN_POINTS;
      away.lost++;
    } else if (m.homeGoals < m.awayGoals) {
      away.won++;
      away.points += WIN_POINTS;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += DRAW_POINTS;
      away.points += DRAW_POINTS;
    }
  }

  for (const row of table.values()) {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
  }

  return [...table.values()].sort(compareRows);
}

function compareRows(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.clubId < b.clubId ? -1 : a.clubId > b.clubId ? 1 : 0;
}
