/** Plain-text rendering helpers for CLI output (tables, stats). No colour deps. */

import type { PlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type { Club, Match, StandingRow, World } from '../core/types.js';
import { REALISM_BANDS, type RealismBands } from '../engine/constants.js';
import type { ScorerRow } from '../engine/player-stats.js';
import type { MatchStats } from '../engine/stats.js';

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}
function padLeft(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}
function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function renderStandings(table: readonly StandingRow[], world: World): string {
  const lines: string[] = [];
  lines.push(
    `${pad('#', 3)}${pad('Club', 22)}${padLeft('P', 3)}${padLeft('W', 4)}${padLeft(
      'D',
      4,
    )}${padLeft('L', 4)}${padLeft('GF', 5)}${padLeft('GA', 5)}${padLeft('GD', 5)}${padLeft(
      'Pts',
      5,
    )}${padLeft('Elo', 6)}`,
  );
  lines.push('-'.repeat(66));
  table.forEach((row, i) => {
    const club = world.clubs.get(row.clubId) as Club;
    lines.push(
      `${pad(String(i + 1), 3)}${pad(club.name, 22)}${padLeft(String(row.played), 3)}${padLeft(
        String(row.won),
        4,
      )}${padLeft(String(row.drawn), 4)}${padLeft(String(row.lost), 4)}${padLeft(
        String(row.goalsFor),
        5,
      )}${padLeft(String(row.goalsAgainst), 5)}${padLeft(
        (row.goalDiff >= 0 ? '+' : '') + row.goalDiff,
        5,
      )}${padLeft(String(row.points), 5)}${padLeft(String(Math.round(club.elo)), 6)}`,
    );
  });
  return lines.join('\n');
}

interface Band {
  label: string;
  value: number;
  lo: number;
  hi: number;
  fmt: (x: number) => string;
}

export function renderStats(stats: MatchStats, realism?: RealismBands): string {
  const lines: string[] = [];
  lines.push(`Matches analysed: ${stats.matches}`);
  lines.push('');

  const r = realism ?? (REALISM_BANDS.POISSON_REF as RealismBands);
  const bands: Band[] = [
    { label: 'Home wins', value: stats.homeWinPct, lo: r.home[0], hi: r.home[1], fmt: pct },
    { label: 'Draws', value: stats.drawPct, lo: r.draw[0], hi: r.draw[1], fmt: pct },
    { label: 'Away wins', value: stats.awayWinPct, lo: r.away[0], hi: r.away[1], fmt: pct },
    {
      label: 'Avg goals/match',
      value: stats.avgGoals,
      lo: r.goals[0],
      hi: r.goals[1],
      fmt: (x) => x.toFixed(2),
    },
    { label: '0-0 share', value: stats.nilNilPct, lo: r.nilNil[0], hi: r.nilNil[1], fmt: pct },
  ];

  lines.push(`${pad('Metric', 20)}${padLeft('Value', 9)}${padLeft('Target', 16)}   Status`);
  lines.push('-'.repeat(58));
  for (const b of bands) {
    const ok = b.value >= b.lo && b.value <= b.hi;
    const target = `${b.fmt(b.lo)}–${b.fmt(b.hi)}`;
    lines.push(
      `${pad(b.label, 20)}${padLeft(b.fmt(b.value), 9)}${padLeft(target, 16)}   ${
        ok ? 'OK' : 'off'
      }`,
    );
  }

  lines.push('');
  lines.push(
    `Home/Away goals: ${stats.avgHomeGoals.toFixed(2)} / ${stats.avgAwayGoals.toFixed(2)}`,
  );
  lines.push('');
  lines.push('Most frequent scorelines:');
  for (const s of stats.topScorelines) {
    lines.push(`  ${pad(s.score, 6)}${padLeft(pct(s.pct), 7)}  ${bar(s.pct, 0.15)}`);
  }

  lines.push('');
  lines.push('Goals-per-match distribution:');
  const maxCount = Math.max(...stats.goalsHistogram, 1);
  stats.goalsHistogram.forEach((count, goals) => {
    lines.push(
      `  ${padLeft(String(goals), 2)} ${padLeft(String(count), 7)}  ${bar(count / maxCount, 1)}`,
    );
  });

  return lines.join('\n');
}

function bar(value: number, scale: number): string {
  const width = Math.round((value / scale) * 30);
  return '#'.repeat(Math.max(0, Math.min(30, width)));
}

function playerName(world: World, id: PlayerId): string {
  return world.players.get(id)?.name ?? '???';
}

function clubShort(world: World, club: Club['id']): string {
  return world.clubs.get(club)?.shortName ?? '???';
}

/** League top scorers table (goals, with assists as a secondary column). */
export function renderTopScorers(rows: readonly ScorerRow[], world: World): string {
  const lines: string[] = [];
  lines.push(
    `${pad('#', 3)}${pad('Player', 22)}${pad('Club', 6)}${padLeft('G', 4)}${padLeft('A', 4)}`,
  );
  lines.push('-'.repeat(39));
  rows.forEach((r, i) => {
    lines.push(
      `${pad(String(i + 1), 3)}${pad(playerName(world, r.playerId), 22)}${pad(
        clubShort(world, r.clubId),
        6,
      )}${padLeft(String(r.goals), 4)}${padLeft(String(r.assists), 4)}`,
    );
  });
  return lines.join('\n');
}

/** A single match report (tabellino) with goals and cards by minute. */
export function renderMatchReport(match: Match, world: World): string {
  const home = world.clubs.get(match.homeClubId) as Club;
  const away = world.clubs.get(match.awayClubId) as Club;
  const lines: string[] = [];
  lines.push(`${home.name} ${match.homeGoals}-${match.awayGoals} ${away.name}`);
  for (const e of match.events) {
    const side = e.clubId === match.homeClubId ? 'H' : 'A';
    const who = playerName(world, e.playerId);
    if (e.type === 'goal') {
      const assist = e.assistId ? ` (assist ${playerName(world, e.assistId)})` : '';
      lines.push(`  ${padLeft(`${e.minute}'`, 4)} [${side}] ⚽ ${who}${assist}`);
    } else if (e.type === 'sub') {
      const off = e.subOutId ? playerName(world, e.subOutId) : '???';
      lines.push(`  ${padLeft(`${e.minute}'`, 4)} [${side}] 🔁 ${who} ⬅ ${off}`);
    } else if (e.type === 'injury') {
      lines.push(`  ${padLeft(`${e.minute}'`, 4)} [${side}] 🚑 ${who} (infortunio)`);
    } else {
      const card = e.type === 'yellow' ? '🟨' : '🟥';
      lines.push(`  ${padLeft(`${e.minute}'`, 4)} [${side}] ${card} ${who}`);
    }
  }
  return lines.join('\n');
}

/** One result line: "Home Name   2-1   Away Name". */
export function renderResultLine(match: Match, world: World): string {
  const home = world.clubs.get(match.homeClubId)?.name ?? '???';
  const away = world.clubs.get(match.awayClubId)?.name ?? '???';
  const score = `${match.homeGoals ?? '-'}-${match.awayGoals ?? '-'}`;
  return `  ${padLeft(home, 22)}  ${score.padStart(5)}  ${away}`;
}

/** Render a slot assignment (GK / DF / MF / FW) with player names + overall. */
export function renderAssignment(
  assignment: { slot: string; playerId: PlayerId }[],
  world: World,
): string {
  const bySlot: Record<string, string[]> = { GK: [], DF: [], MF: [], FW: [] };
  assignment.forEach((a, i) => {
    const p = world.players.get(a.playerId);
    const label = p ? `${i + 1}:${p.name} (${Math.round(playerOverall(p))})` : `${i + 1}:???`;
    const bucket = bySlot[a.slot] ?? [];
    bucket.push(label);
    bySlot[a.slot] = bucket;
  });
  const lines: string[] = [];
  for (const slot of ['GK', 'DF', 'MF', 'FW']) {
    lines.push(`  ${slot}: ${(bySlot[slot] ?? []).join('  ')}`);
  }
  return lines.join('\n');
}

/** Pick a representative match to show as a sample report (most total goals). */
export function pickSampleMatch(matches: readonly Match[]): Match | undefined {
  let best: Match | undefined;
  let bestGoals = -1;
  for (const m of matches) {
    const total = (m.homeGoals ?? 0) + (m.awayGoals ?? 0);
    if (total > bestGoals) {
      bestGoals = total;
      best = m;
    }
  }
  return best;
}
