import { describe, expect, it } from 'vitest';
import { emptyStats } from '../engine/player-stats.js';
import { FORM, performanceFactor } from './value.js';

function withRating(media: number, apps = 20, minutes = 1800) {
  const s = emptyStats();
  s.apps = apps;
  s.minutes = minutes;
  s.ratingSum = media * apps;
  return s;
}

describe('G3 — la forma muove il valore (performanceFactor)', () => {
  it('senza statistiche il fattore è neutro', () => {
    expect(performanceFactor(undefined, 'FW', 1)).toBe(1);
    expect(performanceFactor(emptyStats(), 'DF', 1)).toBe(1);
  });

  it('la media pagelle muove TUTTI i ruoli, portiere e difensore inclusi', () => {
    for (const pos of ['GK', 'DF', 'MF', 'FW'] as const) {
      expect(performanceFactor(withRating(7), pos, 1)).toBeGreaterThan(1.05);
      expect(performanceFactor(withRating(5.2), pos, 1)).toBeLessThan(0.9);
    }
  });

  it('il contributo di ruolo si somma: gol per la punta, clean sheet per il difensore', () => {
    const fw = withRating(6.6);
    fw.goals = 18;
    fw.assists = 5;
    const fwQuiet = withRating(6.6);
    expect(performanceFactor(fw, 'FW', 1)).toBeGreaterThan(performanceFactor(fwQuiet, 'FW', 1));

    const df = withRating(6.4);
    df.cleanSheets = 12;
    const dfLeaky = withRating(6.4);
    dfLeaky.cleanSheets = 1;
    expect(performanceFactor(df, 'DF', 1)).toBeGreaterThan(performanceFactor(dfLeaky, 'DF', 1));

    const gk = withRating(6.4);
    gk.psxgFaced = 40;
    gk.concededOn = 28; // ne para più dell'atteso
    const gkAvg = withRating(6.4);
    gkAvg.psxgFaced = 30;
    gkAvg.concededOn = 30;
    expect(performanceFactor(gk, 'GK', 1)).toBeGreaterThan(performanceFactor(gkAvg, 'GK', 1));
  });

  it('il campionato pesa: la stessa stagione in B vale meno che in A', () => {
    const s = withRating(7.2);
    const inA = performanceFactor(s, 'MF', 1);
    const inB = performanceFactor(s, 'MF', 2);
    expect(inA).toBeGreaterThan(inB);
    expect(inB).toBeGreaterThan(1); // resta positiva, solo attenuata
  });

  it('bande di sicurezza e poca evidenza', () => {
    const boom = withRating(9.5);
    boom.goals = 40;
    expect(performanceFactor(boom, 'FW', 1)).toBeLessThanOrEqual(FORM.MAX);
    const flop = withRating(4.2);
    expect(performanceFactor(flop, 'DF', 1)).toBeGreaterThanOrEqual(FORM.MIN);
    const fewMinutes = withRating(8, 2, 120);
    expect(Math.abs(performanceFactor(fewMinutes, 'FW', 1) - 1)).toBeLessThan(0.13);
  });
});
