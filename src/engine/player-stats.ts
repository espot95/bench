/** Season-level player aggregates from match events. Pure. See SPEC.md §6.4. */

import type { ClubId, PlayerId } from '../core/ids.js';
import { playerHeight } from '../core/physique.js';
import type { Match, Player, World } from '../core/types.js';

export interface ScorerRow {
  playerId: PlayerId;
  clubId: ClubId;
  goals: number;
  assists: number;
}

export interface CardRow {
  playerId: PlayerId;
  clubId: ClubId;
  yellows: number;
  reds: number;
}

interface Acc {
  clubId: ClubId;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
}

function accumulate(matches: readonly Match[]): Map<PlayerId, Acc> {
  const acc = new Map<PlayerId, Acc>();
  const get = (playerId: PlayerId, clubId: ClubId): Acc => {
    let a = acc.get(playerId);
    if (!a) {
      a = { clubId, goals: 0, assists: 0, yellows: 0, reds: 0 };
      acc.set(playerId, a);
    }
    return a;
  };

  for (const m of matches) {
    for (const e of m.events) {
      if (e.type === 'goal') {
        get(e.playerId, e.clubId).goals++;
        if (e.assistId) get(e.assistId, e.clubId).assists++;
      } else if (e.type === 'yellow') {
        get(e.playerId, e.clubId).yellows++;
      } else if (e.type === 'red') {
        get(e.playerId, e.clubId).reds++;
      }
    }
  }
  return acc;
}

/** Top scorers, sorted by goals then assists. */
export function topScorers(matches: readonly Match[], limit = 10): ScorerRow[] {
  const acc = accumulate(matches);
  const rows: ScorerRow[] = [];
  for (const [playerId, a] of acc) {
    if (a.goals > 0 || a.assists > 0) {
      rows.push({ playerId, clubId: a.clubId, goals: a.goals, assists: a.assists });
    }
  }
  rows.sort((x, y) => y.goals - x.goals || y.assists - x.assists);
  return rows.slice(0, limit);
}

/** Top assist providers, sorted by assists then goals. */
export function topAssists(matches: readonly Match[], limit = 10): ScorerRow[] {
  const rows = topScorers(matches, Number.POSITIVE_INFINITY);
  rows.sort((x, y) => y.assists - x.assists || y.goals - x.goals);
  return rows.slice(0, limit);
}

/** Booking table, sorted by reds then yellows. */
export function cardTable(matches: readonly Match[], limit = 10): CardRow[] {
  const acc = accumulate(matches);
  const rows: CardRow[] = [];
  for (const [playerId, a] of acc) {
    if (a.yellows > 0 || a.reds > 0) {
      rows.push({ playerId, clubId: a.clubId, yellows: a.yellows, reds: a.reds });
    }
  }
  rows.sort((x, y) => y.reds - x.reds || y.yellows - x.yellows);
  return rows.slice(0, limit);
}

// =====================================================================
// G1 — STATISTICHE STAGIONALI PER GIOCATORE + PAGELLE (richiesta utente).
// Gol/assist/cartellini/minuti VERI dagli eventi; tiri/xG/xA/passaggi/duelli
// attribuiti deterministicamente dai totali veri del motore (hash, zero draw
// RNG → risultati di lega byte-identici per costruzione). Pagella 4-10.
// =====================================================================

export interface PlayerSeasonStats {
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  xa: number;
  keyPasses: number;
  dribbles: number;
  passes: number;
  passesOk: number;
  progPasses: number;
  recoveries: number;
  tacklesWon: number;
  tacklesTot: number;
  aerialsWon: number;
  aerialsTot: number;
  interceptions: number;
  clearances: number;
  errors: number;
  /** Solo DF/GK con ≥60' in campo. */
  cleanSheets: number;
  concededOn: number;
  /** Solo GK. */
  saves: number;
  shotsFaced: number;
  psxgFaced: number;
  yellow: number;
  red: number;
  km: number;
  /** Somma delle pagelle (media = ratingSum/apps). Voto per gara arrotondato al mezzo. */
  ratingSum: number;
}

export function emptyStats(): PlayerSeasonStats {
  return {
    apps: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    xa: 0,
    keyPasses: 0,
    dribbles: 0,
    passes: 0,
    passesOk: 0,
    progPasses: 0,
    recoveries: 0,
    tacklesWon: 0,
    tacklesTot: 0,
    aerialsWon: 0,
    aerialsTot: 0,
    interceptions: 0,
    clearances: 0,
    errors: 0,
    cleanSheets: 0,
    concededOn: 0,
    saves: 0,
    shotsFaced: 0,
    psxgFaced: 0,
    yellow: 0,
    red: 0,
    km: 0,
    ratingSum: 0,
  };
}

/** Hash deterministico in [0,1): il "rumore" delle attribuzioni, mai dal flusso RNG. */
function h01(s: string): number {
  let h = 0x811c9dc5;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Rumore moltiplicativo ±amp attorno a 1. */
const jit = (key: string, amp: number) => 1 + (h01(key) * 2 - 1) * amp;

interface Participant {
  player: Player;
  minutes: number;
  started: boolean;
}

/** Minuti per partecipante: titolari 90 (o fino al cambio), subentrati 90−minuto. */
function participantsOf(
  xi: Player[],
  events: Match['events'],
  clubId: string,
  world: World,
): Participant[] {
  const out = new Map<string, Participant>();
  for (const p of xi) out.set(p.id as string, { player: p, minutes: 90, started: true });
  for (const e of events) {
    if ((e.clubId as string) !== clubId) continue;
    if (e.type === 'sub') {
      const on = world.players.get(e.playerId);
      if (on && !out.has(e.playerId as string))
        out.set(e.playerId as string, {
          player: on,
          minutes: Math.max(1, 90 - e.minute),
          started: false,
        });
      const off = e.subOutId ? out.get(e.subOutId as string) : undefined;
      if (off) off.minutes = Math.min(off.minutes, e.minute);
    }
    if (e.type === 'red') {
      const sent = out.get(e.playerId as string);
      if (sent) sent.minutes = Math.min(sent.minutes, e.minute);
    }
  }
  return [...out.values()];
}

const A = (p: Player) => p.attributes as unknown as Record<string, number>;
const attr = (p: Player, k: string) => A(p)[k] ?? 50;

/** Riparto per pesi con resto: somma esatta al totale, deterministico. */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const base = raw.map((r) => Math.floor(r));
  let left = total - base.reduce((s, b) => s + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    base[i]! += 1;
    left--;
  }
  return base;
}

/**
 * Accumula le statistiche di UNA squadra in una partita giocata. `teamShots`/`teamXg`
 * sono i totali veri del motore; gli individuali sono attribuzioni deterministiche.
 */
function accumulateSide(
  store: Map<PlayerId, PlayerSeasonStats>,
  world: World,
  match: Match,
  clubId: string,
  xi: Player[],
  teamGoals: number,
  oppGoals: number,
  teamShots: number,
  teamXg: number,
  oppShots: number,
  oppXg: number,
): void {
  const parts = participantsOf(xi, match.events, clubId, world);
  const get = (p: Player): PlayerSeasonStats => {
    let s = store.get(p.id);
    if (!s) {
      s = emptyStats();
      store.set(p.id, s);
    }
    return s;
  };
  const mk = (p: Player, salt: string) => `${match.id}|${p.id}|${salt}`;

  // Gol/assist/cartellini VERI dagli eventi.
  const goalsBy = new Map<string, number>();
  const assistsBy = new Map<string, number>();
  for (const e of match.events) {
    if ((e.clubId as string) !== clubId) continue;
    if (e.type === 'goal') {
      goalsBy.set(e.playerId as string, (goalsBy.get(e.playerId as string) ?? 0) + 1);
      if (e.assistId)
        assistsBy.set(e.assistId as string, (assistsBy.get(e.assistId as string) ?? 0) + 1);
    }
  }

  // Attribuzione TIRI: peso da finalizzazione/ruolo/minuti; chi ha segnato ne ha almeno quanti i gol.
  const roleShot: Record<string, number> = { GK: 0, DF: 0.35, MF: 1, FW: 1.7 };
  const shotW = parts.map(
    (pt) =>
      (pt.minutes / 90) *
      (roleShot[pt.player.position] ?? 1) *
      Math.max(5, attr(pt.player, 'finishing') + 0.4 * attr(pt.player, 'pace') - 45) *
      jit(mk(pt.player, 'sh'), 0.25),
  );
  const shots = apportion(Math.max(teamShots, teamGoals), shotW);
  for (let i = 0; i < parts.length; i++) {
    const g = goalsBy.get(parts[i]!.player.id as string) ?? 0;
    if (shots[i]! < g) shots[i] = g;
  }
  const shotSum = Math.max(
    1,
    shots.reduce((s, x) => s + x, 0),
  );

  // xA di squadra ≈ xG × 0.75, ripartito su chi costruisce (passaggi/decisioni, MF in testa).
  const roleCre: Record<string, number> = { GK: 0.05, DF: 0.45, MF: 1.4, FW: 0.9 };
  const creW = parts.map(
    (pt) =>
      (pt.minutes / 90) *
      (roleCre[pt.player.position] ?? 1) *
      Math.max(5, attr(pt.player, 'passing') + 0.5 * attr(pt.player, 'decisions') - 40) *
      jit(mk(pt.player, 'cr'), 0.25),
  );
  const creSum = Math.max(
    1,
    creW.reduce((s, x) => s + x, 0),
  );

  const won = teamGoals > oppGoals;
  const lost = teamGoals < oppGoals;

  for (let i = 0; i < parts.length; i++) {
    const pt = parts[i]!;
    const p = pt.player;
    const s = get(p);
    const m90 = pt.minutes / 90;
    const g = goalsBy.get(p.id as string) ?? 0;
    const a = assistsBy.get(p.id as string) ?? 0;
    const isGK = p.position === 'GK';
    const isDF = p.position === 'DF';
    const isMF = p.position === 'MF';

    s.apps += 1;
    s.minutes += pt.minutes;
    s.goals += g;
    s.assists += a;

    const mySh = isGK ? 0 : shots[i]!;
    const myXg = teamXg * (mySh / shotSum);
    const sot = Math.max(g, Math.round(mySh * (0.28 + attr(p, 'finishing') / 280)));
    s.shots += mySh;
    s.shotsOnTarget += Math.min(mySh, sot);
    s.xg += myXg;

    const myXa = teamXg * 0.75 * (creW[i]! / creSum);
    const kp = Math.max(a, Math.round(myXa / 0.09 + (h01(mk(p, 'kp')) - 0.5)));
    s.xa += myXa;
    s.keyPasses += kp;

    // Volumi da ruolo+attributi (per 90), scalati sui minuti veri.
    const passVol = Math.round(
      (isGK ? 24 : isDF ? 52 : isMF ? 62 : 30) *
        (0.7 + attr(p, 'passing') / 180) *
        m90 *
        jit(mk(p, 'pv'), 0.12),
    );
    const acc = Math.min(0.95, 0.68 + attr(p, 'passing') / 420 + attr(p, 'composure') / 900);
    s.passes += passVol;
    s.passesOk += Math.round(passVol * acc);
    if (isDF || isMF)
      s.progPasses += Math.round(passVol * (0.07 + Math.max(0, attr(p, 'passing') - 50) / 600));

    if (!isGK) {
      s.dribbles += Math.max(
        0,
        Math.round((Math.max(0, attr(p, 'dribbling') - 52) / 11) * m90 * jit(mk(p, 'dr'), 0.4)),
      );
      s.recoveries += Math.round(
        (isMF ? 7 : isDF ? 6 : 2.5) *
          (0.6 + attr(p, 'workRate') / 200) *
          m90 *
          jit(mk(p, 're'), 0.25),
      );
      const tt = Math.round((isDF ? 3.6 : isMF ? 2.4 : 0.8) * m90 * jit(mk(p, 'tt'), 0.35));
      const twr = Math.min(0.85, 0.42 + attr(p, 'tackling') / 350);
      s.tacklesTot += tt;
      s.tacklesWon += Math.round(tt * twr);
      const at = Math.round((isDF ? 3.4 : 1.2) * m90 * jit(mk(p, 'at'), 0.4));
      const awr = Math.min(
        0.85,
        0.38 + attr(p, 'strength') / 500 + Math.max(0, playerHeight(p) - 178) / 120,
      );
      s.aerialsTot += at;
      s.aerialsWon += Math.round(at * awr);
      if (isDF) {
        s.interceptions += Math.round(
          1.9 * (0.5 + attr(p, 'positioning') / 150) * m90 * jit(mk(p, 'in'), 0.35),
        );
        s.clearances += Math.round(3.6 * m90 * jit(mk(p, 'cl'), 0.4));
      }
    }
    // L'errore che porta al tiro: raro, più probabile nei distratti sotto pressione.
    const err =
      h01(mk(p, 'er')) <
      Math.max(0, 60 - attr(p, 'composure') / 2 - attr(p, 'decisions') / 2) / 700;
    if (err && !won) s.errors += 1;

    // Porta e difesa: il portiere "possiede" la gara (subiti sempre, invariante
    // subiti = tiri in porta − parate); il clean sheet richiede presenza vera (≥60').
    if (isGK) {
      const sotA = Math.max(oppGoals, Math.round(oppShots * 0.34));
      s.shotsFaced += sotA;
      s.saves += Math.max(0, sotA - oppGoals);
      s.psxgFaced += oppXg;
      s.concededOn += oppGoals;
      if (oppGoals === 0 && pt.minutes >= 60) s.cleanSheets += 1;
    } else if (isDF && pt.minutes >= 60) {
      if (oppGoals === 0) s.cleanSheets += 1;
      s.concededOn += oppGoals;
    }
    s.km += (9 + (attr(p, 'stamina') + attr(p, 'workRate')) / 40) * m90 * jit(mk(p, 'km'), 0.06);

    // -------- PAGELLA (4-10, mezzo punto; 6 = sufficienza) --------
    let voto = 6;
    voto += Math.min(2.5, g * 1.0) + a * 0.5;
    voto += Math.max(0, Math.min(mySh, sot) - g) * 0.1;
    if (isMF) voto += kp * 0.12;
    if ((isDF || isGK) && pt.minutes >= 60) {
      if (oppGoals === 0) voto += 0.5;
      if (oppGoals >= 2) voto -= 0.15 * (oppGoals - 1);
    }
    if (isGK) {
      const sotA = Math.max(oppGoals, Math.round(oppShots * 0.34));
      voto += Math.max(0, sotA - oppGoals) * 0.12 + (oppXg - oppGoals) * 0.3;
    }
    if (won) voto += 0.25;
    if (lost) voto -= 0.25;
    if (err && !won) voto -= 0.7;
    voto += (h01(mk(p, 'vn')) - 0.5) * 0.5;
    for (const e of match.events) {
      if ((e.clubId as string) !== clubId || (e.playerId as string) !== (p.id as string)) continue;
      if (e.type === 'yellow') {
        s.yellow += 1;
        voto -= 0.2;
      }
      if (e.type === 'red') {
        s.red += 1;
        voto -= 1.5;
      }
    }
    // Uno spezzone breve pesa poco: il voto si stringe verso il 6.
    if (pt.minutes < 30) voto = 6 + (voto - 6) * 0.5;
    voto = Math.max(4, Math.min(10, Math.round(voto * 2) / 2));
    s.ratingSum += voto;
  }
}

/** Accumula ENTRAMBE le squadre di una partita giocata (chiamata dal runner). */
export function accumulateMatchStats(
  store: Map<PlayerId, PlayerSeasonStats>,
  world: World,
  match: Match,
  homeXi: Player[],
  awayXi: Player[],
  xg: { home: number; away: number },
  shots: { home: number; away: number },
): void {
  const hg = match.homeGoals ?? 0;
  const ag = match.awayGoals ?? 0;
  accumulateSide(
    store,
    world,
    match,
    match.homeClubId as string,
    homeXi,
    hg,
    ag,
    shots.home,
    xg.home,
    shots.away,
    xg.away,
  );
  accumulateSide(
    store,
    world,
    match,
    match.awayClubId as string,
    awayXi,
    ag,
    hg,
    shots.away,
    xg.away,
    shots.home,
    xg.home,
  );
}
