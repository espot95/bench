import { describe, expect, it } from 'vitest';
import type { PlayerId } from '../core/ids.js';
import { leagueOfClub } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { closeSeason } from './career.js';
import {
  type PlayerSeasonStats,
  careerLineOf,
  emptyStats,
  mergeSeasonStats,
} from './player-stats.js';
import { type SeasonRunner, createRunner, createSeason, seasonStandings } from './season.js';

const YEAR = 2026;

/**
 * G4 — IL MONDO CHE GIOCA: specchio del guscio. La lega dell'utente gioca la sua
 * giornata, poi OGNI altra divisione gioca la sua (stessi seed storici di
 * closeSeason: seed + anno + (i+1)·1000, club utente protetto dal loro mercato).
 */
function playWorldSeason(seed: number) {
  const world = generateWorld(createRng(seed));
  const club = [...world.clubs.values()][3]!;
  const userLeague = leagueOfClub(world, club.id);
  const season = createSeason(world, userLeague, YEAR, seed + YEAR);
  const runner = createRunner(world, season, createRng(seed + YEAR));
  const others: { season: ReturnType<typeof createSeason>; runner: SeasonRunner }[] = [];
  world.leagues.forEach((lg, i) => {
    if (lg.id === userLeague.id) return;
    const s = seed + YEAR + (i + 1) * 1000;
    const os = createSeason(world, lg, YEAR, s);
    others.push({
      season: os,
      runner: createRunner(world, os, createRng(s), { protectedClubId: club.id }),
    });
  });
  while (!runner.isFinished()) {
    runner.playRound(club.id);
    for (const o of others) if (!o.runner.isFinished()) o.runner.playRound();
  }
  for (const o of others) while (!o.runner.isFinished()) o.runner.playRound();
  const merged = new Map<PlayerId, PlayerSeasonStats>();
  mergeSeasonStats(merged, runner.playerStats());
  for (const o of others) mergeSeasonStats(merged, o.runner.playerStats());
  return { world, club, season, runner, others, merged };
}

describe('G4 — IL MONDO CHE GIOCA: statistiche di tutti i giocatori del mondo', () => {
  it('ogni divisione gioca giornata per giornata: statistiche per TUTTI i club', () => {
    const { world, club, others, merged } = playWorldSeason(91);
    // Ogni club del mondo ha almeno 11 giocatori con presenze vere.
    for (const c of world.clubs.values()) {
      const withApps = c.playerIds.filter((pid) => (merged.get(pid)?.apps ?? 0) > 0);
      expect(withApps.length).toBeGreaterThanOrEqual(11);
    }
    // I gol individuali di ogni ALTRA lega tornano coi gol veri del suo calendario.
    for (const o of others) {
      const fixtureGoals = o.season.fixtures.reduce(
        (s, m) => s + (m.homeGoals ?? 0) + (m.awayGoals ?? 0),
        0,
      );
      let statGoals = 0;
      for (const [, st] of o.runner.playerStats()) statGoals += st.goals;
      expect(statGoals).toBe(fixtureGoals);
    }
    // Le pagelle medie restano nei limiti del voto (4-10) ovunque nel mondo.
    for (const [, st] of merged) {
      if (st.apps === 0) continue;
      const media = st.ratingSum / st.apps;
      expect(media).toBeGreaterThanOrEqual(4);
      expect(media).toBeLessThanOrEqual(10);
    }
    // PROTEZIONE: il mercato AI delle altre divisioni non ha saccheggiato l'utente
    // (nessuna uscita senza consenso: la rosa può solo essere rimasta o cresciuta).
    expect(club.playerIds.length).toBeGreaterThanOrEqual(11);
  });

  it('stesso seed → stesso mondo: l’interleave è deterministico', () => {
    const a = playWorldSeason(92);
    const b = playWorldSeason(92);
    const sig = (m: Map<PlayerId, PlayerSeasonStats>) =>
      [...m.entries()]
        .map(([pid, s]) => `${pid}:${s.apps}:${s.goals}:${s.assists}:${s.ratingSum}`)
        .sort()
        .join('|');
    expect(sig(a.merged)).toBe(sig(b.merged));
    expect(seasonStandings(a.world, a.season)).toEqual(seasonStandings(b.world, b.season));
    for (let i = 0; i < a.others.length; i++) {
      expect(seasonStandings(a.world, a.others[i]!.season)).toEqual(
        seasonStandings(b.world, b.others[i]!.season),
      );
    }
  });

  it('closeSeason LEGGE le stagioni già giocate (preSeasons) invece di risimularle', () => {
    const { world, club, season, others } = playWorldSeason(93);
    const expected = others.map((o) => ({
      leagueId: o.season.leagueId,
      table: seasonStandings(world, o.season).map((r) => `${r.clubId}:${r.points}`),
    }));
    const closed = closeSeason(world, season, 93, YEAR, {
      userClubId: club.id,
      preSeasons: new Map(others.map((o) => [o.season.leagueId, o.season])),
    });
    for (const exp of expected) {
      const got = closed.standingsByLeague.get(exp.leagueId)!.map((r) => `${r.clubId}:${r.points}`);
      expect(got).toEqual(exp.table);
    }
  });

  it('mergeSeasonStats: il trasferito di gennaio è la SOMMA delle due mezze stagioni', () => {
    const pid = 'p1' as PlayerId;
    const a = new Map<PlayerId, PlayerSeasonStats>([
      [pid, { ...emptyStats(), apps: 10, goals: 4, ratingSum: 62 }],
    ]);
    const b = new Map<PlayerId, PlayerSeasonStats>([
      [pid, { ...emptyStats(), apps: 8, goals: 3, ratingSum: 50 }],
    ]);
    const merged = mergeSeasonStats(new Map(), a);
    mergeSeasonStats(merged, b);
    const st = merged.get(pid)!;
    expect(st.apps).toBe(18);
    expect(st.goals).toBe(7);
    expect(st.ratingSum).toBe(112);
    // La riga di carriera comprime la stagione con la media giusta.
    const line = careerLineOf(st, YEAR, 'club-x', 2);
    expect(line.media).toBeCloseTo(112 / 18, 2);
    expect(line.goals).toBe(7);
  });
});
