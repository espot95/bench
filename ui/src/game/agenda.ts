/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { isDeadlineDay, marketWindowOpen } from '../../../src/market/ai';
import { fmtDay, fmtDayLong, midweekDay, roundDay } from '../calendar';
import { currentDay, hashStr } from './shared';

import type { PlayerId } from '../../../src/core/ids';
import type { GameSession } from '../game';

// ---- Calendario & agenda (richiesta utente): il tempo si vede e si salta ----

/** Giorno corrente della stagione (offset dal 10 agosto). Derivato per i save vecchi. */
/** Fin dove ci si può teletrasportare: mai oltre la prossima partita o una call fissata. */
function jumpLimit(s: GameSession): number {
  const today = currentDay(s);
  const limits: number[] = [];
  if (!s.runner.isFinished()) limits.push(roundDay(s.year, s.runner.nextRound()));
  for (const c of s.calls ?? []) if (c.day > today) limits.push(c.day);
  return limits.length > 0 ? Math.min(...limits) : roundDay(s.year, s.runner.totalRounds()) + 7;
}

/** Teletrasporto a un giorno futuro: si ferma agli impegni obbligatori. */
export function goToDay(s: GameSession, target: number): string {
  const today = currentDay(s);
  if (target <= today) return 'Il tempo scorre solo in avanti.';
  const limit = jumpLimit(s);
  const landed = Math.min(target, limit);
  s.day = landed;
  if (landed < target) {
    const isMatch = !s.runner.isFinished() && landed === roundDay(s.year, s.runner.nextRound());
    return `Sei arrivato a ${fmtDayLong(s.year, landed)}: ${isMatch ? "c'è la partita, prima si gioca" : 'hai un appuntamento in agenda'}.`;
  }
  return `Eccoti a ${fmtDayLong(s.year, landed)}.`;
}

export interface AgendaItem {
  day: number;
  date: string;
  icon: string;
  text: string;
  kind: string;
  /** Solo per gli appuntamenti: consente l'annullamento dall'agenda. */
  callId?: string;
}

/** L'agenda di lavoro: TUTTI gli impegni e le scadenze, ordinati per giorno. */
export function agendaView(s: GameSession) {
  const today = currentDay(s);
  const total = s.runner.totalRounds();
  const items: AgendaItem[] = [];
  const push = (day: number, icon: string, text: string, kind = 'info') => {
    if (day >= today) items.push({ day, date: fmtDay(s.year, day), icon, text, kind });
  };
  // Partite di campionato (avversario e casa/trasferta).
  if (!s.runner.isFinished()) {
    for (let r = s.runner.nextRound(); r <= total; r++) {
      const m = s.season.fixtures.find(
        (x) => x.round === r && (x.homeClubId === s.club.id || x.awayClubId === s.club.id),
      );
      const home = m?.homeClubId === s.club.id;
      const opp = m
        ? s.world.clubs.get(m.homeClubId === s.club.id ? m.awayClubId : m.homeClubId)
        : undefined;
      push(
        roundDay(s.year, r),
        'sports_soccer',
        `Giornata ${r}${opp ? ` — ${home ? 'in casa vs' : 'in trasferta a'} ${opp.name}` : ''}`,
        r === s.runner.nextRound() ? 'match-next' : 'match',
      );
    }
  }
  // Coppe: il prossimo turno di ogni coppa in cui il club è ancora in corsa.
  for (const cup of s.cups ?? []) {
    const stage = cup.stages[cup.next];
    if (!stage || stage.played || !cup.alive.includes(s.club.id)) continue;
    push(
      midweekDay(s.year, stage.afterRound),
      'trophy',
      `${cup.name} — ${stage.name} (infrasettimanale)`,
      'cup',
    );
  }
  // Finestre di mercato: apertura e deadline day.
  let prev: ReturnType<typeof marketWindowOpen> = null;
  for (let r = 1; r <= total; r++) {
    const w = marketWindowOpen(r, total);
    if (w && w !== prev) push(roundDay(s.year, r), 'swap_horiz', `Apre il mercato ${w}`, 'market');
    if (w && marketWindowOpen(r + 1, total) !== w)
      push(roundDay(s.year, r), 'alarm', `DEADLINE DAY del mercato ${w}`, 'deadline');
    prev = w;
  }
  // Offerte AI e proposte concerti in scadenza.
  for (const o of s.offers ?? [])
    push(
      roundDay(s.year, Math.min(o.expiresRound, total)),
      'payments',
      `Scade l'offerta del ${o.fromClubName} per ${o.playerName}`,
      'offer',
    );
  for (const c of s.concertOffers ?? [])
    push(
      roundDay(s.year, Math.min(c.expiresRound, total)),
      'mic',
      `Ultimo giorno per rispondere al promoter (${c.artist})`,
      'concert',
    );
  // Call fissate (presidenti e procuratori); quelle arretrate si mostrano OGGI.
  for (const c of s.calls ?? []) {
    const day = Math.max(c.day, today);
    items.push({
      day,
      date: fmtDay(s.year, day),
      icon: c.inPerson ? 'flight' : 'call',
      text:
        c.kind === 'presidente'
          ? c.inPerson
            ? `In sede dal presidente del ${c.withName} per ${c.playerName} (si vola)`
            : `Call col presidente del ${c.withName} per ${c.playerName}`
          : `Call con l'entourage di ${c.playerName} (rinnovo)`,
      kind: 'call',
      callId: c.id,
    });
  }
  // Trattative in riflessione: la risposta del presidente è un impegno d'agenda.
  for (const t of s.negotiations ?? []) {
    if (t.stage !== 'pending') continue;
    const day = Math.max(t.resumeDay ?? today, today);
    items.push({
      day,
      date: fmtDay(s.year, day),
      icon: 'hourglass_top',
      text: `Risposta del presidente del ${t.sellerName} su ${t.playerName}`,
      kind: 'call',
    });
  }
  // Rapporti del DS in arrivo.
  for (const r of s.dsReminders ?? [])
    push(
      roundDay(s.year, Math.min(r.dueRound, total)),
      'description',
      `Rapporto del DS su ${r.nation}`,
      'ds',
    );
  // Estate e fine stagione.
  if (s.runner.nextRound() <= 1)
    push(
      today,
      'beach_access',
      'Estate: ritiro, tour e manto erboso si bloccano alla 1ª giornata',
      'summer',
    );
  push(
    roundDay(s.year, total),
    'sports_score',
    'Ultima giornata: poi si chiude la stagione',
    'end',
  );
  items.sort((a, b) => a.day - b.day || a.text.localeCompare(b.text));
  return {
    today,
    todayLabel: fmtDayLong(s.year, today),
    todayShort: fmtDay(s.year, today),
    jumpLimit: jumpLimit(s),
    items,
  };
}

/** Stato-call per un giocatore del mercato (per i bottoni della riga). */
export function callInfo(s: GameSession, playerId: string) {
  const c = (s.calls ?? []).find((x) => x.playerId === playerId && x.kind === 'presidente');
  if (!c) return null;
  const today = currentDay(s);
  return {
    day: c.day,
    date: fmtDay(s.year, c.day),
    due: c.day <= today,
    inPerson: c.inPerson === true,
    withName: c.withName,
  };
}

/** Fissa la call col presidente del club del giocatore (disponibilità NON immediata). */
export function requestCall(s: GameSession, playerId: string): string {
  const today = currentDay(s);
  const existing = (s.calls ?? []).find((c) => c.playerId === playerId && c.kind === 'presidente');
  if (existing) {
    return existing.day <= today
      ? existing.inPerson
        ? `Il presidente del ${existing.withName} ti aspetta in sede OGGI: si vola (✈).`
        : `La call col ${existing.withName} è per oggi: apri il tavolo.`
      : `Appuntamento già fissato: ${fmtDay(s.year, existing.day)} (📅 in agenda).`;
  }
  const player = s.world.players.get(playerId as PlayerId);
  const seller = player
    ? [...s.world.clubs.values()].find((c) => c.playerIds.includes(player.id))
    : undefined;
  if (!player || !seller) return 'Giocatore introvabile.';
  if (seller.id === s.club.id) return 'È un tuo giocatore: per il rinnovo si passa dalla Sede.';
  const pres = [...(s.world.presidents?.values() ?? [])].find((p) => p.clubId === seller.id);
  // Agenda del presidente: 1-5 giorni (hash deterministico), +2 se è un club blasonato;
  // al deadline day tutti trovano un buco domani.
  let wait = 1 + (hashStr(`${playerId}|call|${s.year}|${today}`) % 5);
  if (seller.reputation >= 75) wait += 2;
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  if (!s.runner.isFinished() && marketWindowOpen(round, total) && isDeadlineDay(round, total))
    wait = 1;
  // Il vecchio stampo (fumantino o conservatore) non fa call: "vieni tu da me".
  const inPerson =
    pres !== undefined &&
    (pres.personality.temperament >= 0.6 || pres.personality.ambition <= 0.35);
  const day = today + wait;
  s.calls = [
    ...(s.calls ?? []),
    {
      id: `call-${playerId}-${s.year}-${day}`,
      kind: 'presidente',
      playerId,
      playerName: player.name,
      withName: seller.name,
      day,
      inPerson,
    },
  ];
  return inPerson
    ? `Il presidente del ${seller.name} è vecchio stampo: "gli affari si fanno guardandosi negli occhi". Ti aspetta in sede ${fmtDay(s.year, day)} — prepara il jet (✈).`
    : `Call fissata col presidente del ${seller.name}: ${fmtDay(s.year, day)}. La trovi in agenda (📅).`;
}

/** Annulla un appuntamento dall'agenda. */
export function cancelCall(s: GameSession, id: string): string {
  const c = (s.calls ?? []).find((x) => x.id === id);
  if (!c) return 'Appuntamento non trovato.';
  s.calls = (s.calls ?? []).filter((x) => x.id !== id);
  return `Appuntamento con ${c.withName} annullato.`;
}
