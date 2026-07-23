/**
 * Stadio componibile — helper puri (GAME_DESIGN §6.7, docs/MODULE_STADIUM.md §1).
 * La capienza totale è sempre DERIVATA dai settori (regola §1.2: mai memorizzare
 * un derivato). Nessun I/O, nessun RNG.
 */

import type { Club, CommercialId, PriceLevel, SectorId, Stadium, StadiumSector } from './types.js';

export const SECTOR_IDS: readonly SectorId[] = [
  'principale',
  'distinti',
  'curvaNord',
  'curvaSud',
  'angoloNE',
  'angoloNO',
  'angoloSE',
  'angoloSO',
] as const;

/** Tribune e curve; gli angoli sono costruibili solo a catino (MODULE_STADIUM §1). */
export const MAIN_SECTORS: readonly SectorId[] = [
  'principale',
  'distinti',
  'curvaNord',
  'curvaSud',
] as const;

export const CORNER_SECTORS: readonly SectorId[] = [
  'angoloNE',
  'angoloNO',
  'angoloSE',
  'angoloSO',
] as const;

/** Capienza totale, derivata. */
export function stadiumCapacity(club: Pick<Club, 'stadium'>): number {
  let total = 0;
  for (const id of SECTOR_IDS) total += club.stadium.sectors[id].seats;
  return total;
}

function sector(seats: number, tiers: 1 | 2 | 3, covered: boolean): StadiumSector {
  return { seats, tiers, covered };
}

const EMPTY: StadiumSector = { seats: 0, tiers: 1, covered: false };

/**
 * Costruisce uno stadio coerente da una capienza totale (worldgen + migrazione
 * dei salvataggi legacy): riparto 45/25/15/15 su principale/distinti/curve,
 * anelli e coperture crescono con la dimensione, angoli solo nei grandi impianti.
 */
export function defaultStadium(totalSeats: number): Stadium {
  const t = Math.max(0, Math.round(totalSeats));
  const corners = t >= 40_000 ? Math.round(t * 0.04) : 0;
  const body = t - corners * 4;
  const tiers: 1 | 2 | 3 = t >= 60_000 ? 3 : t >= 15_000 ? 2 : 1;
  const coveredAll = t >= 15_000;
  const fullRoof = t >= 60_000;
  return {
    pitch: t < 1_000 ? 'terra' : 'erba',
    sectors: {
      principale: sector(Math.round(body * 0.45), tiers, t >= 3_000),
      distinti: sector(Math.round(body * 0.25), tiers, coveredAll),
      curvaNord: sector(Math.round(body * 0.15), tiers, coveredAll),
      curvaSud: sector(Math.round(body * 0.15), tiers, coveredAll),
      angoloNE: corners > 0 ? sector(corners, tiers, fullRoof) : { ...EMPTY },
      angoloNO: corners > 0 ? sector(corners, tiers, fullRoof) : { ...EMPTY },
      angoloSE: corners > 0 ? sector(corners, tiers, fullRoof) : { ...EMPTY },
      angoloSO: corners > 0 ? sector(corners, tiers, fullRoof) : { ...EMPTY },
    },
    commercial: [],
  };
}

/** Nomi default dei settori (MODULE_STADIUM §3.3); i custom in `sectorNames` vincono. */
export const SECTOR_DEFAULT_NAMES: Record<SectorId, string> = {
  principale: 'Tribuna centrale',
  distinti: 'Tribuna secondaria',
  curvaNord: 'Curva Nord',
  curvaSud: 'Curva Sud',
  angoloNE: 'Distinti Nord-Est',
  angoloNO: 'Distinti Nord-Ovest',
  angoloSE: 'Distinti Sud-Est',
  angoloSO: 'Distinti Sud-Ovest',
};

/** Nome mostrato di un settore: custom se battezzato, altrimenti default. */
export function sectorName(stadium: Stadium, id: SectorId): string {
  return stadium.sectorNames?.[id] ?? SECTOR_DEFAULT_NAMES[id];
}

/** Numero di settori costruiti e coperti (requisito della licenza concerti). */
export function coveredSectors(stadium: Stadium): number {
  return SECTOR_IDS.filter((s) => stadium.sectors[s].seats > 0 && stadium.sectors[s].covered)
    .length;
}

/** ---- Attività commerciali (MODULE_STADIUM §3) — catalogo e ricavi ---- */

export interface CommercialSpec {
  id: CommercialId;
  cost: number;
  minCapacity: number;
  minReputation: number;
  minCoveredSectors: number;
  /** Ricavo stagionale (costanti provvisorie: ricalibrare con finance-health). */
  season: (capacity: number, reputation: number, fill: number) => number;
}

export const COMMERCIALS: readonly CommercialSpec[] = [
  {
    id: 'bar',
    cost: 500_000,
    minCapacity: 0,
    minReputation: 0,
    minCoveredSectors: 0,
    season: (cap, _rep, fill) => 80_000 * ((cap * fill) / 10_000),
  },
  {
    id: 'ristorante',
    cost: 2_000_000,
    minCapacity: 8_000,
    minReputation: 0,
    minCoveredSectors: 0,
    season: (cap, _rep, fill) => 250_000 * ((cap * fill) / 10_000),
  },
  {
    id: 'hotel',
    cost: 15_000_000,
    minCapacity: 25_000,
    minReputation: 55,
    minCoveredSectors: 0,
    season: (_cap, rep) => 1_200_000 * (rep / 100),
  },
  {
    id: 'centroCommerciale',
    cost: 40_000_000,
    minCapacity: 40_000,
    minReputation: 0,
    minCoveredSectors: 0,
    season: (cap, _rep, fill) => 3_500_000 * ((cap * fill) / 20_000),
  },
  {
    id: 'teatro',
    cost: 8_000_000,
    minCapacity: 15_000,
    minReputation: 0,
    minCoveredSectors: 0,
    season: (_cap, rep) => 600_000 * (rep / 100),
  },
  {
    id: 'opera',
    cost: 20_000_000,
    minCapacity: 30_000,
    minReputation: 70,
    minCoveredSectors: 0,
    // In una piazza non di primissimo piano l'opera rende la metà.
    season: (_cap, rep) => 1_500_000 * (rep / 100) * (rep < 75 ? 0.5 : 1),
  },
  {
    id: 'concerti',
    cost: 5_000_000,
    minCapacity: 30_000,
    minReputation: 0,
    minCoveredSectors: 2,
    season: (cap) => 600_000 * (cap / 10_000),
  },
] as const;

/** Strutture del club IN CITTÀ (MODULE_STADIUM §3): l'utente sceglie il punto sulla mappa. */
export const CITY_STRUCTURES: readonly CommercialSpec[] = [
  {
    id: 'negozio',
    cost: 3_000_000,
    minCapacity: 0,
    minReputation: 0,
    minCoveredSectors: 0,
    season: (_cap, rep) => 500_000 * (rep / 100),
  },
  {
    id: 'museo',
    cost: 10_000_000,
    minCapacity: 0,
    minReputation: 65,
    minCoveredSectors: 0,
    season: (_cap, rep) => 900_000 * (rep / 100),
  },
] as const;

/** ---- Zone di tifo (MODULE_STADIUM §3.1) — deterministiche dal nome, niente RNG ---- */

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pseudo-uniforme [0,1) stabile da nome+salt (derivazione, non simulazione). */
function unit(name: string, salt: number): number {
  return (hash32(`${name}#fz${salt}`) % 10000) / 10000;
}

export interface FanZone {
  /** Offset in gradi dal centro città (stesso spazio dei CityStructure). */
  dx: number;
  dy: number;
  /** Raggio (gradi) e peso [0.4..1]. */
  r: number;
  w: number;
}

/** 4-6 quartieri di tifo per club: più reputazione ⇒ tifo più diffuso. */
export function fanZones(name: string, reputation: number): FanZone[] {
  const n = 4 + (reputation >= 70 ? 2 : reputation >= 55 ? 1 : 0);
  const zones: FanZone[] = [
    // Il quartiere storico, vicino al centro: sempre il più caldo.
    { dx: (unit(name, 0) - 0.5) * 0.02, dy: (unit(name, 1) - 0.5) * 0.02, r: 0.016, w: 1 },
  ];
  for (let i = 1; i < n; i++) {
    zones.push({
      dx: (unit(name, i * 3) - 0.5) * 0.1,
      dy: (unit(name, i * 3 + 1) - 0.5) * 0.07,
      r: 0.009 + unit(name, i * 3 + 2) * 0.014,
      w: 0.4 + unit(name, i * 7) * 0.5,
    });
  }
  return zones;
}

/** Densità di tifosi [0,1] nel punto (somma di gaussiane, clampata). */
export function fanDensityAt(name: string, reputation: number, dx: number, dy: number): number {
  let d = 0;
  for (const z of fanZones(name, reputation)) {
    const dist2 = (dx - z.dx) ** 2 + (dy - z.dy) ** 2;
    d += z.w * Math.exp(-dist2 / (2 * z.r * z.r));
  }
  return Math.min(1, d);
}

export const PRICE_LEVELS: readonly PriceLevel[] = ['popolare', 'standard', 'premium'] as const;

/** Moltiplicatore di prezzo: il premium paga solo dove il tifo è denso. */
export function priceMultiplier(price: PriceLevel, density: number): number {
  if (price === 'popolare') return 0.85;
  if (price === 'premium') return 1.35 * (0.4 + 0.6 * density);
  return 1;
}

/** Il luogo conta: periferia ~×0.6, cuore del tifo ~×1.4. */
export function locationFactor(density: number): number {
  return 0.6 + 0.8 * density;
}

/**
 * Biglietteria (MODULE_STADIUM §3.2): il prezzo muove incasso E riempimento.
 * `gate` moltiplica il prezzo del biglietto; `fillDelta` si somma al riempimento
 * (clampato dai limiti FILL in season-economy).
 */
export function ticketFactors(price: PriceLevel | undefined): { gate: number; fillDelta: number } {
  if (price === 'popolare') return { gate: 0.7, fillDelta: 0.08 };
  if (price === 'premium') return { gate: 1.4, fillDelta: -0.1 };
  return { gate: 1, fillDelta: 0 };
}

/** Ricavi stagionali di attività dello stadio + strutture in città (season-economy). */
export function commercialSeasonIncome(
  club: Pick<Club, 'stadium' | 'reputation' | 'structures' | 'name'>,
  fill: number,
): number {
  const cap = stadiumCapacity(club);
  let total = 0;
  for (const id of club.stadium.commercial) {
    const spec = COMMERCIALS.find((c) => c.id === id);
    if (!spec) continue;
    // Per le attività dello stadio la "densità" è il riempimento: premium a stadio pieno.
    const price = club.stadium.commercialPrices?.[id] ?? 'standard';
    total += spec.season(cap, club.reputation, fill) * priceMultiplier(price, fill);
  }
  for (const s of club.structures ?? []) {
    const spec = CITY_STRUCTURES.find((c) => c.id === s.id);
    if (!spec) continue;
    const density = fanDensityAt(club.name, club.reputation, s.dx, s.dy);
    total +=
      spec.season(cap, club.reputation, fill) *
      locationFactor(density) *
      priceMultiplier(s.price ?? 'standard', density);
  }
  return Math.round(total);
}
