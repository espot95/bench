/**
 * Season engine: build the calendar, simulate every round in order (updating Elo
 * live so form feeds back into strength), and expose the final table. See SPEC.md §4-§6.
 */

import { asSeasonId } from '../core/ids.js';
import type { ClubId, PlayerId } from '../core/ids.js';
import { playerOverall, selectStartingXI } from '../core/ratings.js';
import type { TeamStrength } from '../core/ratings.js';
import {
  type Club,
  type League,
  type Match,
  type MatchEvent,
  type Player,
  type Position,
  type Season,
  type StandingRow,
  type World,
  leagueById,
} from '../core/types.js';
import { tickUserFinances } from '../finances/treasury.js';
import {
  type DealNews,
  type IncomingOffer,
  aiMarketRound,
  aiOffersForUser,
  marketRumors,
  marketWindowOpen,
} from '../market/ai.js';
import { performanceFactor } from '../market/value.js';
import { type Rng, type RngState, createRng } from '../rng/rng.js';
import { type StyleMatchMods, styleMods } from './coach-styles.js';
import { ADAPTATION, COACH, type XgProfile } from './constants.js';
import { CUP } from './cup.js';
import { planDuels } from './duels.js';
import { initialiseElo, updateElo } from './elo.js';
import { SUMMER } from './events.js';
import { applySevereHit } from './injury.js';
import { type LeagueContext, buildLeagueContext, effectiveRatingsFor } from './league-context.js';
import {
  type Fielded,
  type SlotAssignment,
  matchStrength,
  naturalFielded,
  resolveAssignment,
} from './lineup.js';
import {
  MATCH_END,
  type OnPitch,
  type TeamInjury,
  assignGoals,
  assignGoalsInWindow,
  buildMatchScript,
} from './match-events.js';
import type { TeamManDown } from './match.js';
import { type Appearance, updateMoraleForClub } from './morale.js';
import { type TeamPlan, applyTeamPlan, planDuelFactor, planStyleMods } from './plan.js';
import { type PlayerSeasonStats, accumulateMatchStats } from './player-stats.js';
import { clubPressure } from './pressure.js';
import { ineligiblePlayers } from './roster.js';
import { generateSchedule } from './scheduler.js';
import { getMatchEngine, simulateScore } from './score-engine.js';
import { tickStadiumProjects } from './stadium.js';
import { computeStandings } from './standings.js';
import { drawXgCharacter, simulateWindowXg } from './xg.js';

/** Bench = available squad players not fielded, best first. */
function benchFor(
  club: Club,
  world: World,
  unavailable: ReadonlySet<PlayerId>,
  fielded: Player[],
): Player[] {
  const onPitch = new Set(fielded.map((p) => p.id));
  return club.playerIds
    .filter((pid) => !unavailable.has(pid) && !onPitch.has(pid))
    .map((pid) => world.players.get(pid))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => playerOverall(b) - playerOverall(a));
}

/** Choose how a club takes the pitch: user slot-assignment if provided, else best natural XI. */
function fieldClub(
  club: Club,
  world: World,
  unavailable: ReadonlySet<PlayerId>,
  lineups: Map<ClubId, SlotAssignment>,
): Fielded {
  const assignment = lineups.get(club.id);
  return assignment
    ? resolveAssignment(assignment, club, world, unavailable)
    : naturalFielded(club, world, unavailable);
}

/** Create a scheduled (unplayed) season for one division. */
export function createSeason(_world: World, league: League, year: number, rngSeed: number): Season {
  const seasonId = asSeasonId(`season-${league.id}-${year}`);
  return {
    id: seasonId,
    leagueId: league.id,
    year,
    rngSeed,
    status: 'scheduled',
    fixtures: generateSchedule(seasonId, league.clubIds),
  };
}

/**
 * Simulate all remaining fixtures in round order. Mutates the matches (fills in
 * goals + events) and the clubs' Elo. Returns the season for chaining.
 *
 * Match events use a SEPARATE rng derived from the season seed, so the scoreline
 * rng stream (and thus the calibrated results) is untouched. See SPEC.md §6.4.
 */
export function simulateSeason(
  world: World,
  season: Season,
  rng: Rng,
  opts: RunnerOptions = {},
): Season {
  const runner = createRunner(world, season, rng, opts);
  while (!runner.isFinished()) runner.playRound();
  return season;
}

/**
 * Refresh each club's ambient pressure for the coming round (SPEC §18.1): reputation base
 * + underperformance vs the pre-season expectation. Before any match is played, the
 * current rank defaults to the expected one (base pressure only).
 */
function refreshPressures(
  world: World,
  season: Season,
  league: League,
  expectedRank: Map<ClubId, number>,
  state: MatchState,
): void {
  const table = computeStandings(
    league.clubIds,
    season.fixtures.filter((m) => m.played),
  );
  const anyPlayed = table.some((r) => r.played > 0);
  state.pressures.clear();
  for (const clubId of league.clubIds) {
    const club = world.clubs.get(clubId);
    if (!club) continue;
    const expected = expectedRank.get(clubId) ?? league.clubIds.length / 2;
    const current = anyPlayed ? table.findIndex((r) => r.clubId === clubId) : expected;
    state.pressures.set(clubId, clubPressure(club.reputation, expected, current));
  }
}

/**
 * The club's coach picks the XI (MODULE_MARKET-free clubs only — a user lineup wins).
 * A weak coach benches a random starter with p = POOR_PICK_MAX · (1 − quality).
 */
function applyCoachPick(
  world: World,
  club: Club,
  unavailable: Set<PlayerId>,
  lineups: Map<ClubId, SlotAssignment>,
  state: MatchState,
  perfRng: Rng,
): void {
  if (lineups.has(club.id)) return; // the user (or a set lineup) decides, not the coach
  const quality = state.coachQuality.get(club.id) ?? COACH.DEFAULT_QUALITY;
  if (!perfRng.chance(COACH.POOR_PICK_MAX * (1 - quality))) return;
  const xi = selectStartingXI(club, world, unavailable);
  const victim = xi[perfRng.int(0, Math.max(0, xi.length - 1))];
  if (victim) unavailable.add(victim.id);
}

/** One matchday of settling-in decay for every adapting player (MODULE_MARKET §4). */
function tickAdaptation(world: World, league: League): void {
  for (const clubId of league.clubIds) {
    const club = world.clubs.get(clubId);
    if (!club) continue;
    for (const pid of club.playerIds) {
      const p = world.players.get(pid);
      const ts = p?.transferStatus;
      if (!p || !ts) continue;
      ts.rampRemaining -= 1;
      ts.pricePressure *= ADAPTATION.PRESSURE_DECAY;
      if (ts.rampRemaining <= 0) p.transferStatus = undefined;
    }
  }
}

/** Take (and clear) the suspensions a club must serve at this match. */
function takeSuspensions(map: Map<ClubId, Set<PlayerId>>, clubId: ClubId): Set<PlayerId> {
  const bans = map.get(clubId) ?? new Set<PlayerId>();
  map.set(clubId, new Set());
  return bans;
}

interface MatchState {
  suspendedNext: Map<ClubId, Set<PlayerId>>;
  /** playerId → round from which the player is available again (injury recovery). */
  injuredUntil: Map<PlayerId, number>;
  /** Ponte coppe v2 (MODULE_CUPS §3): playerId → ultima giornata con le gambe pesanti. */
  fatiguedUntil: Map<PlayerId, number>;
  /** Estate (MODULE_EVENTS §1-2): stack di modificatori club-livello (ritiro + tour). */
  preparation: Map<ClubId, { until: number; boost: number; injuryMult: number }[]>;
  /** Usura campo da concerto (MODULE_EVENTS §3): clubId di casa → giornata coperta. */
  pitchWearUntil: Map<ClubId, number>;
  /** Manto erboso del campo di casa (MODULE_STADIUM): assente = 'media' (neutro). */
  grass: Map<ClubId, GrassLength>;
  /** Irrigazione del campo di casa (MODULE_STADIUM): assente = 'normale' (neutro). */
  watering: Map<ClubId, Watering>;
  /** PIANO PARTITA (richiesta utente): istruzioni di squadra, solo club con piano. */
  teamPlan: Map<ClubId, TeamPlan>;
  /** Roster-ineligible players per club (below min age / squeezed off the list); static per season. */
  rosterIneligible: Map<ClubId, Set<PlayerId>>;
  /** Piazza pressure per club, refreshed each round from reputation + standings (SPEC §18). */
  pressures: Map<ClubId, number>;
  /** Coach quality per club [0,1] (MODULE_MANAGER §1): drives the poor-pick roll. */
  coachQuality: Map<ClubId, number>;
  /** Tactical-style modifiers per club (MODULE_MANAGER §5), fixed per season. */
  styles: Map<ClubId, StyleMatchMods>;
  /** G1: statistiche stagionali per giocatore (tutta la lega) — pagelle incluse. */
  playerStats: Map<PlayerId, PlayerSeasonStats>;
  round: number;
}

/**
 * Availability = suspensions (served now) ∪ players recovering from injury ∪ roster-ineligible
 * (below min age or off the registration list, SPEC §14.3).
 */
function unavailableFor(club: Club, state: MatchState): Set<PlayerId> {
  const out = takeSuspensions(state.suspendedNext, club.id);
  for (const pid of club.playerIds) {
    if ((state.injuredUntil.get(pid) ?? 0) >= state.round) out.add(pid);
  }
  for (const pid of state.rosterIneligible.get(club.id) ?? []) out.add(pid);
  return out;
}

/** Classify how each squad player featured, for the morale update (SPEC §13.2). */
function appearanceMap(
  club: Club,
  fielded: Fielded,
  events: Match['events'],
  unavailable: ReadonlySet<PlayerId>,
): Map<string, Appearance> {
  const started = new Set(fielded.players.map((p) => p.id));
  const cameOn = new Set(
    events.filter((e) => e.type === 'sub' && e.clubId === club.id).map((e) => e.playerId),
  );
  const map = new Map<string, Appearance>();
  for (const pid of club.playerIds) {
    if (started.has(pid)) map.set(pid, 'started');
    else if (cameOn.has(pid)) map.set(pid, 'sub');
    else if (unavailable.has(pid)) map.set(pid, 'unavailable');
    else map.set(pid, 'unused');
  }
  return map;
}

const NEUTRAL_STYLE: StyleMatchMods = { ownShots: 1, ownTilt: 1, oppShots: 1, oppTilt: 1 };

/** Manto erboso del campo di casa (MODULE_STADIUM): scelto solo a inizio stagione. */
export type GrassLength = 'bassa' | 'media' | 'alta';

export const GRASS = {
  /** Erba BASSA: la palla corre — il palleggio raso terra rende di più (deviazione
   *  dal neutro amplificata) e il bunker morde meno. */
  FAST_POSSESSION: 1.3,
  FAST_SHOTS: 1.03,
  FAST_CATENACCIO: 0.85,
  /** Erba ALTA: la palla frena — palleggio smorzato verso il neutro, catenaccio esaltato. */
  TALL_POSSESSION: 0.6,
  TALL_SHOTS: 0.97,
  TALL_CATENACCIO: 1.15,
  /** Manutenzione stagionale dell'erba bassa (tagli continui), a ledger. */
  SHORT_UPKEEP: 200_000,
} as const;

/** Irrigazione del campo di casa (MODULE_STADIUM): si cambia tra una giornata e l'altra. */
export type Watering = 'bagnato' | 'normale' | 'asciutto';

export const WATER = {
  /** Campo BAGNATO: palla rapida — effetto più piccolo dell'erba, stessa direzione della bassa. */
  WET_POSSESSION: 1.15,
  WET_SHOTS: 1.015,
  WET_CATENACCIO: 0.92,
  /** Campo ASCIUTTO: palla che frena — palleggio penalizzato, catenaccio esaltato. */
  DRY_POSSESSION: 0.8,
  DRY_SHOTS: 0.985,
  DRY_CATENACCIO: 1.08,
  /** Bolletta idrica per OGNI partita in casa giocata col campo bagnato. */
  WET_COST: 25_000,
} as const;

/**
 * Lo stile di un club alla luce del CAMPO di casa: prima il manto erboso
 * (MODULE_STADIUM: bassa esalta il palla-a-terra e smorza il catenaccio, alta il
 * contrario — vale per ENTRAMBE le squadre, ciascuna col suo stile), poi l'usura da
 * concerto (MODULE_EVENTS §3). Erba `media` e nessuna usura = mod originali
 * (bit-identico: i club AI non compaiono mai nella mappa `grass`).
 */
function pitchStyle(
  world: World,
  state: MatchState,
  homeClubId: ClubId,
  clubId: ClubId,
  baseOverride?: StyleMatchMods,
): StyleMatchMods {
  let mods = baseOverride ?? state.styles.get(clubId) ?? NEUTRAL_STYLE;
  const grass = state.grass.get(homeClubId) ?? 'media';
  const water = state.watering.get(homeClubId) ?? 'normale';
  const worn = (state.pitchWearUntil.get(homeClubId) ?? 0) >= state.round;
  if (grass === 'media' && water === 'normale' && !worn) return mods;
  const coach = [...(world.managers?.values() ?? [])].find((m) => m.clubId === clubId);
  const style = coach?.style;
  // Erba e irrigazione lavorano sullo stesso asse (velocità della palla) e si
  // MOLTIPLICANO: bassa+bagnato = biliardo, alta+asciutto = pantano.
  const apply = (f: number, shots: number) => {
    const amp = (v: number) => 1 + (v - 1) * f;
    mods = {
      ownShots: amp(mods.ownShots) * shots,
      ownTilt: amp(mods.ownTilt),
      oppShots: amp(mods.oppShots),
      oppTilt: amp(mods.oppTilt),
    };
  };
  if (grass !== 'media' && (style === 'possession' || style === 'catenaccio')) {
    apply(
      grass === 'bassa'
        ? style === 'possession'
          ? GRASS.FAST_POSSESSION
          : GRASS.FAST_CATENACCIO
        : style === 'possession'
          ? GRASS.TALL_POSSESSION
          : GRASS.TALL_CATENACCIO,
      style === 'possession' ? (grass === 'bassa' ? GRASS.FAST_SHOTS : GRASS.TALL_SHOTS) : 1,
    );
  }
  if (water !== 'normale' && (style === 'possession' || style === 'catenaccio')) {
    apply(
      water === 'bagnato'
        ? style === 'possession'
          ? WATER.WET_POSSESSION
          : WATER.WET_CATENACCIO
        : style === 'possession'
          ? WATER.DRY_POSSESSION
          : WATER.DRY_CATENACCIO,
      style === 'possession' ? (water === 'bagnato' ? WATER.WET_SHOTS : WATER.DRY_SHOTS) : 1,
    );
  }
  if (worn && style === 'possession') {
    const damp = (v: number) => 1 + (v - 1) * SUMMER.WEAR_DAMP;
    mods = {
      ownShots: damp(mods.ownShots) * SUMMER.WEAR_SHOTS,
      ownTilt: damp(mods.ownTilt),
      oppShots: damp(mods.oppShots),
      oppTilt: damp(mods.oppTilt),
    };
  }
  return mods;
}

/** Play one match; returns each side's fielded lineup + injuries (for reporting/effects). */
function playMatch(
  world: World,
  ctx: ReturnType<typeof buildLeagueContext>,
  state: MatchState,
  lineups: Map<ClubId, SlotAssignment>,
  match: Match,
  rng: Rng,
  eventsRng: Rng,
  perfRng: Rng,
): {
  home: Fielded;
  away: Fielded;
  homeInjuries: TeamInjury[];
  awayInjuries: TeamInjury[];
  homeAppearance: Map<string, Appearance>;
  awayAppearance: Map<string, Appearance>;
} {
  const home = world.clubs.get(match.homeClubId);
  const away = world.clubs.get(match.awayClubId);
  if (!home || !away) throw new Error(`Match ${match.id} references unknown club`);

  const homeUnavail = unavailableFor(home, state);
  const awayUnavail = unavailableFor(away, state);
  // Coach quality (MODULE_MANAGER §1): a poor coach sometimes benches a starter.
  applyCoachPick(world, home, homeUnavail, lineups, state, perfRng);
  applyCoachPick(world, away, awayUnavail, lineups, state, perfRng);
  const homeFielded = fieldClub(home, world, homeUnavail, lineups);
  const awayFielded = fieldClub(away, world, awayUnavail, lineups);

  const homeSide = {
    clubId: home.id,
    xi: homeFielded.players,
    bench: benchFor(home, world, homeUnavail, homeFielded.players),
  };
  const awaySide = {
    clubId: away.id,
    xi: awayFielded.players,
    bench: benchFor(away, world, awayUnavail, awayFielded.players),
  };

  // Duello di giornata (SPEC §19): dribblatore vs difensore ruvido — redistribuisce
  // cartellini e aggiunge il piccolo rischio-infortunio al martellato. Zero draw RNG.
  const duelPlan = planDuels(homeFielded.players, awayFielded.players, world.players, {
    home: planDuelFactor(state.teamPlan.get(home.id)),
    away: planDuelFactor(state.teamPlan.get(away.id)),
  });

  // Estate (MODULE_EVENTS §1): i modificatori attivi del club — ritiro (boost>1,
  // meno infortuni) e gambe da tour (boost<1). Senza eventi: fattori ESATTAMENTE 1.
  const prepOf = (clubId: ClubId) => {
    let boost = 1;
    let injuryMult = 1;
    for (const e of state.preparation.get(clubId) ?? []) {
      if (e.until >= state.round) {
        boost *= e.boost;
        injuryMult *= e.injuryMult;
      }
    }
    return { boost, injuryMult };
  };
  const homePrep = prepOf(home.id);
  const awayPrep = prepOf(away.id);
  for (const [prep, xi] of [
    [homePrep, homeFielded.players],
    [awayPrep, awayFielded.players],
  ] as const) {
    if (prep.injuryMult === 1) continue;
    for (const p of xi) {
      const entry = duelPlan.mods.get(p.id) ?? { cardMult: 1, injMult: 1 };
      entry.injMult *= prep.injuryMult;
      duelPlan.mods.set(p.id, entry);
    }
  }

  // Cards + subs first: sending-off minutes feed the man-down effect on the score
  // (§6.5-§6.6) and the on-pitch timeline drives who can score afterwards (§6.4).
  const script = buildMatchScript(homeSide, awaySide, eventsRng, duelPlan.mods);

  // Ponte coppe v2 (MODULE_CUPS §3): gambe pesanti dopo il turno infrasettimanale —
  // malus di squadra × quota di titolari affaticati. Con la mappa vuota il fattore è
  // ESATTAMENTE 1: senza coppe la lega resta bit-identica (calibrazione salva).
  const fatigueScale = (fielded: Fielded) => {
    let n = 0;
    for (const p of fielded.players) {
      if ((state.fatiguedUntil.get(p.id) ?? 0) >= state.round) n++;
    }
    return 1 - CUP.FATIGUE_MALUS * (n / 11);
  };
  const tired = (r: { attack: number; defense: number }, k: number) => ({
    attack: r.attack * k,
    defense: r.defense * k,
  });

  // Personality-aware match strength: per-player consistency swing + captain bonus (§11.7).
  // PIANO PARTITA (richiesta utente): stile imposto (con attrito del tecnico),
  // linea/marcatura/aggressività/palle inattive — solo per club con piano.
  const styledFor = (club: Club, myXI: Player[], oppXI: Player[]): StyleMatchMods => {
    const plan = state.teamPlan.get(club.id);
    const override = plan?.style
      ? planStyleMods(
          world,
          club,
          [...(world.managers?.values() ?? [])].find((m) => m.clubId === club.id),
          plan.style,
        )
      : undefined;
    const base = pitchStyle(world, state, match.homeClubId, club.id, override);
    return plan ? applyTeamPlan(base, plan, myXI, oppXI) : base;
  };
  const captainOf = (club: Club) => state.teamPlan.get(club.id)?.setPiece?.captainId;
  const result = simulateScore(
    tired(
      effectiveRatingsFor(
        matchStrength(homeFielded, perfRng, state.pressures.get(home.id) ?? 0, captainOf(home)),
        home,
        ctx,
      ),
      fatigueScale(homeFielded) * homePrep.boost,
    ),
    tired(
      effectiveRatingsFor(
        matchStrength(awayFielded, perfRng, state.pressures.get(away.id) ?? 0, captainOf(away)),
        away,
        ctx,
      ),
      fatigueScale(awayFielded) * awayPrep.boost,
    ),
    ctx,
    rng,
    { home: script.home, away: script.away },
    {
      home: styledFor(home, homeFielded.players, awayFielded.players),
      away: styledFor(away, awayFielded.players, homeFielded.players),
    },
  );

  match.homeGoals = result.homeGoals;
  match.awayGoals = result.awayGoals;
  match.played = true;
  const goals = assignGoals(
    home.id,
    script.homeLineup,
    away.id,
    script.awayLineup,
    result.homeGoals,
    result.awayGoals,
    eventsRng,
  );
  match.events = [...script.events, ...goals].sort((a, b) => a.minute - b.minute);

  // A red card => the player is suspended for that club's next match.
  for (const e of script.events) {
    if (e.type !== 'red') continue;
    const bans = state.suspendedNext.get(e.clubId) ?? new Set<PlayerId>();
    bans.add(e.playerId);
    state.suspendedNext.set(e.clubId, bans);
  }

  // Injuries: out for `duration` matches; a severe one leaves a permanent physical mark (§12).
  for (const inj of [...script.homeInjuries, ...script.awayInjuries]) {
    state.injuredUntil.set(inj.player.id, state.round + inj.injury.durationMatches);
    if (inj.injury.severity === 'severe') applySevereHit(inj.player, eventsRng);
  }

  // G1 — statistiche per giocatore: attribuzione deterministica POST-partita
  // (zero draw RNG: i risultati restano byte-identici per costruzione).
  accumulateMatchStats(
    state.playerStats,
    world,
    match,
    homeFielded.players,
    awayFielded.players,
    { home: result.lambdaHome, away: result.lambdaAway },
    {
      home: result.shotsHome ?? Math.max(result.homeGoals, Math.round(result.lambdaHome * 9)),
      away: result.shotsAway ?? Math.max(result.awayGoals, Math.round(result.lambdaAway * 9)),
    },
  );

  const homeScore =
    result.homeGoals > result.awayGoals ? 1 : result.homeGoals === result.awayGoals ? 0.5 : 0;
  const updated = updateElo(home.elo, away.elo, homeScore, result.homeGoals - result.awayGoals);
  home.elo = updated.home;
  away.elo = updated.away;

  return {
    home: homeFielded,
    away: awayFielded,
    homeInjuries: script.homeInjuries,
    awayInjuries: script.awayInjuries,
    homeAppearance: appearanceMap(home, homeFielded, match.events, homeUnavail),
    awayAppearance: appearanceMap(away, awayFielded, match.events, awayUnavail),
  };
}

/** Final (or current) standings for a season (its division). */
export function seasonStandings(world: World, season: Season): StandingRow[] {
  return computeStandings(leagueById(world, season.leagueId).clubIds, season.fixtures);
}

/**
 * Simulate a whole season with a fixed user lineup and return the final standings.
 * Used by the validation comparison (best vs poor lineup). See SPEC.md §9.4.
 */
export function runManagedSeason(
  world: World,
  season: Season,
  rng: Rng,
  userClubId: ClubId,
  assignment: SlotAssignment,
): StandingRow[] {
  const runner = createRunner(world, season, rng);
  runner.setLineup(userClubId, assignment);
  while (!runner.isFinished()) runner.playRound(userClubId);
  return seasonStandings(world, season);
}

// ---------------------------------------------------------------------------
// Round-by-round runner (manager loop, SPEC §9)
// ---------------------------------------------------------------------------

export interface RoundResult {
  round: number;
  /** The user club's match this round (null if not managing a club). */
  userMatch: Match | null;
  /** All other matches this round. */
  otherMatches: Match[];
  /** Auto-replacements applied to the user's lineup (suspensions/injuries). */
  replacements: Fielded['replacements'];
  /** Injuries suffered by the user's club this round. */
  injuries: TeamInjury[];
  standings: StandingRow[];
  /** Affari AI chiusi in questa giornata di finestra (MODULE_MARKET §7). */
  marketNews: DealNews[];
  /** Offerte dei club AI per i giocatori dell'utente. */
  offers: IncomingOffer[];
}

/** Il ritorno di un turno di coppa nel campionato (ponte v2, MODULE_CUPS §3). */
export interface CupEffects {
  /** Infortuni di coppa: il giocatore salta le prossime `matches` giornate di lega. */
  injuries: { playerId: PlayerId; matches: number }[];
  /** Chi ha giocato in coppa: gambe pesanti alla PROSSIMA giornata di lega. */
  fatigued: PlayerId[];
}

/**
 * DIRETTA (richiesta utente): la partita dell'utente giocata a FINESTRE, con
 * sostituzioni e cambi-piano che CONTANO (ratings/stili ricalcolati per finestra).
 * Il quick-result classico resta byte-identico: la diretta è un percorso opt-in.
 */
export interface LiveWindow {
  from: number;
  to: number;
  xgHome: number;
  xgAway: number;
  shotsHome: number;
  shotsAway: number;
}

/** Voto e numeri DI QUESTA gara per un giocatore (tutti e 22, G1 riusato). */
export interface LiveRating {
  playerId: PlayerId;
  side: 'home' | 'away';
  pagella: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  keyPasses: number;
  tacklesWon: number;
  saves: number;
}

export interface LiveMatchSession {
  match: Match;
  userIsHome: boolean;
  minute(): number;
  /** 90 + recupero (deciso al fischio d'inizio, 91-95). */
  fullTime(): number;
  finished(): boolean;
  score(): { home: number; away: number };
  xg(): { home: number; away: number };
  shots(): { home: number; away: number };
  /** Eventi accaduti finora (ordinati per minuto). */
  events(): MatchEvent[];
  /** Gli 11 in campo ADESSO per lato. */
  onPitch(side: 'home' | 'away'): Player[];
  /** Gli 11 con lo SLOT di reparto (GK/DF/MF/FW): per disegnare il modulo vero. */
  onPitchEntries(side: 'home' | 'away'): { player: Player; slot: Position }[];
  /** La panchina residua dell'UTENTE. */
  bench(): Player[];
  subsLeft(): number;
  /**
   * Cambi ANNUNCIATI al quarto uomo: entrano alla prossima INTERRUZIONE di gioco
   * (fallo/rimessa entro 1-3′, o prima se arriva un evento vero). Annullabili
   * finché il giocatore non è effettivamente entrato.
   */
  pendingSubs(): { outId: PlayerId; inId: PlayerId; executeAt: number }[];
  cancelSub(outId: PlayerId): boolean;
  /** Infortuni dell'utente accaduti finora (per il racconto). */
  injuriesSoFar(): { player: Player; minute: number }[];
  /** Le finestre simulate (per la barra del momentum). */
  windows(): LiveWindow[];
  /**
   * PAGELLE E STATISTICHE VIVE di tutti i giocatori scesi in campo (entrambe le
   * squadre): l'attribuzione G1 vera sui numeri parziali della gara, on demand.
   */
  matchRatings(): LiveRating[];
  /** Avanza la diretta fino al minuto chiesto (max 90). */
  playTo(minute: number): void;
  /**
   * ANNUNCIA una sostituzione (max 5 tra fatte e annunciate): il cambio entra
   * alla prossima interruzione di gioco, non all'istante.
   */
  sub(outId: PlayerId, inId: PlayerId): boolean;
  /** Chiude la gara (gioca fino al 90'), il resto della giornata e i conti. */
  finish(): RoundResult;
}

export interface SeasonRunner {
  totalRounds(): number;
  nextRound(): number;
  isFinished(): boolean;
  /** Set the user club's lineup for subsequent rounds (sticky). */
  setLineup(clubId: ClubId, assignment: SlotAssignment): void;
  /** La formazione corrente impostata per un club (lettura pura; UI Formazione). */
  lineup(clubId: ClubId): SlotAssignment | undefined;
  /** Simulate the next round; `userClubId` marks whose match to surface. */
  playRound(userClubId?: ClubId): RoundResult;
  /**
   * DIRETTA: apre la giornata fermandosi alla partita dell'utente (motore xg).
   * Null se l'utente non gioca in questo turno o il motore non è xg — in quel
   * caso il chiamante usa playRound. La sessione VA chiusa con finish().
   */
  playRoundLive(userClubId: ClubId): LiveMatchSession | null;
  /**
   * Indisponibili di ADESSO per un club della lega (lettura pura, niente consumi):
   * squalificati + infortunati alla prossima giornata + fuori lista. Per la coppa (v2).
   */
  unavailableNow(clubId: ClubId): Set<PlayerId>;
  /** Versa nel runner gli effetti di un turno di coppa (infortuni + fatica). */
  applyCupEffects(effects: CupEffects): void;
  /**
   * Estate (MODULE_EVENTS §1-2): un modificatore club-livello per le prossime
   * `rounds` giornate — boost>1 = ritiro, boost<1 = gambe da tour. Gli stack convivono.
   */
  applyPreparation(
    clubId: ClubId,
    effect: { boost: number; injuryMult: number; rounds: number },
  ): void;
  /** Concerto a ridosso del match (MODULE_EVENTS §3): campo segnato fino a `untilRound`. */
  applyPitchWear(clubId: ClubId, untilRound: number): void;
  /** Manto erboso di casa (MODULE_STADIUM): 'media' rimuove la voce (neutro). */
  setGrass(clubId: ClubId, length: GrassLength): void;
  /** G1: statistiche stagionali (lettura pura) — tutta la lega, pagelle incluse. */
  playerStats(): ReadonlyMap<PlayerId, PlayerSeasonStats>;
  /** Piano partita del club (null lo rimuove); lettura con planOf. */
  setPlan(clubId: ClubId, plan: TeamPlan | null): void;
  planOf(clubId: ClubId): TeamPlan | undefined;
  /** Irrigazione di casa (MODULE_STADIUM): 'normale' rimuove la voce (neutro). */
  setWatering(clubId: ClubId, level: Watering): void;
  /**
   * Capture EVERYTHING the runner holds between rounds (mid-season save). Feeding it
   * back via `RunnerOptions.resume` continues the season byte-identically.
   */
  snapshot(): RunnerSnapshot;
}

/**
 * Serialisable mid-season state of a runner (plain JSON: Maps/Sets as entry arrays).
 * Contains only what is NOT derivable from the world at resume time — plus the
 * per-season frozen baselines (league context, expectations, styles) that must NOT be
 * recomputed from a world that has moved on since kick-off.
 */
export interface RunnerSnapshot {
  version: 1;
  cursor: number;
  round: number;
  suspendedNext: [ClubId, PlayerId[]][];
  injuredUntil: [PlayerId, number][];
  /** Ponte coppe v2: assente nei salvataggi pre-coppe (default vuoto). */
  fatiguedUntil?: [PlayerId, number][];
  /** Estate F4: assenti nei salvataggi precedenti (default vuoti). */
  preparation?: [ClubId, { until: number; boost: number; injuryMult: number }[]][];
  pitchWear?: [ClubId, number][];
  /** Manto erboso (MODULE_STADIUM): assente nei salvataggi precedenti (default media). */
  grass?: [ClubId, GrassLength][];
  /** Irrigazione (MODULE_STADIUM): assente nei salvataggi precedenti (default normale). */
  watering?: [ClubId, Watering][];
  /** G1: statistiche stagionali per giocatore (assenti nei save vecchi → da zero). */
  playerStats?: [PlayerId, PlayerSeasonStats][];
  /** Piano partita (assente nei save vecchi = nessun piano). */
  teamPlan?: [ClubId, TeamPlan][];
  rosterIneligible: [ClubId, PlayerId[]][];
  pressures: [ClubId, number][];
  coachQuality: [ClubId, number][];
  styles: [ClubId, StyleMatchMods][];
  expectedRank: [ClubId, number][];
  ctx: {
    strengths: [ClubId, TeamStrength][];
    avgAttack: number;
    avgDefense: number;
    meanOverall: number;
    stdOverall: number;
    xgProfile: XgProfile;
  };
  lineups: [ClubId, SlotAssignment][];
  rng: { main: RngState; events: RngState; market: RngState; perf: RngState };
}

/**
 * Build a runner that simulates a season one round at a time. Elo, league context
 * and suspensions are held across rounds. Lineups default to best natural XI;
 * inject a user assignment via setLineup. See SPEC.md §9.
 */
export interface RunnerOptions {
  /** Mercato AI nelle finestre (MODULE_MARKET §7). Default ON; OFF per la calibrazione
   *  del motore partita (che misura il motore puro, a rose congelate). */
  aiMarket?: boolean;
  /**
   * Resume from a mid-season snapshot: Elo is NOT re-initialised, the league context is
   * restored (not recomputed) and every RNG stream — including `rng` — is repositioned.
   */
  resume?: RunnerSnapshot;
}

export function createRunner(
  world: World,
  season: Season,
  rng: Rng,
  opts: RunnerOptions = {},
): SeasonRunner {
  const aiMarketOn = opts.aiMarket !== false;
  const resume = opts.resume;
  const league = leagueById(world, season.leagueId);
  if (!resume) initialiseElo(world, league);
  const ctx: LeagueContext = resume
    ? {
        strengths: new Map(resume.ctx.strengths),
        avgAttack: resume.ctx.avgAttack,
        avgDefense: resume.ctx.avgDefense,
        meanOverall: resume.ctx.meanOverall,
        stdOverall: resume.ctx.stdOverall,
        xgProfile: resume.ctx.xgProfile,
      }
    : buildLeagueContext(world, league);
  const eventsRng = createRng((season.rngSeed ^ 0x9e3779b9) >>> 0);
  // Stream separato per il mercato: le partite restano byte-identiche col mercato attivo.
  const marketRng = createRng((season.rngSeed ^ 0x51ed270b) >>> 0);
  const perfRng = createRng((season.rngSeed ^ 0x51ed270b) >>> 0);
  if (resume) {
    rng.setState(resume.rng.main);
    eventsRng.setState(resume.rng.events);
    marketRng.setState(resume.rng.market);
    perfRng.setState(resume.rng.perf);
  }

  // Pre-season expectation: rank clubs by reputation (0 = expected top). Used by morale.
  const expectedRank = new Map<ClubId, number>(resume?.expectedRank ?? []);
  if (!resume) {
    league.clubIds
      .map((id) => world.clubs.get(id))
      .filter((c): c is Club => c !== undefined)
      .sort((a, b) => b.reputation - a.reputation)
      .forEach((c, i) => expectedRank.set(c.id, i));
  }
  // Registration lists are fixed for the season: compute each club's ineligible set once.
  const rosterIneligible = new Map<ClubId, Set<PlayerId>>();
  if (resume) {
    for (const [id, ids] of resume.rosterIneligible) rosterIneligible.set(id, new Set(ids));
  } else {
    for (const id of league.clubIds) {
      const club = world.clubs.get(id);
      if (club) rosterIneligible.set(id, ineligiblePlayers(world, club));
    }
  }
  const state: MatchState = resume
    ? {
        suspendedNext: new Map(resume.suspendedNext.map(([id, ids]) => [id, new Set(ids)])),
        injuredUntil: new Map(resume.injuredUntil),
        fatiguedUntil: new Map(resume.fatiguedUntil ?? []),
        preparation: new Map(resume.preparation ?? []),
        pitchWearUntil: new Map(resume.pitchWear ?? []),
        grass: new Map(resume.grass ?? []),
        watering: new Map(resume.watering ?? []),
        teamPlan: new Map(resume.teamPlan ?? []),
        playerStats: new Map(resume.playerStats ?? []),
        rosterIneligible,
        pressures: new Map(resume.pressures),
        coachQuality: new Map(resume.coachQuality),
        styles: new Map(resume.styles),
        round: resume.round,
      }
    : {
        suspendedNext: new Map<ClubId, Set<PlayerId>>(),
        injuredUntil: new Map<PlayerId, number>(),
        fatiguedUntil: new Map<PlayerId, number>(),
        preparation: new Map<ClubId, { until: number; boost: number; injuryMult: number }[]>(),
        pitchWearUntil: new Map<ClubId, number>(),
        grass: new Map<ClubId, GrassLength>(),
        watering: new Map<ClubId, Watering>(),
        teamPlan: new Map<ClubId, TeamPlan>(),
        playerStats: new Map<PlayerId, PlayerSeasonStats>(),
        rosterIneligible,
        pressures: new Map<ClubId, number>(),
        coachQuality: new Map(
          [...(world.managers?.values() ?? [])]
            .filter((m) => m.clubId !== null)
            .map((m) => [m.clubId as ClubId, m.reputation / 100]),
        ),
        styles: new Map(
          league.clubIds.flatMap((id) => {
            const club = world.clubs.get(id);
            if (!club) return [];
            const coach = [...(world.managers?.values() ?? [])].find((m) => m.clubId === id);
            return [[id, styleMods(world, club, coach)] as const];
          }),
        ),
        round: 0,
      };
  const lineups = new Map<ClubId, SlotAssignment>(resume?.lineups ?? []);

  const rounds = [...new Set(season.fixtures.map((m) => m.round))].sort((a, b) => a - b);
  let cursor = resume?.cursor ?? 0;
  season.status = cursor >= rounds.length ? 'finished' : 'in_progress';

  // ---- Pezzi CONDIVISI tra playRound (quick) e playRoundLive (diretta) ----
  /** FNV-1a per le decisioni leggere della diretta (interruzioni): zero draw RNG. */
  const hash32 = (s: string): number => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  type MoraleUpdate = {
    club: Club;
    appearance: Map<string, Appearance>;
    result: 'win' | 'draw' | 'loss';
  };
  type RoundAcc = {
    userMatch: Match | null;
    otherMatches: Match[];
    replacements: Fielded['replacements'];
    injuries: TeamInjury[];
    moraleUpdates: MoraleUpdate[];
  };

  /** Testa della giornata: scadenze (fatica/preparazione/usura) + pressioni. */
  const beginRound = (): number => {
    const round = rounds[cursor] as number;
    state.round = round;
    for (const [pid, until] of state.fatiguedUntil) {
      if (until < round) state.fatiguedUntil.delete(pid);
    }
    for (const [id, list] of state.preparation) {
      const alive = list.filter((e) => e.until >= round);
      if (alive.length === 0) state.preparation.delete(id);
      else if (alive.length !== list.length) state.preparation.set(id, alive);
    }
    for (const [id, until] of state.pitchWearUntil) {
      if (until < round) state.pitchWearUntil.delete(id);
    }
    refreshPressures(world, season, league, expectedRank, state);
    return round;
  };

  /** Registra una partita giocata: morale + cattura del match dell'utente. */
  const collectPlayed = (
    acc: RoundAcc,
    match: Match,
    played: ReturnType<typeof playMatch>,
    userClubId?: ClubId,
  ): void => {
    const home = world.clubs.get(match.homeClubId);
    const away = world.clubs.get(match.awayClubId);
    const hg = match.homeGoals ?? 0;
    const ag = match.awayGoals ?? 0;
    const homeRes = hg > ag ? 'win' : hg < ag ? 'loss' : 'draw';
    if (home)
      acc.moraleUpdates.push({ club: home, appearance: played.homeAppearance, result: homeRes });
    if (away)
      acc.moraleUpdates.push({
        club: away,
        appearance: played.awayAppearance,
        result: homeRes === 'win' ? 'loss' : homeRes === 'loss' ? 'win' : 'draw',
      });

    if (userClubId && (match.homeClubId === userClubId || match.awayClubId === userClubId)) {
      acc.userMatch = match;
      const isHome = match.homeClubId === userClubId;
      acc.replacements = isHome ? played.home.replacements : played.away.replacements;
      acc.injuries = isHome ? played.homeInjuries : played.awayInjuries;
    } else {
      acc.otherMatches.push(match);
    }
  };

  /** Coda della giornata: morale, adattamento, cantieri, tesoro, mercato, cursore. */
  const finishRound = (
    round: number,
    userClubId: ClubId | undefined,
    acc: RoundAcc,
  ): RoundResult => {
    const standings = computeStandings(league.clubIds, season.fixtures);
    const actualRank = new Map(standings.map((r, i) => [r.clubId, i]));
    for (const u of acc.moraleUpdates) {
      const posDelta = (expectedRank.get(u.club.id) ?? 0) - (actualRank.get(u.club.id) ?? 0);
      updateMoraleForClub(world, u.club, u.appearance, u.result, posDelta);
    }

    tickAdaptation(world, league);
    tickStadiumProjects(world, league.clubIds);

    if (userClubId) {
      const userClub = world.clubs.get(userClubId);
      if (userClub) tickUserFinances(world, userClub, season, round, rounds.length);
    }

    let marketNews: DealNews[] = [];
    let offers: IncomingOffer[] = [];
    if (aiMarketOn) {
      if (marketWindowOpen(round, rounds.length)) {
        marketNews = aiMarketRound(world, league, round, rounds.length, marketRng, userClubId);
        if (userClubId) {
          const userClub = world.clubs.get(userClubId);
          if (userClub) {
            offers = aiOffersForUser(
              world,
              league,
              userClub,
              round,
              rounds.length,
              marketRng,
              (pid) => {
                const p = world.players.get(pid);
                return p
                  ? performanceFactor(state.playerStats.get(pid), p.position, league.tier)
                  : 1;
              },
            );
          }
        }
      }
      marketNews = [
        ...marketNews,
        ...marketRumors(world, league, round, rounds.length, marketRng, userClubId),
      ];
    }

    cursor++;
    if (cursor >= rounds.length) season.status = 'finished';
    return {
      round,
      userMatch: acc.userMatch,
      otherMatches: acc.otherMatches,
      replacements: acc.replacements,
      injuries: acc.injuries,
      standings,
      marketNews,
      offers,
    };
  };

  return {
    totalRounds: () => rounds.length,
    nextRound: () => rounds[cursor] ?? rounds.length + 1,
    isFinished: () => cursor >= rounds.length,
    setLineup: (clubId, assignment) => {
      lineups.set(clubId, assignment);
    },
    lineup: (clubId) => lineups.get(clubId),
    // Ponte coppe v2 (MODULE_CUPS §3): lettura pura degli indisponibili — le
    // squalifiche NON si consumano qui (le serve la prossima giornata di lega).
    unavailableNow: (clubId) => {
      const next = rounds[cursor] ?? state.round + 1;
      const out = new Set<PlayerId>(state.suspendedNext.get(clubId) ?? []);
      const club = world.clubs.get(clubId);
      for (const pid of club?.playerIds ?? []) {
        if ((state.injuredUntil.get(pid) ?? 0) >= next) out.add(pid);
      }
      for (const pid of state.rosterIneligible.get(clubId) ?? []) out.add(pid);
      return out;
    },
    applyCupEffects: (effects) => {
      const next = rounds[cursor] ?? state.round + 1;
      for (const inj of effects.injuries) {
        const until = state.round + inj.matches;
        state.injuredUntil.set(
          inj.playerId,
          Math.max(state.injuredUntil.get(inj.playerId) ?? 0, until),
        );
      }
      for (const pid of effects.fatigued) state.fatiguedUntil.set(pid, next);
    },
    applyPreparation: (clubId, effect) => {
      if (effect.rounds <= 0) return;
      const next = rounds[cursor] ?? state.round + 1;
      const list = state.preparation.get(clubId) ?? [];
      list.push({
        until: next + effect.rounds - 1,
        boost: effect.boost,
        injuryMult: effect.injuryMult,
      });
      state.preparation.set(clubId, list);
    },
    applyPitchWear: (clubId, untilRound) => {
      state.pitchWearUntil.set(clubId, Math.max(state.pitchWearUntil.get(clubId) ?? 0, untilRound));
    },
    playerStats: () => state.playerStats,
    setPlan: (clubId, plan) => {
      if (plan) state.teamPlan.set(clubId, plan);
      else state.teamPlan.delete(clubId);
    },
    planOf: (clubId) => state.teamPlan.get(clubId),
    setGrass: (clubId, length) => {
      if (length === 'media') state.grass.delete(clubId);
      else state.grass.set(clubId, length);
    },
    setWatering: (clubId, level) => {
      if (level === 'normale') state.watering.delete(clubId);
      else state.watering.set(clubId, level);
    },
    snapshot: () => ({
      version: 1,
      cursor,
      round: state.round,
      suspendedNext: [...state.suspendedNext].map(([id, set]) => [id, [...set]]),
      injuredUntil: [...state.injuredUntil],
      fatiguedUntil: [...state.fatiguedUntil],
      preparation: [...state.preparation].map(([id, list]) => [id, list.map((e) => ({ ...e }))]),
      pitchWear: [...state.pitchWearUntil],
      grass: [...state.grass],
      watering: [...state.watering],
      playerStats: [...state.playerStats].map(([id, s]) => [id, { ...s }]),
      teamPlan: [...state.teamPlan].map(([id, p]) => [id, JSON.parse(JSON.stringify(p))]),
      rosterIneligible: [...state.rosterIneligible].map(([id, set]) => [id, [...set]]),
      pressures: [...state.pressures],
      coachQuality: [...state.coachQuality],
      styles: [...state.styles].map(([id, m]) => [id, { ...m }]),
      expectedRank: [...expectedRank],
      ctx: {
        strengths: [...ctx.strengths].map(([id, s]) => [id, { ...s }]),
        avgAttack: ctx.avgAttack,
        avgDefense: ctx.avgDefense,
        meanOverall: ctx.meanOverall,
        stdOverall: ctx.stdOverall,
        xgProfile: { ...ctx.xgProfile },
      },
      lineups: [...lineups].map(([id, a]) => [id, a.map((x) => ({ ...x }))]),
      rng: {
        main: rng.getState(),
        events: eventsRng.getState(),
        market: marketRng.getState(),
        perf: perfRng.getState(),
      },
    }),
    playRound: (userClubId) => {
      const round = beginRound();
      const matches = season.fixtures.filter((m) => m.round === round);
      const acc: RoundAcc = {
        userMatch: null,
        otherMatches: [],
        replacements: [],
        injuries: [],
        moraleUpdates: [],
      };
      for (const match of matches) {
        collectPlayed(
          acc,
          match,
          playMatch(world, ctx, state, lineups, match, rng, eventsRng, perfRng),
          userClubId,
        );
      }
      return finishRound(round, userClubId, acc);
    },

    // ---- DIRETTA (richiesta utente): la partita dell'utente a finestre ----
    playRoundLive: (userClubId) => {
      if (getMatchEngine() !== 'xg') return null;
      if (cursor >= rounds.length) return null;
      const roundPeek = rounds[cursor] as number;
      const matches = season.fixtures.filter((m) => m.round === roundPeek);
      const userIdx = matches.findIndex(
        (m) => m.homeClubId === userClubId || m.awayClubId === userClubId,
      );
      if (userIdx < 0) return null;

      const round = beginRound();
      const acc: RoundAcc = {
        userMatch: null,
        otherMatches: [],
        replacements: [],
        injuries: [],
        moraleUpdates: [],
      };
      // Le partite PRIMA della nostra si giocano subito (ordine del calendario).
      for (let i = 0; i < userIdx; i++) {
        const m = matches[i] as Match;
        collectPlayed(
          acc,
          m,
          playMatch(world, ctx, state, lineups, m, rng, eventsRng, perfRng),
          userClubId,
        );
      }
      const post = matches.slice(userIdx + 1);
      const match = matches[userIdx] as Match;

      // ---- Preparazione (specchio fedele di playMatch, senza punteggio) ----
      const home = world.clubs.get(match.homeClubId);
      const away = world.clubs.get(match.awayClubId);
      if (!home || !away) throw new Error(`Match ${match.id} references unknown club`);
      const homeUnavail = unavailableFor(home, state);
      const awayUnavail = unavailableFor(away, state);
      applyCoachPick(world, home, homeUnavail, lineups, state, perfRng);
      applyCoachPick(world, away, awayUnavail, lineups, state, perfRng);
      const homeFielded = fieldClub(home, world, homeUnavail, lineups);
      const awayFielded = fieldClub(away, world, awayUnavail, lineups);
      const homeSide = {
        clubId: home.id,
        xi: homeFielded.players,
        bench: benchFor(home, world, homeUnavail, homeFielded.players),
      };
      const awaySide = {
        clubId: away.id,
        xi: awayFielded.players,
        bench: benchFor(away, world, awayUnavail, awayFielded.players),
      };
      const duelPlan = planDuels(homeFielded.players, awayFielded.players, world.players, {
        home: planDuelFactor(state.teamPlan.get(home.id)),
        away: planDuelFactor(state.teamPlan.get(away.id)),
      });
      const prepOf = (clubId: ClubId) => {
        let boost = 1;
        let injuryMult = 1;
        for (const e of state.preparation.get(clubId) ?? []) {
          if (e.until >= state.round) {
            boost *= e.boost;
            injuryMult *= e.injuryMult;
          }
        }
        return { boost, injuryMult };
      };
      const homePrep = prepOf(home.id);
      const awayPrep = prepOf(away.id);
      for (const [prep, xi] of [
        [homePrep, homeFielded.players],
        [awayPrep, awayFielded.players],
      ] as const) {
        if (prep.injuryMult === 1) continue;
        for (const p of xi) {
          const entry = duelPlan.mods.get(p.id) ?? { cardMult: 1, injMult: 1 };
          entry.injMult *= prep.injuryMult;
          duelPlan.mods.set(p.id, entry);
        }
      }
      const script = buildMatchScript(homeSide, awaySide, eventsRng, duelPlan.mods);

      const userIsHome = match.homeClubId === userClubId;
      const oppClubId = userIsHome ? match.awayClubId : match.homeClubId;
      const userFielded = userIsHome ? homeFielded : awayFielded;
      const userScriptSide = userIsHome ? script.home : script.away;
      const oppScriptSide = userIsHome ? script.away : script.home;
      const userInjuries = userIsHome ? script.homeInjuries : script.awayInjuries;

      // XI correnti (l'utente muta coi SUOI cambi; l'avversario segue lo script).
      const curXI = {
        home: [...homeFielded.players],
        away: [...awayFielded.players],
      };
      const slotOf = new Map<PlayerId, Position>();
      for (const e of [...homeFielded.entries, ...awayFielded.entries])
        slotOf.set(e.player.id, e.slot);
      // Panchina VERA da matchday: 9 posti, i migliori (non tutta la rosa).
      const userBench = [...(userIsHome ? homeSide : awaySide).bench].slice(0, 9);

      // Timeline in campo: l'utente la scriviamo NOI, l'avversario dallo script.
      const userPitch: OnPitch[] = (userIsHome ? homeFielded : awayFielded).players.map((p) => ({
        player: p,
        entry: 0,
        exit: MATCH_END,
      }));
      const oppPitch: OnPitch[] = userIsHome ? script.awayLineup : script.homeLineup;

      // Eventi scriptati che accadranno: cartellini di ENTRAMBI, cambi dell'AVVERSARIO.
      // I cambi scriptati dell'utente si buttano: in diretta decide LUI.
      const scripted = script.events
        .filter((e) => e.type !== 'sub' || e.clubId === oppClubId)
        .sort((a, b) => a.minute - b.minute);
      const suppressedSubs = script.events.filter(
        (e) => e.type === 'sub' && e.clubId === userClubId,
      );
      const userRedMinutes = script.events
        .filter((e) => e.type === 'red' && e.clubId === userClubId)
        .map((e) => e.minute);
      // Infortuni utente: il minuto viene dal cambio scriptato soppresso (subOut =
      // infortunato) o dagli "scoperti" dello script (reds meno i rossi veri).
      const uncovered = userScriptSide.reds.filter((m) => !userRedMinutes.includes(m));
      let uncIdx = 0;
      const userInjuryPlan = userInjuries
        .map((inj) => ({
          player: inj.player,
          minute:
            suppressedSubs.find((s) => s.subOutId === inj.player.id)?.minute ??
            uncovered[uncIdx++] ??
            55,
        }))
        .sort((a, b) => a.minute - b.minute);

      // Uomo-in-meno dinamico: rossi veri dell'utente + scoperti maturati in diretta.
      const userManDown: number[] = [...userRedMinutes];
      const userReshapeFrom: number | null = null;

      const character = drawXgCharacter(rng);
      // RECUPERO deciso al fischio d'inizio (91-95): il totale-gara resta lo stesso
      // (le quote-finestra si normalizzano su FULL_TIME: stessa distribuzione).
      const FULL_TIME = 90 + 1 + (hash32(`${match.id}|recupero`) % 5);
      let minuteNow = 0;
      let scoreH = 0;
      let scoreA = 0;
      let xgH = 0;
      let xgA = 0;
      let shH = 0;
      let shA = 0;
      let subsUsed = 0;
      let done = false;
      /** Cambi ANNUNCIATI: entrano alla prossima interruzione (realismo utente). */
      const pendingSubs: { outId: PlayerId; inId: PlayerId; executeAt: number }[] = [];
      const liveEvents: MatchEvent[] = [];
      const winLog: LiveWindow[] = [];
      const injuriesSoFar: { player: Player; minute: number }[] = [];
      let scriptIdx = 0;
      let injIdx = 0;

      const coachOf = (club: Club) =>
        [...(world.managers?.values() ?? [])].find((m) => m.clubId === club.id);
      const styleOf = (club: Club, myXI: Player[], oppXI: Player[]): StyleMatchMods => {
        const plan = state.teamPlan.get(club.id);
        const override = plan?.style
          ? planStyleMods(world, club, coachOf(club), plan.style)
          : undefined;
        const base = pitchStyle(world, state, match.homeClubId, club.id, override);
        return plan ? applyTeamPlan(base, plan, myXI, oppXI) : base;
      };
      const fieldedLike = (base: Fielded, xi: Player[]): Fielded => ({
        ...base,
        players: xi,
        entries: xi.map((p) => ({ player: p, slot: slotOf.get(p.id) ?? p.position })),
      });
      const fatigueOf = (xi: Player[]) => {
        let n = 0;
        for (const p of xi) if ((state.fatiguedUntil.get(p.id) ?? 0) >= state.round) n++;
        return 1 - CUP.FATIGUE_MALUS * (n / 11);
      };
      const ratingsOf = (club: Club, base: Fielded, xi: Player[], prepBoost: number) => {
        const f = fieldedLike(base, xi);
        const captain = state.teamPlan.get(club.id)?.setPiece?.captainId;
        const eff = effectiveRatingsFor(
          matchStrength(f, perfRng, state.pressures.get(club.id) ?? 0, captain),
          club,
          ctx,
        );
        const k = fatigueOf(xi) * prepBoost;
        return { attack: eff.attack * k, defense: eff.defense * k };
      };
      const mapManDown = (
        mins: number[],
        reshape: number | null,
        a: number,
        b: number,
      ): TeamManDown => ({
        reds: mins.filter((m) => m < b).map((m) => (m <= a ? 0 : ((m - a) / (b - a)) * 90)),
        reshapeFrom:
          reshape !== null && reshape < b
            ? reshape <= a
              ? 0
              : ((reshape - a) / (b - a)) * 90
            : null,
      });

      const simWindow = (a: number, b: number): void => {
        if (b <= a) return;
        const shareDen = FULL_TIME;
        const homeXI = curXI.home;
        const awayXI = curXI.away;
        const userMD: TeamManDown = { reds: userManDown, reshapeFrom: userReshapeFrom };
        const oppMD: TeamManDown = {
          reds: oppScriptSide.reds,
          reshapeFrom: oppScriptSide.reshapeFrom,
        };
        const r = simulateWindowXg(
          ratingsOf(home, homeFielded, homeXI, homePrep.boost),
          ratingsOf(away, awayFielded, awayXI, awayPrep.boost),
          ctx,
          rng,
          {
            share: (b - a) / shareDen,
            character,
            score: { home: scoreH, away: scoreA },
            sendOffs: {
              home: mapManDown(
                userIsHome ? userMD.reds : oppMD.reds,
                userIsHome ? userMD.reshapeFrom : oppMD.reshapeFrom,
                a,
                b,
              ),
              away: mapManDown(
                userIsHome ? oppMD.reds : userMD.reds,
                userIsHome ? oppMD.reshapeFrom : userMD.reshapeFrom,
                a,
                b,
              ),
            },
            styles: {
              home: styleOf(home, homeXI, awayXI),
              away: styleOf(away, awayXI, homeXI),
            },
          },
        );
        // Nel RECUPERO l'attribuzione si fa "al 90'" (le timeline arrivano lì),
        // poi il minuto dell'evento viene rimappato sul cronometro vero (90+X).
        const attributeWindowGoals = (clubId: ClubId, pitch: OnPitch[], n: number): void => {
          const evs = assignGoalsInWindow(
            clubId,
            pitch,
            n,
            eventsRng,
            Math.min(a + 1, 90),
            Math.min(b, 90),
          );
          if (a >= 90) for (const ev of evs) ev.minute = Math.min(FULL_TIME, a + 1);
          liveEvents.push(...evs);
        };
        if (r.homeGoals > 0)
          attributeWindowGoals(match.homeClubId, userIsHome ? userPitch : oppPitch, r.homeGoals);
        if (r.awayGoals > 0)
          attributeWindowGoals(match.awayClubId, userIsHome ? oppPitch : userPitch, r.awayGoals);
        scoreH += r.homeGoals;
        scoreA += r.awayGoals;
        xgH += r.xgHome;
        xgA += r.xgAway;
        shH += r.shotsHome;
        shA += r.shotsAway;
        winLog.push({
          from: a,
          to: b,
          xgHome: r.xgHome,
          xgAway: r.xgAway,
          shotsHome: r.shotsHome,
          shotsAway: r.shotsAway,
        });
      };

      /** Copre un infortunio dell'utente come farebbe il vice: panca, stesso ruolo. */
      const coverInjury = (out: Player, minute: number): void => {
        const slot = slotOf.get(out.id) ?? out.position;
        const reserved = new Set(pendingSubs.map((ps) => ps.inId as string));
        const pool = userBench.filter((p) => !reserved.has(p.id as string));
        const pick =
          pool.find((p) => p.position === slot) ??
          pool.find((p) => p.position === out.position) ??
          pool[0];
        if (pick && subsUsed + pendingSubs.length < 5) {
          subsUsed++;
          userBench.splice(userBench.indexOf(pick), 1);
          const key = userIsHome ? 'home' : 'away';
          curXI[key] = curXI[key].map((p) => (p.id === out.id ? pick : p));
          slotOf.set(pick.id, slot);
          userPitch.push({ player: pick, entry: minute, exit: MATCH_END });
          liveEvents.push({
            minute,
            type: 'sub',
            clubId: userClubId,
            playerId: pick.id,
            assistId: null,
            subOutId: out.id,
          });
        } else {
          // Nessuno da mettere: si resta in dieci (uomo-in-meno da qui).
          userManDown.push(minute);
        }
      };

      const applyStructural = (minute: number): void => {
        while (
          scriptIdx < scripted.length &&
          (scripted[scriptIdx] as MatchEvent).minute <= minute
        ) {
          const e = scripted[scriptIdx] as MatchEvent;
          scriptIdx++;
          liveEvents.push(e);
          if (e.type === 'red') {
            const pitch = e.clubId === userClubId ? userPitch : oppPitch;
            const entry = pitch.find((o) => o.player.id === e.playerId && o.exit === MATCH_END);
            if (entry) entry.exit = e.minute;
          }
          if (e.type === 'sub' && e.clubId === oppClubId) {
            const key = userIsHome ? 'away' : 'home';
            const incoming = world.players.get(e.playerId);
            if (incoming && e.subOutId) {
              curXI[key] = curXI[key].map((p) => (p.id === e.subOutId ? incoming : p));
              slotOf.set(incoming.id, slotOf.get(e.subOutId) ?? incoming.position);
            }
          }
        }
        while (injIdx < userInjuryPlan.length && (userInjuryPlan[injIdx]?.minute ?? 99) <= minute) {
          const inj = userInjuryPlan[injIdx] as { player: Player; minute: number };
          injIdx++;
          injuriesSoFar.push(inj);
          const entry = userPitch.find(
            (o) => o.player.id === inj.player.id && o.exit === MATCH_END,
          );
          if (entry) {
            entry.exit = inj.minute;
            coverInjury(inj.player, inj.minute);
          }
        }
        // Il gioco si è fermato (evento o interruzione simulata): entrano gli annunciati.
        executePendingSubs(minute);
      };

      /** Esegue i cambi annunciati maturati: l'interruzione è arrivata. */
      const executePendingSubs = (minute: number): void => {
        for (const ps of [...pendingSubs]) {
          if (ps.executeAt > minute) continue;
          pendingSubs.splice(pendingSubs.indexOf(ps), 1);
          const key = userIsHome ? 'home' : 'away';
          const inn = userBench.find((p) => p.id === ps.inId);
          const entry = userPitch.find((o) => o.player.id === ps.outId && o.exit === MATCH_END);
          // Se l'uscente nel frattempo è uscito (rosso/infortunio), il cambio salta.
          if (!inn || !entry) continue;
          const at = Math.max(1, ps.executeAt);
          subsUsed++;
          entry.exit = at;
          userBench.splice(userBench.indexOf(inn), 1);
          curXI[key] = curXI[key].map((p) => (p.id === ps.outId ? inn : p));
          slotOf.set(inn.id, slotOf.get(ps.outId) ?? inn.position);
          userPitch.push({ player: inn, entry: at, exit: MATCH_END });
          liveEvents.push({
            minute: at,
            type: 'sub',
            clubId: userClubId,
            playerId: ps.inId,
            assistId: null,
            subOutId: ps.outId,
          });
        }
      };

      const nextStructuralAfter = (minute: number): number => {
        const s = scripted[scriptIdx]?.minute ?? FULL_TIME + 1;
        const i = userInjuryPlan[injIdx]?.minute ?? FULL_TIME + 1;
        const ps = pendingSubs.reduce((m, x) => Math.min(m, x.executeAt), FULL_TIME + 1);
        // L'INTERVALLO è un'interruzione vera: la finestra si spezza al 45'.
        const ht = minute < 45 ? 45 : FULL_TIME + 1;
        const next = Math.min(s, i, ps, ht, FULL_TIME + 1);
        return next > minute ? next : minute + 1;
      };

      const playToInner = (target: number): void => {
        const goal = Math.max(0, Math.min(FULL_TIME, Math.round(target)));
        while (minuteNow < goal) {
          const stop = Math.min(goal, nextStructuralAfter(minuteNow));
          simWindow(minuteNow, stop);
          minuteNow = stop;
          applyStructural(minuteNow);
        }
      };

      const session: LiveMatchSession = {
        match,
        userIsHome,
        minute: () => minuteNow,
        fullTime: () => FULL_TIME,
        finished: () => done,
        score: () => ({ home: scoreH, away: scoreA }),
        xg: () => ({ home: xgH, away: xgA }),
        shots: () => ({ home: shH, away: shA }),
        events: () => [...liveEvents].sort((x, y) => x.minute - y.minute),
        onPitch: (side) => [...curXI[side]],
        onPitchEntries: (side) =>
          curXI[side].map((p) => ({ player: p, slot: slotOf.get(p.id) ?? p.position })),
        bench: () => {
          const reserved = new Set(pendingSubs.map((ps) => ps.inId as string));
          return userBench.filter((p) => !reserved.has(p.id as string));
        },
        subsLeft: () => 5 - subsUsed - pendingSubs.length,
        pendingSubs: () => pendingSubs.map((ps) => ({ ...ps })),
        cancelSub: (outId) => {
          const idx = pendingSubs.findIndex((ps) => ps.outId === outId);
          if (idx < 0) return false;
          pendingSubs.splice(idx, 1);
          return true;
        },
        injuriesSoFar: () => [...injuriesSoFar],
        windows: () => [...winLog],
        matchRatings: () => {
          // L'attribuzione G1 VERA sui numeri parziali, su una mappa usa-e-getta:
          // pagelle e statistiche vive per tutti i giocatori scesi in campo.
          const temp = new Map<PlayerId, PlayerSeasonStats>();
          const tempMatch: Match = {
            ...match,
            homeGoals: scoreH,
            awayGoals: scoreA,
            played: true,
            events: [...liveEvents].sort((x, y) => x.minute - y.minute),
          };
          accumulateMatchStats(
            temp,
            world,
            tempMatch,
            homeFielded.players,
            awayFielded.players,
            { home: xgH, away: xgA },
            { home: Math.max(scoreH, shH), away: Math.max(scoreA, shA) },
          );
          // Il lato dalle timeline vere: chi è passato dal campo di casa è di casa.
          const homePitchIds = new Set(
            (userIsHome ? userPitch : oppPitch).map((o) => o.player.id as string),
          );
          const out: LiveRating[] = [];
          for (const [pid, st] of temp) {
            if (st.apps === 0) continue;
            out.push({
              playerId: pid,
              side: homePitchIds.has(pid as string) ? 'home' : 'away',
              pagella: st.ratingSum,
              minutes: st.minutes,
              goals: st.goals,
              assists: st.assists,
              shots: st.shots,
              keyPasses: st.keyPasses,
              tacklesWon: st.tacklesWon,
              saves: st.saves,
            });
          }
          return out;
        },
        playTo: (m) => {
          if (!done) playToInner(m);
        },
        sub: (outId, inId) => {
          // Si ANNUNCIA al quarto uomo: il cambio entra alla prossima interruzione
          // (fallo/rimessa simulata entro 1-3′, o prima se arriva un evento vero).
          if (done || subsUsed + pendingSubs.length >= 5) return false;
          const key = userIsHome ? 'home' : 'away';
          const reserved = new Set(pendingSubs.map((ps) => ps.inId as string));
          const out = curXI[key].find((p) => p.id === outId);
          const inn = userBench.find((p) => p.id === inId);
          const entry = userPitch.find((o) => o.player.id === outId && o.exit === MATCH_END);
          const alreadyOut = pendingSubs.some((ps) => ps.outId === outId);
          if (!out || !inn || !entry || reserved.has(inId as string) || alreadyOut) return false;
          // All'INTERVALLO il gioco è GIÀ fermo: il cambio entra subito.
          if (minuteNow === 45) {
            pendingSubs.push({ outId, inId, executeAt: 45 });
            executePendingSubs(45);
            return true;
          }
          const pause = 1 + (hash32(`${match.id}|stop|${minuteNow}|${outId}`) % 3);
          let executeAt = Math.min(FULL_TIME, minuteNow + pause);
          // Se il gioco si ferma PRIMA (evento vero o intervallo), si entra lì.
          const nextEvt = scripted[scriptIdx]?.minute ?? FULL_TIME + 1;
          const nextInj = userInjuryPlan[injIdx]?.minute ?? FULL_TIME + 1;
          const ht = minuteNow < 45 ? 45 : FULL_TIME + 1;
          const stop = Math.min(nextEvt, nextInj, ht);
          if (stop > minuteNow && stop < executeAt) executeAt = stop;
          pendingSubs.push({ outId, inId, executeAt });
          return true;
        },
        finish: () => {
          if (!done) {
            playToInner(FULL_TIME);
            done = true;
          }
          match.homeGoals = scoreH;
          match.awayGoals = scoreA;
          match.played = true;
          match.events = [...liveEvents].sort((x, y) => x.minute - y.minute);

          for (const e of match.events) {
            if (e.type !== 'red') continue;
            const bans = state.suspendedNext.get(e.clubId) ?? new Set<PlayerId>();
            bans.add(e.playerId);
            state.suspendedNext.set(e.clubId, bans);
          }
          for (const inj of [...script.homeInjuries, ...script.awayInjuries]) {
            state.injuredUntil.set(inj.player.id, state.round + inj.injury.durationMatches);
            if (inj.injury.severity === 'severe') applySevereHit(inj.player, eventsRng);
          }
          accumulateMatchStats(
            state.playerStats,
            world,
            match,
            homeFielded.players,
            awayFielded.players,
            { home: xgH, away: xgA },
            { home: Math.max(scoreH, shH), away: Math.max(scoreA, shA) },
          );
          const homeScore = scoreH > scoreA ? 1 : scoreH === scoreA ? 0.5 : 0;
          const updated = updateElo(home.elo, away.elo, homeScore, scoreH - scoreA);
          home.elo = updated.home;
          away.elo = updated.away;

          acc.moraleUpdates.push({
            club: home,
            appearance: appearanceMap(home, homeFielded, match.events, homeUnavail),
            result: homeScore === 1 ? 'win' : homeScore === 0 ? 'loss' : 'draw',
          });
          acc.moraleUpdates.push({
            club: away,
            appearance: appearanceMap(away, awayFielded, match.events, awayUnavail),
            result: homeScore === 1 ? 'loss' : homeScore === 0 ? 'win' : 'draw',
          });
          acc.userMatch = match;
          acc.replacements = userFielded.replacements;
          acc.injuries = userInjuries;

          for (const m2 of post) {
            collectPlayed(
              acc,
              m2,
              playMatch(world, ctx, state, lineups, m2, rng, eventsRng, perfRng),
              userClubId,
            );
          }
          return finishRound(round, userClubId, acc);
        },
      };
      return session;
    },
  };
}
