/**
 * Rapporti storici tra club (MODULE_MARKET §9.1): ogni affare concluso costruisce
 * fiducia tra le due dirigenze, e la fiducia rende le trattative successive più facili.
 * Store SPARSO su `World.clubRelations` (coppia assente = neutra); questo modulo è
 * l'unico owner di bump e decay. Puro, niente RNG.
 */

import type { ClubId } from '../core/ids.js';
import type { World } from '../core/types.js';

export const RELATIONS = {
  /** Fiducia guadagnata per affare concluso. */
  BUMP: 1,
  /** Decadimento a ogni offseason (i rapporti si raffreddano). */
  DECAY: 0.75,
  /** Sotto questa soglia la coppia torna neutra (sparse by default). */
  PRUNE: 0.1,
  /** Le letture sono clampate qui: oltre non si accumula vantaggio. */
  CAP: 3,
  /** Trattativa utente (MODULE_MARKET §8): floor del venditore ×(1 − FLOOR_EASE·rel). */
  FLOOR_EASE: 0.03,
  /** Mood iniziale del tavolo: +MOOD_BOOST·rel. */
  MOOD_BOOST: 0.05,
  /** collectOffers: i club amici offrono un filo di più (fee ×(1 + OFFER_WARMTH·rel)). */
  OFFER_WARMTH: 0.02,
} as const;

/** Chiave ordine-indipendente della coppia (stesso pattern di `relationKey` del core). */
export function clubRelationKey(a: ClubId, b: ClubId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Rapporto corrente [0, CAP]; 0 = mai fatto affari (o raffreddati). */
export function relationBetween(world: World, a: ClubId, b: ClubId): number {
  const raw = world.clubRelations?.get(clubRelationKey(a, b)) ?? 0;
  return Math.min(RELATIONS.CAP, raw);
}

/** Un affare è andato in porto: le dirigenze si conoscono meglio. */
export function bumpRelation(world: World, a: ClubId, b: ClubId): void {
  if (!world.clubRelations) world.clubRelations = new Map();
  const key = clubRelationKey(a, b);
  world.clubRelations.set(key, (world.clubRelations.get(key) ?? 0) + RELATIONS.BUMP);
}

/** Offseason: i rapporti si raffreddano; le coppie fredde spariscono (sparse). */
export function decayRelations(world: World): void {
  if (!world.clubRelations) return;
  for (const [key, value] of world.clubRelations) {
    const next = value * RELATIONS.DECAY;
    if (next < RELATIONS.PRUNE) world.clubRelations.delete(key);
    else world.clubRelations.set(key, next);
  }
}
