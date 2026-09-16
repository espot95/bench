import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { createRunner, createSeason } from './season.js';

const YEAR = 2026;

function playRounds(seed: number, rounds: number) {
  const world = generateWorld(createRng(seed));
  const league = world.leagues[0]!;
  const season = createSeason(world, league, YEAR, seed + YEAR);
  const runner = createRunner(world, season, createRng(seed + YEAR), { aiMarket: false });
  for (let i = 0; i < rounds; i++) runner.playRound();
  return { world, league, season, runner };
}

describe('statistiche per giocatore + pagelle (G1)', () => {
  it('i gol individuali quadrano coi gol veri; vincoli interni e pagelle in [4,10]', () => {
    const { season, runner } = playRounds(31, 6);
    const stats = runner.playerStats();
    let teamGoals = 0;
    for (const m of season.fixtures.filter((x) => x.played))
      teamGoals += (m.homeGoals ?? 0) + (m.awayGoals ?? 0);
    let statGoals = 0;
    expect(stats.size).toBeGreaterThan(200); // tutta la lega gioca
    for (const [, s] of stats) {
      statGoals += s.goals;
      expect(s.apps).toBeGreaterThan(0);
      expect(s.minutes).toBeGreaterThan(0);
      expect(s.minutes).toBeLessThanOrEqual(s.apps * 90);
      const media = s.ratingSum / s.apps;
      expect(media).toBeGreaterThanOrEqual(4);
      expect(media).toBeLessThanOrEqual(10);
      expect(s.shotsOnTarget).toBeLessThanOrEqual(s.shots);
      expect(s.goals).toBeLessThanOrEqual(s.shotsOnTarget || s.goals);
      expect(s.passesOk).toBeLessThanOrEqual(s.passes);
      expect(s.tacklesWon).toBeLessThanOrEqual(s.tacklesTot);
      expect(s.aerialsWon).toBeLessThanOrEqual(s.aerialsTot);
      expect(s.assists).toBeLessThanOrEqual(s.keyPasses);
    }
    expect(statGoals).toBe(teamGoals);
  });

  it('il portiere è coerente: subiti = tiri in porta affrontati − parate', () => {
    const { world, runner } = playRounds(31, 6);
    let gks = 0;
    for (const [pid, s] of runner.playerStats()) {
      const p = world.players.get(pid);
      if (p?.position !== 'GK') continue;
      gks++;
      expect(s.shotsFaced - s.saves).toBe(s.concededOn);
      expect(s.psxgFaced).toBeGreaterThan(0);
      expect(s.shots).toBe(0);
    }
    expect(gks).toBeGreaterThan(10);
  });

  it('lo snapshot porta le statistiche: resume a metà = stesse stats del run diretto', () => {
    const straight = playRounds(32, 10);
    const half = playRounds(32, 4);
    const snap = half.runner.snapshot();
    const resumed = createRunner(half.world, half.season, createRng(0), { resume: snap });
    for (let i = 0; i < 6; i++) resumed.playRound();
    const ser = (m: ReadonlyMap<unknown, unknown>) =>
      JSON.stringify([...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    expect(ser(resumed.playerStats())).toBe(ser(straight.runner.playerStats()));
  });

  it('le pagelle premiano chi segna: la media dei marcatori supera quella di squadra', () => {
    const { world, runner } = playRounds(33, 12);
    let scorerSum = 0;
    let scorerN = 0;
    let allSum = 0;
    let allN = 0;
    for (const [pid, s] of runner.playerStats()) {
      const p = world.players.get(pid);
      if (!p || p.position === 'GK') continue;
      const media = s.ratingSum / s.apps;
      allSum += media;
      allN++;
      if (s.goals >= 3) {
        scorerSum += media;
        scorerN++;
      }
    }
    expect(scorerN).toBeGreaterThan(3);
    expect(scorerSum / scorerN).toBeGreaterThan(allSum / allN + 0.2);
  });
});
