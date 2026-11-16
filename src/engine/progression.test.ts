import { describe, expect, it } from 'vitest';
import { type OutfieldAttributes, attributeKind } from '../core/attributes.js';
import { growthOf } from '../core/growth.js';
import { asPlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import { computeOverall } from '../core/ratings.js';
import type { Personality, Player } from '../core/types.js';
import type { World } from '../core/types.js';
import { createRng } from '../rng/rng.js';
import { developAttributes, erodePotentials, retireProbability } from './progression.js';

function persona(v: number): Personality {
  return {
    professionalism: v,
    determination: v,
    consistency: v,
    leadership: v,
    temperament: v,
    ambition: v,
    loyalty: v,
    adaptability: v,
    composure: v,
    socialita: v,
    divergente: false,
  };
}

function fw(
  opts: {
    /** La curva di carriera è derivata dall'id (hash): 'b' lineare · 'd' precoce ·
     *  'h' tardivo · 'c' esplosivo · 'a' evergreen · 't' lineare (default storico). */
    id?: string;
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
    id: asPlayerId(opts.id ?? 't'),
    name: 'Test',
    age: opts.age ?? 24,
    nationality: 'ITA',
    position: 'FW',
    preferredFoot: 'R',
    attributes: attrs,
    potential: opts.potential ?? 80,
    personality: opts.personality ?? persona(0.5),
    injuryProneness: 0.5,
    morale: 0.5,
    contractId: null,
  };
}

describe('developAttributes — age curve', () => {
  it('a teenager improves, a veteran declines', () => {
    const young = fw({ age: 18, potential: 85 });
    const ovYoung = playerOverall(young);
    developAttributes(young, createRng(1));
    expect(playerOverall(young)).toBeGreaterThan(ovYoung);

    const old = fw({ age: 35, potential: 85 });
    const ovOld = playerOverall(old);
    developAttributes(old, createRng(1));
    expect(playerOverall(old)).toBeLessThan(ovOld);
  });
});

describe('developAttributes — differential decline (physical vs technical)', () => {
  it('physical attributes decline much more than technical ones for a veteran', () => {
    let physSum = 0;
    let physN = 0;
    let techSum = 0;
    let techN = 0;
    // 36: oltre declineAge+3 per ogni lineare (31-33) — declino pieno, come il
    // vecchio test a 34 sulla curva unica.
    for (let s = 0; s < 40; s++) {
      const p = fw({ age: 36, potential: 90 });
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
    expect(playerOverall(pro)).toBeGreaterThan(playerOverall(slacker) + 5);
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

describe('curve di carriera (SPEC §11.11)', () => {
  it('a 22-26 il tardivo cresce forte dove il precoce ha già smesso', () => {
    const tard = fw({ id: 'h', age: 22, potential: 92 });
    const prec = fw({ id: 'd', age: 22, potential: 92 });
    for (let i = 0; i < 4; i++) {
      tard.age++;
      prec.age++;
      developAttributes(tard, createRng(40 + i));
      developAttributes(prec, createRng(40 + i)); // stessi draw: conta solo la curva
    }
    expect(playerOverall(tard)).toBeGreaterThan(playerOverall(prec) + 4);
  });

  it("l'evergreen a 34-36 cala molto meno del lineare", () => {
    const ever = fw({ id: 'a', age: 34, potential: 90 });
    const lin = fw({ id: 'b', age: 34, potential: 90 });
    const e0 = playerOverall(ever);
    const l0 = playerOverall(lin);
    for (let i = 0; i < 3; i++) {
      ever.age++;
      lin.age++;
      developAttributes(ever, createRng(50 + i));
      developAttributes(lin, createRng(50 + i));
    }
    expect(e0 - playerOverall(ever)).toBeLessThan(l0 - playerOverall(lin) - 2);
  });

  it("l'esplosivo detona nella sua finestra SOLO se sta giocando", () => {
    const a = fw({ id: 'c', potential: 95 });
    const surgeAge = growthOf(a).surgeAge;
    expect(surgeAge).toBeDefined();
    const boom = fw({ id: 'c', age: surgeAge, potential: 95 });
    const bench = fw({ id: 'c', age: surgeAge, potential: 95 });
    for (let i = 0; i < 2; i++) {
      developAttributes(boom, createRng(60 + i), undefined, 2400);
      developAttributes(bench, createRng(60 + i), undefined, 100);
      boom.age++;
      bench.age++;
    }
    expect(playerOverall(boom)).toBeGreaterThan(playerOverall(bench) + 4);
  });

  it('il ventenne che gioca cresce più del coetaneo in panchina (stessi draw)', () => {
    const titolare = fw({ id: 'b', age: 20, potential: 90 });
    const panchina = fw({ id: 'b', age: 20, potential: 90 });
    for (let i = 0; i < 3; i++) {
      developAttributes(titolare, createRng(70 + i), undefined, 2400);
      developAttributes(panchina, createRng(70 + i), undefined, 0);
      titolare.age++;
      panchina.age++;
    }
    expect(playerOverall(titolare)).toBeGreaterThan(playerOverall(panchina) + 2);
  });
});

describe('erodePotentials (SPEC §11.12)', () => {
  const worldOf = (players: Player[]): World =>
    ({ players: new Map(players.map((p) => [p.id, p])) }) as unknown as World;

  it('in finestra il panchinaro perde potenziale, chi gioca no; senza mappa nessun effetto', () => {
    const bench = fw({ id: 'b', age: 21, potential: 85 });
    const starter = fw({ id: 'f', age: 21, potential: 85 }); // 'f': anche lui lineare
    erodePotentials(worldOf([bench])); // nessuna mappa = neutro
    expect(bench.potential).toBe(85);
    erodePotentials(
      worldOf([bench, starter]),
      new Map([
        [bench.id, 0],
        [starter.id, 2400],
      ]),
    );
    expect(bench.potential).toBeLessThan(85);
    expect(starter.potential).toBe(85);
  });

  it('oltre la finestra il gap si spegne del 30% a stagione, mai sotto overall+2', () => {
    const p = fw({ id: 'b', age: 25, potential: 85 });
    const overall = playerOverall(p);
    const gap = 85 - overall;
    erodePotentials(worldOf([p]), new Map([[p.id, 3000]])); // i minuti non salvano: finestra chiusa
    expect(p.potential).toBeCloseTo(85 - gap * 0.3, 0);
    for (let i = 0; i < 20; i++) erodePotentials(worldOf([p]), new Map([[p.id, 3000]]));
    expect(p.potential).toBeGreaterThanOrEqual(overall + 2);
  });
});

describe('crollo del portiere (SPEC §11.11)', () => {
  const gk = (id: string, age: number): Player => ({
    id: asPlayerId(id),
    name: 'GK Test',
    age,
    nationality: 'ITA',
    position: 'GK',
    preferredFoot: 'R',
    attributes: {
      pace: 55,
      stamina: 60,
      strength: 65,
      workRate: 60,
      positioning: 70,
      decisions: 65,
      composure: 65,
      reflexes: 78,
      handling: 74,
      oneOnOne: 72,
      aerial: 70,
    },
    potential: 80,
    personality: persona(0.5),
    injuryProneness: 0.3,
    morale: 0.5,
    contractId: null,
  });

  it('può colpire solo in tarda età, ed esiste un portiere che crolla', () => {
    // Il crollo è un hash deterministico su (id, età): troviamo un id che scatta.
    const h01 = (key: string) => {
      let h = 2166136261;
      for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return ((h >>> 0) % 100_000) / 100_000;
    };
    let hit: Player | null = null;
    let hitAge = 0;
    for (let i = 0; i < 200 && !hit; i++) {
      const cand = gk(`gk-${i}`, 30);
      const g = growthOf(cand);
      for (let age = g.declineAge + 2; age <= 39; age++) {
        if (h01(`${cand.id}|crollo|${age}`) < 0.15) {
          hit = gk(`gk-${i}`, age);
          hitAge = age;
          break;
        }
      }
    }
    expect(hit).not.toBeNull();
    const before = (hit!.attributes as unknown as Record<string, number>).reflexes!;
    developAttributes(hit!, createRng(5));
    const after = (hit!.attributes as unknown as Record<string, number>).reflexes!;
    expect(before - after).toBeGreaterThanOrEqual(5); // il crollo morde oltre il declino

    // Lo stesso portiere, giovane, non può crollare: il declino ordinario resta lieve.
    const young = gk(hit!.id as string, 27);
    const yBefore = (young.attributes as unknown as Record<string, number>).reflexes!;
    developAttributes(young, createRng(5));
    const yAfter = (young.attributes as unknown as Record<string, number>).reflexes!;
    expect(yBefore - yAfter).toBeLessThan(5);
    expect(hitAge).toBeGreaterThanOrEqual(30);
  });
});

describe('retireProbability', () => {
  it('evergreen appende gli scarpini più tardi, il precoce prima', () => {
    expect(retireProbability(34, 'FW', 80, 'evergreen')).toBeLessThan(
      retireProbability(34, 'FW', 80),
    );
    expect(retireProbability(33, 'FW', 80, 'precoce')).toBeGreaterThan(
      retireProbability(33, 'FW', 80),
    );
  });

  it('is zero for a peak-age player and certain at 40', () => {
    expect(retireProbability(26, 'FW', 80)).toBe(0);
    expect(retireProbability(40, 'FW', 80)).toBe(1);
  });

  it('rises with age and is higher for a low-rated veteran', () => {
    expect(retireProbability(35, 'FW', 80)).toBeGreaterThan(retireProbability(33, 'FW', 80));
    expect(retireProbability(32, 'FW', 40)).toBeGreaterThan(retireProbability(32, 'FW', 80));
  });
});
