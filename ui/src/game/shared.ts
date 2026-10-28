/**
 * SPEZZATURA (revisione): gli helper TRASVERSALI del guscio — usati da quasi
 * tutti i moduli di gioco. Qui vive solo ciò che non appartiene a un dominio:
 * gazzetta, tesoreria, orologio di stagione, tavoli, hash, etichette contabili.
 */

import { leagueOfClub } from '../../../src/core/types';
import type { Club, Player } from '../../../src/core/types';
import type { TeamPlan } from '../../../src/engine/plan';
import { syncUserBudgets } from '../../../src/finances/treasury';
import type { NegotiationState } from '../../../src/market/negotiation';
import { performanceFactor } from '../../../src/market/value';
import { roundDay } from '../calendar';
import { type GameSession, worldPlayerStats } from '../game';

/** Hash deterministico per decisioni di guscio (MAI draw del flusso di sim). */
export function hashStr(str: string): number {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Una riga in Gazzetta (il feed notizie del club, max 30). */
export const gazzetta = (s: GameSession, round: number, headline: string): void => {
  s.news = [
    ...(s.news ?? []),
    { round, buyer: s.club.name, seller: '', player: '', fee: 0, headline },
  ].slice(-30);
};

/** Riallinea i budget del presidente dopo ogni movimento di cassa. */
export function refreshTreasury(s: GameSession): void {
  syncUserBudgets(s.world, s.club, s.year);
}

/** Il giorno corrente della stagione (offset dal 10 agosto). */
export function currentDay(s: GameSession): number {
  if (s.day !== undefined) return s.day;
  const next = s.runner.nextRound();
  return next <= 1 ? 0 : roundDay(s.year, next - 1);
}

/** I tavoli di trattativa (migra il campo legacy `negotiation` al primo accesso). */
export function allTables(s: GameSession): NegotiationState[] {
  if (!s.negotiations) {
    s.negotiations = s.negotiation ? [s.negotiation] : [];
    s.negotiation = null;
  }
  return s.negotiations;
}

/** G3/G4: la forma del giocatore (media pagelle per TUTTI + ruolo, coeff. campionato)
 *  — su scala MONDO: anche chi gioca nelle altre divisioni ha una forma vera. */
export function formFor(s: GameSession, p: Player, owner?: Club): number {
  const club = owner ?? [...s.world.clubs.values()].find((c) => c.playerIds.includes(p.id));
  const tier = club ? leagueOfClub(s.world, club.id).tier : 1;
  return performanceFactor(worldPlayerStats(s).get(p.id), p.position, tier);
}

/** Consegna il piano partita al motore (piano "vuoto" = nessun piano). */
export function applyPlanToRunner(s: GameSession): void {
  const p = s.plan;
  const empty =
    !p ||
    (p.style === undefined &&
      (p.line === undefined || p.line === 'media') &&
      (p.marking === undefined || p.marking === 'zona') &&
      (p.aggression === undefined || p.aggression === 'normale') &&
      p.setPiece === undefined);
  s.runner.setPlan(s.club.id, empty ? null : (p as TeamPlan));
}

/** Etichette italiane delle voci di ledger (Sede e Finanze). */
export const LEDGER_LABELS: Record<string, string> = {
  gate: 'Biglietteria',
  sponsor: 'Sponsor',
  tv: 'Diritti TV',
  prize: 'Premi campionato',
  coppa: 'Coppe',
  transfer_out: 'Cessioni (recupero a bilancio)',
  plusvalenza: 'Plusvalenze',
  commerciale: 'Attività commerciali',
  eventi: 'Eventi (tour e concerti)',
  abbonamenti: 'Abbonamenti',
  pubblicita: 'Pubblicità (bordocampo e naming)',
  ritiro: 'Ritiro estivo',
  wages: 'Stipendi calciatori',
  facilities: 'Gestione impianti',
  matchday: 'Costi del matchday',
  interessi: 'Interessi sul fido',
  transfer_in: 'Cartellini',
  agency_fees: 'Commissioni agenti',
  stadio: 'Cantieri stadio',
  marketing: 'Campagne marketing',
  giovanile: 'Settore giovanile',
  other: 'Altro',
};

export function groupLedger(entries: { type: string; amount: number }[]) {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.type, (m.get(e.type) ?? 0) + e.amount);
  return [...m]
    .map(([type, amount]) => ({ label: LEDGER_LABELS[type] ?? type, amount }))
    .sort((a, b) => b.amount - a.amount);
}
