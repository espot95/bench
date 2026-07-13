/**
 * Squad lists and registration quotas (SPEC §14.3-§14.4). Pure — no I/O, no RNG.
 *
 * A club's *squad* (`Club.playerIds`) can be larger than the registrable *list*. The list holds
 * up to `listSize` over-age players; **U22 are exempt** (unlimited, always eligible). Home-grown
 * quotas are enforced as "free" slots: at most `listSize - minNationTrained` players may be
 * non-nation-trained, so foreigners beyond that are squeezed out even if the squad is small
 * enough — exactly the Serie A mechanic. Only registered + exempt players are eligible to play.
 *
 * NOTE: the non-EU cap (`RosterRules.nonEuCap`) is a cap on *new signings per season*, not on the
 * total list, so it is enforced by the transfer market (Fase 2g), not at registration here.
 */

import type { ClubId, PlayerId } from '../core/ids.js';
import { type ForeignerClass, classifyForNation } from '../core/nations.js';
import { playerOverall } from '../core/ratings.js';
import {
  type Club,
  type Nation,
  type Player,
  type RosterRules,
  type World,
  leagueOfClub,
  leaguesOfNation,
  nationById,
} from '../core/types.js';

export interface RosterClassification {
  /** Trained at this very club. */
  clubTrained: boolean;
  /** Trained at any club of this nation (club-trained ⊆ nation-trained). */
  nationTrained: boolean;
  /** Nationality seen from the nation: home / EU foreigner / non-EU foreigner. */
  euClass: ForeignerClass;
}

export interface RosterList {
  /** Over-age players registered on the list (eligible to play). */
  registered: Set<PlayerId>;
  /** U22 players — exempt from the list, always eligible. */
  exempt: Set<PlayerId>;
  /** Over-age players squeezed off the list (ineligible). */
  excluded: PlayerId[];
  nationTrainedCount: number;
  clubTrainedCount: number;
  goalkeeperCount: number;
  /** Non-EU players on the list (informational; the cap bites in the market, not here). */
  nonEuCount: number;
  /** Whether the list meets the home-grown / goalkeeper minima. */
  legal: boolean;
}

/** Classify a squad player against his club's nation. */
export function classifyPlayer(
  player: Player,
  clubId: ClubId,
  nation: Nation,
  nationClubIds: ReadonlySet<ClubId>,
): RosterClassification {
  const trained = player.trainedClubId ?? null;
  return {
    clubTrained: trained === clubId,
    nationTrained: trained !== null && nationClubIds.has(trained),
    euClass: classifyForNation(nation, player.nationality),
  };
}

/** The set of club ids belonging to a nation (for the nation-trained test). */
function nationClubSet(world: World, nation: Nation): Set<ClubId> {
  const ids = new Set<ClubId>();
  for (const league of leaguesOfNation(world, nation.id))
    for (const id of league.clubIds) ids.add(id);
  return ids;
}

/**
 * Build a club's registration list under its nation's rules. If the world has no nation for the
 * club, or the rules are disabled, every over-age player is registered (no quotas).
 */
export function buildRosterList(world: World, club: Club): RosterList {
  const nation = nationById(world, leagueOfClub(world, club.id).nationId);
  const squad = club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined);

  if (!nation) return trivialList(squad);
  const rules = nation.rosterRules;

  const exempt = new Set<PlayerId>();
  const over: Player[] = [];
  for (const p of squad) {
    if (p.age < rules.under22Age) exempt.add(p.id);
    else over.push(p);
  }
  if (!rules.enabled) {
    return {
      registered: new Set(over.map((p) => p.id)),
      exempt,
      excluded: [],
      ...tally(over, world, club, nation),
      legal: true,
    };
  }

  const nationClubs = nationClubSet(world, nation);
  const freeSlots = Math.max(0, rules.listSize - rules.minNationTrained);

  // Best players first; foreigners (non-nation-trained) limited to the free slots.
  over.sort((a, b) => playerOverall(b) - playerOverall(a));
  const registeredPlayers: Player[] = [];
  const registered = new Set<PlayerId>();
  const excluded: PlayerId[] = [];
  let freeUsed = 0;
  for (const p of over) {
    const c = classifyPlayer(p, club.id, nation, nationClubs);
    if (registered.size >= rules.listSize) {
      excluded.push(p.id);
      continue;
    }
    if (!c.nationTrained && freeUsed >= freeSlots) {
      excluded.push(p.id); // free slots full: a foreigner cannot take a home-grown-reserved slot
      continue;
    }
    registered.add(p.id);
    registeredPlayers.push(p);
    if (!c.nationTrained) freeUsed++;
  }

  const counts = tally(registeredPlayers, world, club, nation);
  const legal =
    counts.nationTrainedCount >= rules.minNationTrained &&
    counts.clubTrainedCount >= rules.minClubTrained &&
    counts.goalkeeperCount >= rules.minGoalkeepers;

  return { registered, exempt, excluded, ...counts, legal };
}

function tally(
  players: Player[],
  world: World,
  club: Club,
  nation: Nation,
): Pick<RosterList, 'nationTrainedCount' | 'clubTrainedCount' | 'goalkeeperCount' | 'nonEuCount'> {
  const nationClubs = nationClubSet(world, nation);
  let nationTrainedCount = 0;
  let clubTrainedCount = 0;
  let goalkeeperCount = 0;
  let nonEuCount = 0;
  for (const p of players) {
    const c = classifyPlayer(p, club.id, nation, nationClubs);
    if (c.nationTrained) nationTrainedCount++;
    if (c.clubTrained) clubTrainedCount++;
    if (p.position === 'GK') goalkeeperCount++;
    if (c.euClass === 'nonEu') nonEuCount++;
  }
  return { nationTrainedCount, clubTrainedCount, goalkeeperCount, nonEuCount };
}

function trivialList(squad: Player[]): RosterList {
  return {
    registered: new Set(squad.map((p) => p.id)),
    exempt: new Set(),
    excluded: [],
    nationTrainedCount: 0,
    clubTrainedCount: 0,
    goalkeeperCount: squad.filter((p) => p.position === 'GK').length,
    nonEuCount: 0,
    legal: true,
  };
}

/**
 * Players who cannot be fielded under roster rules: below the minimum play age, or over-age and
 * squeezed off the list. Used by the season runner to bench them. Empty for nation-less worlds.
 */
export function ineligiblePlayers(world: World, club: Club): Set<PlayerId> {
  const nation = nationById(world, leagueOfClub(world, club.id).nationId);
  const out = new Set<PlayerId>();
  if (!nation) return out;
  const rules = nation.rosterRules;

  for (const id of club.playerIds) {
    const p = world.players.get(id);
    if (p && p.age < rules.minPlayAge) out.add(id);
  }
  if (rules.enabled) {
    for (const id of buildRosterList(world, club).excluded) out.add(id);
  }
  return out;
}

/** Is a player currently eligible to play for his club (roster rules only)? */
export function isEligible(world: World, club: Club, player: Player): boolean {
  return !ineligiblePlayers(world, club).has(player.id);
}

/** Compact one-line description of a club's list status (for CLI). */
export function rosterSummary(list: RosterList, rules: RosterRules | undefined): string {
  if (!rules || !rules.enabled) return 'liste non attive';
  const flag = list.legal ? 'OK' : 'INCOMPLETA';
  const out = list.excluded.length ? ` · fuori lista ${list.excluded.length}` : '';
  const vivaio = `vivaio naz. ${list.nationTrainedCount}/${rules.minNationTrained} (club ${list.clubTrainedCount}/${rules.minClubTrained})`;
  return `lista ${list.registered.size}/${rules.listSize} · ${vivaio} · extra-UE ${list.nonEuCount} · U22 esenti ${list.exempt.size}${out} · ${flag}`;
}
