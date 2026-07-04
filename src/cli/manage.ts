/**
 * Interactive manager loop (CLI shell, SPEC §9). Thin I/O over the pure engine:
 * pick a club, set a 4-4-2 slot lineup once (editable), advance matchdays.
 */

import * as readline from 'node:readline';
import type { ClubId, LeagueId, PlayerId } from '../domain/ids.js';
import {
  type Club,
  type League,
  type Match,
  type Player,
  type Position,
  type Season,
  type StandingRow,
  type World,
  leagueOfClub,
} from '../domain/types.js';
import {
  LINEUP_SHAPE,
  type SlotAssignment,
  bestAssignment,
  validateAssignment,
} from '../engine/lineup.js';
import { topScorers } from '../engine/player-stats.js';
import { advanceOffseason } from '../engine/progression.js';
import {
  type SeasonRunner,
  createRunner,
  createSeason,
  seasonStandings,
  simulateSeason,
} from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  renderAssignment,
  renderMatchReport,
  renderResultLine,
  renderStandings,
  renderTopScorers,
} from './format.js';

/**
 * Prompt/response reader that works for both a TTY and piped input. `readline/promises`
 * drops buffered lines when stdin is a pipe; this queues every line reliably.
 */
interface LineReader {
  question(prompt: string): Promise<string | null>;
  close(): void;
}

function createLineReader(): LineReader {
  const rl = readline.createInterface({ input: process.stdin });
  const pending: string[] = [];
  const waiters: Array<(line: string | null) => void> = [];
  let closed = false;

  rl.on('line', (line) => {
    const w = waiters.shift();
    if (w) w(line);
    else pending.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) (waiters.shift() as (l: string | null) => void)(null);
  });

  return {
    question(prompt: string): Promise<string | null> {
      process.stdout.write(prompt);
      const buffered = pending.shift();
      if (buffered !== undefined) return Promise.resolve(buffered);
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close: () => rl.close(),
  };
}

export async function runManageLoop(seed: number, startYear: number): Promise<void> {
  const rl = createLineReader();
  try {
    const world = generateWorld(createRng(seed));
    const club = await pickClub(rl, world);
    if (!club) {
      console.log('Nessuna squadra scelta.');
      return;
    }

    let year = startYear;
    while (true) {
      const league = leagueOfClub(world, club.id);
      console.log(`\n╔══════ Stagione ${year} — ${league.name} ══════╗`);
      const season = createSeason(world, league, year, seed + year);
      const runner = createRunner(world, season, createRng(seed + year));
      const lineup = bestAssignment(club, world);
      runner.setLineup(club.id, lineup);
      console.log(`\nAlleni ${club.name}. Formazione (miglior XI):\n`);
      console.log(renderAssignment(lineup, world));

      const quitMidSeason = await playSeason(rl, world, club, season, runner);

      const finalTable = seasonStandings(world, season);
      console.log(`\n═════ Classifica finale — ${league.name} ${year} ═════\n`);
      console.log(renderStandings(finalTable, world));
      const pos = finalTable.findIndex((r) => r.clubId === club.id) + 1;
      console.log(`\n${club.name}: ${pos}° posto.`);
      if (quitMidSeason) break;

      // Off-season: simulate the other divisions, then age/retire/promote.
      const standingsByLeague = new Map<LeagueId, StandingRow[]>();
      standingsByLeague.set(league.id, finalTable);
      for (const other of world.leagues) {
        if (other.id === league.id) continue;
        const os = createSeason(world, other, year, seed + year + other.tier * 1000);
        simulateSeason(world, os, createRng(seed + year + other.tier * 1000));
        standingsByLeague.set(other.id, seasonStandings(world, os));
      }
      const report = advanceOffseason(
        world,
        standingsByLeague,
        createRng(seed + year + 99999),
        year + 1,
      );
      printOffseason(world, club, league, report);

      const cont = await rl.question('\n[Invio]=prossima stagione  quit > ');
      if (cont === null || cont.trim().toLowerCase().startsWith('q')) break;
      year++;
    }
  } finally {
    rl.close();
  }
}

/** Play one division season interactively. Returns true if the user quit mid-season. */
async function playSeason(
  rl: LineReader,
  world: World,
  club: Club,
  season: Season,
  runner: SeasonRunner,
): Promise<boolean> {
  let lastUserMatch: Match | null = null;

  while (!runner.isFinished()) {
    const round = runner.nextRound();
    const fixture = nextFixture(world, season, club.id, round);
    console.log(`\n───────────── Giornata ${round}/${runner.totalRounds()} ─────────────`);
    if (fixture) console.log(`La tua partita: ${fixture}`);
    const raw = await rl.question('[Invio]=gioca  lineup  scorers  report  table  squad  quit > ');
    if (raw === null) return true; // EOF
    const cmd = raw.trim().toLowerCase();

    if (cmd === 'quit' || cmd === 'q') return true;
    if (cmd === 'table' || cmd === 't') {
      console.log(`\n${renderStandings(seasonStandings(world, season), world)}`);
      continue;
    }
    if (cmd === 'squad' || cmd === 's') {
      console.log(`\n${renderSquad(club, world)}`);
      continue;
    }
    if (cmd === 'scorers') {
      printScorers(world, season, club.id);
      continue;
    }
    if (cmd === 'report' || cmd === 'r') {
      if (lastUserMatch) console.log(`\n${renderMatchReport(lastUserMatch, world)}`);
      else console.log('  Nessuna partita giocata ancora.');
      continue;
    }
    if (cmd === 'lineup' || cmd === 'l') {
      runner.setLineup(club.id, await editLineup(rl, club, world, bestAssignment(club, world)));
      continue;
    }

    const result = runner.playRound(club.id);
    lastUserMatch = result.userMatch;
    for (const r of result.replacements) {
      console.log(`  ⚠ ${r.out.name} squalificato → entra ${r.in.name} (${r.slot})`);
    }
    if (result.userMatch) {
      console.log(`\n  ► ${renderResultLine(result.userMatch, world).trim()}`);
      for (const g of goalsOf(result.userMatch)) {
        const scorer = world.players.get(g.playerId)?.name ?? '???';
        const side = g.clubId === club.id ? '' : ' (avversario)';
        console.log(`      ⚽ ${g.minute}' ${scorer}${side}`);
      }
    }
    console.log('\n  Altri risultati:');
    for (const m of result.otherMatches) console.log(renderResultLine(m, world));
    console.log(`\n${renderStandings(result.standings, world)}`);
  }
  return false;
}

/** Report the off-season to the user: their club's fate, retirements, youth. */
function printOffseason(
  world: World,
  club: Club,
  oldLeague: League,
  report: ReturnType<typeof advanceOffseason>,
): void {
  console.log('\n───────── Fine stagione ─────────');
  const newLeague = leagueOfClub(world, club.id);
  if (newLeague.tier < oldLeague.tier) console.log(`  ⬆ PROMOSSA in ${newLeague.name}!`);
  else if (newLeague.tier > oldLeague.tier) console.log(`  ⬇ Retrocessa in ${newLeague.name}.`);
  else console.log(`  Resti in ${newLeague.name}.`);

  const myRetired = report.retired.filter((r) => r.clubId === club.id);
  if (myRetired.length) {
    console.log('  Ritiri nella tua rosa:');
    for (const r of myRetired) console.log(`    ${r.player.name} (${r.player.age} anni)`);
  }
  console.log(
    `  Nella lega: ${report.retired.length} ritiri totali, ${report.youthCount} giovani promossi.`,
  );
}

async function pickClub(rl: LineReader, world: World): Promise<Club | null> {
  const clubs = [...world.clubs.values()].sort((a, b) => b.reputation - a.reputation);
  console.log('\nSquadre della lega (per reputazione):\n');
  clubs.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}  ${c.name.padEnd(22)} rep ${c.reputation}`);
  });
  while (true) {
    const ans = await rl.question('\nScegli la squadra da allenare (numero) > ');
    if (ans === null) return null;
    const idx = Number.parseInt(ans.trim(), 10) - 1;
    if (idx >= 0 && idx < clubs.length) return clubs[idx] as Club;
    console.log('Numero non valido.');
  }
}

/** Goal events of a match, in order. */
function goalsOf(match: Match) {
  return match.events.filter((e) => e.type === 'goal');
}

/** Print league top scorers + the user's own club scorers, season to date. */
function printScorers(world: World, season: { fixtures: Match[] }, clubId: ClubId): void {
  const all = topScorers(season.fixtures, Number.POSITIVE_INFINITY);
  console.log('\n=== Capocannonieri di lega ===\n');
  console.log(renderTopScorers(all.slice(0, 10), world));

  const mine = all.filter((r) => r.clubId === clubId).slice(0, 10);
  console.log('\n=== Marcatori della tua squadra ===\n');
  console.log(mine.length ? renderTopScorers(mine, world) : '  (ancora nessun gol)');
}

/** Stable squad numbering (by position then overall), for lineup editing. */
function squadOrder(club: Club, world: World): Player[] {
  const order: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
  return club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => order[a.position] - order[b.position] || b.overall - a.overall);
}

function renderSquad(club: Club, world: World): string {
  return squadOrder(club, world)
    .map(
      (p, i) => `  ${String(i + 1).padStart(2)}  ${p.position}  ${p.name.padEnd(22)} ${p.overall}`,
    )
    .join('\n');
}

async function editLineup(
  rl: LineReader,
  club: Club,
  world: World,
  current: SlotAssignment,
): Promise<SlotAssignment> {
  const squad = squadOrder(club, world);
  // Working slots grouped.
  const groups: Record<Position, PlayerId[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const a of current) groups[a.slot].push(a.playerId);

  const build = (): SlotAssignment =>
    LINEUP_SHAPE.map((slot, i) => ({ slot, playerId: bySlotIndex(groups, i) }));

  console.log('\nRosa (usa questi numeri):\n');
  console.log(renderSquad(club, world));
  console.log(
    '\nComandi:  set GK <n>   set DF <n n n n>   set MF <n n n n>   set FW <n n>   auto   show   done',
  );

  while (true) {
    const raw = await rl.question('lineup> ');
    if (raw === null) return build(); // EOF: keep current selection
    const [cmd, ...rest] = raw.trim().split(/\s+/);

    if (cmd === 'done' || cmd === 'd') {
      const assignment = build();
      const errors = validateAssignment(assignment, club, world);
      if (errors.length === 0) return assignment;
      console.log(`  ✗ ${errors.join('  ')}`);
      continue;
    }
    if (cmd === 'auto' || cmd === 'a') {
      const best = bestAssignment(club, world);
      for (const pos of ['GK', 'DF', 'MF', 'FW'] as Position[]) groups[pos] = [];
      for (const a of best) groups[a.slot].push(a.playerId);
      console.log('  Ripristinato il miglior XI.');
      continue;
    }
    if (cmd === 'show') {
      console.log(renderAssignment(build(), world));
      continue;
    }
    if (cmd === 'set') {
      const slot = (rest[0] ?? '').toUpperCase() as Position;
      if (!(['GK', 'DF', 'MF', 'FW'] as string[]).includes(slot)) {
        console.log('  Slot non valido (GK/DF/MF/FW).');
        continue;
      }
      const idxs = rest.slice(1).map((s) => Number.parseInt(s, 10) - 1);
      const need = LINEUP_SHAPE.filter((s) => s === slot).length;
      if (idxs.length !== need || idxs.some((i) => i < 0 || i >= squad.length)) {
        console.log(`  Servono ${need} numeri validi per ${slot}.`);
        continue;
      }
      groups[slot] = idxs.map((i) => (squad[i] as Player).id);
      console.log(`  ${slot} aggiornato.`);
      continue;
    }
    console.log('  Comando sconosciuto.');
  }
}

/** Pick the playerId for the i-th slot of LINEUP_SHAPE from grouped selections. */
function bySlotIndex(groups: Record<Position, PlayerId[]>, shapeIndex: number): PlayerId {
  const slot = LINEUP_SHAPE[shapeIndex] as Position;
  const priorSame = LINEUP_SHAPE.slice(0, shapeIndex).filter((s) => s === slot).length;
  return groups[slot][priorSame] as PlayerId;
}

function nextFixture(
  world: World,
  season: { fixtures: { round: number; homeClubId: ClubId; awayClubId: ClubId }[] },
  clubId: ClubId,
  round: number,
): string | null {
  const m = season.fixtures.find(
    (f) => f.round === round && (f.homeClubId === clubId || f.awayClubId === clubId),
  );
  if (!m) return null;
  const home = world.clubs.get(m.homeClubId)?.name ?? '???';
  const away = world.clubs.get(m.awayClubId)?.name ?? '???';
  const venue = m.homeClubId === clubId ? '(casa)' : '(trasferta)';
  return `${home} vs ${away} ${venue}`;
}
