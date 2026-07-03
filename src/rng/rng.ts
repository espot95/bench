/**
 * Seedable pseudo-random number generator (mulberry32) + distributions.
 *
 * The whole engine is deterministic: no `Math.random`, ever. A single `Rng`
 * instance is threaded through generation and simulation. Same seed => same world.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  uniform(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Gaussian (normal) sample with given mean and standard deviation. */
  gaussian(mean: number, stdDev: number): number;
  /** Poisson sample with rate lambda (>= 0). */
  poisson(lambda: number): number;
  /** Pick one element uniformly. Throws on empty arrays. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates shuffle returning a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** True with probability p. */
  chance(p: number): boolean;
}

/** mulberry32: fast 32-bit seedable PRNG, good enough for a game simulation. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);

  // Box-Muller keeps a spare normal sample between calls.
  let spare: number | null = null;

  const gaussian = (mean: number, stdDev: number): number => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return mean + stdDev * value;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mul;
    return mean + stdDev * (u * mul);
  };

  const poisson = (lambda: number): number => {
    if (lambda <= 0) return 0;
    // Knuth's algorithm — fine for the small lambdas we use (< ~10).
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= next();
    } while (p > limit);
    return k - 1;
  };

  return {
    next,
    uniform: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    gaussian,
    poisson,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() on empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
    chance: (p) => next() < p,
  };
}
