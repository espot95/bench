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
import type { BoardDeal, KitArchiveEntry, KitDesign, PromoKind } from '../core/types.js';
import { leagueOfClub, nationById } from '../core/types.js';
import { FINANCES } from './season-economy.js';
import { SPONSOR_BRANDS, type SponsorTier } from './sponsor-brands.js';

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
  /** Bordocampo (A): slot di cartellonistica, valore = occhi veri allo stadio. */
  BOARD_SLOTS_BASE: 4,
  BOARD_SLOTS_BIG: 6,
  BOARD_BIG_CAPACITY: 35_000,
  BOARD_RATE: 6, // €/spettatore-tipo a stagione, per cartellone
  BOARD_TIER_MULT: {
    micro: 0.5,
    piccola: 0.75,
    media: 1,
    grande: 1.3,
    multinazionale: 1.6,
  } as Record<string, number>,
  BOARD_OFFERS: 3,
  /** Naming rights (B): il brand compra il NOME dello stadio, pluriennale. */
  NAMING_RATE: 22, // €/posto all'anno, scalato sulla fama
  NAMING_YEARS: 5,
  NAMING_UPFRONT: 0.5, // bonus alla firma = mezza annualità in più
  NAMING_SAT_COST: 0.15, // la curva mugugna: colpo alla soddisfazione (rinnovi!)
  NAMING_OFFERS: 2,
  /** Promo della singola gara (C): riempire sacrificando incasso a biglietto. */
  PROMO: {
    famiglie: { fill: 0.15, gate: 0.6 },
    omaggio: { fill: 0.1, gate: 0.8 },
    scuole: { fill: 0.2, gate: 0.5 },
  } as Record<string, { fill: number; gate: number }>,
  PROMO_SCUOLE_SAT: 0.03, // le scuole allo stadio scaldano la piazza
  /** Testimonial (D): la faccia delle campagne — fee al giocatore, potere in più. */
  TESTIMONIAL_FEE_SHARE: 0.05, // dell'ingaggio lordo annuo
  TESTIMONIAL_FEE_MIN: 100_000,
  TESTIMONIAL_BOOST_MAX: 0.25,
  /** Atelier delle divise (E): il lancio della maglia e il verdetto della piazza. */
  KIT_MARGIN: 12, // € di margine per maglia venduta
  KIT_BASE_BUYERS: 0.25, // senza abbonamenti: quota di capienza che compra
  KIT_FOREIGN_SHARE: 0.15, // quota dei tifosi esteri che compra...
  KIT_FOREIGN_MODERNO: 0.3, // ...che raddoppia con un design moderno
  KIT_VERDICT_BASE: 45,
  KIT_FIDELITY: 20, // premio fedeltà ai colori sociali...
  KIT_FIDELITY_STORICO: 30, // ...che per lo storico pesa di più
  KIT_STORICO_WIN: 10, // storico dopo un'annata felice: la curva si commuove
  KIT_CREATIVO_SWING: 40, // creativo = scommessa: hash del design, −12..+28
  KIT_CREATIVO_MALUS: 12,
  KIT_MODERNO_BONUS: 5,
  KIT_CAMPAIGN: 8, // una campagna nazionale attiva amplifica il lancio (×power)
  KIT_GOLDEN: 18, // rievocare un'annata d'ORO: il pubblico impazzisce
  KIT_REVIVAL_FLAT: -5, // rievocare un'annata anonima: alzate di spalle
  KIT_LOVE_AT: 65,
  KIT_BOO_AT: 35,
  KIT_LOVE_SAT: 0.02,
  KIT_BOO_SAT: -0.03,
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
    id: 'pubblicita',
    label: 'Regia pubblicitaria',
    cost: 600_000,
    desc: 'Vendi visibilità: cartelloni a bordocampo e promo delle singole gare.',
  },
  {
    id: 'campagne',
    label: 'Reparto creativo',
    cost: 750_000,
    desc: 'Le campagne nazionali dell’anno: promo, curva, hospitality, brand.',
  },
  {
    id: 'divise',
    label: 'Atelier delle divise',
    cost: 800_000,
    desc: 'Disegna la maglia, lanciala col marketing, rievoca le annate d’oro.',
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
export function officePower(world: World, club: Club): number {
  if (!club.marketing) return 0;
  const base = clamp(
    MKT.NAT_POWER_MIN + (MKT.NAT_POWER_MAX - MKT.NAT_POWER_MIN) * ((club.reputation - 40) / 55),
    MKT.NAT_POWER_MIN,
    MKT.NAT_POWER_MAX,
  );
  return base * (1 + testimonialBoost(world, club));
}

/**
 * Testimonial (D): la faccia giusta amplifica le campagne — ma se il giocatore
 * non è più in rosa la campagna resta ORFANA (boost azzerato, fee già pagata).
 */
export function testimonialBoost(world: World, club: Club): number {
  const t = club.marketing?.testimonial;
  if (!t || !hasFeature(club, 'campagne')) return 0;
  if (!club.playerIds.some((id) => (id as string) === t.playerId)) return 0;
  const player = [...world.players.values()].find((p) => (p.id as string) === t.playerId);
  if (!player) return 0;
  return clamp(
    (MKT.TESTIMONIAL_BOOST_MAX * (playerOverall(player) - 60)) / 30,
    0.05,
    MKT.TESTIMONIAL_BOOST_MAX,
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
  const campaign = activeCampaign(club) === 'curvaPopolare' ? 0.1 * officePower(world, club) : 0;
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
  /** Promo one-shot della gara (C): riempie, ma il biglietto rende meno. */
  promo?: PromoKind,
): MatchGate {
  const promoFx = promo ? MKT.PROMO[promo] : undefined;
  const m = club.marketing;
  const cap = stadiumCapacity(club);
  const level = m?.plan.prices?.[cls] ?? 'standard';
  const classF = ticketFactors(level);
  const sectorF = sectorFactors(club.stadium, m?.plan.sectorPrices);
  const abbonati = cls === 'coppa' ? 0 : Math.min(m?.abbonati ?? 0, cap);
  const freeSeats = cap - abbonati;

  const campaign = activeCampaign(club);
  const power = officePower(world, club);
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
      (promoFx?.fill ?? 0) +
      hype,
    cls === 'coppa' ? 0.1 : FINANCES.FILL_MIN,
    1,
  );
  const paying = Math.round(freeSeats * fill);
  const perTicket =
    ticketBasePrice(world, club) *
    classF.gate *
    sectorF.gate *
    (promoFx?.gate ?? 1) *
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
export function commercialBoost(world: World, club: Club): number {
  return activeCampaign(club) === 'spintaCommerciale' ? 1 + 0.12 * officePower(world, club) : 1;
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

/** ---- PUBBLICITÀ (A/B): l'inventario di visibilità dello stadio ---- */

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TIER_INDEX: Record<SponsorTier, number> = {
  micro: 0,
  piccola: 1,
  media: 2,
  grande: 3,
  multinazionale: 4,
};

function clubTierIdx(reputation: number): number {
  if (reputation >= 82) return 4;
  if (reputation >= 68) return 3;
  if (reputation >= 55) return 2;
  if (reputation >= 45) return 1;
  return 0;
}

/** Gli slot di bordocampo del club: gli stadi grandi ne reggono di più. */
export function boardSlots(club: Club): number {
  return stadiumCapacity(club) >= MKT.BOARD_BIG_CAPACITY
    ? MKT.BOARD_SLOTS_BIG
    : MKT.BOARD_SLOTS_BASE;
}

export interface BoardOffer {
  brandId: string;
  brandName: string;
  tier: SponsorTier;
  annualValue: number;
  years: number;
}

/**
 * Le offerte di cartellonistica dell'anno (deterministiche da club+anno, zero RNG):
 * il valore sono gli OCCHI — spettatori-tipo della gara media × tariffa × taglia brand.
 */
export function boardOffers(world: World, club: Club, year: number): BoardOffer[] {
  const m = club.marketing;
  const taken = new Set([
    ...(m?.boards ?? []).map((b) => b.brandId),
    ...(club.sponsors ?? []).map((c) => c.brandId),
  ]);
  const myTier = clubTierIdx(club.reputation);
  const eligible = SPONSOR_BRANDS.filter(
    (b) => !taken.has(b.id) && !b.special && Math.abs(TIER_INDEX[b.tier] - myTier) <= 2,
  );
  if (eligible.length === 0) return [];
  const attendance = marketingMatchGate(world, club, 'campionato', 0.5).attendance;
  const out: BoardOffer[] = [];
  const used = new Set<string>();
  for (let i = 0; out.length < MKT.BOARD_OFFERS && i < MKT.BOARD_OFFERS * 4; i++) {
    const pick = eligible[hash32(`${club.id}|board|${year}|${i}`) % eligible.length];
    if (!pick || used.has(pick.id)) continue;
    used.add(pick.id);
    const mult = MKT.BOARD_TIER_MULT[pick.tier] ?? 1;
    out.push({
      brandId: pick.id,
      brandName: pick.name,
      tier: pick.tier,
      annualValue: Math.round((attendance * MKT.BOARD_RATE * mult) / 1000) * 1000,
      years: 1 + (hash32(`${club.id}|boardyrs|${year}|${pick.id}`) % 2),
    });
  }
  return out;
}

/** Firma un cartellone: entra la PRIMA annualità, il resto ai conguagli estivi. */
export function signBoardDeal(club: Club, offer: BoardOffer, year: number): BoardDeal | null {
  const m = club.marketing;
  if (!m || !hasFeature(club, 'pubblicita')) return null;
  const boards = m.boards ?? [];
  if (boards.length >= boardSlots(club)) return null;
  const deal: BoardDeal = {
    brandId: offer.brandId,
    brandName: offer.brandName,
    annualValue: offer.annualValue,
    endYear: year + offer.years - 1,
  };
  m.boards = [...boards, deal];
  club.finances.incomes.push({
    type: 'pubblicita',
    amount: offer.annualValue,
    year,
    note: `bordocampo: ${offer.brandName}`,
  });
  club.finances.cash += offer.annualValue;
  return deal;
}

export interface NamingOffer {
  brandId: string;
  brandName: string;
  stadiumName: string;
  annualValue: number;
  upfront: number;
  years: number;
}

/**
 * Naming rights (B): 2 pretendenti l'anno tra i brand GROSSI. Il nome dello stadio
 * diventa loro; anticipo pesante alla firma, annualità ai conguagli, curva ferita.
 */
export function namingOffers(world: World, club: Club, year: number): NamingOffer[] {
  if (club.marketing?.naming) return [];
  const taken = new Set((club.sponsors ?? []).map((c) => c.brandId));
  const eligible = SPONSOR_BRANDS.filter(
    (b) => !taken.has(b.id) && !b.special && (b.tier === 'grande' || b.tier === 'multinazionale'),
  );
  if (eligible.length === 0) return [];
  const annual =
    Math.round((stadiumCapacity(club) * MKT.NAMING_RATE * (0.5 + club.reputation / 100)) / 10_000) *
    10_000;
  const out: NamingOffer[] = [];
  const used = new Set<string>();
  for (let i = 0; out.length < MKT.NAMING_OFFERS && i < MKT.NAMING_OFFERS * 4; i++) {
    const pick = eligible[hash32(`${club.id}|naming|${year}|${i}`) % eligible.length];
    if (!pick || used.has(pick.id)) continue;
    used.add(pick.id);
    const value =
      Math.round((annual * (pick.tier === 'multinazionale' ? 1.2 : 1)) / 10_000) * 10_000;
    out.push({
      brandId: pick.id,
      brandName: pick.name,
      stadiumName: `${pick.name} Arena`,
      annualValue: value,
      upfront: Math.round(value * MKT.NAMING_UPFRONT),
      years: MKT.NAMING_YEARS,
    });
  }
  return out;
}

/** Vende il NOME: prima annualità + anticipo subito, e la curva la prende male. */
export function signNamingDeal(club: Club, offer: NamingOffer, year: number): boolean {
  const m = club.marketing;
  if (!m || m.naming) return false;
  m.naming = {
    brandName: offer.brandName,
    annualValue: offer.annualValue,
    endYear: year + offer.years - 1,
  };
  const firstPayment = offer.annualValue + offer.upfront;
  club.finances.incomes.push({
    type: 'pubblicita',
    amount: firstPayment,
    year,
    note: `naming rights: ${offer.stadiumName} (${offer.years} anni)`,
  });
  club.finances.cash += firstPayment;
  // Il prezzo identitario: la soddisfazione guida i RINNOVI abbonamenti.
  m.lastSatisfaction = Math.max(0, (m.lastSatisfaction ?? 0.5) - MKT.NAMING_SAT_COST);
  return true;
}

/** Il nome commerciale dello stadio, se venduto (per la UI). */
export function stadiumNamingName(club: Club): string | null {
  return club.marketing?.naming ? `${club.marketing.naming.brandName} Arena` : null;
}

/**
 * Il conguaglio ESTIVO della pubblicità (chiamato ad advanceSeason, anno NUOVO):
 * paga le annualità di bordocampo e naming ancora in corso, spegne i contratti
 * scaduti, azzera testimonial e promo (si rifanno ogni stagione).
 */
export function settleMarketingYear(
  club: Club,
  year: number,
): { boardIncome: number; namingIncome: number; expired: string[] } {
  const m = club.marketing;
  if (!m) return { boardIncome: 0, namingIncome: 0, expired: [] };
  let boardIncome = 0;
  let namingIncome = 0;
  const expired: string[] = [];

  const alive: BoardDeal[] = [];
  for (const b of m.boards ?? []) {
    if (b.endYear >= year) {
      boardIncome += b.annualValue;
      club.finances.incomes.push({
        type: 'pubblicita',
        amount: b.annualValue,
        year,
        note: `bordocampo: ${b.brandName}`,
      });
      club.finances.cash += b.annualValue;
      alive.push(b);
    } else {
      expired.push(b.brandName);
    }
  }
  m.boards = alive.length > 0 ? alive : undefined;

  if (m.naming) {
    if (m.naming.endYear >= year) {
      namingIncome = m.naming.annualValue;
      club.finances.incomes.push({
        type: 'pubblicita',
        amount: namingIncome,
        year,
        note: `naming rights: ${m.naming.brandName} Arena`,
      });
      club.finances.cash += namingIncome;
    } else {
      expired.push(`${m.naming.brandName} Arena`);
      m.naming = undefined;
    }
  }

  // Testimonial e promo sono cose di UNA stagione.
  m.testimonial = undefined;
  m.promo = undefined;
  return { boardIncome, namingIncome, expired };
}

/** ---- ATELIER DELLE DIVISE (E): lancio, verdetto della piazza, archivio ---- */

export interface KitLaunchResult {
  verdictPct: number;
  verdict: 'amore' | 'tiepida' | 'fischi';
  income: number;
}

/**
 * Il VERDETTO della piazza su una divisa [5..95] — deterministico, zero RNG:
 * fedeltà ai colori sociali (per lo storico pesa di più), storico dopo un'annata
 * felice, il creativo è una scommessa (hash del disegno), il moderno viaggia,
 * una campagna nazionale attiva amplifica, la rievocazione vive dell'annata.
 */
export function kitVerdict(
  world: World,
  club: Club,
  design: KitDesign,
  ctx: { fidelity: number; golden?: boolean },
): number {
  const m = club.marketing;
  let v = MKT.KIT_VERDICT_BASE;
  v += ctx.fidelity * (design.style === 'storico' ? MKT.KIT_FIDELITY_STORICO : MKT.KIT_FIDELITY);
  if (design.style === 'storico' && (m?.lastSatisfaction ?? 0.5) >= 0.6) v += MKT.KIT_STORICO_WIN;
  if (design.style === 'creativo') {
    const decalKey = (design.decals ?? [])
      .map((dc) => `${dc.shape}@${Math.round(dc.x)},${Math.round(dc.y)}:${dc.color}`)
      .join(';');
    const key = `${design.pattern}|${design.primary}|${design.secondary}|${design.sleeves}|${design.collar}|${decalKey}`;
    v += ((hash32(`kit|${key}`) % 1000) / 1000) * MKT.KIT_CREATIVO_SWING - MKT.KIT_CREATIVO_MALUS;
  }
  if (design.style === 'moderno') {
    v += MKT.KIT_MODERNO_BONUS;
    if (Object.keys(club.foreignFans ?? {}).length > 0) v += 5;
  }
  if (activeCampaign(club) !== undefined) v += MKT.KIT_CAMPAIGN * officePower(world, club);
  if (design.origin === 'rievocazione') v += ctx.golden ? MKT.KIT_GOLDEN : MKT.KIT_REVIVAL_FLAT;
  return Math.round(clamp(v, 5, 95));
}

/**
 * Lancia la divisa dell'anno (UNA a stagione): verdetto, incasso merch (abbonati +
 * tifosi esteri, il moderno viaggia meglio), ritocco alla soddisfazione, archivio.
 */
export function launchKitDeal(
  world: World,
  club: Club,
  design: KitDesign,
  year: number,
  ctx: { fidelity: number; golden?: boolean },
): KitLaunchResult | null {
  const m = club.marketing;
  if (!m || !hasFeature(club, 'divise')) return null;
  const kits = m.kits ?? { archive: [] };
  if (kits.current?.year === year) return null; // una a stagione

  const verdictPct = kitVerdict(world, club, design, ctx);
  const cap = stadiumCapacity(club);
  const foreign = Object.values(club.foreignFans ?? {}).reduce((a, x) => a + x.fans, 0);
  const buyers =
    (m.abbonati ?? Math.round(cap * MKT.KIT_BASE_BUYERS)) +
    Math.round(
      foreign * (design.style === 'moderno' ? MKT.KIT_FOREIGN_MODERNO : MKT.KIT_FOREIGN_SHARE),
    );
  const income = Math.round(buyers * MKT.KIT_MARGIN * (0.4 + verdictPct / 100));
  if (income > 0) {
    club.finances.incomes.push({
      type: 'merch',
      amount: income,
      year,
      note: `lancio maglia (${design.style})`,
    });
    club.finances.cash += income;
  }
  if (verdictPct >= MKT.KIT_LOVE_AT) {
    m.lastSatisfaction = Math.min(1, (m.lastSatisfaction ?? 0.5) + MKT.KIT_LOVE_SAT);
  } else if (verdictPct < MKT.KIT_BOO_AT) {
    m.lastSatisfaction = Math.max(0, (m.lastSatisfaction ?? 0.5) + MKT.KIT_BOO_SAT);
  }

  const entry: KitArchiveEntry = { year, design, verdictPct };
  m.kits = { current: entry, archive: [...kits.archive, entry].slice(-20) };
  return {
    verdictPct,
    verdict:
      verdictPct >= MKT.KIT_LOVE_AT ? 'amore' : verdictPct < MKT.KIT_BOO_AT ? 'fischi' : 'tiepida',
    income,
  };
}
