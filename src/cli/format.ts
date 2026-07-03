/** Plain-text rendering helpers for CLI output (tables, stats). No colour deps. */

import type { Club, StandingRow, World } from '../domain/types.js';
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

export function renderStats(stats: MatchStats): string {
  const lines: string[] = [];
  lines.push(`Matches analysed: ${stats.matches}`);
  lines.push('');

  const bands: Band[] = [
    { label: 'Home wins', value: stats.homeWinPct, lo: 0.43, hi: 0.48, fmt: pct },
    { label: 'Draws', value: stats.drawPct, lo: 0.24, hi: 0.27, fmt: pct },
    { label: 'Away wins', value: stats.awayWinPct, lo: 0.27, hi: 0.32, fmt: pct },
    { label: 'Avg goals/match', value: stats.avgGoals, lo: 2.5, hi: 2.9, fmt: (x) => x.toFixed(2) },
    { label: '0-0 share', value: stats.nilNilPct, lo: 0.06, hi: 0.1, fmt: pct },
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
