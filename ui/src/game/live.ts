/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { playableRoles } from '../../../src/core/archetypes';
import { type Club, leagueOfClub, nationOfClub } from '../../../src/core/types';
import { clubIdentity } from '../identity';
import { hashStr } from './shared';

import type { PlayerId } from '../../../src/core/ids';
import type { GameSession } from '../game';
import { type RoundResult, afterRound } from '../game';

// ---- DIRETTA (richiesta utente): guardare la partita, coi cambi che contano ----

/** Apre la diretta sulla giornata corrente. False = niente gara/motore non xg. */
export function startLiveMatch(s: GameSession): boolean {
  if (s.live) return true;
  const sess = s.runner.playRoundLive(s.club.id);
  if (!sess) return false;
  s.live = sess;
  return true;
}

export function liveIsOn(s: GameSession): boolean {
  return s.live !== undefined;
}

const CRONACA: Record<string, string[]> = {
  goal: [
    'GOOOL! {p} la butta dentro!',
    '{p} non sbaglia: è GOL!',
    'La curva esplode: la firma è di {p}!',
    'Palla in rete! {p}, di rapina!',
  ],
  goalAssist: [
    'GOOOL! Palla d’oro di {q}, {p} deve solo spingerla dentro!',
    '{q} disegna, {p} colpisce: GOL!',
  ],
  yellow: ['Giallo per {p}: entrata dura.', 'Ammonito {p}, era diffidabile quell’intervento.'],
  red: ['ROSSO! {p} lascia i suoi in dieci!', 'Espulso {p} — che ingenuità!'],
  sub: ['Cambio: dentro {p}, fuori {q}.', 'Si rivede la panchina: {p} per {q}.'],
  chanceSaved: ['{p} calcia — il portiere dice NO!', 'Che occasione: gran parata su {p}!'],
  chanceMiss: ['{p} a un passo dal gol: fuori di un soffio.', 'Ci prova {p}: alto, non di molto.'],
  injury: ['Guaio: {p} resta a terra, non ce la fa.', '{p} si tocca il muscolo: deve uscire.'],
};

function cronacaLine(kind: string, seedKey: string, p: string, q?: string): string {
  const pool = CRONACA[kind] ?? CRONACA.chanceMiss!;
  const t = pool[hashStr(seedKey) % pool.length] ?? pool[0]!;
  return t.replace('{p}', p).replace('{q}', q ?? '');
}

/** La vista della diretta: tutto ciò che serve allo schermo-partita. */
export function liveView(s: GameSession) {
  const live = s.live;
  if (!live) return null;
  const match = live.match;
  const homeClub = s.world.clubs.get(match.homeClubId);
  const awayClub = s.world.clubs.get(match.awayClubId);
  if (!homeClub || !awayClub) return null;
  const nation = nationOfClub(s.world, s.club.id)?.code ?? 'ITA';
  const idOf = (c: Club) =>
    clubIdentity(c.name, c.reputation, leagueOfClub(s.world, c.id).name, nation);
  const homeId = idOf(homeClub);
  const awayId = idOf(awayClub);
  const nameOf = (pid: string | null): string =>
    pid ? (s.world.players.get(pid as PlayerId)?.name ?? '—') : '—';

  const events = live.events();
  const minute = live.minute();
  const score = live.score();
  const fullTime = live.fullTime();
  // PAGELLE VIVE (richiesta utente): l'attribuzione G1 sui numeri parziali,
  // per TUTTI i giocatori scesi in campo — il voto si muove con la gara.
  const matchRatings = live.matchRatings(); // calcolate UNA volta per vista
  const ratingByPid = new Map(matchRatings.map((r) => [r.playerId as string, r]));

  // Badge per riga-giocatore: gol, cartellini, cambi.
  const badgesFor = (pid: string) => ({
    goals: events.filter((e) => e.type === 'goal' && (e.playerId as string) === pid).length,
    yellow: events.some((e) => e.type === 'yellow' && (e.playerId as string) === pid),
    red: events.some((e) => e.type === 'red' && (e.playerId as string) === pid),
    off: events.find((e) => e.type === 'sub' && (e.subOutId as string | null) === pid)?.minute,
    on: events.find((e) => e.type === 'sub' && (e.playerId as string) === pid)?.minute,
  });
  const userSideKey: 'home' | 'away' = live.userIsHome ? 'home' : 'away';
  const sideRows = (side: 'home' | 'away') =>
    live.onPitchEntries(side).map(({ player: p, slot }) => {
      // La TUA squadra si disegna con le posizioni VERE della lavagna tattica
      // (fase difensiva = il modulo); i subentrati senza punto cadono sulla linea.
      const board = side === userSideKey ? s.board?.difesa?.[p.id as string] : undefined;
      const rating = ratingByPid.get(p.id as string);
      return {
        id: p.id as string,
        name: p.name,
        role: playableRoles(p).primary,
        line: slot,
        bx: board?.x ?? null,
        by: board?.y ?? null,
        /** Il voto VIVO (dal 10′: prima non dice nulla). */
        voto: minute >= 10 && rating ? rating.pagella : null,
        ...badgesFor(p.id as string),
      };
    });

  // Telecronaca: eventi veri + occasioni sintetizzate dai tiri delle finestre.
  const feed: { minute: number; text: string; side: 'home' | 'away' | null }[] = [];
  for (const e of events) {
    const side = e.clubId === match.homeClubId ? 'home' : 'away';
    const key = `${match.id}|${e.minute}|${e.type}|${e.playerId}`;
    if (e.type === 'goal')
      feed.push({
        minute: e.minute,
        side,
        text: e.assistId
          ? cronacaLine('goalAssist', key, nameOf(e.playerId as string), nameOf(e.assistId))
          : cronacaLine('goal', key, nameOf(e.playerId as string)),
      });
    else if (e.type === 'yellow' || e.type === 'red')
      feed.push({
        minute: e.minute,
        side,
        text: cronacaLine(e.type, key, nameOf(e.playerId as string)),
      });
    else if (e.type === 'sub')
      feed.push({
        minute: e.minute,
        side,
        text: cronacaLine('sub', key, nameOf(e.playerId as string), nameOf(e.subOutId)),
      });
  }
  for (const inj of live.injuriesSoFar())
    feed.push({
      minute: inj.minute,
      side: live.userIsHome ? 'home' : 'away',
      text: cronacaLine('injury', `${match.id}|inj|${inj.player.id}`, inj.player.name),
    });
  // Occasioni: nelle finestre coi tiri ma senza gol, il racconto respira.
  const goalMinutes = new Set(events.filter((e) => e.type === 'goal').map((e) => e.minute));
  for (const w of live.windows()) {
    for (const side of ['home', 'away'] as const) {
      const shots = side === 'home' ? w.shotsHome : w.shotsAway;
      if (shots <= 0) continue;
      const hasGoal = [...goalMinutes].some((m) => m > w.from && m <= w.to);
      if (hasGoal || hashStr(`${match.id}|occ|${w.from}|${side}`) % 100 >= 55) continue;
      const xi = live.onPitch(side).filter((p) => p.position !== 'GK');
      const shooter = xi[hashStr(`${match.id}|sh|${w.from}|${side}`) % Math.max(1, xi.length)];
      if (!shooter) continue;
      const m = Math.min(
        90,
        w.from + 1 + (hashStr(`${match.id}|om|${w.from}|${side}`) % Math.max(1, w.to - w.from)),
      );
      feed.push({
        minute: m,
        side,
        text: cronacaLine(
          hashStr(`${match.id}|ok|${w.from}|${side}`) % 2 === 0 ? 'chanceSaved' : 'chanceMiss',
          `${match.id}|oc|${w.from}|${side}`,
          shooter.name,
        ),
      });
    }
  }
  // Duplice e triplice fischio nel racconto.
  if (minute >= 45) {
    const h45 = events.filter(
      (e) => e.type === 'goal' && e.minute <= 45 && e.clubId === match.homeClubId,
    ).length;
    const a45 = events.filter(
      (e) => e.type === 'goal' && e.minute <= 45 && e.clubId === match.awayClubId,
    ).length;
    feed.push({
      minute: 45,
      side: null,
      text: `Duplice fischio: squadre al riposo sul ${h45}-${a45}.`,
    });
  }
  if (live.finished())
    feed.push({
      minute: fullTime,
      side: null,
      text: `TRIPLICE FISCHIO! Finisce ${score.home}-${score.away}.`,
    });
  feed.sort((a, b) => a.minute - b.minute);

  // Momentum [-1..1]: le ultime finestre dicono chi sta spingendo (xG recente).
  const wins = live.windows().slice(-3);
  const mh = wins.reduce((a, w) => a + w.xgHome, 0);
  const ma = wins.reduce((a, w) => a + w.xgAway, 0);
  const momentum = mh + ma > 0.02 ? (mh - ma) / (mh + ma) : 0;

  // Le PAGELLE complete per il dopogara (entrambe le squadre) + migliore in campo.
  const ratingRows = (side: 'home' | 'away') =>
    matchRatings
      .filter((r) => r.side === side)
      .map((r) => {
        const p = s.world.players.get(r.playerId);
        return {
          name: p?.name ?? '—',
          role: p ? playableRoles(p).primary : '—',
          pagella: r.pagella,
          minutes: r.minutes,
          goals: r.goals,
          assists: r.assists,
          shots: r.shots,
          saves: r.saves,
        };
      })
      .sort((a, b) => b.pagella - a.pagella);
  const allRatings = [...ratingRows('home'), ...ratingRows('away')];
  const mvp = allRatings.reduce(
    (best, r) => (r.pagella > (best?.pagella ?? 0) ? r : best),
    null as (typeof allRatings)[number] | null,
  );

  return {
    minute,
    fullTime,
    clock: minute <= 90 ? `${minute}′` : `90+${minute - 90}′`,
    finished: live.finished(),
    userIsHome: live.userIsHome,
    pagelle: { home: ratingRows('home'), away: ratingRows('away'), mvp },
    home: {
      name: homeClub.name,
      color: homeId.primary,
      accent: homeId.accent,
      score: score.home,
      rows: sideRows('home'),
    },
    away: {
      name: awayClub.name,
      color: awayId.primary,
      accent: awayId.accent,
      score: score.away,
      rows: sideRows('away'),
    },
    bench: live.bench().map((p) => ({
      id: p.id as string,
      name: p.name,
      role: playableRoles(p).primary,
    })),
    subsLeft: live.subsLeft(),
    /** Cambi ANNUNCIATI al quarto uomo: entrano alla prossima interruzione. */
    pending: live.pendingSubs().map((ps) => ({
      outId: ps.outId as string,
      outName: nameOf(ps.outId as string),
      inName: nameOf(ps.inId as string),
    })),
    momentum,
    feed,
    lastLine: feed.filter((f) => f.minute <= minute).at(-1)?.text ?? 'Si parte!',
  };
}

export function livePlayTo(s: GameSession, minute: number): void {
  s.live?.playTo(minute);
}

export function liveSub(s: GameSession, outId: string, inId: string): boolean {
  return s.live?.sub(outId as PlayerId, inId as PlayerId) ?? false;
}

export function liveCancelSub(s: GameSession, outId: string): boolean {
  return s.live?.cancelSub(outId as PlayerId) ?? false;
}

/** Fischio finale: chiude gara e giornata (stessa coda del quick-result). */
export function liveFinish(s: GameSession): RoundResult | null {
  const live = s.live;
  if (!live) return null;
  const res = live.finish();
  s.live = undefined;
  return afterRound(s, res);
}
