/**
 * Agents/agencies (SPEC §15). Creates a set of agencies and assigns every player an agent —
 * except the self-represented (professionalism ≥ 0.8, "auto-procuratore"). Higher-rated players
 * gravitate to higher-reputation (big) agencies. Deterministic given the RNG.
 *
 * Called at the *end* of world generation so the core attribute stream stays byte-identical
 * (calibration unaffected).
 */

import { type AgentId, asAgentId } from '../domain/ids.js';
import type { Agent, Player } from '../domain/types.js';
import type { Rng } from '../rng/rng.js';
import { LAST_NAMES } from './names.js';

/** Professionalism at/above which a player represents himself (SPEC §15). */
export const SELF_AGENT_THRESHOLD = 0.8;
/** Roughly one agency per this many players. */
const PLAYERS_PER_AGENT = 30;
/** Reputation at/above which an agency counts as "big" (rigid, package deals). */
const BIG_AGENCY_REP = 65;

const AGENCY_SUFFIXES = ['Sports', 'Management', '& Associati', 'Group', 'Talents'];

/** Create agencies and assign each non-self player an agent. Returns the agencies. */
export function populateAgents(players: Map<Player['id'], Player>, rng: Rng): Agent[] {
  const count = Math.max(4, Math.round(players.size / PLAYERS_PER_AGENT));
  const agents: Agent[] = [];
  for (let i = 0; i < count; i++) {
    const reputation = Math.round(clamp(rng.gaussian(55, 18), 25, 95));
    agents.push({
      id: asAgentId(`agent-${i + 1}`),
      name: `${rng.pick(LAST_NAMES)} ${rng.pick(AGENCY_SUFFIXES)}`,
      reputation,
      size: reputation >= BIG_AGENCY_REP ? 'big' : 'small',
      clientIds: [],
    });
  }
  // Sort by reputation so we can map a player's quality to a similarly-ranked agency.
  agents.sort((a, b) => b.reputation - a.reputation);

  const clientsById = new Map<AgentId, Player['id'][]>();
  for (const player of players.values()) {
    if (player.personality.professionalism >= SELF_AGENT_THRESHOLD) {
      player.agentId = null; // self-represented
      continue;
    }
    const agent = pickAgentFor(player, agents, rng);
    player.agentId = agent.id;
    const list = clientsById.get(agent.id) ?? [];
    list.push(player.id);
    clientsById.set(agent.id, list);
  }
  for (const agent of agents) agent.clientIds = clientsById.get(agent.id) ?? [];
  return agents;
}

/** Pick an agency whose standing roughly matches the player's quality (with noise). */
function pickAgentFor(player: Player, agentsByRep: Agent[], rng: Rng): Agent {
  // Map overall (~30-95) to an index in the reputation-sorted agency list, with jitter.
  const frac = clamp((95 - player.overall) / 65 + rng.gaussian(0, 0.15), 0, 1);
  const idx = clamp(Math.round(frac * (agentsByRep.length - 1)), 0, agentsByRep.length - 1);
  return agentsByRep[idx] as Agent;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
