#!/usr/bin/env node
/**
 * Estrae i TARGET DI CALIBRAZIONE del motore xG dagli StatsBomb Open Data
 * (GAME_DESIGN §9.2: i dati esterni servono a CALIBRARE; nel gioco entrano solo aggregati).
 *
 * Fonte: https://github.com/statsbomb/open-data — Serie A 2015/16 (completa, 380 partite).
 * Licenza: uso consentito con attribuzione (vedi LICENSE.pdf nel repo StatsBomb; da
 * riverificare prima di un eventuale uso commerciale — GAME_DESIGN §9.2 nota legale).
 *
 * Uso:  node tools/statsbomb-targets.mjs [--sample 80]
 * Output: docs/calibration/statsbomb-serie-a-1516.json (solo aggregati, ~2KB)
 * I file evento (~10MB l'uno) sono processati in streaming e MAI salvati nel repo.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const COMPETITION = 12; // Serie A
const SEASON = 27; // 2015/16
const SAMPLE = Number.parseInt(
  process.argv.includes('--sample') ? process.argv[process.argv.indexOf('--sample') + 1] : '80',
  10,
);

async function fetchJson(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.json();
}

const matches = await fetchJson(`matches/${COMPETITION}/${SEASON}.json`);
console.log(`Serie A 2015/16: ${matches.length} partite. Campiono ${SAMPLE} eventi-partita...`);

// Season-level scoreline aggregates (from ALL 380 matches — cheap and exact).
const score = { home: 0, draw: 0, away: 0, homeGoals: 0, awayGoals: 0, zeroZero: 0 };
for (const m of matches) {
  if (m.home_score > m.away_score) score.home++;
  else if (m.home_score < m.away_score) score.away++;
  else score.draw++;
  if (m.home_score === 0 && m.away_score === 0) score.zeroZero++;
  score.homeGoals += m.home_score;
  score.awayGoals += m.away_score;
}

// Shot-level aggregates from an evenly-spread sample of event files.
const step = Math.max(1, Math.floor(matches.length / SAMPLE));
const sampled = matches.filter((_, i) => i % step === 0).slice(0, SAMPLE);

const shots = { home: [], away: [] }; // xG values
const goals = { home: 0, away: 0 };
const penalties = { count: 0, goals: 0 };
let processed = 0;

for (const m of sampled) {
  let events;
  try {
    events = await fetchJson(`events/${m.match_id}.json`);
  } catch (e) {
    console.warn(`  salto ${m.match_id}: ${e.message}`);
    continue;
  }
  const homeTeamId = m.home_team.home_team_id;
  for (const e of events) {
    if (e.type?.name !== 'Shot') continue;
    const xg = e.shot?.statsbomb_xg;
    if (typeof xg !== 'number') continue;
    const isPen = e.shot?.type?.name === 'Penalty';
    const isGoal = e.shot?.outcome?.name === 'Goal';
    const side = e.team?.id === homeTeamId ? 'home' : 'away';
    if (isPen) {
      penalties.count++;
      if (isGoal) penalties.goals++;
      continue; // i rigori si modellano a parte: fuori dalla distribuzione open-play
    }
    shots[side].push(xg);
    if (isGoal) goals[side]++;
  }
  processed++;
  if (processed % 10 === 0) console.log(`  ...${processed}/${sampled.length}`);
}

const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const all = [...shots.home, ...shots.away];

const targets = {
  _source: 'StatsBomb Open Data — Serie A 2015/16 (github.com/statsbomb/open-data)',
  _attribution: 'Dati StatsBomb usati SOLO per calibrare costanti aggregate (GAME_DESIGN §9.2)',
  _generatedBy: `tools/statsbomb-targets.mjs --sample ${SAMPLE}`,
  matchesInSeason: matches.length,
  matchesSampled: processed,
  scoreline: {
    homeWinPct: +(100 * (score.home / matches.length)).toFixed(1),
    drawPct: +(100 * (score.draw / matches.length)).toFixed(1),
    awayWinPct: +(100 * (score.away / matches.length)).toFixed(1),
    goalsPerMatch: +((score.homeGoals + score.awayGoals) / matches.length).toFixed(2),
    homeGoalsPerMatch: +(score.homeGoals / matches.length).toFixed(2),
    awayGoalsPerMatch: +(score.awayGoals / matches.length).toFixed(2),
    zeroZeroPct: +(100 * (score.zeroZero / matches.length)).toFixed(1),
  },
  openPlayShots: {
    perMatchHome: +(shots.home.length / processed).toFixed(2),
    perMatchAway: +(shots.away.length / processed).toFixed(2),
    xgPerShotMean: +mean(all).toFixed(4),
    xgPerShotQuantiles: {
      q25: +quantile(all, 0.25).toFixed(4),
      q50: +quantile(all, 0.5).toFixed(4),
      q75: +quantile(all, 0.75).toFixed(4),
      q90: +quantile(all, 0.9).toFixed(4),
      q99: +quantile(all, 0.99).toFixed(4),
    },
    xgPerMatchHome: +(shots.home.reduce((a, b) => a + b, 0) / processed).toFixed(3),
    xgPerMatchAway: +(shots.away.reduce((a, b) => a + b, 0) / processed).toFixed(3),
    goalsPerMatchHome: +(goals.home / processed).toFixed(3),
    goalsPerMatchAway: +(goals.away / processed).toFixed(3),
    conversionPct: +(100 * ((goals.home + goals.away) / all.length)).toFixed(2),
    goalsOverXg: +((goals.home + goals.away) / (mean(all) * all.length)).toFixed(3),
  },
  penalties: {
    perMatch: +(penalties.count / processed).toFixed(3),
    conversionPct: penalties.count ? +(100 * (penalties.goals / penalties.count)).toFixed(1) : null,
  },
};

const outDir = join(ROOT, 'docs', 'calibration');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'statsbomb-serie-a-1516.json');
writeFileSync(outPath, `${JSON.stringify(targets, null, 2)}\n`);
console.log(`\nTarget scritti in ${outPath}:`);
console.log(JSON.stringify(targets, null, 2));
