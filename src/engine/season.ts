/**
 * Season engine: build the calendar, simulate every round in order (updating Elo
 * live so form feeds back into strength), and expose the final table. See SPEC.md §4-§6.
 */

import { asSeasonId } from '../core/ids.js';
import type { ClubId, PlayerId } from '../core/ids.js';
import { playerOverall, selectStartingXI } from '../core/ratings.js';
import {
  type Club,
  type League,
  type Match,
  type Player,
  type Season,
  type StandingRow,
  type World,
  leagueById,
} from '../core/types.js';
import { type Rng, createRng } from '../rng/rng.js';
import { type StyleMatchMods, styleMods } from './coach-styles.js';
import { ADAPTATION, COACH } from './constants.js';
import { initialiseElo, updateElo } from './elo.js';
import { applySevereHit } from './injury.js';
import { buildLeagueContext, effectiveRatingsFor } from './league-context.js';
import {
  type Fielded,
  type SlotAssignment,
  matchStrength,
  naturalFielded,
  resolveAssignment,
} from './lineup.js';
import { type TeamInjury, assignGoals, buildMatchScript } from './match-events.js';
import { type Appearance, updateMoraleForClub } from './morale.js';
import { clubPressure } from './pressure.js';
import { ineligiblePlayers } from './roster.js';
import { generateSchedule } from './scheduler.js';
import { simulateScore } from './score-engine.js';
import { computeStandings } from './standings.js';

/** Bench = available squad players not fielded, best first. */
function benchFor(
  club: Club,
  world: World,
  unavailable: ReadonlySet<PlayerId>,
  fielded: Player[],
): Player[] {
  const onPitch = new Set(fielded.map((p) => p.id));
  return club.playerIds
    .filter((pid) => !unavailable.has(pid) && !onPitch.has(pid))
    .map((pid) => world.players.get(pid))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => playerOverall(b) - playerOverall(a));
}

/** Choose how a club takes the pitch: user slot-assignment if provided, else best natural XI. */
function fieldClub(
  club: Club,
  world: World,
  unavailable: ReadonlySet<PlayerId>,
  lineups: Map<ClubId, SlotAssignment>,
): Fielded {
  const assignment = lineups.get(club.id);
  return assignment
    ? resolveAssignment(assignment, club, world, unavailable)
    : naturalFielded(club, world, unavailable);
}

/** Create a scheduled (unplayed) season for one division. */
export function createSeason(_world: World, league: League, year: number, rngSeed: number): Season {
  const seasonId = asSeasonId(`season-${league.id}-${year}`);
  return {
    id: seasonId,
    leagueId: league.id,
    year,
    rngSeed,
    status: 'scheduled',
    fixtures: generateSchedule(seasonId, league.clubIds),
  };
}

/**
 * Simulate all remaining fixtures in round order. Mutates the matches (fills in
 * goals + events) and the clubs' Elo. Returns the season for chaining.
 *
 * Match events use a SEPARATE rng derived from the season seed, so the scoreline
 * rng stream (and thus the calibrated results) is untouched. See SPEC.md §6.4.
 */
export function simulateSeason(world: World, season: Season, rng: Rng): Season {
  const runner = createRunner(world, season, rng);
  while (!runner.isFinished()) runner.playRound();
  return season;
}

/**
 * Refresh each club's ambient pressure for the coming round (SPEC §18.1): reputation base
 * + underperformance vs the pre-season expectation. Before any match is played, the
 * current rank defaults to the expected one (base pressure only).
 */
function refreshPressures(
  world: World,
  season: Season,
  league: League,
  expectedRank: Map<ClubId, number>,
  state: MatchState,
): void {
  const table = computeStandings(
    league.clubIds,
    season.fixtures.filter((m) => m.played),
  );
  const anyPlayed = table.some((r) => r.played > 0);
  state.pressures.clear();
  for (const clubId of league.clubIds) {
    const club = world.clubs.get(clubId);
    if (!club) continue;
    const expected = expectedRank.get(clubId) ?? league.clubIds.length / 2;
    const current = anyPlayed ? table.findIndex((r) => r.clubId === clubId) : expected;
    state.pressures.set(clubId, clubPressure(club.reputation, expected, current));
  }
}

/**
 * The club's coach picks the XI (MODULE_MARKET-free clubs only — a user lineup wins).
 * A weak coach benches a random starter with p = POOR_PICK_MAX · (1 − quality).
 */
function applyCoachPick(
  world: World,
  club: Club,
  unavailable: Set<PlayerId>,
  lineups: Map<ClubId, SlotAssignment>,
  state: MatchState,
  perfRng: Rng,
): void {
  if (lineups.has(club.id)) return; // the user (or a set lineup) decides, not the coach
  const quality = state.coachQuality.get(club.id) ?? COACH.DEFAULT_QUALITY;
  if (!perfRng.chance(COACH.POOR_PICK_MAX * (1 - quality))) return;
  const xi = selectStartingXI(club, world, unavailable);
  const victim = xi[perfRng.int(0, Math.max(0, xi.length - 1))];
  if (victim) unavailable.add(victim.id);
}

/** One matchday of settling-in decay for every adapting player (MODULE_MARKET §4). */
function tickAdaptation(world: World, league: League): void {
  for (const clubId of league.clubIds) {
    const club = world.clubs.get(clubId);
    if (!club) continue;
    for (const pid of club.playerIds) {
      const p = world.players.get(pid);
      const ts = p?.transferStatus;
      if (!p || !ts) continue;
      ts.rampRemaining -= 1;
      ts.pricePressure *= ADAPTATION.PRESSURE_DECAY;
      if (ts.rampRemaining <= 0) p.transferStatus = undefined;
    }
  }
}

/** Take (and clear) the suspensions a club must serve at this match. */
function takeSuspensions(map: Map<ClubId, Set<PlayerId>>, clubId: ClubId): Set<PlayerId> {
  const bans = map.get(clubId) ?? new Set<PlayerId>();
  map.set(clubId, new Set());
  return bans;
}

interface MatchState {
  suspendedNext: Map<ClubId, Set<PlayerId>>;
  /** playerId → round from which the player is available again (injury recovery). */
  injuredUntil: Map<PlayerId, number>;
  /** Roster-ineligible players per club (below min age / squeezed off the list); static per season. */
  rosterIneligible: Map<ClubId, Set<PlayerId>>;
  /** Piazza pressure per club, refreshed each round from reputation + standings (SPEC §18). */
  pressures: Map<ClubId, number>;
  /** Coach quality per club [0,1] (MODULE_MANAGER §1): drives the poor-pick roll. */
  coachQuality: Map<ClubId, number>;
  /** Tactical-style modifiers per club (MODULE_MANAGER §5), fixed per season. */
  styles: Map<ClubId, StyleMatchMods>;
  round: number;
}

/**
 * Availability = suspensions (served now) ∪ players recovering from injury ∪ roster-ineligible
 * (below min age or off the registration list, SPEC §14.3).
 */
function unavailableFor(club: Club, state: MatchState): Set<PlayerId> {
  const out = takeSuspensions(state.suspendedNext, club.id);
  for (const pid of club.playerIds) {
    if ((state.injuredUntil.get(pid) ?? 0) >= state.round) out.add(pid);
  }
  for (const pid of state.rosterIneligible.get(club.id) ?? []) out.add(pid);
  return out;
}

/** Classify how each squad player featured, for the morale update (SPEC §13.2). */
function appearanceMap(
  club: Club,
  fielded: Fielded,
  events: Match['events'],
  unavailable: ReadonlySet<PlayerId>,
): Map<string, Appearance> {
  const started = new Set(fielded.players.map((p) => p.id));
  const cameOn = new Set(
    events.filter((e) => e.type === 'sub' && e.clubId === club.id).map((e) => e.playerId),
  );
  const map = new Map<string, Appearance>();
  for (const pid of club.playerIds) {
    if (started.has(pid)) map.set(pid, 'started');
    else if (cameOn.has(pid)) map.set(pid, 'sub');
    else if (unavailable.has(pid)) map.set(pid, 'unavailable');
    else map.set(pid, 'unused');
  }
  return map;
}

/** Play one match; returns each side's fielded lineup + injuries (for reporting/effects). */
function playMatch(
  world: World,
  ctx: ReturnType<typeof buildLeagueContext>,
  state: MatchState,
  lineups: Map<ClubId, SlotAssignment>,
  match: Match,
  rng: Rng,
  eventsRng: Rng,
  perfRng: Rng,
): {
  home: Fielded;
  away: Fielded;
  homeInjuries: TeamInjury[];
  awayInjuries: TeamInjury[];
  homeAppearance: Map<string, Appearance>;
  awayAppearance: Map<string, Appearance>;
} {
  const home = world.clubs.get(match.homeClubId);
  const away = world.clubs.get(match.awayClubId);
  if (!home || !away) throw new Error(`Match ${match.id} references unknown club`);

  const homeUnavail = unavailableFor(home, state);
  const awayUnavail = unavailableFor(away, state);
  // Coach quality (MODULE_MANAGER §1): a poor coach sometimes benches a starter.
  applyCoachPick(world, home, homeUnavail, lineups, state, perfRng);
  applyCoachPick(world, away, awayUnavail, lineups, state, perfRng);
  const homeFielded = fieldClub(home, world, homeUnavail, lineups);
  const awayFielded = fieldClub(away, world, awayUnavail, lineups);

  const homeSide = {
    clubId: home.id,
    xi: homeFielded.players,
    bench: benchFor(home, world, homeUnavail, homeFielded.players),
  };
  const awaySide = {
    clubId: away.id,
    xi: awayFielded.players,
    bench: benchFor(away, world, awayUnavail, awayFielded.players),
  };

  // Cards + subs first: sending-off minutes feed the man-down effect on the score
  // (§6.5-§6.6) and the on-pitch timeline drives who can score afterwards (§6.4).
  const script = buildMatchScript(homeSide, awaySide, eventsRng);

  // Personality-aware match strength: per-player consistency swing + captain bonus (§11.7).
  const result = simulateScore(
    effectiveRatingsFor(
      matchStrength(homeFielded, perfRng, state.pressures.get(home.id) ?? 0),
      home,
      ctx,
    ),
    effectiveRatingsFor(
      matchStrength(awayFielded, perfRng, state.pressures.get(away.id) ?? 0),
      away,
      ctx,
    ),
    ctx,
    rng,
    { home: script.home, away: script.away },
    {
      home: state.styles.get(home.id) ?? { ownShots: 1, ownTilt: 1, oppShots: 1, oppTilt: 1 },
      away: state.styles.get(away.id) ?? { ownShots: 1, ownTilt: 1, oppShots: 1, oppTilt: 1 },
    },
  );

  match.homeGoals = result.homeGoals;
  match.awayGoals = result.awayGoals;
  match.played = true;
  const goals = assignGoals(
    home.id,
    script.homeLineup,
    away.id,
    script.awayLineup,
    result.homeGoals,
    result.awayGoals,
    eventsRng,
  );
  match.events = [...script.events, ...goals].sort((a, b) => a.minute - b.minute);

  // A red card => the player is suspended for that club's next match.
  for (const e of script.events) {
    if (e.type !== 'red') continue;
    const bans = state.suspendedNext.get(e.clubId) ?? new Set<PlayerId>();
    bans.add(e.playerId);
    state.suspendedNext.set(e.clubId, bans);
  }

  // Injuries: out for `duration` matches; a severe one leaves a permanent physical mark (§12).
  for (const inj of [...script.homeInjuries, ...script.awayInjuries]) {
    state.injuredUntil.set(inj.player.id, state.round + inj.injury.durationMatches);
    if (inj.injury.severity === 'severe') applySevereHit(inj.player, eventsRng);
  }

  const homeScore =
    result.homeGoals > result.awayGoals ? 1 : result.homeGoals === result.awayGoals ? 0.5 : 0;
  const updated = updateElo(home.elo, away.elo, homeScore, result.homeGoals - result.awayGoals);
  home.elo = updated.home;
  away.elo = updated.away;

  return {
    home: homeFielded,
    away: awayFielded,
    homeInjuries: script.homeInjuries,
    awayInjuries: script.awayInjuries,
    homeAppearance: appearanceMap(home, homeFielded, match.events, homeUnavail),
    awayAppearance: appearanceMap(away, awayFielded, match.events, awayUnavail),
  };
}

/** Final (or current) standings for a season (its division). */
export function seasonStandings(world: World, season: Season): StandingRow[] {
  return computeStandings(leagueById(world, season.leagueId).clubIds, season.fixtures);
}

/**
 * Simulate a whole season with a fixed user lineup and return the final standings.
 * Used by the validation comparison (best vs poor lineup). See SPEC.md §9.4.
 */
export function runManagedSeason(
  world: World,
  season: Season,
  rng: Rng,
  userClubId: ClubId,
  assignment: SlotAssignment,
): StandingRow[] {
  const runner = createRunner(world, season, rng);
  runner.setLineup(userClubId, assignment);
  while (!runner.isFinished()) runner.playRound(userClubId);
  return seasonStandings(world, season);
}

// ---------------------------------------------------------------------------
// Round-by-round runner (manager loop, SPEC §9)
// ---------------------------------------------------------------------------

export interface RoundResult {
  round: number;
  /** The user club's match this round (null if not managing a club). */
  userMatch: Match | null;
  /** All other matches this round. */
  otherMatches: Match[];
  /** Auto-replacements applied to the user's lineup (suspensions/injuries). */
  replacements: Fielded['replacements'];
  /** Injuries suffered by the user's club this round. */
  injuries: TeamInjury[];
  standings: StandingRow[];
}

export interface SeasonRunner {
  totalRounds(): number;
  nextRound(): number;
  isFinished(): boolean;
  /** Set the user club's lineup for subsequent rounds (sticky). */
  setLineup(clubId: ClubId, assignment: SlotAssignment): void;
  /** Simulate the next round; `userClubId` marks whose match to surface. */
  playRound(userClubId?: ClubId): RoundResult;
}

/**
 * Build a runner that simulates a season one round at a time. Elo, league context
 * and suspensions are held across rounds. Lineups default to best natural XI;
 * inject a user assignment via setLineup. See SPEC.md §9.
 */
export function createRunner(world: World, season: Season, rng: Rng): SeasonRunner {
  const league = leagueById(world, season.leagueId);
  initialiseElo(world, league);
  const ctx = buildLeagueContext(world, league);
  const eventsRng = createRng((season.rngSeed ^ 0x9e3779b9) >>> 0);
  const perfRng = createRng((season.rngSeed ^ 0x51ed270b) >>> 0);

  // Pre-season expectation: rank clubs by reputation (0 = expected top). Used by morale.
  const expectedRank = new Map<ClubId, number>();
  league.clubIds
    .map((id) => world.clubs.get(id))
    .filter((c): c is Club => c !== undefined)
    .sort((a, b) => b.reputation - a.reputation)
    .forEach((c, i) => expectedRank.set(c.id, i));
  // Registration lists are fixed for the season: compute each club's ineligible set once.
  const rosterIneligible = new Map<ClubId, Set<PlayerId>>();
  for (const id of league.clubIds) {
    const club = world.clubs.get(id);
    if (club) rosterIneligible.set(id, ineligiblePlayers(world, club));
  }
  const state: MatchState = {
    suspendedNext: new Map<ClubId, Set<PlayerId>>(),
    injuredUntil: new Map<PlayerId, number>(),
    rosterIneligible,
    pressures: new Map<ClubId, number>(),
    coachQuality: new Map(
      [...(world.managers?.values() ?? [])]
        .filter((m) => m.clubId !== null)
        .map((m) => [m.clubId as ClubId, m.reputation / 100]),
    ),
    styles: new Map(
      league.clubIds.flatMap((id) => {
        const club = world.clubs.get(id);
        if (!club) return [];
        const coach = [...(world.managers?.values() ?? [])].find((m) => m.clubId === id);
        return [[id, styleMods(world, club, coach)] as const];
      }),
    ),
    round: 0,
  };
  const lineups = new Map<ClubId, SlotAssignment>();

  const rounds = [...new Set(season.fixtures.map((m) => m.round))].sort((a, b) => a - b);
  let cursor = 0;
  season.status = 'in_progress';

  return {
    totalRounds: () => rounds.length,
    nextRound: () => rounds[cursor] ?? rounds.length + 1,
    isFinished: () => cursor >= rounds.length,
    setLineup: (clubId, assignment) => {
      lineups.set(clubId, assignment);
    },
    playRound: (userClubId) => {
      const round = rounds[cursor] as number;
      state.round = round;
      refreshPressures(world, season, league, expectedRank, state);
      const matches = season.fixtures.filter((m) => m.round === round);

      let userMatch: Match | null = null;
      const otherMatches: Match[] = [];
      let replacements: Fielded['replacements'] = [];
      let injuries: TeamInjury[] = [];
      const moraleUpdates: Array<{
        club: Club;
        appearance: Map<string, Appearance>;
        result: 'win' | 'draw' | 'loss';
      }> = [];

      for (const match of matches) {
        const played = playMatch(world, ctx, state, lineups, match, rng, eventsRng, perfRng);
        const home = world.clubs.get(match.homeClubId);
        const away = world.clubs.get(match.awayClubId);
        const hg = match.homeGoals ?? 0;
        const ag = match.awayGoals ?? 0;
        const homeRes = hg > ag ? 'win' : hg < ag ? 'loss' : 'draw';
        if (home)
          moraleUpdates.push({ club: home, appearance: played.homeAppearance, result: homeRes });
        if (away)
          moraleUpdates.push({
            club: away,
            appearance: played.awayAppearance,
            result: homeRes === 'win' ? 'loss' : homeRes === 'loss' ? 'win' : 'draw',
          });

        if (userClubId && (match.homeClubId === userClubId || match.awayClubId === userClubId)) {
          userMatch = match;
          const isHome = match.homeClubId === userClubId;
          replacements = isHome ? played.home.replacements : played.away.replacements;
          injuries = isHome ? played.homeInjuries : played.awayInjuries;
        } else {
          otherMatches.push(match);
        }
      }

      // Morale update at end of round: uses post-round standings vs pre-season expectation.
      const standings = computeStandings(league.clubIds, season.fixtures);
      const actualRank = new Map(standings.map((r, i) => [r.clubId, i]));
      for (const u of moraleUpdates) {
        const posDelta = (expectedRank.get(u.club.id) ?? 0) - (actualRank.get(u.club.id) ?? 0);
        updateMoraleForClub(world, u.club, u.appearance, u.result, posDelta);
      }

      tickAdaptation(world, league);
      cursor++;
      if (cursor >= rounds.length) season.status = 'finished';
      return {
        round,
        userMatch,
        otherMatches,
        replacements,
        injuries,
        standings,
      };
    },
  };
}
