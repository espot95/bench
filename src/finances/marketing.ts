/**
 * UFFICIO MARKETING (MODULE_STADIUM §3.4, richiesta utente): l'ufficio ESISTE GIÀ
 * (edificio della città, niente cantiere) — la biglietteria è inclusa, i servizi
 * avanzati (abbonamenti, campagne nazionali, marketing estero) si COMPRANO una
 * tantum. Listino per classe di gara, abbonamenti con memoria dei rinnovi, prezzi
 * per settore, campagne su mercati nazionali ed esteri.
 * Puro e deterministico, zero RNG. SOLO club utente: un club senza `marketing`
 * (tutta l'AI, i save vecchi) passa dalle formule di sempre — byte-identico.
 */

import { playerOverall } from '../core/ratings.js';
import { stadiumCapacity, ticketFactors } from '../core/stadium.js';
import type {
  CampaignId,
  Club,
  ClubMarketing,
  MarketingFeature,
  MatchClass,
  PriceLevel,
  Season,
  Stadium,
  TicketPlan,
  World,
} from '../core/types.js';
import { leagueOfClub, nationById } from '../core/types.js';
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
  /**
   * Prezzo base di DEFAULT [prima, seconda divisione] per nazione (€, richiesta
   * utente): la Premier costa più della Serie A, la Championship più della B.
   * L'utente può scostarsene liberamente — ma il pubblico reagisce (elasticità).
   */
  BASE_PRICE: { ITA: [35, 18], ENG: [48, 26], DEFAULT: [32, 16] } as Record<
    string,
    [number, number]
  >,
  PRICE_MIN: 5,
  PRICE_MAX: 150,
  /** +50% sul default di lega ≈ −22% di riempimento (e viceversa, con un tetto). */
  PRICE_ELASTICITY: 0.45,
  PRICE_FILL_MIN: -0.35,
  PRICE_FILL_MAX: 0.12,
  /** Classifica VIVA: la striscia recente (ultime 3) muove il pubblico. */
  MOMENTUM_FILL: 0.05,
  MOMENTUM_N: 3,
  /** Zoccolo duro abbonati: i rinnovi si ancorano ai vecchi abbonati... */
  RENEW_FLOOR_BASE: 0.55,
  RENEW_FLOOR_SAT: 0.3,
  RENEW_GROWTH_CAP: 1.25,
  /** ...e promozione/retrocessione sono i veri shock delle tessere. */
  PROMO_DEMAND: 0.12,
  PROMO_GROWTH_CAP: 2,
  RELEG_DEMAND: -0.1,
  RELEG_FLOOR_MULT: 0.6,
  /** Colpo di mercato: le stelle appena firmate vendono tessere (effetto-fenomeno). */
  STAR_SIGNING_OVERALL: 80,
  STAR_SIGNING_DEMAND: 0.05,
  STAR_SIGNING_CAP: 2,
  /** Elasticità per settore: le curve reagiscono al prezzo, la tribuna no. */
  SECTOR_ELASTICITY: {
    principale: 0.4,
    distinti: 1,
    curvaNord: 1.6,
    curvaSud: 1.6,
    angoloNE: 1,
    angoloNO: 1,
    angoloSE: 1,
    angoloSO: 1,
  } as Record<string, number>,
  /** Cartello dalla classifica viva: prime 3 contro prime 3 nel girone di ritorno. */
  CLASH_TOP: 3,
  CLASH_FROM: 0.5,
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

/** I servizi dell'ufficio (richiesta utente): si comprano una tantum, per sempre. */
export interface FeatureSpec {
  id: MarketingFeature;
  label: string;
  cost: number;
  desc: string;
}

export const MKT_FEATURES: readonly FeatureSpec[] = [
  {
    id: 'abbonamenti',
    label: 'Ufficio abbonamenti',
    cost: 500_000,
    desc: 'La campagna tessere d’agosto: incasso anticipato e tifosi fedeli.',
  },
  {
    id: 'campagne',
    label: 'Reparto creativo',
    cost: 750_000,
    desc: 'Le campagne nazionali dell’anno: promo, curva, hospitality, brand.',
  },
  {
    id: 'estero',
    label: 'Desk internazionale',
    cost: 1_500_000,
    desc: 'Le campagne sui mercati esteri: tifosi nuovi nel mondo, ogni anno.',
  },
] as const;

/** Il servizio è stato comprato? (la biglietteria è sempre inclusa). */
export function hasFeature(club: Club, f: MarketingFeature): boolean {
  return club.marketing?.features?.includes(f) ?? false;
}

/**
 * Potere delle campagne NAZIONALI [0.7..1.3]: conta il MERCATO in cui parli, non
 * l'indirizzo dell'ufficio — in casa il mercato è il tuo popolo, e un blasone più
 * grande lo muove di più.
 */
export function officePower(club: Club): number {
  if (!club.marketing) return 0;
  return clamp(
    MKT.NAT_POWER_MIN + (MKT.NAT_POWER_MAX - MKT.NAT_POWER_MIN) * ((club.reputation - 40) / 55),
    MKT.NAT_POWER_MIN,
    MKT.NAT_POWER_MAX,
  );
}

/** La nazione della campagna INTERNAZIONALE attiva (serve il desk internazionale). */
export function abroadCampaignNation(club: Club): string | undefined {
  return hasFeature(club, 'estero') ? club.marketing?.abroadNation : undefined;
}

function activeCampaign(club: Club): CampaignId | undefined {
  return hasFeature(club, 'campagne') ? club.marketing?.plan.campaign : undefined;
}

/** Prezzo base di DEFAULT della lega del club (€): nazione + divisione. */
export function defaultTicketPrice(world: World, club: Club): number {
  const league = leagueOfClub(world, club.id);
  const nationCode = nationById(world, league.nationId)?.code ?? 'DEFAULT';
  const tiers = MKT.BASE_PRICE[nationCode] ?? MKT.BASE_PRICE.DEFAULT ?? [32, 16];
  return tiers[Math.min(league.tier, 2) - 1] ?? tiers[1] ?? 16;
}

/** Il prezzo base SCELTO dall'utente (€/biglietto), o il default di lega. */
export function ticketBasePrice(world: World, club: Club): number {
  const chosen = club.marketing?.plan.basePrice;
  if (chosen === undefined) return defaultTicketPrice(world, club);
  return clamp(Math.round(chosen), MKT.PRICE_MIN, MKT.PRICE_MAX);
}

/** Elasticità sul prezzo in €: caro rispetto alla TUA lega = stadio più vuoto. */
export function priceFillDelta(world: World, club: Club): number {
  const ratio = ticketBasePrice(world, club) / Math.max(1, defaultTicketPrice(world, club));
  return clamp(-MKT.PRICE_ELASTICITY * (ratio - 1), MKT.PRICE_FILL_MIN, MKT.PRICE_FILL_MAX);
}

/** Prezzo € dell'abbonamento stagionale per fascia (dal prezzo base di listino). */
export function seasonTicketPrice(world: World, club: Club, level: PriceLevel): number {
  return Math.round(
    ticketBasePrice(world, club) *
      FINANCES.HOME_GAMES *
      MKT.ABB_DISCOUNT *
      ticketFactors(level).gate,
  );
}

/** ---- Classifica VIVA (punto 1): posizioni e forma dai risultati veri ---- */

/** La classifica dalle gare GIOCATE; null finché non si gioca (agosto: si va d'attese). */
export function livePosition(season: Season, clubId: string): { pos: number; n: number } | null {
  const rows = new Map<string, { pts: number; gd: number; gf: number }>();
  let played = 0;
  for (const f of season.fixtures) {
    for (const id of [f.homeClubId as string, f.awayClubId as string]) {
      if (!rows.has(id)) rows.set(id, { pts: 0, gd: 0, gf: 0 });
    }
    if (!f.played || f.homeGoals === null || f.awayGoals === null) continue;
    played++;
    const h = rows.get(f.homeClubId as string);
    const a = rows.get(f.awayClubId as string);
    if (!h || !a) continue;
    h.gd += f.homeGoals - f.awayGoals;
    a.gd += f.awayGoals - f.homeGoals;
    h.gf += f.homeGoals;
    a.gf += f.awayGoals;
    if (f.homeGoals > f.awayGoals) h.pts += 3;
    else if (f.homeGoals < f.awayGoals) a.pts += 3;
    else {
      h.pts += 1;
      a.pts += 1;
    }
  }
  if (played === 0 || !rows.has(clubId)) return null;
  const table = [...rows.entries()].sort(
    ([, x], [, y]) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf,
  );
  return { pos: table.findIndex(([id]) => id === clubId) + 1, n: table.length };
}

/** La forma recente [-1..1]: vittorie − sconfitte nelle ultime MOMENTUM_N giocate. */
export function recentForm(season: Season, clubId: string): number {
  const mine = season.fixtures
    .filter(
      (f) =>
        f.played &&
        f.homeGoals !== null &&
        f.awayGoals !== null &&
        ((f.homeClubId as string) === clubId || (f.awayClubId as string) === clubId),
    )
    .sort((a, b) => a.round - b.round)
    .slice(-MKT.MOMENTUM_N);
  if (mine.length === 0) return 0;
  let score = 0;
  for (const f of mine) {
    const my = (f.homeClubId as string) === clubId ? f.homeGoals : f.awayGoals;
    const their = (f.homeClubId as string) === clubId ? f.awayGoals : f.homeGoals;
    if (my === null || their === null) continue;
    score += my > their ? 1 : my < their ? -1 : 0;
  }
  return score / mine.length;
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
    // Punto 5: elasticità PER SETTORE — la curva reagisce al prezzo, la tribuna no.
    const elasticity = MKT.SECTOR_ELASTICITY[id] ?? 1;
    seats += sec.seats;
    gate += sec.seats * f.gate;
    fill += sec.seats * f.fillDelta * MKT.SECTOR_FILL_WEIGHT * elasticity;
  }
  if (seats === 0) return { gate: 1, fillDelta: 0 };
  return { gate: gate / seats, fillDelta: fill / seats };
}

/** Derby cittadino: i nomi sono "Città Colori" → stessa prima parola = stessa città. */
export function isDerby(a: Pick<Club, 'name'>, b: Pick<Club, 'name'>): boolean {
  const cityOf = (name: string) => name.split(' ')[0] ?? name;
  return cityOf(a.name) === cityOf(b.name);
}

/**
 * La classe di una gara di campionato in casa (la coppa è sempre 'coppa'):
 * derby cittadino, big per blasone, o — punto 6 — SCONTRO D'ALTA CLASSIFICA
 * (prime 3 contro prime 3 nel girone di ritorno, anche tra provinciali).
 */
export function matchClassOf(
  club: Club,
  opponent: Club,
  ctx?: { myPos?: number; oppPos?: number; roundFrac?: number },
): MatchClass {
  if (isDerby(club, opponent) || opponent.reputation >= MKT.CARTELLO_REP) return 'cartello';
  if (
    ctx?.myPos !== undefined &&
    ctx.oppPos !== undefined &&
    (ctx.roundFrac ?? 0) >= MKT.CLASH_FROM &&
    ctx.myPos <= MKT.CLASH_TOP &&
    ctx.oppPos <= MKT.CLASH_TOP
  )
    return 'cartello';
  return 'campionato';
}

/** Punto 4 — colpo di mercato: stelle FIRMATE nell'ultimo anno che vendono tessere. */
export function starSignings(world: World, club: Club, year: number): number {
  if (year <= 0) return 0;
  let count = 0;
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    const c = p?.contractId ? world.contracts.get(p.contractId) : undefined;
    if (!p || !c) continue;
    if (c.startYear >= year - 1 && playerOverall(p) >= MKT.STAR_SIGNING_OVERALL) count++;
  }
  return Math.min(count, MKT.STAR_SIGNING_CAP);
}

/**
 * La DOMANDA di abbonamenti alla campagna d'agosto: reputazione, soddisfazione
 * dell'anno scorso (rinnovi con memoria), prezzo in € rispetto alla lega, colpi
 * di mercato appena firmati, campagna attiva, tetto.
 */
export function subscriberDemand(
  world: World,
  club: Club,
  m: ClubMarketing,
  year: number,
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
      priceFillDelta(world, club) * 1.2 +
      MKT.STAR_SIGNING_DEMAND * starSignings(world, club, year) +
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
export function marketingMatchGate(
  world: World,
  club: Club,
  cls: MatchClass,
  posFrac: number,
  /** Punto 1: forma recente [-1..1] (vittorie − sconfitte, ultime 3). */
  momentum = 0,
): MatchGate {
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
      MKT.MOMENTUM_FILL * momentum +
      classF.fillDelta +
      sectorF.fillDelta +
      priceFillDelta(world, club) +
      (cls === 'cartello' ? MKT.CARTELLO_FILL : 0) +
      (cls === 'coppa' ? MKT.COPPA_FILL : 0) +
      (campaign === 'portaAmico' ? 0.06 * power : 0) +
      hype,
    cls === 'coppa' ? 0.1 : FINANCES.FILL_MIN,
    1,
  );
  const paying = Math.round(freeSeats * fill);
  const perTicket =
    ticketBasePrice(world, club) *
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
export function marketingSeasonGate(world: World, club: Club, posFrac: number, year = 0): number {
  const m = club.marketing;
  if (!m) return 0;
  const level = m.abbPricePaid ?? m.plan.abbPrice ?? 'standard';
  const abbonati = m.abbonati ?? subscriberDemand(world, club, m, year).abbonati;
  const abbIncome = abbonati * seasonTicketPrice(world, club, level);
  const perGame =
    0.8 * marketingMatchGate(world, club, 'campionato', posFrac).gate +
    0.2 * marketingMatchGate(world, club, 'cartello', posFrac).gate;
  return Math.round(abbIncome + FINANCES.HOME_GAMES * perGame);
}

/**
 * Chiude la campagna abbonamenti d'AGOSTO (chiamata alla nuova stagione): incassa
 * tutto subito (voce 'abbonamenti'), aggiorna la memoria dei rinnovi, azzera hype
 * e campagna (si ricompra ogni anno). Ritorna i numeri per il racconto.
 */
export function resolveSeasonTickets(
  world: World,
  club: Club,
  satisfaction: number,
  year: number,
  /** Punto 3: promozione/retrocessione sono i veri shock delle tessere. */
  shock: 'promozione' | 'retrocessione' | null = null,
): { abbonati: number; income: number; price: number; level: PriceLevel } | null {
  const m = club.marketing;
  if (!m) return null;
  // La domanda si calcola PRIMA di spegnere le campagne (curvaPopolare conta qui).
  let out: { abbonati: number; income: number; price: number; level: PriceLevel } | null = null;
  if (hasFeature(club, 'abbonamenti')) {
    const level = m.plan.abbPrice ?? 'standard';
    const raw = subscriberDemand(world, club, m, year);
    // ZOCCOLO DURO (punto 3): le basi abbonati sono vischiose — i rinnovi partono
    // dai vecchi tesserati (floor legato alla soddisfazione), la crescita annua è
    // limitata; promozione e retrocessione spostano davvero i confini.
    let demand =
      raw.abbonati +
      Math.round(
        raw.capSeats *
          (shock === 'promozione'
            ? MKT.PROMO_DEMAND
            : shock === 'retrocessione'
              ? MKT.RELEG_DEMAND
              : 0),
      );
    const prev = m.abbonati ?? 0;
    if (prev > 0) {
      let floor = Math.round(prev * (MKT.RENEW_FLOOR_BASE + MKT.RENEW_FLOOR_SAT * satisfaction));
      if (shock === 'retrocessione') floor = Math.round(floor * MKT.RELEG_FLOOR_MULT);
      const growthCap = Math.round(
        prev * (shock === 'promozione' ? MKT.PROMO_GROWTH_CAP : MKT.RENEW_GROWTH_CAP),
      );
      demand = Math.max(floor, Math.min(demand, growthCap));
    }
    const abbonati = Math.max(0, Math.min(demand, raw.capSeats));
    const price = seasonTicketPrice(world, club, level);
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
    out = { abbonati, income, price, level };
  } else {
    m.lastSatisfaction = satisfaction;
  }
  m.soldOutStreak = 0;
  // Le campagne (nazionale E internazionale) valgono una stagione: si ricomprano.
  m.plan = { ...m.plan, campaign: undefined };
  m.abroadNation = undefined;
  return out;
}
