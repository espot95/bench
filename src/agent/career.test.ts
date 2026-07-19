import { describe, expect, it } from 'vitest';
import { placeClient, poachClient } from '../agent/placement.js';
import { playerOverall } from '../core/ratings.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  agentlessPlayers,
  hireScout,
  hypeClient,
  hypeWageMultiplier,
  investInClient,
  proposeMandate,
  requiredReputation,
  settleAgentExtras,
  settleAgentSeason,
  settleHype,
  startAgentCareer,
} from './career.js';

describe('agent career (MODULE_AGENT §6)', () => {
  it('under-18s are the hunting ground; the novice cannot sign the wonderkid', () => {
    const world = generateWorld(createRng(2));
    const pool = agentlessPlayers(world);
    expect(pool.length).toBeGreaterThan(50);
    expect(pool.every((p) => p.age <= 18)).toBe(true);

    const state = startAgentCareer(world, 'novizio');
    const star = [...pool].sort((a, b) => b.potential - a.potential)[0]!;
    let starYes = 0;
    for (let i = 0; i < 20; i++) {
      const w2 = generateWorld(createRng(2));
      const s2 = startAgentCareer(w2, 'novizio');
      const target = agentlessPlayers(w2).find((p) => p.id === star.id)!;
      if (proposeMandate(w2, s2, target, { wagePct: 0.05, years: 2 }, 2026, createRng(i)).accepted)
        starYes++;
    }
    expect(starYes).toBe(0); // barriera reale (GAME_DESIGN §3.3)

    // But a modest kid listens often enough.
    const modest = [...pool].sort((a, b) => requiredReputation(a) - requiredReputation(b))[0]!;
    let modestYes = 0;
    for (let i = 0; i < 20; i++) {
      const w2 = generateWorld(createRng(2));
      const s2 = startAgentCareer(w2, 'novizio');
      const target = agentlessPlayers(w2).find((p) => p.id === modest.id)!;
      if (proposeMandate(w2, s2, target, { wagePct: 0.06, years: 2 }, 2026, createRng(i)).accepted)
        modestYes++;
    }
    expect(modestYes).toBeGreaterThan(5);
    expect(state.mandates).toHaveLength(0);
  });

  it('collects the wage cut (and a fee on renewal years) into the ledger', () => {
    const world = generateWorld(createRng(5));
    const state = startAgentCareer(world, 'esperto');
    const client = agentlessPlayers(world)[0]!;
    let accepted = false;
    for (let i = 0; i < 30 && !accepted; i++) {
      accepted = proposeMandate(
        world,
        state,
        client,
        { wagePct: 0.1, years: 3 },
        2026,
        createRng(i),
      ).accepted;
    }
    expect(accepted).toBe(true);

    const contract = world.contracts.get(client.contractId!)!;
    const digest = settleAgentSeason(world, state, 2027, createRng(2));
    expect(digest.wageCuts).toBe(Math.round(contract.wage * 52 * 0.1));
    expect(state.cash).toBeGreaterThan(2_000_000);

    contract.startYear = 2028; // simulate a renewal signed for the new season
    const digest2 = settleAgentSeason(world, state, 2028, createRng(3));
    expect(digest2.signingFees).toBeGreaterThan(0);
  });

  it('expiry churn: with a tiny reputation, a grown client walks away', () => {
    const world = generateWorld(createRng(7));
    const state = startAgentCareer(world, 'novizio');
    const client = agentlessPlayers(world).sort((a, b) => playerOverall(b) - playerOverall(a))[5]!;
    client.agencyId = state.agencyId; // force the mandate in
    state.mandates.push({ playerId: client.id, wagePct: 0.08, endYear: 2026 });
    state.reputation = 6;

    let left = 0;
    for (let i = 0; i < 12; i++) {
      const w2 = generateWorld(createRng(7));
      const s2 = startAgentCareer(w2, 'novizio');
      const c2 = w2.players.get(client.id)!;
      c2.agencyId = s2.agencyId;
      s2.mandates.push({ playerId: c2.id, wagePct: 0.08, endYear: 2026 });
      s2.reputation = 6;
      const d = settleAgentSeason(w2, s2, 2027, createRng(100 + i));
      if (d.expired.length > 0) left++;
    }
    expect(left).toBeGreaterThan(4); // la maggioranza ti molla
    expect(state.mandates.length).toBe(1);
  });
});

describe('3b — scouts & the potential bet (MODULE_AGENT §7)', () => {
  it('a hired scout costs his salary and produces reports at settle', () => {
    const world = generateWorld(createRng(9));
    const state = startAgentCareer(world, 'esperto');
    expect(hireScout(world, state, 'Occhio di Falco')).toBe(true);
    const scoutState = new Map();
    const cashBefore = state.cash;
    const extras = settleAgentExtras(world, state, scoutState, 2027, createRng(3));
    expect(extras.scoutWages).toBe(300_000);
    expect(state.cash).toBe(cashBefore - 300_000);
    expect(extras.observed).toBeGreaterThan(10);
    expect(scoutState.size).toBeGreaterThan(10);
  });

  it('the bet lifts a young client toward (never past) his ceiling and burns cash', () => {
    const world = generateWorld(createRng(11));
    const state = startAgentCareer(world, 'esperto');
    const kid = agentlessPlayers(world).find(
      (p) => p.potential - playerOverall(p) > 8 && p.age <= 19,
    )!;
    kid.agencyId = state.agencyId;
    state.mandates.push({ playerId: kid.id, wagePct: 0.08, endYear: 2028 });

    const before = { ...(kid.attributes as unknown as Record<string, number>) };
    const cashBefore = state.cash;
    expect(investInClient(world, state, kid, 600_000).ok).toBe(true);
    expect(state.cash).toBe(cashBefore - 600_000);
    settleAgentExtras(world, state, new Map(), 2027, createRng(4));
    const after = kid.attributes as unknown as Record<string, number>;
    const grew = Object.keys(before).filter((k) => after[k]! > before[k]!);
    expect(grew.length).toBeGreaterThanOrEqual(2);

    // Veterans and non-clients are refused.
    const vet = agentlessPlayers(world).find((p) => p.age > 21);
    if (vet) expect(investInClient(world, state, vet, 300_000).ok).toBe(false);
  });
});

describe('3c — piazzamento e penale (MODULE_AGENT §8)', () => {
  it('places a client: player moves, the commission lands in YOUR cash', () => {
    const world = generateWorld(createRng(13));
    const state = startAgentCareer(world, 'esperto');
    const kid = agentlessPlayers(world).sort((a, b) => b.potential - a.potential)[8]!;
    kid.agencyId = state.agencyId;
    state.mandates.push({ playerId: kid.id, wagePct: 0.08, endYear: 2029 });
    const cashBefore = state.cash;
    const res = placeClient(world, state, kid, 2026, 0, createRng(2));
    if (res.placed) {
      expect(state.cash).toBeGreaterThanOrEqual(cashBefore);
      const newClub = [...world.clubs.values()].find((c) => c.name === res.clubName)!;
      expect(newClub.playerIds).toContain(kid.id);
    } else {
      expect(res.reason.length).toBeGreaterThan(0); // honest refusal path
    }
  });

  it('poaching needs the penalty in cash and can fail on loyalty', () => {
    const world = generateWorld(createRng(14));
    const state = startAgentCareer(world, 'esperto');
    const target = [...world.players.values()].find(
      (p) => typeof p.agencyId === 'string' && p.contractId,
    )!;
    state.cash = 0;
    const broke = poachClient(world, state, target, 0.08, 2026, createRng(1));
    expect(broke.ok).toBe(false);
    state.cash = 50_000_000;
    let won = 0;
    for (let i = 0; i < 15; i++) {
      const w2 = generateWorld(createRng(14));
      const s2 = startAgentCareer(w2, 'esperto');
      s2.cash = 50_000_000;
      const t2 = w2.players.get(target.id)!;
      if (poachClient(w2, s2, t2, 0.08, 2026, createRng(i)).ok) {
        won++;
        expect(t2.agencyId).toBe(s2.agencyId);
        expect(s2.cash).toBeLessThan(50_000_000); // penale pagata
      }
    }
    expect(won).toBeGreaterThan(0);
  });
});

describe('3d — hype, bolle, agganci (MODULE_AGENT §9)', () => {
  it('the novice is transparent; hype inflates the placement wage; bursts hurt', () => {
    const world = generateWorld(createRng(15));
    const novice = startAgentCareer(world, 'novizio');
    const kid = agentlessPlayers(world)[0]!;
    kid.agencyId = novice.agencyId;
    novice.mandates.push({ playerId: kid.id, wagePct: 0.08, endYear: 2028 });
    expect(hypeClient(novice, kid).ok).toBe(false); // 0 agganci

    novice.agganci = 6;
    expect(hypeClient(novice, kid).ok).toBe(true);
    expect(hypeWageMultiplier(novice, kid.id)).toBeCloseTo(1.15, 5);

    // Bursts: with hype 3, p=0.75/season → within a few settles it pops and reputation drops.
    novice.hype.set(kid.id, 3);
    const repBefore = novice.reputation;
    let popped = false;
    for (let i = 0; i < 10 && !popped; i++) {
      popped = settleHype(world, novice, createRng(i)).bursts.length > 0;
    }
    expect(popped).toBe(true);
    expect(novice.reputation).toBeLessThan(repBefore);
    expect(novice.hype.has(kid.id)).toBe(false);
  });
});
