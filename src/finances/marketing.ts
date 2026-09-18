/**
 * UFFICIO MARKETING (MODULE_STADIUM §3.4, richiesta utente): listino biglietti per
 * classe di gara, campagna abbonamenti con memoria dei rinnovi, prezzi per settore,
 * campagne marketing potenziate dalla posizione dell'ufficio nel tifo cittadino.
 * Puro e deterministico, zero RNG. SOLO club utente: un club senza `marketing`
 * (tutta l'AI, i save vecchi) passa dalle formule di sempre — byte-identico.
 */

import { stadiumCapacity, ticketFactors } from '../core/stadium.js';
import type {
  CampaignId,
  Club,
  ClubMarketing,
  MatchClass,
  PriceLevel,
  Stadium,
  TicketPlan,
  World,
} from '../core/types.js';
import { FINANCES } from './season-economy.js';

export const MKT = {
  /** Abbonamento = 19 gare in casa × prezzo di fascia × sconto fedeltà. */
  ABB_DISCOUNT: 0.72,
  /** Quota del pubblico-tipo disposta ad abbonarsi. */
  ABB_PROPENSITY: 0.62,
  /** Tetto assoluto: restano SEMPRE biglietti singoli in vendita. */
  ABB_MAX_SHARE: 0.85,
  /** Tetto di default se l'utente non lo tocca. */
  ABB_DEFAULT_SHARE: 0.6,
  /** Sull'abbonarsi il prezzo pesa più che sul singolo biglietto. */
  ABB_PRICE_FILL: 1.6,
  /** Memoria dei rinnovi (idea a): ±8% attorno alla metà classifica... */
  RENEW_SWING: 0.16,
  /** ...e aumento di prezzo dopo una stagione sotto la metà = crollo. */
  RENEW_HIKE_PENALTY: 0.1,
  /** Partita di cartello: avversaria da questa reputazione in su, o derby cittadino. */
  CARTELLO_REP: 72,
  CARTELLO_GATE: 1.25,
  CARTELLO_FILL: 0.06,
  /** Coppa: pubblico più magro (gli abbonamenti NON coprono le coppe). */
  COPPA_FILL: -0.1,
  /** Striscia di sold-out (idea b): da qui in poi l'hype riempie di più. */
  HYPE_STREAK: 3,
  HYPE_FILL: 0.04,
  SOLD_OUT_AT: 0.98,
  /** Il layer per-settore (idea c) pesa metà della fascia di gara sul riempimento. */
  SECTOR_FILL_WEIGHT: 0.5,
  /** Potere delle campagne NAZIONALI dal blasone: quanto il tuo nome parla al pubblico. */
  NAT_POWER_MIN: 0.7,
  NAT_POWER_MAX: 1.3,
  /** Campagna INTERNAZIONALE (una a stagione): mercato-nazione a scelta. */
  ABROAD_COST: 1_000_000,
  /** Con giocatori del posto la crescita tifosi dell'anno si moltiplica... */
  ABROAD_MULT: 1.6,
  /** ...senza, la campagna SEMINA il mercato (come un tour, scala con la fama). */
  ABROAD_SEED: 8_000,
} as const;

export interface CampaignSpec {
  id: CampaignId;
  label: string;
  cost: number;
  desc: string;
  minReputation?: number;
  minCoveredSectors?: number;
}

export const CAMPAIGNS: readonly CampaignSpec[] = [
  {
    id: 'portaAmico',
    label: 'Porta un amico',
    cost: 400_000,
    desc: 'Promo sui biglietti singoli: più paganti a ogni gara in casa.',
  },
  {
    id: 'curvaPopolare',
    label: 'Curva popolare',
    cost: 500_000,
    desc: 'La campagna abbonamenti parla al popolo: più sottoscrizioni in agosto.',
  },
  {
    id: 'hospitality',
    label: 'Hospitality premium',
    cost: 1_200_000,
    desc: 'Palchi e ospitalità nelle partite di cartello: incasso maggiorato.',
    minReputation: 60,
    minCoveredSectors: 2,
  },
  {
    id: 'spintaCommerciale',
    label: 'Spinta commerciale',
    cost: 800_000,
    desc: 'Il brand tira: negozio, museo e attività dello stadio rendono di più.',
  },
] as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const PRICE_RANK: Record<PriceLevel, number> = { popolare: 0, standard: 1, premium: 2 };

/** L'ufficio è operativo solo se COSTRUITO (il cantiere non basta). */
export function marketingOffice(club: Club): { dx: number; dy: number } | undefined {
  return (club.structures ?? []).find((x) => x.id === 'ufficioMarketing');
}

/**
 * Potere delle campagne NAZIONALI [0.7..1.3]: conta il MERCATO in cui parli, non
 * dove sta l'ufficio (richiesta utente: la sede si piazza dove si vuole) — in casa
 * il mercato è il tuo popolo, e un blasone più grande lo muove di più.
 */
export function officePower(club: Club): number {
  if (!marketingOffice(club)) return 0;
  return clamp(
    MKT.NAT_POWER_MIN + (MKT.NAT_POWER_MAX - MKT.NAT_POWER_MIN) * ((club.reputation - 40) / 55),
    MKT.NAT_POWER_MIN,
    MKT.NAT_POWER_MAX,
  );
}

/** La nazione della campagna INTERNAZIONALE attiva (solo con l'ufficio operativo). */
export function abroadCampaignNation(club: Club): string | undefined {
  return marketingOffice(club) ? club.marketing?.abroadNation : undefined;
}

function activeCampaign(club: Club): CampaignId | undefined {
  return marketingOffice(club) ? club.marketing?.plan.campaign : undefined;
}

/** Prezzo € dell'abbonamento stagionale per fascia. */
export function seasonTicketPrice(level: PriceLevel): number {
  return Math.round(
    FINANCES.TICKET_PRICE * FINANCES.HOME_GAMES * MKT.ABB_DISCOUNT * ticketFactors(level).gate,
  );
}

/** Fattori pesati sui posti dei prezzi PER SETTORE (idea c): layer sopra la classe. */
export function sectorFactors(
  stadium: Stadium,
  sectorPrices: TicketPlan['sectorPrices'],
): { gate: number; fillDelta: number } {
  let seats = 0;
  let gate = 0;
  let fill = 0;
  for (const [id, sec] of Object.entries(stadium.sectors)) {
    if (sec.seats <= 0) continue;
    const level = sectorPrices?.[id as keyof typeof stadium.sectors] ?? 'standard';
    const f = ticketFactors(level);
    seats += sec.seats;
    gate += sec.seats * f.gate;
    fill += sec.seats * f.fillDelta * MKT.SECTOR_FILL_WEIGHT;
  }
  if (seats === 0) return { gate: 1, fillDelta: 0 };
  return { gate: gate / seats, fillDelta: fill / seats };
}

/** Derby cittadino: i nomi sono "Città Colori" → stessa prima parola = stessa città. */
export function isDerby(a: Pick<Club, 'name'>, b: Pick<Club, 'name'>): boolean {
  const cityOf = (name: string) => name.split(' ')[0] ?? name;
  return cityOf(a.name) === cityOf(b.name);
}

/** La classe di una gara di campionato in casa (la coppa è sempre 'coppa'). */
export function matchClassOf(club: Club, opponent: Club): MatchClass {
  return isDerby(club, opponent) || opponent.reputation >= MKT.CARTELLO_REP
    ? 'cartello'
    : 'campionato';
}

/**
 * La DOMANDA di abbonamenti alla campagna d'agosto: reputazione, soddisfazione
 * dell'anno scorso (idea a: rinnovi con memoria), prezzo, campagna attiva, tetto.
 */
export function subscriberDemand(
  club: Club,
  m: ClubMarketing,
): { abbonati: number; share: number; capSeats: number } {
  const cap = stadiumCapacity(club);
  const level = m.plan.abbPrice ?? 'standard';
  const baseShare = clamp(
    FINANCES.FILL_BASE +
      FINANCES.FILL_REP * ((club.reputation - 40) / 55) +
      FINANCES.FILL_POS_BONUS * 0.5,
    FINANCES.FILL_MIN,
    1,
  );
  const sat = m.lastSatisfaction ?? 0.5;
  const hike =
    m.lastAbbPrice !== undefined && PRICE_RANK[level] > PRICE_RANK[m.lastAbbPrice] && sat < 0.5
      ? -MKT.RENEW_HIKE_PENALTY
      : 0;
  const campaign = activeCampaign(club) === 'curvaPopolare' ? 0.1 * officePower(club) : 0;
  const share = clamp(
    baseShare * MKT.ABB_PROPENSITY +
      (sat - 0.5) * MKT.RENEW_SWING +
      ticketFactors(level).fillDelta * MKT.ABB_PRICE_FILL +
      hike +
      campaign,
    0.02,
    MKT.ABB_MAX_SHARE,
  );
  const capShare = clamp(m.plan.abbCapShare ?? MKT.ABB_DEFAULT_SHARE, 0, MKT.ABB_MAX_SHARE);
  const capSeats = Math.round(cap * capShare);
  return { abbonati: Math.min(Math.round(cap * share), capSeats), share, capSeats };
}

export interface MatchGate {
  /** Incasso € dei soli PAGANTI singoli (gli abbonati sono già stati incassati). */
  gate: number;
  attendance: number;
  capacity: number;
  fill: number;
  soldOut: boolean;
}

/**
 * Il botteghino di UNA gara in casa col piano marketing: gli abbonati entrano
 * "gratis" (coppa esclusa: l'abbonamento non la copre), i posti liberi si vendono
 * alla fascia della classe × il layer per settore, con hype da sold-out e campagne.
 */
export function marketingMatchGate(club: Club, cls: MatchClass, posFrac: number): MatchGate {
  const m = club.marketing;
  const cap = stadiumCapacity(club);
  const level = m?.plan.prices?.[cls] ?? 'standard';
  const classF = ticketFactors(level);
  const sectorF = sectorFactors(club.stadium, m?.plan.sectorPrices);
  const abbonati = cls === 'coppa' ? 0 : Math.min(m?.abbonati ?? 0, cap);
  const freeSeats = cap - abbonati;

  const campaign = activeCampaign(club);
  const power = officePower(club);
  const hype = (m?.soldOutStreak ?? 0) >= MKT.HYPE_STREAK ? MKT.HYPE_FILL : 0;
  const fill = clamp(
    FINANCES.FILL_BASE +
      FINANCES.FILL_REP * ((club.reputation - 40) / 55) +
      FINANCES.FILL_POS_BONUS * posFrac +
      classF.fillDelta +
      sectorF.fillDelta +
      (cls === 'cartello' ? MKT.CARTELLO_FILL : 0) +
      (cls === 'coppa' ? MKT.COPPA_FILL : 0) +
      (campaign === 'portaAmico' ? 0.06 * power : 0) +
      hype,
    cls === 'coppa' ? 0.1 : FINANCES.FILL_MIN,
    1,
  );
  const paying = Math.round(freeSeats * fill);
  const perTicket =
    FINANCES.TICKET_PRICE *
    classF.gate *
    sectorF.gate *
    (cls === 'cartello' ? MKT.CARTELLO_GATE : 1) *
    (cls === 'cartello' && campaign === 'hospitality' ? 1 + 0.18 * power : 1);
  const attendance = abbonati + paying;
  return {
    gate: Math.round(paying * perTicket),
    attendance,
    capacity: cap,
    fill,
    soldOut: attendance >= cap * MKT.SOLD_OUT_AT,
  };
}

/** Aggiorna la striscia di sold-out dopo una gara in casa (idea b). */
export function applyMatchOutcome(club: Club, soldOut: boolean): void {
  const m = club.marketing;
  if (!m) return;
  m.soldOutStreak = soldOut ? (m.soldOutStreak ?? 0) + 1 : 0;
}

/** Moltiplicatore sui ricavi commerciali (campagna 'spintaCommerciale'). */
export function commercialBoost(club: Club): number {
  return activeCampaign(club) === 'spintaCommerciale' ? 1 + 0.12 * officePower(club) : 1;
}

/**
 * Stima del botteghino STAGIONALE col piano marketing (per proiezioni/sostenibilità):
 * abbonamenti (chiusi, o attesi) + 19 gare con ~1/5 di cartelli.
 */
export function marketingSeasonGate(club: Club, posFrac: number): number {
  const m = club.marketing;
  if (!m) return 0;
  const level = m.abbPricePaid ?? m.plan.abbPrice ?? 'standard';
  const abbonati = m.abbonati ?? subscriberDemand(club, m).abbonati;
  const abbIncome = abbonati * seasonTicketPrice(level);
  const perGame =
    0.8 * marketingMatchGate(club, 'campionato', posFrac).gate +
    0.2 * marketingMatchGate(club, 'cartello', posFrac).gate;
  return Math.round(abbIncome + FINANCES.HOME_GAMES * perGame);
}

/**
 * Chiude la campagna abbonamenti d'AGOSTO (chiamata alla nuova stagione): incassa
 * tutto subito (voce 'abbonamenti'), aggiorna la memoria dei rinnovi, azzera hype
 * e campagna (si ricompra ogni anno). Ritorna i numeri per il racconto.
 */
export function resolveSeasonTickets(
  club: Club,
  satisfaction: number,
  year: number,
): { abbonati: number; income: number; price: number; level: PriceLevel } | null {
  const m = club.marketing;
  if (!m || !marketingOffice(club)) return null;
  const level = m.plan.abbPrice ?? 'standard';
  const { abbonati } = subscriberDemand(club, m);
  const price = seasonTicketPrice(level);
  const income = abbonati * price;
  if (income > 0) {
    club.finances.incomes.push({
      type: 'abbonamenti',
      amount: income,
      year,
      note: `campagna: ${abbonati} abbonati`,
    });
    club.finances.cash += income;
  }
  m.abbonati = abbonati;
  m.abbPricePaid = level;
  m.lastAbbPrice = level;
  m.lastSatisfaction = satisfaction;
  m.soldOutStreak = 0;
  // Le campagne (nazionale E internazionale) valgono una stagione: si ricomprano.
  m.plan = { ...m.plan, campaign: undefined };
  m.abroadNation = undefined;
  return { abbonati, income, price, level };
}
