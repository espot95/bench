/**
 * Managers and presidents (GAME_DESIGN §3.1-§3.2): one of each per club, with the shared
 * personality system (§5). DATA ONLY in Fase 0 — no AI behaviour, no effects.
 *
 * Called at the end of world generation (after players/agencies) so the core attribute
 * stream stays byte-identical — calibration unaffected.
 */

import {
  type ClubId,
  type ManagerId,
  type PresidentId,
  asManagerId,
  asPresidentId,
} from '../core/ids.js';
import type { Club, Manager, Personality, President } from '../core/types.js';
import type { Rng } from '../rng/rng.js';
import { FIRST_NAMES, LAST_NAMES } from './names.js';

/** Share of managers who are former players (GAME_DESIGN §3.1). */
const MANAGER_EX_PLAYER_SHARE = 0.55;
/** Presidents are rarely former players. */
const PRESIDENT_EX_PLAYER_SHARE = 0.08;

/** Generate one manager + one president per club. Returns both registries. */
export function populatePeople(
  clubs: Map<ClubId, Club>,
  rng: Rng,
): { managers: Map<ManagerId, Manager>; presidents: Map<PresidentId, President> } {
  const managers = new Map<ManagerId, Manager>();
  const presidents = new Map<PresidentId, President>();
  let seq = 0;

  for (const club of clubs.values()) {
    seq++;
    const manager: Manager = {
      id: asManagerId(`mgr-${seq}`),
      name: fullName(rng),
      age: Math.round(clamp(rng.gaussian(48, 7), 35, 68)),
      nationality: 'ITA', // placeholder cosmetics; nation-aware bios arrive with the manager module
      personality: centeredPersonality(rng),
      morale: 0.5, // neutral at creation, like players (GAME_DESIGN §8 layer 1)
      reputation: Math.round(clamp(club.reputation + rng.gaussian(0, 8), 20, 95)),
      exPlayer: rng.chance(MANAGER_EX_PLAYER_SHARE),
      clubId: club.id,
    };
    managers.set(manager.id, manager);

    const president: President = {
      id: asPresidentId(`pres-${seq}`),
      name: fullName(rng),
      age: Math.round(clamp(rng.gaussian(58, 8), 40, 80)),
      nationality: 'ITA', // placeholder cosmetics (see above)
      personality: centeredPersonality(rng),
      reputation: Math.round(clamp(club.reputation + rng.gaussian(0, 6), 20, 95)),
      exPlayer: rng.chance(PRESIDENT_EX_PLAYER_SHARE),
      clubId: club.id,
    };
    presidents.set(president.id, president);
  }

  return { managers, presidents };
}

/** Centred trait in [0,1] — same shape used for players (mass around 0.5, rare extremes). */
function centeredTrait(rng: Rng): number {
  return (rng.uniform(0, 1) + rng.uniform(0, 1) + rng.uniform(0, 1)) / 3;
}

function centeredPersonality(rng: Rng): Personality {
  const professionalism = centeredTrait(rng);
  return {
    professionalism,
    determination: clamp(0.7 * centeredTrait(rng) + 0.3 * professionalism, 0, 1),
    consistency: centeredTrait(rng),
    leadership: centeredTrait(rng),
    temperament: centeredTrait(rng),
    ambition: centeredTrait(rng),
    loyalty: centeredTrait(rng),
    adaptability: centeredTrait(rng),
    composure: centeredTrait(rng),
    socialita: centeredTrait(rng),
    divergente: rng.chance(0.04),
  };
}

function fullName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
