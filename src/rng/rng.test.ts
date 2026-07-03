import { describe, expect, it } from 'vitest';
import { createRng } from './rng.js';

describe('rng determinism', () => {
  it('produces identical sequences for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next() stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('rng distributions', () => {
  it('int() respects inclusive bounds', () => {
    const r = createRng(3);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 10000; i++) {
      const x = r.int(1, 6);
      expect(Number.isInteger(x)).toBe(true);
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    expect(min).toBe(1);
    expect(max).toBe(6);
  });

  it('gaussian() has approximately the requested mean and stdDev', () => {
    const r = createRng(11);
    const n = 50000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = r.gaussian(5, 2);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(mean).toBeCloseTo(5, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(2, 1);
  });

  it('poisson() has mean approximately lambda', () => {
    const r = createRng(13);
    const n = 50000;
    const lambda = 1.4;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += r.poisson(lambda);
    expect(sum / n).toBeCloseTo(lambda, 1);
  });

  it('poisson(0) is always 0', () => {
    const r = createRng(1);
    for (let i = 0; i < 100; i++) expect(r.poisson(0)).toBe(0);
  });

  it('shuffle() is a permutation', () => {
    const r = createRng(99);
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = r.shuffle(input);
    expect(out.slice().sort((x, y) => x - y)).toEqual(input);
  });
});
