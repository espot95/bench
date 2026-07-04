#!/usr/bin/env node
/**
 * CLI entry point. Pure wiring: generate a world, run the engine, print reports.
 * No game logic lives here. See CLAUDE.md.
 */

import { Command } from 'commander';
import type { Match } from '../domain/types.js';
import { bestAssignment, worstAssignment } from '../engine/lineup.js';
import { topScorers } from '../engine/player-stats.js';
import {
  createSeason,
  runManagedSeason,
  seasonStandings,
  simulateSeason,
} from '../engine/season.js';
import { computeMatchStats } from '../engine/stats.js';
import { generateWorld } from '../generation/generate-world.js';
import { openSave } from '../persistence/db.js';
import { loadLatestSeason, loadWorld, saveSeason, saveWorld } from '../persistence/repository.js';
import { createRng } from '../rng/rng.js';
import {
  pickSampleMatch,
  renderMatchReport,
  renderStandings,
  renderStats,
  renderTopScorers,
} from './format.js';
import { runManageLoop } from './manage.js';

const program = new Command();

program
  .name('footy')
  .description('Headless football management engine — Phase 1 CLI')
  .version('0.1.0');

program
  .command('simulate-season')
  .description('Generate a league, simulate a full season, print table + statistics')
  .option('-s, --seed <n>', 'RNG seed', '42')
  .option('-y, --year <n>', 'season year', '2026')
  .option('-o, --save <file>', 'persist the world + season to a SQLite save file')
  .action((opts) => {
    const seed = Number.parseInt(opts.seed, 10);
    const year = Number.parseInt(opts.year, 10);

    const world = generateWorld(createRng(seed));
    const season = createSeason(world, year, seed);
    simulateSeason(world, season, createRng(seed));

    const table = seasonStandings(world, season);
    console.log(`\n=== ${world.league.name} ${year} — final table (seed ${seed}) ===\n`);
    console.log(renderStandings(table, world));
    console.log('\n=== Season statistics ===\n');
    console.log(renderStats(computeMatchStats(season.fixtures)));

    console.log('\n=== Top scorers ===\n');
    console.log(renderTopScorers(topScorers(season.fixtures, 10), world));

    const sample = pickSampleMatch(season.fixtures);
    if (sample) {
      console.log('\n=== Sample match report ===\n');
      console.log(renderMatchReport(sample, world));
    }
    console.log('');

    if (opts.save) {
      const save = openSave(opts.save);
      try {
        saveWorld(save.db, world);
        saveSeason(save.db, season);
        console.log(`Saved to ${opts.save}\n`);
      } finally {
        save.close();
      }
    }
  });

program
  .command('show-table')
  .description('Reload a save file and print the standings (proves persistence round-trips)')
  .requiredOption('-f, --file <file>', 'SQLite save file to read')
  .action((opts) => {
    const save = openSave(opts.file);
    try {
      const world = loadWorld(save.db);
      const season = loadLatestSeason(save.db);
      if (!season) {
        console.log('No season found in save file.');
        return;
      }
      const table = seasonStandings(world, season);
      console.log(`\n=== ${world.league.name} ${season.year} — reloaded table ===\n`);
      console.log(renderStandings(table, world));
      console.log('\n=== Top scorers (from save file) ===\n');
      console.log(renderTopScorers(topScorers(season.fixtures, 10), world));
      console.log('');
    } finally {
      save.close();
    }
  });

program
  .command('calibrate')
  .description('Simulate many seasons and check the aggregate numbers against realism bands')
  .option('-m, --matches <n>', 'minimum matches to aggregate', '20000')
  .option('-s, --seed <n>', 'base RNG seed', '1')
  .action((opts) => {
    const minMatches = Number.parseInt(opts.matches, 10);
    const baseSeed = Number.parseInt(opts.seed, 10);

    const allMatches: Match[] = [];
    const championPoints: number[] = [];
    const lastPoints: number[] = [];
    let seasons = 0;

    while (allMatches.length < minMatches) {
      const seed = baseSeed + seasons;
      const world = generateWorld(createRng(seed));
      const season = createSeason(world, 2026, seed);
      simulateSeason(world, season, createRng(seed));
      allMatches.push(...season.fixtures);

      const table = seasonStandings(world, season);
      championPoints.push(table[0]?.points ?? 0);
      lastPoints.push(table[table.length - 1]?.points ?? 0);
      seasons++;
    }

    console.log(`\n=== Calibration over ${seasons} seasons (${allMatches.length} matches) ===\n`);
    console.log(renderStats(computeMatchStats(allMatches)));
    console.log('');
    console.log(
      `Champion points   avg ${avg(championPoints).toFixed(1)}  (target ~78-90)  min ${Math.min(
        ...championPoints,
      )}  max ${Math.max(...championPoints)}`,
    );
    console.log(
      `Relegated points  avg ${avg(lastPoints).toFixed(1)}  (target ~22-32)  min ${Math.min(
        ...lastPoints,
      )}  max ${Math.max(...lastPoints)}`,
    );
    console.log('');
  });

program
  .command('manage')
  .description('Play a season as the manager of one club (interactive)')
  .option('-s, --seed <n>', 'RNG seed', '42')
  .option('-y, --year <n>', 'season year', '2026')
  .action(async (opts) => {
    await runManageLoop(Number.parseInt(opts.seed, 10), Number.parseInt(opts.year, 10));
  });

program
  .command('manage-compare')
  .description('Validation: same season with best XI vs a poor XI, final placements side by side')
  .option('-s, --seed <n>', 'RNG seed', '42')
  .option('-c, --club <n>', 'club index (0 = highest reputation)', '10')
  .action((opts) => {
    const seed = Number.parseInt(opts.seed, 10);
    const clubIdx = Number.parseInt(opts.club, 10);

    const place = (policy: 'best' | 'worst') => {
      const world = generateWorld(createRng(seed));
      const club = [...world.clubs.values()][clubIdx];
      if (!club) throw new Error(`No club at index ${clubIdx}`);
      const season = createSeason(world, 2026, seed);
      const assignment =
        policy === 'best' ? bestAssignment(club, world) : worstAssignment(club, world);
      const table = runManagedSeason(world, season, createRng(seed), club.id, assignment);
      const row = table.find((r) => r.clubId === club.id);
      return {
        club,
        position: table.findIndex((r) => r.clubId === club.id) + 1,
        points: row?.points ?? 0,
      };
    };

    const good = place('best');
    const bad = place('worst');
    console.log(`\n=== Manager impact — ${good.club.name} (seed ${seed}) ===\n`);
    console.log(`  Miglior XI:        ${ordinal(good.position)} posto, ${good.points} pt`);
    console.log(`  XI scadente:       ${ordinal(bad.position)} posto, ${bad.points} pt`);
    console.log(
      `\n  Le scelte contano: ${bad.position - good.position} posizioni e ${good.points - bad.points} punti di differenza.\n`,
    );
  });

program.parseAsync(process.argv);

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function ordinal(n: number): string {
  return `${n}°`;
}
