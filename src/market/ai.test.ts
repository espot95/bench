import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import { createRunner, createSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  aiMarketRound,
  aiOffersForUser,
  isDeadlineDay,
  marketWindowOpen,
  refusalMoraleHit,
  resolveCounter,
  sellToAI,
  squadNeeds,
} from './ai.js';

describe('mercato AI attivo (MODULE_MARKET §7)', () => {
  it("le finestre: estiva 1-4, invernale 18-22, chiuso altrove; deadline sull'ultima", () => {
    expect(marketWindowOpen(1, 38)).toBe('estivo');
    expect(marketWindowOpen(4, 38)).toBe('estivo');
    expect(marketWindowOpen(10, 38)).toBeNull();
    expect(marketWindowOpen(20, 38)).toBe('invernale');
    expect(marketWindowOpen(30, 38)).toBeNull();
    expect(isDeadlineDay(4, 38)).toBe(true);
    expect(isDeadlineDay(22, 38)).toBe(true);
    expect(isDeadlineDay(3, 38)).toBe(false);
  });

  it('una stagione di finestre muove il mercato: affari veri, soldi veri, utente intoccato', () => {
    const world = generateWorld(createRng(21));
    const league = world.leagues[0]!;
    const userClubId = league.clubIds[0]!;
    const userSquadBefore = [...world.clubs.get(userClubId)!.playerIds];
    const cashBefore = new Map(
      [...world.clubs.values()].map((c) => [c.id, c.finances.cash] as const),
    );

    const rng = createRng(99);
    const deals = [];
    for (let round = 1; round <= 38; round++) {
      deals.push(...aiMarketRound(world, league, round, 38, rng, userClubId));
    }
    // Il mondo si muove (statisticamente: ~9 finestre-giornate × 19 club × 10%).
    expect(deals.length).toBeGreaterThan(3);
    for (const d of deals) {
      expect(d.fee).toBeGreaterThan(0);
      expect(d.headline.length).toBeGreaterThan(10);
    }
    // La rosa dell'utente non è stata toccata dagli affari AI-AI.
    expect(world.clubs.get(userClubId)!.playerIds).toEqual(userSquadBefore);
    // I soldi sono girati davvero e nessun compratore è finito sotto zero di budget.
    let moved = 0;
    for (const c of world.clubs.values()) {
      if (c.finances.cash !== cashBefore.get(c.id)) moved++;
      expect(c.finances.transferBudget).toBeGreaterThanOrEqual(0);
    }
    expect(moved).toBeGreaterThan(3);
  });

  it('i bisogni di rosa emergono se un reparto è corto', () => {
    const world = generateWorld(createRng(21));
    const club = [...world.clubs.values()][0]!;
    // Svuota quasi tutto l'attacco: il bisogno FW deve schizzare in cima.
    const fws = club.playerIds.filter((id) => world.players.get(id)?.position === 'FW');
    club.playerIds = club.playerIds.filter((id) => !fws.slice(0, 4).includes(id));
    const needs = squadNeeds(world, club);
    expect(needs[0]?.position).toBe('FW');
  });

  it("offerte per l'utente: arrivano in finestra, si vende o si rifiuta col morale in gioco", () => {
    const world = generateWorld(createRng(21));
    const league = world.leagues[0]!;
    const userClub = world.clubs.get(league.clubIds[10]!)!; // club di metà classifica: gola ai grandi
    // Cerca un'offerta su più giornate/rng (evento probabilistico).
    let offer = null;
    for (let seed = 1; seed < 40 && !offer; seed++) {
      const got = aiOffersForUser(world, league, userClub, 2, 38, createRng(seed));
      if (got.length > 0) offer = got[0]!;
    }
    expect(offer).not.toBeNull();
    const o = offer!;
    expect(userClub.playerIds).toContain(o.playerId);
    expect(o.bid).toBeGreaterThan(0);

    // Rifiuto del Grande Salto: morale giù per l'ambizioso.
    const player = world.players.get(o.playerId)!;
    player.personality.ambition = 0.9;
    player.personality.professionalism = 0.2;
    const before = player.morale;
    const bigStep = { ...o, fromReputation: userClub.reputation + 15 };
    expect(refusalMoraleHit(world, userClub, bigStep)).toBeGreaterThan(0);
    expect(player.morale).toBeLessThan(before);

    // Vendita: il giocatore cambia maglia e la cassa incassa.
    const cashBefore = userClub.finances.cash;
    expect(sellToAI(world, userClub, o, o.bid)).toBe(true);
    expect(userClub.playerIds).not.toContain(o.playerId);
    expect(userClub.finances.cash).toBe(cashBefore + o.bid);

    // La controproposta su un'offerta morta fallisce con garbo.
    const res = resolveCounter(world, { ...o, fromClubId: o.fromClubId }, o.ask, createRng(3));
    expect(typeof res.accepted).toBe('boolean');
  });

  it('il runner porta il mercato in RoundResult e le partite restano identiche', () => {
    const play = (withMarketCheck: boolean) => {
      const world = generateWorld(createRng(33));
      const league = world.leagues[0]!;
      const season = createSeason(world, league, 2026, 33);
      const runner = createRunner(world, season, createRng(33));
      const scores: string[] = [];
      let news = 0;
      for (let i = 0; i < 6; i++) {
        const r = runner.playRound(league.clubIds[0]);
        scores.push(r.otherMatches.map((m) => `${m.homeGoals}-${m.awayGoals}`).join(','));
        news += r.marketNews.length;
        if (withMarketCheck) {
          for (const o of r.offers) expect(o.expiresRound).toBeGreaterThan(r.round);
        }
      }
      return { scores, news };
    };
    const a = play(true);
    const b = play(false);
    // Determinismo pieno: stessi seed → stessi risultati e stesso mercato.
    expect(a.scores).toEqual(b.scores);
    expect(a.news).toBe(b.news);
  });
});
