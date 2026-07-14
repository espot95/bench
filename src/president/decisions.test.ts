import { describe, expect, it } from 'vitest';
import { wageBudgetStatus } from '../core/finance.js';
import { asAgencyId, asPlayerId, asPresidentId } from '../core/ids.js';
import { neutralPersonality } from '../core/personality.js';
import { playerOverall } from '../core/ratings.js';
import type { Club, Personality, Player, President, World } from '../core/types.js';
import { buildFreeAgentPool } from '../generation/free-agents.js';
import { generateWorld } from '../generation/generate-world.js';
import { signFreeAgent } from '../market/signing.js';
import { createRng } from '../rng/rng.js';
import { evaluateProposal } from './decisions.js';

let seq = 0;
/** Free-agent test player with flat attributes (derived overall = `overall`). */
function fa(overall: number, age: number, nationality = 'ITA', withAgency = true): Player {
  const v = overall;
  return {
    id: asPlayerId(`fa-t-${seq++}`),
    name: 'Svincolato Test',
    age,
    nationality,
    position: 'MF',
    preferredFoot: 'R',
    attributes: {
      pace: v,
      stamina: v,
      strength: v,
      workRate: v,
      positioning: v,
      decisions: v,
      composure: v,
      finishing: v,
      passing: v,
      tackling: v,
      dribbling: v,
      marking: v,
    },
    potential: Math.min(99, overall + 5),
    personality: neutralPersonality(),
    injuryProneness: 0.5,
    morale: 0.5,
    agencyId: withAgency ? asAgencyId('agent-1') : null,
    trainedClubId: null,
    contractId: null,
  };
}

function president(traits: Partial<Personality>, clubId: Club['id']): President {
  return {
    id: asPresidentId(`pres-t-${seq++}`),
    name: 'Presidente Test',
    age: 60,
    nationality: 'ITA',
    personality: { ...neutralPersonality(), ...traits },
    reputation: 70,
    exPlayer: false,
    clubId,
  };
}

function squadAvg(world: World, club: Club): number {
  const xs = club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => playerOverall(p));
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe('president proposals (MODULE_PRESIDENT §6)', () => {
  const world = generateWorld(createRng(5));
  const club = [...world.clubs.values()][0]!; // top-rep Italian club
  const englishClub = [...world.clubs.values()][45]!; // an English club (nation 2)

  it('hard constraints are never violated across many proposals', () => {
    for (const seed of [1, 2, 3]) {
      const pool = buildFreeAgentPool(world, createRng(seed), 2026, []);
      const pres = [...world.presidents!.values()].find((p) => p.clubId === club.id)!;
      const { headroom } = wageBudgetStatus(world, club);
      for (const p of pool) {
        const v = evaluateProposal(world, club, pres, p, 2026, 0, createRng(seed + 100));
        if (v.approved) {
          expect(v.wage!).toBeLessThanOrEqual(headroom);
          expect(v.commission!).toBeLessThanOrEqual(club.finances.cash);
        }
      }
    }
  });

  it('the seasonal non-EU cap bites in Italy and is uncapped in England', () => {
    const calm = president({ temperament: 0, ambition: 0.9 }, club.id);
    const brazilian = fa(Math.round(squadAvg(world, club)), 25, 'BRA');
    // Italy: cap is 2 → third non-EU signing is rejected for the cap, whatever the merit.
    const blocked = evaluateProposal(world, club, calm, brazilian, 2026, 2, createRng(1));
    expect(blocked.approved).toBe(false);
    expect(blocked.reason).toMatch(/extracomunitari/i);
    // Under the cap, the cap is not the reason (merit may still reject).
    const open = evaluateProposal(world, club, calm, brazilian, 2026, 1, createRng(1));
    expect(open.reason).not.toMatch(/extracomunitari/i);
    // England: nonEuCap is null → never rejected for the cap even with huge usage.
    const engPres = president({ temperament: 0, ambition: 0.9 }, englishClub.id);
    const forEngland = fa(Math.round(squadAvg(world, englishClub)), 25, 'BRA');
    const eng = evaluateProposal(world, englishClub, engPres, forEngland, 2026, 99, createRng(1));
    expect(eng.reason).not.toMatch(/extracomunitari/i);
  });

  it('character matters: an ambitious president approves marginal deals a prudent one rejects', () => {
    const ambitious = president({ ambition: 0.95, composure: 0.05, temperament: 0 }, club.id);
    const prudent = president({ ambition: 0.05, composure: 0.95, temperament: 0 }, club.id);
    const avg = squadAvg(world, club);

    let ambitiousYes = 0;
    let prudentYes = 0;
    for (let i = 0; i < 20; i++) {
      // Marginal candidates: clearly below the squad level, where quality margins differ.
      const candidate = fa(Math.round(avg - 6 - (i % 5)), 24 + (i % 6), 'ITA');
      if (evaluateProposal(world, club, ambitious, candidate, 2026, 0, createRng(i)).approved)
        ambitiousYes++;
      if (evaluateProposal(world, club, prudent, candidate, 2026, 0, createRng(i)).approved)
        prudentYes++;
    }
    expect(ambitiousYes).toBeGreaterThan(prudentYes);
  });

  it('a professional president rejects veterans who do not raise the level', () => {
    const corporate = president(
      { professionalism: 0.9, temperament: 0, ambition: 0.5, composure: 0.5 },
      club.id,
    );
    const veteran = fa(Math.round(squadAvg(world, club)), 34, 'ITA');
    const v = evaluateProposal(world, club, corporate, veteran, 2026, 0, createRng(2));
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/anni/i);
  });

  it('an approved signing joins the squad, pays the agency from cash and writes the ledger', () => {
    const w = generateWorld(createRng(9));
    const c = [...w.clubs.values()][0]!;
    const gem = fa(Math.round(squadAvg(w, c) + 6), 23, 'ITA'); // clearly good → merit passes
    const eager = president({ ambition: 0.9, temperament: 0 }, c.id);
    const verdict = evaluateProposal(w, c, eager, gem, 2026, 0, createRng(3));
    expect(verdict.approved).toBe(true);

    const cashBefore = c.finances.cash;
    const squadBefore = c.playerIds.length;
    const contract = signFreeAgent(
      w,
      c,
      gem,
      { wage: verdict.wage!, years: verdict.years!, commission: verdict.commission! },
      2026,
    );

    expect(w.players.get(gem.id)).toBe(gem); // ephemeral prospect materialised
    expect(c.playerIds).toContain(gem.id);
    expect(c.playerIds).toHaveLength(squadBefore + 1);
    expect(gem.contractId).toBe(contract.id);
    expect(contract.wage).toBe(verdict.wage);
    expect(contract.endYear).toBe(2026 + verdict.years! - 1);
    expect(c.finances.cash).toBe(cashBefore - verdict.commission!);
    const entry = c.finances.expenses.at(-1)!;
    expect(entry.type).toBe('agency_fees');
    expect(entry.amount).toBe(verdict.commission);
  });

  it('self-represented players cost no commission', () => {
    const w = generateWorld(createRng(11));
    const c = [...w.clubs.values()][0]!;
    const solo = fa(Math.round(squadAvg(w, c) + 6), 23, 'ITA', false);
    const eager = president({ ambition: 0.9, temperament: 0 }, c.id);
    const verdict = evaluateProposal(w, c, eager, solo, 2026, 0, createRng(4));
    expect(verdict.approved).toBe(true);
    expect(verdict.commission).toBe(0);
    const cashBefore = c.finances.cash;
    signFreeAgent(w, c, solo, { wage: verdict.wage!, years: verdict.years!, commission: 0 }, 2026);
    expect(c.finances.cash).toBe(cashBefore);
    expect(c.finances.expenses).toHaveLength(0);
  });
});
