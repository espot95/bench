/**
 * Liquidazione dei bonus contrattuali a fine stagione (MODULE_CONTRACTS §5). Puro.
 * Le statistiche arrivano come mappa piatta dall'engine (finances resta core-only).
 * Oggi solo i contratti negoziati dall'utente hanno bonus: l'economia AI non cambia.
 */

import type { ClubId, LeagueId, PlayerId } from '../core/ids.js';
import type { StandingRow, World } from '../core/types.js';

export interface PlayerSeasonLine {
  goals: number;
  assists: number;
}

export interface BonusPayout {
  clubId: ClubId;
  amount: number;
}

/** Top-N della classifica che vale il bonus `topFinish`. */
export const TOP_FINISH_POSITIONS = 4;
/** Zona retrocessione (ultime N) per il bonus `survival`. */
export const RELEGATION_SPOTS = 3;

/**
 * Paga i bonus dei contratti della lega `leagueId` sulla stagione appena chiusa.
 * `hasRelegation` = la lega ha una divisione sotto (la salvezza esiste solo lì).
 * Cassa −= totale, voce ledger `other` "bonus contrattuali". `perAppearance` non si
 * liquida in v1 (presenze non tracciate — MODULE_CONTRACTS §5).
 */
export function settleContractBonuses(
  world: World,
  leagueId: LeagueId,
  stats: ReadonlyMap<PlayerId, PlayerSeasonLine>,
  standings: readonly StandingRow[],
  year: number,
  hasRelegation: boolean,
): BonusPayout[] {
  const league = world.leagues.find((l) => l.id === leagueId);
  if (!league) return [];
  const position = new Map(standings.map((r, i) => [r.clubId, i + 1]));
  const out: BonusPayout[] = [];

  for (const clubId of league.clubIds) {
    const club = world.clubs.get(clubId);
    if (!club) continue;
    const pos = position.get(clubId);
    let total = 0;

    for (const pid of club.playerIds) {
      const player = world.players.get(pid);
      const contract = player?.contractId ? world.contracts.get(player.contractId) : undefined;
      const b = contract?.bonuses;
      if (!b) continue;
      const line = stats.get(pid);
      total += (b.perGoal ?? 0) * (line?.goals ?? 0);
      total += (b.perAssist ?? 0) * (line?.assists ?? 0);
      if (pos === 1) total += b.trophy ?? 0;
      if (pos !== undefined && pos <= TOP_FINISH_POSITIONS) total += b.topFinish ?? 0;
      if (hasRelegation && pos !== undefined && pos <= standings.length - RELEGATION_SPOTS) {
        total += b.survival ?? 0;
      }
    }

    if (total > 0) {
      total = Math.round(total);
      club.finances.cash -= total;
      club.finances.expenses.push({
        type: 'other',
        amount: total,
        year,
        note: 'bonus contrattuali',
      });
      out.push({ clubId, amount: total });
    }
  }
  return out;
}
