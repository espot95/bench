/**
 * Agent career — mandates and the season cycle (MODULE_AGENT, GAME_DESIGN §3.3/§6.3).
 * The user's agency is a REAL Agency in the world; client links live on Player.agencyId,
 * so the existing contract flows route commissions naturally. Pure + RNG-injected.
 */

import { asAgencyId } from '../core/ids.js';
import type { AgencyId, PlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type { Player, World } from '../core/types.js';
import { agencyCommissionFor } from '../market/value.js';
import type { Rng } from '../rng/rng.js';
import { observePlayer } from '../scouting/report.js';

export type AgentArchetype = 'novizio' | 'esperto' | 'ex-calciatore';

export const AGENT = {
  ARCHETYPES: {
    novizio: { reputation: 8, cash: 200_000, exPlayer: false },
    esperto: { reputation: 55, cash: 2_000_000, exPlayer: false },
    'ex-calciatore': { reputation: 35, cash: 800_000, exPlayer: true },
  } as Record<AgentArchetype, { reputation: number; cash: number; exPlayer: boolean }>,
  /** Mandate acceptance (MODULE_AGENT §3). */
  ACCEPT_BASE: 0.85,
  REQ_SLOPE: 1.6,
  REQ_MIN: 5,
  REQ_MAX: 90,
  SHORTFALL_K: 0.9 / 40,
  PCT_K: 2.2,
  AMBITION_K: 0.25,
  EX_PLAYER_BONUS: 0.1,
  PCT_MIN: 0.05,
  PCT_MAX: 0.12,
  /** Churn at mandate expiry (MODULE_AGENT §4). */
  KEEP_REQ_FACTOR: 0.8,
  /** Reputation drift toward portfolio quality. */
  REP_DRIFT: 0.15,
  TOP_FLIGHT_BONUS: 8,
  EMPTY_DECAY: 1,
} as const;

export interface Mandate {
  playerId: PlayerId;
  wagePct: number;
  endYear: number;
}

export interface AgentLedgerEntry {
  year: number;
  type: 'wage_cut' | 'signing_fee';
  amount: number;
  note: string;
}

export interface AgentState {
  agencyId: AgencyId;
  archetype: AgentArchetype;
  reputation: number;
  cash: number;
  exPlayer: boolean;
  mandates: Mandate[];
  ledger: AgentLedgerEntry[];
  /** Pending potential bets, applied at the next settle (MODULE_AGENT §7). */
  investments: Investment[];
  /** Relazioni/agganci (MODULE_AGENT §9): la valuta della manipolazione. */
  agganci: number;
  /** Livello hype per cliente [1..3]. */
  hype: Map<PlayerId, number>;
  /** Piazzamenti riusciti da inizio stagione (→ agganci al settle). */
  placementsThisSeason: number;
}

/** Create the user's agency inside the world and the local career state. */
export function startAgentCareer(world: World, archetype: AgentArchetype): AgentState {
  const def = AGENT.ARCHETYPES[archetype];
  const agencyId = asAgencyId('agency-user');
  if (!world.agencies?.some((a) => a.id === agencyId)) {
    world.agencies = world.agencies ?? [];
    world.agencies.push({
      id: agencyId,
      name: 'La tua agenzia',
      reputation: def.reputation,
      size: 'small',
      clientIds: [],
      staff: [],
    });
  }
  return {
    agencyId,
    archetype,
    reputation: def.reputation,
    cash: def.cash,
    exPlayer: def.exPlayer,
    mandates: [],
    ledger: [],
    investments: [],
    agganci: HYPE.START[archetype],
    hype: new Map(),
    placementsThisSeason: 0,
  };
}

/** Players with NO agent at all (`agencyId === undefined`) — the hunting ground. */
export function agentlessPlayers(world: World): Player[] {
  return [...world.players.values()].filter((p) => p.agencyId === undefined);
}

/** Required agent reputation to be heard by a player of this quality (MODULE_AGENT §3). */
export function requiredReputation(player: Player): number {
  const quality = (playerOverall(player) + player.potential) / 2;
  return Math.max(AGENT.REQ_MIN, Math.min(AGENT.REQ_MAX, AGENT.REQ_SLOPE * (quality - 40)));
}

export interface MandateTerms {
  wagePct: number;
  years: number;
}

export interface MandateOutcome {
  accepted: boolean;
  reason: string;
}

/** Propose a representation mandate to an agentless player (MODULE_AGENT §3). */
export function proposeMandate(
  world: World,
  state: AgentState,
  player: Player,
  terms: MandateTerms,
  year: number,
  rng: Rng,
): MandateOutcome {
  if (player.agencyId !== undefined) {
    return { accepted: false, reason: 'Ha già chi lo rappresenta.' };
  }
  const pct = Math.max(AGENT.PCT_MIN, Math.min(AGENT.PCT_MAX, terms.wagePct));
  const req = requiredReputation(player);
  const p =
    AGENT.ACCEPT_BASE -
    AGENT.SHORTFALL_K * Math.max(0, req - state.reputation) -
    AGENT.PCT_K * (pct - AGENT.PCT_MIN) -
    AGENT.AMBITION_K * (player.personality.ambition - 0.5) +
    (state.exPlayer ? AGENT.EX_PLAYER_BONUS : 0);
  const prob = Math.max(0, Math.min(0.97, p));
  if (!rng.chance(prob)) {
    return {
      accepted: false,
      reason:
        state.reputation < req
          ? 'Non si fida: la tua agenzia è troppo piccola per lui.'
          : 'Ha rifiutato le condizioni.',
    };
  }
  player.agencyId = state.agencyId;
  const agency = world.agencies?.find((a) => a.id === state.agencyId);
  if (agency) agency.clientIds.push(player.id);
  state.mandates.push({
    playerId: player.id,
    wagePct: pct,
    endYear: year + Math.max(1, Math.min(3, terms.years)) - 1,
  });
  return { accepted: true, reason: 'Mandato firmato.' };
}

export interface SeasonDigest {
  wageCuts: number;
  signingFees: number;
  lost: string[];
  expired: string[];
}

/**
 * Post-offseason agency bookkeeping (MODULE_AGENT §4): collect income on the season just
 * played, clean dead mandates, run expiry churn, drift reputation.
 * Call AFTER advanceOffseason for `newYear` (contracts renewed with startYear === newYear).
 */
export function settleAgentSeason(
  world: World,
  state: AgentState,
  newYear: number,
  rng: Rng,
): SeasonDigest {
  const digest: SeasonDigest = { wageCuts: 0, signingFees: 0, lost: [], expired: [] };
  const keep: Mandate[] = [];

  for (const mandate of state.mandates) {
    const player = world.players.get(mandate.playerId);
    if (!player || player.agencyId !== state.agencyId) {
      digest.lost.push(player?.name ?? 'ritirato/rilasciato');
      continue; // retired, released or otherwise gone from the books
    }
    const contract = player.contractId ? world.contracts.get(player.contractId) : undefined;
    if (contract) {
      const cut = Math.round(contract.wage * 52 * mandate.wagePct);
      state.cash += cut;
      digest.wageCuts += cut;
      state.ledger.push({ year: newYear - 1, type: 'wage_cut', amount: cut, note: player.name });
      if (contract.startYear === newYear) {
        const fee = agencyCommissionFor(contract.wage, true);
        state.cash += fee;
        digest.signingFees += fee;
        state.ledger.push({
          year: newYear - 1,
          type: 'signing_fee',
          amount: fee,
          note: `Rinnovo ${player.name}`,
        });
      }
    }

    if (mandate.endYear < newYear) {
      // Expiry churn: stays if you are (nearly) big enough for him, tempered by loyalty.
      const stayP =
        state.reputation >= requiredReputation(player) * AGENT.KEEP_REQ_FACTOR
          ? 0.75 + 0.2 * (player.personality.loyalty - 0.5)
          : 0.25 + 0.3 * (player.personality.loyalty - 0.5);
      if (rng.chance(Math.max(0.05, Math.min(0.95, stayP)))) {
        keep.push({ ...mandate, endYear: newYear + 1 }); // renewed for 2 more seasons
      } else {
        player.agencyId = undefined;
        const agency = world.agencies?.find((a) => a.id === state.agencyId);
        if (agency) agency.clientIds = agency.clientIds.filter((id) => id !== player.id);
        digest.expired.push(player.name);
      }
    } else {
      keep.push(mandate);
    }
  }
  state.mandates = keep;

  // Reputation drifts toward the portfolio you actually represent (MODULE_AGENT §4.5).
  const clients = state.mandates
    .map((m) => world.players.get(m.playerId))
    .filter((p): p is Player => p !== undefined);
  if (clients.length === 0) {
    state.reputation = Math.max(5, state.reputation - AGENT.EMPTY_DECAY);
  } else {
    const topFlight = world.leagues.filter((l) => l.tier === 1).flatMap((l) => l.clubIds);
    const inTop = clients.some((c) =>
      topFlight.some((id) => world.clubs.get(id)?.playerIds.includes(c.id)),
    );
    const score =
      clients.reduce((s, c) => s + playerOverall(c), 0) / clients.length +
      (inTop ? AGENT.TOP_FLIGHT_BONUS : 0);
    state.reputation = Math.max(
      5,
      Math.min(95, state.reputation + AGENT.REP_DRIFT * (score - state.reputation)),
    );
  }
  // Sync the world-side agency reputation (used by future negotiation flows).
  const agency = world.agencies?.find((a) => a.id === state.agencyId);
  if (agency) agency.reputation = Math.round(state.reputation);
  return digest;
}

// ---------------------------------------------------------------------------
// Fase 3b — scouts & the potential bet (MODULE_AGENT §7)
// ---------------------------------------------------------------------------

export const AGENT_3B = {
  SCOUT_SALARY: 300_000,
  SCOUT_COVERAGE: 15,
  INVEST_MIN: 200_000,
  INVEST_MAX: 600_000,
  INVEST_POINTS_PER: 200_000, // +1 attribute point per 200k, max +3
  INVEST_MAX_AGE: 21,
} as const;

export interface Investment {
  playerId: PlayerId;
  amount: number;
}

/** Hire an observer into the user's agency staff (cash allowing). */
export function hireScout(world: World, state: AgentState, name: string): boolean {
  if (state.cash < AGENT_3B.SCOUT_SALARY) return false;
  const agency = world.agencies?.find((a) => a.id === state.agencyId);
  if (!agency) return false;
  agency.staff.push({
    id: `staff-user-${agency.staff.length + 1}` as never,
    name,
    role: 'scout',
    reputation: 50,
  });
  return true;
}

/** The potential bet (MODULE_AGENT §7): spend on a young client's development. */
export function investInClient(
  world: World,
  state: AgentState,
  player: Player,
  amount: number,
): { ok: boolean; reason: string } {
  const clamped = Math.max(AGENT_3B.INVEST_MIN, Math.min(AGENT_3B.INVEST_MAX, amount));
  if (player.agencyId !== state.agencyId) return { ok: false, reason: 'Non è un tuo cliente.' };
  if (player.age > AGENT_3B.INVEST_MAX_AGE) {
    return { ok: false, reason: 'Troppo vecchio per la scommessa (max 21).' };
  }
  if (playerOverall(player) >= player.potential) {
    return { ok: false, reason: 'Ha già raggiunto il suo tetto.' };
  }
  if (state.cash < clamped) return { ok: false, reason: 'Cassa insufficiente.' };
  state.cash -= clamped;
  state.investments.push({ playerId: player.id, amount: clamped });
  return { ok: true, reason: `Investiti ${(clamped / 1000).toFixed(0)}k sul suo sviluppo.` };
}

/** Key attributes to sharpen, by position (the craft his role lives on). */
const INVEST_ATTRS: Record<Player['position'], string[]> = {
  GK: ['reflexes', 'handling', 'positioning'],
  DF: ['marking', 'tackling', 'positioning'],
  MF: ['passing', 'decisions', 'stamina'],
  FW: ['finishing', 'pace', 'composure'],
};

/**
 * 3b season-side effects, to run right after settleAgentSeason: pay scout salaries,
 * auto-observe with each scout, apply the potential-bet bumps. Returns a mini digest.
 */
export function settleAgentExtras(
  world: World,
  state: AgentState,
  scoutState: import('../scouting/report.js').ScoutingState,
  year: number,
  rng: Rng,
): { scoutWages: number; observed: number; developed: string[] } {
  const agency = world.agencies?.find((a) => a.id === state.agencyId);
  const scouts = agency?.staff.filter((s) => s.role === 'scout') ?? [];
  const scoutWages = scouts.length * AGENT_3B.SCOUT_SALARY;
  state.cash -= scoutWages;

  let observed = 0;
  if (scouts.length > 0) {
    const targets = agentlessPlayers(world)
      .sort((a, b) => requiredReputation(a) - requiredReputation(b))
      .slice(0, scouts.length * AGENT_3B.SCOUT_COVERAGE);
    for (const p of targets) {
      observePlayer(scoutState, p, world, year, rng);
      observed++;
    }
  }

  const developed: string[] = [];
  for (const inv of state.investments) {
    const p = world.players.get(inv.playerId);
    if (!p) continue;
    const points = Math.min(3, Math.max(1, Math.round(inv.amount / AGENT_3B.INVEST_POINTS_PER)));
    const attrs = p.attributes as unknown as Record<string, number>;
    let applied = 0;
    for (const key of INVEST_ATTRS[p.position]) {
      if (typeof attrs[key] !== 'number') continue;
      if (playerOverall(p) >= p.potential) break; // mai oltre il tetto (GAME_DESIGN §7)
      attrs[key] = Math.min(100, (attrs[key] as number) + points);
      applied++;
      if (applied >= 3) break;
    }
    if (applied > 0) developed.push(p.name);
  }
  state.investments = [];
  return { scoutWages, observed, developed };
}

// ---------------------------------------------------------------------------
// Fase 3d — agganci, hype e bolle (MODULE_AGENT §9, GAME_DESIGN §7)
// ---------------------------------------------------------------------------

export const HYPE = {
  START: { novizio: 0, esperto: 3, 'ex-calciatore': 2 } as Record<AgentArchetype, number>,
  MAX_LEVEL: 3,
  COST_PER_LEVEL: 2,
  WAGE_BOOST: 0.15,
  BURST_P: 0.25,
  BURST_REP: 6,
} as const;

/** Pump a client's perceived value (needs agganci: the novice is "transparent"). */
export function hypeClient(state: AgentState, player: Player): { ok: boolean; reason: string } {
  if (player.agencyId !== state.agencyId) return { ok: false, reason: 'Non è un tuo cliente.' };
  const level = state.hype.get(player.id) ?? 0;
  if (level >= HYPE.MAX_LEVEL) return { ok: false, reason: 'Hype già al massimo.' };
  const cost = HYPE.COST_PER_LEVEL * (level + 1);
  if (state.agganci < cost) {
    return {
      ok: false,
      reason: `Servono ${cost} agganci (ne hai ${state.agganci}): sei ancora trasparente.`,
    };
  }
  state.agganci -= cost;
  state.hype.set(player.id, level + 1);
  return { ok: true, reason: `La stampa inizia a parlarne (hype ${level + 1}/3).` };
}

/** Wage multiplier the hype buys at placement time. */
export function hypeWageMultiplier(state: AgentState, playerId: PlayerId): number {
  return 1 + HYPE.WAGE_BOOST * (state.hype.get(playerId) ?? 0);
}

/** Season tail: earn agganci, roll bubble bursts. Call after settleAgentExtras. */
export function settleHype(
  world: World,
  state: AgentState,
  rng: Rng,
): { earned: number; bursts: string[] } {
  let earned = state.placementsThisSeason;
  state.placementsThisSeason = 0;
  const topFlight = new Set(world.leagues.filter((l) => l.tier === 1).flatMap((l) => l.clubIds));
  const topClients = state.mandates.filter((m) => {
    const p = world.players.get(m.playerId);
    return p && [...topFlight].some((id) => world.clubs.get(id)?.playerIds.includes(p.id));
  }).length;
  earned += Math.min(2, topClients);
  state.agganci += earned;

  const bursts: string[] = [];
  for (const [pid, level] of [...state.hype]) {
    if (level <= 0) continue;
    if (rng.chance(HYPE.BURST_P * level)) {
      state.hype.delete(pid);
      state.reputation = Math.max(5, state.reputation - HYPE.BURST_REP * level);
      state.agganci = Math.max(0, state.agganci - 1);
      bursts.push(world.players.get(pid)?.name ?? '(ex cliente)');
    }
  }
  return { earned, bursts };
}
