import { describe, expect, it } from 'vitest';
import type { ClubId } from '../core/ids.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { CUP, createNationalCups, cupStagesDue, playCupStage, playCupToEnd } from './cup.js';
import { createRunner, createSeason, simulateSeason } from './season.js';

const YEAR = 2026;

describe('coppe nazionali knockout (MODULE_CUPS)', () => {
  it('creates the right cups: Coppa Italia for ITA, FA Cup + League Cup for ENG', () => {
    const w = generateWorld(createRng(81));
    const cups = createNationalCups(w, YEAR, 81);
    expect(cups.map((c) => c.id).sort()).toEqual(['coppa-italia', 'fa-cup', 'league-cup']);
    for (const cup of cups) {
      expect(cup.entrants).toHaveLength(40); // due divisioni per nazione
      expect(cup.stages).toHaveLength(6);
      expect(cup.stages[5]!.name).toBe('Finale');
    }
    const coppaItalia = cups.find((c) => c.id === 'coppa-italia')!;
    expect(coppaItalia.seeded).toBe(true);
    expect(coppaItalia.byes).toHaveLength(CUP.BYES);
    expect(cups.find((c) => c.id === 'fa-cup')!.seeded).toBe(false);
  });

  it('plays 40 down to a single winner; seeds enter at the Ottavi; every tie has a report', () => {
    const w = generateWorld(createRng(82));
    const cups = createNationalCups(w, YEAR, 82);
    const cup = cups.find((c) => c.id === 'coppa-italia')!;
    const byes = new Set(cup.byes);

    // Primi due turni: le teste di serie NON giocano.
    for (let s = 0; s < 2; s++) {
      const rep = playCupStage(w, cup);
      for (const tie of rep.results) {
        expect(byes.has(tie.homeClubId)).toBe(false);
        expect(byes.has(tie.awayClubId)).toBe(false);
      }
    }
    // Ottavi: 16 in campo, teste di serie incluse.
    const ottavi = playCupStage(w, cup);
    expect(ottavi.results).toHaveLength(8);
    const inOttavi = new Set(ottavi.results.flatMap((t) => [t.homeClubId, t.awayClubId]));
    for (const b of cup.byes) expect(inOttavi.has(b)).toBe(true);

    const rest = playCupToEnd(w, cup);
    const finale = rest[rest.length - 1]!;
    expect(finale.finished).toBe(true);
    expect(cup.winnerId).not.toBeNull();
    expect(finale.results[0]!.neutral).toBe(true);
    // Ogni partita giocata ha punteggio e vincitrice; referto con eventi.
    for (const stage of cup.stages) {
      for (const t of stage.ties) {
        expect(t.played).toBe(true);
        expect(t.winnerId).not.toBeNull();
        if (t.homeGoals === t.awayGoals) expect(t.shootout).toBeDefined();
      }
    }
  });

  it('FA Cup redraws randomly: different seeds produce different pairings', () => {
    const pairingsFor = (seed: number) => {
      const w = generateWorld(createRng(83));
      const cup = createNationalCups(w, YEAR, seed).find((c) => c.id === 'fa-cup')!;
      playCupStage(w, cup); // preliminare
      const rep = playCupStage(w, cup); // sedicesimi (sorteggio pieno)
      return rep.results.map((t) => `${t.homeClubId}|${t.awayClubId}`).join(',');
    };
    expect(pairingsFor(1)).not.toBe(pairingsFor(2));
    // Stesso seed → stesso sorteggio (determinismo).
    expect(pairingsFor(7)).toBe(pairingsFor(7));
  });

  it('winners cash the coppa line each round; the champion earns the big prize and reputation', () => {
    const w = generateWorld(createRng(84));
    const cup = createNationalCups(w, YEAR, 84).find((c) => c.id === 'coppa-italia')!;
    const repBefore = new Map([...w.clubs.values()].map((c) => [c.id, c.reputation]));
    playCupToEnd(w, cup);
    const winner = w.clubs.get(cup.winnerId as ClubId)!;
    const prize = winner.finances.incomes.filter((e) => e.type === 'coppa');
    expect(prize.some((e) => e.note?.includes('TROFEO'))).toBe(true);
    expect(prize.find((e) => e.note?.includes('TROFEO'))!.amount).toBe(
      Math.round(CUP.WINNER_PRIZE * cup.prizeMult),
    );
    expect(winner.reputation).toBe(Math.min(99, (repBefore.get(winner.id) ?? 0) + CUP.REP_WINNER));
    // Chi supera un turno incassa; chi esce al primo turno non ha voci coppa.
    const firstRoundLosers = cup.stages[0]!.ties.map((t) =>
      t.winnerId === t.homeClubId ? t.awayClubId : t.homeClubId,
    );
    for (const id of firstRoundLosers) {
      const club = w.clubs.get(id)!;
      expect(club.finances.incomes.filter((e) => e.type === 'coppa')).toHaveLength(0);
    }
  });

  it('cups never touch the league streams: the league table is byte-identical with or without cups', () => {
    const run = (withCups: boolean) => {
      const w = generateWorld(createRng(85));
      const league = w.leagues[0]!;
      const season = createSeason(w, league, YEAR, 850);
      if (withCups) {
        const cups = createNationalCups(w, YEAR, 85);
        for (const cup of cups) playCupToEnd(w, cup);
      }
      simulateSeason(w, season, createRng(850), { aiMarket: false });
      return season.fixtures.map((m) => `${m.id}:${m.homeGoals}-${m.awayGoals}`).join(';');
    };
    expect(run(true)).toBe(run(false));
  });

  it('league-unavailable players sit out the cup; cup reds sit out the next cup tie', () => {
    // Indisponibile di campionato → mai in campo in coppa (ponte v2).
    const w = generateWorld(createRng(87));
    const cup = createNationalCups(w, YEAR, 87).find((c) => c.id === 'coppa-italia')!;
    const clubId = cup.alive[0]!;
    const star = w.clubs
      .get(clubId)!
      .playerIds.map((id) => w.players.get(id)!)
      .sort((a, b) => b.age - a.age)[0]!; // uno qualsiasi: basta che sia titolare o no
    const rep = playCupStage(w, cup, {
      unavailable: new Map([[clubId, new Set([star.id])]]),
      bridge: true,
    });
    const fielded = rep.participants.find(([id]) => id === clubId);
    expect(fielded).toBeDefined();
    expect(fielded![1].includes(star.id)).toBe(false);

    // Rosso in coppa → salta il turno di coppa successivo (squalifica PER competizione).
    for (let seed = 88; seed < 110; seed++) {
      const w2 = generateWorld(createRng(88));
      const cup2 = createNationalCups(w2, YEAR, seed).find((c) => c.id === 'coppa-italia')!;
      const first = playCupStage(w2, cup2, { bridge: true });
      const redOfWinner = first.results.flatMap((t) =>
        t.events
          .filter((e) => e.type === 'red' && e.clubId === t.winnerId)
          .map((e) => ({ clubId: e.clubId, playerId: e.playerId })),
      )[0];
      if (!redOfWinner) continue;
      expect(cup2.suspended?.[redOfWinner.clubId as string]).toContain(redOfWinner.playerId);
      const second = playCupStage(w2, cup2, { bridge: true });
      const xi = second.participants.find(([id]) => id === redOfWinner.clubId);
      expect(xi![1].includes(redOfWinner.playerId)).toBe(false);
      return;
    }
    throw new Error('nessun rosso a una vincitrice in 22 seed: alza la finestra del test');
  });

  it('cup injuries flow back into the league runner; fatigue marks the next round and expires', () => {
    const w = generateWorld(createRng(89));
    const league = w.leagues[0]!;
    const season = createSeason(w, league, YEAR, 890);
    const runner = createRunner(w, season, createRng(890), { aiMarket: false });
    runner.playRound();

    const clubId = league.clubIds[0]!;
    const pid = w.clubs.get(clubId)!.playerIds[0]!;
    runner.applyCupEffects({ injuries: [{ playerId: pid, matches: 3 }], fatigued: [pid] });
    expect(runner.unavailableNow(clubId).has(pid)).toBe(true);
    // Nello snapshot (salvataggi a metà stagione) fatica e infortunio ci sono.
    const snap = runner.snapshot();
    expect(snap.injuredUntil.some(([id]) => id === pid)).toBe(true);
    expect(snap.fatiguedUntil?.some(([id]) => id === pid)).toBe(true);
    // Dopo 3 giornate torna disponibile; la fatica è già evaporata.
    runner.playRound();
    runner.playRound();
    runner.playRound();
    expect(runner.unavailableNow(clubId).has(pid)).toBe(false);
    expect(runner.snapshot().fatiguedUntil?.length ?? 0).toBe(0);
  });

  it('fatigue changes at least one league result across seeds (same RNG draws, shifted strength)', () => {
    let flipped = false;
    for (let seed = 0; seed < 12 && !flipped; seed++) {
      const play = (withFatigue: boolean) => {
        const w = generateWorld(createRng(90));
        const league = w.leagues[0]!;
        const season = createSeason(w, league, YEAR, 900 + seed);
        const runner = createRunner(w, season, createRng(900 + seed), { aiMarket: false });
        if (withFatigue) {
          // Tutta la lega ha giocato in coppa: gambe pesanti alla prima giornata.
          const all = league.clubIds.flatMap((id) => w.clubs.get(id)?.playerIds ?? []);
          runner.applyCupEffects({ injuries: [], fatigued: all });
        }
        runner.playRound();
        return season.fixtures
          .filter((m) => m.round === 1)
          .map((m) => `${m.homeGoals}-${m.awayGoals}`)
          .join(';');
      };
      if (play(true) !== play(false)) flipped = true;
    }
    expect(flipped).toBe(true);
  });

  it('user home cup ties post the gate line; stages come due at league checkpoints', () => {
    const w = generateWorld(createRng(86));
    const cup = createNationalCups(w, YEAR, 86).find((c) => c.id === 'coppa-italia')!;
    expect(cupStagesDue(cup, CUP.AFTER_ROUNDS[0]! - 1)).toBe(false);
    expect(cupStagesDue(cup, CUP.AFTER_ROUNDS[0]!)).toBe(true);

    // L'utente è una squadra fuori dalle teste di serie: gioca dal primo turno.
    const userId = cup.alive[0]!;
    playCupToEnd(w, cup, { userClubId: userId });
    const user = w.clubs.get(userId)!;
    const playedHome = cup.stages.some((s) =>
      s.ties.some((t) => !t.neutral && t.homeClubId === userId),
    );
    const gate = user.finances.incomes.filter(
      (e) => e.type === 'gate' && e.note?.startsWith('coppa'),
    );
    expect(gate.length > 0).toBe(playedHome);
  });
});
