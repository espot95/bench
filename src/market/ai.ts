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
import { relationBetween } from './relations.js';
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
  // ---- M4: mercato con memoria (MODULE_MARKET §9) ----
  /** Spesa scalata: chance ×(1 + CASH_PUSH·min(1, budget/RICH_BUDGET)·(0.5+ambizione)). */
  CASH_PUSH: 0.9,
  RICH_BUDGET: 60_000_000,
  /** Tetto alla chance per club per giornata (le bande di rosa restano in banda). */
  CHANCE_CAP: 0.35,
  /** Duelli: un rivale con lo stesso bisogno rilancia e il prezzo sale. */
  DUEL_P: 0.3,
  DUEL_RAISE: [1.08, 1.25] as const,
  /** Effetto domino: chi vende reinveste subito una quota dell'incasso. */
  DOMINO_P: 0.5,
  DOMINO_REINVEST: 0.8,
  /** Deadline day: l'affare può sfumare sul gong. */
  GONG_P: 0.15,
  /** Indiscrezioni: probabilità per giornata (finestra + WARMUP giornate prima). */
  RUMOR_P: 0.5,
  RUMOR_USER_P: 0.25,
  RUMOR_WARMUP: 2,
  /** Hot list (addii annunciati / cessioni richieste): offerte reali ma scontate. */
  HOT_OFFER_CHANCE: 0.5,
  HOT_DISCOUNT: 0.78,
  /** Il club rifiutato può tornare UNA volta col rilancio. */
  RETURN_OFFER_P: 0.35,
  RETURN_RAISE: 1.12,
} as const;

export type MarketWindow = 'estivo' | 'invernale' | null;

/** Composizione-obiettivo del reparto (rispecchia SQUAD_COMPOSITION della generazione
 *  senza dipenderne: il mercato resta legato al solo core — ARCHITECTURE). */
export const ROLE_TARGET: Record<Position, number> = { GK: 3, DF: 8, MF: 9, FW: 5 };

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
  /** Tracciabilità per il borsino (§9.3). Assente nelle news di sistema. */
  playerId?: PlayerId;
  /** 0 = rumor/affare saltato (nessun denaro mosso). */
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
  const news: DealNews[] = [];

  for (const buyerId of league.clubIds) {
    if (buyerId === userClubId) continue;
    const buyer = world.clubs.get(buyerId);
    if (!buyer) continue;
    const buyerPres = presidentOf(world, buyerId);
    // Spesa scalata (§9.2): i ricchi ambiziosi comprano più spesso — il surplus circola.
    const push =
      1 +
      AI_MARKET.CASH_PUSH *
        Math.min(1, buyer.finances.transferBudget / AI_MARKET.RICH_BUDGET) *
        (0.5 + (buyerPres?.personality.ambition ?? 0.5));
    const chance = AI_MARKET.DEAL_CHANCE * (deadline ? AI_MARKET.DEADLINE_MULT : 1) * push;
    if (!rng.chance(Math.min(AI_MARKET.CHANCE_CAP, chance))) continue;
    if (buyer.finances.transferBudget <= 0 || !buyerPres) continue;
    // Tetto rosa: nessuna collezione di figurine (la youth intake ricolma i venditori).
    if (buyer.playerIds.length >= 27) continue;
    const need = squadNeeds(world, buyer)[0];
    if (!need) continue;

    const deal = attemptPurchase(
      world,
      league,
      buyer,
      buyerPres,
      need.position,
      round,
      deadline,
      rng,
      news,
      userClubId,
    );
    if (!deal) continue;
    news.push(deal.news);

    // Effetto domino (§9.2): chi ha venduto reinveste SUBITO una quota dell'incasso.
    if (
      deal.seller.id !== userClubId &&
      deal.seller.playerIds.length < 27 &&
      rng.chance(AI_MARKET.DOMINO_P)
    ) {
      const sellerPres = presidentOf(world, deal.seller.id);
      if (sellerPres) {
        deal.seller.finances.transferBudget += Math.round(
          deal.news.fee * AI_MARKET.DOMINO_REINVEST,
        );
        const re = attemptPurchase(
          world,
          league,
          deal.seller,
          sellerPres,
          deal.position,
          round,
          deadline,
          rng,
          news,
          userClubId,
          deal.buyerId,
        );
        if (re) {
          re.news.headline = `EFFETTO DOMINO: venduto ${deal.news.player}, il ${deal.seller.name} reinveste subito su ${re.news.player} (${(re.news.fee / 1e6).toFixed(1)}M).`;
          news.push(re.news);
        }
      }
    }
  }
  return news;
}

/**
 * Un tentativo d'acquisto completo (bersaglio → eventuale DUELLO → trattativa → gong →
 * esecuzione). Le news degli affari SALTATI sul gong finiscono direttamente in `news`.
 */
function attemptPurchase(
  world: World,
  league: League,
  buyer: Club,
  buyerPres: President,
  position: Position,
  round: number,
  deadline: boolean,
  rng: Rng,
  news: DealNews[],
  userClubId?: ClubId,
  excludeSellerId?: ClubId,
): { news: DealNews; seller: Club; position: Position; buyerId: ClubId } | null {
  const target = findTarget(world, buyer, position, userClubId, excludeSellerId);
  if (!target) return null;
  const { seller, player } = target;
  const sellerPres = presidentOf(world, seller.id);
  let ask = askingPrice(world, seller, sellerPres, player, seasonYear(world));
  if (ask > buyer.finances.transferBudget) return null;

  // DUELLO (§9.2): un rivale con lo stesso bisogno rilancia — il prezzo sale, uno vince.
  let finalBuyer = buyer;
  let finalPres = buyerPres;
  let duelLoser: Club | null = null;
  if (rng.chance(AI_MARKET.DUEL_P)) {
    const rival = findRival(world, league, buyer, seller, position, userClubId);
    if (rival) {
      ask =
        Math.round(
          (ask * rng.uniform(AI_MARKET.DUEL_RAISE[0], AI_MARKET.DUEL_RAISE[1])) / 100_000,
        ) * 100_000;
      const rivalPres = presidentOf(world, rival.id);
      const power = (c: Club, p?: President) =>
        c.finances.transferBudget * (0.8 + 0.4 * (p?.personality.ambition ?? 0.5));
      if (
        rivalPres &&
        power(rival, rivalPres) > power(buyer, buyerPres) &&
        ask <= rival.finances.transferBudget &&
        rival.playerIds.length < 27
      ) {
        duelLoser = buyer;
        finalBuyer = rival;
        finalPres = rivalPres;
      } else if (ask > buyer.finances.transferBudget) {
        return null; // il duello ha gonfiato il prezzo oltre le possibilità di entrambi
      } else {
        duelLoser = rival;
      }
    }
  }

  // L'ambizioso paga quasi il prezzo pieno; il prudente prova al ribasso.
  const bid =
    Math.round((ask * (0.86 + 0.12 * finalPres.personality.ambition)) / 100_000) * 100_000;
  const outcome = negotiateTransfer(
    bid,
    ask,
    finalPres,
    sellerPres,
    finalBuyer.finances.transferBudget,
    rng,
  );
  if (!outcome.agreed) return null;
  if (!playerAcceptsMove(world, player, seller, finalBuyer, seasonYear(world))) return null;

  // SFUMA SUL GONG (§9.2): al deadline day qualche affare muore alla firma.
  if (deadline && rng.chance(AI_MARKET.GONG_P)) {
    news.push({
      round,
      buyer: finalBuyer.name,
      seller: seller.name,
      player: player.name,
      playerId: player.id,
      fee: 0,
      headline: `SFUMA SUL GONG: ${player.name} al ${finalBuyer.name} salta all'ultimo istante — i documenti non arrivano in tempo.`,
    });
    return null;
  }

  const overall = playerOverall(player);
  const wage = expectedWage(overall, player.age);
  const commission = agencyCommissionFor(wage, player.agencyId !== undefined);
  executeTransfer(
    world,
    seller,
    finalBuyer,
    player,
    outcome.fee,
    wage,
    offeredYears(player.age),
    commission,
    seasonYear(world),
  );
  const headline = duelLoser
    ? `DUELLO VINTO: il ${finalBuyer.name} brucia il ${duelLoser.name} per ${player.name} (${(outcome.fee / 1e6).toFixed(1)}M).`
    : headlineFor(rng, deadline, outcome.fee, player.name, finalBuyer.name);
  return {
    news: {
      round,
      buyer: finalBuyer.name,
      seller: seller.name,
      player: player.name,
      playerId: player.id,
      fee: outcome.fee,
      headline,
    },
    seller,
    position,
    buyerId: finalBuyer.id,
  };
}

/** Un rivale plausibile per il duello: stesso bisogno nei primi due, budget, posto in rosa. */
function findRival(
  world: World,
  league: League,
  buyer: Club,
  seller: Club,
  position: Position,
  userClubId?: ClubId,
): Club | null {
  for (const id of league.clubIds) {
    if (id === buyer.id || id === seller.id || id === userClubId) continue;
    const c = world.clubs.get(id);
    if (!c || c.playerIds.length >= 27 || c.finances.transferBudget <= 0) continue;
    if (
      squadNeeds(world, c)
        .slice(0, 2)
        .some((n) => n.position === position)
    )
      return c;
  }
  return null;
}

/** Il miglior giocatore del ruolo raggiungibile: club non-utente, reputazione avvicinabile. */
function findTarget(
  world: World,
  buyer: Club,
  position: Position,
  userClubId?: ClubId,
  excludeSellerId?: ClubId,
): { seller: Club; player: Player } | null {
  let best: { seller: Club; player: Player; score: number } | null = null;
  for (const seller of world.clubs.values()) {
    if (seller.id === buyer.id || seller.id === userClubId || seller.id === excludeSellerId)
      continue;
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
  /** G3: fattore-forma del giocatore puntato (default 1 = neutro). */
  formOf?: (playerId: PlayerId) => number,
): IncomingOffer[] {
  if (!marketWindowOpen(round, totalRounds)) return [];
  const deadline = isDeadlineDay(round, totalRounds);
  if (!rng.chance(AI_MARKET.USER_OFFER_CHANCE * (deadline ? AI_MARKET.DEADLINE_MULT : 1)))
    return [];

  // Il pretendente: un club della lega con budget — chi ha già fatto affari con te
  // bussa più volentieri (rapporti, §9.1), poi contano i soldi.
  const suitors = league.clubIds
    .map((id) => world.clubs.get(id))
    .filter(
      (c): c is Club =>
        c !== undefined && c.id !== userClub.id && c.finances.transferBudget > 2_000_000,
    )
    .sort(
      (a, b) =>
        relationBetween(world, userClub.id, b.id) - relationBetween(world, userClub.id, a.id) ||
        b.finances.transferBudget - a.finances.transferBudget,
    );
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
  // G3: chi sta rendendo costa di più — la forma scala l'offerta.
  const form = formOf ? formOf(target.id) : 1;
  const bid = Math.round((ask * form * (0.85 + 0.25 * rng.next())) / 100_000) * 100_000;
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

// ---------------------------------------------------------------- M4: rumors e memoria

/** La stagione dei rumors: finestra aperta, o le WARMUP giornate prima dell'apertura. */
function rumorSeason(round: number, totalRounds: number): boolean {
  if (marketWindowOpen(round, totalRounds)) return true;
  const scale = totalRounds / 38;
  const opens = [AI_MARKET.SUMMER[0], AI_MARKET.WINTER[0]].map((r) =>
    Math.max(1, Math.round(r * scale)),
  );
  return opens.some((o) => round >= o - AI_MARKET.RUMOR_WARMUP && round < o);
}

/**
 * Indiscrezioni procedurali (§9.3): accoppiamenti plausibili, non vincolanti — il feed
 * vive anche nelle giornate senza affari. A volte il bersaglio è un TUO giocatore.
 */
export function marketRumors(
  world: World,
  league: League,
  round: number,
  totalRounds: number,
  rng: Rng,
  userClubId?: ClubId,
): DealNews[] {
  if (!rumorSeason(round, totalRounds)) return [];
  if (!rng.chance(AI_MARKET.RUMOR_P)) return [];
  const clubs = league.clubIds
    .map((id) => world.clubs.get(id))
    .filter((c): c is Club => c !== undefined && c.id !== userClubId);
  const gossiper = clubs[rng.int(0, Math.max(0, clubs.length - 1))];
  if (!gossiper) return [];

  if (userClubId && rng.chance(AI_MARKET.RUMOR_USER_P)) {
    const userClub = world.clubs.get(userClubId);
    const top = (userClub?.playerIds ?? [])
      .map((id) => world.players.get(id))
      .filter((p): p is Player => p !== undefined)
      .sort((a, b) => playerOverall(b) - playerOverall(a))
      .slice(0, 5);
    const prey = top[rng.int(0, Math.max(0, top.length - 1))];
    if (!prey || !userClub) return [];
    return [
      {
        round,
        buyer: gossiper.name,
        seller: userClub.name,
        player: prey.name,
        playerId: prey.id,
        fee: 0,
        headline: rng.pick([
          `INDISCREZIONE: il ${gossiper.name} ha messo gli occhi su ${prey.name}. La piazza trema.`,
          `Sirene su ${prey.name}: emissari del ${gossiper.name} in tribuna alle ultime gare.`,
        ]),
      },
    ];
  }

  const need = squadNeeds(world, gossiper)[0];
  if (!need) return [];
  const target = findTarget(world, gossiper, need.position, userClubId);
  if (!target) return [];
  return [
    {
      round,
      buyer: gossiper.name,
      seller: target.seller.name,
      player: target.player.name,
      playerId: target.player.id,
      fee: 0,
      headline: rng.pick([
        `INDISCREZIONE: il ${gossiper.name} segue ${target.player.name} (${target.seller.name}).`,
        `Sirene per ${target.player.name}: il ${gossiper.name} ci sta pensando davvero.`,
        `BORSINO: sale la quotazione di ${target.player.name} — piace al ${gossiper.name}.`,
      ]),
    },
  ];
}

/**
 * Offerte AI REALI ma scontate per la hot list (§9.4): addii annunciati e cessioni
 * richieste. Chi ha rapporti con te bussa per primo. Incassi ora, o li perdi a zero.
 */
export function solicitOffers(
  world: World,
  userClub: Club,
  hotIds: readonly PlayerId[],
  round: number,
  totalRounds: number,
  rng: Rng,
): IncomingOffer[] {
  if (!marketWindowOpen(round, totalRounds)) return [];
  const out: IncomingOffer[] = [];
  for (const pid of hotIds) {
    const player = world.players.get(pid);
    if (!player || !userClub.playerIds.includes(pid)) continue;
    if (!rng.chance(AI_MARKET.HOT_OFFER_CHANCE)) continue;
    const suitors = [...world.clubs.values()]
      .filter(
        (c) =>
          c.id !== userClub.id && c.playerIds.length < 27 && c.finances.transferBudget > 1_000_000,
      )
      .sort(
        (a, b) =>
          relationBetween(world, userClub.id, b.id) - relationBetween(world, userClub.id, a.id) ||
          b.finances.transferBudget - a.finances.transferBudget,
      );
    const suitor = suitors[rng.int(0, Math.max(0, Math.min(5, suitors.length - 1)))];
    if (!suitor) continue;
    const ask = askingPrice(
      world,
      userClub,
      presidentOf(world, userClub.id),
      player,
      seasonYear(world),
    );
    const bid = Math.max(100_000, Math.round((ask * AI_MARKET.HOT_DISCOUNT) / 100_000) * 100_000);
    if (bid > suitor.finances.transferBudget) continue;
    out.push({
      playerId: pid,
      playerName: player.name,
      fromClubId: suitor.id,
      fromClubName: suitor.name,
      fromReputation: suitor.reputation,
      bid,
      ask,
      round,
      expiresRound: round + AI_MARKET.OFFER_TTL,
    });
  }
  return out;
}

/** Il club rifiutato può tornare UNA volta col rilancio (§9.4, memoria nella sessione). */
export function returnOffer(
  world: World,
  userClub: Club,
  rejected: { playerId: string; fromClubId: string; bid: number },
  round: number,
  totalRounds: number,
  rng: Rng,
): IncomingOffer | null {
  if (!marketWindowOpen(round, totalRounds)) return null;
  if (!rng.chance(AI_MARKET.RETURN_OFFER_P)) return null;
  const buyer = world.clubs.get(rejected.fromClubId as ClubId);
  const player = world.players.get(rejected.playerId as PlayerId);
  if (!buyer || !player || !userClub.playerIds.includes(player.id)) return null;
  const bid = Math.round((rejected.bid * AI_MARKET.RETURN_RAISE) / 100_000) * 100_000;
  if (bid > buyer.finances.transferBudget) return null;
  const ask = askingPrice(
    world,
    userClub,
    presidentOf(world, userClub.id),
    player,
    seasonYear(world),
  );
  return {
    playerId: player.id,
    playerName: player.name,
    fromClubId: buyer.id,
    fromClubName: buyer.name,
    fromReputation: buyer.reputation,
    bid,
    ask,
    round,
    expiresRound: round + AI_MARKET.OFFER_TTL,
  };
}
