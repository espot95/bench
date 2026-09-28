import { describe, expect, it } from 'vitest';
import { computeOverall } from '../core/ratings.js';
import { leagueOfClub } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  ACADEMY,
  type AcademyState,
  academyIntake,
  growProspects,
  promoteProspect,
  pruneProspects,
  scoutJudgment,
  settleAcademyYear,
} from './academy.js';

const YEAR = 2026;

function setup(seed = 71) {
  const world = generateWorld(createRng(seed));
  const club = [...world.clubs.values()][3]!;
  const state: AcademyState = { level: 1, builtYear: YEAR, prospects: [] };
  return { world, club, state };
}

describe('settore giovanile (F4b, G1)', () => {
  it('la classe estiva: dimensione dal livello, deterministica, FUORI dal mondo', () => {
    const { world, club, state } = setup();
    const sizeBefore = world.players.size;
    const classe = academyIntake(world, club, state, YEAR);
    expect(classe).toHaveLength(ACADEMY.LEVELS[0]!.intake);
    // I ragazzi non toccano world.players (AI e lega intatte).
    expect(world.players.size).toBe(sizeBefore);
    for (const pr of classe) {
      expect(pr.player.age).toBeGreaterThanOrEqual(15);
      expect(pr.player.age).toBeLessThanOrEqual(17);
      expect(pr.player.trainedClubId).toBe(club.id);
    }
    // Stessa classe a parità di (club, anno): zero RNG di simulazione.
    const { world: w2, club: c2, state: s2 } = setup();
    const classe2 = academyIntake(w2, c2, s2, YEAR);
    expect(classe2.map((p) => p.player.name)).toEqual(classe.map((p) => p.player.name));
    // Il livello 4 porta una classe più numerosa.
    const { world: w3, club: c3, state: s3 } = setup();
    s3.level = 4;
    expect(academyIntake(w3, c3, s3, YEAR).length).toBe(ACADEMY.LEVELS[3]!.intake);
  });

  it('il giudizio è PARLATO, stabile, e la fiducia cresce con gli anni', () => {
    const { world, club, state } = setup();
    academyIntake(world, club, state, YEAR);
    const pr = state.prospects[0]!;
    const j0 = scoutJudgment(pr, YEAR);
    expect(['predestinato', 'da seguire', 'buon prospetto', 'grezzo']).toContain(j0.label);
    expect(j0.confidence).toBe('prima impressione');
    expect(scoutJudgment(pr, YEAR)).toEqual(j0);
    expect(scoutJudgment(pr, YEAR + 1).confidence).toBe('osservato');
    expect(scoutJudgment(pr, YEAR + 3).confidence).toBe('conosciuto');
  });

  it('crescita estiva verso il potenziale, uscita a fine età Primavera', () => {
    const { world, club, state } = setup();
    academyIntake(world, club, state, YEAR);
    const before = state.prospects.map((pr) => ({
      age: pr.player.age,
      ov: computeOverall(pr.player.position, pr.player.attributes),
    }));
    growProspects(state, YEAR + 1);
    state.prospects.forEach((pr, i) => {
      expect(pr.player.age).toBe(before[i]!.age + 1);
      expect(computeOverall(pr.player.position, pr.player.attributes)).toBeGreaterThanOrEqual(
        before[i]!.ov,
      );
    });
    // A LEAVE_AGE si esce.
    state.prospects[0]!.player.age = ACADEMY.LEAVE_AGE;
    const partiti = pruneProspects(state);
    expect(partiti).toHaveLength(1);
    expect(state.prospects.every((pr) => pr.player.age < ACADEMY.LEAVE_AGE)).toBe(true);
  });

  it('la promozione fa un Player VERO: contratto, cresciuto nel club, rosa aggiornata', () => {
    const { world, club, state } = setup();
    academyIntake(world, club, state, YEAR);
    const pr = state.prospects[0]!;
    const squadBefore = club.playerIds.length;
    const player = promoteProspect(world, club, state, pr.player.id as string, YEAR, 99);
    expect(player).not.toBeNull();
    expect(world.players.get(player!.id)).toBe(player);
    expect(club.playerIds).toContain(player!.id);
    expect(club.playerIds.length).toBe(squadBefore + 1);
    expect(player!.trainedClubId).toBe(club.id);
    const contract = player!.contractId ? world.contracts.get(player!.contractId) : undefined;
    expect(contract?.clubId).toBe(club.id);
    expect(state.prospects.some((x) => x.player.id === player!.id)).toBe(false);
    // Rosa piena = niente promozione.
    expect(
      promoteProspect(world, club, state, state.prospects[0]!.player.id as string, YEAR, 1),
    ).toBeNull();
  });

  it('il giro d’estate: retta a ledger, classe nuova, report completo', () => {
    const { world, club, state } = setup();
    academyIntake(world, club, state, YEAR);
    const cashBefore = club.finances.cash;
    const report = settleAcademyYear(world, club, state, YEAR + 1);
    expect(report.annualCost).toBe(ACADEMY.LEVELS[0]!.annual);
    expect(club.finances.cash).toBe(cashBefore - report.annualCost);
    expect(club.finances.expenses.some((e) => e.type === 'giovanile' && e.year === YEAR + 1)).toBe(
      true,
    );
    expect(report.classe.length).toBeGreaterThan(0);
    expect(state.lastIntakeYear).toBe(YEAR + 1);
  });
});
