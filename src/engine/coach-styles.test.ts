import { describe, expect, it } from 'vitest';
import type { Manager, Position, World } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { NEUTRAL_MODS, coachDevBoost, squadFit, styleMods } from './coach-styles.js';
import { ageAndDevelop } from './progression.js';
import { createSeason, seasonStandings, simulateSeason } from './season.js';

const coach = (style: Manager['style'], rep: number, extra: Partial<Manager> = {}): Manager => ({
  id: 'mgr-t' as never,
  name: 'Mister',
  age: 50,
  nationality: 'ITA',
  personality: {
    professionalism: 0.6,
    determination: 0.6,
    consistency: 0.5,
    leadership: 0.9,
    temperament: 0.3,
    ambition: 0.5,
    loyalty: 0.5,
    adaptability: 0.5,
    composure: 0.7,
    socialita: 0.7,
    divergente: false,
  },
  morale: 0.5,
  reputation: rep,
  exPlayer: true,
  style,
  clubId: null,
  ...extra,
});

/** Mean of an attribute over a club's players of the given positions. */
function meanAttr(world: World, clubIdx: number, positions: Position[], attr: string): number {
  const club = [...world.clubs.values()][clubIdx]!;
  const players = club.playerIds
    .map((id) => world.players.get(id)!)
    .filter((p) => positions.includes(p.position));
  return (
    players.reduce((s, p) => s + (p.attributes as unknown as Record<string, number>)[attr]!, 0) /
    players.length
  );
}

describe('tactical styles (MODULE_MANAGER §5)', () => {
  const world = generateWorld(createRng(3));
  const top = [...world.clubs.values()][0]!;
  const bottom = [...world.clubs.values()][19]!;

  it('squad fit tracks the squad: better defenders → better catenaccio fit', () => {
    const topFit = squadFit(world, top, 'catenaccio');
    const bottomFit = squadFit(world, bottom, 'catenaccio');
    expect(topFit).toBeGreaterThan(bottomFit);
    expect(topFit).toBeLessThanOrEqual(1);
    expect(bottomFit).toBeGreaterThanOrEqual(0.3);
  });

  it('style mods bend the right levers, scaled by power; caretaker is neutral', () => {
    const cat = styleMods(world, top, coach('catenaccio', 90));
    expect(cat.oppShots).toBeLessThan(1);
    expect(cat.oppTilt).toBeLessThan(1);
    expect(cat.ownShots).toBeLessThan(1);
    const weakCat = styleMods(world, top, coach('catenaccio', 40));
    expect(weakCat.oppShots).toBeGreaterThan(cat.oppShots); // weaker coach, milder effect
    expect(styleMods(world, top, undefined)).toEqual(NEUTRAL_MODS);
  });

  it('a catenaccio side concedes less than the same side playing wings (across seeds)', () => {
    let concededDelta = 0;
    for (const seed of [5, 9, 14]) {
      const conceded = (style: Manager['style']): number => {
        const w = generateWorld(createRng(seed));
        const clubId = [...w.clubs.values()][6]!.id;
        const mgr = [...w.managers!.values()].find((m) => m.clubId === clubId)!;
        mgr.style = style;
        mgr.reputation = 90;
        const season = createSeason(w, w.leagues[0]!, 2026, seed);
        simulateSeason(w, season, createRng(seed));
        return seasonStandings(w, season).find((r) => r.clubId === clubId)!.goalsAgainst;
      };
      concededDelta += conceded('wings') - conceded('catenaccio');
    }
    expect(concededDelta).toBeGreaterThan(0);
  });
});

describe("la bottega dell'allenatore (MODULE_MANAGER §6 — richiesta utente)", () => {
  it('good catenaccio coach: defenders grow marking/tackling more than forwards grow finishing', () => {
    const grow = (style: Manager['style']) => {
      const w = generateWorld(createRng(21));
      const club = [...w.clubs.values()][8]!;
      const before = {
        dfMarking: meanAttr(w, 8, ['DF'], 'marking'),
        dfTackling: meanAttr(w, 8, ['DF'], 'tackling'),
        fwFinishing: meanAttr(w, 8, ['FW'], 'finishing'),
      };
      const influence = new Map([[club.id, coachDevBoost(coach(style, 88), 1.3)]]);
      for (let i = 0; i < 3; i++) ageAndDevelop(w, createRng(100 + i), influence);
      return {
        dfMarking: meanAttr(w, 8, ['DF'], 'marking') - before.dfMarking,
        dfTackling: meanAttr(w, 8, ['DF'], 'tackling') - before.dfTackling,
        fwFinishing: meanAttr(w, 8, ['FW'], 'finishing') - before.fwFinishing,
      };
    };

    const cat = grow('catenaccio');
    const counter = grow('counter');
    // Under the catenaccio master, defensive craft grows more than it does under the
    // counter-attack coach — and vice versa for the strikers' finishing.
    expect(cat.dfMarking).toBeGreaterThan(counter.dfMarking + 0.5);
    expect(cat.dfTackling).toBeGreaterThan(counter.dfTackling + 0.5);
    expect(counter.fwFinishing).toBeGreaterThan(cat.fwFinishing + 0.5);
  });

  it('results and charisma amplify the teaching', () => {
    const overperformer = coachDevBoost(coach('catenaccio', 80), 1.3);
    const underperformer = coachDevBoost(coach('catenaccio', 80), 0.7);
    expect(overperformer('marking', 'DF', 25)).toBeGreaterThan(
      underperformer('marking', 'DF', 25) * 1.5,
    );
    const shy = coachDevBoost(
      coach('catenaccio', 80, {
        personality: { ...coach('catenaccio', 80).personality, leadership: 0.1, socialita: 0.2 },
      }),
      1,
    );
    expect(coachDevBoost(coach('catenaccio', 80), 1)('marking', 'DF', 25)).toBeGreaterThan(
      shy('marking', 'DF', 25),
    );
  });

  it('the youth developer boosts under-22s on everything, veterans not at all', () => {
    const boost = coachDevBoost(coach('youth', 85), 1);
    expect(boost('passing', 'MF', 19)).toBeGreaterThan(0);
    expect(boost('marking', 'DF', 20)).toBeGreaterThan(0);
    expect(boost('passing', 'MF', 27)).toBe(0);
  });
});
