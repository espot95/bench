/**
 * Interactive manager loop (CLI shell, SPEC §9). Thin I/O over the pure engine:
 * pick a club, set a 4-4-2 slot lineup once (editable), advance matchdays.
 */

import * as readline from 'node:readline';
import type { ClubId, LeagueId, PlayerId } from '../core/ids.js';
import { classifyForNation } from '../core/nations.js';
import { personalityLabel } from '../core/personality.js';
import { playerOverall, selectStartingXI } from '../core/ratings.js';
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
  nationOfClub,
} from '../core/types.js';
import { injuryLabel } from '../engine/injury.js';
import {
  LINEUP_SHAPE,
  type SlotAssignment,
  bestAssignment,
  validateAssignment,
} from '../engine/lineup.js';
import { moraleLabel } from '../engine/morale.js';
import { topScorers } from '../engine/player-stats.js';
import { advanceOffseason } from '../engine/progression.js';
import { buildRosterList, rosterSummary } from '../engine/roster.js';
import {
  type SeasonRunner,
  createRunner,
  createSeason,
  seasonStandings,
  simulateSeason,
} from '../engine/season.js';
import { buildFreeAgentPool } from '../generation/free-agents.js';
import { generateWorld } from '../generation/generate-world.js';
import { signFreeAgent } from '../market/signing.js';
import { evaluateProposal } from '../president/decisions.js';
import { type Rng, createRng } from '../rng/rng.js';
import {
  type ScoutingState,
  observeClub,
  observePlayer,
  renderReportLine,
  renderUnknownLine,
} from '../scouting/report.js';
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

/** The user's scouting desk: memory + assigned target, persistent across seasons. */
interface ScoutingDesk {
  state: ScoutingState;
  rng: Rng;
  /** Club the (single) scout is currently watching; null = idle. */
  targetClubId: ClubId | null;
}

/** The transfer-window desk: free-agent pool + seasonal non-EU cap tracking. */
interface MarketDesk {
  pool: Player[];
  /** New non-EU registrations already used this season (MODULE_PRESIDENT §3). */
  nonEuUsed: number;
  /** Players already given the "prima occhiata" scouting pass. */
  viewed: Set<PlayerId>;
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
    // Separate scouting stream: report noise never disturbs the simulation streams.
    const desk: ScoutingDesk = {
      state: new Map(),
      rng: createRng((seed ^ 0x7a3d5e11) >>> 0),
      targetClubId: null,
    };
    let released: Player[] = [];

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

      // Transfer window: AI-released players + fresh prospects (rebuilt every season).
      const market: MarketDesk = {
        pool: buildFreeAgentPool(world, createRng((seed + year) ^ 0x2f6b3a9), year, released),
        nonEuUsed: 0,
        viewed: new Set<PlayerId>(),
      };

      const quitMidSeason = await playSeason(rl, world, club, season, runner, desk, market, year);

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
      released = report.released; // feeds next season's free-agent pool
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
  desk: ScoutingDesk,
  market: MarketDesk,
  year: number,
): Promise<boolean> {
  let lastUserMatch: Match | null = null;

  while (!runner.isFinished()) {
    const round = runner.nextRound();
    const fixture = nextFixture(world, season, club.id, round);
    console.log(`\n───────────── Giornata ${round}/${runner.totalRounds()} ─────────────`);
    if (fixture) console.log(`La tua partita: ${fixture}`);
    const raw = await rl.question(
      '[Invio]=gioca  lineup  scorers  report  table  squad  scout  market  quit > ',
    );
    if (raw === null) return true; // EOF
    const cmd = raw.trim().toLowerCase();

    if (cmd === 'quit' || cmd === 'q') return true;
    if (cmd.startsWith('market') || cmd.startsWith('m ') || cmd === 'm') {
      handleMarketCommand(cmd, world, club, desk, market, year);
      continue;
    }
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
    if (cmd.startsWith('scout')) {
      handleScoutCommand(cmd, world, club, season, desk);
      continue;
    }

    const result = runner.playRound(club.id);
    lastUserMatch = result.userMatch;
    recordObservations(desk, world, club, result.userMatch, year);
    for (const r of result.replacements) {
      console.log(`  ⚠ ${r.out.name} indisponibile → entra ${r.in.name} (${r.slot})`);
    }
    for (const inj of result.injuries) {
      console.log(
        `  🚑 ${inj.player.name} infortunato (${inj.injury.severity}, ${inj.injury.durationMatches} giornate)`,
      );
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

/**
 * Automatic observations after your match (MODULE_SCOUTING §5): the opponent's likely
 * starters get +1 observation each. Your own players are known exactly — never scouted.
 */
function recordObservations(
  desk: ScoutingDesk,
  world: World,
  club: Club,
  userMatch: Match | null,
  year: number,
): void {
  if (userMatch) {
    const opponentId =
      userMatch.homeClubId === club.id ? userMatch.awayClubId : userMatch.homeClubId;
    const opponent = world.clubs.get(opponentId);
    if (opponent) {
      for (const p of selectStartingXI(opponent, world)) {
        observePlayer(desk.state, p, world, year, desk.rng);
      }
    }
  }
  // The assigned scout watches his target club's whole squad, one pass per matchday.
  if (desk.targetClubId && desk.targetClubId !== club.id) {
    observeClub(desk.state, world, desk.targetClubId, year, desk.rng);
  }
}

/**
 * `market` command (MODULE_PRESIDENT §5): list the free-agent pool with scouting estimates,
 * `market <n>` proposes player n to the AI president; approved deals are signed for real.
 */
function handleMarketCommand(
  cmd: string,
  world: World,
  club: Club,
  desk: ScoutingDesk,
  market: MarketDesk,
  year: number,
): void {
  const president = [...(world.presidents?.values() ?? [])].find((p) => p.clubId === club.id);
  const nation = nationOfClub(world, club.id);
  const cap = nation?.rosterRules.enabled ? nation.rosterRules.nonEuCap : null;

  const parts = cmd.split(/\s+/);
  const index = parts[1] ? Number.parseInt(parts[1], 10) : Number.NaN;

  // Propose: market <n>
  if (!Number.isNaN(index)) {
    const player = market.pool[index - 1];
    if (!player) {
      console.log('  Indice non valido (vedi `market`).');
      return;
    }
    if (!president) {
      console.log('  Nessun presidente per il tuo club (mondo minimo?).');
      return;
    }
    const verdict = evaluateProposal(
      world,
      club,
      president,
      player,
      year,
      market.nonEuUsed,
      desk.rng,
    );
    if (!verdict.approved) {
      console.log(`  ✗ ${president.name}: «${verdict.reason}»`);
      return;
    }
    signFreeAgent(
      world,
      club,
      player,
      { wage: verdict.wage ?? 0, years: verdict.years ?? 1, commission: verdict.commission ?? 0 },
      year,
    );
    market.pool = market.pool.filter((p) => p.id !== player.id);
    if (nation && classifyForNation(nation, player.nationality) === 'nonEu') market.nonEuUsed++;
    console.log(`  ✓ ${president.name}: «${verdict.reason}»`);
    console.log(
      `  ${player.name} firma per ${verdict.years} anni a ${((verdict.wage ?? 0) / 1000).toFixed(0)}k/sett.` +
        `${(verdict.commission ?? 0) > 0 ? ` (commissione agenzia ${(((verdict.commission ?? 0) / 1_000_000) as number).toFixed(2)}M)` : ' (auto-rappresentato, nessuna commissione)'}`,
    );
    console.log(
      '  Nota: entra in rosa da subito; la lista over-21 si riconsidera a inizio stagione prossima.',
    );
    return;
  }

  // List the pool (first sight = one scouting observation each).
  if (market.pool.length === 0) {
    console.log('  Nessuno svincolato disponibile in questa finestra.');
    return;
  }
  console.log(`\n  ═ Svincolati (${market.pool.length}) — proponi con \`market <n>\` ═`);
  if (cap !== null) console.log(`  Cap extracomunitari stagionale: ${market.nonEuUsed}/${cap}`);
  market.pool.forEach((p, i) => {
    if (!market.viewed.has(p.id)) {
      observePlayer(desk.state, p, world, year, desk.rng); // prima occhiata dello staff
      market.viewed.add(p.id);
    }
    const r = desk.state.get(p.id);
    const line = r ? renderReportLine(r, p) : renderUnknownLine(p);
    console.log(`  ${String(i + 1).padStart(2)}. ${p.nationality}  ${line}`);
  });
}

/** `scout` command: status / `scout <n>` assign / `scout view <n>` report (n = table position). */
function handleScoutCommand(
  cmd: string,
  world: World,
  club: Club,
  season: Season,
  desk: ScoutingDesk,
): void {
  const standings = seasonStandings(world, season);
  const clubAt = (n: number): Club | null => {
    const row = standings[n - 1];
    return row ? (world.clubs.get(row.clubId) ?? null) : null;
  };
  const parts = cmd.split(/\s+/); // "scout", "scout 3", "scout view 3"

  if (parts[1] === 'view' && parts[2]) {
    const target = clubAt(Number.parseInt(parts[2], 10));
    if (!target) {
      console.log('  Indice non valido (usa la posizione in classifica).');
      return;
    }
    if (target.id === club.id) {
      console.log('  I tuoi giocatori li conosci già: usa `squad`.');
      return;
    }
    console.log(`\n  ═ Report scouting — ${target.name} ═`);
    for (const pid of target.playerIds) {
      const p = world.players.get(pid);
      if (!p) continue;
      const report = desk.state.get(pid);
      console.log(`  ${report ? renderReportLine(report, p) : renderUnknownLine(p)}`);
    }
    return;
  }

  if (parts[1]) {
    const target = clubAt(Number.parseInt(parts[1], 10));
    if (!target || target.id === club.id) {
      console.log('  Indice non valido (usa la posizione in classifica, non la tua).');
      return;
    }
    desk.targetClubId = target.id;
    console.log(
      `  Osservatore assegnato a ${target.name}: +1 osservazione a tutta la rosa a ogni giornata.`,
    );
    return;
  }

  const targetName = desk.targetClubId ? (world.clubs.get(desk.targetClubId)?.name ?? '?') : null;
  console.log(`  Osservatore: ${targetName ? `su ${targetName}` : 'non assegnato'}.`);
  console.log(
    '  Uso: `scout <pos. classifica>` assegna · `scout view <pos.>` report · le avversarie affrontate si osservano da sole.',
  );
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
    .sort((a, b) => order[a.position] - order[b.position] || playerOverall(b) - playerOverall(a));
}

function renderSquad(club: Club, world: World): string {
  const roster = buildRosterList(world, club);
  const rules = nationOfClub(world, club.id)?.rosterRules;
  const listTag = (p: Player): string => {
    if (roster.exempt.has(p.id)) return 'U22';
    if (roster.registered.has(p.id)) return 'LST';
    return 'FUO'; // fuori lista → non schierabile
  };
  const rows = squadOrder(club, world)
    .map(
      (p, i) =>
        `  ${String(i + 1).padStart(2)}  ${p.position}  ${listTag(p)}  ${p.name.padEnd(22)} ${p.nationality}  ${String(Math.round(playerOverall(p))).padStart(3)}  età ${p.age}  ${moraleLabel(p.morale).padEnd(14)} ${personalityLabel(p)}${injuryLabel(p) ? ` · ${injuryLabel(p)}` : ''}`,
    )
    .join('\n');
  return `  [${rosterSummary(roster, rules)}]\n${rows}`;
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
