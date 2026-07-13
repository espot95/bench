import { describe, expect, it } from 'vitest';
import { asClubId, asSeasonId } from '../core/ids.js';
import type { ClubId } from '../core/ids.js';
import { generateSchedule } from './scheduler.js';

function clubIds(n: number): ClubId[] {
  return Array.from({ length: n }, (_, i) => asClubId(`c${i + 1}`));
}

describe('generateSchedule', () => {
  const season = asSeasonId('s');

  it('produces a full double round-robin', () => {
    const n = 20;
    const ids = clubIds(n);
    const matches = generateSchedule(season, ids);

    // 2*(N-1) rounds, N/2 matches each => N*(N-1) total.
    expect(matches).toHaveLength(n * (n - 1));
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(2 * (n - 1));
  });

  it('has every club play every other once home and once away', () => {
    const ids = clubIds(8);
    const matches = generateSchedule(season, ids);

    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        const homeVsAway = matches.filter((m) => m.homeClubId === a && m.awayClubId === b);
        expect(homeVsAway).toHaveLength(1);
      }
    }
  });

  it('gives each club exactly one match per round', () => {
    const ids = clubIds(20);
    const matches = generateSchedule(season, ids);
    const rounds = new Set(matches.map((m) => m.round));
    for (const r of rounds) {
      const inRound = matches.filter((m) => m.round === r);
      const clubsInRound = new Set<ClubId>();
      for (const m of inRound) {
        clubsInRound.add(m.homeClubId);
        clubsInRound.add(m.awayClubId);
      }
      expect(clubsInRound.size).toBe(ids.length);
    }
  });

  it('keeps home/away balanced (each club ~half its games at home)', () => {
    const ids = clubIds(20);
    const matches = generateSchedule(season, ids);
    for (const id of ids) {
      const homeGames = matches.filter((m) => m.homeClubId === id).length;
      // 38 games, ideally 19 home. Circle method allows a little slack.
      expect(homeGames).toBeGreaterThanOrEqual(18);
      expect(homeGames).toBeLessThanOrEqual(20);
    }
  });

  it('rejects an odd number of clubs', () => {
    expect(() => generateSchedule(season, clubIds(19))).toThrow();
  });
});
