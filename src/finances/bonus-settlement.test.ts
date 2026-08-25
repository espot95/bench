import { describe, expect, it } from 'vitest';
import { leagueOfClub } from '../core/types.js';
import { closeSeason } from '../engine/career.js';
import { topScorers } from '../engine/player-stats.js';
import { createSeason, simulateSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';

const YEAR = 2026;
const SEED = 13;

describe('contract bonus settlement (finances)', () => {
  it('pays exactly what the season events earned, onto cash and ledger', () => {
    const world = generateWorld(createRng(SEED));
    const club = [...world.clubs.values()][1]!;
    const league = leagueOfClub(world, club.id);
    const season = createSeason(world, league, YEAR, SEED + YEAR);
    simulateSeason(world, season, createRng(SEED + YEAR));

    // Bonus negoziato sul miglior marcatore del club + trofeo/top4 sul contratto.
    const scorer = topScorers(season.fixtures, Number.POSITIVE_INFINITY).find(
      (r) => r.clubId === club.id && r.goals > 0,
    );
    if (!scorer) throw new Error('no scorer found for the club');
    const player = world.players.get(scorer.playerId)!;
    const contract = world.contracts.get(player.contractId!)!;
    contract.bonuses = { perGoal: 20_000, perAssist: 10_000, trophy: 2_000_000 };

    const closed = closeSeason(world, season, SEED, YEAR, { userClubId: club.id });
    const pos = closed.finalTable.findIndex((r) => r.clubId === club.id) + 1;
    const expected = 20_000 * scorer.goals + 10_000 * scorer.assists + (pos === 1 ? 2_000_000 : 0);

    expect(closed.bonusPaid.get(club.id)).toBe(expected);
    const entry = club.finances.expenses.find((e) => e.note === 'bonus contrattuali');
    expect(entry?.amount).toBe(expected);
    // La cassa si muove ANCHE per l'economia annuale: il delta del SOLO bonus si misura
    // contro un mondo gemello identico ma senza bonus a contratto.
    const world2 = generateWorld(createRng(SEED));
    const club2 = [...world2.clubs.values()][1]!;
    const season2 = createSeason(world2, leagueOfClub(world2, club2.id), YEAR, SEED + YEAR);
    simulateSeason(world2, season2, createRng(SEED + YEAR));
    const closed2 = closeSeason(world2, season2, SEED, YEAR, { userClubId: club2.id });
    expect(closed2.bonusPaid.get(club2.id)).toBeUndefined();
    expect(club2.finances.cash - club.finances.cash).toBe(expected);
  });
});
