/**
 * Sponsor come contratti veri (MODULE_SPONSORS): offerte competitive scalate su fama e
 * salute sportiva, aspettative, clausole (merch/vetrina), scommesse col prezzo sociale,
 * benefico che paga in reputazione. Solo club utente. Puro; RNG iniettato dal guscio
 * per le offerte, hash per i contratti iniziali (zero draw in worldgen).
 */

import type { ClubId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import { stadiumCapacity } from '../core/stadium.js';
import type {
  Club,
  ForeignMarket as ForeignMarketState,
  SponsorClause,
  SponsorContract,
  SponsorSlot,
  StandingRow,
  World,
} from '../core/types.js';
import { leagueOfClub, nationById } from '../core/types.js';
import { EMERGING_NATIONS } from '../generation/generate-world.js';
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
  // Mercato-obiettivo (§7): i brand GLOBALI investono in una nazione emergente —
  // trovare il giocatore è una caccia vera, e apre una fanbase che cresce negli anni.
  if (
    (brand.tier === 'multinazionale' || brand.tier === 'grande') &&
    hash01(`${seedKey}|mercato`) < 0.3
  ) {
    const nation =
      EMERGING_NATIONS[Math.floor(hash01(`${seedKey}|mnat`) * EMERGING_NATIONS.length)] ?? 'CHN';
    const pct = 0.2 + 0.1 * hash01(`${seedKey}|mpct`);
    return { kind: 'mercato', nation, bonusPct: Math.round(pct * 100) / 100 };
  }
  // Tour nel paese dell'azienda (MODULE_EVENTS §2): il brand globale vuole la squadra
  // in vetrina nel suo mercato — bonus se il tour estivo va lì.
  if (
    (brand.tier === 'multinazionale' || brand.tier === 'grande') &&
    hash01(`${seedKey}|tour`) < 0.2
  ) {
    const nation =
      EMERGING_NATIONS[Math.floor(hash01(`${seedKey}|tnat`) * EMERGING_NATIONS.length)] ?? 'USA';
    const pct = 0.1 + 0.1 * hash01(`${seedKey}|tpct`);
    return { kind: 'tour', nation, bonusPct: Math.round(pct * 100) / 100 };
  }
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
  /** MODULE_EVENTS §2: nazione del tour estivo — clausola `tour` + spinta fanbase. */
  touredNation?: string,
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
    if (c.clause?.kind === 'mercato') {
      const has = club.playerIds.some(
        (pid) => world.players.get(pid)?.nationality === (c.clause as { nation: string }).nation,
      );
      if (has) {
        post(
          c.annualValue * c.clause.bonusPct,
          `obiettivo mercato ${c.clause.nation} centrato (${c.brandName})`,
          'merch',
        );
      }
    }
    if (c.clause?.kind === 'vetrina' && position <= c.clause.target) {
      post(c.annualValue * c.clause.bonusPct, `premio vetrina ${c.brandName}`, 'sponsor');
    }
    // Tour nel paese dell'azienda (MODULE_EVENTS §2): saldato se ci sei andato davvero.
    if (c.clause?.kind === 'tour' && touredNation === c.clause.nation) {
      post(
        c.annualValue * c.clause.bonusPct,
        `bonus tour ${c.clause.nation} — ${c.brandName}`,
        'sponsor',
      );
      headlines.push(`${c.brandName} esulta: il tour in ${c.clause.nation} vale oro.`);
    }
    if (c.clause?.kind === 'benefico') {
      club.reputation = Math.min(99, club.reputation + SPONSORSHIP.CHARITY_REP_PER_SEASON);
      headlines.push(`La piazza abbraccia ${c.brandName}: il club cresce nel cuore della gente.`);
    }
  }

  // Mercati esteri (§7): crescono/decadono e pagano, sponsor o non sponsor.
  const fanbase = settleForeignFans(world, club, year, touredNation);
  headlines.push(...fanbase.lines);
  bonusPaid += fanbase.revenue;

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

// ---------------------------------------------------------------- mercati esteri (§7)

export type { ForeignMarket } from '../core/types.js';

export const FANBASE = {
  /** Crescita base a stagione — per il club PIÙ famoso, poi scala con la fama. */
  GROWTH: 60_000,
  /** Un giocatore-stella (overall ≥ 80) trascina il doppio. */
  STAR_MULT: 2,
  STAR_OVERALL: 80,
  /** Uno sponsor che investe nel mercato (clausola `mercato`) raddoppia la crescita. */
  SPONSOR_MULT: 2,
  /** Senza giocatori della nazione il mercato si raffredda e la stirpe si spezza. */
  DECAY: 0.7,
  MIN_KEEP: 3_000,
  /** Cap assoluto, scalato con la fama (il piccolo non avrà mai 5M di tifosi in Cina). */
  CAP: 5_000_000,
  /** Merchandising annuo per tifoso estero; sotto la soglia niente ricavi (anni a zero). */
  REVENUE_PER_FAN: 2,
  REVENUE_FROM: 20_000,
  /** Concorrenza: quota minima di crescita anche in un mercato affollato. */
  COMPETITION_FLOOR: 0.35,
  /** Stirpe (richiesta utente): dal 3° anno consecutivo le tue partite si vendono lì. */
  TV_STREAK_FROM: 3,
  TV_PER_STREAK: 120_000,
  TV_STREAK_CAP: 8,
  /** Tour estivo nel mercato (MODULE_EVENTS §2): crescita ×1.5 quell'anno; senza
   *  giocatori della nazione il tour SEMINA tifosi (5k × fama — il piccolo evapora). */
  TOUR_MULT: 1.5,
  TOUR_SEED: 5_000,
  /** Impero v2 — negozi del club nel territorio (MODULE_SPONSORS §7). */
  SHOP_COST: 2_000_000,
  SHOP_MERCH: 0.15,
  /** Fan club con sede: fondazione utente / auto alla fidelizzazione. */
  FANCLUB_COST: 1_000_000,
  FANCLUB_MIN_FANS: 20_000,
  FANCLUB_AUTO_FANS: 100_000,
  FANCLUB_MAX: 3,
  FANCLUB_GROWTH: 0.1,
  FANCLUB_RETENTION: 0.06,
  RETENTION_CAP: 0.92,
} as const;

/** Negozi massimi per rango del territorio (0 sotto i 20k tifosi). */
export function maxShopsFor(fans: number): number {
  if (fans >= 1_000_000) return 4;
  if (fans >= 100_000) return 2;
  if (fans >= FANBASE.REVENUE_FROM) return 1;
  return 0;
}

/** I 3 club rivali più presenti su un mercato (per la mappa dell'impero). */
export function rivalPresence(
  world: World,
  club: Club,
  nation: string,
): { clubId: ClubId; name: string; count: number; weight: number }[] {
  const out: { clubId: ClubId; name: string; count: number; weight: number }[] = [];
  for (const c of world.clubs.values()) {
    if (c.id === club.id) continue;
    const w = marketWeight(world, c, nation);
    if (w <= 0) continue;
    const count = c.playerIds.filter(
      (pid) => world.players.get(pid)?.nationality === nation,
    ).length;
    out.push({ clubId: c.id, name: c.name, count, weight: w });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}

/** Costruisce un negozio del club nel territorio (impero v2). Ritorna l'errore o null. */
export function buildShop(world: World, club: Club, nation: string, year: number): string | null {
  const m = club.foreignFans?.[nation];
  if (!m) return 'Il mercato non esiste ancora: prima si conquistano i tifosi.';
  const max = maxShopsFor(m.fans);
  if ((m.shops ?? 0) >= max)
    return max === 0
      ? 'Territorio troppo piccolo: servono almeno 20k tifosi per un negozio.'
      : 'Hai già tutti i negozi che questo territorio regge: fallo crescere.';
  m.shops = (m.shops ?? 0) + 1;
  club.finances.expenses.push({
    type: 'other',
    amount: FANBASE.SHOP_COST,
    year,
    note: `negozio del club in ${nation} (n.${m.shops})`,
  });
  club.finances.cash -= FANBASE.SHOP_COST;
  return null;
}

/** Fonda un fan club con sede nel territorio (prima della fidelizzazione automatica). */
export function foundFanClub(
  world: World,
  club: Club,
  nation: string,
  year: number,
): string | null {
  const m = club.foreignFans?.[nation];
  if (!m || m.fans < FANBASE.FANCLUB_MIN_FANS)
    return 'Troppo presto: servono almeno 20k tifosi per una sede.';
  if ((m.fanClubs ?? 0) >= FANBASE.FANCLUB_MAX) return 'Le sedi ci sono già tutte.';
  m.fanClubs = (m.fanClubs ?? 0) + 1;
  club.finances.expenses.push({
    type: 'other',
    amount: FANBASE.FANCLUB_COST,
    year,
    note: `sede fan club in ${nation} (n.${m.fanClubs})`,
  });
  club.finances.cash -= FANBASE.FANCLUB_COST;
  return null;
}

/** La fama accende il mercato: (reputazione/100)² — il piccolo resta a zero per anni. */
function fameFactor(club: Club): number {
  return (club.reputation / 100) ** 2;
}

/** Presenza di UN club su un mercato: giocatori della nazione, pesati per fama e stelle. */
function marketWeight(world: World, club: Club, nation: string): number {
  let count = 0;
  let star = false;
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    if (!p || p.nationality !== nation) continue;
    count++;
    if (playerOverall(p) >= FANBASE.STAR_OVERALL) star = true;
  }
  if (count === 0) return 0;
  return count * (star ? 1.5 : 1) * fameFactor(club);
}

/**
 * Il lungo periodo dei mercati esteri (MODULE_SPONSORS §7): NIENTE crescita a
 * prescindere — la fama accende il mercato (il piccolo resta invisibile per anni),
 * TUTTI i club del mondo competono per gli stessi tifosi (la tua quota di presenza
 * decide quanto cresci), e la STIRPE di giocatori della stessa nazione vende dal 3°
 * anno anche i diritti TV locali. Chiamata dentro settleSponsors.
 */
export function settleForeignFans(
  world: World,
  club: Club,
  year: number,
  /** MODULE_EVENTS §2: nazione del tour estivo (crescita ×TOUR_MULT, semina senza locals). */
  touredNation?: string,
): { lines: string[]; revenue: number } {
  // Normalizza il formato legacy dei salvataggi (numero secco → {fans, streak}).
  const raw = (club.foreignFans ?? {}) as Record<string, ForeignMarketState | number>;
  const fansMap: Record<string, ForeignMarketState> = {};
  for (const [nation, v] of Object.entries(raw)) {
    fansMap[nation] = typeof v === 'number' ? { fans: v, streak: 1 } : v;
  }
  const invested = new Set(
    (club.sponsors ?? [])
      .filter((c) => c.clause?.kind === 'mercato')
      .map((c) => (c.clause as { nation: string }).nation),
  );
  const squad = club.playerIds
    .map((pid) => world.players.get(pid))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  // Un giocatore di una nazione emergente APRE il mercato anche senza sponsor:
  // sarà la fama (o la sua assenza) a decidere se lì succede qualcosa.
  const markets = new Set([...Object.keys(fansMap), ...invested]);
  for (const p of squad)
    if ((EMERGING_NATIONS as readonly string[]).includes(p.nationality)) markets.add(p.nationality);
  if (touredNation) markets.add(touredNation);
  if (markets.size === 0) return { lines: [], revenue: 0 };
  const fame = fameFactor(club);
  const lines: string[] = [];
  let revenue = 0;

  for (const nation of markets) {
    const locals = squad.filter((p) => p.nationality === nation);
    const state = fansMap[nation] ?? { fans: 0, streak: 0 };
    const before = state.fans;

    if (locals.length > 0) {
      // Concorrenza (richiesta utente): la tua quota della presenza mondiale sul mercato.
      let total = 0;
      for (const c of world.clubs.values()) total += marketWeight(world, c, nation);
      const mine = marketWeight(world, club, nation);
      const share = total > 0 ? mine / total : 1;
      const competition = FANBASE.COMPETITION_FLOOR + (1 - FANBASE.COMPETITION_FLOOR) * share;

      const star = locals.some((p) => playerOverall(p) >= FANBASE.STAR_OVERALL);
      const growth =
        FANBASE.GROWTH *
        fame *
        competition *
        (star ? FANBASE.STAR_MULT : 1) *
        (invested.has(nation) ? FANBASE.SPONSOR_MULT : 1) *
        (touredNation === nation ? FANBASE.TOUR_MULT : 1) *
        // Impero v2: i fan club organizzano la piazza (MODULE_SPONSORS §7).
        (1 + FANBASE.FANCLUB_GROWTH * (state.fanClubs ?? 0));
      state.fans = Math.min(FANBASE.CAP * Math.max(0.1, fame), state.fans + growth);
      state.streak += 1;
    } else if (touredNation === nation) {
      // Il tour SEMINA il mercato anche senza giocatori (MODULE_EVENTS §2): per il
      // grande è un piede nella porta, per il piccolo i tifosi evaporano subito.
      state.fans += FANBASE.TOUR_SEED * fame;
      if (state.streak >= FANBASE.TV_STREAK_FROM)
        lines.push(`La stirpe ${nation} si interrompe: le TV locali disdicono.`);
      state.streak = 0;
    } else {
      // I fidelizzati non mollano subito: le sedi fan club ammorbidiscono la caduta.
      state.fans *= Math.min(
        FANBASE.RETENTION_CAP,
        FANBASE.DECAY + FANBASE.FANCLUB_RETENTION * (state.fanClubs ?? 0),
      );
      if (state.streak >= FANBASE.TV_STREAK_FROM)
        lines.push(`La stirpe ${nation} si interrompe: le TV locali disdicono.`);
      state.streak = 0;
    }

    if (state.fans < FANBASE.MIN_KEEP && state.streak === 0) {
      delete fansMap[nation];
      if (before >= FANBASE.MIN_KEEP)
        lines.push(`Il mercato ${nation} si è spento: i tifosi si sono dispersi.`);
      continue;
    }
    state.fans = Math.round(state.fans);
    fansMap[nation] = state;

    // Fidelizzazione automatica (impero v2): la piazza si organizza da sola.
    if (
      state.fans >= FANBASE.FANCLUB_AUTO_FANS &&
      state.streak >= FANBASE.TV_STREAK_FROM &&
      (state.fanClubs ?? 0) < FANBASE.FANCLUB_MAX
    ) {
      state.fanClubs = (state.fanClubs ?? 0) + 1;
      lines.push(
        `I tifosi di ${nation} si organizzano: nasce la sede fan club n.${state.fanClubs}.`,
      );
    }

    // Merchandising: solo da quando il mercato esiste davvero (i negozi moltiplicano).
    if (state.fans >= FANBASE.REVENUE_FROM) {
      const merch = Math.round(
        state.fans * FANBASE.REVENUE_PER_FAN * (1 + FANBASE.SHOP_MERCH * (state.shops ?? 0)),
      );
      club.finances.incomes.push({
        type: 'merch',
        amount: merch,
        year,
        note: `mercato ${nation} (${Math.round(state.fans / 1000)}k tifosi)`,
      });
      club.finances.cash += merch;
      revenue += merch;
    }
    // Stirpe → diritti TV locali (somma piccola ma interessante).
    if (state.streak >= FANBASE.TV_STREAK_FROM) {
      const tv = Math.round(
        FANBASE.TV_PER_STREAK * Math.min(state.streak, FANBASE.TV_STREAK_CAP) * (0.4 + fame),
      );
      club.finances.incomes.push({
        type: 'tv',
        amount: tv,
        year,
        note: `diritti ${nation} (stirpe: ${state.streak} stagioni)`,
      });
      club.finances.cash += tv;
      revenue += tv;
    }
    if (before < 100_000 && state.fans >= 100_000)
      lines.push(`Il mercato ${nation} decolla: 100k tifosi seguono il club.`);
    if (before < 1_000_000 && state.fans >= 1_000_000)
      lines.push(`UN MILIONE di tifosi in ${nation}: il club è un marchio globale lì.`);
  }
  club.foreignFans = fansMap;
  return { lines, revenue };
}
