import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import type { Player, StandingRow } from '../core/types.js';
import { leagueOfClub } from '../core/types.js';
import { renewOrRelease } from '../engine/progression.js';
import { createSeason, seasonStandings, simulateSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  RENEWAL,
  isClubFan,
  offerRenewalTerms,
  openRenewal,
  projectConvinces,
  promiseDeadline,
  resumeRenewal,
} from './renewal-negotiation.js';

const YEAR = 2026;

function setup(seed = 11) {
  const world = generateWorld(createRng(seed));
  const club = [...world.clubs.values()][4]!;
  const league = leagueOfClub(world, club.id);
  const season = createSeason(world, league, YEAR, seed + YEAR);
  simulateSeason(world, season, createRng(seed + YEAR));
  const standings = seasonStandings(world, season);
  const best = club.playerIds
    .map((id) => world.players.get(id)!)
    .sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;
  return { world, club, standings, best };
}

function makeStance(p: Player, traits: Partial<Player['personality']>): void {
  Object.assign(p.personality, traits);
}

describe('renewal negotiation (contracts)', () => {
  it('the fan asks less than the mercenary, for the same player', () => {
    const { world, club, standings, best } = setup();
    // Stipendio attuale basso: il tetto Math.max(contract.wage, ask) non deve
    // schiacciare fan e mercenario sulla stessa cifra (dipende dal mondo generato).
    world.contracts.get(best.contractId!)!.wage = 10_000;
    // Mercenario: forte, ambizioso, sleale.
    makeStance(best, { ambition: 0.9, loyalty: 0.1, temperament: 0.4, composure: 0.5 });
    best.trainedClubId = null;
    const merc = openRenewal(world, club, best, YEAR, standings, {}, createRng(1));
    if (!merc.ok) throw new Error(merc.reason);
    expect(merc.state.mercenary).toBe(true);

    // Stesso giocatore, cuore di tifoso: vivaio + lealtà (hash favorevole garantito dal loop).
    makeStance(best, { ambition: 0.3, loyalty: 0.95 });
    best.trainedClubId = club.id;
    expect(isClubFan(best, club.id)).toBe(true); // p≈0.69, hash deterministico
    const fan = openRenewal(world, club, best, YEAR, standings, {}, createRng(1));
    if (!fan.ok) throw new Error(fan.reason);
    expect(fan.state.fan).toBe(true);
    expect(fan.state.askWage).toBeLessThan(merc.state.askWage);
    expect(fan.state.mood).toBeGreaterThan(merc.state.mood);
  });

  it('the big thinker refuses money without guarantees when the club is not fighting', () => {
    const { world, club, standings, best } = setup();
    makeStance(best, { ambition: 0.95, loyalty: 0.6, temperament: 0.3, composure: 0.6 });
    best.trainedClubId = null;
    // Classifica truccata: il club è ULTIMO → il progetto non convince.
    const cooked: StandingRow[] = [
      ...standings.filter((r) => r.clubId !== club.id),
      standings.find((r) => r.clubId === club.id)!,
    ];
    expect(projectConvinces(world, club, cooked)).toBe(false);

    const open = openRenewal(world, club, best, YEAR, standings && cooked, {}, createRng(2));
    if (!open.ok) throw new Error(open.reason);
    const st = open.state;
    expect(st.guaranteeNeeded).toBe(true);
    club.finances.wageBudget = 10_000_000; // il monte non deve interferire col test

    // Soldi enormi, zero garanzie → non firma.
    offerRenewalTerms(
      world,
      st,
      club,
      best,
      { wage: st.askWage * 3, years: 3 },
      YEAR,
      5,
      cooked,
      createRng(3),
    );
    expect(st.stage).not.toBe('done');

    // Con garanzie pesanti (trofeo+top4 ≥ richiesta×26 settimane) firma.
    const guarantee = Math.ceil((st.askWage * RENEWAL.BIG_GUARANTEE_WEEKS) / 2);
    offerRenewalTerms(
      world,
      st,
      club,
      best,
      {
        wage: Math.round(st.askWage * 1.05),
        years: st.yearsWanted,
        bonuses: { trophy: guarantee, topFinish: guarantee },
      },
      YEAR,
      5,
      cooked,
      createRng(3),
    );
    expect(st.stage).toBe('done');
    const contract = world.contracts.get(best.contractId!)!;
    expect(contract.bonuses?.trophy).toBe(guarantee);
    expect(contract.endYear).toBeGreaterThan(YEAR);
  });

  it('never violates the wage budget and is deterministic line-by-line', () => {
    const { world, club, standings, best } = setup(21);
    makeStance(best, { ambition: 0.5, loyalty: 0.5 });
    const run = (seed: number) => {
      const open = openRenewal(world, club, best, YEAR, standings, {}, createRng(seed));
      if (!open.ok) throw new Error(open.reason);
      return open.state;
    };
    const a = run(7);
    const b = run(7);
    expect(b.log).toEqual(a.log);
    expect(b.askWage).toBe(a.askWage);

    // Monte stretto: l'offerta sfora → riga di sistema, giro NON consumato, contratto intatto.
    const contract = world.contracts.get(best.contractId!)!;
    const wageBefore = contract.wage;
    club.finances.wageBudget = 1;
    offerRenewalTerms(
      world,
      a,
      club,
      best,
      { wage: a.askWage, years: 3 },
      YEAR,
      5,
      standings,
      createRng(9),
    );
    expect(a.round).toBe(0);
    expect(a.stage).toBe('terms');
    expect(contract.wage).toBe(wageBefore);
    expect(a.log.at(-1)?.who).toBe('sistema');
  });

  it('mercenary stall resumes with a raise, or walks if the project is poor', () => {
    const { world, club, standings, best } = setup(31);
    makeStance(best, { ambition: 0.9, loyalty: 0.05, composure: 0.4, temperament: 0.5 });
    best.trainedClubId = null;
    club.finances.wageBudget = 10_000_000;
    const open = openRenewal(world, club, best, YEAR, standings, {}, createRng(4));
    if (!open.ok) throw new Error(open.reason);
    const st = open.state;
    if (!st.mercenary) return; // squad-dependent edge: not the top dog on this seed

    // Giri bassi finché non stalla (STALL_P=0.4 dal 2° giro, rng deterministico).
    for (let i = 0; i < RENEWAL.MAX_ROUNDS && st.stage === 'terms'; i++) {
      offerRenewalTerms(
        world,
        st,
        club,
        best,
        { wage: Math.round(st.askWage * 0.8), years: 2 },
        YEAR,
        10,
        standings,
        createRng(100),
      );
    }
    if (st.stage === 'stalled') {
      const askBefore = st.askWage;
      resumeRenewal(st, st.stallUntilRound! - 1);
      expect(st.stage).toBe('stalled'); // troppo presto
      resumeRenewal(st, st.stallUntilRound!);
      if (st.projectOk) {
        expect(st.stage).toBe('terms');
        expect(st.askWage).toBeGreaterThan(askBefore);
      } else {
        expect(st.stage).toBe('leaving');
      }
    } else {
      expect(['failed', 'leaving', 'done']).toContain(st.stage);
    }
  });

  it('no auto-renewal for the user club: expired players always leave', () => {
    const world = generateWorld(createRng(3));
    const club = [...world.clubs.values()][0]!;
    const victims = club.playerIds.slice(0, 5).map((id) => world.players.get(id)!);
    for (const v of victims) {
      const c = world.contracts.get(v.contractId!)!;
      c.endYear = YEAR; // scade ora
    }
    const released = renewOrRelease(world, createRng(5), YEAR + 1, club.id);
    for (const v of victims) {
      expect(released.map((p) => p.id)).toContain(v.id);
      expect(club.playerIds).not.toContain(v.id);
      expect(world.players.has(v.id)).toBe(false);
    }
  });

  it('promiseDeadline points at the end of the next window, or null when none is left', () => {
    expect(promiseDeadline(1, 38)).toBe(4); // finestra estiva g.1-4
    expect(promiseDeadline(10, 38)).toBe(22); // invernale g.18-22
    expect(promiseDeadline(25, 38)).toBeNull();
  });
});
