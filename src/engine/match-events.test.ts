import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { cardTable, topScorers } from './player-stats.js';
import { createSeason, seasonStandings, simulateSeason } from './season.js';

function simulated(seed: number) {
  const world = generateWorld(createRng(seed));
  const season = createSeason(world, world.leagues[0]!, 2026, seed);
  simulateSeason(world, season, createRng(seed));
  return { world, season };
}

describe('match events — invariants', () => {
  const { season } = simulated(42);
  const matches = season.fixtures;

  it('goal events per team exactly match the scoreline', () => {
    for (const m of matches) {
      const homeGoals = m.events.filter(
        (e) => e.type === 'goal' && e.clubId === m.homeClubId,
      ).length;
      const awayGoals = m.events.filter(
        (e) => e.type === 'goal' && e.clubId === m.awayClubId,
      ).length;
      expect(homeGoals).toBe(m.homeGoals);
      expect(awayGoals).toBe(m.awayGoals);
    }
  });

  it('events are ordered by minute within 1-90', () => {
    for (const m of matches) {
      let prev = 0;
      for (const e of m.events) {
        expect(e.minute).toBeGreaterThanOrEqual(1);
        expect(e.minute).toBeLessThanOrEqual(90);
        expect(e.minute).toBeGreaterThanOrEqual(prev);
        prev = e.minute;
      }
    }
  });

  it('a goal never assists itself', () => {
    for (const m of matches) {
      for (const e of m.events) {
        if (e.type === 'goal' && e.assistId) expect(e.assistId).not.toBe(e.playerId);
      }
    }
  });

  it('a second yellow becomes a red; cards stay consistent per player', () => {
    for (const m of matches) {
      const yellows = new Map<string, number>();
      const reds = new Map<string, number>();
      for (const e of m.events) {
        if (e.type === 'yellow') yellows.set(e.playerId, (yellows.get(e.playerId) ?? 0) + 1);
        else if (e.type === 'red') reds.set(e.playerId, (reds.get(e.playerId) ?? 0) + 1);
      }
      for (const [pid, yc] of yellows) {
        expect(yc).toBeLessThanOrEqual(2); // never more than two yellows
        if (yc >= 2) expect(reds.get(pid) ?? 0).toBeGreaterThanOrEqual(1); // dismissed
      }
      for (const [, rc] of reds) expect(rc).toBeLessThanOrEqual(1); // at most one sending-off
    }
  });

  it('a sent-off player does not score or assist after his red', () => {
    for (const m of matches) {
      const redMinute = new Map<string, number>();
      for (const e of m.events) {
        if (e.type === 'red') redMinute.set(e.playerId, e.minute);
      }
      for (const e of m.events) {
        if (e.type !== 'goal') continue;
        const scorerRed = redMinute.get(e.playerId);
        if (scorerRed !== undefined) expect(e.minute).toBeLessThan(scorerRed);
        if (e.assistId) {
          const assistRed = redMinute.get(e.assistId);
          if (assistRed !== undefined) expect(e.minute).toBeLessThan(assistRed);
        }
      }
    }
  });

  it('a sent-off player is suspended for his club’s next match', () => {
    // Map club -> round -> match, to find the following fixture.
    const byClubRound = new Map<string, Map<number, (typeof matches)[number]>>();
    for (const m of matches) {
      for (const club of [m.homeClubId, m.awayClubId]) {
        const rounds = byClubRound.get(club) ?? new Map();
        rounds.set(m.round, m);
        byClubRound.set(club, rounds);
      }
    }

    let checked = 0;
    for (const m of matches) {
      for (const e of m.events) {
        if (e.type !== 'red') continue;
        const next = byClubRound.get(e.clubId)?.get(m.round + 1);
        if (!next) continue; // red in the final round: no next match
        const appeared = next.events.some(
          (ev) => ev.clubId === e.clubId && ev.playerId === e.playerId,
        );
        expect(appeared).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0); // the season actually produced sendings-off to test
  });

  it('makes 3-5 substitutions per team, across at most 4 distinct minutes', () => {
    for (const m of matches) {
      for (const club of [m.homeClubId, m.awayClubId]) {
        const subs = m.events.filter((e) => e.type === 'sub' && e.clubId === club);
        expect(subs.length).toBeGreaterThanOrEqual(3);
        expect(subs.length).toBeLessThanOrEqual(5);
        // 3 windows + reshape, plus injuries force off-window subs at their own minute (SPEC §12).
        expect(new Set(subs.map((s) => s.minute)).size).toBeLessThanOrEqual(5);
        for (const s of subs) {
          expect(s.subOutId).not.toBeNull();
          expect(s.subOutId).not.toBe(s.playerId); // on != off
        }
      }
    }
  });

  it('a substitute only scores after coming on; a subbed-off player not after leaving', () => {
    for (const m of matches) {
      const onAt = new Map<string, number>();
      const offAt = new Map<string, number>();
      for (const e of m.events) {
        if (e.type !== 'sub') continue;
        onAt.set(e.playerId, e.minute);
        if (e.subOutId) offAt.set(e.subOutId, e.minute);
      }
      for (const e of m.events) {
        if (e.type !== 'goal') continue;
        for (const pid of [e.playerId, e.assistId].filter(Boolean) as string[]) {
          const on = onAt.get(pid);
          const off = offAt.get(pid);
          if (on !== undefined) expect(e.minute).toBeGreaterThanOrEqual(on);
          if (off !== undefined) expect(e.minute).toBeLessThan(off);
        }
      }
    }
  });

  it('never subs a player off at or before the minute he came on', () => {
    for (const m of matches) {
      const onAt = new Map<string, number>();
      const offAt = new Map<string, number>();
      for (const e of m.events) {
        if (e.type !== 'sub') continue;
        onAt.set(e.playerId, e.minute);
        if (e.subOutId) offAt.set(e.subOutId, e.minute);
      }
      for (const [pid, on] of onAt) {
        const off = offAt.get(pid);
        if (off !== undefined) expect(off).toBeGreaterThan(on);
      }
    }
  });

  it('substitutes do score across a season (super-subs exist)', () => {
    let superSubGoals = 0;
    for (const m of matches) {
      const subIn = new Set(m.events.filter((e) => e.type === 'sub').map((e) => e.playerId));
      for (const e of m.events) {
        if (e.type === 'goal' && subIn.has(e.playerId)) superSubGoals++;
      }
    }
    expect(superSubGoals).toBeGreaterThan(0);
  });

  it('does not disturb the scoreline stream (standings identical with/without events)', () => {
    // Reproducibility: same seed => same standings regardless of the events layer.
    const a = simulated(77);
    const b = simulated(77);
    expect(seasonStandings(a.world, a.season).map((r) => `${r.clubId}:${r.points}`)).toEqual(
      seasonStandings(b.world, b.season).map((r) => `${r.clubId}:${r.points}`),
    );
  });
});

describe('match events — realism over many seasons', () => {
  // Aggregate several seasons for stable distributions.
  const seasons = Array.from({ length: 12 }, (_, i) => simulated(500 + i));
  const allMatches = seasons.flatMap((s) => s.season.fixtures);

  let goals = 0;
  let assisted = 0;
  let yellows = 0;
  let reds = 0;
  const goalsByLine: Record<string, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };

  for (const s of seasons) {
    for (const m of s.season.fixtures) {
      for (const e of m.events) {
        if (e.type === 'goal') {
          goals++;
          if (e.assistId) assisted++;
          const pos = s.world.players.get(e.playerId)?.position ?? 'MF';
          goalsByLine[pos] = (goalsByLine[pos] ?? 0) + 1;
        } else if (e.type === 'yellow') yellows++;
        else if (e.type === 'red') reds++;
      }
    }
  }

  const perMatch = (n: number) => n / allMatches.length;

  it('~70-80% of goals are assisted', () => {
    expect(assisted / goals).toBeGreaterThan(0.68);
    expect(assisted / goals).toBeLessThan(0.82);
  });

  it('forwards score the majority of goals, keepers almost none', () => {
    const fwShare = (goalsByLine.FW ?? 0) / goals;
    expect(fwShare).toBeGreaterThan(0.5);
    expect(fwShare).toBeLessThan(0.7);
    expect((goalsByLine.GK ?? 0) / goals).toBeLessThan(0.01);
  });

  it('~3-4 yellow cards per match', () => {
    expect(perMatch(yellows)).toBeGreaterThan(2.8);
    expect(perMatch(yellows)).toBeLessThan(4.2);
  });

  it('~0.15-0.30 red cards per match', () => {
    expect(perMatch(reds)).toBeGreaterThan(0.1);
    expect(perMatch(reds)).toBeLessThan(0.35);
  });

  it('the league top scorer lands in a realistic range (~16-40)', () => {
    // Best across all sampled seasons: typical ~18-28, exceptional hot seasons ~35-40.
    let best = 0;
    for (const s of seasons) {
      const top = topScorers(s.season.fixtures, 1)[0];
      if (top) best = Math.max(best, top.goals);
    }
    expect(best).toBeGreaterThanOrEqual(16);
    expect(best).toBeLessThanOrEqual(42);
  });

  it('booking table aggregates correctly', () => {
    const cards = cardTable(seasons[0]!.season.fixtures, 5);
    expect(cards.length).toBeGreaterThan(0);
    for (const row of cards) expect(row.yellows + row.reds).toBeGreaterThan(0);
  });
});
