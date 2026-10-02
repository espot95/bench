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
    // Il RECUPERO: la gara chiude tra il 91' e il 95', deciso al fischio d'inizio.
    expect(live!.fullTime()).toBeGreaterThanOrEqual(91);
    expect(live!.fullTime()).toBeLessThanOrEqual(95);
    expect(live!.minute()).toBe(live!.fullTime());
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

  it('le SOSTITUZIONI si ANNUNCIANO: entrano alla prossima interruzione, massimo 5', () => {
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
    // ANNUNCIATO, non ancora in campo: si aspetta che il gioco si fermi.
    expect(live.pendingSubs()).toHaveLength(1);
    expect(live.onPitch(side).some((p) => p.id === inn.id)).toBe(false);
    expect(live.onPitch(side).some((p) => p.id === out.id)).toBe(true);
    // Lo slot è già prenotato e il panchinaro riservato.
    expect(live.subsLeft()).toBeLessThanOrEqual(4);
    expect(live.bench().some((p) => p.id === inn.id)).toBe(false);
    const executeAt = live.pendingSubs()[0]!.executeAt;
    expect(executeAt).toBeGreaterThan(60);
    expect(executeAt).toBeLessThanOrEqual(63);
    // All'interruzione il cambio è FATTO.
    live.playTo(executeAt);
    expect(live.pendingSubs()).toHaveLength(0);
    const xiAfter = live.onPitch(side);
    expect(xiAfter.some((p) => p.id === inn.id)).toBe(true);
    expect(xiAfter.some((p) => p.id === out.id)).toBe(false);
    // Il cambio è un evento vero della gara, al minuto dell'interruzione.
    const res = live.finish();
    const subEvt = res.userMatch?.events.find(
      (e) => e.type === 'sub' && e.playerId === inn.id && e.subOutId === out.id,
    );
    expect(subEvt?.minute).toBe(executeAt);
    // Un cambio a gara finita non passa.
    expect(live.sub(xiAfter[0]!.id, live.bench()[0]?.id ?? out.id)).toBe(false);
  });

  it('un cambio annunciato si può ANNULLARE finché il gioco non si ferma', () => {
    const { club, runner } = setup(85);
    const live = runner.playRoundLive(club.id)!;
    live.playTo(30);
    const side = live.userIsHome ? 'home' : 'away';
    const out = live.onPitch(side)[9]!;
    const inn = live.bench()[0]!;
    expect(live.sub(out.id, inn.id)).toBe(true);
    expect(live.subsLeft()).toBe(4);
    expect(live.cancelSub(out.id)).toBe(true);
    expect(live.pendingSubs()).toHaveLength(0);
    expect(live.subsLeft()).toBe(5);
    expect(live.bench().some((p) => p.id === inn.id)).toBe(true);
    live.finish();
  });

  it('PAGELLE VIVE per tutti e 22: deterministiche, nei limiti, su entrambi i lati', () => {
    const { club, runner } = setup(86);
    const live = runner.playRoundLive(club.id)!;
    live.playTo(30);
    const mid = live.matchRatings();
    expect(mid.length).toBeGreaterThanOrEqual(22);
    expect(live.matchRatings()).toEqual(mid); // on-demand, senza draw: stabile
    live.finish();
    const fin = live.matchRatings();
    expect(fin.length).toBeGreaterThanOrEqual(22);
    expect(fin.some((r) => r.side === 'home')).toBe(true);
    expect(fin.some((r) => r.side === 'away')).toBe(true);
    for (const r of fin) {
      expect(r.pagella).toBeGreaterThanOrEqual(4);
      expect(r.pagella).toBeLessThanOrEqual(10);
      expect(r.minutes).toBeGreaterThan(0);
    }
    // I gol della gara tornano nei numeri individuali.
    const score = live.score();
    const sumGoals = fin.reduce((a, r) => a + r.goals, 0);
    expect(sumGoals).toBe(score.home + score.away);
  });

  it('l’INTERVALLO è un’interruzione: un cambio annunciato al 45′ entra subito', () => {
    const { club, runner } = setup(87);
    const live = runner.playRoundLive(club.id)!;
    live.playTo(45);
    expect(live.minute()).toBe(45);
    const side = live.userIsHome ? 'home' : 'away';
    const out = live.onPitch(side)[8]!;
    const inn = live.bench()[0]!;
    expect(live.sub(out.id, inn.id)).toBe(true);
    // Niente attesa: gioco già fermo, il cambio è FATTO negli spogliatoi.
    expect(live.pendingSubs()).toHaveLength(0);
    expect(live.onPitch(side).some((p) => p.id === inn.id)).toBe(true);
    live.finish();
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
