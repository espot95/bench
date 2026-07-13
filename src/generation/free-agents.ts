/**
 * Free-agent pool for the transfer window (SPEC §15). The pool the user sees = players the AI
 * just released + freshly generated prospects. Realistic quality: mostly squad-fillers, rare gems.
 * Prospects are NOT added to `world.players`; they materialise only if the user signs them.
 */

import { asPlayerId } from '../domain/ids.js';
import { type Agent, POSITIONS, type Player, type World } from '../domain/types.js';
import type { Rng } from '../rng/rng.js';
import { SELF_AGENT_THRESHOLD } from './agents.js';
import { generatePlayer } from './generate-world.js';

const POOL = {
  /** Freshly generated prospects added to the window pool. */
  PROSPECTS: 40,
  /** Prospect reputation centre — modest, with a light upper tail for the odd gem. */
  REP_MEAN: 38,
  REP_SD: 11,
  REP_MIN: 20,
  REP_MAX: 72,
  AGE_MEAN: 24,
  AGE_SD: 4.5,
} as const;

/**
 * Build the transfer-window pool: the just-released players plus generated prospects.
 * `year` seeds stable prospect ids; `released` are the real players the AI let go.
 */
export function buildFreeAgentPool(
  world: World,
  rng: Rng,
  year: number,
  released: Player[] = [],
): Player[] {
  const prospects: Player[] = [];
  for (let i = 0; i < POOL.PROSPECTS; i++) {
    const reputation = Math.round(
      clamp(rng.gaussian(POOL.REP_MEAN, POOL.REP_SD), POOL.REP_MIN, POOL.REP_MAX),
    );
    const age = Math.round(clamp(rng.gaussian(POOL.AGE_MEAN, POOL.AGE_SD), 17, 34));
    const position = rng.pick(POSITIONS);
    const player = generatePlayer(rng, asPlayerId(`fa-${year}-${i}`), position, reputation, age);
    assignPoolAgent(player, world, rng);
    prospects.push(player);
  }
  return [...released, ...prospects];
}

/** Free-agent prospects self-represent if very professional, else get a (usually small) agency. */
function assignPoolAgent(player: Player, world: World, rng: Rng): void {
  if (player.personality.professionalism >= SELF_AGENT_THRESHOLD) {
    player.agentId = null;
    return;
  }
  const agents = world.agents ?? [];
  if (agents.length === 0) {
    player.agentId = null;
    return;
  }
  // Free agents skew to small agencies; fall back to any agency.
  const small = agents.filter((a: Agent) => a.size === 'small');
  const pool = small.length > 0 ? small : agents;
  player.agentId = (rng.pick(pool) as Agent).id;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
