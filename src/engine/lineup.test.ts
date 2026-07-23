import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import { leagueOfClub } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { bestAssignment, effectiveOverall, resolveAssignment, worstAssignment } from './lineup.js';
import { naturalFielded } from './lineup.js';
import { createSeason, runManagedSeason, seasonStandings } from './season.js';

function world(seed = 1) {
  return generateWorld(createRng(seed));
}

describe('effectiveOverall (rating in the played slot)', () => {
  const w = world(1);
  const players = [...w.players.values()];
  const fw = players.find((p) => p.position === 'FW')!;

  it('equals natural overall when played in position', () => {
    expect(effectiveOverall(fw, 'FW')).toBe(playerOverall(fw));
  });

  it('drops when an outfielder is played out of position', () => {
    const asDf = effectiveOverall(fw, 'DF');
    expect(asDf).toBeLessThan(playerOverall(fw));
    expect(asDf).toBeGreaterThan(1);
  });

  it('heavily penalises an outfielder played in goal', () => {
    const asGk = effectiveOverall(fw, 'GK');
    expect(asGk).toBeLessThan(playerOverall(fw) * 0.4);
  });
});

describe('lineup strength', () => {
  const w = world(1);
  const club = [...w.clubs.values()][10]!;

  it('best natural XI is stronger than the worst/wrong-role XI', () => {
    const best = resolveAssignment(bestAssignment(club, w), club, w);
    const worst = resolveAssignment(worstAssignment(club, w), club, w);
    expect(best.strength.overall).toBeGreaterThan(worst.strength.overall);
    expect(best.strength.defense).toBeGreaterThan(worst.strength.defense);
    expect(best.strength.attack).toBeGreaterThan(worst.strength.attack);
  });

  it('the best assignment matches the auto natural XI strength', () => {
    const viaAssignment = resolveAssignment(bestAssignment(club, w), club, w);
    const viaNatural = naturalFielded(club, w);
    expect(viaAssignment.strength.overall).toBeCloseTo(viaNatural.strength.overall, 6);
  });
});

describe('resolveAssignment (suspensions)', () => {
  const w = world(1);
  const club = [...w.clubs.values()][3]!;

  it('auto-replaces an unavailable player and reports it', () => {
    const assignment = bestAssignment(club, w);
    const benched = assignment[5]!; // some MF slot
    const fielded = resolveAssignment(assignment, club, w, new Set([benched.playerId]));

    expect(fielded.players).toHaveLength(11);
    expect(fielded.players.map((p) => p.id)).not.toContain(benched.playerId);
    expect(fielded.replacements).toHaveLength(1);
    expect(fielded.replacements[0]!.out.id).toBe(benched.playerId);
  });
});

describe('manager impact — the validation gate (SPEC §9.4)', () => {
  // STATISTICAL gate: a chance-based engine can invert a single season by luck (as real
  // football does), so the guarantee is on the AGGREGATE — lineup choices must matter a lot
  // on average, and flukes must be rare.
  const cases: Array<{ seed: number; clubIdx: number }> = [
    { seed: 1, clubIdx: 10 },
    { seed: 7, clubIdx: 3 },
    { seed: 42, clubIdx: 8 },
    { seed: 99, clubIdx: 15 },
    { seed: 123, clubIdx: 8 },
    { seed: 500, clubIdx: 3 },
  ];

  // 12 stagioni complete: sotto carico parallelo può superare i 30s di default.
  it('best XI beats worst XI clearly on average across seeds/clubs', { timeout: 120_000 }, () => {
    const gaps = cases.map(({ seed, clubIdx }) => {
      const play = (assign: typeof bestAssignment) => {
        const w = world(seed);
        const club = [...w.clubs.values()][clubIdx]!;
        const season = createSeason(w, leagueOfClub(w, club.id), 2026, seed);
        const table = runManagedSeason(w, season, createRng(seed), club.id, assign(club, w));
        return table.find((r) => r.clubId === club.id)!.points;
      };
      return play(bestAssignment) - play(worstAssignment);
    });

    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    // Lineup choices are worth several wins per season on average...
    expect(mean).toBeGreaterThan(8);
    // ...and a poor XI beating the best XI stays a rare fluke.
    expect(gaps.filter((g) => g > 0).length).toBeGreaterThanOrEqual(cases.length - 1);
  });
});
