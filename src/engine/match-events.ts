/**
 * Match-event generation: cards, substitutions, and (given the scoreline) scorers
 * & assists. Pure & deterministic, driven by a dedicated events RNG. The card and
 * sub schedule is built BEFORE the score so sending-offs feed the man-down effect
 * and only on-pitch players can score. See SPEC.md §6.4-§6.6.
 */

import type { ClubId, PlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type { MatchEvent, Player, Position } from '../core/types.js';
import type { Rng } from '../rng/rng.js';
import { EVENTS, INJURY } from './constants.js';
import { type Injury, injuryChance, rollInjury } from './injury.js';
import type { TeamManDown } from './match.js';

/** A player hurt during a match, with severity/duration (SPEC §12). */
export interface TeamInjury {
  player: Player;
  injury: Injury;
}

export interface TeamSide {
  clubId: ClubId;
  /** Starting XI (fielded). */
  xi: Player[];
  /** Bench: available squad players not in the XI, best first. */
  bench: Player[];
}

/** A player's on-pitch interval [entry, exit). Exit MATCH_END = played to the end. */
interface OnPitch {
  player: Player;
  entry: number;
  exit: number;
}

/** Sentinel exit for a player still on at full time (goals use minutes 1..90). */
const MATCH_END = 91;

function attrValue(player: Player, key: string): number {
  return (player.attributes as unknown as Record<string, number>)[key] ?? 0;
}

/** Weighted index pick; returns -1 if all weights are zero. */
function weightedPick(weights: number[], rng: Rng): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let target = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    target -= weights[i] as number;
    if (target < 0) return i;
  }
  return weights.length - 1;
}

function cardWeights(xi: Player[]): number[] {
  // Temperament (SPEC §11.7) biases WHO gets booked; the count is Poisson, so the
  // per-team card totals are unchanged (mean temperament 0.5 → factor 1.0).
  return xi.map(
    (p) => EVENTS.CARD_POS_WEIGHT[p.position as Position] * (0.5 + p.personality.temperament),
  );
}

function event(
  type: MatchEvent['type'],
  clubId: ClubId,
  minute: number,
  playerId: PlayerId,
  extra: { assistId?: PlayerId | null; subOutId?: PlayerId | null } = {},
): MatchEvent {
  return {
    minute,
    type,
    clubId,
    playerId,
    assistId: extra.assistId ?? null,
    subOutId: extra.subOutId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Cards (SPEC §6.4)
// ---------------------------------------------------------------------------

/**
 * Generate card events for one team's XI. A second yellow becomes a red; a booked
 * player is much less likely to be booked again (BOOKED_CAUTION).
 */
function cardEvents(side: TeamSide, rng: Rng): MatchEvent[] {
  const events: MatchEvent[] = [];
  const baseWeights = cardWeights(side.xi);
  const yellowCount = new Array(side.xi.length).fill(0);
  const firstYellowMinute = new Array(side.xi.length).fill(0);
  const sentOff = new Array(side.xi.length).fill(false);

  const pickEligible = (): number =>
    weightedPick(
      baseWeights.map((w, i) => {
        if (sentOff[i]) return 0;
        return yellowCount[i] >= 1 ? w * EVENTS.BOOKED_CAUTION : w;
      }),
      rng,
    );

  const card = (type: 'yellow' | 'red', playerId: PlayerId, minute: number) => {
    events.push(event(type, side.clubId, minute, playerId));
  };

  const yellows = rng.poisson(EVENTS.YELLOW_LAMBDA);
  for (let i = 0; i < yellows; i++) {
    const idx = pickEligible();
    if (idx < 0) break;
    const player = side.xi[idx] as Player;
    if (yellowCount[idx] === 0) {
      const minute = rng.int(1, 90);
      firstYellowMinute[idx] = minute;
      card('yellow', player.id, minute);
      yellowCount[idx] = 1;
    } else {
      const first = firstYellowMinute[idx] as number;
      const minute = first >= 90 ? 90 : rng.int(first + 1, 90);
      card('yellow', player.id, minute);
      card('red', player.id, minute);
      yellowCount[idx] = 2;
      sentOff[idx] = true;
    }
  }

  const straightReds = rng.poisson(EVENTS.RED_LAMBDA);
  for (let i = 0; i < straightReds; i++) {
    const idx = pickEligible();
    if (idx < 0) break;
    card('red', (side.xi[idx] as Player).id, rng.int(1, 90));
    sentOff[idx] = true;
  }

  return events;
}

// ---------------------------------------------------------------------------
// Substitutions (SPEC §6.6)
// ---------------------------------------------------------------------------

interface SubOutcome {
  events: MatchEvent[];
  /** Full on-pitch timeline (starters + subs, exits from reds/subs/injuries). */
  lineup: OnPitch[];
  /** Minute from which the team plays reshaped (DF/GK red → attacker sacrificed). */
  reshapeFrom: number | null;
  /** Injuries suffered (for availability + permanent hit, SPEC §12). */
  injuries: TeamInjury[];
  /** Minutes the team went a man down because an injury couldn't be covered. */
  uncoveredInjuryMinutes: number[];
}

/** Players on the pitch strictly during `minute` (entry ≤ minute < exit). */
function eligibleAt(lineup: OnPitch[], minute: number): OnPitch[] {
  return lineup.filter((o) => o.entry <= minute && minute < o.exit);
}

/**
 * Build the substitutions + injuries schedule and the resulting lineup timeline for
 * one team. Injuries force a replacement (or a man-down if subs/bench are exhausted);
 * a DF/GK sending-off forces a defensive reshape. All subs share one budget.
 * See SPEC.md §6.6 + §12.2.
 */
function substitutions(
  side: TeamSide,
  reds: Map<PlayerId, number>,
  redInfo: { minute: number; position: Position } | null,
  rng: Rng,
): SubOutcome {
  // Starting lineup, with exits set for sent-off players.
  const lineup: OnPitch[] = side.xi.map((p) => ({
    player: p,
    entry: 0,
    exit: reds.get(p.id) ?? MATCH_END,
  }));

  const usedBench = new Set<PlayerId>();
  const benchByPos = (pos: Position): Player[] =>
    side.bench.filter((p) => p.position === pos && !usedBench.has(p.id));
  const anyBench = (): Player[] => side.bench.filter((p) => !usedBench.has(p.id));

  const windows = EVENTS.SUB_WINDOWS.map(([lo, hi]) => rng.int(lo as number, hi as number)).sort(
    (a, b) => a - b,
  );

  // Injuries: each starter (not already sent off) may be hurt at a random minute.
  const injuries: TeamInjury[] = [];
  for (const p of side.xi) {
    if (reds.has(p.id)) continue; // a sent-off player is already gone
    if (rng.chance(injuryChance(p))) {
      injuries.push({ player: p, injury: rollInjury(p, rng) });
    }
  }
  const injuryMinuteByPlayer = new Map<PlayerId, number>();
  for (const inj of injuries) injuryMinuteByPlayer.set(inj.player.id, rng.int(1, 90));

  type Request =
    | { minute: number; kind: 'routine' | 'reshape' }
    | { minute: number; kind: 'injury'; player: Player };
  const requests: Request[] = [];
  if (redInfo) {
    const rm = windows.find((w) => w >= redInfo.minute);
    requests.push({ minute: rm ?? redInfo.minute, kind: 'reshape' });
  }
  for (const inj of injuries) {
    requests.push({
      minute: injuryMinuteByPlayer.get(inj.player.id) as number,
      kind: 'injury',
      player: inj.player,
    });
  }
  const routineCount = rng.int(EVENTS.SUB_MIN, EVENTS.SUB_MAX);
  for (let i = 0; i < routineCount; i++) {
    requests.push({ minute: windows[rng.int(0, windows.length - 1)] as number, kind: 'routine' });
  }
  requests.sort((a, b) => a.minute - b.minute);

  const events: MatchEvent[] = [];
  let reshapeFrom: number | null = null;
  const uncoveredInjuryMinutes: number[] = [];
  let subsUsed = 0;

  const bringOn = (incoming: Player, outgoing: OnPitch, minute: number) => {
    outgoing.exit = minute;
    lineup.push({ player: incoming, entry: minute, exit: MATCH_END });
    usedBench.add(incoming.id);
    events.push(event('sub', side.clubId, minute, incoming.id, { subOutId: outgoing.player.id }));
    subsUsed++;
  };

  for (const req of requests) {
    const onPitch = eligibleAt(lineup, req.minute).filter((o) => o.entry < req.minute);

    if (req.kind === 'injury') {
      const off = lineup.find((o) => o.player.id === req.player.id && req.minute < o.exit);
      events.push(event('injury', side.clubId, req.minute, req.player.id));
      if (!off) continue; // already left (e.g. subbed earlier)
      off.exit = req.minute; // hurt player leaves now
      const incoming =
        subsUsed < INJURY.SUB_BUDGET
          ? ((benchByPos(off.player.position)[0] ?? anyBench()[0]) as Player | undefined)
          : undefined;
      if (incoming) bringOn(incoming, off, req.minute);
      else uncoveredInjuryMinutes.push(req.minute); // no cover → a man down
      continue;
    }

    if (subsUsed >= INJURY.SUB_BUDGET) continue;

    if (req.kind === 'reshape') {
      const wantPos: Position = (redInfo as { position: Position }).position === 'GK' ? 'GK' : 'DF';
      const incoming = (benchByPos(wantPos)[0] ?? anyBench()[0]) as Player | undefined;
      const off =
        pickOff(onPitch, (o) => o.player.position === 'FW', rng) ??
        pickOff(onPitch, (o) => o.player.position !== 'GK', rng);
      if (incoming && off) {
        bringOn(incoming, off, req.minute);
        reshapeFrom = req.minute;
      }
      continue;
    }

    // Routine: swap a tiring/weaker outfielder for the best like-for-like sub.
    const off = pickOff(onPitch, (o) => o.player.position !== 'GK', rng);
    if (!off) continue;
    const incoming = (benchByPos(off.player.position)[0] ?? anyBench()[0]) as Player | undefined;
    if (!incoming) continue;
    bringOn(incoming, off, req.minute);
  }

  return { events, lineup, reshapeFrom, injuries, uncoveredInjuryMinutes };
}

/** Pick an on-pitch player matching `pred`, weighted toward lower overall. */
function pickOff(onPitch: OnPitch[], pred: (o: OnPitch) => boolean, rng: Rng): OnPitch | undefined {
  const pool = onPitch.filter(pred);
  if (pool.length === 0) return undefined;
  const idx = weightedPick(
    pool.map((o) => Math.max(1, 105 - playerOverall(o.player))),
    rng,
  );
  return pool[idx < 0 ? 0 : idx];
}

// ---------------------------------------------------------------------------
// Goals (SPEC §6.4) — attributed to whoever is on the pitch at the goal minute
// ---------------------------------------------------------------------------

function goalEvents(clubId: ClubId, lineup: OnPitch[], goals: number, rng: Rng): MatchEvent[] {
  const events: MatchEvent[] = [];

  for (let g = 0; g < goals; g++) {
    const minute = rng.int(1, 90);
    const onPitch = eligibleAt(lineup, minute);
    if (onPitch.length === 0) continue; // impossible in practice

    const goalW = onPitch.map(
      (o) =>
        EVENTS.GOAL_POS_WEIGHT[o.player.position as Position] *
        (attrValue(o.player, 'finishing') / 50),
    );
    let scorerIdx = weightedPick(goalW, rng);
    if (scorerIdx < 0) scorerIdx = 0;
    const scorer = (onPitch[scorerIdx] as OnPitch).player;

    let assistId: PlayerId | null = null;
    if (rng.chance(EVENTS.ASSIST_RATE)) {
      const assistW = onPitch.map((o, i) =>
        i === scorerIdx
          ? 0
          : EVENTS.ASSIST_POS_WEIGHT[o.player.position as Position] *
            (attrValue(o.player, 'passing') / 50),
      );
      const assistIdx = weightedPick(assistW, rng);
      if (assistIdx >= 0) assistId = (onPitch[assistIdx] as OnPitch).player.id;
    }

    events.push(event('goal', clubId, minute, scorer.id, { assistId }));
  }
  return events;
}

// ---------------------------------------------------------------------------
// Public phases
// ---------------------------------------------------------------------------

export interface MatchScript {
  /** Card + substitution + injury events (unsorted). */
  events: MatchEvent[];
  /** Man-down state per team, for the score (SPEC §6.5-§6.6; includes uncovered injuries). */
  home: TeamManDown;
  away: TeamManDown;
  /** On-pitch timelines, for attributing the scoreline afterwards. */
  homeLineup: OnPitch[];
  awayLineup: OnPitch[];
  /** Injuries per team, for availability + permanent hit (SPEC §12). */
  homeInjuries: TeamInjury[];
  awayInjuries: TeamInjury[];
}

function teamReds(
  cards: MatchEvent[],
  xi: Player[],
): {
  reds: Map<PlayerId, number>;
  minutes: number[];
  reshapeTrigger: { minute: number; position: Position } | null;
} {
  const posOf = new Map(xi.map((p) => [p.id, p.position]));
  const reds = new Map<PlayerId, number>();
  const minutes: number[] = [];
  let reshapeTrigger: { minute: number; position: Position } | null = null;
  for (const e of cards) {
    if (e.type !== 'red') continue;
    reds.set(e.playerId, e.minute);
    minutes.push(e.minute);
    const pos = posOf.get(e.playerId);
    if ((pos === 'DF' || pos === 'GK') && (!reshapeTrigger || e.minute < reshapeTrigger.minute)) {
      reshapeTrigger = { minute: e.minute, position: pos };
    }
  }
  return { reds, minutes, reshapeTrigger };
}

/**
 * Phase 1: cards + substitutions. Runs before the score is sampled. Returns the
 * man-down state (for the score) and the on-pitch timelines (for the scorers).
 */
export function buildMatchScript(home: TeamSide, away: TeamSide, rng: Rng): MatchScript {
  const homeCards = cardEvents(home, rng);
  const awayCards = cardEvents(away, rng);

  const homeR = teamReds(homeCards, home.xi);
  const awayR = teamReds(awayCards, away.xi);

  const homeSubs = substitutions(home, homeR.reds, homeR.reshapeTrigger, rng);
  const awaySubs = substitutions(away, awayR.reds, awayR.reshapeTrigger, rng);

  return {
    events: [...homeCards, ...awayCards, ...homeSubs.events, ...awaySubs.events],
    // Man-down minutes = red cards + injuries the team couldn't cover (§6.5, §12.2).
    home: {
      reds: [...homeR.minutes, ...homeSubs.uncoveredInjuryMinutes],
      reshapeFrom: homeSubs.reshapeFrom,
    },
    away: {
      reds: [...awayR.minutes, ...awaySubs.uncoveredInjuryMinutes],
      reshapeFrom: awaySubs.reshapeFrom,
    },
    homeLineup: homeSubs.lineup,
    awayLineup: awaySubs.lineup,
    homeInjuries: homeSubs.injuries,
    awayInjuries: awaySubs.injuries,
  };
}

/**
 * Phase 2: attribute the (already decided) scoreline to scorers/assisters, using
 * each team's on-pitch timeline. Goal events per side equal that side's score.
 */
export function assignGoals(
  homeClubId: ClubId,
  homeLineup: OnPitch[],
  awayClubId: ClubId,
  awayLineup: OnPitch[],
  homeGoals: number,
  awayGoals: number,
  rng: Rng,
): MatchEvent[] {
  return [
    ...goalEvents(homeClubId, homeLineup, homeGoals, rng),
    ...goalEvents(awayClubId, awayLineup, awayGoals, rng),
  ];
}
