import { describe, expect, it } from 'vitest';
import { asPlayerId } from '../core/ids.js';
import { neutralPersonality } from '../core/personality.js';
import { baricentroFactor, baricentroLabel, playerHeight } from '../core/physique.js';
import type { Player, Position } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { DUEL, duelThreat, planDuels, roughness } from './duels.js';
import { buildMatchScript } from './match-events.js';

let seq = 0;
function make(
  position: Position,
  attrs: Record<string, number>,
  traits: Partial<Player['personality']> = {},
  height?: number,
): Player {
  const base: Record<string, number> = {
    pace: 60,
    stamina: 60,
    strength: 60,
    workRate: 60,
    positioning: 60,
    decisions: 60,
    composure: 60,
    ...(position === 'GK'
      ? { reflexes: 60, handling: 60, aerial: 60, oneOnOne: 60 }
      : { finishing: 60, passing: 60, tackling: 60, dribbling: 60, marking: 60 }),
    ...attrs,
  };
  return {
    id: asPlayerId(`duel-${seq++}`),
    name: `P${seq}`,
    age: 26,
    nationality: 'ITA',
    position,
    preferredFoot: 'R',
    attributes: base as never,
    potential: 80,
    personality: { ...neutralPersonality(), ...traits },
    injuryProneness: 0.3,
    morale: 0.5,
    contractId: null,
    height,
  } as Player;
}

function xiFor(star: Player, position: Position): Player[] {
  const xi = [make('GK', {})];
  for (let i = 0; i < 4; i++) xi.push(make('DF', { tackling: 50, strength: 50 }));
  for (let i = 0; i < 4; i++) xi.push(make('MF', { dribbling: 45, pace: 50 }));
  xi.push(make('FW', { dribbling: 45, pace: 55 }));
  xi.push(star);
  return xi.filter((p) => !(p.position === position && p !== star && xi.indexOf(p) === 1));
}

describe('fisico derivato (SPEC §19.1)', () => {
  it('heights are deterministic, bounded and role-shaped; authored wins', () => {
    const world = generateWorld(createRng(42));
    let dfSum = 0;
    let dfN = 0;
    let dribSum = 0;
    let dribN = 0;
    for (const p of world.players.values()) {
      const h = playerHeight(p);
      expect(h).toBeGreaterThanOrEqual(165);
      expect(h).toBeLessThanOrEqual(202);
      expect(playerHeight(p)).toBe(h);
      if (p.position === 'DF') {
        dfSum += h;
        dfN++;
      }
      const drib = (p.attributes as unknown as Record<string, number>).dribbling ?? 0;
      if (p.position === 'FW' && drib >= 70) {
        dribSum += h;
        dribN++;
      }
    }
    expect(dfSum / dfN).toBeGreaterThan(dribSum / Math.max(1, dribN));

    const shorty = make('FW', { dribbling: 90 }, {}, 168);
    expect(playerHeight(shorty)).toBe(168);
    expect(baricentroLabel(shorty)).toBe('basso');
    expect(baricentroFactor(shorty)).toBeLessThan(-0.5);
    const tower = make('DF', { strength: 92 }, {}, 196);
    expect(baricentroLabel(tower)).toBe('alto');
  });
});

describe('duelli di giornata (SPEC §19.2)', () => {
  const winger = make('FW', { dribbling: 92, pace: 90 }, {}, 168);
  const roughCB = make(
    'DF',
    { tackling: 88, strength: 90, pace: 48 },
    { temperament: 0.85, composure: 0.3 },
    194,
  );
  const cleanCB = make(
    'DF',
    { tackling: 70, strength: 60, pace: 78 },
    { temperament: 0.2, composure: 0.85 },
  );

  it('the rough slow stopper vs the low-gravity winger lights the duel up', () => {
    expect(roughness(roughCB)).toBeGreaterThan(roughness(cleanCB) + 0.2);
    expect(duelThreat(winger)).toBeGreaterThan(0.55);

    const attackXI = xiFor(winger, 'FW');
    const world = new Map(attackXI.map((p) => [p.id, p]));
    const roughXI = xiFor(roughCB, 'DF');
    for (const p of roughXI) world.set(p.id, p);
    const plan = planDuels(attackXI, roughXI, world);
    const duel = plan.duels.find((d) => d.attackerId === winger.id);
    expect(duel).toBeDefined();
    expect(duel!.defenderId).toBe(roughCB.id);
    expect(duel!.intensity).toBeGreaterThan(0.3);
    const defMods = plan.mods.get(roughCB.id)!;
    const attMods = plan.mods.get(winger.id)!;
    expect(defMods.cardMult).toBeGreaterThan(1.4);
    expect(attMods.injMult).toBeGreaterThan(1.1);

    // Il baricentro basso attenua il rischio rispetto a un gemello alto.
    const tallTwin = make('FW', { dribbling: 92, pace: 90 }, {}, 191);
    const attackXI2 = xiFor(tallTwin, 'FW');
    const world2 = new Map(attackXI2.map((p) => [p.id, p]));
    for (const p of roughXI) world2.set(p.id, p);
    const plan2 = planDuels(attackXI2, roughXI, world2);
    const tallInj = plan2.mods.get(tallTwin.id)?.injMult ?? 1;
    expect(attMods.injMult).toBeLessThan(tallInj);
  });

  it('cards get REDISTRIBUTED onto the rough defender, never inflated', () => {
    const attackXI = xiFor(winger, 'FW');
    const defendXI = xiFor(roughCB, 'DF');
    const world = new Map([...attackXI, ...defendXI].map((p) => [p.id, p]));
    const { mods } = planDuels(attackXI, defendXI, world);

    let totalWith = 0;
    let totalWithout = 0;
    let roughWith = 0;
    let roughWithout = 0;
    for (let seed = 0; seed < 400; seed++) {
      const home = { clubId: attackXI[0]!.id as never, xi: attackXI, bench: [] };
      const away = { clubId: defendXI[0]!.id as never, xi: defendXI, bench: [] };
      const withMods = buildMatchScript(home, away, createRng(seed), mods);
      const noMods = buildMatchScript(home, away, createRng(seed));
      const cards = (evts: { type: string; playerId: string }[]) =>
        evts.filter((e) => e.type === 'yellow' || e.type === 'red');
      totalWith += cards(withMods.events as never).length;
      totalWithout += cards(noMods.events as never).length;
      roughWith += cards(withMods.events as never).filter(
        (e) => e.playerId === (roughCB.id as string),
      ).length;
      roughWithout += cards(noMods.events as never).filter(
        (e) => e.playerId === (roughCB.id as string),
      ).length;
    }
    // Stessa pioggia di cartellini (±5%), ma il ruvido ne raccoglie molti di più.
    expect(Math.abs(totalWith - totalWithout) / Math.max(1, totalWithout)).toBeLessThan(0.05);
    expect(roughWith).toBeGreaterThan(roughWithout * 1.3);
    expect(DUEL.MIN_INTENSITY).toBeGreaterThan(0); // le costanti restano documentate
  });

  it('the hammered dribbler gets hurt more often, fragility included', () => {
    const attackXI = xiFor(winger, 'FW');
    const defendXI = xiFor(roughCB, 'DF');
    const world = new Map([...attackXI, ...defendXI].map((p) => [p.id, p]));
    const { mods } = planDuels(attackXI, defendXI, world);

    let hurtWith = 0;
    let hurtWithout = 0;
    for (let seed = 0; seed < 600; seed++) {
      const home = { clubId: attackXI[0]!.id as never, xi: attackXI, bench: [] };
      const away = { clubId: defendXI[0]!.id as never, xi: defendXI, bench: [] };
      const w = buildMatchScript(home, away, createRng(seed), mods);
      const n = buildMatchScript(home, away, createRng(seed));
      if (w.homeInjuries.some((i) => i.player.id === winger.id)) hurtWith++;
      if (n.homeInjuries.some((i) => i.player.id === winger.id)) hurtWithout++;
    }
    expect(hurtWith).toBeGreaterThan(hurtWithout);
  });
});
