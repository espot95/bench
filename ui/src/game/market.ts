/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { playerOverall } from '../../../src/core/ratings';
import { type Club, leagueOfClub } from '../../../src/core/types';
import {
  type IncomingOffer,
  isDeadlineDay,
  marketWindowOpen,
  refusalMoraleHit,
  resolveCounter,
  sellToAI,
} from '../../../src/market/ai';
import { NEGOTIATION, dsSuggestions, playerMarketStatus } from '../../../src/market/negotiation';
import { askingPrice, contractYearsLeft } from '../../../src/market/transfers';
import { createRng } from '../../../src/rng/rng';
import { bandOf, starString } from '../band';
import { clubIdentity } from '../identity';
import { formFor, refreshTreasury } from './shared';

import type { GameSession } from '../game';
import { sanitizeLineupAndPlan } from '../game';

// ---- Mercato (MODULE_MARKET §7): la scrivania delle trattative del presidente ----

export function marketView(s: GameSession) {
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const window = s.runner.isFinished() ? null : marketWindowOpen(round, total);
  return {
    window,
    deadline: window ? isDeadlineDay(round, total) : false,
    offers: (s.offers ?? []).map((o, i) => ({
      index: i,
      player: o.playerName,
      from: o.fromClubName,
      fromRep: o.fromReputation,
      bid: o.bid,
      ask: o.ask,
      expiresIn: Math.max(0, o.expiresRound - round + 1),
      countered: !!o.countered,
      bigStep: o.fromReputation >= s.club.reputation + 10,
    })),
    news: [...(s.news ?? [])].reverse(),
  };
}

function dropOffer(s: GameSession, index: number): IncomingOffer | null {
  const o = (s.offers ?? [])[index] ?? null;
  if (o) s.offers = (s.offers ?? []).filter((_, i) => i !== index);
  return o;
}

/** Il presidente accetta: si vende al prezzo offerto. */
export function acceptOffer(s: GameSession, index: number): string {
  const o = dropOffer(s, index);
  if (!o) return 'Offerta non più valida.';
  const ok = sellToAI(s.world, s.club, o, o.bid, s.year);
  refreshTreasury(s);
  if (ok) sanitizeLineupAndPlan(s);
  return ok
    ? `${o.playerName} ceduto al ${o.fromClubName} per ${(o.bid / 1e6).toFixed(1)}M. La cassa ringrazia.`
    : 'La trattativa è sfumata.';
}

/** Una sola controrichiesta: il prezzo pieno del cartellino. */
export function counterOffer(s: GameSession, index: number): string {
  const o = (s.offers ?? [])[index];
  if (!o) return 'Offerta non più valida.';
  if (o.countered) return 'Hai già rilanciato: ora o accetti o rifiuti.';
  o.countered = true;
  const res = resolveCounter(s.world, o, o.ask, createRng(s.seed * 131 + o.round * 17 + index));
  dropOffer(s, index);
  if (!res.accepted) return res.reason;
  // L'esito della vendita si CONTROLLA (prima il messaggio diceva "ceduto" anche
  // quando sellToAI falliva) e la cassa si aggiorna come in acceptOffer.
  const ok = sellToAI(s.world, s.club, o, o.ask, s.year);
  refreshTreasury(s);
  if (!ok) return 'La trattativa è sfumata sul più bello.';
  sanitizeLineupAndPlan(s);
  return `${o.playerName} ceduto al ${o.fromClubName}: ${res.reason}`;
}

/** Rifiuto: se era il Grande Salto, l'ambizioso la prende male. */
export function rejectOffer(s: GameSession, index: number): string {
  const o = dropOffer(s, index);
  if (!o) return 'Offerta non più valida.';
  const hit = refusalMoraleHit(s.world, s.club, o);
  // Il club rifiutato può tornare col rilancio (MODULE_MARKET §9.4).
  s.rejectedOffers = [
    ...(s.rejectedOffers ?? []),
    {
      playerId: o.playerId as string,
      fromClubId: o.fromClubId as string,
      bid: o.bid,
      round: o.round,
    },
  ].slice(-10);
  return hit > 0
    ? `Offerta respinta. ${o.playerName} sperava nel grande salto: morale in calo.`
    : `Offerta respinta. ${o.playerName} resta concentrato.`;
}

// ---- Viaggi di mercato (MODULE_MARKET §8): mappa, ricerca, trattativa (guscio) ----
import type { ClubId, PlayerId } from '../../../src/core/ids';
import type { Player, Position } from '../../../src/core/types';

/** Stato generale della sezione mercato: finestra, budget, viaggio, pre-accordi. */
export function marketWorldView(s: GameSession) {
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const window = s.runner.isFinished() ? null : marketWindowOpen(round, total);
  return {
    window,
    deadline: window ? isDeadlineDay(round, total) : false,
    budget: s.club.finances.transferBudget,
    cash: s.club.finances.cash,
    tripDone: s.lastTripRound === round,
    tripCost: NEGOTIATION.TRIP_COST,
    squadSize: s.club.playerIds.length,
    squadCap: NEGOTIATION.SQUAD_CAP,
    preDeals: (s.preDeals ?? []).map((d) => ({
      player: d.playerName,
      from: d.sellerName,
      fee: d.fee,
    })),
  };
}

export interface MarketClubRow {
  id: string;
  name: string;
  league: string;
  nation: string;
  reputation: number;
  avg: number;
  squad: number;
  mine: boolean;
}

/** Tutti i club del mondo per la mappa (la UI li colloca in città via clubIdentity). */
export function marketClubs(s: GameSession): MarketClubRow[] {
  return [...s.world.clubs.values()].map((c) => {
    const lg = leagueOfClub(s.world, c.id);
    const squad = c.playerIds.map((id) => s.world.players.get(id)!).filter(Boolean);
    return {
      id: c.id as string,
      name: c.name,
      league: lg.name,
      nation: s.world.nations?.find((n) => n.id === lg.nationId)?.code ?? 'ITA',
      reputation: c.reputation,
      avg: Math.round(squad.reduce((a, p) => a + playerOverall(p), 0) / Math.max(1, squad.length)),
      squad: squad.length,
      mine: c.id === s.club.id,
    };
  });
}

export interface MarketPlayerRow {
  id: string;
  name: string;
  pos: Position;
  age: number;
  nat: string;
  overall: number;
  /** G2: la valutazione VISIBILE (mai il numero). */
  stars: string;
  band: string;
  club: string;
  clubId: string;
  league: string;
  nation: string;
  ask: number;
  status: 'incedibile' | 'cedibile' | 'vetrina';
  contractEnd: number | null;
  listed: boolean;
}

/** G3/G4: la forma del giocatore (media pagelle per TUTTI + ruolo, coeff. campionato)
 *  — su scala MONDO: anche chi gioca nelle altre divisioni ha una forma vera. */
function playerRow(s: GameSession, p: Player, seller: Club): MarketPlayerRow {
  const lg = leagueOfClub(s.world, seller.id);
  const pres = [...(s.world.presidents?.values() ?? [])].find((x) => x.clubId === seller.id);
  const status = playerMarketStatus(s.world, seller, p, s.year);
  const ask =
    Math.round(
      (askingPrice(s.world, seller, pres, p, s.year) *
        NEGOTIATION.STATUS_ASK[status] *
        formFor(s, p, seller)) /
        100_000,
    ) * 100_000;
  const contract = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
  return {
    id: p.id as string,
    name: p.name,
    pos: p.position,
    age: p.age,
    nat: p.nationality,
    overall: Math.round(playerOverall(p)),
    stars: starString(playerOverall(p)),
    band: bandOf(playerOverall(p), p.age),
    club: seller.name,
    clubId: seller.id as string,
    league: lg.name,
    nation: s.world.nations?.find((n) => n.id === lg.nationId)?.code ?? 'ITA',
    ask,
    status,
    contractEnd: contract?.endYear ?? null,
    listed: (s.shortlist ?? []).includes(p.id as string),
  };
}

export interface PlayerSearchFilters {
  name?: string;
  position?: Position | '';
  nationality?: string;
  league?: string;
  ageMax?: number | null;
  maxAsk?: number | null;
  expiring?: boolean;
}

/** Ricerca globale con filtri combinabili (§8.1). Mai i propri giocatori. */
export function searchPlayers(
  s: GameSession,
  f: PlayerSearchFilters,
  limit = 40,
): MarketPlayerRow[] {
  const name = (f.name ?? '').trim().toLowerCase();
  const out: MarketPlayerRow[] = [];
  for (const seller of s.world.clubs.values()) {
    if (seller.id === s.club.id) continue;
    const lg = leagueOfClub(s.world, seller.id);
    if (f.league && lg.name !== f.league) continue;
    for (const pid of seller.playerIds) {
      const p = s.world.players.get(pid);
      if (!p) continue;
      if (name && !p.name.toLowerCase().includes(name)) continue;
      if (f.position && p.position !== f.position) continue;
      if (f.nationality && p.nationality !== f.nationality) continue;
      if (f.ageMax != null && p.age > f.ageMax) continue;
      if (f.expiring && contractYearsLeft(s.world, p, s.year) > 1) continue;
      const row = playerRow(s, p, seller);
      if (f.maxAsk != null && row.ask > f.maxAsk) continue;
      out.push(row);
    }
  }
  return out.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Le nazionalità presenti nel mondo (per il filtro). */
export function marketNationalities(s: GameSession): string[] {
  const set = new Set<string>();
  for (const p of s.world.players.values()) set.add(p.nationality);
  return [...set].sort();
}

/** I campionati del mondo (per il filtro). */
export function marketLeagues(s: GameSession): string[] {
  return s.world.leagues.map((l) => l.name);
}

/** La rosa di un club sulla mappa, pronta per la trattativa. */
export function marketClubSquad(s: GameSession, clubId: string): MarketPlayerRow[] {
  const seller = s.world.clubs.get(clubId as ClubId);
  if (!seller || seller.id === s.club.id) return [];
  return seller.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => playerRow(s, p, seller))
    .sort((a, b) => b.overall - a.overall);
}

/** Stellina sul taccuino: aggiunge/toglie. Ritorna lo stato finale. */
export function toggleShortlist(s: GameSession, playerId: string): boolean {
  const list = s.shortlist ?? [];
  if (list.includes(playerId)) {
    s.shortlist = list.filter((id) => id !== playerId);
    return false;
  }
  s.shortlist = [...list, playerId];
  return true;
}

/** Il taccuino del DS: gli obiettivi seguiti (i venduti/comprati cadono da soli). */
export function shortlistRows(s: GameSession): MarketPlayerRow[] {
  const out: MarketPlayerRow[] = [];
  for (const id of s.shortlist ?? []) {
    const p = s.world.players.get(id as PlayerId);
    if (!p) continue;
    const seller = [...s.world.clubs.values()].find((c) => c.playerIds.includes(p.id));
    if (!seller || seller.id === s.club.id) continue;
    out.push(playerRow(s, p, seller));
  }
  return out;
}

/** I consigli del DS (§8.6): deterministici, dal bisogno reale della rosa. */
export function dsAdvice(s: GameSession) {
  return dsSuggestions(s.world, s.club, s.year, 5).map((t) => ({
    id: t.playerId as string,
    name: t.name,
    pos: t.position,
    age: t.age,
    stars: starString(t.overall),
    club: t.clubName,
    clubId: t.clubId as string,
    ask: t.ask,
    status: t.status,
    why: t.why,
  }));
}

/** I tavoli aperti (hub trattative): migra il campo legacy a tavolo singolo. */
/** Più trattative in parallelo, ma non un bazar: il DS regge al massimo 3 tavoli vivi. */
