import { describe, expect, it } from 'vitest';
import { archetypeHeatmap, playerArchetype } from '../core/archetypes.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { scoutedHeatmap } from './report.js';

describe('heatmap nel report (MODULE_SCOUTING §7)', () => {
  it('graininess decreases with observations, never reaching perfection', () => {
    const world = generateWorld(createRng(42));
    const player = [...world.players.values()].find((p) => p.position === 'FW')!;
    const truth = archetypeHeatmap(playerArchetype(player), player.preferredFoot);
    const err = (m: number[][]) =>
      m.flat().reduce((s, v, i) => s + Math.abs(v - truth.flat()[i]!), 0) / m.flat().length;

    const e1 = err(scoutedHeatmap(player, 1));
    const e5 = err(scoutedHeatmap(player, 5));
    const e20 = err(scoutedHeatmap(player, 20));
    expect(e1).toBeGreaterThan(e5);
    expect(e5).toBeGreaterThan(e20);
    expect(e20).toBeGreaterThan(0); // mai perfetta per gli altrui
    expect(err(scoutedHeatmap(player, Number.POSITIVE_INFINITY))).toBe(0); // i tuoi sì

    // Deterministica: stessa vista, stessa mappa; osservazioni diverse, mappa diversa.
    expect(scoutedHeatmap(player, 3)).toEqual(scoutedHeatmap(player, 3));
    expect(scoutedHeatmap(player, 3)).not.toEqual(scoutedHeatmap(player, 4));
  });
});
