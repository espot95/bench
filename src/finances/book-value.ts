/**
 * Valore contabile del cartellino (MODULE_FINANCES §6, F2b): ammortamento LINEARE
 * sulla durata del contratto. Tutto DERIVATO (GAME_DESIGN §1.2) — l'unica memoria è
 * `Contract.transferFee`, scritto alla firma da executeTransfer e ri-spalmato al
 * rinnovo. Puro, deterministico, zero RNG.
 */

import type { Club, Contract, Player, World } from '../core/types.js';

/** Stagioni coperte dal contratto (endYear incluso). */
export function contractDuration(c: Contract): number {
  return Math.max(1, c.endYear - c.startYear + 1);
}

/** Stagioni ancora a bilancio: la stagione corrente conta come residua. */
export function seasonsLeft(c: Contract, year: number): number {
  return Math.min(contractDuration(c), Math.max(0, c.endYear - year + 1));
}

/** Quota di ammortamento annua del cartellino (0 per vivaio/parametri zero). */
export function annualAmortization(c: Contract): number {
  if (!c.transferFee) return 0;
  return Math.round(c.transferFee / contractDuration(c));
}

/** Valore contabile residuo: pieno alla firma, zero oltre la scadenza. */
export function bookValue(c: Contract, year: number): number {
  if (!c.transferFee) return 0;
  return Math.round((c.transferFee * seasonsLeft(c, year)) / contractDuration(c));
}

/** Valore contabile residuo del giocatore (0 se senza contratto o mai pagato). */
export function playerBookValue(world: World, player: Player, year: number): number {
  const c = player.contractId ? world.contracts.get(player.contractId) : undefined;
  return c ? bookValue(c, year) : 0;
}

/** Somma delle quote di ammortamento annue della rosa (i denti della sostenibilità). */
export function squadAmortization(world: World, club: Club): number {
  let total = 0;
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    const c = p?.contractId ? world.contracts.get(p.contractId) : undefined;
    if (c) total += annualAmortization(c);
  }
  return total;
}

/** Valore contabile totale della rosa (la card "Rosa a bilancio" in UI). */
export function squadBookValue(world: World, club: Club, year: number): number {
  let total = 0;
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    if (p) total += playerBookValue(world, p, year);
  }
  return total;
}
