import { describe, expect, it } from 'vitest';
import { asClubId } from '../core/ids.js';
import { generateWorld } from '../generation/generate-world.js';
import { applyRosterPack, attributesForArchetype } from '../generation/roster-pack.js';
import { createRng } from '../rng/rng.js';
import {
  ARCHETYPES,
  archetypeById,
  archetypeHeatmap,
  archetypesFor,
  playerArchetype,
} from './archetypes.js';
import { playerOverall } from './ratings.js';

describe('archetipi di ruolo (core/archetypes)', () => {
  it('the library covers every position and derivation is deterministic', () => {
    for (const pos of ['GK', 'DF', 'MF', 'FW'] as const) {
      expect(archetypesFor(pos).length).toBeGreaterThanOrEqual(2);
    }
    const world = generateWorld(createRng(42));
    const seen = new Set<string>();
    for (const p of world.players.values()) {
      const a = playerArchetype(p);
      expect(a.position).toBe(p.position);
      expect(playerArchetype(p).id).toBe(a.id); // stabile
      seen.add(a.id);
    }
    // Un mondo intero esprime quasi tutta la libreria (varietà reale, non un solo tipo).
    expect(seen.size).toBeGreaterThanOrEqual(ARCHETYPES.length - 4);
  });

  it('heatmaps are normalised, archetype-specific, and mirrored for left-footers', () => {
    const punta = archetypeHeatmap(archetypeById('fw-punta-area'), 'R');
    const regista = archetypeHeatmap(archetypeById('mf-regista'), 'R');
    const flat = (m: number[][]) => m.flat();
    expect(Math.max(...flat(punta))).toBe(1);
    expect(flat(punta)).not.toEqual(flat(regista));
    // La punta d'area vive nella metà offensiva.
    const w = punta[0]!.length;
    const attackMass = punta.reduce((s, row) => s + row.slice(w / 2).reduce((a, b) => a + b, 0), 0);
    const defenceMass = punta.reduce(
      (s, row) => s + row.slice(0, w / 2).reduce((a, b) => a + b, 0),
      0,
    );
    expect(attackMass).toBeGreaterThan(defenceMass * 3);
    // L'ala invertita destra vive a sinistra; il mancino specchia.
    const ala = archetypeById('fw-ala-invertita');
    const right = archetypeHeatmap(ala, 'R');
    const left = archetypeHeatmap(ala, 'L');
    expect(left).toEqual([...right].reverse());
  });

  it('roster pack dresses generated players: population, contracts and ids untouched', () => {
    const world = generateWorld(createRng(7));
    const club = [...world.clubs.values()][0]!;
    const before = {
      players: world.players.size,
      ids: [...club.playerIds],
      contracts: world.contracts.size,
    };
    const res = applyRosterPack(world, asClubId(club.id), [
      {
        name: 'Tino Provino',
        age: 29,
        nationality: 'ITA',
        position: 'FW',
        foot: 'L',
        archetype: 'fw-ala-invertita',
        level: 88,
        standouts: { dribbling: 95 },
        traits: { leadership: 0.9 },
        trainedHere: true,
      },
      {
        name: 'Ugo Secondo',
        age: 24,
        nationality: 'FRA',
        position: 'MF',
        foot: 'R',
        archetype: 'mf-regista',
        level: 82,
      },
    ]);
    expect(res.applied).toBe(2);
    expect(world.players.size).toBe(before.players);
    expect(club.playerIds).toEqual(before.ids);
    expect(world.contracts.size).toBe(before.contracts);

    const tino = [...world.players.values()].find((p) => p.name === 'Tino Provino')!;
    expect(tino.preferredFoot).toBe('L');
    expect((tino.attributes as unknown as Record<string, number>).dribbling).toBe(95);
    expect(tino.personality.leadership).toBe(0.9);
    expect(tino.trainedClubId).toBe(club.id);
    expect(tino.contractId).not.toBeNull(); // il contratto del vestito resta il suo
    // L'inferenza riconosce l'archetipo autorato (gli attributi "somigliano").
    expect(playerArchetype(tino).id).toBe('fw-ala-invertita');
    expect(playerOverall(tino)).toBeGreaterThan(80);
  });

  it('authored attributes match the intended archetype for the whole library', () => {
    let ok = 0;
    for (const a of ARCHETYPES) {
      const attrs = attributesForArchetype(a.position, a.id, 80, `probe|${a.id}`);
      const fake = {
        id: `probe-${a.id}`,
        position: a.position,
        attributes: attrs,
      } as Parameters<typeof playerArchetype>[0];
      if (playerArchetype(fake).id === a.id) ok++;
    }
    expect(ok / ARCHETYPES.length).toBeGreaterThanOrEqual(0.8); // MODULE_ARCHETYPES §5
  });
});

describe('movimenti senza palla (G2)', () => {
  it('ogni giocatore ha 1-3 frasi, deterministiche e coerenti con l’archetipo', async () => {
    const { generateWorld } = await import('../generation/generate-world.js');
    const { createRng } = await import('../rng/rng.js');
    const { playerMovements, playerArchetype } = await import('./archetypes.js');
    const world = generateWorld(createRng(42));
    let checked = 0;
    for (const p of world.players.values()) {
      if (checked >= 300) break;
      checked++;
      const m = playerMovements(p);
      expect(m.length).toBeGreaterThanOrEqual(1);
      expect(m.length).toBeLessThanOrEqual(3);
      expect(playerMovements(p)).toEqual(m); // stesso input → stesse frasi
      const a = playerArchetype(p);
      if (a.id === 'df-fascia-bloccato') expect(m.join(' ')).toContain('BLOCCATO');
      if (a.id === 'df-fascia-spinta') expect(m.join(' ')).toContain('SOVRAPPONE');
      if (a.id === 'fw-seconda-punta') expect(m.join(' ')).toContain('MEZZALUNA');
    }
    expect(checked).toBe(300);
  });
});
