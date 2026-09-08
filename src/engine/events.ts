/**
 * L'estate e gli eventi (F4, docs/MODULE_EVENTS.md): ritiro estivo (la città conta),
 * tour mondiali (sinergia coi mercati esteri), concerti con usura del campo e
 * pubblicità per il pienone. Puro: cataloghi + economia; gli effetti in partita
 * passano dal runner (applyPreparation/applyPitchWear). Solo club utente.
 */

import { stadiumCapacity } from '../core/stadium.js';
import type { Club, Season, World } from '../core/types.js';
import { FANBASE } from '../finances/sponsors.js';
import type { Rng } from '../rng/rng.js';

export const SUMMER = {
  /** La preparazione copre le prime giornate. */
  PREP_ROUNDS: 10,
  /** Boost di forma al massimo della qualità strutture (piccolo: bande salve). */
  PREP_BOOST: 0.03,
  /** Riduzione del rischio infortuni al massimo della qualità. */
  PREP_INJ: 0.3,
  /** Tour: incasso base, scalato su fama² e peso del mercato. */
  TOUR_BASE: 2_500_000,
  /** Affinità: hai già tifosi nel mercato / hai un giocatore di quella nazione. */
  TOUR_FANS_MULT: 1.4,
  TOUR_PLAYER_MULT: 1.2,
  /** Costo viaggio per distanza. */
  TRAVEL_COST: { vicino: 200_000, medio: 500_000, lontano: 800_000 } as Record<string, number>,
  /** Gambe pesanti al rientro: boost<1 per N giornate (si somma al ritiro). */
  TOUR_LEGS: {
    vicino: { boost: 1, rounds: 0 },
    medio: { boost: 0.99, rounds: 1 },
    lontano: { boost: 0.985, rounds: 2 },
  } as Record<string, { boost: number; rounds: number }>,
  // La spinta ai mercati esteri (crescita ×1.5, semina) vive in FANBASE (sponsors.ts).
  /** Concerti: biglietto medio e pubblicità (riempimento extra / costo per posto). */
  TICKET: 30,
  AD_FILL: [0, 0.2, 0.35],
  AD_COST_PER_SEAT: [0, 4, 9],
  /** Riempimento base = 0.35 + 0.35×rep/100 + richiamo del tier. */
  FILL_BASE: 0.35,
  FILL_REP: 0.35,
  /** Usura del campo (gara in casa a ridosso del concerto): smorza gli stili palla
   *  a terra verso il neutro + malus tiri. */
  WEAR_DAMP: 0.4,
  WEAR_SHOTS: 0.96,
  /** Round di lega ai quali arrivano le proposte dei promoter. */
  CONCERT_ROUNDS: [4, 10, 16, 22, 28, 33],
} as const;

// ---------------------------------------------------------------- ritiro (§1)

export interface RitiroSpot {
  id: string;
  name: string;
  country: string;
  /** Qualità delle strutture (campi, palestre, spa): è ciò che conta davvero. */
  quality: number;
  cost: number;
  blurb: string;
  /** Coordinate per il planisfero (assenti per 'casa': città del club). */
  lat?: number;
  lon?: number;
}

export const RITIRO_SPOTS: readonly RitiroSpot[] = [
  {
    id: 'casa',
    name: 'Campo comunale (casa)',
    country: '—',
    quality: 40,
    cost: 100_000,
    blurb: 'Zero viaggi, strutture spartane.',
  },
  {
    id: 'auronzo',
    lat: 46.55,
    lon: 12.43,
    name: 'Auronzo di Cadore',
    country: 'ITA',
    quality: 70,
    cost: 600_000,
    blurb: 'Aria di Dolomiti, campi onesti.',
  },
  {
    id: 'moena',
    lat: 46.38,
    lon: 11.66,
    name: 'Moena',
    country: 'ITA',
    quality: 72,
    cost: 650_000,
    blurb: 'La val di Fassa, tradizione di ritiri.',
  },
  {
    id: 'pinzolo',
    lat: 46.16,
    lon: 10.77,
    name: 'Pinzolo',
    country: 'ITA',
    quality: 75,
    cost: 700_000,
    blurb: 'Quota e palestre moderne.',
  },
  {
    id: 'dimaro',
    lat: 46.33,
    lon: 10.87,
    name: 'Dimaro Val di Sole',
    country: 'ITA',
    quality: 78,
    cost: 800_000,
    blurb: 'Il classico: strutture curate, tifosi al seguito.',
  },
  {
    id: 'waltersdorf',
    lat: 47.17,
    lon: 16,
    name: 'Bad Waltersdorf',
    country: 'AUT',
    quality: 76,
    cost: 900_000,
    blurb: 'Terme e campi perfetti, scuola austriaca.',
  },
  {
    id: 'algarve',
    lat: 37.09,
    lon: -8.24,
    name: 'Algarve',
    country: 'POR',
    quality: 80,
    cost: 1_200_000,
    blurb: 'Centri sportivi da nazionale.',
  },
  {
    id: 'marbella',
    lat: 36.51,
    lon: -4.88,
    name: 'Marbella',
    country: 'ESP',
    quality: 85,
    cost: 1_800_000,
    blurb: 'Il polo d’Europa: tutto al top.',
  },
  {
    id: 'stmoritz',
    lat: 46.5,
    lon: 9.84,
    name: 'St. Moritz',
    country: 'SUI',
    quality: 88,
    cost: 2_200_000,
    blurb: 'Altura, spa, perfezione svizzera.',
  },
  {
    id: 'dubai',
    lat: 25.2,
    lon: 55.27,
    name: 'Dubai',
    country: 'UAE',
    quality: 92,
    cost: 3_000_000,
    blurb: 'Strutture senza eguali, caldo gestito al chiuso.',
  },
] as const;

/** Gli effetti del ritiro per il runner (MODULE_EVENTS §1). */
export function ritiroEffects(spot: RitiroSpot): {
  boost: number;
  injuryMult: number;
  rounds: number;
} {
  const q = spot.quality / 100;
  return {
    boost: 1 + SUMMER.PREP_BOOST * q,
    injuryMult: 1 - SUMMER.PREP_INJ * q,
    rounds: SUMMER.PREP_ROUNDS,
  };
}

// ---------------------------------------------------------------- tour (§2)

export interface TourDestination {
  id: string;
  nation: string;
  name: string;
  distance: 'vicino' | 'medio' | 'lontano';
  /** Peso commerciale del mercato. */
  market: number;
  lat: number;
  lon: number;
}

export const TOUR_DESTINATIONS: readonly TourDestination[] = [
  {
    lat: 31.23,
    lon: 121.47,
    id: 'chn',
    nation: 'CHN',
    name: 'Cina (Shanghai e Pechino)',
    distance: 'lontano',
    market: 1.6,
  },
  {
    id: 'usa',
    lat: 40.71,
    lon: -74.01,
    nation: 'USA',
    name: 'Stati Uniti (New York e Miami)',
    distance: 'lontano',
    market: 1.5,
  },
  {
    lat: 35.68,
    lon: 139.69,
    id: 'jpn',
    nation: 'JPN',
    name: 'Giappone (Tokyo)',
    distance: 'lontano',
    market: 1.3,
  },
  {
    lat: 37.57,
    lon: 126.98,
    id: 'kor',
    nation: 'KOR',
    name: 'Corea del Sud (Seoul)',
    distance: 'lontano',
    market: 1.1,
  },
  {
    lat: 19.08,
    lon: 72.88,
    id: 'ind',
    nation: 'IND',
    name: 'India (Mumbai)',
    distance: 'lontano',
    market: 1.2,
  },
  {
    lat: 24.71,
    lon: 46.68,
    id: 'sau',
    nation: 'SAU',
    name: 'Arabia Saudita (Riyad)',
    distance: 'medio',
    market: 1.3,
  },
  {
    lat: -33.87,
    lon: 151.21,
    id: 'aus',
    nation: 'AUS',
    name: 'Australia (Sydney)',
    distance: 'lontano',
    market: 1.0,
  },
  {
    id: 'mex',
    lat: 19.43,
    lon: -99.13,
    nation: 'MEX',
    name: 'Messico (Città del Messico)',
    distance: 'lontano',
    market: 1.0,
  },
  {
    lat: -23.55,
    lon: -46.63,
    id: 'bra',
    nation: 'BRA',
    name: 'Brasile (San Paolo)',
    distance: 'lontano',
    market: 1.1,
  },
  {
    lat: -34.6,
    lon: -58.38,
    id: 'arg',
    nation: 'ARG',
    name: 'Argentina (Buenos Aires)',
    distance: 'lontano',
    market: 0.9,
  },
  {
    lat: -26.2,
    lon: 28.05,
    id: 'rsa',
    nation: 'RSA',
    name: 'Sudafrica (Johannesburg)',
    distance: 'lontano',
    market: 0.8,
  },
  {
    lat: 48.14,
    lon: 11.58,
    id: 'ger',
    nation: 'GER',
    name: 'Germania (Monaco)',
    distance: 'vicino',
    market: 0.8,
  },
  {
    lat: 48.86,
    lon: 2.35,
    id: 'fra',
    nation: 'FRA',
    name: 'Francia (Parigi)',
    distance: 'vicino',
    market: 0.8,
  },
  {
    lat: 40.42,
    lon: -3.7,
    id: 'esp',
    nation: 'ESP',
    name: 'Spagna (Madrid)',
    distance: 'vicino',
    market: 0.8,
  },
  {
    lat: 52.37,
    lon: 4.9,
    id: 'ned',
    nation: 'NED',
    name: 'Olanda (Amsterdam)',
    distance: 'vicino',
    market: 0.7,
  },
  {
    lat: 38.72,
    lon: -9.14,
    id: 'por',
    nation: 'POR',
    name: 'Portogallo (Lisbona)',
    distance: 'vicino',
    market: 0.7,
  },
] as const;

export interface TourOutcome {
  /** Netto (può essere NEGATIVO: il piccolo che va in Cina ci rimette). */
  net: number;
  gross: number;
  travel: number;
  affinity: number;
  legs: { boost: number; rounds: number };
  headline: string;
}

/** Il preventivo del tour (per l'anteprima UI): puro, nessuna mutazione. */
export function tourQuote(
  world: World,
  club: Club,
  dest: TourDestination,
): { net: number; gross: number; travel: number; affinity: number } {
  const fame = (club.reputation / 100) ** 2;
  const fans = club.foreignFans?.[dest.nation]?.fans ?? 0;
  const hasPlayer = club.playerIds.some(
    (pid) => world.players.get(pid)?.nationality === dest.nation,
  );
  const affinity =
    (fans >= FANBASE.MIN_KEEP ? SUMMER.TOUR_FANS_MULT : 1) *
    (hasPlayer ? SUMMER.TOUR_PLAYER_MULT : 1);
  const gross = Math.round(SUMMER.TOUR_BASE * fame * dest.market * affinity);
  const travel = SUMMER.TRAVEL_COST[dest.distance] ?? 500_000;
  return { net: gross - travel, gross, travel, affinity };
}

/** Le scelte estive della stagione (guscio: `SessionExtras.summer`). */
export interface SummerPlan {
  year: number;
  ritiroId?: string;
  tourId?: string;
  tourNation?: string;
}

/**
 * Gioca il tour estivo (MODULE_EVENTS §2): posta il netto sul ledger (voce `eventi`,
 * in perdita → spesa) e ritorna le gambe pesanti per il runner. Puro, zero RNG.
 */
export function playTour(
  world: World,
  club: Club,
  dest: TourDestination,
  year: number,
): TourOutcome {
  const { net, gross, travel, affinity } = tourQuote(world, club, dest);
  if (net >= 0) {
    club.finances.incomes.push({ type: 'eventi', amount: net, year, note: `tour: ${dest.name}` });
  } else {
    club.finances.expenses.push({
      type: 'eventi',
      amount: -net,
      year,
      note: `tour in perdita: ${dest.name}`,
    });
  }
  club.finances.cash += net;
  return {
    net,
    gross,
    travel,
    affinity,
    legs: SUMMER.TOUR_LEGS[dest.distance] ?? { boost: 1, rounds: 0 },
    headline:
      net >= 0
        ? `Tour in ${dest.name}: incasso netto ${(net / 1e6).toFixed(1)}M.`
        : `Il tour in ${dest.name} è un bagno: ${(-net / 1e6).toFixed(1)}M bruciati.`,
  };
}

// ---------------------------------------------------------------- concerti (§3)

/** Band PARODIA (mai persone reali): il promoter porta questi. */
const ARTISTS: readonly { name: string; tier: 0 | 1 | 2 }[] = [
  { name: 'I Ferrovieri del Liscio', tier: 0 },
  { name: 'Orchestra Casadello', tier: 0 },
  { name: 'Punkreas di Provincia', tier: 0 },
  { name: 'Le Vibrazioni Sismiche', tier: 0 },
  { name: 'Oasys', tier: 1 },
  { name: 'Depeche Mood', tier: 1 },
  { name: 'Radiohat', tier: 1 },
  { name: 'Daft Punkt', tier: 1 },
  { name: 'Guns N’ Poses', tier: 1 },
  { name: 'Coldplace', tier: 2 },
  { name: 'The Rolling Stoves', tier: 2 },
  { name: 'Pink Freud', tier: 2 },
  { name: 'Metallika', tier: 2 },
  { name: 'U-Due', tier: 2 },
] as const;

const TIER = [
  { label: 'locale', cachet: 150_000, draw: 0.1, minCapacity: 0, minRep: 0 },
  { label: 'nazionale', cachet: 500_000, draw: 0.2, minCapacity: 30_000, minRep: 55 },
  { label: 'mondiale', cachet: 1_200_000, draw: 0.3, minCapacity: 45_000, minRep: 70 },
] as const;

export interface ConcertOffer {
  id: string;
  artist: string;
  tierLabel: string;
  cachet: number;
  draw: number;
  /** Round di lega della data: se quel round giochi IN CASA, il campo si rovina. */
  round: number;
  homeClash: boolean;
  expiresRound: number;
}

/** Licenza concerti costruita? (MODULE_STADIUM §3) */
export function concertLicensed(club: Club): boolean {
  return club.stadium.commercial.includes('concerti');
}

/**
 * La proposta del promoter al round corrente (MODULE_EVENTS §3). RNG iniettato dal
 * guscio (derivato dal seed, come le offerte sponsor): zero draw di simulazione.
 */
export function concertOfferAt(
  world: World,
  club: Club,
  season: Season,
  atRound: number,
  rng: Rng,
): ConcertOffer | null {
  if (!concertLicensed(club)) return null;
  const capacity = stadiumCapacity(club);
  const eligible = TIER.map((t, i) => i).filter(
    (i) => capacity >= TIER[i]!.minCapacity && club.reputation >= TIER[i]!.minRep,
  );
  if (eligible.length === 0) return null;
  const tierIdx = eligible[rng.int(0, eligible.length - 1)]!;
  const pool = ARTISTS.filter((a) => a.tier === tierIdx);
  const artist = pool[rng.int(0, pool.length - 1)]!;
  const t = TIER[tierIdx]!;
  // La data: 2-4 giornate più avanti. Le date scomode capitano — spesso col cachet grosso.
  const round = atRound + rng.int(2, 4);
  const homeClash = season.fixtures.some((m) => m.round === round && m.homeClubId === club.id);
  return {
    id: `concert-${season.year}-${atRound}`,
    artist: artist.name,
    tierLabel: t.label,
    cachet: Math.round(t.cachet * (0.9 + rng.uniform(0, 0.4)) * (homeClash ? 1.25 : 1)),
    draw: t.draw,
    round,
    homeClash,
    expiresRound: round,
  };
}

export interface ConcertOutcome {
  fill: number;
  gate: number;
  adCost: number;
  net: number;
  wear: boolean;
  headline: string;
}

/**
 * Accetta il concerto (MODULE_EVENTS §3): cachet + botteghino − pubblicità sul
 * ledger; se `homeClash` ritorna wear=true (il guscio chiama applyPitchWear).
 * La PUBBLICITÀ (richiesta utente) compra riempimento: pienone a pagamento.
 */
export function settleConcert(
  club: Club,
  offer: ConcertOffer,
  adLevel: 0 | 1 | 2,
  year: number,
): ConcertOutcome {
  const capacity = stadiumCapacity(club);
  const fill = Math.min(
    1,
    SUMMER.FILL_BASE +
      SUMMER.FILL_REP * (club.reputation / 100) +
      offer.draw +
      SUMMER.AD_FILL[adLevel]!,
  );
  const gate = Math.round(capacity * fill * SUMMER.TICKET);
  const adCost = Math.round(capacity * SUMMER.AD_COST_PER_SEAT[adLevel]!);
  const net = offer.cachet + gate - adCost;
  club.finances.incomes.push({
    type: 'eventi',
    amount: offer.cachet + gate,
    year,
    note: `concerto: ${offer.artist} (${Math.round(fill * 100)}% pieno)`,
  });
  if (adCost > 0) {
    club.finances.expenses.push({
      type: 'eventi',
      amount: adCost,
      year,
      note: `pubblicità concerto ${offer.artist}`,
    });
  }
  club.finances.cash += net;
  return {
    fill,
    gate,
    adCost,
    net,
    wear: offer.homeClash,
    headline: `${offer.artist} allo stadio: ${Math.round(fill * 100)}% di riempimento, netto ${(net / 1e6).toFixed(1)}M${offer.homeClash ? '. Il groundsman è FURIOSO: campo segnato per la prossima in casa.' : '.'}`,
  };
}

/** Registra la spesa del ritiro sul ledger (voce `ritiro`). */
export function payRitiro(club: Club, spot: RitiroSpot, year: number): void {
  club.finances.expenses.push({
    type: 'ritiro',
    amount: spot.cost,
    year,
    note: `${spot.name} (strutture ${spot.quality}/100)`,
  });
  club.finances.cash -= spot.cost;
}

export function ritiroById(id: string): RitiroSpot | undefined {
  return RITIRO_SPOTS.find((s) => s.id === id);
}
export function tourById(id: string): TourDestination | undefined {
  return TOUR_DESTINATIONS.find((d) => d.id === id);
}
