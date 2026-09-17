import { describe, expect, it } from 'vitest';
import { asPlayerId } from '../core/ids.js';
import { neutralPersonality } from '../core/personality.js';
import type { Player, Position } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { matchStrength, naturalFielded } from './lineup.js';
import { PLAN, applyTeamPlan, depthDanger, planStyleMods, setPieceFactors } from './plan.js';
import { createRunner, createSeason } from './season.js';

let seq = 0;
function make(position: Position, attrs: Record<string, number>, height?: number): Player {
  const base: Record<string, number> = {
    pace: 60,
    stamina: 60,
    strength: 60,
    workRate: 60,
    positioning: 60,
    decisions: 60,
    composure: 60,
    ...(position === 'GK'
      ? { reflexes: 60, handling: 60, aerial: 60, oneOnOne: 60 }
      : { finishing: 60, passing: 60, tackling: 60, dribbling: 60, marking: 60 }),
    ...attrs,
  };
  return {
    id: asPlayerId(`plan-${seq++}`),
    name: `P${seq}`,
    age: 26,
    nationality: 'ITA',
    position,
    preferredFoot: 'R',
    attributes: base as never,
    potential: 80,
    personality: neutralPersonality(),
    injuryProneness: 0.3,
    morale: 0.5,
    contractId: null,
    height,
  } as Player;
}

const NEUTRAL = { ownShots: 1, ownTilt: 1, oppShots: 1, oppTilt: 1 };

function xi(defPace: number): Player[] {
  return [
    make('GK', {}),
    ...Array.from({ length: 4 }, () => make('DF', { pace: defPace, marking: 70 })),
    ...Array.from({ length: 4 }, () => make('MF', {})),
    make('FW', {}),
    make('FW', {}),
  ];
}

describe('piano partita (engine/plan)', () => {
  it('un round senza piano è byte-identico a un piano vuoto', () => {
    const scores = (withEmptyPlan: boolean) => {
      const w = generateWorld(createRng(96));
      const l = w.leagues[0]!;
      const s = createSeason(w, l, 2026, 777);
      const r = createRunner(w, s, createRng(777), { aiMarket: false });
      if (withEmptyPlan) r.setPlan(l.clubIds[0]!, {});
      r.playRound();
      return s.fixtures
        .filter((m) => m.round === 1)
        .map((m) => `${m.homeGoals}-${m.awayGoals}`)
        .join(';');
    };
    expect(scores(true)).toBe(scores(false));
  });

  it('la linea ALTA è punita dalla profondità: falcatore veloce vs linea lenta', () => {
    const slowLine = xi(55);
    const fastLine = xi(78);
    const oppWithSprinter = [
      ...xi(60).slice(0, 9),
      make('FW', { pace: 85 }, 193), // falcata
      make('FW', {}),
    ];
    expect(depthDanger(slowLine, oppWithSprinter)).toBeGreaterThan(
      depthDanger(fastLine, oppWithSprinter),
    );
    const vsSlow = applyTeamPlan(NEUTRAL, { line: 'alta' }, slowLine, oppWithSprinter);
    const vsFast = applyTeamPlan(NEUTRAL, { line: 'alta' }, fastLine, oppWithSprinter);
    expect(vsSlow.oppTilt).toBeGreaterThan(vsFast.oppTilt); // concede più qualità
    expect(vsSlow.oppShots).toBeLessThan(1); // ma recupera palloni
    const bassa = applyTeamPlan(NEUTRAL, { line: 'bassa' }, slowLine, oppWithSprinter);
    expect(bassa.oppTilt).toBeLessThan(1);
    expect(bassa.ownShots).toBeLessThan(1);
  });

  it('la marcatura a UOMO rende coi marcatori veri e si ritorce senza', () => {
    const good = xi(60); // marking 70
    const bad = [
      make('GK', {}),
      ...Array.from({ length: 4 }, () => make('DF', { marking: 45 })),
      ...Array.from({ length: 4 }, () => make('MF', {})),
      make('FW', {}),
      make('FW', {}),
    ];
    const opp = xi(60);
    expect(applyTeamPlan(NEUTRAL, { marking: 'uomo' }, good, opp).oppTilt).toBeLessThan(1);
    expect(applyTeamPlan(NEUTRAL, { marking: 'uomo' }, bad, opp).oppTilt).toBeGreaterThan(1);
  });

  it('lo stile IMPOSTO paga l’attrito: col tecnico allineato la deviazione è maggiore', () => {
    const w = generateWorld(createRng(21));
    const club = [...w.clubs.values()][0]!;
    const coach = [...(w.managers?.values() ?? [])].find((m) => m.clubId === club.id);
    if (!coach) return;
    coach.style = 'catenaccio';
    const aligned = planStyleMods(w, club, coach, 'catenaccio');
    const imposed = planStyleMods(w, club, coach, 'possession');
    // deviazione dal neutro: allineato più marcata dell'imposto (attrito 0.6)
    const dev = (m: { oppShots: number }) => Math.abs(m.oppShots - 1);
    expect(dev(aligned)).toBeGreaterThan(0);
    coach.style = 'possession';
    const nowAligned = planStyleMods(w, club, coach, 'possession');
    expect(dev(nowAligned)).toBeGreaterThan(dev(imposed));
  });

  it('le marcature speciali sui piazzati spengono la torre; le preventive scambiano ripartenze per peso offensivo', () => {
    const tower = make('FW', { strength: 80, positioning: 72 }, 196);
    const opp = [...xi(60).slice(0, 10), tower];
    const stopper = make('DF', { marking: 80, strength: 78 }, 195);
    const mine = [make('GK', {}), stopper, ...xi(60).slice(2)];
    const noSpecial = setPieceFactors({ scheme: 'zona' }, mine, opp);
    const withSpecial = setPieceFactors(
      {
        scheme: 'zona',
        special: [{ targetId: tower.id as string, markerId: stopper.id as string }],
      },
      mine,
      opp,
    );
    expect(withSpecial.oppTilt).toBeLessThan(noSpecial.oppTilt);
    const prev = setPieceFactors({ scheme: 'zona', preventive: true }, mine, opp);
    expect(prev.oppShots).toBeLessThan(1);
    expect(prev.ownTilt).toBeLessThan(noSpecial.ownTilt);
  });

  it('il capitano DESIGNATO conta: dare la fascia al gregario costa qualcosa', () => {
    const w = generateWorld(createRng(21));
    const club = [...w.clubs.values()][0]!;
    const fielded = naturalFielded(club, w);
    const leader = [...fielded.players].sort(
      (a, b) => b.personality.leadership - a.personality.leadership,
    )[0]!;
    const grunt = [...fielded.players].sort(
      (a, b) => a.personality.leadership - b.personality.leadership,
    )[0]!;
    if (leader.personality.leadership <= grunt.personality.leadership + 0.05) return;
    const auto = matchStrength(fielded, createRng(5), 0);
    const withGrunt = matchStrength(fielded, createRng(5), 0, grunt.id as string);
    expect(withGrunt.overall).toBeLessThan(auto.overall);
  });
});
