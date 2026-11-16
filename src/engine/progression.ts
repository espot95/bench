/**
 * Off-season progression for a career: promotions/relegations (SPEC §10) + per-attribute
 * aging/personality development, retirements, and youth intake (SPEC §11). Pure +
 * RNG-injected — mutates the world in place, deterministically.
 */

import { attributeKind, clampAttr } from '../core/attributes.js';
import { type GrowthProfile, growthOf } from '../core/growth.js';
import {
  type ClubId,
  type LeagueId,
  type PlayerId,
  asContractId,
  asPlayerId,
} from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import {
  type Club,
  type League,
  type Personality,
  type Player,
  type Position,
  type StandingRow,
  type World,
  leaguesByNation,
} from '../core/types.js';
import { applyBudgetPolicy, runWorldEconomy } from '../finances/season-economy.js';
import type { ClubSeasonAccounts } from '../finances/season-economy.js';
import { settleUserSeason, syncUserBudgets } from '../finances/treasury.js';
import { SQUAD_COMPOSITION, generatePlayer, makeContract } from '../generation/generate-world.js';
import { decayRelations } from '../market/relations.js';
import type { Rng } from '../rng/rng.js';
import { COACH_DEV, coachDevBoost } from './coach-styles.js';

/** Aging/personality tuning (SPEC §11), on the 1-100 attribute scale. */
const PROGRESSION = {
  /** Attenuation of the *decline* on technical/mental attributes (physical = 1.0). */
  TECH_DECLINE_FACTOR: 0.4,
  /** Per-attribute per-year random noise, so identical players diverge. */
  NOISE_SD: 0.8,
  /** Personality effect strength on growth/decline. */
  PERSONALITY_SPAN: 0.8,
  /** Retirement: outfield players start ageing out here, keepers later. */
  RETIRE_START_OUTFIELD: 33,
  RETIRE_START_GK: 35,
  RETIRE_SLOPE: 0.15,
  /** Weak veterans (low overall) are more likely to hang up the boots. */
  WEAK_VETERAN_OVERALL: 50,
  WEAK_VETERAN_AGE: 31,
  WEAK_VETERAN_BONUS: 0.25,
  RETIRE_CERTAIN_AGE: 40,
} as const;

/**
 * Curve di carriera + realizzazione del potenziale (SPEC §11.11-§11.12), tarabili.
 * I minuti arrivano dal mondo-che-gioca (G4); mappa assente = comportamento neutro.
 */
export const GROWTH = {
  /** Minuti stagionali → moltiplicatore dei delta POSITIVI (dentro la finestra). */
  MIN_FULL: 1500,
  MIN_PART: 600,
  MULT_FULL: 1.1,
  MULT_PART: 0.85,
  MULT_BENCH: 0.5,
  /** Erosione del potenziale in finestra: quota del gap, scalata sui minuti mancanti. */
  EROSION_MINUTES: 1200,
  EROSION_SHARE: 0.2,
  /** Il professionista serio erode più lentamente: 1.3 − 0.6·professionalità. */
  EROSION_PROF_BASE: 1.3,
  EROSION_PROF_SPAN: 0.6,
  /** Chiusura della finestra: oltre windowEnd il gap si spegne del 30% l'anno. */
  WINDOW_CLOSE_SHARE: 0.3,
  /** Il potenziale non scende mai sotto overall + margine (late bloomer moderati). */
  FLOOR_MARGIN: 2,
  /** Esplosivo: ×2.5 sui delta positivi per 2 stagioni, solo se gioca (mult ≥ 0.85). */
  SURGE_MULT: 2.5,
  SURGE_YEARS: 2,
  SURGE_MIN_MULT: 0.85,
  /** Crollo del portiere anziano (hash, zero draw): da declineAge+2, P=0.15/stagione. */
  GK_CROLLO_PROB: 0.15,
  GK_CROLLO_AFTER: 2,
  GK_CROLLO_LO: 6,
  GK_CROLLO_HI: 10,
  /** Evergreen: declino tecnico quasi nullo. */
  EVERGREEN_TECH_FACTOR: 0.2,
  /** Ritiri spostati per curva. */
  RETIRE_SHIFT_EVERGREEN: 3,
  RETIRE_SHIFT_PRECOCE: -1,
} as const;

/** Clubs promoted/relegated between adjacent divisions each season. */
const PROMO_COUNT = 3;

export interface PromotionSwap {
  /** Lower division tier (the one clubs are promoted FROM / relegated TO). */
  lowerTier: number;
  promoted: ClubId[];
  relegated: ClubId[];
}

export interface OffseasonReport {
  swaps: PromotionSwap[];
  retired: { player: Player; clubId: ClubId }[];
  /** Players whose contracts the (passive) AI did not renew — they left their club (SPEC §15). */
  released: Player[];
  youthCount: number;
  /** Season accounts per club (GAME_DESIGN §6.2), settled by the finances module. */
  accounts: ClubSeasonAccounts[];
}

/**
 * Advance the world by one off-season, given the final standings of each division.
 * Ordered per SPEC §11/§15: age/develop → retire → contract renew/release → newgen →
 * promotions/relegations. Released players leave `world.players`; youth backfills the gaps, so
 * the total stays constant.
 */
export function advanceOffseason(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
  rng: Rng,
  newYear: number,
  opts: { userClubId?: ClubId; minutesByPlayer?: ReadonlyMap<PlayerId, number> } = {},
): OffseasonReport {
  // Books first: the season just played is settled on its final standings and OLD wages
  // (GAME_DESIGN §6.2, MODULE_FINANCES §1). Budgets are set at the end, on the NEW bill.
  // Il club utente vive di tesoreria per-giornata: esce dal conguaglio annuale e riceve
  // il suo conguaglio dedicato (MODULE_FINANCES §5.3).
  const accounts = runWorldEconomy(world, standingsByLeague, newYear - 1, {
    skipClubId: opts.userClubId,
  });
  if (opts.userClubId) {
    const userClub = world.clubs.get(opts.userClubId);
    if (userClub) {
      accounts.push(settleUserSeason(world, userClub, standingsByLeague, newYear - 1));
    }
  }
  trackLegacies(world, standingsByLeague);
  ageAndDevelop(world, rng, buildCoachInfluence(world, standingsByLeague), opts.minutesByPlayer);
  erodePotentials(world, opts.minutesByPlayer); // §11.12, passo 2-bis
  const retired = retire(world, rng);
  const released = renewOrRelease(world, rng, newYear, opts.userClubId);
  const youthCount = youthIntake(world, rng, newYear);
  const swaps = promoteRelegate(world, standingsByLeague);
  decayRelations(world); // i rapporti tra club si raffreddano (MODULE_MARKET §9.1)
  const presidentsByClub = new Map(
    [...(world.presidents?.values() ?? [])]
      .filter((pr) => pr.clubId !== null)
      .map((pr) => [pr.clubId as ClubId, pr]),
  );
  applyBudgetPolicy(world, accounts, presidentsByClub, { skipClubId: opts.userClubId });
  if (opts.userClubId) {
    const userClub = world.clubs.get(opts.userClubId);
    if (userClub) syncUserBudgets(world, userClub, newYear); // specchi sul bill NUOVO
  }
  return { swaps, retired, released, youthCount, accounts };
}

/**
 * Storia giocatore↔club (MODULE_STADIUM §3.3, "bandiera"): +1 stagione a tutti,
 * +1 titolo ai campioni di ogni campionato, +1 annata da protagonista agli overall ≥79.
 * Corre PRIMA di ageAndDevelop: conta il livello di fine stagione, non quello invecchiato.
 */
function trackLegacies(world: World, standingsByLeague: Map<LeagueId, StandingRow[]>): void {
  const champions = new Set<ClubId>();
  for (const league of world.leagues) {
    const top = standingsByLeague.get(league.id)?.[0];
    if (top) champions.add(top.clubId);
  }
  for (const club of world.clubs.values()) {
    const champ = champions.has(club.id);
    for (const pid of club.playerIds) {
      const p = world.players.get(pid);
      if (!p) continue;
      p.clubSeasons = (p.clubSeasons ?? 0) + 1;
      if (champ) p.titlesWithClub = (p.titlesWithClub ?? 0) + 1;
      if (playerOverall(p) >= 79) p.bigSeasons = (p.bigSeasons ?? 0) + 1;
    }
  }
}

/**
 * "Bottega" influence per club (MODULE_MANAGER §6): coach style/charisma × results factor
 * (expected rank by reputation vs final rank — the overperformer teaches more).
 */
function buildCoachInfluence(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
): Map<ClubId, (attr: string, position: Player['position'], age: number) => number> {
  const out = new Map<
    ClubId,
    (attr: string, position: Player['position'], age: number) => number
  >();
  const coaches = [...(world.managers?.values() ?? [])].filter((m) => m.clubId !== null);
  if (coaches.length === 0) return out;
  const coachByClub = new Map(coaches.map((m) => [m.clubId as ClubId, m]));

  for (const league of world.leagues) {
    const table = standingsByLeague.get(league.id);
    if (!table) continue;
    const expected = [...league.clubIds]
      .map((id) => ({ id, rep: world.clubs.get(id)?.reputation ?? 0 }))
      .sort((a, b) => b.rep - a.rep);
    const expectedRank = new Map(expected.map((e, i) => [e.id, i]));
    table.forEach((row, finalRank) => {
      const coach = coachByClub.get(row.clubId);
      if (!coach) return;
      const exp = expectedRank.get(row.clubId) ?? finalRank;
      const results = Math.max(
        COACH_DEV.RESULTS_MIN,
        Math.min(COACH_DEV.RESULTS_MAX, 1 + (0.5 * (exp - finalRank)) / 10),
      );
      const base = coachDevBoost(coach, results);
      // Preparatori atletici (MODULE_MANAGER §7): sostengono il fisico dei ≥28enni.
      const preps = (world.clubs.get(row.clubId)?.staff ?? []).filter(
        (st) => st.role === 'preparatore',
      );
      const prepQ = preps.length
        ? preps.reduce((s, st) => s + st.quality, 0) / preps.length / 100
        : 0;
      out.set(row.clubId, (attr, position, age) => {
        const physio =
          age >= 28 && (attr === 'pace' || attr === 'stamina' || attr === 'strength')
            ? 0.5 * prepQ
            : 0;
        return base(attr, position, age) + physio;
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Promotions / relegations
// ---------------------------------------------------------------------------

export function promoteRelegate(
  world: World,
  standingsByLeague: Map<LeagueId, StandingRow[]>,
): PromotionSwap[] {
  const swaps: PromotionSwap[] = [];

  // Promotions/relegations happen *within* each nation's pyramid (SPEC §14.1), never across.
  for (const pyramid of leaguesByNation(world).values()) {
    for (let t = 0; t < pyramid.length - 1; t++) {
      const upper = pyramid[t] as League;
      const lower = pyramid[t + 1] as League;
      const upperTable = standingsByLeague.get(upper.id);
      const lowerTable = standingsByLeague.get(lower.id);
      if (!upperTable || !lowerTable) continue;

      const relegated = upperTable.slice(-PROMO_COUNT).map((r) => r.clubId);
      const promoted = lowerTable.slice(0, PROMO_COUNT).map((r) => r.clubId);
      const relSet = new Set(relegated);
      const promSet = new Set(promoted);

      upper.clubIds = upper.clubIds.filter((id) => !relSet.has(id)).concat(promoted);
      lower.clubIds = lower.clubIds.filter((id) => !promSet.has(id)).concat(relegated);
      swaps.push({ lowerTier: lower.tier, promoted, relegated });
    }
  }
  return swaps;
}

// ---------------------------------------------------------------------------
// Aging & development
// ---------------------------------------------------------------------------

/**
 * Base per-attribute delta range [min, max] per età E CURVA (SPEC §11.11). Il
 * numero di draw RNG non cambia mai: cambiano solo i parametri dell'uniforme.
 */
function curveDeltaRange(age: number, g: GrowthProfile): [number, number] {
  if (age >= g.declineAge) {
    const late = age >= g.declineAge + 3;
    if (g.curve === 'evergreen') return late ? [-3, -1.5] : [-1.5, -0.5];
    return late ? [-6, -3] : [-3, -1];
  }
  switch (g.curve) {
    case 'precoce':
      return age <= 18 ? [4, 7] : age <= 21 ? [1, 3] : [0, 1];
    case 'tardivo':
      return age <= 20 ? [1, 2.5] : age <= 26 ? [2, 4] : [0, 1];
    default:
      // lineare / esplosivo / evergreen: la curva base di §11.2.
      return age <= 20 ? [3, 6] : age <= 24 ? [1, 3] : [0, 1];
  }
}

/** FNV-1a → [0,1): decisioni di progressione SENZA draw (crollo GK). */
function progHash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/** Moltiplicatore di crescita dai minuti stagionali (§11.12); undefined = neutro. */
function minutesMultiplier(minutes: number | undefined, age: number, g: GrowthProfile): number {
  if (minutes === undefined || age > g.windowEnd) return 1;
  if (minutes >= GROWTH.MIN_FULL) return GROWTH.MULT_FULL;
  if (minutes >= GROWTH.MIN_PART) return GROWTH.MULT_PART;
  return GROWTH.MULT_BENCH;
}

/**
 * Personality modifier, sign-aware: high professionalism/determination grows faster
 * (closer to potential) and declines slower. See SPEC §11 (design note).
 */
function personalityModifier(personality: Personality, isDecline: boolean): number {
  // Professionalism primary, determination secondary (SPEC §11.2).
  const trait = 0.7 * personality.professionalism + 0.3 * personality.determination;
  const span = PROGRESSION.PERSONALITY_SPAN;
  return isDecline ? 1 + span / 2 - span * trait : 1 - span / 2 + span * trait;
}

/**
 * Age one player's attributes for a new season. Physical attributes decline at full
 * rate, technical/mental far slower; personality bends the curve; noise diverges
 * identical players; growth never exceeds the player's potential. Overall is derived.
 */
export function developAttributes(
  player: Player,
  rng: Rng,
  coachBoost?: (attr: string, position: Player['position'], age: number) => number,
  /** Minuti della stagione appena chiusa (§11.12); undefined = dato assente, neutro. */
  minutes?: number,
): void {
  const g = growthOf(player);
  const [lo, hi] = curveDeltaRange(player.age, g);
  const attrs = player.attributes as unknown as Record<string, number>;

  // §11.12: i minuti realizzano la crescita; §11.11: l'esplosivo detona solo se gioca.
  const growMult = minutesMultiplier(minutes, player.age, g);
  const surge =
    g.curve === 'esplosivo' &&
    g.surgeAge !== undefined &&
    player.age >= g.surgeAge &&
    player.age < g.surgeAge + GROWTH.SURGE_YEARS &&
    growMult >= GROWTH.SURGE_MIN_MULT
      ? GROWTH.SURGE_MULT
      : 1;

  for (const key of Object.keys(attrs)) {
    let base = rng.uniform(lo, hi);
    const isDecline = base < 0;
    if (isDecline) {
      // Il declino FISICO ha la pendenza del reparto (terzini ripidi, GK dolci).
      if (attributeKind(key) === 'physical') base *= g.declineSlope;
    } else {
      base *= growMult * surge;
    }
    const techFactor =
      g.curve === 'evergreen' ? GROWTH.EVERGREEN_TECH_FACTOR : PROGRESSION.TECH_DECLINE_FACTOR;
    const category = isDecline && attributeKind(key) === 'technical' ? techFactor : 1;
    // La bottega dell'allenatore (MODULE_MANAGER §6): additiva, mai oltre il potenziale (clamp sotto).
    const bottega = coachBoost ? coachBoost(key, player.position, player.age) : 0;
    const delta =
      base * personalityModifier(player.personality, isDecline) * category +
      bottega +
      rng.gaussian(0, PROGRESSION.NOISE_SD);

    let next = (attrs[key] as number) + delta;
    if (next > (attrs[key] as number)) {
      // Growth cannot exceed the potential (nor push a specialist above himself).
      next = Math.min(next, Math.max(attrs[key] as number, player.potential));
    }
    attrs[key] = clampAttr(Math.round(next));
  }

  // Il crollo del portiere anziano (§11.11): secco, una tantum, via hash (zero draw).
  if (
    player.position === 'GK' &&
    player.age >= g.declineAge + GROWTH.GK_CROLLO_AFTER &&
    progHash01(`${player.id}|crollo|${player.age}`) < GROWTH.GK_CROLLO_PROB
  ) {
    for (const key of ['reflexes', 'oneOnOne', 'handling']) {
      if (attrs[key] === undefined) continue;
      const drop =
        GROWTH.GK_CROLLO_LO +
        progHash01(`${player.id}|crollo-k|${key}`) * (GROWTH.GK_CROLLO_HI - GROWTH.GK_CROLLO_LO);
      attrs[key] = clampAttr(Math.round((attrs[key] as number) - drop));
    }
  }

  // Overall is derived (GAME_DESIGN §1.2): nothing to update here.
}

/**
 * §11.12 — EROSIONE del potenziale: in finestra i minuti mancanti lo spengono,
 * oltre la finestra si chiude da solo («o si è fatto, o non si fa più»). Mai sotto
 * overall + FLOOR_MARGIN. Nessun draw di RNG. Mappa minuti assente = nessun effetto.
 */
export function erodePotentials(
  world: World,
  minutesByPlayer?: ReadonlyMap<PlayerId, number>,
): void {
  if (!minutesByPlayer) return;
  for (const p of world.players.values()) {
    const g = growthOf(p);
    const overall = playerOverall(p);
    const floor = overall + GROWTH.FLOOR_MARGIN;
    if (p.potential <= floor) continue;
    const gap = p.potential - overall;
    let next = p.potential;
    if (p.age > g.windowEnd) {
      next = p.potential - gap * GROWTH.WINDOW_CLOSE_SHARE;
    } else if (p.age >= g.windowStart) {
      const minutes = minutesByPlayer.get(p.id) ?? 0;
      if (minutes < GROWTH.EROSION_MINUTES) {
        const prof =
          GROWTH.EROSION_PROF_BASE - GROWTH.EROSION_PROF_SPAN * p.personality.professionalism;
        const share =
          GROWTH.EROSION_SHARE * (1 - minutes / GROWTH.EROSION_MINUTES) * Math.max(0.2, prof);
        next = p.potential - gap * share;
      }
    }
    p.potential = Math.round(Math.max(floor, next) * 10) / 10;
  }
}

export function ageAndDevelop(
  world: World,
  rng: Rng,
  influence?: Map<ClubId, (attr: string, position: Player['position'], age: number) => number>,
  minutesByPlayer?: ReadonlyMap<PlayerId, number>,
): void {
  const clubOf = new Map<string, ClubId>();
  if (influence) {
    for (const club of world.clubs.values()) {
      for (const pid of club.playerIds) clubOf.set(pid, club.id);
    }
  }
  for (const player of world.players.values()) {
    player.age += 1;
    const clubId = clubOf.get(player.id);
    const boost = clubId !== undefined ? influence?.get(clubId) : undefined;
    // NOTA: i minuti si riferiscono alla stagione appena chiusa (età pre-incremento);
    // developAttributes confronta con la finestra sull'età nuova — scarto voluto di
    // mezzo anno, irrilevante rispetto alle soglie.
    developAttributes(
      player,
      rng,
      boost,
      minutesByPlayer ? (minutesByPlayer.get(player.id) ?? 0) : undefined,
    );
  }
}

// ---------------------------------------------------------------------------
// Retirements
// ---------------------------------------------------------------------------

/** Probability a player retires this off-season, by age and (low) rating. See SPEC §11. */
export function retireProbability(
  age: number,
  position: Position,
  overall: number,
  curve?: GrowthProfile['curve'],
): number {
  if (age >= PROGRESSION.RETIRE_CERTAIN_AGE) return 1;
  const shift =
    curve === 'evergreen'
      ? GROWTH.RETIRE_SHIFT_EVERGREEN
      : curve === 'precoce'
        ? GROWTH.RETIRE_SHIFT_PRECOCE
        : 0;
  const start =
    (position === 'GK' ? PROGRESSION.RETIRE_START_GK : PROGRESSION.RETIRE_START_OUTFIELD) + shift;
  let p = age >= start ? (age - start + 1) * PROGRESSION.RETIRE_SLOPE : 0;
  if (overall < PROGRESSION.WEAK_VETERAN_OVERALL && age >= PROGRESSION.WEAK_VETERAN_AGE) {
    p += PROGRESSION.WEAK_VETERAN_BONUS;
  }
  return Math.min(1, p);
}

export function retire(world: World, rng: Rng): { player: Player; clubId: ClubId }[] {
  const clubOfPlayer = new Map<string, ClubId>();
  for (const club of world.clubs.values()) {
    for (const pid of club.playerIds) clubOfPlayer.set(pid, club.id);
  }

  const retired: { player: Player; clubId: ClubId }[] = [];
  for (const player of [...world.players.values()]) {
    const prob = retireProbability(
      player.age,
      player.position,
      playerOverall(player),
      growthOf(player).curve,
    );
    if (!rng.chance(prob)) continue;
    const clubId = clubOfPlayer.get(player.id);
    if (clubId) {
      const club = world.clubs.get(clubId);
      if (club) club.playerIds = club.playerIds.filter((id) => id !== player.id);
      retired.push({ player, clubId });
    }
    if (player.contractId) world.contracts.delete(player.contractId);
    world.players.delete(player.id);
  }
  return retired;
}

// ---------------------------------------------------------------------------
// Contract renewal / release (SPEC §15, passive AI)
// ---------------------------------------------------------------------------

const MARKET = {
  /** Max non-renewals per club per off-season (keeps churn realistic). */
  MAX_RELEASE_PER_CLUB: 2,
  /** How far below the squad average overall counts a player as "fringe". */
  WEAK_MARGIN: 8,
  /** Non-renewal probability by profile (only expiring contracts are candidates). */
  RELEASE_PROB_OLD_WEAK: 0.6,
  RELEASE_PROB_OLD: 0.3,
  RELEASE_PROB_WEAK: 0.2,
  RELEASE_PROB_OTHER: 0.04,
  RELEASE_OLD_AGE: 31,
} as const;

/**
 * Process expiring contracts with a passive AI (SPEC §15.0): renew most, let a few lapse.
 * Released players **leave `world.players`** (their gap is backfilled by youth intake, so the
 * total is unchanged); they are returned so the transfer window can offer them to the user.
 */
export function renewOrRelease(
  world: World,
  rng: Rng,
  newYear: number,
  skipClubId?: ClubId,
): Player[] {
  const released: Player[] = [];
  for (const club of world.clubs.values()) {
    const userClub = club.id === skipClubId;
    const squad = club.playerIds
      .map((id) => world.players.get(id))
      .filter((p): p is Player => p !== undefined);
    const avg = squad.reduce((s, p) => s + playerOverall(p), 0) / Math.max(1, squad.length);

    let releasedCount = 0;
    for (const pid of [...club.playerIds]) {
      const player = world.players.get(pid);
      if (!player?.contractId) continue;
      const contract = world.contracts.get(player.contractId);
      if (!contract || contract.endYear >= newYear) continue; // not expired

      // Il club dell'utente NON autorinnova (MODULE_CONTRACTS §1): chi scade senza un
      // rinnovo negoziato se ne va a parametro zero, sempre.
      if (userClub) {
        releasePlayer(world, club, player);
        released.push(player);
        continue;
      }

      if (
        releasedCount < MARKET.MAX_RELEASE_PER_CLUB &&
        rng.chance(releaseProbability(player, avg))
      ) {
        releasePlayer(world, club, player);
        released.push(player);
        releasedCount++;
      } else {
        renewContract(contract, player, newYear, rng, club.finances.cash < 0);
      }
    }
  }
  return released;
}

function releaseProbability(player: Player, squadAvg: number): number {
  const old = player.age >= MARKET.RELEASE_OLD_AGE;
  const weak = playerOverall(player) < squadAvg - MARKET.WEAK_MARGIN;
  if (old && weak) return MARKET.RELEASE_PROB_OLD_WEAK;
  if (old) return MARKET.RELEASE_PROB_OLD;
  if (weak) return MARKET.RELEASE_PROB_WEAK;
  return MARKET.RELEASE_PROB_OTHER;
}

function renewContract(
  contract: { startYear: number; endYear: number; wage: number; transferFee?: number },
  player: Player,
  newYear: number,
  rng: Rng,
  austerity: boolean,
): void {
  const term = player.age < 24 ? rng.int(3, 5) : player.age < 30 ? rng.int(2, 4) : rng.int(1, 2);
  // F2b: qui il contratto è SCADUTO → residuo a bilancio 0, il vecchio cartellino
  // non risorge sulla nuova durata (MODULE_FINANCES §6.4).
  contract.transferFee = undefined;
  contract.startYear = newYear;
  contract.endYear = newYear + term - 1;
  // Neutral drift when healthy; pay cuts when the club is in the red (MODULE_FINANCES §2).
  const mult = austerity ? rng.uniform(0.8, 0.95) : rng.uniform(0.9, 1.1);
  contract.wage = Math.max(1, Math.round(contract.wage * mult));
}

/** Remove a player from his club and from the world (he becomes a released free agent). */
function releasePlayer(world: World, club: Club, player: Player): void {
  club.playerIds = club.playerIds.filter((id) => id !== player.id);
  if (player.contractId) world.contracts.delete(player.contractId);
  if (player.agencyId && world.agencies) {
    const agent = world.agencies.find((a) => a.id === player.agencyId);
    if (agent) agent.clientIds = agent.clientIds.filter((id) => id !== player.id);
  }
  world.players.delete(player.id);
}

// ---------------------------------------------------------------------------
// Youth intake
// ---------------------------------------------------------------------------

/** Refill each squad back to the standard composition with young prospects. */
export function youthIntake(world: World, rng: Rng, year: number): number {
  let created = 0;
  for (const club of world.clubs.values()) {
    const counts = countByPosition(club, world);
    for (const [position, target] of Object.entries(SQUAD_COMPOSITION) as [Position, number][]) {
      const need = target - (counts[position] ?? 0);
      for (let i = 0; i < need; i++) {
        created++;
        addYouth(world, club, position, rng, year, created);
      }
    }
  }
  return created;
}

function addYouth(
  world: World,
  club: Club,
  position: Position,
  rng: Rng,
  year: number,
  seq: number,
): void {
  const playerId = asPlayerId(`p-y${year}-${seq}`);
  // Academy graduates skew to the nation and are club-trained (SPEC §14.2), sustaining the
  // home-grown pool across seasons. Look up the nation without throwing on minimal worlds.
  const league = world.leagues.find((l) => l.clubIds.includes(club.id));
  const home = league?.nationId
    ? world.nations?.find((n) => n.id === league.nationId)?.homeNationality
    : undefined;
  const nationality = home && rng.chance(0.7) ? home : undefined;
  const player = generatePlayer(
    rng,
    playerId,
    position,
    club.reputation,
    rng.int(16, 19),
    nationality,
  );
  player.trainedClubId = club.id;
  const contract = makeContract(
    rng,
    asContractId(`ct-y${year}-${seq}`),
    playerId,
    club.id,
    year,
    club.reputation,
  );
  player.contractId = contract.id;
  world.players.set(playerId, player);
  world.contracts.set(contract.id, contract);
  club.playerIds.push(playerId);
}

function countByPosition(club: Club, world: World): Partial<Record<Position, number>> {
  const counts: Partial<Record<Position, number>> = {};
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    if (p) counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  return counts;
}
