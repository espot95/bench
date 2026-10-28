/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { stadiumCapacity } from '../../../src/core/stadium';
import {
  RITIRO_SPOTS,
  SUMMER,
  TOUR_DESTINATIONS,
  concertLicensed,
  payRitiro,
  playTour,
  ritiroById,
  ritiroEffects,
  settleConcert,
  tourById,
  tourQuote,
} from '../../../src/engine/events';
import { overdraftLimit } from '../../../src/finances/treasury';
import { gazzetta, refreshTreasury } from './shared';

import type { GameSession } from '../game';

// ---------------------------------------------------------------------------
// Estate ed eventi (MODULE_EVENTS): ritiro, tour mondiale, concerti.
// ---------------------------------------------------------------------------

/** Le scelte estive si bloccano quando la stagione parte. */
export function summerLocked(s: GameSession): boolean {
  return s.runner.nextRound() > 1;
}

export function chooseRitiro(s: GameSession, id: string): string {
  if (summerLocked(s)) return 'La stagione è partita: il ritiro si sceglie in estate.';
  if (s.summer?.ritiroId) return 'Il ritiro è già stato fatto.';
  const spot = ritiroById(id);
  if (!spot) return 'Meta sconosciuta.';
  if (s.club.finances.cash + overdraftLimit(s.world, s.club, s.year) < spot.cost)
    return 'La banca non copre nemmeno il ritiro: scegli una meta più umile.';
  payRitiro(s.club, spot, s.year);
  const fx = ritiroEffects(spot);
  s.runner.applyPreparation(s.club.id, fx);
  s.summer = { ...(s.summer ?? { year: s.year }), ritiroId: id };
  refreshTreasury(s);
  gazzetta(
    s,
    0,
    `RITIRO A ${spot.name.toUpperCase()}: strutture ${spot.quality}/100. La preparazione coprirà le prime ${fx.rounds} giornate.`,
  );
  return `Ritiro fissato a ${spot.name} (${(spot.cost / 1e6).toFixed(1)}M).`;
}

export function chooseTour(s: GameSession, id: string): string {
  if (summerLocked(s)) return 'La stagione è partita: il tour si organizza in estate.';
  if (s.summer?.tourId) return 'Il tour è già stato fatto.';
  const dest = tourById(id);
  if (!dest) return 'Destinazione sconosciuta.';
  const out = playTour(s.world, s.club, dest, s.year);
  if (out.legs.rounds > 0) {
    s.runner.applyPreparation(s.club.id, {
      boost: out.legs.boost,
      injuryMult: 1,
      rounds: out.legs.rounds,
    });
  }
  s.summer = { ...(s.summer ?? { year: s.year }), tourId: id, tourNation: dest.nation };
  refreshTreasury(s);
  gazzetta(s, 0, out.headline.toUpperCase());
  return out.headline;
}

export function summerView(s: GameSession) {
  const locked = summerLocked(s);
  return {
    locked,
    ritiroId: s.summer?.ritiroId ?? null,
    tourId: s.summer?.tourId ?? null,
    ritiri: RITIRO_SPOTS.map((r) => ({
      id: r.id,
      name: r.name,
      country: r.country,
      quality: r.quality,
      cost: r.cost,
      blurb: r.blurb,
    })),
    tours: TOUR_DESTINATIONS.map((d) => {
      const q = tourQuote(s.world, s.club, d);
      return {
        id: d.id,
        name: d.name,
        nation: d.nation,
        distance: d.distance,
        estimate: q.net,
        affinity: q.affinity > 1,
      };
    }).sort((a, b) => b.estimate - a.estimate),
  };
}

export function concertView(s: GameSession) {
  const capacity = stadiumCapacity(s.club);
  return {
    licensed: concertLicensed(s.club),
    offers: (s.concertOffers ?? []).map((o) => ({
      id: o.id,
      artist: o.artist,
      tier: o.tierLabel,
      cachet: o.cachet,
      round: o.round,
      homeClash: o.homeClash,
      // Anteprima del netto per livello di pubblicità (MODULE_EVENTS §3).
      options: ([0, 1, 2] as const).map((lvl) => {
        const fill = Math.min(
          1,
          SUMMER.FILL_BASE +
            SUMMER.FILL_REP * (s.club.reputation / 100) +
            o.draw +
            SUMMER.AD_FILL[lvl]!,
        );
        return {
          level: lvl,
          fill,
          net: Math.round(
            o.cachet + capacity * fill * SUMMER.TICKET - capacity * SUMMER.AD_COST_PER_SEAT[lvl]!,
          ),
        };
      }),
    })),
  };
}

export function acceptConcert(s: GameSession, offerId: string, adLevel: 0 | 1 | 2): string {
  const offer = (s.concertOffers ?? []).find((o) => o.id === offerId);
  if (!offer) return 'La data è sfumata.';
  const out = settleConcert(s.club, offer, adLevel, s.year);
  if (out.wear) s.runner.applyPitchWear(s.club.id, offer.round);
  s.concertOffers = (s.concertOffers ?? []).filter((o) => o.id !== offerId);
  refreshTreasury(s);
  const round = s.runner.isFinished() ? s.runner.totalRounds() : s.runner.nextRound();
  gazzetta(s, round, out.headline.toUpperCase());
  return out.headline;
}

export function declineConcert(s: GameSession, offerId: string): string {
  s.concertOffers = (s.concertOffers ?? []).filter((o) => o.id !== offerId);
  return 'Il promoter porta il circo altrove.';
}
