/**
 * Interactive manager loop (CLI shell, SPEC §9). Thin I/O over the pure engine:
 * pick a club, set a 4-4-2 slot lineup once (editable), advance matchdays.
 */

import { offerRenewal } from '../contracts/renewals.js';
import { clubWageBill } from '../core/finance.js';
import type { ClubId, LeagueId, PlayerId } from '../core/ids.js';
import { classifyForNation } from '../core/nations.js';
import { personalityLabel } from '../core/personality.js';
import { playerOverall, selectStartingXI } from '../core/ratings.js';
import {
  type Club,
  type League,
  type Match,
  type Personality,
  type Player,
  type Position,
  type President,
  type Season,
  type StandingRow,
  type World,
  leagueOfClub,
  nationOfClub,
} from '../core/types.js';
import { fitLabel, squadFit, styleLabel } from '../engine/coach-styles.js';
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
import { type TransferOffer, collectOffers } from '../market/offers.js';
import { signFreeAgent } from '../market/signing.js';
import {
  askingPrice,
  executeTransfer,
  negotiateTransfer,
  playerAcceptsMove,
} from '../market/transfers.js';
import {
  checkHardConstraints,
  evaluateProposal,
  evaluateTransferProposal,
} from '../president/decisions.js';
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
import { type LineReader, createLineReader } from './line-reader.js';

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
  /** Offers collected by `sell <n>`, awaiting `sellok <k>` (president mode). */
  pendingSale: { playerId: PlayerId; offers: TransferOffer[] } | null;
}

/** Playable career role (MODULE_PRESIDENT §7): who the user is at this club. */
export type CareerRole = 'manager' | 'president' | 'both';

export async function runManageLoop(
  seed: number,
  startYear: number,
  role: CareerRole = 'manager',
): Promise<void> {
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
      // President puro: the COACH picks the XI every round (MODULE_MANAGER §1) — hire well.
      if (role !== 'president') runner.setLineup(club.id, lineup);
      console.log(
        role === 'president'
          ? `
Presiedi ${club.name}. La formazione la sceglie l'allenatore:
`
          : `
Alleni ${club.name}. Formazione (miglior XI):
`,
      );
      console.log(renderAssignment(lineup, world));

      // Transfer window: AI-released players + fresh prospects (rebuilt every season).
      const market: MarketDesk = {
        pool: buildFreeAgentPool(world, createRng((seed + year) ^ 0x2f6b3a9), year, released),
        nonEuUsed: 0,
        viewed: new Set<PlayerId>(),
        pendingSale: null,
      };

      const quitMidSeason = await playSeason(
        rl,
        world,
        club,
        season,
        runner,
        desk,
        market,
        year,
        role,
      );

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
  role: CareerRole,
): Promise<boolean> {
  let lastUserMatch: Match | null = null;
  const isPresident = role !== 'manager';

  while (!runner.isFinished()) {
    const round = runner.nextRound();
    const fixture = nextFixture(world, season, club.id, round);
    console.log(`\n───────────── Giornata ${round}/${runner.totalRounds()} ─────────────`);
    if (fixture) console.log(`La tua partita: ${fixture}`);
    const raw = await rl.question(
      isPresident
        ? `[Invio]=gioca${role === 'both' ? '  lineup' : ''}  table  squad  scout  market  bid  sell  renew  staff  finanze  alloca  quit > `
        : '[Invio]=gioca  lineup  scorers  report  table  squad  scout  market  bid  quit > ',
    );
    if (raw === null) return true; // EOF
    const cmd = raw.trim().toLowerCase();

    if (cmd === 'quit' || cmd === 'q') return true;
    if (cmd.startsWith('market') || cmd.startsWith('m ') || cmd === 'm') {
      handleMarketCommand(cmd, world, club, desk, market, year, isPresident);
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
    if (
      isPresident &&
      (cmd.startsWith('sell') ||
        cmd.startsWith('renew') ||
        cmd === 'finanze' ||
        cmd.startsWith('alloca') ||
        cmd === 'staff' ||
        cmd === 'fire' ||
        cmd.startsWith('hire'))
    ) {
      handlePresidentCommand(cmd, world, club, desk, market, year);
      continue;
    }
    if ((cmd === 'lineup' || cmd === 'l') && role === 'president') {
      console.log("  La formazione la decide l'allenatore (sei il presidente).");
      continue;
    }
    if (cmd === 'lineup' || cmd === 'l') {
      runner.setLineup(club.id, await editLineup(rl, club, world, bestAssignment(club, world)));
      continue;
    }
    if (cmd.startsWith('bid')) {
      handleBidCommand(cmd, world, club, season, desk, market, year, isPresident);
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
  isPresident = false,
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
    // President mode: the merit call is YOURS — only the hard constraints are machine.
    const verdict = isPresident
      ? presidentDirectVerdict(world, club, player, year, market.nonEuUsed)
      : evaluateProposal(world, club, president, player, year, market.nonEuUsed, desk.rng);
    if (!verdict.approved) {
      console.log(`  ✗ ${isPresident ? 'Regolamento' : president.name}: «${verdict.reason}»`);
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

/**
 * `bid <pos> <n>`: propose buying player n of the club at table position pos
 * (MODULE_MARKET §5). Requires a scouting report — you don't bid on players never watched.
 */
function handleBidCommand(
  cmd: string,
  world: World,
  club: Club,
  season: Season,
  desk: ScoutingDesk,
  market: MarketDesk,
  year: number,
  isPresident = false,
): void {
  const parts = cmd.split(/\s+/);
  const pos = Number.parseInt(parts[1] ?? '', 10);
  const idx = Number.parseInt(parts[2] ?? '', 10);
  if (Number.isNaN(pos) || Number.isNaN(idx)) {
    console.log(
      isPresident
        ? '  Uso: `bid <pos> <n> [offerta in milioni]` (vedi `scout view <pos>`).'
        : '  Uso: `bid <pos. classifica> <n. giocatore>` (vedi `scout view <pos>`).',
    );
    return;
  }
  const standings = seasonStandings(world, season);
  const row = standings[pos - 1];
  const seller = row ? world.clubs.get(row.clubId) : undefined;
  if (!seller || seller.id === club.id) {
    console.log('  Club non valido.');
    return;
  }
  const player = world.players.get(seller.playerIds[idx - 1] ?? ('' as never));
  if (!player) {
    console.log('  Giocatore non valido.');
    return;
  }
  if (!desk.state.has(player.id)) {
    console.log('  Mai osservato: fallo seguire prima (`scout`), poi riprova.');
    return;
  }
  const buyerPres = [...(world.presidents?.values() ?? [])].find((p) => p.clubId === club.id);
  const sellerPres = [...(world.presidents?.values() ?? [])].find((p) => p.clubId === seller.id);
  if (!buyerPres) {
    console.log('  Nessun presidente per il tuo club.');
    return;
  }
  const nation = nationOfClub(world, club.id);
  const verdict = isPresident
    ? presidentDirectBid(
        world,
        club,
        seller,
        sellerPres,
        player,
        year,
        market.nonEuUsed,
        Number.parseFloat(parts[3] ?? ''),
        desk.rng,
      )
    : evaluateTransferProposal(
        world,
        club,
        buyerPres,
        seller,
        sellerPres,
        player,
        year,
        market.nonEuUsed,
        desk.rng,
      );
  if (verdict.negotiation) console.log(`  Trattativa: ${verdict.negotiation}`);
  if (!verdict.approved) {
    console.log(`  ✗ ${isPresident ? 'Trattativa' : buyerPres.name}: «${verdict.reason}»`);
    return;
  }
  executeTransfer(
    world,
    seller,
    club,
    player,
    verdict.fee ?? 0,
    verdict.wage ?? 0,
    verdict.years ?? 1,
    verdict.commission ?? 0,
    year,
  );
  if (nation && classifyForNation(nation, player.nationality) === 'nonEu') market.nonEuUsed++;
  console.log(`  ✓ ${buyerPres.name}: «${verdict.reason}»`);
  console.log(
    `  ${player.name} arriva da ${seller.name} per ${((verdict.fee ?? 0) / 1e6).toFixed(1)}M — ${verdict.years} anni a ${((verdict.wage ?? 0) / 1000).toFixed(0)}k/sett.`,
  );
  const ts = player.transferStatus;
  if (ts) {
    console.log(
      `  Ambientamento: ~${ts.rampTotal} giornate${ts.pricePressure > 0.05 ? ' — il prezzo del cartellino gli pesa addosso' : ''}.`,
    );
  }
}

/** President mode: free-agent signing gated ONLY by the machine constraints (§7.1). */
function presidentDirectVerdict(
  world: World,
  club: Club,
  player: Player,
  year: number,
  nonEuUsed: number,
): { approved: boolean; reason: string; wage?: number; years?: number; commission?: number } {
  const check = checkHardConstraints(world, club, player, year, nonEuUsed);
  if (check.problem) return { approved: false, reason: check.problem };
  return {
    approved: true,
    reason: 'Firmato per tua decisione.',
    wage: check.wage,
    years: check.years,
    commission: check.commission,
  };
}

/** President mode: your own bid (in millions, optional) — counters close if affordable (§7.2). */
function presidentDirectBid(
  world: World,
  club: Club,
  seller: Club,
  sellerPres: President | undefined,
  player: Player,
  year: number,
  nonEuUsed: number,
  customMillions: number,
  rng: Rng,
): {
  approved: boolean;
  reason: string;
  negotiation?: string;
  fee?: number;
  wage?: number;
  years?: number;
  commission?: number;
} {
  const check = checkHardConstraints(world, club, player, year, nonEuUsed);
  if (check.problem) return { approved: false, reason: check.problem };

  const ask = askingPrice(world, seller, sellerPres, player, year);
  const bid = Number.isFinite(customMillions)
    ? Math.round((customMillions * 1e6) / 100_000) * 100_000
    : Math.round((ask * 0.9) / 100_000) * 100_000;
  if (bid > club.finances.transferBudget) {
    return {
      approved: false,
      reason: `Offerta ${(bid / 1e6).toFixed(1)}M oltre il budget trasferimenti.`,
    };
  }
  // Counters auto-close when affordable (§7.2): the closer persona is ambitious and calm.
  const closer: President = {
    ...(sellerPres ?? ([...(world.presidents?.values() ?? [])][0] as President)),
    personality: { ...neutralPersonalityForCloser(), ambition: 1, temperament: 0 },
  };
  const outcome = negotiateTransfer(
    bid,
    ask,
    closer,
    sellerPres,
    club.finances.transferBudget,
    rng,
  );
  const negotiation = `Richiesta ${(ask / 1e6).toFixed(1)}M, offerti ${(bid / 1e6).toFixed(1)}M → ${outcome.reason}`;
  if (!outcome.agreed) return { approved: false, reason: outcome.reason, negotiation };
  if (outcome.fee + check.commission > club.finances.cash) {
    return { approved: false, reason: 'La cassa non copre cartellino e commissione.', negotiation };
  }
  if (!playerAcceptsMove(world, player, seller, club, year)) {
    return { approved: false, reason: 'Il giocatore rifiuta la piazza.', negotiation };
  }
  return {
    approved: true,
    reason: 'Colpo chiuso.',
    negotiation,
    fee: outcome.fee,
    wage: check.wage,
    years: check.years,
    commission: check.commission,
  };
}

function neutralPersonalityForCloser(): Personality {
  return {
    professionalism: 0.5,
    determination: 0.5,
    consistency: 0.5,
    leadership: 0.5,
    temperament: 0,
    ambition: 1,
    loyalty: 0.5,
    adaptability: 0.5,
    composure: 0.5,
    socialita: 0.5,
    divergente: false,
  };
}

/** `sell` / `renew` / `finanze` / `alloca` — the president's desk (MODULE_PRESIDENT §7.1). */
function handlePresidentCommand(
  cmd: string,
  world: World,
  club: Club,
  desk: ScoutingDesk,
  market: MarketDesk,
  year: number,
): void {
  const parts = cmd.split(/\s+/);
  const userPres = [...(world.presidents?.values() ?? [])].find((p) => p.clubId === club.id);

  if (parts[0] === 'sell') {
    // `sell ok <k>`: execute a pending offer.
    if (parts[1] === 'ok') {
      const k = Number.parseInt(parts[2] ?? '', 10);
      const pending = market.pendingSale;
      const offer = pending?.offers[k - 1];
      const player = pending ? world.players.get(pending.playerId) : undefined;
      if (!pending || !offer || !player) {
        console.log('  Nessuna offerta in sospeso con quell’indice (usa `sell <n>`).');
        return;
      }
      const buyer = world.clubs.get(offer.buyerClubId);
      if (!buyer) return;
      executeTransfer(
        world,
        club,
        buyer,
        player,
        offer.fee,
        offer.wage,
        offer.years,
        offer.commission,
        year,
      );
      market.pendingSale = null;
      console.log(
        `  ✓ ${player.name} ceduto a ${buyer.name} per ${(offer.fee / 1e6).toFixed(1)}M — incassati in cassa.`,
      );
      return;
    }
    const n = Number.parseInt(parts[1] ?? '', 10);
    const player = squadOrder(club, world)[n - 1];
    if (!player) {
      console.log('  Uso: `sell <n. giocatore da squad>` poi `sell ok <k>` per accettare.');
      return;
    }
    const offers = collectOffers(world, club, userPres, player, year, desk.rng);
    if (offers.length === 0) {
      console.log(`  Nessuna offerta per ${player.name} in questa finestra.`);
      market.pendingSale = null;
      return;
    }
    market.pendingSale = { playerId: player.id, offers };
    console.log(`  Offerte per ${player.name} (accetta con \`sell ok <k>\`):`);
    offers.forEach((o, i) => {
      console.log(`   ${i + 1}. ${o.buyerName} — ${(o.fee / 1e6).toFixed(1)}M`);
    });
    return;
  }

  if (parts[0] === 'staff' || parts[0] === 'fire' || parts[0] === 'hire') {
    const managers = [...(world.managers?.values() ?? [])];
    const coach = managers.find((mg) => mg.clubId === club.id);
    const free = managers.filter((mg) => mg.clubId === null);

    if (parts[0] === 'fire') {
      if (!coach) {
        console.log('  Nessun allenatore da licenziare (panchina già vacante).');
        return;
      }
      coach.clubId = null;
      console.log(
        `  ${coach.name} esonerato (torna nel mercato dei liberi). La squadra passa a un traghettatore: assumi presto (\`staff\`).`,
      );
      return;
    }
    if (parts[0] === 'hire') {
      const k = Number.parseInt(parts[1] ?? '', 10);
      const target = free[k - 1];
      if (!target) {
        console.log('  Uso: `hire <k>` con k dalla lista `staff`.');
        return;
      }
      if (coach) coach.clubId = null; // the old coach joins the free pool
      target.clubId = club.id;
      console.log(
        `  ✓ ${target.name} è il nuovo allenatore (rep. ${target.reputation}${target.exPlayer ? ', ex-giocatore' : ''}).`,
      );
      console.log('  Nota: la nuova qualità in panchina vale dalla prossima stagione.');
      return;
    }
    // staff: current coach + the free market.
    console.log(
      coach
        ? `  Allenatore: ${coach.name} — rep. ${coach.reputation} · ${styleLabel(coach.style)} (${fitLabel(squadFit(world, club, coach.style))})${coach.exPlayer ? ' · ex-giocatore' : ''} · costo staff ~${((400_000 + (coach.reputation / 100) ** 2 * 6_000_000) / 1e6).toFixed(1)}M/anno`
        : `  Panchina VACANTE (traghettatore, rep. ${40}). Assumi con \`hire <k>\`.`,
    );
    if (free.length === 0) {
      console.log('  Nessun allenatore libero al momento.');
      return;
    }
    console.log('  Liberi sul mercato (assumi con `hire <k>`):');
    free.forEach((mg, i) => {
      console.log(
        `   ${String(i + 1).padStart(2)}. ${mg.name.padEnd(22)} rep. ${String(mg.reputation).padStart(2)}  ${styleLabel(mg.style).padEnd(24)} età ${mg.age}${mg.exPlayer ? '  ex-giocatore' : ''}`,
      );
    });
    return;
  }

  if (parts[0] === 'renew') {
    const n = Number.parseInt(parts[1] ?? '', 10);
    const player = squadOrder(club, world)[n - 1];
    if (!player) {
      console.log('  Uso: `renew <n. giocatore da squad>`.');
      return;
    }
    const out = offerRenewal(world, club, player, year);
    console.log(
      out.accepted
        ? `  ✓ ${player.name}: ${out.reason} ${((out.wage ?? 0) / 1000).toFixed(0)}k/sett. fino al ${out.endYear}.`
        : `  ✗ ${player.name}: ${out.reason}`,
    );
    return;
  }

  if (parts[0] === 'finanze') {
    const f = club.finances;
    const bill = clubWageBill(world, club);
    const sum = (xs: { amount: number; year: number }[]) =>
      xs.filter((e) => e.year >= year - 1).reduce((s, e) => s + e.amount, 0);
    console.log(`  ═ Finanze ${club.name} ═`);
    console.log(
      `  Cassa ${(f.cash / 1e6).toFixed(1)}M · Budget trasferimenti ${(f.transferBudget / 1e6).toFixed(1)}M`,
    );
    console.log(
      `  Monte ingaggi ${(bill / 1000).toFixed(0)}k/sett. su tetto ${(f.wageBudget / 1000).toFixed(0)}k/sett.`,
    );
    console.log(
      `  Ultimo esercizio: entrate ${(sum(f.incomes) / 1e6).toFixed(1)}M · uscite ${(sum(f.expenses) / 1e6).toFixed(1)}M`,
    );
    return;
  }

  if (parts[0] === 'alloca') {
    const m = Number.parseFloat(parts[1] ?? '');
    if (!Number.isFinite(m) || m === 0) {
      console.log('  Uso: `alloca <±milioni>` (+ = trasferimenti→ingaggi, − = viceversa).');
      return;
    }
    const f = club.finances;
    const amount = Math.abs(m) * 1e6;
    if (m > 0) {
      if (amount > f.transferBudget) {
        console.log('  Budget trasferimenti insufficiente.');
        return;
      }
      f.transferBudget -= amount;
      f.wageBudget += Math.round(amount / 52);
    } else {
      const weekly = Math.round(amount / 52);
      const bill = clubWageBill(world, club);
      if (f.wageBudget - weekly < bill) {
        console.log('  Non puoi scendere sotto il monte ingaggi attuale.');
        return;
      }
      f.wageBudget -= weekly;
      f.transferBudget += amount;
    }
    console.log(
      `  Fatto: trasferimenti ${(f.transferBudget / 1e6).toFixed(1)}M · tetto ingaggi ${(f.wageBudget / 1000).toFixed(0)}k/sett.`,
    );
    return;
  }
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
