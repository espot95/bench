/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import type { SponsorContract, SponsorSlot } from '../../../src/core/types';
import { signSponsor } from '../../../src/finances/sponsors';
import { gazzetta, refreshTreasury } from './shared';

import type { GameSession } from '../game';

export function describeSponsorClause(c: SponsorContract['clause']): string | null {
  if (!c) return null;
  if (c.kind === 'nazionalita')
    return `clausola merch: +${Math.round(c.bonusPct * 100)}% con un ${c.nation} in rosa`;
  if (c.kind === 'tour')
    return `clausola tour: +${Math.round(c.bonusPct * 100)}% se il tour estivo va in ${c.nation}`;
  if (c.kind === 'vetrina')
    return `premio vetrina: +${Math.round(c.bonusPct * 100)}% se top-${c.target}`;
  if (c.kind === 'scommesse') return 'scommesse: paga tanto, la piazza mugugna (−4% botteghino)';
  if (c.kind === 'benefico') return 'benefico: zero soldi, +reputazione e tifosi orgogliosi';
  return null;
}

export function sponsorsView(s: GameSession) {
  const slots = ['maglia', 'tecnico', 'stadio', 'allenamento'] as SponsorSlot[];
  const contracts = s.club.sponsors ?? [];
  return slots.map((slot) => {
    const c = contracts.find((x) => x.slot === slot);
    const offers = (s.sponsorOffers?.[slot] ?? []).map((o, index) => ({
      index,
      name: o.brandName,
      sector: o.sector,
      tier: o.tier,
      annual: o.annualValue,
      years: o.years,
      expectation: o.expectation,
      clause: describeSponsorClause(o.clause),
      rinnovo: o.rinnovo === true,
    }));
    return {
      slot,
      contract: c
        ? {
            name: c.brandName,
            annual: c.annualValue,
            endYear: c.endYear,
            expectation: c.expectation,
            satisfaction: c.satisfaction,
            clause: describeSponsorClause(c.clause),
          }
        : null,
      offers,
    };
  });
}

/** Firma un'offerta per lo slot; la gazzetta racconta. */
export function chooseSponsor(s: GameSession, slot: SponsorSlot, index: number): string {
  const offer = s.sponsorOffers?.[slot]?.[index];
  if (!offer) return 'Offerta non più valida.';
  signSponsor(s.world, s.club, offer, s.year);
  if (s.sponsorOffers) delete s.sponsorOffers[slot];
  refreshTreasury(s);
  const round = s.runner.isFinished() ? s.runner.totalRounds() : s.runner.nextRound();
  gazzetta(
    s,
    round,
    offer.annualValue > 0
      ? `NUOVO SPONSOR (${slot}): ${offer.brandName}, ${(offer.annualValue / 1e6).toFixed(1)}M l'anno per ${offer.years} anni${offer.rinnovo ? ' — rinnovo' : ''}.`
      : `IL CLUB SCEGLIE IL CUORE: ${offer.brandName} sulla ${slot}, a titolo gratuito.`,
  );
  return offer.annualValue > 0
    ? `Firmato: ${offer.brandName} (${slot}) — ${(offer.annualValue / 1e6).toFixed(1)}M/anno.`
    : `Firmato: ${offer.brandName} (${slot}) — la piazza applaude.`;
}
