import { describe, expect, it } from 'vitest';
import { type OutfieldAttributes, attributeKind } from '../domain/attributes.js';
import { asPlayerId } from '../domain/ids.js';
import { computeOverall } from '../domain/ratings.js';
import type { Personality, Player } from '../domain/types.js';
import { createRng } from '../rng/rng.js';
import { developAttributes, retireProbability } from './progression.js';

function persona(v: number): Personality {
  return { professionalism: v, determination: v, leadership: v, ambition: v };
}

function fw(
  opts: {
    age?: number;
    potential?: number;
    personality?: Personality;
    attrs?: Partial<OutfieldAttributes>;
  } = {},
): Player {
  const attrs: OutfieldAttributes = {
    pace: 60,
    stamina: 60,
    strength: 60,
    workRate: 60,
    positioning: 60,
    decisions: 60,
    composure: 60,
    finishing: 60,
    passing: 60,
    tackling: 60,
    dribbling: 60,
    marking: 60,
    ...opts.attrs,
  };
  return {
    id: asPlayerId('t'),
    name: 'Test',
    age: opts.age ?? 24,
    nationality: 'ITA',
    position: 'FW',
    preferredFoot: 'R',
    attributes: attrs,
    overall: computeOverall('FW', attrs),
    potential: opts.potential ?? 80,
    personality: opts.personality ?? persona(0.5),
    contractId: null,
  };
}

describe('developAttributes — age curve', () => {
  it('a teenager improves, a veteran declines', () => {
    const young = fw({ age: 18, potential: 85 });
    const ovYoung = young.overall;
    developAttributes(young, createRng(1));
    expect(young.overall).toBeGreaterThan(ovYoung);

    const old = fw({ age: 35, potential: 85 });
    const ovOld = old.overall;
    developAttributes(old, createRng(1));
    expect(old.overall).toBeLessThan(ovOld);
  });
});

describe('developAttributes — differential decline (physical vs technical)', () => {
  it('physical attributes decline much more than technical ones for a veteran', () => {
    let physSum = 0;
    let physN = 0;
    let techSum = 0;
    let techN = 0;
    for (let s = 0; s < 40; s++) {
      const p = fw({ age: 34, potential: 90 });
      const before = { ...(p.attributes as unknown as Record<string, number>) };
      developAttributes(p, createRng(100 + s));
      const after = p.attributes as unknown as Record<string, number>;
      for (const k of Object.keys(before)) {
        const d = (after[k] as number) - (before[k] as number);
        if (attributeKind(k) === 'physical') {
          physSum += d;
          physN++;
        } else {
          techSum += d;
          techN++;
        }
      }
    }
    const physAvg = physSum / physN;
    const techAvg = techSum / techN;
    expect(physAvg).toBeLessThan(techAvg - 1.5); // physical drops clearly more
  });

  it("a technical standout keeps his edge far longer than a physical standout (where the 'type' lives)", () => {
    // A dribbler's signature skill is technical; a speedster's is physical.
    const dribbler = fw({ age: 28, potential: 95, attrs: { dribbling: 88 } });
    const speedster = fw({ age: 28, potential: 95, attrs: { pace: 88 } });
    const drib = (p: Player) => (p.attributes as OutfieldAttributes).dribbling;
    const pace = (p: Player) => p.attributes.pace;
    const dribStart = drib(dribbler);
    const paceStart = pace(speedster);

    for (let i = 0; i < 7; i++) {
      dribbler.age++;
      speedster.age++;
      developAttributes(dribbler, createRng(700 + i));
      developAttributes(speedster, createRng(700 + i));
    }
    const dribLost = dribStart - drib(dribbler);
    const paceLost = paceStart - pace(speedster);
    // The speedster loses his signature skill much faster than the dribbler.
    expect(paceLost).toBeGreaterThan(dribLost + 8);
  });
});

describe('developAttributes — personality', () => {
  it('opposite personalities diverge from identical starting attributes', () => {
    const pro = fw({ age: 22, potential: 90, personality: persona(0.95) });
    const slacker = fw({ age: 22, potential: 90, personality: persona(0.05) });
    for (let i = 0; i < 10; i++) {
      pro.age++;
      slacker.age++;
      developAttributes(pro, createRng(300 + i));
      developAttributes(slacker, createRng(300 + i)); // same draws => only personality differs
    }
    expect(pro.overall).toBeGreaterThan(slacker.overall + 5);
  });
});

describe('developAttributes — potential cap', () => {
  it('growth never pushes an attribute above max(initial, potential)', () => {
    const p = fw({ age: 18, potential: 72 });
    const initial = { ...(p.attributes as unknown as Record<string, number>) };
    for (let i = 0; i < 6; i++) {
      p.age++;
      developAttributes(p, createRng(900 + i));
    }
    const after = p.attributes as unknown as Record<string, number>;
    for (const k of Object.keys(initial)) {
      expect(after[k] as number).toBeLessThanOrEqual(
        Math.max(initial[k] as number, p.potential) + 1,
      );
    }
  });
});

describe('retireProbability', () => {
  it('is zero for a peak-age player and certain at 40', () => {
    expect(retireProbability(26, 'FW', 80)).toBe(0);
    expect(retireProbability(40, 'FW', 80)).toBe(1);
  });

  it('rises with age and is higher for a low-rated veteran', () => {
    expect(retireProbability(35, 'FW', 80)).toBeGreaterThan(retireProbability(33, 'FW', 80));
    expect(retireProbability(32, 'FW', 40)).toBeGreaterThan(retireProbability(32, 'FW', 80));
  });
});
