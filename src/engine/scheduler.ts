/**
 * Double round-robin fixture generator (circle method). See SPEC.md §5.
 * Pure: same input clubs => same schedule.
 *
 * REVISIONE: il campo si assegna con un GREEDY anti-serie — la vecchia regola
 * (`homeFirst = true` per tutte le coppie non-pivot) produceva serie di 9-19
 * partite consecutive in casa o in trasferta. Il ritorno è a specchio INVERTITO
 * (prima giornata di ritorno = ultima di andata a campi invertiti), così al
 * cucito andata/ritorno ogni squadra cambia campo.
 */

import { asMatchId } from '../core/ids.js';
import type { ClubId, SeasonId } from '../core/ids.js';
import type { Match } from '../core/types.js';

interface Pairing {
  home: ClubId;
  away: ClubId;
}

/**
 * Generate all fixtures for a double round-robin among `clubIds`.
 * Requires an even number of clubs. Produces 2*(N-1) rounds.
 */
export function generateSchedule(seasonId: SeasonId, clubIds: readonly ClubId[]): Match[] {
  if (clubIds.length < 2) throw new Error('Need at least 2 clubs to schedule');
  if (clubIds.length % 2 !== 0) throw new Error('Club count must be even (no BYE support yet)');

  const firstLeg = assignVenues(circleMethod(clubIds));
  const rounds = firstLeg.length; // N-1
  const matches: Match[] = [];
  let seq = 0;

  // First leg.
  firstLeg.forEach((pairings, r) => {
    for (const p of pairings) {
      matches.push(makeMatch(seasonId, ++seq, r + 1, p.home, p.away));
    }
  });

  // Second leg: stessi accoppiamenti a campi invertiti, in ordine INVERSO di
  // giornata — chi chiude l'andata in casa riapre il ritorno in trasferta.
  for (let r = rounds - 1; r >= 0; r--) {
    for (const p of firstLeg[r] as Pairing[]) {
      matches.push(makeMatch(seasonId, ++seq, rounds + (rounds - r), p.away, p.home));
    }
  }

  return matches;
}

/** Circle method: fissa il club 0, ruota gli altri. SOLO gli accoppiamenti. */
function circleMethod(clubIds: readonly ClubId[]): [ClubId, ClubId][][] {
  const n = clubIds.length;
  const arr = clubIds.slice();
  const rounds: [ClubId, ClubId][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const pairings: [ClubId, ClubId][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairings.push([arr[i] as ClubId, arr[n - 1 - i] as ClubId]);
    }
    rounds.push(pairings);
    // Rotate all but the first element.
    arr.splice(1, 0, arr.pop() as ClubId);
  }

  return rounds;
}

/**
 * Campo per ogni coppia, GREEDY e deterministico: penalizza chi allungherebbe
 * una serie (casa o trasferta) e chi ha già più gare in casa; a parità decide
 * la parità di (giornata + posizione). Serie massime ~2-3, bilancio 50/50.
 */
function assignVenues(legs: [ClubId, ClubId][][]): Pairing[][] {
  const homeCount = new Map<ClubId, number>();
  /** >0 = serie di gare in casa, <0 = serie in trasferta. */
  const streak = new Map<ClubId, number>();
  return legs.map((pairs, r) =>
    pairs.map(([a, b], i) => {
      const sa = streak.get(a) ?? 0;
      const sb = streak.get(b) ?? 0;
      const ha = homeCount.get(a) ?? 0;
      const hb = homeCount.get(b) ?? 0;
      // Penalità dell'orientamento "a in casa": serie-casa di a + serie-trasferta
      // di b che si allungherebbero, più lo sbilancio dei conteggi.
      const penA = Math.max(0, sa) + Math.max(0, -sb) + (ha - hb) * 0.1;
      const penB = Math.max(0, sb) + Math.max(0, -sa) + (hb - ha) * 0.1;
      const aHome = penA !== penB ? penA < penB : (r + i) % 2 === 0;
      const home = aHome ? a : b;
      const away = aHome ? b : a;
      homeCount.set(home, (homeCount.get(home) ?? 0) + 1);
      const sh = streak.get(home) ?? 0;
      streak.set(home, sh > 0 ? sh + 1 : 1);
      const sw = streak.get(away) ?? 0;
      streak.set(away, sw < 0 ? sw - 1 : -1);
      return { home, away };
    }),
  );
}

function makeMatch(
  seasonId: SeasonId,
  seq: number,
  round: number,
  home: ClubId,
  away: ClubId,
): Match {
  return {
    id: asMatchId(`${seasonId}-m${seq}`),
    seasonId,
    round,
    homeClubId: home,
    awayClubId: away,
    played: false,
    homeGoals: null,
    awayGoals: null,
    events: [],
  };
}
