/**
 * Coppe nazionali knockout (F3, docs/MODULE_CUPS.md): Coppa Italia, FA Cup, League
 * Cup — formati fedeli, ristrette alle leghe esistenti. Corrono IN PARALLELO al
 * campionato con un RNG dedicato per coppa (stato persistito nel dato): i risultati
 * di lega sono byte-identici con o senza coppe. Puro, zero I/O; lo stato è delle shell.
 */

import type { ClubId, PlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import { type Club, type League, type MatchEvent, type World, nationById } from '../core/types.js';
import {
  FINANCES,
  clubSeasonLines,
  expectedPositionByReputation,
} from '../finances/season-economy.js';
import { type Rng, type RngState, createRng } from '../rng/rng.js';
import { planDuels } from './duels.js';
import { applySevereHit } from './injury.js';
import { type LeagueContext, buildLeagueContext, effectiveRatingsFor } from './league-context.js';
import { type SlotAssignment, matchStrength, naturalFielded, resolveAssignment } from './lineup.js';
import { assignGoals, buildMatchScript } from './match-events.js';
import { simulateScore } from './score-engine.js';

export const CUP = {
  /** I turni si giocano DOPO queste giornate di campionato (infrasettimanali). */
  AFTER_ROUNDS: [3, 8, 14, 20, 27, 34],
  /** La SECONDA coppa di una nazione (League Cup) è sfalsata: mai due gare a settimana. */
  AFTER_ROUNDS_ALT: [2, 6, 11, 17, 24, 31],
  /** Teste di serie (formati seeded): entrano direttamente agli ottavi. */
  BYES: 8,
  /** Nel formato FA Cup il turno preliminare tocca alle N di rango più basso. */
  PRELIM_TEAMS: 16,
  /** Premio per turno superato (indice = turno 0..4), × prizeMult della coppa. */
  PRIZES: [150_000, 300_000, 600_000, 1_200_000, 2_500_000],
  WINNER_PRIZE: 8_000_000,
  FINALIST_PRIZE: 3_000_000,
  /** Botteghino della gara interna di coppa vs gara di lega. */
  GATE_MULT: 0.8,
  /** Rigori: probabilità dalla forza relativa, mai una lotteria totale. */
  SHOOTOUT_CLAMP: 0.15,
  REP_WINNER: 2,
  REP_FINALIST: 1,
  /**
   * Ponte v2 (MODULE_CUPS §3): gambe pesanti alla giornata di lega successiva —
   * malus di squadra × (titolari affaticati / 11). Inattivo senza coppe.
   */
  FATIGUE_MALUS: 0.03,
} as const;

export interface CupTie {
  homeClubId: ClubId;
  awayClubId: ClubId;
  neutral: boolean;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  /** Valorizzato solo se decisa ai rigori. */
  shootout?: { home: number; away: number };
  winnerId: ClubId | null;
  events: MatchEvent[];
}

export interface CupStage {
  name: string;
  /** Giornata di campionato dopo la quale si gioca. */
  afterRound: number;
  ties: CupTie[];
  played: boolean;
}

export interface NationalCup {
  id: string;
  name: string;
  nationCode: string;
  year: number;
  /** Tabellone con teste di serie (Coppa Italia/League Cup) vs sorteggio (FA Cup). */
  seeded: boolean;
  prizeMult: number;
  /** Tutti i club iscritti, in ordine di rango (tier, poi reputazione). */
  entrants: ClubId[];
  /** Teste di serie (solo formati seeded): entrano agli ottavi. */
  byes: ClubId[];
  /** In corsa PRIMA del prossimo turno da giocare. */
  alive: ClubId[];
  stages: CupStage[];
  /** Indice del prossimo turno da giocare. */
  next: number;
  winnerId: ClubId | null;
  rngState: RngState;
  /** Squalifiche di coppa PER COMPETIZIONE (v2): rosso → salta il turno successivo. */
  suspended?: Record<string, string[]>;
}

/** Un infortunio maturato in coppa, da versare nel runner di lega (ponte v2). */
export interface CupInjuryEffect {
  clubId: ClubId;
  playerId: PlayerId;
  playerName: string;
  /** Giornate di stop (stesse durate del campionato). */
  matches: number;
  severe: boolean;
}

export interface CupStageReport {
  cupId: string;
  cupName: string;
  stageName: string;
  results: CupTie[];
  headlines: string[];
  finished: boolean;
  /** Infortuni del turno (ponte v2): la shell li versa nel runner di lega. */
  effects: CupInjuryEffect[];
  /** Chi è sceso in campo (XI), per club: alimenta la fatica in campionato. */
  participants: [ClubId, PlayerId[]][];
}

function hashCode(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Rank nazionale: prima il tier, poi la reputazione (le "teste di serie" reali). */
function rankedClubs(world: World, leagues: League[]): ClubId[] {
  return leagues
    .slice()
    .sort((a, b) => a.tier - b.tier)
    .flatMap((l) =>
      l.clubIds
        .map((id) => world.clubs.get(id))
        .filter((c): c is Club => c !== undefined)
        .sort((a, b) => b.reputation - a.reputation)
        .map((c) => c.id),
    );
}

/**
 * Crea le coppe dell'anno per ogni nazione con almeno una lega (MODULE_CUPS §1):
 * ITA → Coppa Italia; ENG → FA Cup + League Cup; altre → Coppa {nazione} seeded.
 */
export function createNationalCups(world: World, year: number, seed: number): NationalCup[] {
  const byNation = new Map<string, League[]>();
  for (const l of world.leagues) {
    const code = nationById(world, l.nationId)?.code ?? 'XXX';
    byNation.set(code, [...(byNation.get(code) ?? []), l]);
  }
  const cups: NationalCup[] = [];
  for (const [code, leagues] of byNation) {
    const nationName = nationById(world, leagues[0]!.nationId)?.name ?? code;
    const formats =
      code === 'ITA'
        ? [{ id: 'coppa-italia', name: 'Coppa Italia', seeded: true, prizeMult: 1.2 }]
        : code === 'ENG'
          ? [
              { id: 'fa-cup', name: 'FA Cup', seeded: false, prizeMult: 1.6 },
              { id: 'league-cup', name: 'League Cup', seeded: true, prizeMult: 0.7 },
            ]
          : [
              {
                id: `coppa-${code.toLowerCase()}`,
                name: `Coppa ${nationName}`,
                seeded: true,
                prizeMult: 1.0,
              },
            ];
    const entrants = rankedClubs(world, leagues);
    formats.forEach((f, fi) => {
      const rng = createRng((seed ^ hashCode(`${f.id}|${year}`)) >>> 0);
      const byes = f.seeded ? entrants.slice(0, CUP.BYES) : [];
      const calendar = fi > 0 ? CUP.AFTER_ROUNDS_ALT : CUP.AFTER_ROUNDS;
      const stageNames = f.seeded
        ? ['Primo turno', 'Secondo turno', 'Ottavi', 'Quarti', 'Semifinali', 'Finale']
        : ['Turno preliminare', 'Sedicesimi', 'Ottavi', 'Quarti', 'Semifinali', 'Finale'];
      cups.push({
        id: f.id,
        name: f.name,
        nationCode: code,
        year,
        seeded: f.seeded,
        prizeMult: f.prizeMult,
        entrants,
        byes,
        // Seeded: le 32 fuori dalle teste di serie partono dal primo turno.
        // FA Cup: al preliminare vanno le 16 di rango più basso; le altre attendono.
        alive: f.seeded ? entrants.slice(CUP.BYES) : entrants.slice(),
        stages: stageNames.map((name, i) => ({
          name,
          afterRound: calendar[i] ?? 34,
          ties: [],
          played: false,
        })),
        next: 0,
        winnerId: null,
        rngState: rng.getState(),
      });
    });
  }
  return cups;
}

/** Il rango di un club dentro la coppa (posizione tra gli iscritti; più basso = più forte). */
function cupRank(cup: NationalCup, id: ClubId): number {
  const i = cup.entrants.indexOf(id);
  return i < 0 ? cup.entrants.length : i;
}

/** Accoppia il turno: seeded = 1ª vs ultima (tabellone); FA Cup = sorteggio puro. */
function drawTies(cup: NationalCup, field: ClubId[], isFinal: boolean, rng: Rng): CupTie[] {
  const ties: CupTie[] = [];
  if (cup.seeded) {
    const sorted = field.slice().sort((a, b) => cupRank(cup, a) - cupRank(cup, b));
    for (let i = 0; i < sorted.length / 2; i++) {
      const better = sorted[i]!;
      const worse = sorted[sorted.length - 1 - i]!;
      ties.push(emptyTie(better, worse, isFinal));
    }
  } else {
    const pot = field.slice();
    // Fisher-Yates col RNG di coppa: l'estratta prima gioca in casa.
    for (let i = pot.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pot[i], pot[j]] = [pot[j]!, pot[i]!];
    }
    for (let i = 0; i < pot.length; i += 2) {
      ties.push(emptyTie(pot[i]!, pot[i + 1]!, isFinal));
    }
  }
  return ties;
}

function emptyTie(home: ClubId, away: ClubId, neutral: boolean): CupTie {
  return {
    homeClubId: home,
    awayClubId: away,
    neutral,
    played: false,
    homeGoals: null,
    awayGoals: null,
    winnerId: null,
    events: [],
  };
}

/** Contesto di forza NAZIONALE: entrambe le divisioni, profilo xG del tier 1. */
function cupContext(world: World, cup: NationalCup): LeagueContext {
  const leagues = world.leagues.filter(
    (l) => (nationById(world, l.nationId)?.code ?? 'XXX') === cup.nationCode,
  );
  const top = leagues.slice().sort((a, b) => a.tier - b.tier)[0]!;
  return buildLeagueContext(world, { ...top, clubIds: cup.entrants });
}

function playTie(
  world: World,
  ctx: LeagueContext,
  tie: CupTie,
  rng: Rng,
  lineups?: ReadonlyMap<ClubId, SlotAssignment>,
  unavailable?: ReadonlyMap<ClubId, ReadonlySet<PlayerId>>,
  bridge?: boolean,
): {
  injuries: CupInjuryEffect[];
  reds: [ClubId, PlayerId][];
  participants: [ClubId, PlayerId[]][];
} {
  const home = world.clubs.get(tie.homeClubId);
  const away = world.clubs.get(tie.awayClubId);
  if (!home || !away) throw new Error(`Cup tie references unknown club`);
  const field = (club: Club) => {
    const out = unavailable?.get(club.id) ?? new Set<PlayerId>();
    const a = lineups?.get(club.id);
    return a ? resolveAssignment(a, club, world, out) : naturalFielded(club, world, out);
  };
  const homeFielded = field(home);
  const awayFielded = field(away);
  const bench = (club: Club, onPitch: Set<PlayerId>) =>
    club.playerIds
      .filter((pid) => !onPitch.has(pid))
      .map((pid) => world.players.get(pid))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .sort((a, b) => playerOverall(b) - playerOverall(a));
  const homeSide = {
    clubId: home.id,
    xi: homeFielded.players,
    bench: bench(home, new Set(homeFielded.players.map((p) => p.id))),
  };
  const awaySide = {
    clubId: away.id,
    xi: awayFielded.players,
    bench: bench(away, new Set(awayFielded.players.map((p) => p.id))),
  };
  const duelPlan = planDuels(homeFielded.players, awayFielded.players, world.players);
  const script = buildMatchScript(homeSide, awaySide, rng, duelPlan.mods);
  const homeEff = effectiveRatingsFor(matchStrength(homeFielded, rng, 0), home, ctx);
  const awayEff = effectiveRatingsFor(matchStrength(awayFielded, rng, 0), away, ctx);
  const result = simulateScore(homeEff, awayEff, ctx, rng, {
    home: script.home,
    away: script.away,
  });
  tie.homeGoals = result.homeGoals;
  tie.awayGoals = result.awayGoals;
  tie.played = true;
  tie.events = [
    ...script.events,
    ...assignGoals(
      home.id,
      script.homeLineup,
      away.id,
      script.awayLineup,
      result.homeGoals,
      result.awayGoals,
      rng,
    ),
  ].sort((a, b) => a.minute - b.minute);

  // Ponte v2 (MODULE_CUPS §3): infortuni veri e rossi. Il segno PERMANENTE del grave
  // si applica solo col ponte attivo: le shell automatiche (coppe a valle) non mutano
  // i giocatori e la lega resta byte-identica con o senza coppe.
  const injuries: CupInjuryEffect[] = [];
  for (const [clubId, list] of [
    [home.id, script.homeInjuries],
    [away.id, script.awayInjuries],
  ] as const) {
    for (const inj of list) {
      if (bridge && inj.injury.severity === 'severe') applySevereHit(inj.player, rng);
      injuries.push({
        clubId,
        playerId: inj.player.id,
        playerName: inj.player.name,
        matches: inj.injury.durationMatches,
        severe: inj.injury.severity === 'severe',
      });
    }
  }
  const reds: [ClubId, PlayerId][] = script.events
    .filter((e) => e.type === 'red')
    .map((e) => [e.clubId, e.playerId]);
  const participants: [ClubId, PlayerId[]][] = [
    [home.id, homeFielded.players.map((p) => p.id)],
    [away.id, awayFielded.players.map((p) => p.id)],
  ];

  if (result.homeGoals !== result.awayGoals) {
    tie.winnerId = result.homeGoals > result.awayGoals ? home.id : away.id;
    return { injuries, reds, participants };
  }
  // Rigori (MODULE_CUPS §3): probabilità dalla forza relativa, deterministica.
  const hs = homeEff.attack + homeEff.defense;
  const as = awayEff.attack + awayEff.defense;
  const raw = hs / Math.max(1, hs + as);
  const pHome = Math.min(0.5 + CUP.SHOOTOUT_CLAMP, Math.max(0.5 - CUP.SHOOTOUT_CLAMP, raw));
  const homeWins = rng.chance(pHome);
  const winPens = rng.int(4, 5);
  const losePens = winPens - 1 - rng.int(0, 1);
  tie.shootout = homeWins ? { home: winPens, away: losePens } : { home: losePens, away: winPens };
  tie.winnerId = homeWins ? home.id : away.id;
  return { injuries, reds, participants };
}

/** Il gate della gara interna di coppa del club utente (voce `gate`, nota coppa). */
function postUserCupGate(world: World, club: Club, year: number, stageName: string): void {
  const league = world.leagues.find((l) => l.clubIds.includes(club.id));
  if (!league) return;
  const nationCode = nationById(world, league.nationId)?.code ?? 'DEFAULT';
  const lines = clubSeasonLines(
    world,
    club,
    expectedPositionByReputation(world, club),
    league.clubIds.length,
    nationCode,
    league.tier,
  );
  const amount = Math.round((lines.gate / FINANCES.HOME_GAMES) * CUP.GATE_MULT);
  if (amount <= 0) return;
  club.finances.incomes.push({ type: 'gate', amount, year, note: `coppa: ${stageName}` });
  club.finances.cash += amount;
}

function postPrize(world: World, clubId: ClubId, amount: number, year: number, note: string): void {
  const club = world.clubs.get(clubId);
  if (!club || amount <= 0) return;
  const rounded = Math.round(amount);
  club.finances.incomes.push({ type: 'coppa', amount: rounded, year, note });
  club.finances.cash += rounded;
}

/** I turni di coppa dovuti quando il campionato ha giocato la giornata `leagueRound`. */
export function cupStagesDue(cup: NationalCup, leagueRound: number): boolean {
  const stage = cup.stages[cup.next];
  return stage !== undefined && !stage.played && leagueRound >= stage.afterRound;
}

/**
 * Gioca il prossimo turno della coppa (MODULE_CUPS §3): sorteggio/tabellone, partite
 * vere, premi alla vincitrice di ogni tie, finale con gloria. Muta cup e i ledger.
 */
export function playCupStage(
  world: World,
  cup: NationalCup,
  opts: {
    lineups?: ReadonlyMap<ClubId, SlotAssignment>;
    userClubId?: ClubId;
    /** Ponte v2: indisponibili di campionato (runner.unavailableNow per club). */
    unavailable?: ReadonlyMap<ClubId, ReadonlySet<PlayerId>>;
    /** Ponte v2 attivo: gli infortuni gravi lasciano il segno permanente sul giocatore. */
    bridge?: boolean;
  } = {},
): CupStageReport {
  const stage = cup.stages[cup.next];
  if (!stage || stage.played) {
    return {
      cupId: cup.id,
      cupName: cup.name,
      stageName: stage?.name ?? '—',
      results: [],
      headlines: [],
      finished: cup.winnerId !== null,
      effects: [],
      participants: [],
    };
  }
  const rng = createRng(1);
  rng.setState(cup.rngState);
  const ctx = cupContext(world, cup);
  const isFinal = cup.next === cup.stages.length - 1;

  // Il campo del turno: al FA Cup preliminare giocano solo le 16 di rango più basso;
  // agli ottavi dei formati seeded rientrano le teste di serie.
  let field = cup.alive.slice();
  let waiting: ClubId[] = [];
  if (cup.next === 0 && !cup.seeded) {
    const sorted = field.sort((a, b) => cupRank(cup, a) - cupRank(cup, b));
    waiting = sorted.slice(0, sorted.length - CUP.PRELIM_TEAMS);
    field = sorted.slice(sorted.length - CUP.PRELIM_TEAMS);
  }
  if (cup.seeded && stage.name === 'Ottavi') field = [...cup.byes, ...field];

  stage.ties = drawTies(cup, field, isFinal, rng);
  const headlines: string[] = [];
  const winners: ClubId[] = [];
  const name = (id: ClubId) => world.clubs.get(id)?.name ?? String(id);

  // Indisponibili del tie = campionato (ponte v2) ∪ squalificati di coppa (consumati ora).
  const banned = cup.suspended ?? {};
  const unavailableFor = (clubId: ClubId): ReadonlySet<PlayerId> => {
    const out = new Set<PlayerId>(opts.unavailable?.get(clubId) ?? []);
    for (const pid of banned[clubId as string] ?? []) out.add(pid as PlayerId);
    return out;
  };
  const effects: CupInjuryEffect[] = [];
  const participants: [ClubId, PlayerId[]][] = [];
  const newBans: Record<string, string[]> = {};

  for (const tie of stage.ties) {
    const played = playTie(
      world,
      ctx,
      tie,
      rng,
      opts.lineups,
      new Map([
        [tie.homeClubId, unavailableFor(tie.homeClubId)],
        [tie.awayClubId, unavailableFor(tie.awayClubId)],
      ]),
      opts.bridge,
    );
    effects.push(...played.injuries);
    participants.push(...played.participants);
    for (const [clubId, pid] of played.reds) {
      newBans[clubId as string] = [...(newBans[clubId as string] ?? []), pid as string];
    }
    const winner = tie.winnerId as ClubId;
    const loser = winner === tie.homeClubId ? tie.awayClubId : tie.homeClubId;
    winners.push(winner);
    // Botteghino utente in casa (gara non neutra).
    if (opts.userClubId && !tie.neutral && tie.homeClubId === opts.userClubId) {
      const userClub = world.clubs.get(opts.userClubId);
      if (userClub) postUserCupGate(world, userClub, cup.year, stage.name);
    }
    if (!isFinal) {
      postPrize(
        world,
        winner,
        (CUP.PRIZES[cup.next] ?? CUP.PRIZES[CUP.PRIZES.length - 1]!) * cup.prizeMult,
        cup.year,
        `${cup.name}: ${stage.name}`,
      );
      // Sorpresa: la sfavorita netta elimina la favorita.
      if (cupRank(cup, winner) - cupRank(cup, loser) >= 12) {
        headlines.push(
          `SORPRESA in ${cup.name}: ${name(winner)} elimina ${name(loser)} (${tie.homeGoals}-${tie.awayGoals}${tie.shootout ? ' dcr' : ''}).`,
        );
      }
    } else {
      postPrize(world, winner, CUP.WINNER_PRIZE * cup.prizeMult, cup.year, `${cup.name}: TROFEO`);
      postPrize(
        world,
        loser,
        CUP.FINALIST_PRIZE * cup.prizeMult,
        cup.year,
        `${cup.name}: finalista`,
      );
      const w = world.clubs.get(winner);
      const l = world.clubs.get(loser);
      if (w) w.reputation = Math.min(99, w.reputation + CUP.REP_WINNER);
      if (l) l.reputation = Math.min(99, l.reputation + CUP.REP_FINALIST);
      cup.winnerId = winner;
      headlines.push(
        `${name(winner)} ALZA LA ${cup.name.toUpperCase()}: ${name(loser)} battuto ${tie.homeGoals}-${tie.awayGoals}${tie.shootout ? ` (${tie.shootout.home}-${tie.shootout.away} dcr)` : ''}.`,
      );
    }
  }

  cup.alive = [...waiting, ...winners];
  stage.played = true;
  cup.next += 1;
  cup.rngState = rng.getState();
  // Le squalifiche servite cadono; i rossi di OGGI valgono al prossimo turno (v2).
  cup.suspended = newBans;
  return {
    cupId: cup.id,
    cupName: cup.name,
    stageName: stage.name,
    results: stage.ties,
    headlines,
    finished: cup.winnerId !== null,
    effects,
    participants,
  };
}

/** Gioca TUTTI i turni restanti (shell automatiche: simulate-season/career). */
export function playCupToEnd(
  world: World,
  cup: NationalCup,
  opts: { userClubId?: ClubId } = {},
): CupStageReport[] {
  const out: CupStageReport[] = [];
  while (cup.winnerId === null && cup.next < cup.stages.length) {
    out.push(playCupStage(world, cup, opts));
  }
  return out;
}
