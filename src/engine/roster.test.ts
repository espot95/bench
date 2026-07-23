import { describe, expect, it } from 'vitest';
import { emptyFinances } from '../core/finance.js';
import { asClubId, asLeagueId, asNationId, asPlayerId } from '../core/ids.js';
import type { ClubId, PlayerId } from '../core/ids.js';
import { neutralPersonality } from '../core/personality.js';
import { defaultStadium } from '../core/stadium.js';
import type { Club, Nation, Player, RosterRules, World } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { buildRosterList, ineligiblePlayers } from './roster.js';

const RULES: RosterRules = {
  enabled: true,
  listSize: 25,
  minGoalkeepers: 2,
  minNationTrained: 8,
  minClubTrained: 4,
  under22Age: 22,
  nonEuCap: 2,
  minPlayAge: 18,
};

const CLUB = asClubId('c1');
const OTHER = asClubId('c2'); // another club of the same nation

interface Spec {
  age?: number;
  nationality?: string;
  trainedClubId?: ClubId | null;
  overall?: number;
  position?: Player['position'];
}

let seq = 0;
function pl(spec: Spec = {}): Player {
  const overall = spec.overall ?? 70;
  const common = {
    pace: overall,
    stamina: overall,
    strength: overall,
    workRate: overall,
    positioning: overall,
    decisions: overall,
    composure: overall,
  };
  // Flat attributes at `overall` → derived playerOverall() equals `overall` exactly.
  const a =
    (spec.position ?? 'MF') === 'GK'
      ? { ...common, reflexes: overall, handling: overall, aerial: overall, oneOnOne: overall }
      : {
          ...common,
          finishing: overall,
          passing: overall,
          tackling: overall,
          dribbling: overall,
          marking: overall,
        };
  return {
    id: asPlayerId(`p${seq++}`),
    name: 'X',
    age: spec.age ?? 25,
    nationality: spec.nationality ?? 'ITA',
    position: spec.position ?? 'MF',
    preferredFoot: 'R',
    attributes: a,
    potential: 80,
    personality: neutralPersonality(),
    injuryProneness: 0.5,
    morale: 0.5,
    trainedClubId: spec.trainedClubId,
    contractId: null,
  };
}

function makeWorld(players: Player[], rules: RosterRules): { world: World; club: Club } {
  const nation: Nation = {
    id: asNationId('n1'),
    code: 'ITA',
    name: 'Italia',
    euMember: true,
    homeNationality: 'ITA',
    rosterRules: rules,
  };
  const club: Club = {
    id: CLUB,
    name: 'Club',
    shortName: 'CLB',
    reputation: 60,
    stadium: defaultStadium(10000),
    finances: emptyFinances(),
    elo: 1500,
    playerIds: players.map((p) => p.id),
  };
  const other: Club = { ...club, id: OTHER, playerIds: [] };
  const world: World = {
    leagues: [
      {
        id: asLeagueId('l1'),
        name: 'Serie A',
        tier: 1,
        clubIds: [CLUB, OTHER],
        nationId: nation.id,
      },
    ],
    nations: [nation],
    clubs: new Map([
      [CLUB, club],
      [OTHER, other],
    ]),
    players: new Map(players.map((p) => [p.id, p])),
    contracts: new Map(),
  };
  return { world, club };
}

/** A home-grown Italian trained at this club (club-trained). */
const homegrown = (o = 70, position: Player['position'] = 'MF'): Player =>
  pl({ nationality: 'ITA', trainedClubId: CLUB, overall: o, position });
/** An Italian trained elsewhere in the nation (nation-trained, not club-trained). */
const nationTrained = (o = 70): Player =>
  pl({ nationality: 'ITA', trainedClubId: OTHER, overall: o });
/** A foreigner trained abroad. */
const foreigner = (nat: string, o = 70): Player =>
  pl({ nationality: nat, trainedClubId: null, overall: o });

describe('roster lists & quotas (SPEC §14.3-§14.4)', () => {
  it('registers everyone when the squad fits and has enough home-grown', () => {
    const players = [
      homegrown(70, 'GK'),
      homegrown(70, 'GK'), // 2 keepers for the minimum
      ...Array.from({ length: 4 }, () => homegrown()), // more club-trained
      ...Array.from({ length: 6 }, () => nationTrained()),
      ...Array.from({ length: 13 }, () => foreigner('BRA')),
    ];
    const { world, club } = makeWorld(players, RULES);
    const list = buildRosterList(world, club);
    expect(list.registered.size).toBe(25);
    expect(list.excluded).toHaveLength(0);
    expect(list.nationTrainedCount).toBe(12);
    expect(list.clubTrainedCount).toBe(6);
    expect(list.goalkeeperCount).toBe(2);
    expect(list.legal).toBe(true);
  });

  it('U22 are exempt from the list but eligible; below min-age are ineligible', () => {
    const players = [
      pl({ age: 17, trainedClubId: CLUB }), // too young to play at all
      pl({ age: 19, trainedClubId: CLUB }), // U22 exempt
      ...Array.from({ length: 10 }, () => homegrown()),
      ...Array.from({ length: 13 }, () => foreigner('FRA')),
    ];
    const { world, club } = makeWorld(players, RULES);
    const list = buildRosterList(world, club);
    const teen = players[0]!;
    const u22 = players[1]!;
    expect(list.exempt.has(u22.id)).toBe(true);
    expect(list.registered.has(u22.id)).toBe(false);
    expect(list.registered.has(teen.id)).toBe(false);

    const ineligible = ineligiblePlayers(world, club);
    expect(ineligible.has(teen.id)).toBe(true); // 17yo cannot play
    expect(ineligible.has(u22.id)).toBe(false); // U22 can play (exempt)
  });

  it('squeezes foreigners off the list when home-grown are too few (free-slot cap)', () => {
    // 20 foreigners + 5 home-grown = 25 over-age, but only 17 free slots for non-home-grown.
    const players = [
      ...Array.from({ length: 5 }, () => homegrown()),
      ...Array.from({ length: 20 }, () => foreigner('ARG')),
    ];
    const { world, club } = makeWorld(players, RULES);
    const list = buildRosterList(world, club);
    expect(list.registered.size).toBe(22); // 17 foreign + 5 home-grown
    expect(list.excluded).toHaveLength(3); // 3 foreigners squeezed out
    expect(list.nationTrainedCount).toBe(5);
    expect(list.legal).toBe(false); // short of the 8 nation-trained minimum

    const ineligible = ineligiblePlayers(world, club);
    expect(ineligible.size).toBe(3);
  });

  it('disabling the rules registers all over-age players (min-age only)', () => {
    const players = [
      pl({ age: 17, trainedClubId: CLUB }),
      ...Array.from({ length: 5 }, () => homegrown()),
      ...Array.from({ length: 20 }, () => foreigner('ARG')),
    ];
    const { world, club } = makeWorld(players, { ...RULES, enabled: false });
    const list = buildRosterList(world, club);
    expect(list.excluded).toHaveLength(0);
    expect(list.registered.size).toBe(25); // all over-age, no quota
    // Min play age still bites even with quotas off.
    expect(ineligiblePlayers(world, club).has(players[0]!.id)).toBe(true);
  });

  it('no freshly generated club has anyone squeezed off the list (calibration-safe)', () => {
    // The generation floors keep foreigners under the free-slot cap, so quota exclusions never
    // fire on a fresh world — only players below min age are ever ineligible.
    const world = generateWorld(createRng(1));
    for (const club of world.clubs.values()) {
      expect(buildRosterList(world, club).excluded).toHaveLength(0);
      for (const id of ineligiblePlayers(world, club)) {
        expect(world.players.get(id as PlayerId)!.age).toBeLessThan(18);
      }
    }
  });
});
