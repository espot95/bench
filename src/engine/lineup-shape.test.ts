import { describe, expect, it } from 'vitest';
import type { Position } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { bestAssignment, validateAssignment } from './lineup.js';

describe('moduli liberi (lavagna, richiesta utente)', () => {
  const world = generateWorld(createRng(21));
  const club = [...world.clubs.values()][0]!;

  function reshaped(slots: Position[]) {
    const base = bestAssignment(club, world);
    return base.map((a, i) => ({ ...a, slot: slots[i] ?? a.slot }));
  }

  it('il 3-4-3 e il 5-3-2 sono formazioni valide', () => {
    const s343: Position[] = ['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'];
    expect(validateAssignment(reshaped(s343), club, world)).toEqual([]);
    const s532: Position[] = ['GK', 'DF', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW'];
    expect(validateAssignment(reshaped(s532), club, world)).toEqual([]);
  });

  it('niente portiere, due portieri o una sola linea difensiva vengono rifiutati', () => {
    const noGk: Position[] = ['DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'];
    expect(validateAssignment(reshaped(noGk), club, world).length).toBeGreaterThan(0);
    const twoGk: Position[] = ['GK', 'GK', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'];
    expect(validateAssignment(reshaped(twoGk), club, world).length).toBeGreaterThan(0);
    const oneDf: Position[] = ['GK', 'DF', 'MF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW', 'FW'];
    expect(validateAssignment(reshaped(oneDf), club, world).length).toBeGreaterThan(0);
  });
});
