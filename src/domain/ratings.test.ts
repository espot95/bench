import { describe, expect, it } from 'vitest';
import type { GoalkeeperAttributes, OutfieldAttributes } from './attributes.js';
import { computeOverall } from './ratings.js';

function outfield(fill: number, overrides: Partial<OutfieldAttributes> = {}): OutfieldAttributes {
  return {
    pace: fill,
    stamina: fill,
    strength: fill,
    workRate: fill,
    positioning: fill,
    decisions: fill,
    composure: fill,
    finishing: fill,
    passing: fill,
    tackling: fill,
    dribbling: fill,
    marking: fill,
    ...overrides,
  };
}

function keeper(fill: number, overrides: Partial<GoalkeeperAttributes> = {}): GoalkeeperAttributes {
  return {
    pace: fill,
    stamina: fill,
    strength: fill,
    workRate: fill,
    positioning: fill,
    decisions: fill,
    composure: fill,
    reflexes: fill,
    handling: fill,
    aerial: fill,
    oneOnOne: fill,
    ...overrides,
  };
}

describe('computeOverall', () => {
  it('returns the flat value when all attributes are equal', () => {
    expect(computeOverall('FW', outfield(12))).toBeCloseTo(12, 5);
    expect(computeOverall('DF', outfield(8))).toBeCloseTo(8, 5);
    expect(computeOverall('GK', keeper(15))).toBeCloseTo(15, 5);
  });

  it('rewards a striker more for finishing than for tackling', () => {
    const goodFinisher = computeOverall('FW', outfield(10, { finishing: 20 }));
    const goodTackler = computeOverall('FW', outfield(10, { tackling: 20 }));
    expect(goodFinisher).toBeGreaterThan(goodTackler);
  });

  it('rewards a defender more for tackling than for finishing', () => {
    const goodTackler = computeOverall('DF', outfield(10, { tackling: 20 }));
    const goodFinisher = computeOverall('DF', outfield(10, { finishing: 20 }));
    expect(goodTackler).toBeGreaterThan(goodFinisher);
  });

  it('throws when position and attribute kind mismatch', () => {
    expect(() => computeOverall('GK', outfield(10))).toThrow();
    expect(() => computeOverall('FW', keeper(10))).toThrow();
  });
});
