import { describe, expect, it } from 'vitest';
import { stadiumCapacity } from '../core/stadium.js';
import type { Club } from '../core/types.js';
import { FANBASE, settleForeignFans, settleSponsors } from '../finances/sponsors.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  RITIRO_SPOTS,
  SUMMER,
  TOUR_DESTINATIONS,
  concertOfferAt,
  payRitiro,
  playTour,
  ritiroEffects,
  settleConcert,
  tourQuote,
} from './events.js';
import { createRunner, createSeason } from './season.js';

const YEAR = 2026;

function world(seed: number) {
  const w = generateWorld(createRng(seed));
  const clubs = [...w.clubs.values()].sort((a, b) => b.reputation - a.reputation);
  return { w, big: clubs[0]!, small: clubs[clubs.length - 1]! };
}

describe("l'estate e gli eventi (MODULE_EVENTS)", () => {
  it('catalogs are sane: quality drives the ritiro, the world is reachable on tour', () => {
    expect(RITIRO_SPOTS.length).toBeGreaterThanOrEqual(8);
    for (const s of RITIRO_SPOTS) expect(s.quality).toBeGreaterThanOrEqual(30);
    // Dubai prepara meglio del campo comunale, e costa di conseguenza.
    const casa = ritiroEffects(RITIRO_SPOTS.find((s) => s.id === 'casa')!);
    const dubai = ritiroEffects(RITIRO_SPOTS.find((s) => s.id === 'dubai')!);
    expect(dubai.boost).toBeGreaterThan(casa.boost);
    expect(dubai.injuryMult).toBeLessThan(casa.injuryMult);
    // Tour: emergenti coperti + mete extra.
    const nations = new Set(TOUR_DESTINATIONS.map((d) => d.nation));
    for (const n of ['CHN', 'JPN', 'USA', 'KOR', 'IND', 'AUS', 'BRA']) {
      expect(nations.has(n)).toBe(true);
    }
  });

  it('tour money: the famous club nets more; affinity pays; the small club can lose money', () => {
    const { w, big, small } = world(91);
    const chnDest = TOUR_DESTINATIONS.find((d) => d.nation === 'CHN')!;
    const bigQuote = tourQuote(w, big, chnDest);
    const smallQuote = tourQuote(w, small, chnDest);
    expect(bigQuote.net).toBeGreaterThan(smallQuote.net);
    expect(smallQuote.net).toBeLessThan(0); // il piccolo in Cina ci rimette

    // Affinità: con tifosi già sul mercato il tour rende di più.
    big.foreignFans = { CHN: { fans: 200_000, streak: 4 } };
    expect(tourQuote(w, big, chnDest).net).toBeGreaterThan(bigQuote.net);

    // La perdita del piccolo finisce a ledger come SPESA eventi.
    const cashBefore = small.finances.cash;
    playTour(w, small, chnDest, YEAR);
    expect(small.finances.cash).toBeLessThan(cashBefore);
    expect(
      small.finances.expenses.some((e) => e.type === 'eventi' && e.note?.includes('perdita')),
    ).toBe(true);
  });

  it('the tour boosts the foreign market that year and can seed a cold one for the famous', () => {
    const { w, big } = world(92);
    const chn = [...w.players.values()].find((p) => p.nationality === 'CHN');
    // Con un giocatore CHN in rosa: crescita ×TOUR_MULT rispetto al non-tour.
    const clone = generateWorld(createRng(92));
    const bigClone = [...clone.clubs.values()].sort((a, b) => b.reputation - a.reputation)[0]!;
    if (chn) {
      big.playerIds.push(chn.id);
      const chnClone = [...clone.players.values()].find((p) => p.nationality === 'CHN')!;
      bigClone.playerIds.push(chnClone.id);
      settleForeignFans(w, big, YEAR, 'CHN');
      settleForeignFans(clone, bigClone, YEAR);
      const withTour = big.foreignFans?.CHN?.fans ?? 0;
      const without = bigClone.foreignFans?.CHN?.fans ?? 0;
      expect(withTour).toBeGreaterThan(without * 1.3);
    }
    // Semina a freddo: nessun giocatore USA, ma il tour pianta tifosi (grande club).
    settleForeignFans(w, big, YEAR + 1, 'USA');
    expect(big.foreignFans?.USA?.fans ?? 0).toBeGreaterThan(0);
  });

  it('the sponsor tour clause pays only when the summer tour went to the right nation', () => {
    const { w, big } = world(93);
    const league = [...w.leagues].find((l) => l.clubIds.includes(big.id))!;
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
    big.sponsors = [
      {
        slot: 'maglia',
        brandId: 't1',
        brandName: 'TourProva',
        annualValue: 20_000_000,
        startYear: YEAR,
        endYear: YEAR + 3,
        expectation: 99,
        satisfaction: 0.6,
        clause: { kind: 'tour', nation: 'USA', bonusPct: 0.15 },
      },
    ];
    const cashBefore = big.finances.cash;
    settleSponsors(w, big, table, YEAR, 'CHN'); // tour sbagliato: niente bonus
    const paidWrong = big.finances.incomes.some((e) => e.note?.includes('bonus tour'));
    expect(paidWrong).toBe(false);
    settleSponsors(w, big, table, YEAR + 1, 'USA');
    const bonus = big.finances.incomes.find((e) => e.note?.includes('bonus tour USA'));
    expect(bonus?.amount).toBe(3_000_000);
    expect(big.finances.cash).toBeGreaterThan(cashBefore);
  });

  it('preparation lives in the snapshot, stacks, and flips at least one result across seeds', () => {
    // Wiring: stack ritiro+tour nello snapshot.
    const { w, big } = world(94);
    const league = [...w.leagues].find((l) => l.clubIds.includes(big.id))!;
    const season = createSeason(w, league, YEAR, 940);
    const runner = createRunner(w, season, createRng(940), { aiMarket: false });
    runner.applyPreparation(big.id, { boost: 1.03, injuryMult: 0.7, rounds: 10 });
    runner.applyPreparation(big.id, { boost: 0.985, injuryMult: 1, rounds: 2 });
    const snap = runner.snapshot();
    expect(snap.preparation?.find(([id]) => id === big.id)?.[1]).toHaveLength(2);

    // Effetto: a parità di draw, il boost ribalta almeno un risultato su N seed.
    let flipped = false;
    for (let seed = 0; seed < 12 && !flipped; seed++) {
      const play = (withPrep: boolean) => {
        const w2 = generateWorld(createRng(94));
        const l2 = w2.leagues[0]!;
        const s2 = createSeason(w2, l2, YEAR, 9400 + seed);
        const r2 = createRunner(w2, s2, createRng(9400 + seed), { aiMarket: false });
        if (withPrep) {
          for (const id of l2.clubIds.slice(0, 10)) {
            r2.applyPreparation(id, { boost: 1.03, injuryMult: 1, rounds: 10 });
          }
        }
        r2.playRound();
        return s2.fixtures
          .filter((m) => m.round === 1)
          .map((m) => `${m.homeGoals}-${m.awayGoals}`)
          .join(';');
      };
      if (play(true) !== play(false)) flipped = true;
    }
    expect(flipped).toBe(true);
  });

  it('concerts: ads buy the crowd (worth it when cold, wasted when full); wear needs a home clash', () => {
    const { w, big, small } = world(95);
    const season = createSeason(
      w,
      [...w.leagues].find((l) => l.clubIds.includes(big.id))!,
      YEAR,
      950,
    );
    big.stadium.commercial.push('concerti');
    const offer = concertOfferAt(w, big, season, 4, createRng(7));
    expect(offer).not.toBeNull();
    // homeClash coerente coi fixtures.
    const expected = season.fixtures.some(
      (m) => m.round === offer!.round && m.homeClubId === big.id,
    );
    expect(offer!.homeClash).toBe(expected);

    // Piazza tiepida artificiale: la pubblicità alza pienone e netto.
    const cold: Club = {
      ...big,
      reputation: 45,
      finances: { ...big.finances, incomes: [], expenses: [], cash: 0 },
    };
    const none = settleConcert(cold, { ...offer!, homeClash: false }, 0, YEAR);
    const cold2: Club = {
      ...big,
      reputation: 45,
      finances: { ...big.finances, incomes: [], expenses: [], cash: 0 },
    };
    const ads = settleConcert(cold2, { ...offer!, homeClash: false }, 2, YEAR);
    expect(ads.fill).toBeGreaterThan(none.fill);
    expect(ads.net).toBeGreaterThan(none.net);

    // Stadio già pieno: il martellamento è denaro buttato.
    const hot: Club = {
      ...big,
      reputation: 99,
      finances: { ...big.finances, incomes: [], expenses: [], cash: 0 },
    };
    const hotOffer = { ...offer!, draw: 0.3, homeClash: false };
    const hotNone = settleConcert(hot, hotOffer, 0, YEAR);
    const hot2: Club = {
      ...big,
      reputation: 99,
      finances: { ...big.finances, incomes: [], expenses: [], cash: 0 },
    };
    const hotAds = settleConcert(hot2, hotOffer, 2, YEAR);
    expect(hotAds.net).toBeLessThan(hotNone.net);
    expect(stadiumCapacity(big)).toBeGreaterThan(0);
    // Il piccolo senza licenza non riceve proposte.
    expect(concertOfferAt(w, small, season, 4, createRng(7))).toBeNull();
  });

  it('a worn pitch punishes the possession side and leaves a no-passers match bit-identical', () => {
    // Confronto sull'INTERO round: quando cambia anche solo il conteggio tiri della
    // gara col campo rovinato, i draw a valle si spostano e il round diverge.
    const roundOf = (seasonSeed: number, style: 'possession' | 'catenaccio', wear: boolean) => {
      const w2 = generateWorld(createRng(96));
      const l2 = w2.leagues[0]!;
      const s2 = createSeason(w2, l2, YEAR, seasonSeed);
      const fixture = s2.fixtures.find((m) => m.round === 1)!;
      const homeId = fixture.homeClubId;
      const coach = [...(w2.managers?.values() ?? [])].find((m) => m.clubId === homeId);
      if (coach) coach.style = style;
      // L'ospite gioca SEMPRE catenaccio: il ramo bit-identico richiede che sul
      // campo rovinato non ci sia NESSUN palleggiatore (il mondo generato non lo garantisce).
      const away = [...(w2.managers?.values() ?? [])].find((m) => m.clubId === fixture.awayClubId);
      if (away) away.style = 'catenaccio';
      const r2 = createRunner(w2, s2, createRng(seasonSeed), { aiMarket: false });
      if (wear) r2.applyPitchWear(homeId, 1);
      r2.playRound();
      return s2.fixtures
        .filter((m) => m.round === 1)
        .map((m) => `${m.homeGoals}-${m.awayGoals}`)
        .join(';');
    };
    // Palleggiatori: su qualche seed il campo rovinato cambia i risultati.
    let flipped = false;
    for (let seed = 960; seed < 980 && !flipped; seed++) {
      if (roundOf(seed, 'possession', true) !== roundOf(seed, 'possession', false)) flipped = true;
    }
    expect(flipped).toBe(true);
    // Catenacciari: l'usura non tocca nulla — bit-identico su TUTTI i seed provati.
    for (let seed = 960; seed < 966; seed++) {
      expect(roundOf(seed, 'catenaccio', true)).toBe(roundOf(seed, 'catenaccio', false));
    }
  });

  it('territory assets: shops multiply merch, fan clubs soften decay, loyalty founds them', async () => {
    const { buildShop, foundFanClub, settleForeignFans } = await import('../finances/sponsors.js');
    const { w, big } = world(98);
    big.foreignFans = { CHN: { fans: 150_000, streak: 4 } };

    // Negozio: costa a ledger e moltiplica il merchandising del mercato.
    const cashBefore = big.finances.cash;
    expect(buildShop(w, big, 'CHN', YEAR)).toBeNull();
    expect(big.finances.cash).toBe(cashBefore - FANBASE.SHOP_COST);
    const chn = [...w.players.values()].find((p) => p.nationality === 'CHN');
    if (chn) big.playerIds.push(chn.id);
    settleForeignFans(w, big, YEAR);
    const merch = big.finances.incomes.filter((e) => e.type === 'merch');
    expect(merch.length).toBeGreaterThan(0);
    // Fidelizzazione automatica: a 150k e stirpe ≥3 nasce una sede da sola.
    expect(big.foreignFans?.CHN?.fanClubs ?? 0).toBeGreaterThanOrEqual(1);

    // Ritenzione: con le sedi la caduta senza giocatori è più dolce del DECAY secco.
    const a = { ...w.clubs.values().next().value! } as typeof big;
    const withClubs = { fans: 100_000, streak: 0, fanClubs: 3 };
    const noClubs = { fans: 100_000, streak: 0 };
    big.playerIds = big.playerIds.filter((id) => id !== chn?.id);
    big.foreignFans = { CHN: withClubs, JPN: noClubs };
    settleForeignFans(w, big, YEAR + 1);
    expect(big.foreignFans?.CHN?.fans ?? 0).toBeGreaterThan(big.foreignFans?.JPN?.fans ?? 0);
    expect(a).toBeDefined();

    // Guardie: niente negozi sotto i 20k, niente sedi sotto i 20k.
    const { small } = world(98);
    small.foreignFans = { USA: { fans: 5_000, streak: 1 } };
    expect(buildShop(w, small, 'USA', YEAR)).not.toBeNull();
    expect(foundFanClub(w, small, 'USA', YEAR)).not.toBeNull();
  });

  it('conquest missions: deterministic generation, completion pays reputation, expiry drops', async () => {
    const { MISSIONS, checkMissions, generateMissions } = await import('./events.js');
    const { w, big } = world(99);
    // Senza impero: la missione è APRIRE un mercato emergente (deterministica).
    const m1 = generateMissions(w, big, YEAR, []);
    const m2 = generateMissions(w, big, YEAR, []);
    expect(m1).toEqual(m2);
    expect(m1.length).toBeGreaterThan(0);
    expect(m1.length).toBeLessThanOrEqual(MISSIONS.ACTIVE_MAX);
    const apri = m1.find((m) => m.kind === 'apri')!;
    expect(apri).toBeDefined();

    // Apri il mercato → missione compiuta → +1 reputazione e headline.
    const repBefore = big.reputation;
    big.foreignFans = { [apri.nation]: { fans: 6_000, streak: 1 } };
    const res = checkMissions(w, big, m1, YEAR);
    expect(big.reputation).toBe(Math.min(99, repBefore + MISSIONS.REWARD_REP));
    expect(res.headlines.some((h) => h.includes('MISSIONE COMPIUTA'))).toBe(true);
    expect(res.remaining.find((m) => m.id === apri.id)).toBeUndefined();

    // Scadenza: una missione oltre il termine cade con l'headline, senza premio.
    const stale = [{ ...apri, id: 'x', nation: 'ZZZ', deadlineYear: YEAR - 1 }];
    const rep2 = big.reputation;
    const res2 = checkMissions(w, big, stale, YEAR);
    expect(big.reputation).toBe(rep2);
    expect(res2.remaining).toHaveLength(0);
    expect(res2.headlines.some((h) => h.includes('scaduta'))).toBe(true);

    // Sorpasso: peso mio > peso del rivale sul mercato (qui il rivale non ne ha).
    const chn2 = [...w.players.values()].find((p) => p.nationality === 'CHN');
    if (chn2) {
      if (!big.playerIds.includes(chn2.id)) big.playerIds.push(chn2.id);
      const rivalClub = [...w.clubs.values()].find(
        (c) =>
          c.id !== big.id && !c.playerIds.some((pid) => w.players.get(pid)?.nationality === 'CHN'),
      )!;
      const sorp = [
        {
          id: 's1',
          kind: 'sorpasso' as const,
          nation: 'CHN',
          text: 'Supera il rivale in CHN.',
          hint: '',
          deadlineYear: YEAR + 2,
          rivalClubId: rivalClub.id as string,
          rivalName: rivalClub.name,
        },
      ];
      const res3 = checkMissions(w, big, sorp, YEAR);
      expect(res3.remaining).toHaveLength(0);
      expect(res3.headlines.some((h) => h.includes('MISSIONE COMPIUTA'))).toBe(true);
    }
  });

  it('the ritiro expense hits the ledger with its own line', () => {
    const { w, big } = world(97);
    const spot = RITIRO_SPOTS.find((s) => s.id === 'marbella')!;
    const cashBefore = big.finances.cash;
    payRitiro(big, spot, YEAR);
    expect(big.finances.cash).toBe(cashBefore - spot.cost);
    const entry = big.finances.expenses.find((e) => e.type === 'ritiro');
    expect(entry?.note).toContain('Marbella');
    expect(SUMMER.PREP_ROUNDS).toBeGreaterThan(0);
    expect(w.clubs.size).toBeGreaterThan(0);
  });
});
