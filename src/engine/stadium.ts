/**
 * Building dello stadio (GAME_DESIGN §6.7, docs/MODULE_STADIUM.md §2-3).
 * Puro e deterministico: nessun I/O, RNG iniettato solo dove serve (proposte).
 * Un solo cantiere alla volta; il costo esce dalla cassa all'avvio (ledger 'stadio');
 * il completamento avviene via tick a ogni giornata simulata dal runner.
 */

import { clubWageBill } from '../core/finance.js';
import type { ClubId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import {
  CITY_STRUCTURES,
  COMMERCIALS,
  CORNER_SECTORS,
  MAIN_SECTORS,
  coveredSectors,
  stadiumCapacity,
} from '../core/stadium.js';
import type {
  Club,
  CommercialId,
  Player,
  President,
  PriceLevel,
  SectorId,
  StadiumProject,
  World,
} from '../core/types.js';
import type { Rng } from '../rng/rng.js';

/** Costanti provvisorie (MODULE_STADIUM): da ricalibrare con finance-health. */
export const STADIUM_BUILD = {
  /** €/posto per nuovi spalti; ×1.5 se il settore è coperto (si amplia sotto tetto). */
  EXPANSION_PER_SEAT: 900,
  EXPANSION_COVERED_MULT: 1.5,
  EXPANSION_BLOCKS: [1000, 2000, 5000] as const,
  /** Giornate di cantiere: 1 ogni 1500 posti, minimo 2. */
  EXPANSION_DAYS_PER_SEATS: 1500,
  EXPANSION_MIN_DAYS: 2,
  /** Anello superiore: +60% posti del settore, €/posto nuovo, richiede settore ≥8k. */
  TIER_SEAT_GAIN: 0.6,
  TIER_PER_SEAT: 1400,
  TIER_DAYS: 6,
  TIER_MIN_SECTOR: 8000,
  /** Copertura: €/posto del settore. */
  ROOF_PER_SEAT: 350,
  ROOF_DAYS: 3,
  /** Terreno in erba. */
  PITCH_COST: 800_000,
  PITCH_DAYS: 2,
  COMMERCIAL_DAYS: 4,
  /** Strutture in città (negozio/museo): cantiere di 5 giornate. */
  STRUCTURE_DAYS: 5,
  /** Vincolo hard: cassa ≥ costo + ~2 mesi di monte ingaggi (MODULE_STADIUM §2). */
  CASH_BUFFER_WEEKS: 8,
} as const;

// Catalogo attività, ricavi e zone di tifo vivono in core/stadium.ts (li usa anche finances).
export {
  CITY_STRUCTURES,
  COMMERCIALS,
  type CommercialSpec,
  type FanZone,
  PRICE_LEVELS,
  commercialSeasonIncome,
  fanDensityAt,
  fanZones,
  locationFactor,
  priceMultiplier,
} from '../core/stadium.js';

/** Cambia la politica di prezzo di una struttura in città (MODULE_STADIUM §3.1). */
export function setStructurePrice(
  club: Club,
  structure: CommercialId,
  price: PriceLevel,
): { ok: boolean; reason?: string } {
  const s = (club.structures ?? []).find((x) => x.id === structure);
  if (!s) return { ok: false, reason: 'struttura non costruita' };
  s.price = price;
  return { ok: true };
}

/** Prezzo dei biglietti dello stadio (MODULE_STADIUM §3.2). */
export function setTicketPrice(club: Club, price: PriceLevel): void {
  club.stadium.ticketPrice = price;
}

/** Prezzo di un'attività DELLO STADIO già costruita (MODULE_STADIUM §3.2). */
export function setStadiumActivityPrice(
  club: Club,
  activity: CommercialId,
  price: PriceLevel,
): { ok: boolean; reason?: string } {
  if (!club.stadium.commercial.includes(activity))
    return { ok: false, reason: 'attività non costruita' };
  club.stadium.commercialPrices = { ...club.stadium.commercialPrices, [activity]: price };
  return { ok: true };
}

// Export per la UI: ticketFactors serve alle stime della biglietteria.
export { SECTOR_DEFAULT_NAMES, sectorName, ticketFactors } from '../core/stadium.js';

/** Battezza un settore (MODULE_STADIUM §3.3): 2-26 caratteri, il custom vince in UI. */
export function renameSector(
  club: Club,
  sector: SectorId,
  name: string,
): { ok: boolean; reason?: string } {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 26)
    return { ok: false, reason: 'nome tra 2 e 26 caratteri' };
  club.stadium.sectorNames = { ...club.stadium.sectorNames, [sector]: clean };
  return { ok: true };
}

/** Proposta della curva (MODULE_STADIUM §3.3): intitolare uno spalto al beniamino. */
export interface NamingProposal {
  sector: SectorId;
  /** Nome proposto per il settore, es. "Curva Ferrari". */
  name: string;
  hero: string;
  reason: string;
}

/** Soglie della bandiera (MODULE_STADIUM §3.3): niente intitolazioni facili. */
export const LEGACY = {
  MIN_SEASONS: 6,
  MIN_TITLES: 1,
  MIN_BIG_SEASONS: 3,
  MIN_OVERALL: 70,
} as const;

export function fanNamingProposal(world: World, club: Club, rng: Rng): NamingProposal | null {
  // Solo una VERA bandiera: anni di maglia E meriti (titoli o annate da protagonista).
  let hero: { p: Player; score: number } | null = null;
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    if (!p) continue;
    const seasons = p.clubSeasons ?? 0;
    const titles = p.titlesWithClub ?? 0;
    const big = p.bigSeasons ?? 0;
    if (seasons < LEGACY.MIN_SEASONS) continue;
    if (titles < LEGACY.MIN_TITLES && big < LEGACY.MIN_BIG_SEASONS) continue;
    if (playerOverall(p) < LEGACY.MIN_OVERALL) continue;
    const score = titles * 3 + big + seasons * 0.5;
    if (!hero || score > hero.score) hero = { p, score };
  }
  if (!hero) return null;

  // Prima le curve, poi le tribune: il primo settore costruito e non ancora battezzato.
  const candidates: SectorId[] = ['curvaNord', 'curvaSud', 'distinti', 'principale'];
  const sector = candidates.find(
    (s) => club.stadium.sectors[s].seats > 0 && !club.stadium.sectorNames?.[s],
  );
  if (!sector) return null;

  const { p } = hero;
  const seasons = p.clubSeasons ?? 0;
  const titles = p.titlesWithClub ?? 0;
  const big = p.bigSeasons ?? 0;
  const surname = p.name.split(' ').at(-1) ?? p.name;
  const base = sector.startsWith('curva') ? 'Curva' : 'Tribuna';
  const merits =
    titles > 0
      ? `${titles === 1 ? 'un titolo vinto' : `${titles} titoli vinti`} con questa maglia`
      : `${big} annate da protagonista`;
  const reasons = [
    `Da ${seasons} stagioni al club, ${merits}: per la curva ${p.name} È il club.`,
    `Striscioni in tutta la città: "${surname} uno di noi". ${seasons} anni di maglia e ${merits} — i tifosi vogliono il suo nome sullo spalto.`,
    `${p.name}, bandiera da ${seasons} stagioni (${merits}): il tifo organizzato propone l'intitolazione.`,
  ];
  return {
    sector,
    name: `${base} ${surname}`,
    hero: p.name,
    reason: reasons[Math.floor(rng.next() * reasons.length)] ?? reasons[0]!,
  };
}

/** Richiesta di progetto (dal presidente o proposta dall'allenatore). */
export type ProjectRequest =
  | { kind: 'espansione'; target: SectorId; seats: number }
  | { kind: 'anello'; target: SectorId }
  | { kind: 'copertura'; target: SectorId }
  | { kind: 'terreno' }
  | { kind: 'commerciale'; commercial: CommercialId }
  /** Struttura in città: dove (offset in gradi dal centro) lo sceglie l'utente sulla mappa. */
  | { kind: 'struttura'; structure: CommercialId; dx: number; dy: number };

export interface ProjectQuote {
  ok: boolean;
  reason?: string;
  cost: number;
  matchdays: number;
}

/** Preventivo + verifica requisiti strutturali (senza toccare la cassa). */
export function quoteProject(club: Club, req: ProjectRequest): ProjectQuote {
  const st = club.stadium;
  const B = STADIUM_BUILD;
  if (st.project) return { ok: false, reason: 'cantiere già aperto', cost: 0, matchdays: 0 };
  switch (req.kind) {
    case 'espansione': {
      // Tutti gli 8 settori sono ampliabili liberamente (MODULE_STADIUM §3.3).
      const sec = st.sectors[req.target];
      const cost = Math.round(
        req.seats * B.EXPANSION_PER_SEAT * (sec.covered ? B.EXPANSION_COVERED_MULT : 1),
      );
      const matchdays = Math.max(
        B.EXPANSION_MIN_DAYS,
        Math.ceil(req.seats / B.EXPANSION_DAYS_PER_SEATS),
      );
      return { ok: true, cost, matchdays };
    }
    case 'anello': {
      const sec = st.sectors[req.target];
      if (sec.seats < B.TIER_MIN_SECTOR)
        return {
          ok: false,
          reason: `settore sotto i ${B.TIER_MIN_SECTOR} posti`,
          cost: 0,
          matchdays: 0,
        };
      if (sec.tiers >= 3) return { ok: false, reason: 'già a 3 anelli', cost: 0, matchdays: 0 };
      const added = Math.round(sec.seats * B.TIER_SEAT_GAIN);
      return { ok: true, cost: added * B.TIER_PER_SEAT, matchdays: B.TIER_DAYS };
    }
    case 'copertura': {
      const sec = st.sectors[req.target];
      if (sec.seats === 0)
        return { ok: false, reason: 'settore non costruito', cost: 0, matchdays: 0 };
      if (sec.covered) return { ok: false, reason: 'già coperto', cost: 0, matchdays: 0 };
      return { ok: true, cost: sec.seats * B.ROOF_PER_SEAT, matchdays: B.ROOF_DAYS };
    }
    case 'terreno': {
      if (st.pitch === 'erba') return { ok: false, reason: 'già in erba', cost: 0, matchdays: 0 };
      return { ok: true, cost: B.PITCH_COST, matchdays: B.PITCH_DAYS };
    }
    case 'commerciale': {
      const spec = COMMERCIALS.find((c) => c.id === req.commercial);
      if (!spec) return { ok: false, reason: 'attività sconosciuta', cost: 0, matchdays: 0 };
      if (st.commercial.includes(spec.id))
        return { ok: false, reason: 'già costruita', cost: 0, matchdays: 0 };
      const cap = stadiumCapacity(club);
      if (cap < spec.minCapacity)
        return {
          ok: false,
          reason: `capienza < ${spec.minCapacity / 1000}k`,
          cost: 0,
          matchdays: 0,
        };
      if (club.reputation < spec.minReputation)
        return { ok: false, reason: `reputazione < ${spec.minReputation}`, cost: 0, matchdays: 0 };
      if (coveredSectors(st) < spec.minCoveredSectors)
        return {
          ok: false,
          reason: `servono ${spec.minCoveredSectors} settori coperti`,
          cost: 0,
          matchdays: 0,
        };
      return { ok: true, cost: spec.cost, matchdays: STADIUM_BUILD.COMMERCIAL_DAYS };
    }
    case 'struttura': {
      const spec = CITY_STRUCTURES.find((c) => c.id === req.structure);
      if (!spec) return { ok: false, reason: 'struttura sconosciuta', cost: 0, matchdays: 0 };
      if ((club.structures ?? []).some((s) => s.id === spec.id))
        return { ok: false, reason: 'già costruita', cost: 0, matchdays: 0 };
      if (club.reputation < spec.minReputation)
        return { ok: false, reason: `reputazione < ${spec.minReputation}`, cost: 0, matchdays: 0 };
      return { ok: true, cost: spec.cost, matchdays: STADIUM_BUILD.STRUCTURE_DAYS };
    }
  }
}

/**
 * Avvia il cantiere con l'autorità del PRESIDENTE: vincolo hard sulla cassa
 * (costo + ~2 mesi di ingaggi), costo scalato subito, ledger 'stadio'.
 */
export function startProject(
  world: World,
  club: Club,
  req: ProjectRequest,
  year: number,
): { ok: boolean; reason?: string } {
  const quote = quoteProject(club, req);
  if (!quote.ok) return { ok: false, reason: quote.reason };
  const buffer = clubWageBill(world, club) * STADIUM_BUILD.CASH_BUFFER_WEEKS;
  if (club.finances.cash < quote.cost + buffer)
    return { ok: false, reason: 'cassa insufficiente (serve costo + 2 mesi di ingaggi)' };

  club.finances.cash -= quote.cost;
  club.finances.expenses.push({ type: 'stadio', amount: quote.cost, year });
  const project: StadiumProject = {
    kind: req.kind,
    matchdaysLeft: quote.matchdays,
    cost: quote.cost,
  };
  if (req.kind === 'espansione') {
    project.target = req.target;
    project.addedSeats = req.seats;
  } else if (req.kind === 'anello' || req.kind === 'copertura') {
    project.target = req.target;
  } else if (req.kind === 'commerciale') {
    project.commercial = req.commercial;
  } else if (req.kind === 'struttura') {
    project.structure = req.structure;
    project.dx = req.dx;
    project.dy = req.dy;
  }
  club.stadium.project = project;
  return { ok: true };
}

/**
 * Proposta dell'ALLENATORE al presidente (MODULE_STADIUM §2): l'ambizione apre
 * il portafoglio, il peso del costo sulla cassa lo chiude. Se accettata, parte.
 */
export function proposeProject(
  world: World,
  club: Club,
  president: President | undefined,
  req: ProjectRequest,
  year: number,
  rng: Rng,
): { ok: boolean; reason?: string } {
  const quote = quoteProject(club, req);
  if (!quote.ok) return { ok: false, reason: quote.reason };
  const ambition = president?.personality.ambition ?? 0.5;
  const burden = quote.cost / Math.max(1, club.finances.cash);
  const p = Math.min(0.95, Math.max(0.05, 0.25 + 0.6 * ambition - 0.8 * burden));
  if (rng.next() > p) return { ok: false, reason: 'il presidente non approva il progetto' };
  return startProject(world, club, req, year);
}

/**
 * Una giornata di cantiere: a 0 il progetto si applica. Il runner passa i club
 * della PROPRIA lega (un tick per giornata, non per campionato).
 */
export function tickStadiumProjects(world: World, clubIds?: readonly ClubId[]): void {
  const clubs = clubIds
    ? clubIds.map((id) => world.clubs.get(id)).filter((c): c is Club => c !== undefined)
    : [...world.clubs.values()];
  for (const club of clubs) {
    const p = club.stadium.project;
    if (!p) continue;
    p.matchdaysLeft -= 1;
    if (p.matchdaysLeft > 0) continue;
    applyProject(club, p);
    club.stadium.project = undefined;
  }
}

function applyProject(club: Club, p: StadiumProject): void {
  const st = club.stadium;
  if (p.kind === 'espansione' && p.target) {
    st.sectors[p.target].seats += p.addedSeats ?? 0;
  } else if (p.kind === 'anello' && p.target) {
    const sec = st.sectors[p.target];
    sec.seats = Math.round(sec.seats * (1 + STADIUM_BUILD.TIER_SEAT_GAIN));
    sec.tiers = Math.min(3, sec.tiers + 1) as 1 | 2 | 3;
  } else if (p.kind === 'copertura' && p.target) {
    st.sectors[p.target].covered = true;
  } else if (p.kind === 'terreno') {
    st.pitch = 'erba';
  } else if (p.kind === 'commerciale' && p.commercial) {
    st.commercial.push(p.commercial);
  } else if (p.kind === 'struttura' && p.structure) {
    club.structures = [
      ...(club.structures ?? []),
      { id: p.structure, dx: p.dx ?? 0, dy: p.dy ?? 0 },
    ];
  }
}
