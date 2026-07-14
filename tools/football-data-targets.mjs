#!/usr/bin/env node
/**
 * Target di calibrazione PER LEGA su volumi decennali (SPEC §17.5, GAME_DESIGN §9.2).
 * Fonte: football-data.co.uk (CSV liberi con richiesta di citazione) — risultati e volumi
 * di tiro di Serie A (I1) e Premier League (E0), stagioni 2015/16 → 2025/26.
 *
 * La FORMA della distribuzione xG/tiro resta dal fit StatsBomb (statsbomb-serie-a-1516.json);
 * qui si estraggono i LIVELLI per lega: esiti, gol, 0-0, tiri casa/trasferta.
 *
 * Uso:  node tools/football-data-targets.mjs
 * Output: docs/calibration/football-data-leagues-2015-2026.json (solo aggregati)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.football-data.co.uk/mmz4281';
const LEAGUES = [
  { code: 'ITA', div: 'I1', name: 'Serie A' },
  { code: 'ENG', div: 'E0', name: 'Premier League' },
];
const SEASONS = [
  '1516',
  '1617',
  '1718',
  '1819',
  '1920',
  '2021',
  '2122',
  '2223',
  '2324',
  '2425',
  '2526',
];

/** Minimal CSV parser (no quoted commas in these files' columns of interest). */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(',');
      return {
        fthg: Number.parseInt(cells[idx.FTHG], 10),
        ftag: Number.parseInt(cells[idx.FTAG], 10),
        hs: idx.HS !== undefined ? Number.parseInt(cells[idx.HS], 10) : Number.NaN,
        as: idx.AS !== undefined ? Number.parseInt(cells[idx.AS], 10) : Number.NaN,
      };
    })
    .filter((r) => Number.isFinite(r.fthg) && Number.isFinite(r.ftag));
}

async function fetchSeason(div, season) {
  const res = await fetch(`${BASE}/${season}/${div}.csv`);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${season}/${div}`);
  return parseCsv(await res.text());
}

const out = {
  _source: 'football-data.co.uk (risultati + tiri), stagioni 2015/16-2025/26',
  _attribution: 'Aggregati derivati per calibrare il motore xG per-lega (GAME_DESIGN §9.2)',
  _generatedBy: 'tools/football-data-targets.mjs',
  leagues: {},
};

for (const league of LEAGUES) {
  const perSeason = [];
  let all = [];
  for (const season of SEASONS) {
    let rows;
    try {
      rows = await fetchSeason(league.div, season);
    } catch (e) {
      console.warn(`  ${league.div} ${season}: ${e.message} — salto`);
      continue;
    }
    all = all.concat(rows);
    const n = rows.length;
    const home = rows.filter((r) => r.fthg > r.ftag).length;
    const draw = rows.filter((r) => r.fthg === r.ftag).length;
    const goals = rows.reduce((s, r) => s + r.fthg + r.ftag, 0);
    perSeason.push({
      season,
      matches: n,
      homeWinPct: +((100 * home) / n).toFixed(1),
      drawPct: +((100 * draw) / n).toFixed(1),
      goalsPerMatch: +(goals / n).toFixed(2),
    });
    console.log(
      `${league.div} ${season}: ${n} partite, casa ${((100 * home) / n).toFixed(1)}%, pari ${((100 * draw) / n).toFixed(1)}%, gol ${(goals / n).toFixed(2)}`,
    );
  }

  const n = all.length;
  const home = all.filter((r) => r.fthg > r.ftag).length;
  const draw = all.filter((r) => r.fthg === r.ftag).length;
  const away = n - home - draw;
  const zeroZero = all.filter((r) => r.fthg === 0 && r.ftag === 0).length;
  const withShots = all.filter((r) => Number.isFinite(r.hs) && Number.isFinite(r.as));

  out.leagues[league.code] = {
    name: league.name,
    seasons: perSeason.length,
    matches: n,
    pooled: {
      homeWinPct: +((100 * home) / n).toFixed(1),
      drawPct: +((100 * draw) / n).toFixed(1),
      awayWinPct: +((100 * away) / n).toFixed(1),
      goalsPerMatch: +(all.reduce((s, r) => s + r.fthg + r.ftag, 0) / n).toFixed(2),
      homeGoalsPerMatch: +(all.reduce((s, r) => s + r.fthg, 0) / n).toFixed(2),
      awayGoalsPerMatch: +(all.reduce((s, r) => s + r.ftag, 0) / n).toFixed(2),
      zeroZeroPct: +((100 * zeroZero) / n).toFixed(1),
      shotsHomePerMatch: +(withShots.reduce((s, r) => s + r.hs, 0) / withShots.length).toFixed(2),
      shotsAwayPerMatch: +(withShots.reduce((s, r) => s + r.as, 0) / withShots.length).toFixed(2),
    },
    perSeason,
  };
}

const outPath = join(ROOT, 'docs', 'calibration', 'football-data-leagues-2015-2026.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nTarget scritti in ${outPath}`);
for (const [code, l] of Object.entries(out.leagues)) {
  console.log(`${code} (${l.matches} partite): ${JSON.stringify(l.pooled)}`);
}
