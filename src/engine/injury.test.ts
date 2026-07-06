import { describe, expect, it } from 'vitest';
import { asPlayerId } from '../domain/ids.js';
import { computeOverall } from '../domain/ratings.js';
import type { Personality, Player } from '../domain/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  applySevereHit,
  effectiveProneness,
  injuryChance,
  injuryLabel,
  rollInjury,
} from './injury.js';
import { createSeason, simulateSeason } from './season.js';

const flatPersonality: Personality = {
  professionalism: 0.5,
  determination: 0.5,
  consistency: 0.5,
  leadership: 0.5,
  temperament: 0.5,
  ambition: 0.5,
  loyalty: 0.5,
  adaptability: 0.5,
  composure: 0.5,
  socialita: 0.5,
  divergente: false,
};

function fw(proneness: number, opts: { age?: number; pace?: number } = {}): Player {
  const attrs = {
    pace: opts.pace ?? 70,
    stamina: 70,
    strength: 70,
    workRate: 70,
    positioning: 70,
    decisions: 70,
    composure: 70,
    finishing: 70,
    passing: 70,
    tackling: 70,
    dribbling: 70,
    marking: 70,
  };
  return {
    id: asPlayerId('p'),
    name: 'X',
    age: opts.age ?? 25,
    nationality: 'ITA',
    position: 'FW',
    preferredFoot: 'R',
    attributes: attrs,
    overall: computeOverall('FW', attrs),
    potential: 80,
    personality: flatPersonality,
    injuryProneness: proneness,
    morale: 0.5,
    contractId: null,
  };
}

describe('injury model', () => {
  it('injury chance rises with proneness, age and explosive pace', () => {
    expect(injuryChance(fw(0.9))).toBeGreaterThan(injuryChance(fw(0.1)));
    expect(effectiveProneness(fw(0.5, { age: 36 }))).toBeGreaterThan(effectiveProneness(fw(0.5)));
    expect(effectiveProneness(fw(0.5, { pace: 95 }))).toBeGreaterThan(
      effectiveProneness(fw(0.5, { pace: 60 })),
    );
  });

  it('a fragile player suffers a larger share of severe injuries', () => {
    const severeShare = (proneness: number) => {
      const rng = createRng(1);
      let severe = 0;
      for (let i = 0; i < 4000; i++)
        if (rollInjury(fw(proneness), rng).severity === 'severe') severe++;
      return severe / 4000;
    };
    expect(severeShare(0.95)).toBeGreaterThan(severeShare(0.05));
  });

  it('labels the crystal-glass and iron-man tails', () => {
    expect(injuryLabel(fw(0.9))).toBe('Di cristallo');
    expect(injuryLabel(fw(0.1))).toBe('Di ferro');
    expect(injuryLabel(fw(0.5))).toBeNull();
  });

  it('a severe injury permanently drops physical attributes and overall', () => {
    const p = fw(0.5);
    const beforeOverall = p.overall;
    const beforePace = p.attributes.pace;
    applySevereHit(p, createRng(2));
    expect(p.attributes.pace).toBeLessThan(beforePace);
    expect(p.overall).toBeLessThan(beforeOverall);
  });
});

describe('injuries in a simulated season', () => {
  const world = generateWorld(createRng(3));
  const season = createSeason(world, world.leagues[0]!, 2026, 3);
  simulateSeason(world, season, createRng(3));

  it('produces some injuries', () => {
    const injuries = season.fixtures.reduce(
      (n, m) => n + m.events.filter((e) => e.type === 'injury').length,
      0,
    );
    expect(injuries).toBeGreaterThan(0);
  });

  it('fragile players get injured more than robust ones (SPEC §12.5)', () => {
    // Aggregate several fresh seasons: one season is a noisy sample, the trend is robust.
    let fragileInj = 0;
    let robustInj = 0;
    for (let s = 3; s < 9; s++) {
      const w = generateWorld(createRng(s));
      const se = createSeason(w, w.leagues[0]!, 2026, s);
      simulateSeason(w, se, createRng(s));
      const byPlayer = new Map<string, number>();
      for (const m of se.fixtures) {
        for (const e of m.events) {
          if (e.type === 'injury') byPlayer.set(e.playerId, (byPlayer.get(e.playerId) ?? 0) + 1);
        }
      }
      for (const p of w.players.values()) {
        const n = byPlayer.get(p.id) ?? 0;
        if (p.injuryProneness >= 0.65) fragileInj += n;
        else if (p.injuryProneness <= 0.35) robustInj += n;
      }
    }
    expect(fragileInj).toBeGreaterThan(robustInj);
  });

  it('an injured player is unavailable in his club’s next match', () => {
    const byClubRound = new Map<string, Map<number, (typeof season.fixtures)[number]>>();
    for (const m of season.fixtures) {
      for (const club of [m.homeClubId, m.awayClubId]) {
        const rounds = byClubRound.get(club) ?? new Map();
        rounds.set(m.round, m);
        byClubRound.set(club, rounds);
      }
    }
    let checked = 0;
    for (const m of season.fixtures) {
      for (const e of m.events) {
        if (e.type !== 'injury') continue;
        const next = byClubRound.get(e.clubId)?.get(m.round + 1);
        if (!next) continue;
        const appeared = next.events.some(
          (ev) => ev.clubId === e.clubId && ev.playerId === e.playerId,
        );
        expect(appeared).toBe(false); // out injured => no events next round
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
