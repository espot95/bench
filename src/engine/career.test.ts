import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { playAllDivisions, runCareer } from './career.js';
import { ageAndDevelop, promoteRelegate, retire, youthIntake } from './progression.js';

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('promotions / relegations', () => {
  it('swaps the bottom of a division with the top of the one below', () => {
    const world = generateWorld(createRng(1));
    const tier1Before = world.leagues[0]!.clubIds.slice();
    const tier2Before = world.leagues[1]!.clubIds.slice();

    const { standingsByLeague } = playAllDivisions(world, 2026, 1);
    const t1 = standingsByLeague.get(world.leagues[0]!.id)!;
    const t2 = standingsByLeague.get(world.leagues[1]!.id)!;
    const relegated = t1.slice(-3).map((r) => r.clubId);
    const promoted = t2.slice(0, 3).map((r) => r.clubId);

    const swaps = promoteRelegate(world, standingsByLeague);

    expect(swaps).toHaveLength(1);
    expect(world.leagues[0]!.clubIds).toHaveLength(20);
    expect(world.leagues[1]!.clubIds).toHaveLength(20);
    for (const id of promoted) expect(world.leagues[0]!.clubIds).toContain(id);
    for (const id of relegated) expect(world.leagues[1]!.clubIds).toContain(id);
    // Same 40 clubs overall, just redistributed.
    const after = [...world.leagues[0]!.clubIds, ...world.leagues[1]!.clubIds].sort();
    expect(after).toEqual([...tier1Before, ...tier2Before].sort());
  });
});

describe('aging & development', () => {
  it('young players improve on average, older players decline', () => {
    const world = generateWorld(createRng(2));
    const before = new Map(
      [...world.players].map(([id, p]) => [id, { age: p.age, ov: p.overall }]),
    );
    ageAndDevelop(world, createRng(99));

    const youngDeltas: number[] = [];
    const oldDeltas: number[] = [];
    for (const [id, p] of world.players) {
      const b = before.get(id)!;
      expect(p.age).toBe(b.age + 1);
      if (b.age <= 20) youngDeltas.push(p.overall - b.ov);
      if (b.age >= 33) oldDeltas.push(p.overall - b.ov);
    }
    expect(avg(youngDeltas)).toBeGreaterThan(0);
    expect(avg(oldDeltas)).toBeLessThan(0);
  });
});

describe('retirements & youth intake', () => {
  it('retires only older players and refills squads back to 25', () => {
    const world = generateWorld(createRng(3));
    // Push ages up so some players cross the retirement threshold.
    for (const p of world.players.values()) p.age += 12;

    const retired = retire(world, createRng(5));
    expect(retired.length).toBeGreaterThan(0);
    // Retire from 33 (GK 35), or from 31 for weak veterans (SPEC §11).
    for (const r of retired) expect(r.player.age).toBeGreaterThanOrEqual(31);

    youthIntake(world, createRng(6), 2027);
    for (const club of world.clubs.values()) {
      expect(club.playerIds).toHaveLength(25);
    }
  });
});

describe('career health over many seasons (SPEC §10/§11 gate)', () => {
  const world = generateWorld(createRng(10));
  const totalBefore = world.players.size;
  const history = runCareer(world, 2026, 15, 10);

  it('runs the requested number of seasons', () => {
    expect(history).toHaveLength(15);
  });

  it('keeps both divisions at 20 clubs and squads at 25', () => {
    for (const league of world.leagues) expect(league.clubIds).toHaveLength(20);
    for (const club of world.clubs.values()) expect(club.playerIds).toHaveLength(25);
  });

  it('keeps the total number of players constant (retirements ↔ newgen)', () => {
    expect(world.players.size).toBe(totalBefore);
  });

  it('keeps the average squad age stable (~23-28)', () => {
    const mean = avg([...world.players.values()].map((p) => p.age));
    expect(mean).toBeGreaterThan(22);
    expect(mean).toBeLessThan(29);
  });

  it('has a realistic age distribution (mostly 23-28, few teenagers, few 34+)', () => {
    const ages = [...world.players.values()].map((p) => p.age);
    const share = (pred: (a: number) => boolean) => ages.filter(pred).length / ages.length;
    expect(share((a) => a >= 23 && a <= 28)).toBeGreaterThan(0.3);
    expect(share((a) => a <= 17)).toBeLessThan(0.12);
    expect(share((a) => a >= 34)).toBeLessThan(0.12);
  });

  it('produces a clearly-leading top-division champion every season', () => {
    for (const season of history) {
      const top = season.divisions.find((d) => d.tier === 1)!;
      const champ = top.standings[0]!;
      expect(champ.points).toBeGreaterThan(64);
      expect(champ.points).toBeLessThan(102);
    }
  });

  it('actually promotes and relegates clubs each season', () => {
    for (const season of history) {
      expect(season.offseason.swaps[0]!.promoted).toHaveLength(3);
      expect(season.offseason.swaps[0]!.relegated).toHaveLength(3);
    }
  });
});
