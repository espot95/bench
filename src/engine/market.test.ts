import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import { SELF_AGENT_THRESHOLD } from '../generation/agents.js';
import { buildFreeAgentPool } from '../generation/free-agents.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { renewOrRelease } from './progression.js';

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('agents (SPEC §15)', () => {
  it('assigns every player a valid agent, except the self-represented', () => {
    const world = generateWorld(createRng(1));
    expect(world.agencies!.length).toBeGreaterThan(0);
    const agentIds = new Set(world.agencies!.map((a) => a.id));

    for (const p of world.players.values()) {
      if (p.age <= 18) {
        expect(p.agencyId).toBeUndefined(); // i ragazzini non hanno ancora un procuratore
        continue;
      }
      if (p.personality.professionalism >= SELF_AGENT_THRESHOLD) {
        expect(p.agencyId).toBeNull(); // auto-procuratore
      } else {
        expect(p.agencyId).toBeTruthy();
        expect(agentIds.has(p.agencyId!)).toBe(true);
      }
    }
  });

  it('keeps agent client lists consistent with player.agencyId', () => {
    const world = generateWorld(createRng(2));
    for (const agent of world.agencies!) {
      for (const clientId of agent.clientIds) {
        expect(world.players.get(clientId)?.agencyId).toBe(agent.id);
      }
    }
  });
});

describe('contract renewal / release (SPEC §15.0, passive AI)', () => {
  it('renews most expiring contracts and releases a few, removing them from the world', () => {
    const world = generateWorld(createRng(3));
    // Make every contract expire, so the whole squad is up for renewal.
    for (const c of world.contracts.values()) c.endYear = 2025;
    const before = world.players.size;

    const released = renewOrRelease(world, createRng(4), 2026);

    expect(released.length).toBeGreaterThan(0);
    // Most players are retained, not released.
    expect(released.length).toBeLessThan(before / 2);
    // Released players are gone from the world; retained contracts now extend past the new year.
    for (const p of released) expect(world.players.has(p.id)).toBe(false);
    expect(world.players.size).toBe(before - released.length);
    for (const p of world.players.values()) {
      if (p.contractId)
        expect(world.contracts.get(p.contractId)!.endYear).toBeGreaterThanOrEqual(2026);
    }
  });

  it('releases weaker/older players on average', () => {
    const world = generateWorld(createRng(7));
    for (const c of world.contracts.values()) c.endYear = 2025;
    const allOveralls = [...world.players.values()].map((p) => playerOverall(p));
    const released = renewOrRelease(world, createRng(8), 2026);
    // The released are, on aggregate, below the overall average of the population.
    expect(avg(released.map((p) => playerOverall(p)))).toBeLessThan(avg(allOveralls));
  });

  it('caps releases per club (churn stays realistic)', () => {
    const world = generateWorld(createRng(9));
    for (const c of world.contracts.values()) c.endYear = 2025;
    const squadBefore = new Map([...world.clubs.values()].map((c) => [c.id, c.playerIds.length]));
    renewOrRelease(world, createRng(10), 2026);
    for (const club of world.clubs.values()) {
      const lost = squadBefore.get(club.id)! - club.playerIds.length;
      expect(lost).toBeLessThanOrEqual(2);
    }
  });
});

describe('free-agent pool (SPEC §15)', () => {
  it('offers released players plus modest generated prospects, without touching the world', () => {
    const world = generateWorld(createRng(5));
    const released = renewOrRelease(world, createRng(6), 2100); // force lots of expiries → releases
    const sizeAfterRelease = world.players.size;

    const pool = buildFreeAgentPool(world, createRng(11), 2027, released);
    expect(pool.length).toBe(released.length + 40);
    // Prospects are ephemeral — not added to the world.
    expect(world.players.size).toBe(sizeAfterRelease);
    for (const p of pool) {
      if (p.id.startsWith('fa-')) expect(world.players.has(p.id)).toBe(false);
    }
  });

  it('makes prospects mostly squad-fillers (modest median quality)', () => {
    const world = generateWorld(createRng(5));
    const pool = buildFreeAgentPool(world, createRng(12), 2027, []);
    const overalls = pool.map((p) => playerOverall(p)).sort((a, b) => a - b);
    const median = overalls[Math.floor(overalls.length / 2)]!;
    expect(median).toBeLessThan(62); // realistic: free agents are usually fillers
  });

  it('gives each prospect an agent or self-representation', () => {
    const world = generateWorld(createRng(5));
    const pool = buildFreeAgentPool(world, createRng(13), 2027, []);
    const agentIds = new Set(world.agencies!.map((a) => a.id));
    for (const p of pool) {
      // agencyId is defined: either null (self) or a valid agency id.
      expect(p.agencyId === null || agentIds.has(p.agencyId!)).toBe(true);
    }
  });
});
