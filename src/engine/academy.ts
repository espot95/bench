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
} as const;

export interface AcademyProspect {
  player: Player;
  joinedYear: number;
}

export interface AcademyState {
  /** 1..4; l'accademia esiste solo se costruita (stato assente = niente vivaio). */
  level: number;
  builtYear: number;
  prospects: AcademyProspect[];
  lastIntakeYear?: number;
}

export interface AcademyReport {
  classe: string[];
  partiti: string[];
  cresciuti: string[];
  annualCost: number;
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
  const room = Math.max(0, ACADEMY.MAX_PROSPECTS - state.prospects.length);
  const arrivals: AcademyProspect[] = [];
  for (let i = 0; i < Math.min(spec.intake, room); i++) {
    const id = asPlayerId(`p-acad-${club.id}-${year}-${i}`);
    const position = POSITIONS[rng.int(0, POSITIONS.length - 1)] ?? 'MF';
    const nationality = home && rng.chance(0.75) ? home : undefined;
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
export function growProspects(state: AcademyState, year: number): string[] {
  const spec = levelSpec(state.level);
  const grown: string[] = [];
  for (const pr of state.prospects) {
    const p = pr.player;
    p.age += 1;
    const overall = computeOverall(p.position, p.attributes);
    const gap = Math.max(0, (p.potential ?? overall) - overall);
    const noise = 0.7 + ((hash32(`${p.id}|grow|${year}`) % 1000) / 1000) * 0.6;
    const bump = Math.min(ACADEMY.GROWTH_CAP, gap * ACADEMY.GROWTH_SHARE * spec.growth * noise);
    if (bump >= 0.5) {
      for (const k of Object.keys(p.attributes) as (keyof Player['attributes'])[]) {
        p.attributes[k] = Math.max(1, Math.min(99, Math.round(p.attributes[k] + bump)));
      }
      if (bump >= 3) grown.push(p.name);
    }
  }
  return grown;
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
  const cresciuti = growProspects(state, year);
  const partiti = pruneProspects(state);
  const classe = academyIntake(world, club, state, year).map((pr) => pr.player.name);
  return { classe, partiti, cresciuti, annualCost: spec.annual };
}
