/**
 * Season engine: build the calendar, simulate every round in order (updating Elo
 * live so form feeds back into strength), and expose the final table. See SPEC.md §4-§6.
 */

import { asSeasonId } from '../domain/ids.js';
import type { ClubId, PlayerId } from '../domain/ids.js';
import type { Club, Match, Player, Season, StandingRow, World } from '../domain/types.js';
import { type Rng, createRng } from '../rng/rng.js';
import { initialiseElo, updateElo } from './elo.js';
import { buildLeagueContext, effectiveRatingsFor } from './league-context.js';
import { type Fielded, type SlotAssignment, naturalFielded, resolveAssignment } from './lineup.js';
import { assignGoals, buildMatchScript } from './match-events.js';
import { simulateMatch } from './match.js';
import { generateSchedule } from './scheduler.js';
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
    .sort((a, b) => b.overall - a.overall);
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

/** Create a scheduled (unplayed) season for the world's league. */
export function createSeason(world: World, year: number, rngSeed: number): Season {
  const seasonId = asSeasonId(`season-${year}`);
  return {
    id: seasonId,
    leagueId: world.league.id,
    year,
    rngSeed,
    status: 'scheduled',
    fixtures: generateSchedule(seasonId, world.league.clubIds),
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

/** Take (and clear) the suspensions a club must serve at this match. */
function takeSuspensions(map: Map<ClubId, Set<PlayerId>>, clubId: ClubId): Set<PlayerId> {
  const bans = map.get(clubId) ?? new Set<PlayerId>();
  map.set(clubId, new Set());
  return bans;
}

/** Play one match; returns each side's fielded lineup (for reporting replacements). */
function playMatch(
  world: World,
  ctx: ReturnType<typeof buildLeagueContext>,
  suspendedNext: Map<ClubId, Set<PlayerId>>,
  lineups: Map<ClubId, SlotAssignment>,
  match: Match,
  rng: Rng,
  eventsRng: Rng,
): { home: Fielded; away: Fielded } {
  const home = world.clubs.get(match.homeClubId);
  const away = world.clubs.get(match.awayClubId);
  if (!home || !away) throw new Error(`Match ${match.id} references unknown club`);

  // Each club plays once per round, so suspensions accrued last round are served now.
  const homeUnavail = takeSuspensions(suspendedNext, home.id);
  const awayUnavail = takeSuspensions(suspendedNext, away.id);
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

  const result = simulateMatch(
    effectiveRatingsFor(homeFielded.strength, home, ctx),
    effectiveRatingsFor(awayFielded.strength, away, ctx),
    ctx,
    rng,
    { home: script.home, away: script.away },
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
    const bans = suspendedNext.get(e.clubId) ?? new Set<PlayerId>();
    bans.add(e.playerId);
    suspendedNext.set(e.clubId, bans);
  }

  const homeScore =
    result.homeGoals > result.awayGoals ? 1 : result.homeGoals === result.awayGoals ? 0.5 : 0;
  const updated = updateElo(home.elo, away.elo, homeScore, result.homeGoals - result.awayGoals);
  home.elo = updated.home;
  away.elo = updated.away;

  return { home: homeFielded, away: awayFielded };
}

/** Final (or current) standings for a season. */
export function seasonStandings(world: World, season: Season): StandingRow[] {
  return computeStandings(world.league.clubIds, season.fixtures);
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
  /** Auto-replacements applied to the user's lineup (suspensions). */
  replacements: Fielded['replacements'];
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
  initialiseElo(world);
  const ctx = buildLeagueContext(world);
  const eventsRng = createRng((season.rngSeed ^ 0x9e3779b9) >>> 0);
  const suspendedNext = new Map<ClubId, Set<PlayerId>>();
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
      const matches = season.fixtures.filter((m) => m.round === round);

      let userMatch: Match | null = null;
      const otherMatches: Match[] = [];
      let replacements: Fielded['replacements'] = [];

      for (const match of matches) {
        const fielded = playMatch(world, ctx, suspendedNext, lineups, match, rng, eventsRng);
        if (userClubId && (match.homeClubId === userClubId || match.awayClubId === userClubId)) {
          userMatch = match;
          replacements =
            match.homeClubId === userClubId ? fielded.home.replacements : fielded.away.replacements;
        } else {
          otherMatches.push(match);
        }
      }

      cursor++;
      if (cursor >= rounds.length) season.status = 'finished';
      return {
        round,
        userMatch,
        otherMatches,
        replacements,
        standings: computeStandings(world.league.clubIds, season.fixtures),
      };
    },
  };
}
