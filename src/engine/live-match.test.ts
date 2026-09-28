import { describe, expect, it } from 'vitest';
import { leagueOfClub } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { createRunner, createSeason, seasonStandings } from './season.js';

const YEAR = 2026;

function setup(seed: number) {
  const world = generateWorld(createRng(seed));
  const club = [...world.clubs.values()][2]!;
  const season = createSeason(world, leagueOfClub(world, club.id), YEAR, seed + YEAR);
  const runner = createRunner(world, season, createRng(seed + YEAR));
  return { world, club, season, runner };
}

describe('DIRETTA — la partita dell’utente a finestre (season.playRoundLive)', () => {
  it('si apre, avanza a finestre, chiude la giornata con la classifica completa', () => {
    const { club, runner, season } = setup(81);
    const live = runner.playRoundLive(club.id);
    expect(live).not.toBeNull();
    expect(live!.minute()).toBe(0);
    live!.playTo(30);
    expect(live!.minute()).toBe(30);
    // La barra del momentum ha le sue finestre, coerenti coi totali.
    const wins = live!.windows();
    expect(wins.length).toBeGreaterThan(0);
    const sumShots = wins.reduce((s, w) => s + w.shotsHome + w.shotsAway, 0);
    const tot = live!.shots();
    expect(sumShots).toBe(tot.home + tot.away);
    const res = live!.finish();
    expect(live!.minute()).toBe(90);
    expect(live!.finished()).toBe(true);
    expect(res.userMatch?.played).toBe(true);
    // Il punteggio della sessione È quello del match; gli eventi-gol tornano.
    const score = live!.score();
    expect(res.userMatch?.homeGoals).toBe(score.home);
    expect(res.userMatch?.awayGoals).toBe(score.away);
    const goalEvents = res.userMatch?.events.filter((e) => e.type === 'goal') ?? [];
    expect(goalEvents.length).toBe(score.home + score.away);
    // La giornata è COMPLETA: tutte le gare del turno giocate, classifica intera.
    const played = season.fixtures.filter((m) => m.round === res.round);
    expect(played.every((m) => m.played)).toBe(true);
    expect(res.standings.length).toBeGreaterThan(0);
  });

  it('stesso mondo, stesse pause, nessun intervento → stessa partita (deterministica)', () => {
    const a = setup(82);
    const b = setup(82);
    const la = a.runner.playRoundLive(a.club.id)!;
    const lb = b.runner.playRoundLive(b.club.id)!;
    for (const m of [15, 45, 70]) {
      la.playTo(m);
      lb.playTo(m);
    }
    la.finish();
    lb.finish();
    expect(la.score()).toEqual(lb.score());
    expect(la.events().map((e) => `${e.minute}:${e.type}:${e.playerId}`)).toEqual(
      lb.events().map((e) => `${e.minute}:${e.type}:${e.playerId}`),
    );
  });

  it('le SOSTITUZIONI contano: entrano in campo, escono dalla panchina, massimo 5', () => {
    const { club, runner } = setup(83);
    const live = runner.playRoundLive(club.id)!;
    live.playTo(60);
    const side = live.userIsHome ? 'home' : 'away';
    const xi = live.onPitch(side);
    const bench = live.bench();
    expect(bench.length).toBeGreaterThan(0);
    const out = xi[10]!;
    const inn = bench[0]!;
    expect(live.sub(out.id, inn.id)).toBe(true);
    expect(live.subsLeft()).toBeLessThanOrEqual(4);
    const xiAfter = live.onPitch(side);
    expect(xiAfter.some((p) => p.id === inn.id)).toBe(true);
    expect(xiAfter.some((p) => p.id === out.id)).toBe(false);
    expect(live.bench().some((p) => p.id === inn.id)).toBe(false);
    // Il cambio è un evento vero della gara.
    const res = live.finish();
    expect(
      res.userMatch?.events.some(
        (e) => e.type === 'sub' && e.playerId === inn.id && e.subOutId === out.id,
      ),
    ).toBe(true);
    // Un cambio a gara finita non passa.
    expect(live.sub(xiAfter[0]!.id, live.bench()[0]?.id ?? out.id)).toBe(false);
  });

  it('la stagione prosegue sana dopo una diretta: il turno dopo si gioca normale', () => {
    const { club, runner, world, season } = setup(84);
    const live = runner.playRoundLive(club.id)!;
    live.playTo(50);
    live.finish();
    const res2 = runner.playRound(club.id);
    expect(res2.userMatch?.played).toBe(true);
    expect(seasonStandings(world, season).length).toBeGreaterThan(0);
  });
});
