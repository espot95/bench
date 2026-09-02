/**
 * Sponsor come contratti veri (MODULE_SPONSORS): offerte competitive scalate su fama e
 * salute sportiva, aspettative, clausole (merch/vetrina), scommesse col prezzo sociale,
 * benefico che paga in reputazione. Solo club utente. Puro; RNG iniettato dal guscio
 * per le offerte, hash per i contratti iniziali (zero draw in worldgen).
 */

import { stadiumCapacity } from '../core/stadium.js';
import type {
  Club,
  SponsorClause,
  SponsorContract,
  SponsorSlot,
  StandingRow,
  World,
} from '../core/types.js';
import { leagueOfClub, nationById } from '../core/types.js';
import type { Rng } from '../rng/rng.js';
import { clubSeasonLines, expectedPositionByReputation } from './season-economy.js';
import {
  SPONSOR_BRANDS,
  type SponsorBrand,
  type SponsorTier,
  brandById,
} from './sponsor-brands.js';

export const SPONSORSHIP = {
  /** Quote della vecchia riga sponsor per slot (equilibrio al via). */
  SLOT_SHARE: { maglia: 0.45, tecnico: 0.3, stadio: 0.15, allenamento: 0.1 } as Record<
    SponsorSlot,
    number
  >,
  /** Moltiplicatore di valore per taglia brand. */
  TIER_MULT: { micro: 0.12, piccola: 0.3, media: 0.55, grande: 1.0, multinazionale: 1.5 } as Record<
    SponsorTier,
    number
  >,
  /** Le scommesse pagano sopra mercato… */
  BETTING_MULT: 1.35,
  /** …ma solo per club facoltosi o di massa, e col prezzo sociale. */
  BETTING_MIN_REP: 70,
  BETTING_MIN_CAPACITY: 40_000,
  BETTING_REP_COST: 1,
  BETTING_GATE_MALUS: 0.04,
  /** Il benefico non paga ma scalda la piazza. */
  CHARITY_GATE_BONUS: 0.03,
  CHARITY_REP_PER_SEASON: 1,
  /** Clausole. */
  MERCH_BONUS_MIN: 0.15,
  MERCH_BONUS_MAX: 0.25,
  SHOWCASE_BONUS_PCT: 0.2,
  /** Soddisfazione: obiettivo centrato/mancato; sotto REFUSE niente rinnovo. */
  SAT_START: 0.6,
  SAT_UP: 0.2,
  SAT_DOWN: 0.25,
  SAT_REFUSE: 0.35,
  /** Rinnovi: il "progetto" alza piano, il contento rilancia, gli altri STESSA cifra. */
  RENEW_PROJECT_RAISE: 1.05,
  RENEW_HAPPY_RAISE: 1.12,
  RENEW_HAPPY_AT: 0.7,
} as const;

/** Taglia-club dalla reputazione (tolleranza ±1 nelle offerte). */
export function clubTierIndex(reputation: number): number {
  if (reputation >= 82) return 4;
  if (reputation >= 68) return 3;
  if (reputation >= 55) return 2;
  if (reputation >= 45) return 1;
  return 0;
}

const TIER_INDEX: Record<SponsorTier, number> = {
  micro: 0,
  piccola: 1,
  media: 2,
  grande: 3,
  multinazionale: 4,
};

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/** La vecchia riga sponsor del club (posizione attesa): la base di ogni valore. */
function sponsorBaseline(world: World, club: Club): number {
  const league = leagueOfClub(world, club.id);
  const nationCode = nationById(world, league.nationId)?.code ?? 'DEFAULT';
  return clubSeasonLines(
    world,
    club,
    expectedPositionByReputation(world, club),
    league.clubIds.length,
    nationCode,
    league.tier,
  ).sponsorBase;
}

function homeNationOf(world: World, club: Club): string | undefined {
  const league = leagueOfClub(world, club.id);
  return world.nations?.find((n) => n.id === league.nationId)?.homeNationality;
}

export function bettingEligible(world: World, club: Club): boolean {
  return (
    club.reputation >= SPONSORSHIP.BETTING_MIN_REP ||
    stadiumCapacity(club) >= SPONSORSHIP.BETTING_MIN_CAPACITY
  );
}

function eligibleBrands(world: World, club: Club, slot: SponsorSlot): SponsorBrand[] {
  const clubTier = clubTierIndex(club.reputation);
  const taken = new Set((club.sponsors ?? []).map((c) => c.brandId));
  return SPONSOR_BRANDS.filter((brand) => {
    if (!brand.slots.includes(slot) || taken.has(brand.id)) return false;
    if (brand.special === 'scommesse' && !bettingEligible(world, club)) return false;
    if (brand.special === 'benefico') return true; // sempre eleggibile
    return Math.abs(TIER_INDEX[brand.tier] - clubTier) <= 1;
  });
}

function expectationFor(world: World, club: Club, brand: SponsorBrand): number {
  const expected = expectedPositionByReputation(world, club);
  const n = leagueOfClub(world, club.id).clubIds.length;
  if (brand.special === 'benefico') return 99;
  if (brand.character === 'esigente')
    return Math.max(1, Math.min(brand.tier === 'multinazionale' ? 4 : expected - 3, expected - 1));
  if (brand.character === 'progetto') return Math.min(n, expected + 1);
  return Math.min(n, expected + 3);
}

function clauseFor(
  brand: SponsorBrand,
  annualValue: number,
  seedKey: string,
  homeNation?: string,
): SponsorClause | undefined {
  if (brand.special === 'scommesse') return { kind: 'scommesse' };
  if (brand.special === 'benefico') return { kind: 'benefico' };
  // La clausola merch vende maglie NEL PAESE dello sponsor: per la nazione di casa
  // sarebbe soldi gratis (la rosa è già piena di locali) — non si offre.
  if (brand.nation && brand.nation !== homeNation && hash01(`${seedKey}|merch`) < 0.7) {
    const pct =
      SPONSORSHIP.MERCH_BONUS_MIN +
      (SPONSORSHIP.MERCH_BONUS_MAX - SPONSORSHIP.MERCH_BONUS_MIN) * hash01(`${seedKey}|pct`);
    return { kind: 'nazionalita', nation: brand.nation, bonusPct: Math.round(pct * 100) / 100 };
  }
  if (brand.showcase) {
    return { kind: 'vetrina', target: 4, bonusPct: SPONSORSHIP.SHOWCASE_BONUS_PCT };
  }
  return annualValue > 0 ? undefined : undefined;
}

function makeContract(
  world: World,
  club: Club,
  brand: SponsorBrand,
  slot: SponsorSlot,
  annualValue: number,
  years: number,
  year: number,
): SponsorContract {
  return {
    slot,
    brandId: brand.id,
    brandName: brand.name,
    annualValue,
    startYear: year,
    endYear: year + years - 1,
    expectation: expectationFor(world, club, brand),
    satisfaction: SPONSORSHIP.SAT_START,
    clause: clauseFor(
      brand,
      annualValue,
      `${club.id}|${brand.id}|${slot}`,
      homeNationOf(world, club),
    ),
  };
}

/**
 * I 4 contratti di partenza (hash, no RNG): somma ≈ la vecchia riga sponsor, scadenze
 * SFALSATE così non scadono tutti insieme. Chiamata dal guscio a inizio carriera.
 */
export function initialSponsors(world: World, club: Club, year: number): SponsorContract[] {
  const baseline = sponsorBaseline(world, club);
  const clubTier = clubTierIndex(club.reputation);
  const durations: Record<SponsorSlot, number> = {
    maglia: 2,
    tecnico: 4,
    stadio: 3,
    allenamento: 2,
  };
  const out: SponsorContract[] = [];
  for (const slot of ['maglia', 'tecnico', 'stadio', 'allenamento'] as SponsorSlot[]) {
    const pool = eligibleBrands(world, club, slot).filter(
      (br) => !br.special && TIER_INDEX[br.tier] === clubTier,
    );
    const fallback = eligibleBrands(world, club, slot).filter((br) => !br.special);
    const list = pool.length > 0 ? pool : fallback;
    if (list.length === 0) continue;
    const brand = list[Math.floor(hash01(`${club.id}|${slot}|init`) * list.length)]!;
    const value = Math.round((baseline * SPONSORSHIP.SLOT_SHARE[slot]) / 10_000) * 10_000;
    const c = makeContract(world, club, brand, slot, value, durations[slot], year);
    out.push(c);
    club.sponsors = out; // progressivo: evita che lo stesso brand prenda due slot
  }
  club.sponsors = out;
  return out;
}

export interface SponsorOffer {
  slot: SponsorSlot;
  brandId: string;
  brandName: string;
  sector: string;
  tier: SponsorTier;
  annualValue: number;
  years: number;
  expectation: number;
  clause?: SponsorClause;
  /** true = è l'incumbent che rinnova. */
  rinnovo?: boolean;
}

/**
 * Le offerte per uno slot scoperto (2-4, RNG iniettato): brand di taglia compatibile,
 * più sei famoso più i giganti si fanno avanti. L'incumbent soddisfatto rientra come
 * RINNOVO (progetto ×1.05, contento ×1.12, altrimenti STESSA cifra).
 */
export function sponsorOffersFor(
  world: World,
  club: Club,
  slot: SponsorSlot,
  year: number,
  rng: Rng,
  incumbent?: SponsorContract,
): SponsorOffer[] {
  const baseline = sponsorBaseline(world, club);
  const pool = eligibleBrands(world, club, slot).filter((br) => br.id !== incumbent?.brandId);
  const offers: SponsorOffer[] = [];

  const count = Math.min(pool.length, 2 + rng.int(0, 1));
  const shuffled = rng.shuffle(pool);
  // Ordina per vicinanza di taglia così i primi pescati sono i più credibili.
  const clubTier = clubTierIndex(club.reputation);
  shuffled.sort(
    (a, b) => Math.abs(TIER_INDEX[a.tier] - clubTier) - Math.abs(TIER_INDEX[b.tier] - clubTier),
  );
  for (const brand of shuffled.slice(0, count)) {
    let value =
      baseline *
      SPONSORSHIP.SLOT_SHARE[slot] *
      SPONSORSHIP.TIER_MULT[brand.tier] *
      rng.uniform(0.85, 1.25);
    if (brand.special === 'scommesse') value *= SPONSORSHIP.BETTING_MULT;
    if (brand.special === 'benefico') value = 0;
    const years = brand.character === 'progetto' ? rng.int(3, 5) : rng.int(2, 4);
    offers.push({
      slot,
      brandId: brand.id,
      brandName: brand.name,
      sector: brand.sector,
      tier: brand.tier,
      annualValue: Math.round(value / 10_000) * 10_000,
      years,
      expectation: expectationFor(world, club, brand),
      clause: clauseFor(
        brand,
        value,
        `${club.id}|${brand.id}|${slot}|${year}`,
        homeNationOf(world, club),
      ),
    });
  }

  // Il rinnovo dell'incumbent (MODULE_SPONSORS §3), se non è rimasto scottato.
  if (incumbent && incumbent.satisfaction >= SPONSORSHIP.SAT_REFUSE) {
    const brand = brandById(incumbent.brandId);
    if (brand) {
      const raise =
        brand.character === 'progetto'
          ? SPONSORSHIP.RENEW_PROJECT_RAISE
          : incumbent.satisfaction >= SPONSORSHIP.RENEW_HAPPY_AT
            ? SPONSORSHIP.RENEW_HAPPY_RAISE
            : 1.0;
      offers.push({
        slot,
        brandId: brand.id,
        brandName: brand.name,
        sector: brand.sector,
        tier: brand.tier,
        annualValue: Math.round((incumbent.annualValue * raise) / 10_000) * 10_000,
        years: brand.character === 'progetto' ? 4 : 3,
        expectation: expectationFor(world, club, brand),
        clause: incumbent.clause,
        rinnovo: true,
      });
    }
  }
  return offers.sort((a, b) => b.annualValue - a.annualValue);
}

/** Firma: sostituisce il contratto dello slot. Le scommesse costano reputazione SUBITO. */
export function signSponsor(
  world: World,
  club: Club,
  offer: SponsorOffer,
  year: number,
): SponsorContract {
  const contract: SponsorContract = {
    slot: offer.slot,
    brandId: offer.brandId,
    brandName: offer.brandName,
    annualValue: offer.annualValue,
    startYear: year,
    endYear: year + offer.years - 1,
    expectation: offer.expectation,
    satisfaction: SPONSORSHIP.SAT_START,
    clause: offer.clause,
  };
  club.sponsors = [...(club.sponsors ?? []).filter((c) => c.slot !== offer.slot), contract];
  if (offer.clause?.kind === 'scommesse') {
    club.reputation = Math.max(1, club.reputation - SPONSORSHIP.BETTING_REP_COST);
  }
  return contract;
}

/** Moltiplicatore sul botteghino dagli sponsor attivi (scommesse −, benefico +). */
export function sponsorGateMultiplier(club: Club): number {
  let mult = 1;
  for (const c of club.sponsors ?? []) {
    if (c.clause?.kind === 'scommesse') mult *= 1 - SPONSORSHIP.BETTING_GATE_MALUS;
    if (c.clause?.kind === 'benefico') mult *= 1 + SPONSORSHIP.CHARITY_GATE_BONUS;
  }
  return mult;
}

export interface SponsorSettleResult {
  /** Contratti scaduti (slot da rimettere sul mercato). */
  expired: SponsorContract[];
  headlines: string[];
  /** Bonus clausole pagati (per il riepilogo). */
  bonusPaid: number;
}

/**
 * Conguaglio sponsor (MODULE_SPONSORS §5): soddisfazione su obiettivo, clausole
 * (merch/vetrina) a ledger, benefico che paga in reputazione, scadenze.
 */
export function settleSponsors(
  world: World,
  club: Club,
  table: readonly StandingRow[],
  year: number,
): SponsorSettleResult {
  const contracts = club.sponsors ?? [];
  if (contracts.length === 0) return { expired: [], headlines: [], bonusPaid: 0 };
  const position = Math.max(1, table.findIndex((r) => r.clubId === club.id) + 1);
  const headlines: string[] = [];
  let bonusPaid = 0;

  const post = (amount: number, note: string, type: 'merch' | 'sponsor') => {
    const v = Math.round(amount);
    if (v <= 0) return;
    club.finances.incomes.push({ type, amount: v, year, note });
    club.finances.cash += v;
    bonusPaid += v;
  };

  for (const c of contracts) {
    // Soddisfazione: l'obiettivo dichiarato incontra la classifica.
    if (c.expectation < 99) {
      c.satisfaction = Math.min(
        1,
        Math.max(
          0,
          c.satisfaction + (position <= c.expectation ? SPONSORSHIP.SAT_UP : -SPONSORSHIP.SAT_DOWN),
        ),
      );
    }
    // Clausole.
    if (c.clause?.kind === 'nazionalita') {
      const has = club.playerIds.some(
        (pid) => world.players.get(pid)?.nationality === (c.clause as { nation: string }).nation,
      );
      if (has) {
        post(
          c.annualValue * c.clause.bonusPct,
          `merchandising ${c.brandName} (${c.clause.nation} in rosa)`,
          'merch',
        );
      }
    }
    if (c.clause?.kind === 'vetrina' && position <= c.clause.target) {
      post(c.annualValue * c.clause.bonusPct, `premio vetrina ${c.brandName}`, 'sponsor');
    }
    if (c.clause?.kind === 'benefico') {
      club.reputation = Math.min(99, club.reputation + SPONSORSHIP.CHARITY_REP_PER_SEASON);
      headlines.push(`La piazza abbraccia ${c.brandName}: il club cresce nel cuore della gente.`);
    }
  }

  const expired = contracts.filter((c) => c.endYear <= year);
  club.sponsors = contracts.filter((c) => c.endYear > year);
  for (const c of expired) {
    if (c.satisfaction < SPONSORSHIP.SAT_REFUSE) {
      headlines.push(
        `${c.brandName.toUpperCase()} SCARICA IL CLUB: "le aspettative erano altre". Lo slot ${c.slot} è scoperto.`,
      );
    } else {
      headlines.push(`Contratto ${c.slot} con ${c.brandName} in scadenza: si apre il mercato.`);
    }
  }
  return { expired, headlines, bonusPaid };
}
