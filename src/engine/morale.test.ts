import { describe, expect, it } from 'vitest';
import { emptyFinances } from '../core/finance.js';
import { neutralPersonality } from '../core/personality.js';
import type { Club, Personality, Player, World } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { type Fielded, matchStrength, naturalFielded } from './lineup.js';
import { type Appearance, moraleLabel, updateMoraleForClub } from './morale.js';

let seq = 0;
function mk(overall: number, p: Partial<Personality> = {}, morale = 0.5): Player {
  const attrs = {
    pace: overall,
    stamina: overall,
    strength: overall,
    workRate: overall,
    positioning: overall,
    decisions: overall,
    composure: overall,
    finishing: overall,
    passing: overall,
    tackling: overall,
    dribbling: overall,
    marking: overall,
  };
  return {
    id: `m${seq++}` as never,
    name: 'X',
    age: 25,
    nationality: 'ITA',
    position: 'MF',
    preferredFoot: 'R',
    attributes: attrs,
    potential: 80,
    personality: { ...neutralPersonality(), ...p },
    injuryProneness: 0.5,
    morale,
    contractId: null,
  };
}

/** A minimal world holding one club and its players. */
function oneClub(players: Player[]): { world: World; club: Club } {
  const club: Club = {
    id: 'c1' as never,
    name: 'Club',
    shortName: 'CLB',
    reputation: 60,
    stadiumCapacity: 10000,
    finances: emptyFinances(),
    elo: 1500,
    playerIds: players.map((p) => p.id),
  };
  const world: World = {
    leagues: [{ id: 'l1' as never, name: 'L', tier: 1, clubIds: [club.id] }],
    clubs: new Map([[club.id, club]]),
    players: new Map(players.map((p) => [p.id, p])),
    contracts: new Map(),
  };
  return { world, club };
}

function appearances(
  players: Player[],
  override: Map<string, Appearance>,
): Map<string, Appearance> {
  const m = new Map<string, Appearance>();
  for (const p of players) m.set(p.id, override.get(p.id) ?? 'started');
  return m;
}

describe('individual morale (SPEC §13)', () => {
  it('an ambitious star left on the bench loses morale', () => {
    const star = mk(85, { ambition: 0.9 });
    const others = Array.from({ length: 14 }, (_, i) => mk(70 - i));
    const players = [star, ...others];
    const { world, club } = oneClub(players);
    const app = appearances(players, new Map([[star.id, 'unused']]));

    for (let r = 0; r < 8; r++) updateMoraleForClub(world, club, app, 'draw', 0);
    expect(star.morale).toBeLessThan(0.42);
  });

  it('a fringe player who plays regularly gains morale', () => {
    const fringe = mk(45, { ambition: 0.5 });
    const starters = Array.from({ length: 14 }, (_, i) => mk(80 - i));
    const players = [...starters, fringe];
    const { world, club } = oneClub(players);
    const app = appearances(players, new Map([[fringe.id, 'started']]));

    for (let r = 0; r < 8; r++) updateMoraleForClub(world, club, app, 'draw', 0);
    expect(fringe.morale).toBeGreaterThan(0.58);
  });

  it('morale recovers gradually toward neutral after a shock', () => {
    const p = mk(70, {}, 0.1); // shocked
    const players = [p, ...Array.from({ length: 10 }, (_, i) => mk(72 - i))];
    const { world, club } = oneClub(players);
    // Neutral situation: he plays about as expected, draws.
    const app = appearances(players, new Map([[p.id, 'started']]));

    const before = p.morale;
    for (let r = 0; r < 5; r++) updateMoraleForClub(world, club, app, 'draw', 0);
    expect(p.morale).toBeGreaterThan(before);
    expect(p.morale).toBeLessThan(0.5); // not instant — still climbing
  });

  it('a determined player drops less than a shaky one in the same bad spell', () => {
    const determined = mk(75, { determination: 0.95, ambition: 0.5 });
    const shaky = mk(75, { determination: 0.05, ambition: 0.5 });
    const players = [determined, shaky, ...Array.from({ length: 9 }, (_, i) => mk(60 - i))];
    const { world, club } = oneClub(players);
    const app = appearances(
      players,
      new Map([
        [determined.id, 'unused'],
        [shaky.id, 'unused'],
      ]),
    );

    for (let r = 0; r < 6; r++) updateMoraleForClub(world, club, app, 'loss', -3);
    expect(determined.morale).toBeGreaterThan(shaky.morale);
  });

  it('morale nudges match strength (small but real)', () => {
    const world = generateWorld(createRng(3));
    const c = [...world.clubs.values()][0]!;
    const base: Fielded = naturalFielded(c, world);
    const withMorale = (m: number): Fielded => ({
      ...base,
      entries: base.entries.map((e) => ({
        ...e,
        player: {
          ...e.player,
          morale: m,
          personality: { ...e.player.personality, consistency: 1 },
        },
      })),
    });
    const high = matchStrength(withMorale(0.9), createRng(1)).attack;
    const low = matchStrength(withMorale(0.1), createRng(1)).attack;
    expect(high).toBeGreaterThan(low);
    expect(high / low).toBeLessThan(1.1); // small: doesn't flip the strength
  });

  it('labels morale coarsely', () => {
    expect(moraleLabel(0.9)).toBe('Felice');
    expect(moraleLabel(0.5)).toBe('Nella norma');
    expect(moraleLabel(0.1)).toBe('Giù di morale');
  });
});
