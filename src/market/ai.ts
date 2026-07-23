/**
 * Mercato AI attivo (MODULE_MARKET §7): il mondo compra e vende da solo nelle
 * finestre, e bussa alla porta del club utente. Puro e deterministico: RNG
 * iniettato dal runner, nessun I/O. Riusa l'intera filiera esistente
 * (askingPrice → negotiateTransfer → playerAcceptsMove → executeTransfer).
 */

import type { ClubId, PlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type { Club, League, Player, Position, President, World } from '../core/types.js';
import type { Rng } from '../rng/rng.js';
import { askingPrice, executeTransfer, negotiateTransfer, playerAcceptsMove } from './transfers.js';
import { agencyCommissionFor, expectedWage, offeredYears } from './value.js';

/** Costanti del mercato AI (provvisorie: rifinire con finance-health). */
export const AI_MARKET = {
  /** Finestre in giornate (stagione da 38): estiva 1-4, invernale 18-22. */
  SUMMER: [1, 4] as const,
  WINTER: [18, 22] as const,
  /** Probabilità per club AI per giornata di finestra di tentare un colpo. */
  DEAL_CHANCE: 0.1,
  /** Moltiplicatore al deadline day (ultima giornata di finestra). */
  DEADLINE_MULT: 1.6,
  /** Probabilità per giornata che arrivi un'offerta per un giocatore dell'utente. */
  USER_OFFER_CHANCE: 0.22,
  /** Le offerte scadono dopo N giornate. */
  OFFER_TTL: 2,
  /** Il compratore AI non insegue chi ha reputazione molto sopra la sua. */
  REP_REACH: 8,
  /** Il Grande Salto: rifiutarlo a un ambizioso costa morale. */
  BIG_STEP_REP: 10,
  REFUSAL_HIT: 0.1,
} as const;

export type MarketWindow = 'estivo' | 'invernale' | null;

/** Composizione-obiettivo del reparto (rispecchia SQUAD_COMPOSITION della generazione
 *  senza dipenderne: il mercato resta legato al solo core — ARCHITECTURE). */
const ROLE_TARGET: Record<Position, number> = { GK: 3, DF: 8, MF: 9, FW: 5 };

/** Finestra aperta a questa giornata? Scala sulle stagioni corte. */
export function marketWindowOpen(round: number, totalRounds: number): MarketWindow {
  const scale = totalRounds / 38;
  const s = AI_MARKET.SUMMER.map((r) => Math.max(1, Math.round(r * scale)));
  const w = AI_MARKET.WINTER.map((r) => Math.max(1, Math.round(r * scale)));
  if (round >= s[0]! && round <= s[1]!) return 'estivo';
  if (round >= w[0]! && round <= w[1]!) return 'invernale';
  return null;
}

/** Ultima giornata della finestra corrente (deadline day)? */
export function isDeadlineDay(round: number, totalRounds: number): boolean {
  const scale = totalRounds / 38;
  return (
    round === Math.max(1, Math.round(AI_MARKET.SUMMER[1] * scale)) ||
    round === Math.max(1, Math.round(AI_MARKET.WINTER[1] * scale))
  );
}

export interface SquadNeed {
  position: Position;
  urgency: number;
}

/** Dove il club soffre: carenza numerica, reparto sotto la media, titolari che invecchiano. */
export function squadNeeds(world: World, club: Club): SquadNeed[] {
  const squad = club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined);
  if (squad.length === 0) return [];
  const avgAll = squad.reduce((s, p) => s + playerOverall(p), 0) / squad.length;
  const needs: SquadNeed[] = [];
  for (const [position, target] of Object.entries(ROLE_TARGET) as [Position, number][]) {
    const group = squad.filter((p) => p.position === position);
    const shortage = Math.max(0, target - group.length);
    const avg =
      group.length > 0 ? group.reduce((s, p) => s + playerOverall(p), 0) / group.length : 0;
    const quality = Math.max(0, (avgAll - avg) / 10);
    const aging = group.filter((p) => p.age >= 30 && playerOverall(p) >= avgAll).length * 0.3;
    const urgency = shortage * 1.2 + quality + aging;
    if (urgency > 0.2) needs.push({ position, urgency });
  }
  return needs.sort((a, b) => b.urgency - a.urgency);
}

export interface DealNews {
  round: number;
  buyer: string;
  seller: string;
  player: string;
  fee: number;
  headline: string;
}

function presidentOf(world: World, clubId: ClubId): President | undefined {
  return [...(world.presidents?.values() ?? [])].find((p) => p.clubId === clubId);
}

function headlineFor(rng: Rng, deadline: boolean, fee: number, player: string, buyer: string) {
  const M = (fee / 1e6).toFixed(1);
  const pool = deadline
    ? [
        `AFFARE IN EXTREMIS: ${player} al ${buyer} per ${M}M a mercato quasi chiuso.`,
        `DEADLINE DAY: il ${buyer} piazza il colpo ${player} (${M}M) all'ultimo respiro.`,
      ]
    : [
        `COLPO: il ${buyer} si prende ${player} per ${M}M.`,
        `UFFICIALE: ${player} firma col ${buyer}, ${M}M sul piatto.`,
        `IL MERCATO SI MUOVE: ${M}M e ${player} cambia maglia, destinazione ${buyer}.`,
      ];
  return pool[Math.floor(rng.next() * pool.length)] ?? pool[0]!;
}

/**
 * Un giro di mercato AI per la lega in gioco: ogni club (MAI quello utente, né come
 * compratore né come venditore) può tentare il colpo dove ha più bisogno.
 */
export function aiMarketRound(
  world: World,
  league: League,
  round: number,
  totalRounds: number,
  rng: Rng,
  userClubId?: ClubId,
): DealNews[] {
  if (!marketWindowOpen(round, totalRounds)) return [];
  const deadline = isDeadlineDay(round, totalRounds);
  const chance = AI_MARKET.DEAL_CHANCE * (deadline ? AI_MARKET.DEADLINE_MULT : 1);
  const news: DealNews[] = [];

  for (const buyerId of league.clubIds) {
    if (buyerId === userClubId) continue;
    if (!rng.chance(chance)) continue;
    const buyer = world.clubs.get(buyerId);
    if (!buyer || buyer.finances.transferBudget <= 0) continue;
    // Tetto rosa: nessuna collezione di figurine (la youth intake ricolma i venditori).
    if (buyer.playerIds.length >= 27) continue;
    const need = squadNeeds(world, buyer)[0];
    if (!need) continue;

    const target = findTarget(world, buyer, need.position, userClubId);
    if (!target) continue;
    const { seller, player } = target;

    const sellerPres = presidentOf(world, seller.id);
    const buyerPres = presidentOf(world, buyer.id);
    if (!buyerPres) continue;
    const ask = askingPrice(world, seller, sellerPres, player, seasonYear(world));
    if (ask > buyer.finances.transferBudget) continue;
    // L'ambizioso paga quasi il prezzo pieno; il prudente prova al ribasso.
    const bid =
      Math.round((ask * (0.86 + 0.12 * buyerPres.personality.ambition)) / 100_000) * 100_000;
    const outcome = negotiateTransfer(
      bid,
      ask,
      buyerPres,
      sellerPres,
      buyer.finances.transferBudget,
      rng,
    );
    if (!outcome.agreed) continue;
    if (!playerAcceptsMove(world, player, seller, buyer, seasonYear(world))) continue;

    const overall = playerOverall(player);
    const wage = expectedWage(overall, player.age);
    const commission = agencyCommissionFor(wage, player.agencyId !== undefined);
    executeTransfer(
      world,
      seller,
      buyer,
      player,
      outcome.fee,
      wage,
      offeredYears(player.age),
      commission,
      seasonYear(world),
    );
    news.push({
      round,
      buyer: buyer.name,
      seller: seller.name,
      player: player.name,
      fee: outcome.fee,
      headline: headlineFor(rng, deadline, outcome.fee, player.name, buyer.name),
    });
  }
  return news;
}

/** Il miglior giocatore del ruolo raggiungibile: club non-utente, reputazione avvicinabile. */
function findTarget(
  world: World,
  buyer: Club,
  position: Position,
  userClubId?: ClubId,
): { seller: Club; player: Player } | null {
  let best: { seller: Club; player: Player; score: number } | null = null;
  for (const seller of world.clubs.values()) {
    if (seller.id === buyer.id || seller.id === userClubId) continue;
    if (seller.reputation > buyer.reputation + AI_MARKET.REP_REACH) continue;
    for (const pid of seller.playerIds) {
      const p = world.players.get(pid);
      if (!p || p.position !== position) continue;
      // Niente saccheggi totali: il venditore tiene almeno il minimo del reparto.
      const groupSize = seller.playerIds.filter(
        (id) => world.players.get(id)?.position === position,
      ).length;
      if (groupSize <= Math.max(2, (ROLE_TARGET[position] ?? 3) - 2)) continue;
      const score = playerOverall(p) - p.age * 0.4;
      if (!best || score > best.score) best = { seller, player: p, score };
    }
  }
  return best ? { seller: best.seller, player: best.player } : null;
}

function seasonYear(world: World): number {
  // L'anno corrente è quello dei contratti più recenti; fallback 2026.
  let max = 2026;
  for (const c of world.contracts.values()) if (c.startYear > max) max = c.startYear;
  return max;
}

// ---------------------------------------------------------------- offerte all'utente

export interface IncomingOffer {
  playerId: PlayerId;
  playerName: string;
  fromClubId: ClubId;
  fromClubName: string;
  fromReputation: number;
  bid: number;
  ask: number;
  round: number;
  expiresRound: number;
  /** Una sola controproposta concessa. */
  countered?: boolean;
}

/** Ogni giornata di finestra un club AI può puntare un giocatore dell'utente. */
export function aiOffersForUser(
  world: World,
  league: League,
  userClub: Club,
  round: number,
  totalRounds: number,
  rng: Rng,
): IncomingOffer[] {
  if (!marketWindowOpen(round, totalRounds)) return [];
  const deadline = isDeadlineDay(round, totalRounds);
  if (!rng.chance(AI_MARKET.USER_OFFER_CHANCE * (deadline ? AI_MARKET.DEADLINE_MULT : 1)))
    return [];

  // Il pretendente: un club della lega con budget, pescato tra i più ricchi.
  const suitors = league.clubIds
    .map((id) => world.clubs.get(id))
    .filter(
      (c): c is Club =>
        c !== undefined && c.id !== userClub.id && c.finances.transferBudget > 2_000_000,
    )
    .sort((a, b) => b.finances.transferBudget - a.finances.transferBudget);
  const suitor = suitors[Math.floor(rng.next() * Math.min(6, suitors.length))];
  if (!suitor) return [];

  // Puntano i tuoi migliori (i primi 5 per overall), pesati verso il top.
  const squad = userClub.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => playerOverall(b) - playerOverall(a))
    .slice(0, 5);
  const target = squad[Math.floor(rng.next() * rng.next() * squad.length)];
  if (!target) return [];

  const ask = askingPrice(
    world,
    userClub,
    presidentOf(world, userClub.id),
    target,
    seasonYear(world),
  );
  if (ask > suitor.finances.transferBudget) return [];
  const bid = Math.round((ask * (0.85 + 0.25 * rng.next())) / 100_000) * 100_000;
  return [
    {
      playerId: target.id,
      playerName: target.name,
      fromClubId: suitor.id,
      fromClubName: suitor.name,
      fromReputation: suitor.reputation,
      bid,
      ask,
      round,
      expiresRound: round + AI_MARKET.OFFER_TTL,
    },
  ];
}

/** Esito della controproposta dell'utente (una sola, poi il compratore decide). */
export function resolveCounter(
  world: World,
  offer: IncomingOffer,
  counter: number,
  rng: Rng,
): { accepted: boolean; reason: string } {
  const buyer = world.clubs.get(offer.fromClubId);
  const pres = buyer ? presidentOf(world, buyer.id) : undefined;
  if (!buyer || !pres) return { accepted: false, reason: 'Il club si è ritirato.' };
  if (counter > buyer.finances.transferBudget)
    return { accepted: false, reason: 'Fuori dalla loro portata: si ritirano.' };
  // L'ambizione apre il portafoglio; oltre ask×(1+0.15·ambizione) si ritirano.
  const ceiling = offer.ask * (1 + 0.15 * pres.personality.ambition);
  if (counter <= ceiling && rng.chance(0.75 + 0.2 * pres.personality.ambition))
    return {
      accepted: true,
      reason: `Accettano la tua richiesta: ${(counter / 1e6).toFixed(1)}M.`,
    };
  return { accepted: false, reason: 'Troppo cara: il club si ritira dal tavolo.' };
}

/** Vendita al club AI: esegue il trasferimento coi termini correnti del compratore. */
export function sellToAI(world: World, userClub: Club, offer: IncomingOffer, fee: number): boolean {
  const buyer = world.clubs.get(offer.fromClubId);
  const player = world.players.get(offer.playerId);
  if (!buyer || !player || !userClub.playerIds.includes(player.id)) return false;
  const overall = playerOverall(player);
  const wage = expectedWage(overall, player.age);
  executeTransfer(
    world,
    userClub,
    buyer,
    player,
    fee,
    wage,
    offeredYears(player.age),
    agencyCommissionFor(wage, player.agencyId !== undefined),
    seasonYear(world),
  );
  return true;
}

/**
 * Rifiutare il Grande Salto a un ambizioso costa morale (MODULE_MARKET §7.4);
 * il professionale incassa. Ritorna il colpo applicato (0 se nessuno).
 */
export function refusalMoraleHit(world: World, userClub: Club, offer: IncomingOffer): number {
  const player = world.players.get(offer.playerId);
  if (!player) return 0;
  if (offer.fromReputation < userClub.reputation + AI_MARKET.BIG_STEP_REP) return 0;
  const hit =
    AI_MARKET.REFUSAL_HIT *
    player.personality.ambition *
    (1 - 0.5 * player.personality.professionalism);
  player.morale = Math.max(0, player.morale - hit);
  return hit;
}
