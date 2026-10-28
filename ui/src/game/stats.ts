/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { archetypeHeatmap, playerArchetype, playerMovements } from '../../../src/core/archetypes';
import { baricentroLabel, playerHeight, runningStyle } from '../../../src/core/physique';
import { playerOverall } from '../../../src/core/ratings';
import { leagueOfClub } from '../../../src/core/types';
import { moraleLabel } from '../../../src/engine/morale';
import type { PlayerSeasonStats } from '../../../src/engine/player-stats';
import { contractYearsLeft } from '../../../src/market/transfers';
import { baseMarketValue } from '../../../src/market/value';
import { scoutedHeatmap } from '../../../src/scouting/report';
import { bandOf } from '../band';
import { formFor } from './shared';

import type { PlayerId } from '../../../src/core/ids';
import type { Player } from '../../../src/core/types';
import type { GameSession } from '../game';
import { playerCareer, worldPlayerStats } from '../game';

// ---- Player detail (own players: real attributes; potential stays HIDDEN) ----
import { personalityLabel } from '../../../src/core/personality';
import { injuryLabel } from '../../../src/engine/injury';

/** Card-heatmap dal punto di vista dell'utente (i TUOI esatti, gli altrui osservati). */
export interface HeatView {
  grid: number[][];
  archetype: string;
  height: number;
  baricentro: string;
  /** null = conoscenza piena (tuo giocatore). */
  obs: number | null;
}

export function playerHeatView(s: GameSession, playerId: string): HeatView | null {
  const p = s.world.players.get(playerId as PlayerId);
  if (!p) return null;
  const mine = s.club.playerIds.includes(p.id);
  const obs = mine ? null : (s.observations?.[playerId] ?? 0);
  const grid = mine
    ? archetypeHeatmap(playerArchetype(p), p.preferredFoot)
    : scoutedHeatmap(p, Math.max(1, obs ?? 0));
  return {
    grid,
    archetype: playerArchetype(p).label,
    height: playerHeight(p),
    baricentro: baricentroLabel(p),
    obs,
  };
}

/**
 * G2 — percentili di ruolo vs i PARI RUOLO del campionato DEL GIOCATORE (minuti
 * veri). Per i giocatori NON tuoi serve scouting (≥3 osservazioni). G4: il mondo
 * intero gioca, quindi le statistiche ci sono per OGNI campionato.
 */
export function percentilesFor(s: GameSession, playerId: string) {
  const p = s.world.players.get(playerId as PlayerId);
  if (!p) return null;
  const mine = s.club.playerIds.includes(p.id);
  const obs = s.observations?.[playerId] ?? 0;
  if (!mine && obs < 3) return { gated: true as const, have: obs, needed: 3 };
  const stats = worldPlayerStats(s);
  const st = stats.get(p.id);
  if (!st || st.minutes < 90) return { gated: false as const, ready: false as const };
  // I pari-ruolo si confrontano NEL campionato dove gioca il giocatore.
  const leagueByPid = new Map<string, string>();
  for (const c of s.world.clubs.values()) {
    const lid = leagueOfClub(s.world, c.id).id as string;
    for (const pid of c.playerIds) leagueByPid.set(pid as string, lid);
  }
  const myLeague = leagueByPid.get(playerId);
  const peers: PlayerSeasonStats[] = [];
  for (const [pid, x] of stats) {
    const q = s.world.players.get(pid);
    if (
      q?.position === p.position &&
      x.minutes >= 180 &&
      leagueByPid.get(pid as string) === myLeague
    )
      peers.push(x);
  }
  if (peers.length < 8) return { gated: false as const, ready: false as const };
  const p90 = (x: PlayerSeasonStats, v: number) => (v * 90) / Math.max(1, x.minutes);
  const pctOf = (get: (x: PlayerSeasonStats) => number, v: number, invert = false) => {
    let below = 0;
    let ties = 0;
    for (const x of peers) {
      const w = get(x);
      if (w < v) below++;
      else if (w === v) ties++;
    }
    const raw = ((below + ties / 2) / peers.length) * 100;
    return invert ? 100 - raw : raw;
  };
  const m = (
    label: string,
    get: (x: PlayerSeasonStats) => number,
    fmt: (v: number) => string,
    invert = false,
  ) => ({ label, pct: pctOf(get, get(st), invert), value: fmt(get(st)) });
  const f1 = (v: number) => v.toFixed(1);
  const f2 = (v: number) => v.toFixed(2);
  const pc = (v: number) => `${(v * 100).toFixed(0)}%`;
  const media = (x: PlayerSeasonStats) => (x.apps > 0 ? x.ratingSum / x.apps : 0);
  const metrics =
    p.position === 'GK'
      ? [
          m('parate', (x) => (x.shotsFaced > 0 ? x.saves / x.shotsFaced : 0), pc),
          m('xG evitati/90', (x) => p90(x, x.psxgFaced - x.concededOn), f2),
          m('clean sheet', (x) => (x.apps > 0 ? x.cleanSheets / x.apps : 0), pc),
          m('subiti/90', (x) => p90(x, x.concededOn), f2, true),
          m('pagella', media, f2),
        ]
      : p.position === 'DF'
        ? [
            m('contrasti', (x) => (x.tacklesTot > 0 ? x.tacklesWon / x.tacklesTot : 0), pc),
            m('anticipi/90', (x) => p90(x, x.interceptions), f1),
            m('aerei', (x) => (x.aerialsTot > 0 ? x.aerialsWon / x.aerialsTot : 0), pc),
            m('spazzate/90', (x) => p90(x, x.clearances), f1),
            m('progressivi/90', (x) => p90(x, x.progPasses), f1),
            m('pagella', media, f2),
          ]
        : p.position === 'MF'
          ? [
              m('xA/90', (x) => p90(x, x.xa), f2),
              m('key pass/90', (x) => p90(x, x.keyPasses), f1),
              m('precisione', (x) => (x.passes > 0 ? x.passesOk / x.passes : 0), pc),
              m('recuperi/90', (x) => p90(x, x.recoveries), f1),
              m('progressivi/90', (x) => p90(x, x.progPasses), f1),
              m('pagella', media, f2),
            ]
          : [
              m('gol/90', (x) => p90(x, x.goals), f2),
              m('xG/90', (x) => p90(x, x.xg), f2),
              m('tiri/90', (x) => p90(x, x.shots), f1),
              m('xA/90', (x) => p90(x, x.xa), f2),
              m('dribbling/90', (x) => p90(x, x.dribbles), f1),
              m('pagella', media, f2),
            ];
  return { gated: false as const, ready: true as const, peers: peers.length, metrics };
}

export function playerDetail(s: GameSession, name: string) {
  const p = s.club.playerIds.map((id) => s.world.players.get(id)!).find((x) => x?.name === name);
  if (!p) return null;
  const contract = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
  // G1/G4: le statistiche stagionali vere (pagelle incluse), su scala mondo.
  const st = worldPlayerStats(s).get(p.id);
  const per90 = (v: number) => (st && st.minutes > 0 ? (v * 90) / st.minutes : 0);
  return {
    heat: playerHeatView(s, p.id as string),
    career: playerCareer(s, p.id as string),
    stats: st
      ? {
          apps: st.apps,
          minutes: st.minutes,
          rating: st.apps > 0 ? st.ratingSum / st.apps : 0,
          goals: st.goals,
          assists: st.assists,
          xg: st.xg,
          xa: st.xa,
          xg90: per90(st.xg),
          shots90: per90(st.shots),
          keyPasses90: per90(st.keyPasses),
          dribbles90: per90(st.dribbles),
          passAcc: st.passes > 0 ? st.passesOk / st.passes : 0,
          recoveries90: per90(st.recoveries),
          tackleWinPct: st.tacklesTot > 0 ? st.tacklesWon / st.tacklesTot : 0,
          aerialWinPct: st.aerialsTot > 0 ? st.aerialsWon / st.aerialsTot : 0,
          cleanSheets: st.cleanSheets,
          concededOn: st.concededOn,
          saves: st.saves,
          savePct: st.shotsFaced > 0 ? st.saves / st.shotsFaced : 0,
          psxgDiff: st.psxgFaced - st.concededOn,
          yellow: st.yellow,
          red: st.red,
          km: st.apps > 0 ? st.km / st.apps : 0,
        }
      : null,
    name: p.name,
    pos: p.position,
    age: p.age,
    nationality: p.nationality,
    foot: p.preferredFoot,
    /** G2: niente numero — fascia parlata + movimenti senza palla. */
    band: bandOf(playerOverall(p), p.age),
    movements: playerMovements(p),
    running: runningStyle(p),
    /** G3: quotazione che segue il rendimento. */
    value:
      Math.round(
        (baseMarketValue(
          playerOverall(p),
          p.age,
          p.potential,
          contractYearsLeft(s.world, p, s.year),
        ) *
          formFor(s, p, s.club)) /
          100_000,
      ) * 100_000,
    formPct: Math.round((formFor(s, p, s.club) - 1) * 100),
    percentiles: percentilesFor(s, p.id as string),
    morale: moraleLabel(p.morale),
    label: personalityLabel(p),
    injury: injuryLabel(p) || null,
    wage: contract ? Math.round(contract.wage / 1000) : 0,
    contractEnd: contract?.endYear ?? null,
    attrs: Object.entries(p.attributes as unknown as Record<string, number>),
    adapting: p.transferStatus ? p.transferStatus.rampRemaining : null,
  };
}
