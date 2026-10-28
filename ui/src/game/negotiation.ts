/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { playerOverall } from '../../../src/core/ratings';
import { bestAssignment } from '../../../src/engine/lineup';
import { isDeadlineDay, marketWindowOpen } from '../../../src/market/ai';
import {
  NEGOTIATION,
  type NegotiationState,
  bookTrip,
  dealFromState,
  executeDeal,
  loseToRival,
  offerBuyback,
  offerFee,
  offerLoanBack,
  offerWage,
  openNegotiation,
  proposeSwap,
  resolveThink,
  setInstallments,
} from '../../../src/market/negotiation';
import { contractYearsLeft } from '../../../src/market/transfers';
import { baseMarketValue } from '../../../src/market/value';
import { createRng } from '../../../src/rng/rng';
import { starString } from '../band';
import { fmtDay } from '../calendar';
import { allTables, currentDay, formFor, gazzetta, hashStr, refreshTreasury } from './shared';

import type { PlayerId } from '../../../src/core/ids';
import type { Player } from '../../../src/core/types';
import type { GameSession } from '../game';
import { requestCall } from './agenda';
import { fulfilPromises } from './renewals';

const MAX_TABLES = 3;

/** Apre il tavolo (§8.3). In persona = trasferta: costo vero, max 1 per giornata. */
export function startNegotiation(
  s: GameSession,
  playerId: string,
  inPerson: boolean,
): string | null {
  const tables = allTables(s);
  const existing = tables.find((t) => (t.playerId as string) === playerId);
  const alive = (st: NegotiationState) =>
    st.stage === 'fee' || st.stage === 'wage' || st.stage === 'pending';
  if (existing && alive(existing)) return null; // riapri
  if (existing) s.negotiations = tables.filter((t) => t !== existing); // archivia l'esito vecchio
  const openCount = allTables(s).filter(alive).length;
  if (openCount >= MAX_TABLES)
    return `Hai già ${MAX_TABLES} tavoli vivi: chiudine uno prima (hub Tavoli).`;
  const player = s.world.players.get(playerId as PlayerId);
  const seller = player
    ? [...s.world.clubs.values()].find((c) => c.playerIds.includes(player.id))
    : undefined;
  if (!player || !seller) return 'Giocatore introvabile.';
  if (seller.id === s.club.id) return 'È già un tuo giocatore.';
  // Calendario: il tavolo si apre SOLO all'appuntamento. Primo click = si fissa la call.
  const call = (s.calls ?? []).find((c) => c.playerId === playerId && c.kind === 'presidente');
  if (!call) return requestCall(s, playerId);
  if (call.day > currentDay(s))
    return `L'appuntamento col presidente è ${fmtDay(s.year, call.day)}: salta lì dal calendario (📅).`;
  if (call.inPerson && !inPerson)
    return 'Questo presidente è vecchio stampo: ti aspetta in sede. Si va col jet (✈ Vola).';
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  if (inPerson) {
    if (s.lastTripRound === round) return 'Hai già viaggiato questa giornata: il jet è a terra.';
    const trip = bookTrip(s.club, seller.name, s.year, s.world);
    if (!trip.ok) return `Trasferta impossibile: ${trip.reason}.`;
    s.lastTripRound = round;
  }
  const window = s.runner.isFinished() ? null : marketWindowOpen(round, total);
  const res = openNegotiation(
    s.world,
    s.club,
    seller,
    player,
    s.year,
    {
      inPerson,
      deadline: window ? isDeadlineDay(round, total) : false,
      formFactor: formFor(s, player, seller),
    },
    createRng((s.seed ^ hashStr(playerId)) + round * 7919),
  );
  if (!res.ok) {
    // Il tavolo non s'è aperto: il viaggio si RIMBORSA (prima pagavi il jet a vuoto).
    if (inPerson) {
      s.club.finances.cash += NEGOTIATION.TRIP_COST;
      const i = s.club.finances.expenses.findIndex(
        (e) =>
          e.amount === NEGOTIATION.TRIP_COST && e.note === `Trasferta di mercato a ${seller.name}`,
      );
      if (i >= 0) s.club.finances.expenses.splice(i, 1);
      s.lastTripRound = undefined;
    }
    return res.reason;
  }
  allTables(s).push(res.state);
  // L'appuntamento è stato onorato: via dall'agenda.
  s.calls = (s.calls ?? []).filter((c) => c !== call);
  // Sederti al tavolo per lui = studiarlo (MODULE_SCOUTING §7).
  if (!s.observations) s.observations = {};
  s.observations[playerId] = (s.observations[playerId] ?? 0) + 1;
  return null;
}

/** Vista della trattativa per la UI (il floor del venditore resta segreto). */
export function negotiationView(s: GameSession, playerId?: string) {
  const tables = allTables(s);
  const st = playerId
    ? tables.find((t) => (t.playerId as string) === playerId)
    : tables[tables.length - 1];
  if (!st) return null;
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  return {
    playerId: st.playerId as string,
    /** Indice del primo messaggio del procuratore: da lì parte la SECONDA chat. */
    agentFrom: st.log.findIndex((e) => e.who === 'agente'),
    player: st.playerName,
    seller: st.sellerName,
    stage: st.stage,
    status: st.status,
    mood: st.mood,
    inPerson: st.inPerson,
    ask: st.ask,
    round: st.round,
    roundsLeft: Math.max(0, (st.patience ?? NEGOTIATION.MAX_ROUNDS) - st.round),
    /** v2: la stima del TUO DS della zona d'accordo. */
    dsLo: st.dsLo ?? null,
    dsHi: st.dsHi ?? null,
    /** v2: il presidente sta riflettendo (risposta al giorno fissato). */
    pending:
      st.stage === 'pending'
        ? {
            day: st.resumeDay ?? 0,
            date: fmtDay(s.year, st.resumeDay ?? 0),
            due: currentDay(s) >= (st.resumeDay ?? 0),
          }
        : null,
    /** v2: il concorrente sul giocatore (batti il bid o lo perdi davvero). */
    rival: st.rivalBid !== undefined ? { name: st.rivalName ?? '—', bid: st.rivalBid } : null,
    /** v3: la struttura dell'affare sul tavolo. */
    structure: {
      swap:
        st.swapPlayerId !== undefined
          ? {
              id: st.swapPlayerId as string,
              name: st.swapPlayerName ?? '',
              value: st.swapValue ?? 0,
            }
          : null,
      buyback:
        st.buybackFee !== undefined
          ? { fee: st.buybackFee, asked: st.buybackAskedBySeller === true }
          : null,
      loanBack: st.loanBack === true,
      installments: st.installments ?? 1,
      /** Contanti da mettere sul tavolo per pareggiare (ask − contropartita). */
      cashAsk: Math.max(0, st.ask - (st.swapValue ?? 0)),
    },
    wageAsk: st.wageAsk ?? null,
    wageRoundsLeft: Math.max(0, NEGOTIATION.WAGE_ROUNDS - st.wageRound),
    agreedFee: st.agreedFee ?? null,
    agreedWage: st.agreedWage ?? null,
    commission: st.commission ?? 0,
    windowOpen: !s.runner.isFinished() && marketWindowOpen(round, total) !== null,
    log: st.log.map((e) => ({ ...e })),
  };
}

/** Un'offerta sul cartellino. */
export function negotiationFee(s: GameSession, playerId: string, amount: number): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st) return;
  offerFee(
    s.world,
    st,
    s.club,
    Math.max(0, Math.round(amount)),
    s.year,
    createRng((s.seed ^ hashStr(st.playerId as string)) + st.round * 131 + 7),
  );
  // "Ci penso" (v2): il guscio fissa il giorno della risposta in agenda.
  if (st.stage === 'pending' && st.resumeDay === undefined)
    st.resumeDay = currentDay(s) + (st.thinkDays ?? 2);
}

// ---- v3: la STRUTTURA dell'affare al tavolo (scambi, recompra, prestito, rate) ----

/** I tuoi giocatori proponibili come contropartita (col valore che il tavolo riconosce). */
export function swapCandidates(s: GameSession) {
  return s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => ({
      id: p.id as string,
      name: p.name,
      pos: p.position,
      overall: Math.round(playerOverall(p)),
      stars: starString(playerOverall(p)),
      value:
        Math.round(
          (baseMarketValue(
            playerOverall(p),
            p.age,
            p.potential,
            contractYearsLeft(s.world, p, s.year),
          ) *
            NEGOTIATION.SWAP_VALUE *
            formFor(s, p, s.club)) /
            100_000,
        ) * 100_000,
    }))
    .sort((a, b) => b.overall - a.overall);
}

export function tableSwap(s: GameSession, playerId: string, myPlayerId: string | null): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st) return;
  const mine = myPlayerId ? s.world.players.get(myPlayerId as PlayerId) : undefined;
  proposeSwap(
    s.world,
    st,
    s.club,
    myPlayerId as PlayerId | null,
    s.year,
    mine ? formFor(s, mine, s.club) : 1,
  );
}

export function tableBuyback(s: GameSession, playerId: string): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (st) offerBuyback(st);
}

export function tableLoanBack(s: GameSession, playerId: string): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (st) offerLoanBack(st);
}

export function tableInstallments(s: GameSession, playerId: string, n: number): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (st) setInstallments(s.world, st, n);
}

/** La risposta del presidente dopo la riflessione (v2): matura al giorno fissato. */
export function hearAnswer(s: GameSession, playerId: string): string {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st || st.stage !== 'pending') return '';
  if (currentDay(s) < (st.resumeDay ?? 0))
    return `Il presidente risponde ${fmtDay(s.year, st.resumeDay ?? 0)}: salta lì dal calendario (📅).`;
  resolveThink(
    s.world,
    st,
    s.club,
    s.year,
    createRng((s.seed ^ hashStr(playerId)) + st.round * 977 + 13),
  );
  return 'Il presidente è tornato al tavolo: leggi la sua risposta.';
}

/** Un'offerta d'ingaggio settimanale. */
export function negotiationWage(s: GameSession, playerId: string, weekly: number): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st) return;
  offerWage(
    s.world,
    st,
    Math.max(0, Math.round(weekly)),
    createRng((s.seed ^ hashStr(st.playerId as string)) + st.wageRound * 271 + 13),
  );
}

/** Chiude il tavolo: firma (finestra aperta), pre-accordo (chiusa) o archivia il fallito. */
export function closeNegotiation(s: GameSession, playerId: string): string {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st) return '';
  s.negotiations = allTables(s).filter((t) => t !== st);
  if (st.stage !== 'done') return 'Il tavolo si chiude senza accordo.';
  const deal = dealFromState(st);
  if (!deal) return 'Il tavolo si chiude senza accordo.';
  // v3: prestito-ritorno — l'affare è chiuso ma il ragazzo resta lì un anno.
  if (deal.loanBack) {
    deal.arrivalYear = s.year + 1;
    s.preDeals = [...(s.preDeals ?? []), deal];
    gazzetta(
      s,
      s.runner.isFinished() ? 0 : s.runner.nextRound(),
      `COLPO IN PROSPETTIVA: ${deal.playerName} è del ${s.club.name} (${(deal.fee / 1e6).toFixed(1)}M) ma resterà in prestito al ${deal.sellerName} per la stagione.`,
    );
    return `${deal.playerName} è tuo, ma resta in prestito al ${deal.sellerName}: arriverà la prossima estate (pagherai alla consegna).`;
  }
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const window = !s.runner.isFinished() && marketWindowOpen(round, total) !== null;
  if (!window) {
    s.preDeals = [...(s.preDeals ?? []), deal];
    return `Pre-accordo depositato: ${deal.playerName} arriverà all'apertura della finestra (${(deal.fee / 1e6).toFixed(1)}M + ingaggio ${((deal.wage * 52) / 1e6).toFixed(1)}M l'anno).`;
  }
  const out = executeDeal(s.world, s.club, deal, s.year);
  if (!out.ok) return `L'affare sfuma alla firma: ${out.reason}.`;
  // v3: le rate rimanenti finiscono a scadenzario (addebito a ogni chiusura di stagione).
  if (out.schedule) {
    s.installmentsDue = [
      ...(s.installmentsDue ?? []),
      ...out.schedule.map((x) => ({
        ...x,
        playerName: deal.playerName,
        sellerName: deal.sellerName,
      })),
    ];
  }
  s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
  refreshTreasury(s);
  fulfilPromises(s, deal.playerId as string, round);
  s.shortlist = (s.shortlist ?? []).filter((id) => id !== (deal.playerId as string));
  s.news = [
    ...(s.news ?? []),
    {
      round,
      buyer: s.club.name,
      seller: deal.sellerName,
      player: deal.playerName,
      fee: deal.fee,
      headline: `UFFICIALE: ${deal.playerName} è un nuovo giocatore del ${s.club.name} — ${(deal.fee / 1e6).toFixed(1)}M al ${deal.sellerName}.`,
    },
  ].slice(-30);
  return `UFFICIALE: ${deal.playerName} è tuo per ${(deal.fee / 1e6).toFixed(1)}M.`;
}

/** Ci si alza dal tavolo senza firmare (il tavolo sparisce dall'hub). */
export function abandonNegotiation(s: GameSession, playerId: string): string {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  s.negotiations = allTables(s).filter((t) => (t.playerId as string) !== playerId);
  // v2: se c'era un concorrente sul giocatore, abbandonare = perderlo DAVVERO.
  if (st && st.rivalBid !== undefined && (st.stage === 'fee' || st.stage === 'pending')) {
    const headline = loseToRival(s.world, st, s.year);
    if (headline) {
      gazzetta(s, s.runner.isFinished() ? 0 : s.runner.nextRound(), headline);
      return headline;
    }
  }
  return '';
}

/** L'HUB delle trattative (richiesta utente): tutti i tavoli, il rinnovo, gli accordi. */
export function negotiationHub(s: GameSession) {
  const tables = allTables(s).map((t) => ({
    playerId: t.playerId as string,
    player: t.playerName,
    seller: t.sellerName,
    stage: t.stage,
    mood: t.mood,
    inPerson: t.inPerson,
    agreedFee: t.agreedFee ?? null,
  }));
  return {
    tables,
    open: tables.filter((t) => t.stage === 'fee' || t.stage === 'wage' || t.stage === 'pending')
      .length,
    renewal: s.renewal
      ? { player: s.renewal.playerName, agent: s.renewal.agentName, stage: s.renewal.stage }
      : null,
    preDeals: (s.preDeals ?? []).map((d) => ({
      player: d.playerName,
      from: d.sellerName,
      fee: d.fee,
    })),
    offers: (s.offers ?? []).length,
  };
}
