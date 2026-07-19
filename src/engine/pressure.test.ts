import { describe, expect, it } from 'vitest';
import { neutralPersonality } from '../core/personality.js';
import type { Personality } from '../core/types.js';
import { PRESSURE } from './constants.js';
import { clubPressure, pressureEffect } from './pressure.js';

const persona = (t: Partial<Personality>): Personality => ({ ...neutralPersonality(), ...t });

/** The user-story archetypes (SPEC §18.2). */
const FRAGILE = persona({ composure: 0.1, professionalism: 0.8, determination: 0.4 });
const MENEFREGHISTA = persona({ composure: 0.3, professionalism: 0.15, ambition: 0.15 });
const RONALDO = persona({ composure: 0.95, leadership: 0.9, determination: 0.9, ambition: 0.9 });

describe('piazza pressure (SPEC §18)', () => {
  it('big clubs radiate pressure, small ones barely any; underperformance adds heat', () => {
    expect(clubPressure(90, 0, 0)).toBeGreaterThan(0.65);
    expect(clubPressure(45, 15, 15)).toBeLessThan(0.1);
    // A big club sliding 8 places below expectation is a pressure cooker.
    expect(clubPressure(85, 1, 9)).toBeGreaterThan(clubPressure(85, 1, 1) + 0.15);
    // Overperforming never *reduces* pressure below the base.
    expect(clubPressure(85, 10, 2)).toBe(clubPressure(85, 10, 10));
  });

  it('a fragile character collapses under a hot piazza, but is fine in the province', () => {
    const hot = pressureEffect(FRAGILE, 1);
    const quiet = pressureEffect(FRAGILE, 0.1);
    expect(hot).toBeLessThan(-0.12); // strong malus (double-digit % of contribution)
    expect(hot).toBeGreaterThanOrEqual(PRESSURE.MALUS_CAP); // …but never below the cap
    expect(Math.abs(quiet)).toBeLessThan(0.03); // small stage, no drama
  });

  it("the couldn't-care-less type dips a little — everywhere, never a collapse", () => {
    const hot = pressureEffect(MENEFREGHISTA, 1);
    expect(hot).toBeLessThan(0); // c'è, piccolo
    expect(hot).toBeGreaterThan(-0.08); // ma non è un crollo
    // He feels the piazza much less than the fragile professional does.
    expect(Math.abs(hot)).toBeLessThan(Math.abs(pressureEffect(FRAGILE, 1)) / 2);
  });

  it('a strong leader gets a BONUS from the big stage (Ronaldo al Real)', () => {
    const hot = pressureEffect(RONALDO, 1);
    expect(hot).toBeGreaterThan(0.08);
    expect(hot).toBeLessThanOrEqual(PRESSURE.BONUS_CAP);
    // The boost needs the stage: in a quiet province it mostly vanishes.
    expect(pressureEffect(RONALDO, 0.1)).toBeLessThan(hot / 3);
  });

  it('determination cushions the drop for equal composure', () => {
    const gritty = persona({ composure: 0.2, determination: 0.95, professionalism: 0.7 });
    const soft = persona({ composure: 0.2, determination: 0.05, professionalism: 0.7 });
    expect(pressureEffect(gritty, 0.9)).toBeGreaterThan(pressureEffect(soft, 0.9));
  });

  it('is ~zero-mean over a centred population (league calibration preserved)', () => {
    // Deterministic sweep over centred trait combinations.
    let sum = 0;
    let n = 0;
    for (let c = 0.1; c <= 0.9; c += 0.1) {
      for (let ldr = 0.1; ldr <= 0.9; ldr += 0.1) {
        for (let prof = 0.1; prof <= 0.9; prof += 0.2) {
          sum += pressureEffect(
            persona({ composure: c, leadership: ldr, professionalism: prof }),
            0.6,
          );
          n++;
        }
      }
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.015);
  });
});
