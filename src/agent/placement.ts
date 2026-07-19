/**
 * Client placement + talent-war levers (MODULE_AGENT §8, GAME_DESIGN §7 leve 1-9 parziali).
 * The agent proposes HIS client to clubs: the president decides with the existing flows
 * (nothing bypasses budgets/quotas); the player weighs MINUTES (growth promise), VISIBILITY
 * and the agent's ex-player charm. Poaching a represented player costs a release penalty.
 */

import { playerOverall } from '../core/ratings.js';
import type { Club, Player, President, World } from '../core/types.js';
import { squadAverage } from '../engine/coach-styles.js';
import { signFreeAgent } from '../market/signing.js';
import { executeTransfer } from '../market/transfers.js';
import { evaluateProposal, evaluateTransferProposal } from '../president/decisions.js';
import type { Rng } from '../rng/rng.js';
import { type AgentState, hypeWageMultiplier, requiredReputation } from './career.js';

export const PLACEMENT = {
  /** An ambitious client refuses moves where he would clearly sit on the bench. */
  BENCH_MARGIN: 6,
  AMBITION_GATE: 0.6,
  /** Ex-player charm rescues marginal refusals with this probability. */
  MENTOR_SAVE: 0.35,
  /** Release penalty to poach: share of gross annual wage paid to the old agency. */
  POACH_PENALTY_PCT: 0.25,
} as const;

export interface PlacementResult {
  placed: boolean;
  clubName?: string;
  fee?: number;
  commission?: number;
  reason: string;
}

/** The growth-promise lever: would he actually PLAY there? (GAME_DESIGN §7 leva 4) */
function acceptsMinutes(
  world: World,
  player: Player,
  target: Club,
  state: AgentState,
  rng: Rng,
): boolean {
  const gap = squadAverage(world, target) - playerOverall(player);
  if (gap <= PLACEMENT.BENCH_MARGIN) return true;
  if (player.personality.ambition < PLACEMENT.AMBITION_GATE) return true;
  // Mentoring (leva 7): the famous ex-player talks him into it, sometimes.
  return state.exPlayer && rng.chance(PLACEMENT.MENTOR_SAVE);
}

/**
 * Try to place a client: scan every club (best reputation first), take the first deal the
 * president approves AND the player accepts. Commissions land in the agent's cash.
 */
export function placeClient(
  world: World,
  state: AgentState,
  player: Player,
  year: number,
  nonEuUsedIgnored: number,
  rng: Rng,
): PlacementResult {
  if (player.agencyId !== state.agencyId) return { placed: false, reason: 'Non è un tuo cliente.' };
  const presidents = new Map([...(world.presidents?.values() ?? [])].map((p) => [p.clubId, p]));
  const sellerClub = [...world.clubs.values()].find((c) => c.playerIds.includes(player.id));
  const targets = [...world.clubs.values()]
    .filter((c) => c.id !== sellerClub?.id)
    .sort((a, b) => b.reputation - a.reputation);

  for (const target of targets) {
    const pres = presidents.get(target.id) as President | undefined;
    if (!pres) continue;
    if (!acceptsMinutes(world, player, target, state, rng)) continue;

    if (sellerClub) {
      const sellerPres = presidents.get(sellerClub.id);
      const v = evaluateTransferProposal(
        world,
        target,
        pres,
        sellerClub,
        sellerPres,
        player,
        year,
        0,
        rng,
      );
      if (!v.approved) continue;
      executeTransfer(
        world,
        sellerClub,
        target,
        player,
        v.fee ?? 0,
        Math.round((v.wage ?? 0) * hypeWageMultiplier(state, player.id)),
        v.years ?? 1,
        v.commission ?? 0,
        year,
      );
      state.placementsThisSeason++;
      state.cash += v.commission ?? 0; // la fee dell'agenzia sei TU (GAME_DESIGN §3.3)
      state.ledger.push({
        year,
        type: 'signing_fee',
        amount: v.commission ?? 0,
        note: `Piazzato ${player.name} → ${target.name}`,
      });
      return {
        placed: true,
        clubName: target.name,
        fee: v.fee,
        commission: v.commission,
        reason: v.reason,
      };
    }
    const v = evaluateProposal(world, target, pres, player, year, 0, rng);
    if (!v.approved) continue;
    signFreeAgent(
      world,
      target,
      player,
      {
        wage: Math.round((v.wage ?? 0) * hypeWageMultiplier(state, player.id)),
        years: v.years ?? 1,
        commission: v.commission ?? 0,
      },
      year,
    );
    state.placementsThisSeason++;
    state.cash += v.commission ?? 0;
    state.ledger.push({
      year,
      type: 'signing_fee',
      amount: v.commission ?? 0,
      note: `Piazzato ${player.name} → ${target.name}`,
    });
    return { placed: true, clubName: target.name, commission: v.commission, reason: v.reason };
  }
  return {
    placed: false,
    reason: 'Nessun club disposto a chiudere (o il giocatore rifiuta la panchina).',
  };
}

/** Leva 2 — liberazione dall'agente attuale pagando la penale (poi serve convincerlo). */
export function poachClient(
  world: World,
  state: AgentState,
  player: Player,
  wagePct: number,
  year: number,
  rng: Rng,
): { ok: boolean; reason: string; penalty?: number } {
  if (
    player.agencyId === undefined ||
    player.agencyId === null ||
    player.agencyId === state.agencyId
  ) {
    return { ok: false, reason: 'Non è sotto mandato di un’altra agenzia.' };
  }
  const wage = player.contractId ? (world.contracts.get(player.contractId)?.wage ?? 0) : 0;
  const penalty = Math.round(wage * 52 * PLACEMENT.POACH_PENALTY_PCT);
  if (state.cash < penalty)
    return { ok: false, reason: `Serve la penale: ${(penalty / 1000).toFixed(0)}k in cassa.` };

  // Convincing him: reputation gate + loyalty resistance (leva 9: i debiti lo trattengono).
  const req = requiredReputation(player);
  const p =
    0.7 -
    (0.9 / 40) * Math.max(0, req - state.reputation) -
    0.5 * (player.personality.loyalty - 0.5);
  if (!rng.chance(Math.max(0, Math.min(0.9, p)))) {
    return { ok: false, reason: 'Resta fedele alla sua agenzia.' };
  }
  state.cash -= penalty;
  const old = world.agencies?.find((a) => a.id === player.agencyId);
  if (old) {
    old.clientIds = old.clientIds.filter((id) => id !== player.id);
  }
  player.agencyId = state.agencyId;
  world.agencies?.find((a) => a.id === state.agencyId)?.clientIds.push(player.id);
  state.mandates.push({ playerId: player.id, wagePct, endYear: year + 1 });
  return { ok: true, reason: 'Penale pagata: ora è un tuo cliente.', penalty };
}
