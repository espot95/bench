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
import type { OffseasonSummary } from '../engine/career.js';
import type { RunnerSnapshot } from '../engine/season.js';
import type { NamingProposal } from '../engine/stadium.js';
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

export function decodeSave(file: SaveFile): DecodedSave {
  if (file.version !== SAVE_VERSION) {
    throw new Error(`Salvataggio di versione ${String(file.version)} non supportata`);
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
