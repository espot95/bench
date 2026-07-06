import { describe, expect, it } from 'vitest';
import { leagueOfClub } from '../domain/types.js';
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
    expect(effectiveOverall(fw, 'FW')).toBe(fw.overall);
  });

  it('drops when an outfielder is played out of position', () => {
    const asDf = effectiveOverall(fw, 'DF');
    expect(asDf).toBeLessThan(fw.overall);
    expect(asDf).toBeGreaterThan(1);
  });

  it('heavily penalises an outfielder played in goal', () => {
    const asGk = effectiveOverall(fw, 'GK');
    expect(asGk).toBeLessThan(fw.overall * 0.4);
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
  const cases: Array<{ seed: number; clubIdx: number }> = [
    { seed: 1, clubIdx: 10 },
    { seed: 7, clubIdx: 3 },
    { seed: 42, clubIdx: 8 },
  ];

  for (const { seed, clubIdx } of cases) {
    it(`good lineup finishes clearly above a poor one (seed ${seed}, club ${clubIdx})`, () => {
      const play = (assign: (club: any, w: any) => ReturnType<typeof bestAssignment>) => {
        const w = world(seed);
        const clubId = [...w.clubs.values()][clubIdx]!.id;
        const season = createSeason(w, leagueOfClub(w, clubId), 2026, seed);
        const table = runManagedSeason(
          w,
          season,
          createRng(seed),
          clubId,
          assign(w.clubs.get(clubId), w),
        );
        const row = table.find((r) => r.clubId === clubId)!;
        return { position: table.indexOf(row) + 1, points: row.points };
      };

      const good = play(bestAssignment);
      const bad = play(worstAssignment);

      expect(good.position).toBeLessThan(bad.position);
      // A clear, not razor-thin, gap over a 38-game season (≈2 wins).
      expect(good.points).toBeGreaterThan(bad.points + 6);
    });
  }
});
