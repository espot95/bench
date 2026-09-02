import { describe, expect, it } from 'vitest';
import { leagueOfClub } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { clubSeasonLines, expectedPositionByReputation } from './season-economy.js';
import { SPONSOR_BRANDS } from './sponsor-brands.js';
import {
  SPONSORSHIP,
  bettingEligible,
  initialSponsors,
  settleSponsors,
  signSponsor,
  sponsorGateMultiplier,
  sponsorOffersFor,
} from './sponsors.js';

const YEAR = 2026;

function world(seed = 61) {
  const w = generateWorld(createRng(seed));
  const clubs = [...w.clubs.values()].sort((a, b) => b.reputation - a.reputation);
  return { w, big: clubs[0]!, small: clubs[clubs.length - 1]! };
}

describe('sponsor come contratti (MODULE_SPONSORS)', () => {
  it('the library is big and varied; initial contracts balance the old sponsor line', () => {
    expect(SPONSOR_BRANDS.length).toBeGreaterThanOrEqual(180);
    for (const tier of ['micro', 'piccola', 'media', 'grande', 'multinazionale'] as const) {
      expect(SPONSOR_BRANDS.filter((b) => b.tier === tier).length).toBeGreaterThanOrEqual(30);
    }
    expect(SPONSOR_BRANDS.some((b) => b.special === 'scommesse')).toBe(true);
    expect(SPONSOR_BRANDS.some((b) => b.special === 'benefico')).toBe(true);

    const { w, big } = world();
    const contracts = initialSponsors(w, big, YEAR);
    expect(contracts).toHaveLength(4);
    const league = leagueOfClub(w, big.id);
    const nationCode = w.nations?.find((n) => n.id === league.nationId)?.code ?? 'DEFAULT';
    const baseline = clubSeasonLines(
      w,
      big,
      expectedPositionByReputation(w, big),
      league.clubIds.length,
      nationCode,
      league.tier,
    ).sponsorBase;
    const total = contracts.reduce((s, c) => s + c.annualValue, 0);
    expect(total).toBeGreaterThan(baseline * 0.9);
    expect(total).toBeLessThan(baseline * 1.1);
    // Scadenze sfalsate: non scadono tutti insieme.
    expect(new Set(contracts.map((c) => c.endYear)).size).toBeGreaterThan(1);
  });

  it('offers scale with fame; betting only for the wealthy or the packed stadium', () => {
    const { w, big, small } = world();
    initialSponsors(w, big, YEAR);
    const bigOffers = sponsorOffersFor(w, big, 'maglia', YEAR, createRng(1));
    const smallOffers = sponsorOffersFor(w, small, 'maglia', YEAR, createRng(1));
    const maxBig = Math.max(...bigOffers.map((o) => o.annualValue));
    const maxSmall = Math.max(...smallOffers.map((o) => o.annualValue), 1);
    expect(maxBig).toBeGreaterThan(maxSmall * 3);

    expect(bettingEligible(w, big)).toBe(true);
    expect(bettingEligible(w, small)).toBe(false);
    // Su molti seed, al piccolo non arriva MAI un'offerta scommesse.
    for (let seed = 0; seed < 15; seed++) {
      const offs = sponsorOffersFor(w, small, 'maglia', YEAR, createRng(seed));
      expect(offs.some((o) => o.clause?.kind === 'scommesse')).toBe(false);
    }
  });

  it('betting costs reputation and gate; charity pays in reputation and warm stands', () => {
    const { w, big } = world(62);
    big.sponsors = [];
    const repBefore = big.reputation;
    signSponsor(
      w,
      big,
      {
        slot: 'maglia',
        brandId: 'x',
        brandName: 'BetProva',
        sector: 'scommesse',
        tier: 'grande',
        annualValue: 30_000_000,
        years: 2,
        expectation: 99,
        clause: { kind: 'scommesse' },
      },
      YEAR,
    );
    expect(big.reputation).toBe(repBefore - SPONSORSHIP.BETTING_REP_COST);
    expect(sponsorGateMultiplier(big)).toBeLessThan(1);

    big.sponsors = [];
    signSponsor(
      w,
      big,
      {
        slot: 'maglia',
        brandId: 'y',
        brandName: 'CuoreProva',
        sector: 'benefica',
        tier: 'grande',
        annualValue: 0,
        years: 2,
        expectation: 99,
        clause: { kind: 'benefico' },
      },
      YEAR,
    );
    expect(sponsorGateMultiplier(big)).toBeGreaterThan(1);
    const table = leagueOfClub(w, big.id).clubIds.map((clubId) => ({
      clubId,
      played: 38,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    }));
    const repMid = big.reputation;
    const res = settleSponsors(w, big, table, YEAR);
    expect(big.reputation).toBe(repMid + SPONSORSHIP.CHARITY_REP_PER_SEASON);
    expect(res.headlines.length).toBeGreaterThan(0);
  });

  it('merch clause pays only with the nationality in the squad; missed targets sour the brand', () => {
    const { w, big } = world(63);
    const league = leagueOfClub(w, big.id);
    const table = league.clubIds.map((clubId) => ({
      clubId,
      played: 38,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    }));
    // Mettiamo il club ULTIMO: aspettative mancate.
    const meIdx = table.findIndex((r) => r.clubId === big.id);
    const [me] = table.splice(meIdx, 1);
    table.push(me!);

    const squadNation = w.players.get(big.playerIds[0]!)!.nationality;
    big.sponsors = [
      {
        slot: 'maglia',
        brandId: 'm1',
        brandName: 'MerchProva',
        annualValue: 20_000_000,
        startYear: YEAR,
        endYear: YEAR,
        expectation: 4,
        satisfaction: 0.4,
        clause: { kind: 'nazionalita', nation: squadNation, bonusPct: 0.2 },
      },
      {
        slot: 'stadio',
        brandId: 'm2',
        brandName: 'NoMerch',
        annualValue: 10_000_000,
        startYear: YEAR,
        endYear: YEAR + 2,
        expectation: 4,
        satisfaction: 0.6,
        clause: { kind: 'nazionalita', nation: 'XXX', bonusPct: 0.2 },
      },
    ];
    const cashBefore = big.finances.cash;
    const res = settleSponsors(w, big, table, YEAR);
    // Merch pagato SOLO per la nazionalità presente (20M × 20% = 4M).
    expect(big.finances.cash - cashBefore).toBe(4_000_000);
    expect(big.finances.incomes.some((e) => e.type === 'merch')).toBe(true);
    // Ultimo in classifica: l'aspettativa è mancata → il primo contratto scade DELUSO.
    expect(res.expired).toHaveLength(1);
    expect(res.expired[0]!.satisfaction).toBeLessThan(SPONSORSHIP.SAT_REFUSE);
    expect(res.headlines.some((h) => h.includes('SCARICA'))).toBe(true);
    // Il deluso NON rientra tra le offerte come rinnovo.
    const offers = sponsorOffersFor(w, big, 'maglia', YEAR + 1, createRng(5), res.expired[0]);
    expect(offers.some((o) => o.rinnovo)).toBe(false);
  });
});

describe('mercati esteri (MODULE_SPONSORS §7)', () => {
  const sponsorInvesting = (nation: string) => ({
    slot: 'maglia' as const,
    brandId: 'g1',
    brandName: 'GlobalProva',
    annualValue: 20_000_000,
    startYear: YEAR,
    endYear: YEAR + 9,
    expectation: 99,
    satisfaction: 0.6,
    clause: { kind: 'mercato', nation, bonusPct: 0.25 } as const,
  });

  it('emerging players exist (~2-8%); the famous club conquers the market, then loses it', async () => {
    const { EMERGING_NATIONS } = await import('../generation/generate-world.js');
    const { settleForeignFans } = await import('./sponsors.js');
    const w = generateWorld(createRng(64));
    const emerging = [...w.players.values()].filter((p) =>
      (EMERGING_NATIONS as readonly string[]).includes(p.nationality),
    );
    const share = emerging.length / w.players.size;
    expect(share).toBeGreaterThan(0.015);
    expect(share).toBeLessThan(0.09);

    // Il club più famoso con un cinese in rosa + sponsor che investe: il mercato si accende.
    const club = [...w.clubs.values()].sort((a, b) => b.reputation - a.reputation)[0]!;
    const chn = emerging.find((p) => p.nationality === 'CHN') ?? emerging[0]!;
    club.playerIds.push(chn.id);
    club.sponsors = [sponsorInvesting(chn.nationality)];
    for (let y = 0; y < 5; y++) settleForeignFans(w, club, YEAR + y);
    const market = club.foreignFans?.[chn.nationality];
    expect(market?.fans ?? 0).toBeGreaterThan(100_000);
    expect(market?.streak).toBe(5);
    expect(club.finances.incomes.filter((e) => e.type === 'merch').length).toBeGreaterThan(0);

    // Via il giocatore: il mercato si raffredda e la stirpe si spezza.
    club.playerIds = club.playerIds.filter((id) => id !== chn.id);
    const before = market?.fans ?? 0;
    const res = settleForeignFans(w, club, YEAR + 6);
    expect(club.foreignFans?.[chn.nationality]?.fans ?? 0).toBeLessThan(before);
    expect(club.foreignFans?.[chn.nationality]?.streak).toBe(0);
    expect(res.lines.some((l) => l.includes('stirpe'))).toBe(true);
  });

  it('a small club stays invisible for years: no merch revenue even with the player', async () => {
    const { EMERGING_NATIONS } = await import('../generation/generate-world.js');
    const { settleForeignFans, FANBASE } = await import('./sponsors.js');
    const w = generateWorld(createRng(64));
    const small = [...w.clubs.values()].sort((a, b) => a.reputation - b.reputation)[0]!;
    const chn = [...w.players.values()].find((p) =>
      (EMERGING_NATIONS as readonly string[]).includes(p.nationality),
    )!;
    small.playerIds.push(chn.id);
    for (let y = 0; y < 3; y++) settleForeignFans(w, small, YEAR + y);
    const market = small.foreignFans?.[chn.nationality];
    expect(market?.fans ?? 0).toBeLessThan(FANBASE.REVENUE_FROM);
    expect(small.finances.incomes.filter((e) => e.type === 'merch')).toHaveLength(0);
  });

  it('crowded market: rivals fielding the same nation slow your growth', async () => {
    const { EMERGING_NATIONS } = await import('../generation/generate-world.js');
    const { settleForeignFans } = await import('./sponsors.js');
    const grow = (crowded: boolean) => {
      const w = generateWorld(createRng(64));
      const clubs = [...w.clubs.values()].sort((a, b) => b.reputation - a.reputation);
      const me = clubs[0]!;
      const pool = [...w.players.values()].filter((p) =>
        (EMERGING_NATIONS as readonly string[]).includes(p.nationality),
      );
      const nation = pool[0]!.nationality;
      const same = pool.filter((p) => p.nationality === nation);
      me.playerIds.push(same[0]!.id);
      if (crowded)
        for (let i = 1; i < Math.min(same.length, 8); i++) clubs[i]!.playerIds.push(same[i]!.id);
      settleForeignFans(w, me, YEAR);
      return me.foreignFans?.[nation]?.fans ?? 0;
    };
    expect(grow(true)).toBeLessThan(grow(false));
  });

  it('a lineage of the same nation sells local TV rights from the 3rd season', async () => {
    const { EMERGING_NATIONS } = await import('../generation/generate-world.js');
    const { settleForeignFans, FANBASE } = await import('./sponsors.js');
    const w = generateWorld(createRng(64));
    const club = [...w.clubs.values()].sort((a, b) => b.reputation - a.reputation)[0]!;
    const chn = [...w.players.values()].find((p) =>
      (EMERGING_NATIONS as readonly string[]).includes(p.nationality),
    )!;
    club.playerIds.push(chn.id);
    const tvLines = () =>
      club.finances.incomes.filter((e) => e.type === 'tv' && e.note?.includes('stirpe'));
    for (let y = 0; y < FANBASE.TV_STREAK_FROM - 1; y++) settleForeignFans(w, club, YEAR + y);
    expect(tvLines()).toHaveLength(0); // prima del 3° anno le TV non comprano
    settleForeignFans(w, club, YEAR + FANBASE.TV_STREAK_FROM - 1);
    expect(tvLines()).toHaveLength(1);
    expect(tvLines()[0]!.amount).toBeGreaterThan(0);
    // Piccola ma interessante: non domina i ricavi (ordine di grandezza < 5M).
    expect(tvLines()[0]!.amount).toBeLessThan(5_000_000);
  });
});
