/**
 * JSON save codec (UI-4, MODULE_UI §4 / ARCHITECTURE §4-bis) — PURE, no SQL, no I/O.
 *
 * A save file is one JSON document: world + season + runner snapshot + the UI session
 * extras. The world's Maps become entry arrays; everything else in the core is already
 * plain data. `undefined` fields vanish in JSON — that is semantically safe here
 * (`Player.agencyId` undefined = "libero", null = auto-rappresentato: null survives).
 *
 * The codec knows nothing about WHERE the file lives (IndexedDB, Supabase, disk): the
 * shells own the storage. It also never reads the clock: `savedAt` is passed in.
 */

import type { RenewalState } from '../contracts/renewal-negotiation.js';
import type { ClubId } from '../core/ids.js';
import type {
  Agency,
  Club,
  Contract,
  League,
  Manager,
  Nation,
  Player,
  Position,
  President,
  Season,
  World,
} from '../core/types.js';
import type { AcademyState } from '../engine/academy.js';
import type { OffseasonSummary } from '../engine/career.js';
import type { NationalCup } from '../engine/cup.js';
import type { ConcertOffer, Mission, SummerPlan } from '../engine/events.js';
import type { TeamPlan } from '../engine/plan.js';
import type { CareerSeasonLine } from '../engine/player-stats.js';
import type { RunnerSnapshot } from '../engine/season.js';
import type { NamingProposal } from '../engine/stadium.js';
import type { SponsorOffer } from '../finances/sponsors.js';
import type { DealNews, IncomingOffer } from '../market/ai.js';
import type { AgreedDeal, NegotiationState } from '../market/negotiation.js';

export const SAVE_VERSION = 1 as const;

/** World with Maps flattened to entry arrays (JSON-safe). */
export interface WorldJson {
  leagues: League[];
  nations?: Nation[];
  agencies?: Agency[];
  managers?: [string, Manager][];
  presidents?: [string, President][];
  clubs: [string, Club][];
  players: [string, Player][];
  contracts: [string, Contract][];
  relationships?: [string, [string, number][]][];
  clubRelations?: [string, number][];
  affinityGroups?: World['affinityGroups'];
}

/** Promessa di mercato fatta a un giocatore in sede di rinnovo (MODULE_CONTRACTS §6). */
export interface MarketPromise {
  playerId: string;
  playerName: string;
  position: Position;
  /** Il rinforzo promesso deve valere almeno questo overall (media reparto alla promessa). */
  minOverall: number;
  madeYear: number;
  deadlineYear: number;
  deadlineRound: number;
  status: 'aperta' | 'mantenuta' | 'tradita';
}

/** Dossier-rinnovo di un giocatore fra un tavolo e l'altro (stalli, gelo, addii). */
export interface RenewalNote {
  stallState?: RenewalState;
  cooldownUntil?: number;
  leaving?: boolean;
  betrayed?: boolean;
  /** Promessa tradita → chiede la cessione: entra nella hot-list del mercato (§9.4). */
  wantsOut?: boolean;
}

/** Un'offerta AI rifiutata: il club può tornare UNA volta col rilancio (MODULE_MARKET §9.4). */
export interface RejectedOfferMemory {
  playerId: string;
  fromClubId: string;
  bid: number;
  round: number;
  retried?: boolean;
}

/** What the UI session carries besides world/season/runner (all plain data). */
export interface SessionExtras {
  naming?: NamingProposal | null;
  namingSeason?: number;
  offers?: IncomingOffer[];
  news?: DealNews[];
  shortlist?: string[];
  preDeals?: AgreedDeal[];
  lastTripRound?: number;
  negotiation?: NegotiationState | null;
  /** Riepilogo di fine stagione ancora da "chiudere" in UI (MODULE_UI §6). */
  offseason?: OffseasonSummary | null;
  /** Rinnovi (MODULE_CONTRACTS): tavolo attivo, dossier per giocatore, promesse. */
  renewal?: RenewalState | null;
  renewalNotes?: Record<string, RenewalNote>;
  promises?: MarketPromise[];
  /** Memoria delle offerte AI rifiutate (MODULE_MARKET §9.4). */
  rejectedOffers?: RejectedOfferMemory[];
  /** Osservazioni-scouting della UI per giocatore (MODULE_SCOUTING §7, v1). */
  observations?: Record<string, number>;
  /** Offerte sponsor per gli slot scoperti (MODULE_SPONSORS §3). */
  sponsorOffers?: Record<string, SponsorOffer[]>;
  /** Coppe nazionali dell'anno (MODULE_CUPS): tabelloni, stato RNG, vincitrici. */
  cups?: NationalCup[];
  /** Estate F4 (MODULE_EVENTS): scelte ritiro/tour e proposte concerti pendenti. */
  summer?: SummerPlan;
  concertOffers?: ConcertOffer[];
  /** Hub trattative: più tavoli in parallelo (il campo `negotiation` resta per i salvataggi vecchi). */
  negotiations?: NegotiationState[];
  /** Impero v2 (MODULE_EVENTS): storia del dominio/conti, missioni, pin degli asset. */
  empireHistory?: Record<string, { year: number; fans: number }[]>;
  financeHistory?: { year: number; revenue: number; costs: number; net: number; cash: number }[];
  missions?: Mission[];
  territoryPins?: Record<string, { kind: 'shop' | 'fanclub'; lat: number; lon: number }[]>;
  /** Confronto storico: peso marketing tuo vs club top per nazione/anno. */
  influenceHistory?: Record<string, { year: number; mine: number; top: number; topName: string }[]>;
  /** Promemoria al DS (Ufficio Commerciale): rapporti-nazione attesi in Gazzetta. */
  dsReminders?: { nation: string; dueRound: number }[];
  /** Manto erboso (MODULE_STADIUM): scelta stagionale dell'utente + manutenzione pagata. */
  grass?: { year: number; length: 'bassa' | 'media' | 'alta'; paid?: boolean };
  /** Irrigazione (MODULE_STADIUM): abitudine del club sul campo di casa. */
  watering?: 'bagnato' | 'normale' | 'asciutto';
  /** Calendario: giorno corrente della stagione (offset dal 10 agosto). */
  day?: number;
  /** Lavagna tattica: posizioni delle pedine per fase (possesso/difesa). */
  board?: {
    possesso: Record<string, { x: number; y: number }>;
    difesa: Record<string, { x: number; y: number }>;
  };
  /** Piano partita (istruzioni di squadra del club utente). */
  plan?: TeamPlan;
  /** Lavagne salvate (max 3): XI + posizioni per fase. */
  boardPresets?: {
    name: string;
    assignment: { slot: Position; playerId: string }[];
    board: {
      possesso: Record<string, { x: number; y: number }>;
      difesa: Record<string, { x: number; y: number }>;
    };
  }[];
  /** Rate sui cartellini (v3): quote annuali dovute alle chiusure di stagione. */
  installmentsDue?: { year: number; amount: number; playerName: string; sellerName: string }[];
  /** Settore giovanile (F4b): accademia + Primavera del club utente. */
  academy?: AcademyState;
  /** G3: registro dei promossi dal vivaio (per riconoscerne le bandiere). */
  academyGrads?: { playerId: string; name: string; promotedYear: number; bandiera?: boolean }[];
  /** Albo d'oro delle stagioni chiuse (Atelier divise, MODULE_STADIUM §3.4 E). */
  annals?: {
    year: number;
    tier: number;
    position: number;
    n: number;
    promoted?: boolean;
    relegated?: boolean;
    cupWon?: boolean;
  }[];
  /**
   * G4 — IL MONDO CHE GIOCA: le altre divisioni avanzano giornata per giornata
   * insieme a quella dell'utente; qui i loro calendari e gli snapshot dei runner
   * (le loro mutazioni sono già nel mondo: NIENTE replay al load, si riprende).
   * Assente nei salvataggi vecchi: il guscio le crea e recupera le giornate.
   */
  otherLeagues?: { season: Season; runner: RunnerSnapshot }[];
  /** G4 — storico di carriera per giocatore: una riga per stagione chiusa. */
  careerStats?: Record<string, CareerSeasonLine[]>;
  /** Call fissate con presidenti/procuratori (agenda). */
  calls?: {
    id: string;
    kind: 'presidente' | 'procuratore';
    playerId: string;
    playerName: string;
    withName: string;
    day: number;
    inPerson?: boolean;
  }[];
}

export interface SaveMeta {
  name: string;
  seed: number;
  clubId: string;
  clubName: string;
  leagueName: string;
  year: number;
  /** Next round to play (1-based); `totalRounds + 1` when the season is over. */
  round: number;
  totalRounds: number;
  role: 'presidente';
  /** ISO timestamp supplied by the shell (the codec never reads the clock). */
  savedAt: string;
}

export interface SaveFile {
  version: typeof SAVE_VERSION;
  meta: SaveMeta;
  world: WorldJson;
  season: Season;
  runner: RunnerSnapshot;
  session: SessionExtras;
}

export interface DecodedSave {
  meta: SaveMeta;
  world: World;
  club: Club;
  season: Season;
  runner: RunnerSnapshot;
  session: SessionExtras;
}

const entries = <K, V>(m: Map<K, V> | undefined): [K, V][] | undefined =>
  m ? [...m.entries()] : undefined;

export function encodeWorld(world: World): WorldJson {
  const out: WorldJson = {
    leagues: world.leagues,
    clubs: [...world.clubs.entries()],
    players: [...world.players.entries()],
    contracts: [...world.contracts.entries()],
  };
  if (world.nations) out.nations = world.nations;
  if (world.agencies) out.agencies = world.agencies;
  if (world.managers) out.managers = entries(world.managers);
  if (world.presidents) out.presidents = entries(world.presidents);
  if (world.relationships) {
    out.relationships = [...world.relationships.entries()].map(([k, store]) => [k, [...store]]);
  }
  if (world.clubRelations) out.clubRelations = [...world.clubRelations.entries()];
  if (world.affinityGroups) out.affinityGroups = world.affinityGroups;
  return out;
}

export function decodeWorld(json: WorldJson): World {
  const world: World = {
    leagues: json.leagues,
    clubs: new Map(json.clubs as [ClubId, Club][]),
    players: new Map(json.players as [Player['id'], Player][]),
    contracts: new Map(json.contracts as [Contract['id'], Contract][]),
  };
  if (json.nations) world.nations = json.nations;
  if (json.agencies) world.agencies = json.agencies;
  if (json.managers) world.managers = new Map(json.managers as [Manager['id'], Manager][]);
  if (json.presidents)
    world.presidents = new Map(json.presidents as [President['id'], President][]);
  if (json.relationships) {
    world.relationships = new Map(
      json.relationships.map(([k, store]) => [k as ClubId, new Map(store)]),
    );
  }
  if (json.clubRelations) world.clubRelations = new Map(json.clubRelations);
  if (json.affinityGroups) world.affinityGroups = json.affinityGroups;
  return world;
}

export interface EncodeInput {
  world: World;
  club: Club;
  season: Season;
  runner: RunnerSnapshot;
  session: SessionExtras;
  name: string;
  seed: number;
  year: number;
  leagueName: string;
  savedAt: string;
}

export function encodeSave(input: EncodeInput): SaveFile {
  const totalRounds = new Set(input.season.fixtures.map((m) => m.round)).size;
  const session: SessionExtras = {};
  for (const [k, v] of Object.entries(input.session)) {
    if (v !== undefined) (session as Record<string, unknown>)[k] = v;
  }
  return {
    version: SAVE_VERSION,
    meta: {
      name: input.name,
      seed: input.seed,
      clubId: input.club.id,
      clubName: input.club.name,
      leagueName: input.leagueName,
      year: input.year,
      round: Math.min(input.runner.cursor + 1, totalRounds + 1),
      totalRounds,
      role: 'presidente',
      savedAt: input.savedAt,
    },
    world: encodeWorld(input.world),
    season: input.season,
    runner: input.runner,
    session,
  };
}

/**
 * REVISIONE — validazione STRUTTURALE del salvataggio: prima un file manomesso o
 * troncato produceva TypeError grezzi ("json.clubs is not iterable") o, peggio,
 * crashava la simulazione alla prima partita (attributi incoerenti col ruolo).
 * Ritorna l'elenco dei difetti (vuoto = sano); messaggi in italiano, per la UI.
 */
export function validateSave(file: SaveFile): string[] {
  const errs: string[] = [];
  const w = file.world as Partial<WorldJson> | undefined;
  if (!w || typeof w !== 'object') return ['mondo assente'];
  for (const k of ['leagues', 'clubs', 'players', 'contracts'] as const) {
    if (!Array.isArray(w[k])) errs.push(`${k} mancanti o non in forma di lista`);
  }
  if (errs.length > 0) return errs;
  const playerIds = new Set((w.players as [string, unknown][]).map(([id]) => id));
  const clubIds = new Set((w.clubs as [string, unknown][]).map(([id]) => id));
  for (const [id, c] of w.clubs as [string, Club][]) {
    if (!Array.isArray(c?.playerIds)) {
      errs.push(`club ${id}: rosa assente`);
      continue;
    }
    for (const pid of c.playerIds) {
      if (!playerIds.has(pid as string))
        errs.push(`club ${c.name ?? id}: giocatore ${pid} inesistente in rosa`);
    }
  }
  for (const lg of w.leagues as League[]) {
    for (const cid of lg?.clubIds ?? []) {
      if (!clubIds.has(cid as string)) errs.push(`lega ${lg.name}: club ${cid} inesistente`);
    }
  }
  for (const [id, ct] of w.contracts as [string, Contract][]) {
    if (!playerIds.has(ct?.playerId as string)) errs.push(`contratto ${id}: giocatore inesistente`);
    if (!clubIds.has(ct?.clubId as string)) errs.push(`contratto ${id}: club inesistente`);
  }
  // Attributi coerenti col ruolo: un GK senza attributi da portiere manda in
  // crash playerOverall alla prima formazione.
  for (const [id, p] of w.players as [string, Player][]) {
    const a = p?.attributes as unknown as Record<string, number> | undefined;
    if (!a || typeof a !== 'object') {
      errs.push(`giocatore ${id}: attributi assenti`);
      continue;
    }
    if (p.position === 'GK' && typeof a.reflexes !== 'number')
      errs.push(`giocatore ${p.name ?? id}: portiere senza attributi da portiere`);
    if (p.position !== 'GK' && typeof a.finishing !== 'number')
      errs.push(`giocatore ${p.name ?? id}: attributi di movimento assenti`);
  }
  if (!clubIds.has(file.meta?.clubId as string))
    errs.push('il club della carriera non esiste nel mondo');
  if (!Array.isArray(file.season?.fixtures)) errs.push('calendario assente');
  if (typeof file.runner?.cursor !== 'number') errs.push('stato del runner assente');
  return errs.slice(0, 8);
}

export function decodeSave(file: SaveFile): DecodedSave {
  if (file.version !== SAVE_VERSION) {
    throw new Error(`Salvataggio di versione ${String(file.version)} non supportata`);
  }
  const defects = validateSave(file);
  if (defects.length > 0) {
    throw new Error(
      `Salvataggio corrotto: ${defects[0]}${defects.length > 1 ? ` (+${defects.length - 1} altri difetti)` : ''}`,
    );
  }
  const world = decodeWorld(file.world);
  const club = world.clubs.get(file.meta.clubId as ClubId);
  if (!club) throw new Error('Salvataggio corrotto: club non trovato nel mondo');
  return {
    meta: file.meta,
    world,
    club,
    season: file.season,
    runner: file.runner,
    session: file.session ?? {},
  };
}

/** Text form (what actually gets stored). */
export function saveToText(file: SaveFile): string {
  return JSON.stringify(file);
}

/** Parse + structural sanity check; throws with an Italian message on garbage. */
export function saveFromText(text: string): SaveFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un salvataggio BENCH valido (JSON non leggibile)');
  }
  const f = parsed as Partial<SaveFile>;
  if (
    !f ||
    typeof f !== 'object' ||
    f.version !== SAVE_VERSION ||
    !f.meta ||
    !f.world ||
    !f.season ||
    !f.runner
  ) {
    throw new Error('Il file non è un salvataggio BENCH valido (struttura inattesa)');
  }
  return f as SaveFile;
}
