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
import { spendingRoom } from '../finances/treasury.js';
import type { Rng } from '../rng/rng.js';
import { ROLE_TARGET, squadNeeds } from './ai.js';
import { RELATIONS, relationBetween } from './relations.js';
import { askingPrice, contractYearsLeft, executeTransfer, playerAcceptsMove } from './transfers.js';
import { agencyCommissionFor, baseMarketValue, expectedWage, offeredYears } from './value.js';

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
  // ---- v2: l'agente venditore (AI di gioco a utilità) ----
  /** Sotto floor×ZONE_EDGE sei FUORI ZONA: il venditore non concede nulla. */
  ZONE_EDGE: 0.9,
  /** Giorni di riflessione del presidente ("ci penso"): 1..THINK_MAX. */
  THINK_MAX: 3,
  /** Un rivale sul giocatore irrigidisce la richiesta a bid×RIVAL_TOP. */
  RIVAL_TOP: 1.05,
  // ---- v3: la STRUTTURA dell'affare (scambi, recompra, prestito-ritorno, rate) ----
  /** Al tavolo il tuo giocatore vale l'85% del valore base (le contropartite si svalutano). */
  SWAP_VALUE: 0.85,
  /** Offrire la recompra ammorbidisce il floor del venditore. */
  BUYBACK_EASE: 0.9,
  /** Clausola di recompra = valutazione ×1.5 (o fee×1.6 se la pretende lui). */
  BUYBACK_FEE: 1.5,
  BUYBACK_YEARS: 2,
  /** Lasciarglielo un anno in prestito addolcisce il minimo. */
  LOANBACK_EASE: 0.93,
  /** Premio sul prezzo per ogni rata oltre la prima. */
  INSTALLMENT_PREMIUM: 0.04,
  MAX_INSTALLMENTS: 3,
  /** Giri sull'ingaggio (agente v2 anche qui). */
  WAGE_PATIENCE: 3,
} as const;

/** Hash deterministico in [0,1): le decisioni dell'agente non toccano il flusso RNG. */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const R100 = (v: number) => Math.round(v / 100_000) * 100_000;

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
  stage: 'fee' | 'wage' | 'pending' | 'done' | 'failed';
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
  // ---- v2: l'agente venditore ----
  /** La SUA idea di prezzo, stabile per tutto il tavolo (non insegue le tue offerte). */
  valuation?: number;
  /** Giri totali che la sua pazienza concede (sostituisce MAX_ROUNDS fisso). */
  patience?: number;
  /** L'ultima parola è già stata data. */
  ultimatum?: boolean;
  lastOffer?: number;
  /** Stima del TUO DS della zona d'accordo (mostrata in UI). */
  dsLo?: number;
  dsHi?: number;
  /** "Ci penso": il presidente risponde tra thinkDays; il guscio fissa resumeDay. */
  thinkDays?: number;
  resumeDay?: number;
  thought?: boolean;
  /** Concorrente comparso durante la riflessione: batti il bid o lo perdi davvero. */
  rivalClubId?: ClubId;
  rivalName?: string;
  rivalBid?: number;
  // ---- v3: la struttura dell'affare ----
  /** Contropartita tecnica accettata dal venditore (vale swapValue dentro l'offerta). */
  swapPlayerId?: PlayerId;
  swapPlayerName?: string;
  swapValue?: number;
  /** Contropartite già rifiutate ("non ci serve"): niente spam. */
  swapRejected?: string[];
  /** Clausola di recompra a favore del venditore (fee futura). */
  buybackFee?: number;
  buybackAskedBySeller?: boolean;
  /** Il giocatore resta in prestito al venditore per la stagione in corso. */
  loanBack?: boolean;
  /** Rate annuali sul cartellino (1 = tutto subito). */
  installments?: number;
  /** Ultimatum unico anche sull'ingaggio. */
  wageUltimatum?: boolean;
  log: NegotiationEvent[];
}

const M = (v: number) => `${(v / 1e6).toFixed(1)}M`;
/** Ingaggi mostrati su base ANNUA (richiesta utente); il motore resta a settimana. */
const A = (weekly: number) => `${((weekly * 52) / 1e6).toFixed(1)}M l'anno`;

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
  opts: { inPerson: boolean; deadline: boolean; formFactor?: number },
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

  // G3: il RENDIMENTO muove il prezzo (media pagelle per tutti + contributo di ruolo).
  const form = opts.formFactor ?? 1;
  const ask =
    Math.round(
      (askingPrice(world, seller, pres, player, year) * NEGOTIATION.STATUS_ASK[status] * form) /
        100_000,
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
    // v2: l'agente ha una valutazione STABILE e una pazienza sua (3..6 giri).
    valuation: ask,
    patience: Math.max(
      3,
      Math.min(
        6,
        Math.round(
          3 + 2.5 * composure + (status === 'incedibile' ? 1 : 0) - (opts.deadline ? 1 : 0),
        ),
      ),
    ),
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
  // La stima del TUO DS (v2): conosce il mercato, non il floor esatto (rumore ±8%).
  const noise = 0.92 + 0.16 * hash01(`${player.id}|ds|${year}`);
  state.dsLo = R100(state.floor * noise);
  state.dsHi = Math.max(
    R100((state.floor + (ask - state.floor) * 0.6) * noise),
    (state.dsLo ?? 0) + 500_000,
  );
  if (form >= 1.12) {
    state.log.push({
      who: 'sistema',
      text: 'Il ragazzo è in stagione di grazia: la richiesta lo riflette.',
    });
  } else if (form <= 0.88) {
    state.log.push({
      who: 'sistema',
      text: 'Annata storta per lui: sul prezzo si può lavorare.',
    });
  }
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
  // v3: sui GIOVANI il venditore può pretendere la recompra come parte dell'accordo.
  if (
    state.buybackFee === undefined &&
    player.age <= 23 &&
    hash01(`${player.id}|bbask|${year}`) < 0.35
  ) {
    state.buybackFee = R100(fee * 1.6);
    state.buybackAskedBySeller = true;
    state.log.push({
      who: 'venditore',
      text: `"A una condizione, non negoziabile: RECOMPRA a ${M(state.buybackFee)} entro ${NEGOTIATION.BUYBACK_YEARS} anni. Ai talenti teniamo la porta aperta."`,
    });
  }
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
    text: `"Parliamo di ingaggio: il mio assistito chiede ${A(state.wageAsk)}."`,
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
  // v3: l'offerta EFFETTIVA include la contropartita tecnica accettata.
  const total = offer + (state.swapValue ?? 0);
  state.lastOffer = total;
  state.log.push({
    who: 'tu',
    text: `Offri ${M(offer)} per il cartellino${state.swapValue ? ` + ${state.swapPlayerName} (${M(state.swapValue)}): totale ${M(total)}` : ''}.`,
  });

  // Stretta di mano immediata (il venditore non chiede più di quanto chiedeva).
  if (total >= state.ask) {
    feeAgreed(world, state, buyer, seller, player, Math.min(total, state.ask), year, rng);
    return state;
  }

  // Offerta insultante: il mood crolla, la richiesta risale, il tavolo può saltare.
  if (total < state.ask * NEGOTIATION.INSULT) {
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
  state.mood = Math.min(1, state.mood + 0.06 + (total / state.ask - NEGOTIATION.INSULT) * 0.12);
  const pres = presidentOf(world, seller.id);
  const composure = pres?.personality.composure ?? 0.5;
  // …ma il fumantino può ribaltarlo (più probabile a tavolo freddo).
  if (pres && rng.chance(0.12 * pres.personality.temperament * (1 - state.mood))) {
    state.stage = 'failed';
    state.log.push({
      who: 'venditore',
      text: `"Sapete cosa? Ho cambiato idea: ${state.playerName} resta qui." Il presidente sbatte la porta.`,
    });
    loseToRival(world, state, year);
    return state;
  }

  const patience = state.patience ?? NEGOTIATION.MAX_ROUNDS;
  const valuation = state.valuation ?? state.ask;
  const inZone = total >= state.floor * NEGOTIATION.ZONE_EDGE;

  // FUORI ZONA: l'agente difende la sua valutazione — nessuna concessione.
  if (!inZone) {
    state.mood = Math.max(0, state.mood - 0.08);
    if (state.round >= patience) {
      state.stage = 'failed';
      state.log.push({
        who: 'venditore',
        text: `"Troppa distanza, e troppo tempo perso. Meglio fermarci qui."`,
      });
      loseToRival(world, state, year);
      return state;
    }
    state.log.push({
      who: 'venditore',
      text: rng.pick([
        `"La nostra valutazione è ${M(valuation)} e non cambia con offerte così. Restiamo a ${M(state.ask)}."`,
        `"Con queste cifre non ci muoviamo di un euro: ${M(state.ask)}."`,
      ]),
    });
    return state;
  }

  // Il rivale sul tavolo: sotto il suo bid il presidente te lo ricorda e basta.
  if (state.rivalBid !== undefined && total < state.rivalBid) {
    if (state.round >= patience) {
      state.stage = 'failed';
      state.log.push({
        who: 'venditore',
        text: `"Ho di meglio sul tavolo. ${state.playerName} va al ${state.rivalName}."`,
      });
      loseToRival(world, state, year);
      return state;
    }
    state.log.push({
      who: 'venditore',
      text: `"Il ${state.rivalName} è a ${M(state.rivalBid)}: sotto quella cifra non c'è discussione."`,
    });
    return state;
  }

  // "CI PENSO" (una volta per tavolo): offerta seria ma non decisiva → il presidente
  // si prende 1-3 giorni per valutarla e SENTIRE il mercato (possono spuntare rivali).
  if (
    !state.thought &&
    state.rivalBid === undefined &&
    total < state.ask * 0.93 &&
    hash01(`${state.playerId}|think|${state.round}|${offer}`) < 0.3 + 0.35 * composure
  ) {
    state.thought = true;
    state.thinkDays =
      1 + Math.floor(hash01(`${state.playerId}|days|${offer}`) * NEGOTIATION.THINK_MAX);
    state.stage = 'pending';
    state.log.push({
      who: 'venditore',
      text: rng.pick([
        `"Offerta seria, ne prendo atto. Ma voglio pensarci — e sentire cosa dice il mercato. Ci risentiamo tra ${state.thinkDays} giorn${state.thinkDays === 1 ? 'o' : 'i'}."`,
        `"Non dico no. Datemi ${state.thinkDays} giorn${state.thinkDays === 1 ? 'o' : 'i'}: un presidente valuta TUTTE le offerte."`,
      ]),
    });
    return state;
  }

  // IN ZONA: concessione dalla SUA curva — passi verso un punto d'incontro che
  // dipende dalla resistenza (compostezza) e dal mood, MAI dalla rincorsa all'offerta.
  const remaining = Math.max(1, patience - state.round);
  const resist = Math.max(
    0.15,
    Math.min(
      0.75,
      0.3 + 0.4 * composure - 0.2 * state.mood - (state.deadline ? NEGOTIATION.DEADLINE_SOFT : 0),
    ),
  );
  const target = Math.max(state.floor, R100(total + (state.ask - total) * resist));
  const step = Math.max(100_000, R100((state.ask - target) / remaining));
  const newAsk = Math.max(target, state.ask - step);
  if (newAsk <= total * 1.02) {
    feeAgreed(world, state, buyer, seller, player, Math.max(total, newAsk), year, rng);
    return state;
  }
  if (state.round >= patience) {
    // Pazienza finita: se sei nella sua zona di chiusura firma a malincuore,
    // altrimenti UNA sola ultima parola, poi il tavolo salta.
    if (total >= state.floor * 0.98) {
      state.log.push({
        who: 'venditore',
        text: `Lungo silenzio, poi un sospiro: "E va bene. ${M(Math.max(total, state.floor))}, a malincuore."`,
      });
      feeAgreed(world, state, buyer, seller, player, Math.max(total, state.floor), year, rng);
      return state;
    }
    if (!state.ultimatum) {
      state.ultimatum = true;
      state.ask = Math.max(state.floor, target);
      state.log.push({
        who: 'venditore',
        text: `"Ultima parola: ${M(state.ask)}. Prendere o lasciare."`,
      });
      return state;
    }
    state.stage = 'failed';
    state.log.push({
      who: 'venditore',
      text: `"Vi avevo dato l'ultima parola. Il tavolo è chiuso."`,
    });
    loseToRival(world, state, year);
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
            `"Scendo a ${M(newAsk)}, ma la mia valutazione resta ${M(valuation)}."`,
            `"${M(newAsk)}: è già un passo verso di voi, non aspettatevi regali."`,
          ],
    ),
  });
  return state;
}

/**
 * La RISPOSTA dopo la riflessione (v2): il presidente torna al tavolo — convinto,
 * con un piccolo passo, o con un'offerta CONCORRENTE vera sul tavolo (hash
 * deterministico, zero draw RNG di simulazione). Chiamare quando `resumeDay` è maturo.
 */
export function resolveThink(
  world: World,
  state: NegotiationState,
  buyer: Club,
  year: number,
  rng: Rng,
): NegotiationState {
  if (state.stage !== 'pending') return state;
  const seller = world.clubs.get(state.sellerClubId);
  const player = world.players.get(state.playerId);
  state.stage = 'fee';
  state.thinkDays = undefined;
  state.resumeDay = undefined;
  if (!seller || !player) {
    state.stage = 'failed';
    state.log.push({ who: 'sistema', text: 'La controparte non è più al tavolo.' });
    return state;
  }
  const overall = playerOverall(player);
  const key = `${state.playerId}|rival|${year}|${state.round}`;
  const pRival = Math.min(
    0.75,
    0.2 +
      (state.status === 'vetrina' ? 0.2 : 0) +
      Math.max(0, overall - 60) / 100 +
      (state.deadline ? 0.15 : 0),
  );
  if (state.rivalBid === undefined && hash01(key) < pRival) {
    // Un CONCORRENTE vero: club con bisogno nel ruolo e budget, il più credibile.
    const rivals = [...world.clubs.values()]
      .filter(
        (c) =>
          c.id !== buyer.id &&
          c.id !== state.sellerClubId &&
          c.finances.transferBudget >= state.floor &&
          c.playerIds.length < NEGOTIATION.SQUAD_CAP &&
          squadNeeds(world, c).some((n) => n.position === player.position),
      )
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 5);
    const rival = rivals[Math.floor(hash01(`${key}|pick`) * rivals.length)];
    if (rival) {
      const bid = R100(state.floor * (1 + 0.15 * hash01(`${key}|bid`)));
      state.rivalClubId = rival.id;
      state.rivalName = rival.name;
      state.rivalBid = bid;
      state.ask = Math.max(state.ask, R100(bid * NEGOTIATION.RIVAL_TOP));
      state.floor = Math.max(state.floor, bid);
      state.patience = (state.patience ?? NEGOTIATION.MAX_ROUNDS) + 1;
      state.log.push({
        who: 'venditore',
        text: `"Come temevate: il ${rival.name} ha messo sul tavolo ${M(bid)}. Se la vostra non sale, ${state.playerName} va lì. La richiesta ora è ${M(state.ask)}."`,
      });
      return state;
    }
  }
  const last = state.lastOffer ?? 0;
  if (last >= state.floor) {
    state.log.push({
      who: 'venditore',
      text: `"Ci ho pensato: nessuno ha offerto di più. ${M(Math.max(last, state.floor))} e ${state.playerName} è vostro."`,
    });
    feeAgreed(world, state, buyer, seller, player, Math.max(last, state.floor), year, rng);
    return state;
  }
  state.ask = Math.max(state.floor, R100(state.ask * 0.97));
  state.log.push({
    who: 'venditore',
    text: `"Ci ho pensato. Scendo a ${M(state.ask)}: ora tocca a voi fare sul serio."`,
  });
  return state;
}

/**
 * Il rivale CHIUDE davvero (v2): quando il tavolo salta con un concorrente sul
 * giocatore, il trasferimento si esegue (stessa filiera del mercato AI). Ritorna
 * il titolo di gazzetta, o null se non c'era nessun rivale.
 */
export function loseToRival(world: World, state: NegotiationState, year: number): string | null {
  if (state.rivalBid === undefined || state.rivalClubId === undefined) return null;
  const seller = world.clubs.get(state.sellerClubId);
  const rival = world.clubs.get(state.rivalClubId);
  const player = world.players.get(state.playerId);
  if (!seller || !rival || !player || !rival.playerIds.length) return null;
  if (rival.playerIds.length >= NEGOTIATION.SQUAD_CAP) return null;
  const wage = Math.round(expectedWage(playerOverall(player), player.age) / 500) * 500;
  executeTransfer(
    world,
    seller,
    rival,
    player,
    state.rivalBid,
    wage,
    offeredYears(player.age),
    agencyCommissionFor(wage, player.agencyId !== undefined),
    year,
  );
  const headline = `BEFFA SUL MERCATO: ${player.name} va al ${rival.name} per ${M(state.rivalBid)} — l'avevate lasciato sul tavolo.`;
  state.log.push({ who: 'sistema', text: headline });
  state.rivalBid = undefined;
  return headline;
}

// ------------------------------------------- v3: la STRUTTURA dell'affare (§8-ter)

/**
 * Proponi una CONTROPARTITA TECNICA: se al venditore il tuo giocatore interessa
 * (bisogno nel ruolo o qualità sopra la sua media, età sensata) lo valuta
 * `SWAP_VALUE × valore base` DENTRO l'offerta; altrimenti lo rifiuta (una volta sola).
 * `playerId null` toglie lo scambio dal tavolo.
 */
export function proposeSwap(
  world: World,
  state: NegotiationState,
  buyer: Club,
  playerId: PlayerId | null,
  year: number,
  /** G3: forma della contropartita (default 1). */
  formFactor = 1,
): NegotiationState {
  if (state.stage !== 'fee') return state;
  if (playerId === null) {
    if (state.swapPlayerId !== undefined) {
      state.log.push({ who: 'tu', text: `Ritiri ${state.swapPlayerName} dal tavolo.` });
      state.swapPlayerId = undefined;
      state.swapPlayerName = undefined;
      state.swapValue = undefined;
    }
    return state;
  }
  const seller = world.clubs.get(state.sellerClubId);
  const mine = world.players.get(playerId);
  if (!seller || !mine || !buyer.playerIds.includes(playerId)) return state;
  if ((state.swapRejected ?? []).includes(playerId as string)) return state;
  if (seller.playerIds.length >= NEGOTIATION.SQUAD_CAP) {
    state.log.push({ who: 'venditore', text: `"Abbiamo la rosa piena: solo contanti."` });
    return state;
  }
  const squadAvg =
    seller.playerIds
      .map((id) => world.players.get(id))
      .filter((p): p is Player => p !== undefined)
      .reduce((s, p) => s + playerOverall(p), 0) / Math.max(1, seller.playerIds.length);
  const wanted =
    mine.age <= 31 &&
    (squadNeeds(world, seller).some((n) => n.position === mine.position) ||
      playerOverall(mine) >= squadAvg);
  if (!wanted) {
    state.swapRejected = [...(state.swapRejected ?? []), playerId as string];
    state.log.push({
      who: 'venditore',
      text: `"${mine.name}? No, grazie: non è quello che ci serve. Parliamo di cifre."`,
    });
    return state;
  }
  const value = R100(
    formFactor *
      baseMarketValue(
        playerOverall(mine),
        mine.age,
        mine.potential,
        contractYearsLeft(world, mine, year),
      ) *
      NEGOTIATION.SWAP_VALUE,
  );
  state.swapPlayerId = playerId;
  state.swapPlayerName = mine.name;
  state.swapValue = value;
  state.log.push({
    who: 'venditore',
    text: `"${mine.name} ci interessa, non lo nego. Ve lo valutiamo ${M(value)} dentro l'affare — il resto in contanti."`,
  });
  return state;
}

/** Offri TU la clausola di RECOMPRA: al venditore piace, il minimo si ammorbidisce. */
export function offerBuyback(state: NegotiationState): NegotiationState {
  if (state.stage !== 'fee' || state.buybackFee !== undefined) return state;
  const fee = R100((state.valuation ?? state.ask) * NEGOTIATION.BUYBACK_FEE);
  state.buybackFee = fee;
  state.floor = R100(state.floor * NEGOTIATION.BUYBACK_EASE);
  state.ask = Math.max(state.floor, R100(state.ask * 0.95));
  state.log.push({ who: 'tu', text: `Metti sul tavolo una recompra a loro favore.` });
  state.log.push({
    who: 'venditore',
    text: `"Una recompra a ${M(fee)} entro ${NEGOTIATION.BUYBACK_YEARS} anni? Questo cambia il discorso: scendiamo a ${M(state.ask)}."`,
  });
  return state;
}

/** Proponi il PRESTITO-RITORNO: lo paghi ora ma resta lì un anno — il minimo cede. */
export function offerLoanBack(state: NegotiationState): NegotiationState {
  if (state.stage !== 'fee' || state.loanBack === true) return state;
  state.loanBack = true;
  state.floor = R100(state.floor * NEGOTIATION.LOANBACK_EASE);
  state.ask = Math.max(state.floor, R100(state.ask * 0.97));
  state.log.push({ who: 'tu', text: `Proponi di lasciarglielo in prestito per la stagione.` });
  state.log.push({
    who: 'venditore',
    text: `"Ce lo lasciate un anno? Così non smontiamo la squadra a metà corsa. Va bene: ${M(state.ask)}."`,
  });
  return state;
}

/** Chiedi il pagamento a RATE (1-3 annuali): chi ha cassa accetta con un premio, chi è in sofferenza vuole contanti. */
export function setInstallments(
  world: World,
  state: NegotiationState,
  n: number,
): NegotiationState {
  if (state.stage !== 'fee') return state;
  const rate = Math.max(1, Math.min(NEGOTIATION.MAX_INSTALLMENTS, Math.round(n)));
  const cur = state.installments ?? 1;
  if (rate === cur) return state;
  const seller = world.clubs.get(state.sellerClubId);
  if (!seller) return state;
  if (rate > 1 && seller.finances.cash < clubWageBill(world, seller) * 26) {
    state.log.push({
      who: 'venditore',
      text: `"Rate? Qui servono CONTANTI, e subito. Tutto alla firma o niente."`,
    });
    return state;
  }
  // Premio proporzionale alle rate extra, applicato in modo relativo (niente stack).
  const factor =
    (1 + NEGOTIATION.INSTALLMENT_PREMIUM * (rate - 1)) /
    (1 + NEGOTIATION.INSTALLMENT_PREMIUM * (cur - 1));
  state.ask = R100(state.ask * factor);
  state.floor = R100(state.floor * factor);
  state.installments = rate;
  state.log.push({
    who: 'venditore',
    text:
      rate === 1
        ? `"Tutto alla firma? Perfetto: si torna a ${M(state.ask)}."`
        : `"${rate} rate annuali si può fare, ma il prezzo sale un filo: ${M(state.ask)}."`,
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
  state.log.push({ who: 'tu', text: `Proponi ${A(weekly)}.` });

  const settle = (wage: number): void => {
    state.agreedWage = wage;
    state.commission = agencyCommissionFor(wage, player.agencyId !== undefined);
    state.stage = 'done';
    state.log.push({
      who: 'agente',
      text: `"Affare fatto: ${A(wage)}." ${
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
  // Agente v2 anche qui: FUORI ZONA l'entourage non si muove di un euro.
  const wPatience = NEGOTIATION.WAGE_PATIENCE;
  if (weekly < state.wageFloor * 0.85) {
    if (state.wageRound >= wPatience) {
      state.stage = 'failed';
      state.log.push({
        who: 'agente',
        text: `"Non siete seri. Il mio assistito merita di più: trattativa chiusa."`,
      });
    } else {
      state.log.push({
        who: 'agente',
        text: `"Così non ci siamo proprio. La richiesta resta ${A(state.wageAsk)}, e non è tattica."`,
      });
    }
    return state;
  }
  // IN ZONA: concessione dalla SUA curva, a passi decrescenti verso il punto d'incontro.
  const wRemaining = Math.max(1, wPatience - state.wageRound);
  const wTarget = Math.max(
    state.wageFloor,
    Math.round((weekly + (state.wageAsk - weekly) * 0.45) / 500) * 500,
  );
  const wStep = Math.max(500, Math.round((state.wageAsk - wTarget) / wRemaining / 500) * 500);
  const newAsk = Math.max(wTarget, state.wageAsk - wStep);
  if (newAsk <= weekly * 1.04) {
    settle(newAsk);
    return state;
  }
  if (state.wageRound >= wPatience) {
    if (weekly >= state.wageFloor) {
      settle(Math.max(weekly, state.wageFloor));
      return state;
    }
    if (!state.wageUltimatum) {
      state.wageUltimatum = true;
      state.wageAsk = Math.max(state.wageFloor, wTarget);
      state.log.push({
        who: 'agente',
        text: `"Ultima parola del mio assistito: ${A(state.wageAsk)}. Poi salutiamo."`,
      });
      return state;
    }
    state.stage = 'failed';
    state.log.push({
      who: 'agente',
      text: `"Le strade si separano qui: troppa distanza sull'ingaggio."`,
    });
    return state;
  }
  state.wageAsk = newAsk;
  state.log.push({
    who: 'agente',
    text: rng.pick([
      `"Scendiamo a ${A(newAsk)}, ma è l'ultima parola."`,
      `"Il ragazzo si convince con ${A(newAsk)}."`,
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
  /** Valore TOTALE del pacchetto (contanti + eventuale contropartita). */
  fee: number;
  wage: number;
  commission: number;
  // v3: struttura dell'affare (tutti opzionali → pre-accordi vecchi validi).
  swapPlayerId?: PlayerId;
  swapPlayerName?: string;
  swapValue?: number;
  buybackFee?: number;
  loanBack?: boolean;
  installments?: number;
  /** Prestito-ritorno: il guscio esegue l'affare solo da quest'anno in poi. */
  arrivalYear?: number;
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
    swapPlayerId: state.swapPlayerId,
    swapPlayerName: state.swapPlayerName,
    swapValue: state.swapValue,
    buybackFee: state.buybackFee,
    loanBack: state.loanBack,
    installments: state.installments,
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
): { ok: boolean; reason?: string; schedule?: { year: number; amount: number }[] } {
  const seller = world.clubs.get(deal.sellerClubId);
  const player = world.players.get(deal.playerId);
  if (!seller || !player || !seller.playerIds.includes(player.id))
    return { ok: false, reason: 'il giocatore non è più lì' };
  if (buyer.playerIds.length >= NEGOTIATION.SQUAD_CAP)
    return { ok: false, reason: `rosa piena (${NEGOTIATION.SQUAD_CAP})` };
  // v3: la contropartita esce dalla rosa e vale il suo prezzo dentro il pacchetto.
  const swap = deal.swapPlayerId !== undefined ? world.players.get(deal.swapPlayerId) : undefined;
  if (deal.swapPlayerId !== undefined && (!swap || !buyer.playerIds.includes(deal.swapPlayerId)))
    return { ok: false, reason: 'la contropartita non è più in rosa' };
  if (swap && seller.playerIds.length >= NEGOTIATION.SQUAD_CAP)
    return { ok: false, reason: 'il venditore ha la rosa piena per la contropartita' };
  const swapValue = swap ? (deal.swapValue ?? 0) : 0;
  const cashDue = Math.max(0, deal.fee - swapValue);
  const rate = Math.max(1, Math.min(NEGOTIATION.MAX_INSTALLMENTS, deal.installments ?? 1));
  const perYear = Math.round(cashDue / rate / 100_000) * 100_000;
  const firstShare = cashDue - perYear * (rate - 1);
  // Fido bancario (MODULE_FINANCES §5.4): serve coprire la PRIMA rata, non tutto.
  if (spendingRoom(world, buyer, year) + swapValue < firstShare + deal.commission)
    return { ok: false, reason: 'oltre il fido: la banca dice no' };
  if (buyer.finances.transferBudget + swapValue < firstShare)
    return { ok: false, reason: 'disponibilità insufficiente' };
  // 1) La contropartita passa al venditore al valore pattuito (ledger e plusvalenze veri).
  if (swap) {
    const swapWage = Math.round(expectedWage(playerOverall(swap), swap.age) / 500) * 500;
    executeTransfer(
      world,
      buyer,
      seller,
      swap,
      swapValue,
      swapWage,
      offeredYears(swap.age),
      0,
      year,
    );
  }
  // 2) Il trasferimento principale al valore PIENO del pacchetto (bilanci corretti).
  const contract = executeTransfer(
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
  // 3) Recompra: la clausola vive sul contratto nuovo (il venditore può riprenderselo).
  if (deal.buybackFee !== undefined) {
    contract.buyback = {
      clubId: seller.id,
      fee: deal.buybackFee,
      untilYear: year + NEGOTIATION.BUYBACK_YEARS,
    };
  }
  // 4) Rate: il venditore incassa tutto SUBITO (lo sconta la sua banca); tu paghi la
  //    prima quota ora e il resto negli anni — la cassa rientra della parte differita.
  const deferred = cashDue - firstShare;
  if (deferred > 0) {
    buyer.finances.cash += deferred;
    const schedule = Array.from({ length: rate - 1 }, (_, k) => ({
      year: year + k + 1,
      amount: perYear,
    }));
    return { ok: true, schedule };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ trasferte e DS

/** Prenota la trasferta di mercato (§8.6): costo vero a ledger. */
export function bookTrip(
  club: Club,
  cityName: string,
  year: number,
  world?: World,
): { ok: boolean; reason?: string } {
  const room = world ? spendingRoom(world, club, year) : club.finances.cash;
  if (room < NEGOTIATION.TRIP_COST) return { ok: false, reason: 'oltre il fido' };
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

/**
 * Rapporto del DS su una NAZIONE (Ufficio Commerciale, "promemoria al DS"):
 * i profili di quella nazionalità più interessanti E raggiungibili col budget,
 * senza vincolo di ruolo. Deterministico, zero RNG.
 */
export function dsNationReport(
  world: World,
  userClub: Club,
  nation: string,
  year: number,
  count = 3,
): DsTarget[] {
  const candidates: (DsTarget & { score: number })[] = [];
  for (const seller of world.clubs.values()) {
    if (seller.id === userClub.id) continue;
    const pres = presidentOf(world, seller.id);
    for (const pid of seller.playerIds) {
      const p = world.players.get(pid);
      if (!p || p.nationality !== nation) continue;
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
        why: `${roleLabel(p.position)} ${nation} alla tua portata${status === 'vetrina' ? ', ed è in vetrina' : ''}`,
        score,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return candidates.slice(0, count).map(({ score: _score, ...t }) => t);
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
