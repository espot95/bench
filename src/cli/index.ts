#!/usr/bin/env node
/**
 * CLI entry point. Pure wiring: generate a world, run the engine, print reports.
 * No game logic lives here. See CLAUDE.md.
 */

import { Command } from 'commander';
import { type Match, leagueOfClub, nationById } from '../core/types.js';
import { runCareer } from '../engine/career.js';
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
import { runWorldSummary } from './world-summary.js';

const program = new Command();

program
  .command('world-summary')
  .description('Fase 0 diagnostic: generate a fictional world and print a core-model summary')
  .option('-s, --seed <n>', 'RNG seed', '42')
  .option('-m, --minimal', 'minimal profile: 1 nation, 1 division (~20 clubs)', false)
  .action((opts) => {
    runWorldSummary(Number.parseInt(opts.seed, 10), Boolean(opts.minimal));
  });

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
    const seasons = world.leagues.map((league, i) => {
      const season = createSeason(world, league, year, seed + i);
      simulateSeason(world, season, createRng(seed + i));
      return { league, season };
    });

    for (const { league, season } of seasons) {
      const nation = nationById(world, league.nationId);
      const prefix = nation ? `${nation.name} · ` : '';
      console.log(`\n=== ${prefix}${league.name} ${year} — final table (seed ${seed}) ===\n`);
      console.log(renderStandings(seasonStandings(world, season), world));
    }

    // Full detail for the top division only.
    const top = seasons[0];
    if (top) {
      console.log(`\n=== ${top.league.name} — statistics ===\n`);
      console.log(renderStats(computeMatchStats(top.season.fixtures)));
      console.log('\n=== Top scorers ===\n');
      console.log(renderTopScorers(topScorers(top.season.fixtures, 10), world));
      const sample = pickSampleMatch(top.season.fixtures);
      if (sample) {
        console.log('\n=== Sample match report ===\n');
        console.log(renderMatchReport(sample, world));
      }
    }
    console.log('');

    if (opts.save) {
      const save = openSave(opts.save);
      try {
        saveWorld(save.db, world);
        for (const { season } of seasons) saveSeason(save.db, season);
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
      const leagueName = world.leagues.find((l) => l.id === season.leagueId)?.name ?? 'League';
      console.log(`\n=== ${leagueName} ${season.year} — reloaded table ===\n`);
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
      const season = createSeason(world, world.leagues[0]!, 2026, seed);
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
  .command('simulate-career')
  .description(
    'Auto-simulate a multi-season career: champions, promotions/relegations, world health',
  )
  .option('-s, --seed <n>', 'RNG seed', '42')
  .option('-n, --seasons <n>', 'number of seasons', '10')
  .action((opts) => {
    const seed = Number.parseInt(opts.seed, 10);
    const seasons = Number.parseInt(opts.seasons, 10);

    const world = generateWorld(createRng(seed));
    const name = (id: string) => world.clubs.get(id as never)?.name ?? '???';
    const history = runCareer(world, 2026, seasons, seed);

    for (const s of history) {
      console.log(`\n=== Stagione ${s.year} ===`);
      for (const d of s.divisions) {
        const champ = d.standings[0];
        console.log(
          `  ${d.leagueName}: campione ${name(champ?.clubId ?? '')} (${champ?.points} pt)`,
        );
      }
      for (const swap of s.offseason.swaps) {
        const anchor = swap.promoted[0];
        const nation = anchor ? nationById(world, leagueOfClub(world, anchor).nationId) : undefined;
        const tag = nation ? `[${nation.code}] ` : '';
        console.log(`  ${tag}↑ promosse: ${swap.promoted.map(name).join(', ')}`);
        console.log(`  ${tag}↓ retrocesse: ${swap.relegated.map(name).join(', ')}`);
      }
      console.log(
        `  ritiri: ${s.offseason.retired.length}, nuovi giovani: ${s.offseason.youthCount}`,
      );
    }

    const ages = [...world.players.values()].map((p) => p.age);
    const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
    console.log(`\n=== Salute del mondo dopo ${seasons} stagioni ===`);
    console.log(
      `  Divisioni: ${world.leagues.map((l) => `${l.name} ${l.clubIds.length} club`).join(' · ')}`,
    );
    console.log(`  Giocatori totali: ${world.players.size}, età media ${avgAge.toFixed(1)}`);
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
      const league = leagueOfClub(world, club.id);
      const season = createSeason(world, league, 2026, seed);
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
