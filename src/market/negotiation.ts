/**
 * Trattativa in USCITA dell'utente (MODULE_MARKET §8): viaggi di mercato.
 * Macchina a stati con mood del venditore, controproposte dinamiche, rotture,
 * poi l'ingaggio con l'entourage del giocatore. Puro e deterministico: RNG
 * iniettato, nessun I/O — la UI è solo guscio. Riusa la filiera esistente
 * (askingPrice → playerAcceptsMove → executeTransfer).
 */

import { clubWageBill } from '../core/finance.js';
import type { ClubId, PlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type { Club, Player, President, World } from '../core/types.js';
import type { Rng } from '../rng/rng.js';
import { ROLE_TARGET, squadNeeds } from './ai.js';
import { RELATIONS, relationBetween } from './relations.js';
import { askingPrice, contractYearsLeft, executeTransfer, playerAcceptsMove } from './transfers.js';
import { agencyCommissionFor, expectedWage, offeredYears } from './value.js';

export const NEGOTIATION = {
  /** Giri massimi di offerte sul cartellino. */
  MAX_ROUNDS: 4,
  /** Sotto ask×INSULT l'offerta è un insulto: mood a picco. */
  INSULT: 0.55,
  /** Sotto questo mood il venditore si alza dal tavolo (definitivo). */
  WALKOUT_MOOD: 0.2,
  /** Trattare in persona ammorbidisce le soglie del venditore. */
  IN_PERSON_DISCOUNT: 0.07,
  /** Al deadline day i venditori mollano prima. */
  DEADLINE_SOFT: 0.06,
  /** Costo della trasferta (ledger `other`). */
  TRIP_COST: 150_000,
  /** Giri massimi sull'ingaggio con l'entourage. */
  WAGE_ROUNDS: 2,
  /** Moltiplicatore dell'ask per status. */
  STATUS_ASK: { incedibile: 1.5, cedibile: 1.0, vetrina: 0.85 } as const,
  /** Tetto rosa: come il mercato AI. */
  SQUAD_CAP: 27,
} as const;

// ------------------------------------------------------------------ status di mercato

export type MarketStatus = 'incedibile' | 'cedibile' | 'vetrina';

/** Status DERIVATO (mai memorizzato) da rosa e finanze del venditore (§8.2). */
export function playerMarketStatus(
  world: World,
  seller: Club,
  player: Player,
  year: number,
): MarketStatus {
  const squad = seller.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined);
  const sorted = [...squad].sort((a, b) => playerOverall(b) - playerOverall(a));
  const topTwo = sorted.slice(0, 2).some((p) => p.id === player.id);
  const group = squad.filter((p) => p.position === player.position).length;
  const surplus = group > (ROLE_TARGET[player.position] ?? 3) + 1;
  // Cassa in sofferenza: meno di ~sei mesi di monte ingaggi in banca.
  const cashTrouble = seller.finances.cash < clubWageBill(world, seller) * 26;
  const contract = player.contractId ? world.contracts.get(player.contractId) : undefined;
  const heavyVet =
    player.age >= 30 &&
    contract !== undefined &&
    contract.wage > expectedWage(playerOverall(player), player.age);
  const expiring = contractYearsLeft(world, player, year) <= 1;
  if (topTwo && !surplus && !cashTrouble && !expiring) return 'incedibile';
  if (surplus || heavyVet || cashTrouble || expiring) return 'vetrina';
  return 'cedibile';
}

// ------------------------------------------------------------------ stato trattativa

export interface NegotiationEvent {
  who: 'venditore' | 'agente' | 'tu' | 'sistema';
  text: string;
}

export interface NegotiationState {
  playerId: PlayerId;
  playerName: string;
  sellerClubId: ClubId;
  sellerName: string;
  stage: 'fee' | 'wage' | 'done' | 'failed';
  status: MarketStatus;
  inPerson: boolean;
  deadline: boolean;
  /** Giri consumati sul cartellino / sull'ingaggio. */
  round: number;
  wageRound: number;
  /** Richiesta corrente del venditore (scende trattando). */
  ask: number;
  /** Minimo privato del venditore (la UI non lo mostra). */
  floor: number;
  /** Umore del tavolo 0..1 (freddo → caldo). */
  mood: number;
  agreedFee?: number;
  wageAsk?: number;
  wageFloor?: number;
  agreedWage?: number;
  commission?: number;
  log: NegotiationEvent[];
}

const M = (v: number) => `${(v / 1e6).toFixed(1)}M`;
const K = (v: number) => `${Math.round(v / 1000)}k`;

function presidentOf(world: World, clubId: ClubId): President | undefined {
  return [...(world.presidents?.values() ?? [])].find((p) => p.clubId === clubId);
}

/** Si apre il tavolo (§8.3). L'incedibile può non sedersi nemmeno. */
export function openNegotiation(
  world: World,
  buyer: Club,
  seller: Club,
  player: Player,
  year: number,
  opts: { inPerson: boolean; deadline: boolean },
  rng: Rng,
): { ok: true; state: NegotiationState } | { ok: false; reason: string } {
  if (seller.id === buyer.id) return { ok: false, reason: 'È già un tuo giocatore.' };
  if (buyer.playerIds.length >= NEGOTIATION.SQUAD_CAP)
    return { ok: false, reason: `Rosa piena (${NEGOTIATION.SQUAD_CAP}): prima cedi.` };

  const status = playerMarketStatus(world, seller, player, year);
  const pres = presidentOf(world, seller.id);
  const composure = pres?.personality.composure ?? 0.5;
  const ambition = pres?.personality.ambition ?? 0.5;
  // Rapporti storici (§9.1): con chi conosci, il tavolo parte più morbido.
  const rel = relationBetween(world, buyer.id, seller.id);

  if (status === 'incedibile' && !opts.deadline && composure > 0.6 && rel < 1 && rng.chance(0.5)) {
    return {
      ok: false,
      reason: `Il presidente del ${seller.name} non si siede nemmeno: "${player.name} non è in vendita".`,
    };
  }

  const ask =
    Math.round(
      (askingPrice(world, seller, pres, player, year) * NEGOTIATION.STATUS_ASK[status]) / 100_000,
    ) * 100_000;
  // Il floor privato: la fame di cassa (ambition) e le pressioni lo abbassano,
  // la compostezza lo tiene su.
  const floorFactor = Math.max(
    0.55,
    Math.min(
      0.97,
      0.8 -
        0.08 * ambition -
        (status === 'vetrina' ? 0.08 : 0) -
        (opts.deadline ? NEGOTIATION.DEADLINE_SOFT : 0) -
        (opts.inPerson ? NEGOTIATION.IN_PERSON_DISCOUNT : 0) -
        RELATIONS.FLOOR_EASE * rel +
        0.1 * composure,
    ),
  );
  const mood =
    (status === 'incedibile' ? 0.35 : status === 'vetrina' ? 0.7 : 0.55) +
    (opts.inPerson ? 0.05 : 0) +
    RELATIONS.MOOD_BOOST * rel;

  const opening: Record<MarketStatus, string[]> = {
    incedibile: [
      `"${player.name} è il cuore di questa squadra. Ma sentiamo cosa avete in mente…"`,
      `"Vi ascolto solo per cortesia: servirebbe una follia per ${player.name}."`,
    ],
    cedibile: [
      `"Per ${player.name} valutiamo offerte serie. Partiamo da ${M(ask)}."`,
      `"Non lo svendiamo, ma il calcio è fatto di occasioni: ${M(ask)} e ne parliamo."`,
    ],
    vetrina: [
      `"${player.name} può partire, non lo nascondo. ${M(ask)} e trovate un accordo rapido."`,
      `"Cerchiamo una sistemazione per ${player.name}: ${M(ask)}, trattabili."`,
    ],
  };
  const state: NegotiationState = {
    playerId: player.id,
    playerName: player.name,
    sellerClubId: seller.id,
    sellerName: seller.name,
    stage: 'fee',
    status,
    inPerson: opts.inPerson,
    deadline: opts.deadline,
    round: 0,
    wageRound: 0,
    ask,
    floor: Math.round((ask * floorFactor) / 100_000) * 100_000,
    mood,
    log: [
      {
        who: 'sistema',
        text: opts.inPerson
          ? `Sei volato nella sede del ${seller.name}: il tavolo è apparecchiato.`
          : `Trattativa a distanza col ${seller.name}.`,
      },
      { who: 'venditore', text: rng.pick(opening[status]) },
    ],
  };
  if (rel >= 1) {
    state.log.push({
      who: 'sistema',
      text: 'Tra i due club c’è fiducia dopo gli affari passati: il tavolo parte ben disposto.',
    });
  }
  return { ok: true, state };
}

/** Passa allo stage ingaggio dopo la stretta di mano sul cartellino. */
function feeAgreed(
  world: World,
  state: NegotiationState,
  buyer: Club,
  seller: Club,
  player: Player,
  fee: number,
  year: number,
  rng: Rng,
): void {
  state.agreedFee = fee;
  state.log.push({
    who: 'venditore',
    text: rng.pick([
      `Stretta di mano: ${M(fee)} e ${state.playerName} è vostro. Ora convincete il ragazzo.`,
      `"Affare fatto a ${M(fee)}. Il resto è tra voi e il suo entourage."`,
    ]),
  });
  if (!playerAcceptsMove(world, player, seller, buyer, year)) {
    state.stage = 'failed';
    state.log.push({
      who: 'agente',
      text: `"Il mio assistito non ritiene la vostra piazza all'altezza: non se ne fa nulla."`,
    });
    return;
  }
  state.stage = 'wage';
  const base = expectedWage(playerOverall(player), player.age);
  const repGap = Math.max(0, seller.reputation - buyer.reputation);
  const expiring = contractYearsLeft(world, player, year) <= 1;
  const premium = Math.max(
    0.8,
    1 + 0.25 * player.personality.ambition + 0.012 * repGap - (expiring ? 0.1 : 0),
  );
  state.wageAsk = Math.round((base * premium) / 500) * 500;
  state.wageFloor = Math.round((base * Math.max(0.85, premium - 0.2)) / 500) * 500;
  state.log.push({
    who: 'agente',
    text: `"Parliamo di ingaggio: il mio assistito chiede ${K(state.wageAsk)} a settimana."`,
  });
}

/** Un'offerta sul cartellino (§8.3): accetta, controproone, si scalda o salta. */
export function offerFee(
  world: World,
  state: NegotiationState,
  buyer: Club,
  offer: number,
  year: number,
  rng: Rng,
): NegotiationState {
  if (state.stage !== 'fee') return state;
  const seller = world.clubs.get(state.sellerClubId);
  const player = world.players.get(state.playerId);
  if (!seller || !player) {
    state.stage = 'failed';
    state.log.push({ who: 'sistema', text: 'La controparte non è più al tavolo.' });
    return state;
  }
  state.round++;
  state.log.push({ who: 'tu', text: `Offri ${M(offer)} per il cartellino.` });

  // Stretta di mano immediata (il venditore non chiede più di quanto chiedeva).
  if (offer >= state.ask) {
    feeAgreed(world, state, buyer, seller, player, Math.min(offer, state.ask), year, rng);
    return state;
  }

  // Offerta insultante: il mood crolla, la richiesta risale, il tavolo può saltare.
  if (offer < state.ask * NEGOTIATION.INSULT) {
    state.mood = Math.max(0, state.mood - 0.35);
    state.ask = Math.round((state.ask * 1.03) / 100_000) * 100_000;
    if (state.mood < NEGOTIATION.WALKOUT_MOOD) {
      state.stage = 'failed';
      state.log.push({
        who: 'venditore',
        text: rng.pick([
          `"Ci avete fatto perdere tempo. Il tavolo è chiuso."`,
          `"Con queste cifre non trattiamo: arrivederci."`,
        ]),
      });
      return state;
    }
    state.log.push({
      who: 'venditore',
      text: rng.pick([
        `"È un'offesa, non un'offerta. La richiesta ora è ${M(state.ask)}."`,
        `"Se scherzate, noi rilanciamo: ${M(state.ask)} e non un euro di meno."`,
      ]),
    });
    return state;
  }

  // Offerta trattabile: il tavolo si scalda…
  state.mood = Math.min(1, state.mood + 0.08 + (offer / state.ask - NEGOTIATION.INSULT) * 0.15);
  const pres = presidentOf(world, seller.id);
  // …ma il fumantino può ribaltarlo (più probabile a tavolo freddo).
  if (pres && rng.chance(0.12 * pres.personality.temperament * (1 - state.mood))) {
    state.stage = 'failed';
    state.log.push({
      who: 'venditore',
      text: `"Sapete cosa? Ho cambiato idea: ${state.playerName} resta qui." Il presidente sbatte la porta.`,
    });
    return state;
  }
  // Concessione: la richiesta scende verso l'offerta con mood e giri.
  const pull = 0.35 + 0.25 * state.mood + (0.1 * state.round) / NEGOTIATION.MAX_ROUNDS;
  const newAsk = Math.max(
    state.floor,
    Math.round((state.ask - (state.ask - Math.max(offer, state.floor)) * pull) / 100_000) * 100_000,
  );
  if (newAsk <= offer * 1.02) {
    feeAgreed(world, state, buyer, seller, player, Math.max(offer, newAsk), year, rng);
    return state;
  }
  if (state.round >= NEGOTIATION.MAX_ROUNDS) {
    if (offer >= state.floor) {
      state.log.push({
        who: 'venditore',
        text: `Lungo silenzio, poi un sospiro: "E va bene. ${M(Math.max(offer, state.floor))}, a malincuore."`,
      });
      feeAgreed(world, state, buyer, seller, player, Math.max(offer, state.floor), year, rng);
    } else {
      state.stage = 'failed';
      state.log.push({
        who: 'venditore',
        text: `"Troppa distanza. Meglio fermarci qui." I giri di trattativa sono finiti.`,
      });
    }
    return state;
  }
  state.ask = newAsk;
  const warm = state.mood > 0.7;
  state.log.push({
    who: 'venditore',
    text: rng.pick(
      warm
        ? [
            `"Ci stiamo avvicinando: ${M(newAsk)} e chiudiamo stasera."`,
            `"Facciamo ${M(newAsk)} e non se ne parla più."`,
          ]
        : [
            `"Non basta. ${M(newAsk)}: prendere o lasciare."`,
            `"La nostra valutazione resta ${M(newAsk)}."`,
          ],
    ),
  });
  return state;
}

/** Un'offerta d'ingaggio all'entourage (§8.4). */
export function offerWage(
  world: World,
  state: NegotiationState,
  weekly: number,
  rng: Rng,
): NegotiationState {
  if (state.stage !== 'wage' || state.wageAsk === undefined || state.wageFloor === undefined)
    return state;
  const player = world.players.get(state.playerId);
  if (!player) {
    state.stage = 'failed';
    return state;
  }
  state.wageRound++;
  state.log.push({ who: 'tu', text: `Proponi ${K(weekly)} a settimana.` });

  const settle = (wage: number): void => {
    state.agreedWage = wage;
    state.commission = agencyCommissionFor(wage, player.agencyId !== undefined);
    state.stage = 'done';
    state.log.push({
      who: 'agente',
      text: `"Affare fatto: ${K(wage)} a settimana." ${
        state.commission > 0
          ? `L'agenzia incassa ${M(state.commission)} di commissione.`
          : 'Nessuna commissione: si rappresenta da solo.'
      }`,
    });
  };

  if (weekly >= state.wageAsk) {
    settle(Math.min(weekly, state.wageAsk));
    return state;
  }
  if (weekly < state.wageFloor * 0.8) {
    if (state.wageRound >= NEGOTIATION.WAGE_ROUNDS) {
      state.stage = 'failed';
      state.log.push({
        who: 'agente',
        text: `"Non siete seri. Il mio assistito merita di più: trattativa chiusa."`,
      });
    } else {
      state.log.push({
        who: 'agente',
        text: `"Così non ci siamo proprio. La richiesta resta ${K(state.wageAsk)}."`,
      });
    }
    return state;
  }
  const newAsk = Math.max(
    state.wageFloor,
    Math.round((state.wageAsk - (state.wageAsk - weekly) * 0.5) / 500) * 500,
  );
  if (newAsk <= weekly * 1.04) {
    settle(newAsk);
    return state;
  }
  if (state.wageRound >= NEGOTIATION.WAGE_ROUNDS) {
    if (weekly >= state.wageFloor) settle(Math.max(weekly, state.wageFloor));
    else {
      state.stage = 'failed';
      state.log.push({
        who: 'agente',
        text: `"Le strade si separano qui: troppa distanza sull'ingaggio."`,
      });
    }
    return state;
  }
  state.wageAsk = newAsk;
  state.log.push({
    who: 'agente',
    text: rng.pick([
      `"Scendiamo a ${K(newAsk)}, ma è l'ultima parola."`,
      `"Il ragazzo si convince con ${K(newAsk)} a settimana."`,
    ]),
  });
  return state;
}

// ------------------------------------------------------------------ chiusura e pre-accordi

export interface AgreedDeal {
  playerId: PlayerId;
  playerName: string;
  sellerClubId: ClubId;
  sellerName: string;
  fee: number;
  wage: number;
  commission: number;
}

/** Estrae i termini chiusi dallo stato (solo stage `done`). */
export function dealFromState(state: NegotiationState): AgreedDeal | null {
  if (state.stage !== 'done' || state.agreedFee === undefined || state.agreedWage === undefined)
    return null;
  return {
    playerId: state.playerId,
    playerName: state.playerName,
    sellerClubId: state.sellerClubId,
    sellerName: state.sellerName,
    fee: state.agreedFee,
    wage: state.agreedWage,
    commission: state.commission ?? 0,
  };
}

/**
 * Esegue l'affare chiuso (§8.5): vincoli veri ri-verificati, poi executeTransfer.
 * A finestra chiusa NON muove nulla: la sessione custodisce il pre-accordo.
 */
export function executeDeal(
  world: World,
  buyer: Club,
  deal: AgreedDeal,
  year: number,
): { ok: boolean; reason?: string } {
  const seller = world.clubs.get(deal.sellerClubId);
  const player = world.players.get(deal.playerId);
  if (!seller || !player || !seller.playerIds.includes(player.id))
    return { ok: false, reason: 'il giocatore non è più lì' };
  if (buyer.playerIds.length >= NEGOTIATION.SQUAD_CAP)
    return { ok: false, reason: `rosa piena (${NEGOTIATION.SQUAD_CAP})` };
  if (buyer.finances.cash < deal.fee + deal.commission)
    return { ok: false, reason: 'cassa insufficiente' };
  if (buyer.finances.transferBudget < deal.fee)
    return { ok: false, reason: 'budget mercato insufficiente' };
  executeTransfer(
    world,
    seller,
    buyer,
    player,
    deal.fee,
    deal.wage,
    offeredYears(player.age),
    deal.commission,
    year,
  );
  return { ok: true };
}

// ------------------------------------------------------------------ trasferte e DS

/** Prenota la trasferta di mercato (§8.6): costo vero a ledger. */
export function bookTrip(
  club: Club,
  cityName: string,
  year: number,
): { ok: boolean; reason?: string } {
  if (club.finances.cash < NEGOTIATION.TRIP_COST)
    return { ok: false, reason: 'cassa insufficiente' };
  club.finances.cash -= NEGOTIATION.TRIP_COST;
  club.finances.expenses.push({
    type: 'other',
    amount: NEGOTIATION.TRIP_COST,
    year,
    note: `Trasferta di mercato a ${cityName}`,
  });
  return { ok: true };
}

export interface DsTarget {
  playerId: PlayerId;
  name: string;
  position: string;
  age: number;
  overall: number;
  clubId: ClubId;
  clubName: string;
  ask: number;
  status: MarketStatus;
  why: string;
}

/** I consigli del DS (§8.6): dove la rosa soffre, chi è raggiungiabile. Deterministico. */
export function dsSuggestions(world: World, userClub: Club, year: number, count = 5): DsTarget[] {
  const needs = squadNeeds(world, userClub).slice(0, 2);
  const out: DsTarget[] = [];
  for (const need of needs) {
    const candidates: (DsTarget & { score: number })[] = [];
    for (const seller of world.clubs.values()) {
      if (seller.id === userClub.id) continue;
      const pres = presidentOf(world, seller.id);
      for (const pid of seller.playerIds) {
        const p = world.players.get(pid);
        if (!p || p.position !== need.position) continue;
        const status = playerMarketStatus(world, seller, p, year);
        if (status === 'incedibile') continue;
        const ask =
          Math.round(
            (askingPrice(world, seller, pres, p, year) * NEGOTIATION.STATUS_ASK[status]) / 100_000,
          ) * 100_000;
        if (ask > userClub.finances.transferBudget) continue;
        const overall = playerOverall(p);
        const score = overall - p.age * 0.4 + Math.max(0, p.potential - overall) * 0.15;
        candidates.push({
          playerId: p.id,
          name: p.name,
          position: p.position,
          age: p.age,
          overall: Math.round(overall),
          clubId: seller.id,
          clubName: seller.name,
          ask,
          status,
          why: `ci serve un ${roleLabel(need.position)}${status === 'vetrina' ? ', ed è in vetrina' : ''}`,
          score,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    for (const c of candidates.slice(0, Math.ceil(count / needs.length))) {
      const { score: _score, ...target } = c;
      out.push(target);
    }
  }
  return out.slice(0, count);
}

function roleLabel(position: string): string {
  return position === 'GK'
    ? 'portiere'
    : position === 'DF'
      ? 'difensore'
      : position === 'MF'
        ? 'centrocampista'
        : 'attaccante';
}
