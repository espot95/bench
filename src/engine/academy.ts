/**
 * SETTORE GIOVANILE (GAME_DESIGN F4b, richiesta utente — fase G1): l'accademia a
 * livelli come SPESA STRATEGICA, la Primavera con la classe annuale, i giudizi
 * PARLATI dell'osservatore (mai numeri, e con l'incertezza che si affina), la
 * crescita estiva e la promozione in prima squadra (cresciuto nel club).
 *
 * I prospetti NON vivono in `world.players`: sono oggetti Player completi custoditi
 * nello stato-accademia del solo club utente (guscio), e diventano veri alla
 * promozione. Zero draw sull'RNG della simulazione: ogni decisione usa RNG locali
 * derivati da hash (club|anno) — lega e calibrazione byte-identiche.
 */

import { asContractId, asPlayerId } from '../core/ids.js';
import { computeOverall } from '../core/ratings.js';
import type { Club, Player, Position, World } from '../core/types.js';
import { generatePlayer, makeContract } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';

export const ACADEMY = {
  /** I 4 livelli: investimento una tantum, retta annua, classe estiva, qualità. */
  LEVELS: [
    { cost: 3_000_000, annual: 800_000, intake: 3, repBonus: 0, growth: 1 },
    { cost: 6_000_000, annual: 1_500_000, intake: 4, repBonus: 6, growth: 1.15 },
    { cost: 12_000_000, annual: 2_500_000, intake: 5, repBonus: 12, growth: 1.3 },
    { cost: 25_000_000, annual: 4_000_000, intake: 6, repBonus: 20, growth: 1.5 },
  ],
  MAX_PROSPECTS: 18,
  /** A 20 anni la Primavera finisce: o prima squadra, o addio. */
  LEAVE_AGE: 20,
  /** Crescita estiva: quota del gap verso il potenziale che si chiude ogni anno. */
  GROWTH_SHARE: 0.28,
  GROWTH_CAP: 7,
  /** L'occhio dell'osservatore: errore massimo il primo anno, si affina in 3. */
  SCOUT_NOISE_Y0: 9,
  SCOUT_NOISE_MIN: 2,
  /** Soglie dei giudizi PARLATI sul potenziale stimato. */
  JUDGE_PREDESTINATO: 82,
  JUDGE_DA_SEGUIRE: 74,
  JUDGE_BUONO: 66,
  /** G2 — Torneo Primavera: i MINUTI (titolari/rotazione/margine) muovono la crescita. */
  MINUTES_STARTER: 2300,
  MINUTES_ROTATION: 1300,
  MINUTES_FRINGE: 450,
  MINUTES_GROWTH_MIN: 0.75,
  MINUTES_GROWTH_MAX: 1.25,
  /** G2 — Prestito formativo: un anno "a farsi le ossa" fuori. */
  LOAN_MIN_AGE: 17,
  LOAN_GROWTH: 1.35,
  LOAN_BUST_PCT: 20, // il salto può anche ridimensionare (crescita dimezzata)
  LOAN_BUST_GROWTH: 0.5,
  /** G2 — I gioielli fanno gola: offerte AI per i migliori (17+). */
  OFFER_MAX: 2,
  OFFER_MIN_AGE: 17,
  OFFER_PER_POINT: 400_000, // € per punto di potenziale stimato sopra 55
  OFFER_MIN_FEE: 1_500_000,
  /** G3 — L'impero porta ragazzi: quota per posto-classe dai mercati esteri caldi. */
  FOREIGN_SLOT_PCT: 30,
  FOREIGN_MIN_FANS: 20_000,
} as const;

export interface AcademyProspect {
  player: Player;
  joinedYear: number;
  /** G2: minuti dell'ULTIMA stagione di Primavera (o in prestito). */
  minutes?: number;
  /** G2: in prestito formativo per la stagione `year` presso `clubName`. */
  loan?: { clubName: string; year: number };
}

export interface AcademyState {
  /** 1..4; l'accademia esiste solo se costruita (stato assente = niente vivaio). */
  level: number;
  builtYear: number;
  prospects: AcademyProspect[];
  lastIntakeYear?: number;
  /** G2: il racconto dell'ultima stagione della Primavera. */
  lastPrimavera?: PrimaveraReport;
}

export interface PrimaveraReport {
  year: number;
  /** Piazzamento nel torneo Primavera (1..16). */
  placement: number;
  topScorer?: { name: string; goals: number };
  /** Rientri dal prestito formativo: nome + com'è andata. */
  rientri: { name: string; esito: 'maturato' | 'ridimensionato' }[];
}

export interface YouthOffer {
  prospectId: string;
  prospectName: string;
  judgment: string;
  bidderName: string;
  fee: number;
}

export interface AcademyReport {
  classe: string[];
  partiti: string[];
  cresciuti: string[];
  annualCost: number;
  primavera: PrimaveraReport;
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const POSITIONS: readonly Position[] = ['GK', 'DF', 'DF', 'MF', 'MF', 'FW'];

export function levelSpec(level: number) {
  return ACADEMY.LEVELS[Math.max(0, Math.min(ACADEMY.LEVELS.length - 1, level - 1))]!;
}

/** La classe estiva: nuovi ragazzi (15-17) dal territorio, qualità dal livello. */
export function academyIntake(
  world: World,
  club: Club,
  state: AcademyState,
  year: number,
): AcademyProspect[] {
  const spec = levelSpec(state.level);
  const rng = createRng(hash32(`${club.id}|acad-intake|${year}`));
  const league = world.leagues.find((l) => l.clubIds.includes(club.id));
  const home = league?.nationId
    ? world.nations?.find((n) => n.id === league.nationId)?.homeNationality
    : undefined;
  // G3 — la rete dell'IMPERO: i mercati esteri caldi mandano ragazzi in accademia.
  const markets = Object.entries(club.foreignFans ?? {})
    .filter(([, m]) => m.fans >= ACADEMY.FOREIGN_MIN_FANS)
    .map(([nation]) => nation)
    .sort();
  const room = Math.max(0, ACADEMY.MAX_PROSPECTS - state.prospects.length);
  const arrivals: AcademyProspect[] = [];
  for (let i = 0; i < Math.min(spec.intake, room); i++) {
    const id = asPlayerId(`p-acad-${club.id}-${year}-${i}`);
    const position = POSITIONS[rng.int(0, POSITIONS.length - 1)] ?? 'MF';
    const fromEmpire =
      markets.length > 0 &&
      hash32(`${club.id}|acad-foreign|${year}|${i}`) % 100 < ACADEMY.FOREIGN_SLOT_PCT;
    const nationality = fromEmpire
      ? markets[hash32(`${club.id}|acad-fnat|${year}|${i}`) % markets.length]
      : home && rng.chance(0.75)
        ? home
        : undefined;
    const player = generatePlayer(
      rng,
      id,
      position,
      Math.min(95, club.reputation + spec.repBonus),
      rng.int(15, 17),
      nationality,
    );
    player.trainedClubId = club.id; // cresce QUI: conta per le liste (SPEC §14.2)
    arrivals.push({ player, joinedYear: year });
  }
  state.prospects.push(...arrivals);
  state.lastIntakeYear = year;
  return arrivals;
}

/**
 * Il giudizio PARLATO dell'osservatore sul ragazzo: stima del potenziale con un
 * errore che si RESTRINGE anno dopo anno (il gioiello può nascondersi tra i grezzi).
 */
export function scoutJudgment(
  p: AcademyProspect,
  year: number,
): { label: string; confidence: 'prima impressione' | 'osservato' | 'conosciuto' } {
  const yearsIn = Math.max(0, year - p.joinedYear);
  const amplitude = Math.max(ACADEMY.SCOUT_NOISE_MIN, ACADEMY.SCOUT_NOISE_Y0 - yearsIn * 2.5);
  // Rumore stabile per (ragazzo, anni in accademia): la stima non balla a caso.
  const noise = ((hash32(`${p.player.id}|scout|${yearsIn}`) % 1000) / 1000 - 0.5) * 2 * amplitude;
  const est =
    (p.player.potential ?? computeOverall(p.player.position, p.player.attributes)) + noise;
  const label =
    est >= ACADEMY.JUDGE_PREDESTINATO
      ? 'predestinato'
      : est >= ACADEMY.JUDGE_DA_SEGUIRE
        ? 'da seguire'
        : est >= ACADEMY.JUDGE_BUONO
          ? 'buon prospetto'
          : 'grezzo';
  const confidence =
    yearsIn === 0 ? 'prima impressione' : yearsIn === 1 ? 'osservato' : 'conosciuto';
  return { label, confidence };
}

/** Crescita estiva verso il potenziale: il livello dell'accademia è la leva. */
/**
 * G2 — Il torneo PRIMAVERA della stagione appena chiusa: i minuti per gerarchia
 * (titolari/rotazione/margine, dai valori veri) e il piazzamento della squadra.
 * I ragazzi in prestito giocano ALTROVE: minuti pieni, ma fuori dal torneo.
 */
export function simulatePrimavera(state: AcademyState, year: number): PrimaveraReport {
  const inHouse = state.prospects.filter((pr) => pr.loan === undefined);
  const ranked = [...inHouse].sort(
    (a, b) =>
      computeOverall(b.player.position, b.player.attributes) -
      computeOverall(a.player.position, a.player.attributes),
  );
  ranked.forEach((pr, i) => {
    const base =
      i < 11 ? ACADEMY.MINUTES_STARTER : i < 15 ? ACADEMY.MINUTES_ROTATION : ACADEMY.MINUTES_FRINGE;
    const noise = 0.85 + ((hash32(`${pr.player.id}|min|${year}`) % 1000) / 1000) * 0.3;
    pr.minutes = Math.round((base * noise) / 10) * 10;
  });
  for (const pr of state.prospects) {
    if (pr.loan) pr.minutes = Math.round((2400 * 0.9) / 10) * 10; // in prestito si gioca
  }
  // Piazzamento: la qualità media dei titolari contro il torneo (1..16, con rumore).
  const eleven = ranked.slice(0, 11);
  const avg =
    eleven.length > 0
      ? eleven.reduce((s, pr) => s + computeOverall(pr.player.position, pr.player.attributes), 0) /
        eleven.length
      : 45;
  const raw = 17 - (avg - 42) / 2.2 + ((hash32(`prim|${year}|${state.builtYear}`) % 5) - 2);
  const placement = Math.max(1, Math.min(16, Math.round(raw)));
  // Il capocannoniere del vivaio: attaccanti prima, poi i minuti.
  const scorerPool = ranked.filter((pr) => pr.player.position !== 'GK');
  const best = [...scorerPool].sort(
    (a, b) =>
      (b.player.position === 'FW' ? 1000 : 0) +
      computeOverall(b.player.position, b.player.attributes) * (b.minutes ?? 0) -
      ((a.player.position === 'FW' ? 1000 : 0) +
        computeOverall(a.player.position, a.player.attributes) * (a.minutes ?? 0)),
  )[0];
  const topScorer = best
    ? {
        name: best.player.name,
        goals: Math.max(
          2,
          Math.round(
            ((best.minutes ?? 0) / 2300) *
              ((computeOverall(best.player.position, best.player.attributes) - 38) / 3),
          ),
        ),
      }
    : undefined;
  return { year, placement, topScorer, rientri: [] };
}

export function growProspects(state: AcademyState, year: number): string[] {
  const spec = levelSpec(state.level);
  const grown: string[] = [];
  for (const pr of state.prospects) {
    const p = pr.player;
    p.age += 1;
    const overall = computeOverall(p.position, p.attributes);
    const gap = Math.max(0, (p.potential ?? overall) - overall);
    const noise = 0.7 + ((hash32(`${p.id}|grow|${year}`) % 1000) / 1000) * 0.6;
    // G2: i MINUTI muovono la crescita — chi non gioca cresce poco.
    const minuteFactor =
      pr.minutes === undefined
        ? 1
        : ACADEMY.MINUTES_GROWTH_MIN +
          (ACADEMY.MINUTES_GROWTH_MAX - ACADEMY.MINUTES_GROWTH_MIN) *
            Math.min(1, pr.minutes / ACADEMY.MINUTES_STARTER);
    // G2: il prestito formativo moltiplica... o ridimensiona (il salto è un rischio).
    const bust =
      pr.loan !== undefined && hash32(`${p.id}|loanbust|${year}`) % 100 < ACADEMY.LOAN_BUST_PCT;
    const loanFactor =
      pr.loan === undefined ? 1 : bust ? ACADEMY.LOAN_BUST_GROWTH : ACADEMY.LOAN_GROWTH;
    const bump = Math.min(
      ACADEMY.GROWTH_CAP,
      gap * ACADEMY.GROWTH_SHARE * spec.growth * noise * minuteFactor * loanFactor,
    );
    if (bump >= 0.5) {
      for (const k of Object.keys(p.attributes) as (keyof Player['attributes'])[]) {
        p.attributes[k] = Math.max(1, Math.min(99, Math.round(p.attributes[k] + bump)));
      }
      if (bump >= 3) grown.push(p.name);
    }
  }
  return grown;
}

/** G2 — Manda un ragazzo (17+) in prestito formativo per la stagione che inizia. */
export function sendOnLoan(
  world: World,
  club: Club,
  state: AcademyState,
  prospectId: string,
  year: number,
): { clubName: string } | null {
  const pr = state.prospects.find((x) => (x.player.id as string) === prospectId);
  if (!pr || pr.loan !== undefined || pr.player.age < ACADEMY.LOAN_MIN_AGE) return null;
  // La destinazione: una provinciale della seconda divisione di casa (deterministica).
  const league = world.leagues.find((l) => l.clubIds.includes(club.id));
  const lower = world.leagues.find((l) => l.nationId === league?.nationId && l.tier === 2);
  const pool = (lower ?? league)?.clubIds.filter((id) => id !== club.id) ?? [];
  const destId = pool[hash32(`${prospectId}|loan|${year}`) % Math.max(1, pool.length)];
  const clubName = (destId ? world.clubs.get(destId)?.name : undefined) ?? 'una provinciale';
  pr.loan = { clubName, year };
  return { clubName };
}

/**
 * G2 — I GIOIELLI fanno gola: fino a 2 offerte AI l'anno per i migliori (17+,
 * giudizio almeno "da seguire"). Deterministiche da club+anno; ignorarle = tenerli.
 */
export function youthOffers(
  world: World,
  club: Club,
  state: AcademyState,
  year: number,
): YouthOffer[] {
  const league = world.leagues.find((l) => l.clubIds.includes(club.id));
  const bidderPool = (league?.clubIds ?? []).filter((id) => id !== club.id);
  const eligible = state.prospects
    .filter((pr) => pr.player.age >= ACADEMY.OFFER_MIN_AGE && pr.loan === undefined)
    .map((pr) => ({ pr, j: scoutJudgment(pr, year) }))
    .filter(({ j }) => j.label === 'predestinato' || j.label === 'da seguire')
    .sort(
      (a, b) => (a.j.label === 'predestinato' ? -1 : 1) - (b.j.label === 'predestinato' ? -1 : 1),
    );
  const out: YouthOffer[] = [];
  for (const { pr, j } of eligible.slice(0, ACADEMY.OFFER_MAX)) {
    const p = pr.player;
    const est = (p.potential ?? computeOverall(p.position, p.attributes)) - (p.age - 17) * 1.5;
    const fee =
      Math.max(
        ACADEMY.OFFER_MIN_FEE,
        Math.round(((est - 55) * ACADEMY.OFFER_PER_POINT) / 100_000) * 100_000,
      ) * (j.label === 'predestinato' ? 1.5 : 1);
    const bidderId = bidderPool[hash32(`${p.id}|bid|${year}`) % Math.max(1, bidderPool.length)];
    const bidderName = (bidderId ? world.clubs.get(bidderId)?.name : undefined) ?? 'un club estero';
    out.push({
      prospectId: p.id as string,
      prospectName: p.name,
      judgment: j.label,
      bidderName,
      fee: Math.round(fee / 100_000) * 100_000,
    });
  }
  return out;
}

/** G2 — Vende il gioiello: cassa subito, PLUSVALENZA PURA a bilancio (costo zero). */
export function sellProspectDeal(
  club: Club,
  state: AcademyState,
  offer: YouthOffer,
  year: number,
): string | null {
  const idx = state.prospects.findIndex((pr) => (pr.player.id as string) === offer.prospectId);
  if (idx < 0) return null;
  const name = state.prospects[idx]!.player.name;
  state.prospects.splice(idx, 1);
  club.finances.cash += offer.fee;
  club.finances.incomes.push({
    type: 'plusvalenza',
    amount: offer.fee,
    year,
    note: `gioiello del vivaio: ${name} → ${offer.bidderName}`,
  });
  return name;
}

/** A LEAVE_AGE si esce: la Primavera non è per sempre. Ritorna i nomi partiti. */
export function pruneProspects(state: AcademyState): string[] {
  const leaving = state.prospects.filter((pr) => pr.player.age >= ACADEMY.LEAVE_AGE);
  state.prospects = state.prospects.filter((pr) => pr.player.age < ACADEMY.LEAVE_AGE);
  return leaving.map((pr) => pr.player.name);
}

/**
 * PROMOZIONE in prima squadra: il ragazzo diventa un Player VERO nel mondo, con
 * contratto da giovane e la stampella `trainedClubId` (liste: cresciuto nel club).
 */
export function promoteProspect(
  world: World,
  club: Club,
  state: AcademyState,
  prospectId: string,
  year: number,
  squadCap: number,
): Player | null {
  if (club.playerIds.length >= squadCap) return null;
  const idx = state.prospects.findIndex((pr) => (pr.player.id as string) === prospectId);
  if (idx < 0) return null;
  const pr = state.prospects[idx]!;
  const player = pr.player;
  const rng = createRng(hash32(`${player.id}|promote|${year}`));
  const contract = makeContract(
    rng,
    asContractId(`ct-acad-${player.id}-${year}`),
    player.id,
    club.id,
    year,
    club.reputation,
  );
  player.contractId = contract.id;
  player.trainedClubId = club.id;
  world.players.set(player.id, player);
  world.contracts.set(contract.id, contract);
  club.playerIds.push(player.id);
  state.prospects.splice(idx, 1);
  return player;
}

/**
 * Il giro d'ESTATE dell'accademia (advanceSeason, anno NUOVO): retta annuale,
 * crescita, uscite d'età, classe nuova. Ritorna il report per il racconto.
 */
export function settleAcademyYear(
  world: World,
  club: Club,
  state: AcademyState,
  year: number,
): AcademyReport {
  const spec = levelSpec(state.level);
  club.finances.cash -= spec.annual;
  club.finances.expenses.push({
    type: 'giovanile',
    amount: spec.annual,
    year,
    note: `accademia livello ${state.level}`,
  });
  // G2 — la stagione della Primavera appena chiusa: minuti e piazzamento...
  const primavera = simulatePrimavera(state, year);
  // ...poi la crescita (che i minuti e i prestiti muovono)...
  const cresciuti = growProspects(state, year);
  // ...e i RIENTRI dal prestito formativo (maturati o ridimensionati).
  for (const pr of state.prospects) {
    if (pr.loan === undefined) continue;
    const bust = hash32(`${pr.player.id}|loanbust|${year}`) % 100 < ACADEMY.LOAN_BUST_PCT;
    primavera.rientri.push({
      name: pr.player.name,
      esito: bust ? 'ridimensionato' : 'maturato',
    });
    pr.loan = undefined;
  }
  const partiti = pruneProspects(state);
  const classe = academyIntake(world, club, state, year).map((pr) => pr.player.name);
  state.lastPrimavera = primavera;
  return { classe, partiti, cresciuti, annualCost: spec.annual, primavera };
}
