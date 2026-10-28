/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import {
  RENEWAL,
  type RenewalOfferTerms,
  bestRivalInterest,
  isClubFan,
  offerRenewalTerms,
  openRenewal,
  promiseDeadline,
  resumeRenewal,
} from '../../../src/contracts/renewal-negotiation';
import { playableRoles } from '../../../src/core/archetypes';
import { playerOverall } from '../../../src/core/ratings';
import { moraleShock } from '../../../src/engine/morale';
import { seasonStandings } from '../../../src/engine/season';
import { contractYearsLeft } from '../../../src/market/transfers';
import { baseMarketValue } from '../../../src/market/value';
import { createRng } from '../../../src/rng/rng';
import { starString } from '../band';
import { fmtDay } from '../calendar';
import { currentDay, gazzetta, hashStr, refreshTreasury } from './shared';

import type { PlayerId } from '../../../src/core/ids';
import type { Player, Position } from '../../../src/core/types';
import type { GameSession } from '../game';

// ---------------------------------------------------------------------------
// Rinnovi negoziati (MODULE_CONTRACTS): guscio sul motore contracts/.
// ---------------------------------------------------------------------------

/** Contratti del club, i più urgenti in cima (Sede → Contratti). */
export function contractRows(s: GameSession) {
  const notes = s.renewalNotes ?? {};
  return s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => {
      const c = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
      const n = notes[p.id as string];
      const note = n?.leaving
        ? 'addio annunciato'
        : n?.wantsOut
          ? 'chiede la cessione'
          : n?.stallState
            ? `prende tempo (torna g.${n.stallState.stallUntilRound})`
            : n?.cooldownUntil !== undefined && s.runner.nextRound() < n.cooldownUntil
              ? `tavolo gelato fino a g.${n.cooldownUntil}`
              : n?.betrayed
                ? 'promessa tradita: pretende di più'
                : null;
      const agency = p.agencyId
        ? (s.world.agencies?.find((a) => a.id === p.agencyId)?.name ?? 'agenzia')
        : 'si rappresenta da solo';
      const bonusCount = c?.bonuses ? Object.keys(c.bonuses).length : 0;
      return {
        id: p.id as string,
        name: p.name,
        pos: p.position,
        age: p.age,
        overall: Math.round(playerOverall(p)),
        stars: starString(playerOverall(p)),
        /** Ruolo fine (lavagna): apre la riga della tabella contratti. */
        role: playableRoles(p).primary,
        wage: c?.wage ?? 0,
        /** Netto ~52% del lordo (cuneo fiscale da calciatore, approssimazione display). */
        wageNet: Math.round((c?.wage ?? 0) * 0.52),
        endYear: c?.endYear ?? 0,
        yearsLeft: c ? c.endYear - s.year : 0,
        expiring: c !== undefined && c.endYear <= s.year,
        fan: isClubFan(p, s.club.id),
        agency,
        bonusCount,
        note,
      };
    })
    .sort(
      (a, b) =>
        Number(b.expiring) - Number(a.expiring) ||
        a.yearsLeft - b.yearsLeft ||
        b.overall - a.overall,
    );
}

/** Contratti che scadono in questa stagione (per il ticker dell'hub). */
export function expiringContracts(s: GameSession): number {
  return s.club.playerIds.filter((id) => {
    const p = s.world.players.get(id);
    const c = p?.contractId ? s.world.contracts.get(p.contractId) : undefined;
    return c !== undefined && c.endYear <= s.year;
  }).length;
}

/** Apre (o riapre da uno stallo) il tavolo del rinnovo. Ritorna un messaggio o null se aperto. */
export function startRenewalTalk(s: GameSession, playerId: string): string | null {
  if (s.renewal && s.renewal.stage === 'terms') return 'Hai già un tavolo aperto: chiudilo prima.';
  const player = s.world.players.get(playerId as PlayerId);
  if (!player || !s.club.playerIds.includes(player.id)) return 'Giocatore introvabile.';
  // Calendario: l'entourage non è sempre libero subito — primo click fissa la call.
  const today = currentDay(s);
  const agentCall = (s.calls ?? []).find(
    (c) => c.playerId === playerId && c.kind === 'procuratore',
  );
  if (!agentCall) {
    const wait = hashStr(`${playerId}|agente|${s.year}|${today}`) % 4; // 0..3: i procuratori vivono al telefono
    if (wait > 0) {
      s.calls = [
        ...(s.calls ?? []),
        {
          id: `call-rin-${playerId}-${s.year}-${today + wait}`,
          kind: 'procuratore',
          playerId,
          playerName: player.name,
          withName: "l'entourage",
          day: today + wait,
        },
      ];
      return `L'entourage di ${player.name} ti richiama ${fmtDay(s.year, today + wait)}: appuntamento in agenda (📅).`;
    }
  } else if (agentCall.day > today) {
    return `La call con l'entourage di ${player.name} è ${fmtDay(s.year, agentCall.day)}: salta lì dal calendario (📅).`;
  } else {
    s.calls = (s.calls ?? []).filter((c) => c !== agentCall);
  }
  const round = s.runner.nextRound();
  if (!s.renewalNotes) s.renewalNotes = {};
  const notes = s.renewalNotes;
  const n = notes[playerId];
  if (n?.leaving) return `${player.name} ha annunciato l'addio: non c'è più niente da trattare.`;
  if (n?.cooldownUntil !== undefined && round < n.cooldownUntil)
    return `L'entourage non risponde: il tavolo è gelato fino alla giornata ${n.cooldownUntil}.`;
  if (n?.stallState) {
    // Lo stallo si riapre citando un rivale REALE (MODULE_MARKET §9.4).
    const st = resumeRenewal(
      n.stallState,
      round,
      bestRivalInterest(s.world, s.club, player, s.year),
    );
    if (st.stage === 'stalled')
      return `${player.name} sta ancora prendendo tempo: se ne riparla dalla giornata ${st.stallUntilRound}.`;
    n.stallState = undefined;
    if (st.stage === 'leaving') {
      n.leaving = true;
      gazzetta(s, round, `CASO ${player.name.toUpperCase()}: niente rinnovo, a scadenza saluta.`);
      return `${player.name} ha deciso: a scadenza se ne andrà.`;
    }
    s.renewal = st;
    return null;
  }
  const res = openRenewal(
    s.world,
    s.club,
    player,
    s.year,
    seasonStandings(s.world, s.season),
    { betrayed: n?.betrayed },
    createRng((s.seed ^ hashStr(playerId)) + round * 104729 + 13),
  );
  if (!res.ok) return res.reason;
  s.renewal = res.state;
  return null;
}

/** Vista del tavolo per la UI (il floor resta privato). */
export function renewalTableView(s: GameSession) {
  const st = s.renewal;
  if (!st) return null;
  const player = s.world.players.get(st.playerId);
  const c = player?.contractId ? s.world.contracts.get(player.contractId) : undefined;
  return {
    player: st.playerName,
    agent: st.agentName,
    stage: st.stage,
    mood: st.mood,
    ask: st.askWage,
    roundsLeft: Math.max(0, RENEWAL.MAX_ROUNDS - st.round),
    yearsWanted: st.yearsWanted,
    guaranteeNeeded: st.guaranteeNeeded,
    badges: [
      st.fan ? '❤ cuore di tifoso' : null,
      st.mercenary ? '💼 mercenario' : null,
      st.bigThinker
        ? st.projectOk
          ? '👑 pensa in grande'
          : '👑 pensa in grande — progetto in dubbio'
        : null,
      st.betrayed ? '🥀 tradito in passato' : null,
    ].filter((x): x is string => x !== null),
    currentWage: c?.wage ?? 0,
    currentEnd: c?.endYear ?? 0,
    log: st.log,
  };
}

/** Importi-base sensati per i chip bonus della UI, scalati sulla richiesta. */
export function suggestedBonuses(s: GameSession) {
  const ask = s.renewal?.askWage ?? 20_000;
  const r5 = (v: number) => Math.max(5_000, Math.round(v / 5_000) * 5_000);
  return {
    perGoal: r5(ask * 0.3),
    perAssist: r5(ask * 0.2),
    trophy: r5(ask * 20),
    topFinish: r5(ask * 13),
    survival: r5(ask * 8),
  };
}

/** Un'offerta al tavolo. L'esito vive nel log dello stato. */
export function renewalOffer(s: GameSession, terms: RenewalOfferTerms): void {
  const st = s.renewal;
  if (!st || st.stage !== 'terms') return;
  const player = s.world.players.get(st.playerId);
  if (!player) return;
  const round = s.runner.nextRound();
  const after = offerRenewalTerms(
    s.world,
    st,
    s.club,
    player,
    terms,
    s.year,
    round,
    seasonStandings(s.world, s.season),
    createRng((s.seed ^ hashStr(st.playerId as string)) + round * 31 + st.round * 977),
  );
  if (after.stage === 'done') {
    refreshTreasury(s); // il nuovo ingaggio muove sostenibilità e specchi
    const c = player.contractId ? s.world.contracts.get(player.contractId) : undefined;
    gazzetta(
      s,
      round,
      `RINNOVO: ${player.name} firma fino al ${c?.endYear} (${(((after.agreedWage ?? 0) * 52) / 1e6).toFixed(1)}M l'anno).`,
    );
    if (after.agreedPromise != null) addPromise(s, player, after.agreedPromise);
  }
}

/** Chiude il tavolo e archivia l'esito nel dossier del giocatore. */
export function closeRenewalTalk(s: GameSession): string {
  const st = s.renewal;
  if (!st) return '';
  s.renewal = null;
  if (!s.renewalNotes) s.renewalNotes = {};
  const notes = s.renewalNotes;
  const n = notes[st.playerId as string] ?? {};
  notes[st.playerId as string] = n;
  if (st.stage === 'done') return `Rinnovo firmato: ${st.playerName} resta.`;
  if (st.stage === 'stalled') {
    n.stallState = st;
    return `${st.playerName} si prende qualche settimana per pensarci.`;
  }
  if (st.stage === 'leaving') {
    n.leaving = true;
    gazzetta(
      s,
      s.runner.nextRound(),
      `CASO ${st.playerName.toUpperCase()}: niente rinnovo, a scadenza saluta.`,
    );
    return `${st.playerName} andrà via a scadenza.`;
  }
  if (st.stage === 'failed') {
    n.cooldownUntil = st.cooldownUntilRound ?? s.runner.nextRound() + 6;
    return 'Niente accordo, per ora.';
  }
  return 'Il tavolo si chiude.';
}

/** Le promesse aperte (per il pannello Contratti). */
export function openPromises(s: GameSession) {
  return (s.promises ?? []).filter((p) => p.status === 'aperta');
}

/** Borsino (MODULE_MARKET §9.3): gli ultimi movimenti, con la freccia sopra/sotto valutazione. */
export function borsinoRows(s: GameSession) {
  return [...(s.news ?? [])]
    .filter((n) => n.playerId !== undefined)
    .slice(-12)
    .reverse()
    .map((n) => {
      const p = s.world.players.get(n.playerId as PlayerId);
      const value = p
        ? baseMarketValue(
            playerOverall(p),
            p.age,
            p.potential,
            contractYearsLeft(s.world, p, s.year),
          )
        : 0;
      const trend =
        n.fee === 0
          ? ('caldo' as const)
          : value > 0 && n.fee > value * 1.15
            ? ('sopra' as const)
            : value > 0 && n.fee < value * 0.85
              ? ('sotto' as const)
              : ('pari' as const);
      return { round: n.round, player: n.player, fee: n.fee, trend };
    });
}

function deptAvgOverall(s: GameSession, position: Position): number {
  const dept = s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined && p.position === position);
  if (dept.length === 0) return 50;
  return dept.reduce((a, p) => a + playerOverall(p), 0) / dept.length;
}

function addPromise(s: GameSession, player: Player, position: Position): void {
  const total = s.runner.totalRounds();
  const round = s.runner.nextRound();
  const dl = promiseDeadline(round, total);
  s.promises = [
    ...(s.promises ?? []),
    {
      playerId: player.id as string,
      playerName: player.name,
      position,
      minOverall: Math.round(deptAvgOverall(s, position)),
      madeYear: s.year,
      deadlineYear: dl === null ? s.year + 1 : s.year,
      deadlineRound: dl ?? promiseDeadline(0, total) ?? 4,
      status: 'aperta',
    },
  ];
}

/** Un acquisto appena firmato può mantenere le promesse aperte. */
export function fulfilPromises(s: GameSession, signedPlayerId: string, round: number): void {
  const signed = s.world.players.get(signedPlayerId as PlayerId);
  if (!signed) return;
  const overall = playerOverall(signed);
  for (const p of s.promises ?? []) {
    if (p.status !== 'aperta') continue;
    if (p.position !== signed.position || overall < p.minOverall) continue;
    p.status = 'mantenuta';
    gazzetta(
      s,
      round,
      `PROMESSA MANTENUTA: ${signed.name} è il rinforzo garantito a ${p.playerName}.`,
    );
  }
}

/** A scadenza, le promesse non mantenute presentano il conto (morale + fiducia). */
export function checkPromises(s: GameSession, round: number): void {
  for (const p of s.promises ?? []) {
    if (p.status !== 'aperta') continue;
    const overdue =
      s.year > p.deadlineYear || (s.year === p.deadlineYear && round > p.deadlineRound);
    if (!overdue) continue;
    p.status = 'tradita';
    const player = s.world.players.get(p.playerId as PlayerId);
    if (player && s.club.playerIds.includes(player.id)) {
      moraleShock(player, -(0.1 + 0.1 * player.personality.ambition));
      if (!s.renewalNotes) s.renewalNotes = {};
      const note = s.renewalNotes[p.playerId] ?? {};
      note.betrayed = true;
      // Il tradito ambizioso chiede la cessione: entra nella hot-list (§9.4).
      if (player.personality.ambition >= 0.5) note.wantsOut = true;
      s.renewalNotes[p.playerId] = note;
      gazzetta(
        s,
        round,
        note.wantsOut
          ? `PROMESSA TRADITA: ${p.playerName} non ha visto il rinforzo garantito e CHIEDE LA CESSIONE.`
          : `PROMESSA TRADITA: il rinforzo garantito a ${p.playerName} non è mai arrivato. Lo spogliatoio mormora.`,
      );
    }
  }
}
