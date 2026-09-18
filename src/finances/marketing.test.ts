import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import { stadiumCapacity } from '../core/stadium.js';
import { type Club, type KitDesign, leagueOfClub, nationById } from '../core/types.js';
import { createRunner, createSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  MKT,
  abroadCampaignNation,
  applyMatchOutcome,
  boardOffers,
  boardSlots,
  defaultTicketPrice,
  isDerby,
  kitVerdict,
  launchKitDeal,
  livePosition,
  marketingMatchGate,
  matchClassOf,
  namingOffers,
  officePower,
  recentForm,
  resolveSeasonTickets,
  seasonTicketPrice,
  settleMarketingYear,
  signBoardDeal,
  signNamingDeal,
  stadiumNamingName,
  subscriberDemand,
  testimonialBoost,
} from './marketing.js';
import { settleForeignFans } from './sponsors.js';
import { tickUserFinances } from './treasury.js';

const YEAR = 2026;
const SEED = 61;

function career(seed = SEED) {
  const world = generateWorld(createRng(seed));
  const club = [...world.clubs.values()][2]!;
  const season = createSeason(world, leagueOfClub(world, club.id), YEAR, seed + YEAR);
  const runner = createRunner(world, season, createRng(seed + YEAR));
  return { world, club, season, runner };
}

/** L'ufficio ESISTE GIÀ: qui lo si "apre" con tutti i servizi comprati. */
function openOffice(club: Club) {
  club.marketing = {
    plan: {},
    features: ['abbonamenti', 'campagne', 'estero', 'pubblicita', 'divise'],
  };
  return club.marketing;
}

describe('ufficio marketing (MODULE_STADIUM §3.4)', () => {
  it('prezzo base di DEFAULT per lega: Premier > Serie A, Championship > Serie B', () => {
    const { world } = career();
    const byLeague = new Map<string, Club>();
    for (const c of world.clubs.values()) {
      const l = leagueOfClub(world, c.id);
      const code = nationById(world, l.nationId)?.code ?? '?';
      byLeague.set(`${code}${l.tier}`, c);
    }
    const price = (k: string) => defaultTicketPrice(world, byLeague.get(k)!);
    expect(price('ENG1')).toBeGreaterThan(price('ITA1'));
    expect(price('ENG2')).toBeGreaterThan(price('ITA2'));
    expect(price('ITA1')).toBeGreaterThan(price('ITA2'));
    // L'abbonamento segue il prezzo base e cresce con la fascia.
    const ita = byLeague.get('ITA1')!;
    openOffice(ita);
    expect(seasonTicketPrice(world, ita, 'popolare')).toBeLessThan(
      seasonTicketPrice(world, ita, 'premium'),
    );
  });

  it('prezzo LIBERO in € con elasticità: caro sul default = più incasso a biglietto ma stadio più vuoto', () => {
    const { world, club } = career();
    const m = openOffice(club);
    const base = marketingMatchGate(world, club, 'campionato', 0.5);
    m.plan = { basePrice: defaultTicketPrice(world, club) * 2 };
    const caro = marketingMatchGate(world, club, 'campionato', 0.5);
    expect(caro.fill).toBeLessThan(base.fill);
    m.plan = { basePrice: Math.round(defaultTicketPrice(world, club) * 0.6) };
    const popolare = marketingMatchGate(world, club, 'campionato', 0.5);
    expect(popolare.fill).toBeGreaterThan(base.fill);
  });

  it('classifica VIVA e forma: posizione reale e striscia muovono il pubblico', () => {
    const { world, club, season, runner } = career();
    openOffice(club);
    // Prima giornata: nessuna gara giocata → niente classifica viva.
    expect(livePosition(season, club.id as string)).toBeNull();
    for (let i = 0; i < 6; i++) runner.playRound(club.id);
    const live = livePosition(season, club.id as string);
    expect(live).not.toBeNull();
    expect(live!.pos).toBeGreaterThanOrEqual(1);
    expect(live!.pos).toBeLessThanOrEqual(live!.n);
    expect(Math.abs(recentForm(season, club.id as string))).toBeLessThanOrEqual(1);
    // Il momentum muove il riempimento nei due sensi.
    const su = marketingMatchGate(world, club, 'campionato', 0.5, 1);
    const giu = marketingMatchGate(world, club, 'campionato', 0.5, -1);
    expect(su.fill).toBeGreaterThan(giu.fill);
  });

  it('domanda abbonamenti: tetto rispettato, premium tira meno del popolare, deterministica', () => {
    const { world, club } = career();
    const m = openOffice(club);
    const cap = stadiumCapacity(club);

    m.plan = { abbPrice: 'popolare', abbCapShare: 0.85 };
    const pop = subscriberDemand(world, club, m, YEAR);
    m.plan = { abbPrice: 'premium', abbCapShare: 0.85 };
    const prem = subscriberDemand(world, club, m, YEAR);
    expect(prem.abbonati).toBeLessThan(pop.abbonati);

    m.plan = { abbPrice: 'popolare', abbCapShare: 0.1 };
    const capped = subscriberDemand(world, club, m, YEAR);
    expect(capped.abbonati).toBeLessThanOrEqual(Math.round(cap * 0.1));

    expect(subscriberDemand(world, club, m, YEAR)).toEqual(subscriberDemand(world, club, m, YEAR));
  });

  it('zoccolo duro: i rinnovi si ancorano ai vecchi abbonati; la promozione sfonda il tetto di crescita', () => {
    const { world, club } = career();
    const m = openOffice(club);
    m.plan = { abbPrice: 'standard', abbCapShare: 0.85 };
    // Base enorme + stagione orrenda: il floor tiene comunque su una quota dei vecchi.
    const cap = stadiumCapacity(club);
    m.abbonati = Math.round(cap * 0.8);
    const res = resolveSeasonTickets(world, club, 0.1, YEAR + 1)!;
    const floorAtteso = Math.round(cap * 0.8 * (MKT.RENEW_FLOOR_BASE + MKT.RENEW_FLOOR_SAT * 0.1));
    expect(res.abbonati).toBeGreaterThanOrEqual(floorAtteso);
    // Base piccola: la crescita annua è limitata... ma la PROMOZIONE la sfonda.
    m.abbonati = 1000;
    const normale = resolveSeasonTickets(world, club, 0.9, YEAR + 2)!;
    expect(normale.abbonati).toBeLessThanOrEqual(Math.round(1000 * MKT.RENEW_GROWTH_CAP));
    m.abbonati = 1000;
    const promo = resolveSeasonTickets(world, club, 0.9, YEAR + 3, 'promozione')!;
    expect(promo.abbonati).toBeGreaterThan(normale.abbonati);
  });

  it('colpo di mercato: una stella appena firmata gonfia la campagna abbonamenti', () => {
    const { world } = career();
    // Il club con la stella più luminosa del mondo (overall massimo).
    let club: Club | undefined;
    let starContract: { startYear: number } | undefined;
    let best = 0;
    for (const c of world.clubs.values()) {
      for (const pid of c.playerIds) {
        const p = world.players.get(pid);
        const ct = p?.contractId ? world.contracts.get(p.contractId) : undefined;
        if (p && ct && playerOverall(p) > best) {
          best = playerOverall(p);
          club = c;
          starContract = ct;
        }
      }
    }
    expect(best).toBeGreaterThanOrEqual(MKT.STAR_SIGNING_OVERALL);
    const m = openOffice(club!);
    club!.reputation = 55; // domanda lontana dai clamp: l'effetto-fenomeno si vede
    m.plan = { abbCapShare: 0.85 };
    // Ripulisci le anzianità di worldgen: nessuno risulti "appena firmato".
    for (const pid of club!.playerIds) {
      const ct = world.players.get(pid)?.contractId;
      const c = ct ? world.contracts.get(ct) : undefined;
      if (c) c.startYear = YEAR - 10;
    }
    const senza = subscriberDemand(world, club!, m, YEAR);
    starContract!.startYear = YEAR;
    const conStella = subscriberDemand(world, club!, m, YEAR);
    expect(conStella.abbonati).toBeGreaterThan(senza.abbonati);
  });

  it('elasticità per settore: il popolare in curva riempie più che in tribuna', () => {
    const { world, club } = career();
    const m = openOffice(club);
    const curva = club.stadium.sectors.curvaNord.seats > 0 ? 'curvaNord' : 'curvaSud';
    m.plan = { sectorPrices: { [curva]: 'popolare' } };
    const inCurva = marketingMatchGate(world, club, 'campionato', 0.5);
    m.plan = { sectorPrices: { principale: 'popolare' } };
    const inTribuna = marketingMatchGate(world, club, 'campionato', 0.5);
    // A parità di posti la curva è più elastica; se i posti differiscono resta
    // comunque vero il verso quando la curva non è più piccola della tribuna.
    if (club.stadium.sectors[curva].seats >= club.stadium.sectors.principale.seats) {
      expect(inCurva.fill).toBeGreaterThan(inTribuna.fill);
    } else {
      expect(inCurva.fill).not.toBe(inTribuna.fill);
    }
  });

  it('cartello: derby, big per blasone e SCONTRO D’ALTA CLASSIFICA nel ritorno', () => {
    const { world, club } = career();
    const others = [...world.clubs.values()].filter((c) => c.id !== club.id);
    const derby = others.find((c) => isDerby(club, c));
    if (derby) expect(matchClassOf(club, derby)).toBe('cartello');
    const small = others.find((c) => !isDerby(club, c) && c.reputation < MKT.CARTELLO_REP - 10);
    expect(small).toBeDefined();
    // Provinciale contro provinciale: normale... finché non è 1ª contro 2ª ad aprile.
    expect(matchClassOf(club, small!)).toBe('campionato');
    expect(matchClassOf(club, small!, { myPos: 1, oppPos: 2, roundFrac: 0.8 })).toBe('cartello');
    expect(matchClassOf(club, small!, { myPos: 1, oppPos: 2, roundFrac: 0.2 })).toBe('campionato');
    expect(matchClassOf(club, small!, { myPos: 1, oppPos: 9, roundFrac: 0.8 })).toBe('campionato');
  });

  it('botteghino di gara: il cartello incassa più del campionato; la coppa ignora gli abbonati', () => {
    const { world, club } = career();
    const m = openOffice(club);
    m.abbonati = Math.round(stadiumCapacity(club) * 0.5);
    const camp = marketingMatchGate(world, club, 'campionato', 0.5);
    const cart = marketingMatchGate(world, club, 'cartello', 0.5);
    expect(cart.gate).toBeGreaterThan(camp.gate);
    const coppaCon = marketingMatchGate(world, club, 'coppa', 0.5);
    m.abbonati = 0;
    const coppaSenza = marketingMatchGate(world, club, 'coppa', 0.5);
    expect(coppaCon.gate).toBe(coppaSenza.gate);
    m.abbonati = Math.round(stadiumCapacity(club) * 0.5);
    expect(camp.gate).toBeLessThan(
      marketingMatchGate(world, { ...club, marketing: { plan: {} } }, 'campionato', 0.5).gate,
    );
    expect(camp.attendance).toBeGreaterThan(0);
  });

  it('striscia di sold-out: cresce, si azzera, e da 3 in poi accende l’hype sui paganti', () => {
    const { world, club } = career();
    const m = openOffice(club);
    applyMatchOutcome(club, true);
    applyMatchOutcome(club, true);
    expect(m.soldOutStreak).toBe(2);
    const prima = marketingMatchGate(world, club, 'campionato', 0.5);
    applyMatchOutcome(club, true);
    expect(m.soldOutStreak).toBe(3);
    const conHype = marketingMatchGate(world, club, 'campionato', 0.5);
    expect(conHype.fill).toBeGreaterThan(prima.fill);
    applyMatchOutcome(club, false);
    expect(m.soldOutStreak).toBe(0);
  });

  it('campagna d’agosto: incasso unico a ledger, memoria aggiornata, campagna da ricomprare', () => {
    const { world, club } = career();
    const m = openOffice(club);
    m.plan = { abbPrice: 'standard', abbCapShare: 0.6, campaign: 'curvaPopolare' };
    const cashBefore = club.finances.cash;
    const res = resolveSeasonTickets(world, club, 0.8, YEAR + 1);
    expect(res).not.toBeNull();
    expect(res!.abbonati).toBeGreaterThan(0);
    expect(res!.income).toBe(res!.abbonati * seasonTicketPrice(world, club, 'standard'));
    expect(club.finances.cash).toBe(cashBefore + res!.income);
    const entry = club.finances.incomes.find((e) => e.type === 'abbonamenti');
    expect(entry?.amount).toBe(res!.income);
    expect(entry?.year).toBe(YEAR + 1);
    expect(m.abbonati).toBe(res!.abbonati);
    expect(m.lastSatisfaction).toBe(0.8);
    expect(m.plan.campaign).toBeUndefined();
    // Senza ufficio non succede NIENTE (club AI/legacy).
    const { world: w2, club: nudo } = career(SEED + 1);
    expect(resolveSeasonTickets(w2, nudo, 0.8, YEAR + 1)).toBeNull();
  });

  it('il potere nazionale viene dal blasone; i servizi si COMPRANO (feature gating)', () => {
    const { world, club } = career();
    club.marketing = { plan: {} };
    const prima = officePower(world, club);
    club.reputation = Math.min(95, club.reputation + 20);
    expect(officePower(world, club)).toBeGreaterThan(prima);
    club.marketing.plan = { campaign: 'curvaPopolare', abbCapShare: MKT.ABB_MAX_SHARE };
    club.marketing.abroadNation = 'ZZZ';
    expect(abroadCampaignNation(club)).toBeUndefined();
    const senza = subscriberDemand(world, club, club.marketing, YEAR).abbonati;
    club.marketing.features = ['campagne', 'estero'];
    expect(abroadCampaignNation(club)).toBe('ZZZ');
    expect(subscriberDemand(world, club, club.marketing, YEAR).abbonati).toBeGreaterThan(senza);
  });

  it('campagna internazionale: semina un mercato vergine al conguaglio, poi si azzera in estate', () => {
    const { world, club } = career();
    const m = openOffice(club);
    club.reputation = 80;
    m.abroadNation = 'ZZZ';
    settleForeignFans(world, club, YEAR);
    expect(club.foreignFans?.ZZZ?.fans ?? 0).toBeGreaterThan(0);
    const { world: w2, club: c2 } = career(SEED + 2);
    c2.reputation = 80;
    settleForeignFans(w2, c2, YEAR);
    expect(c2.foreignFans?.ZZZ).toBeUndefined();
    resolveSeasonTickets(world, club, 0.5, YEAR + 1);
    expect(m.abroadNation).toBeUndefined();
  });

  it('bordocampo (A): offerte deterministiche, la firma incassa la prima annualità e riempie uno slot', () => {
    const { world, club } = career();
    openOffice(club);
    const offers = boardOffers(world, club, YEAR);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers).toEqual(boardOffers(world, club, YEAR));
    const cashBefore = club.finances.cash;
    const deal = signBoardDeal(club, offers[0]!, YEAR);
    expect(deal).not.toBeNull();
    expect(club.marketing?.boards).toHaveLength(1);
    expect(club.finances.cash).toBe(cashBefore + offers[0]!.annualValue);
    const entry = club.finances.incomes.find((e) => e.type === 'pubblicita');
    expect(entry?.amount).toBe(offers[0]!.annualValue);
    // Slot finiti = niente firma; il brand firmato sparisce dalle offerte nuove.
    for (let i = 0; i < 10; i++) {
      const next = boardOffers(world, club, YEAR)[0];
      if (!next) break;
      signBoardDeal(club, next, YEAR);
    }
    expect((club.marketing?.boards ?? []).length).toBeLessThanOrEqual(boardSlots(club));
  });

  it('naming rights (B): anticipo pesante, nome commerciale, curva ferita; le annualità ai conguagli', () => {
    const { world, club } = career();
    const m = openOffice(club);
    m.lastSatisfaction = 0.7;
    const offers = namingOffers(world, club, YEAR);
    expect(offers).toHaveLength(MKT.NAMING_OFFERS);
    const o = offers[0]!;
    const cashBefore = club.finances.cash;
    expect(signNamingDeal(club, o, YEAR)).toBe(true);
    expect(club.finances.cash).toBe(cashBefore + o.annualValue + o.upfront);
    expect(stadiumNamingName(club)).toBe(o.stadiumName);
    expect(m.lastSatisfaction).toBeCloseTo(0.7 - MKT.NAMING_SAT_COST, 5);
    // Col nome venduto niente altre offerte; il conguaglio paga l'annualità...
    expect(namingOffers(world, club, YEAR + 1)).toHaveLength(0);
    const settle = settleMarketingYear(club, YEAR + 1);
    expect(settle.namingIncome).toBe(o.annualValue);
    // ...e oltre la scadenza il contratto muore.
    const after = settleMarketingYear(club, YEAR + o.years + 1);
    expect(after.namingIncome).toBe(0);
    expect(stadiumNamingName(club)).toBeNull();
  });

  it('promo della gara (C): riempie di più ma il biglietto rende meno', () => {
    const { world, club } = career();
    openOffice(club);
    const liscia = marketingMatchGate(world, club, 'campionato', 0.5, 0);
    const promo = marketingMatchGate(world, club, 'campionato', 0.5, 0, 'famiglie');
    expect(promo.fill).toBeGreaterThan(liscia.fill);
    const perHead = (g: typeof liscia) => g.gate / Math.max(1, g.attendance);
    expect(perHead(promo)).toBeLessThan(perHead(liscia));
  });

  it('testimonial (D): la faccia amplifica le campagne, la cessione la rende orfana', () => {
    const { world, club } = career();
    const m = openOffice(club);
    const star = club.playerIds
      .map((id) => world.players.get(id)!)
      .sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;
    const senza = officePower(world, club);
    m.testimonial = { playerId: star.id as string, fee: 100_000 };
    expect(testimonialBoost(world, club)).toBeGreaterThan(0);
    expect(officePower(world, club)).toBeGreaterThan(senza);
    // Ceduto a gennaio: la campagna resta orfana (boost zero, fee già pagata).
    club.playerIds = club.playerIds.filter((id) => id !== star.id);
    expect(testimonialBoost(world, club)).toBe(0);
    expect(officePower(world, club)).toBe(senza);
    // L'estate azzera il testimonial (si risceglie ogni anno).
    m.testimonial = { playerId: star.id as string, fee: 100_000 };
    settleMarketingYear(club, YEAR + 1);
    expect(m.testimonial).toBeUndefined();
  });

  it('atelier (E): il lancio incassa merch a verdetto, una maglia a stagione, la fedeltà premia lo storico', () => {
    const { world, club } = career();
    const m = openOffice(club);
    m.abbonati = 20_000;
    const design = (over: Partial<KitDesign>): KitDesign => ({
      pattern: 'palato',
      primary: '#aa0000',
      secondary: '#000000',
      sleeves: '#aa0000',
      collar: '#ffffff',
      style: 'storico',
      origin: 'utente',
      ...over,
    });
    // La fedeltà muove il verdetto (stesso stile, contesto identico).
    const fedele = kitVerdict(world, club, design({}), { fidelity: 1 });
    const rottura = kitVerdict(world, club, design({}), { fidelity: 0 });
    expect(fedele).toBeGreaterThan(rottura);
    // Il lancio: incasso a ledger 'merch', deterministico, e UNO a stagione.
    const cashBefore = club.finances.cash;
    const res = launchKitDeal(world, club, design({}), YEAR, { fidelity: 1 });
    expect(res).not.toBeNull();
    expect(res!.income).toBeGreaterThan(0);
    expect(club.finances.cash).toBe(cashBefore + res!.income);
    expect(
      club.finances.incomes.some((e) => e.type === 'merch' && e.note?.includes('lancio')),
    ).toBe(true);
    expect(m.kits?.current?.year).toBe(YEAR);
    expect(m.kits?.archive).toHaveLength(1);
    expect(launchKitDeal(world, club, design({}), YEAR, { fidelity: 1 })).toBeNull();
  });

  it('atelier (E): la rievocazione di un anno d’ORO vale più di un’annata anonima; il moderno viaggia', () => {
    const { world, club } = career();
    openOffice(club);
    const base: KitDesign = {
      pattern: 'sash',
      primary: '#112244',
      secondary: '#ffffff',
      sleeves: '#112244',
      collar: '#ffffff',
      style: 'storico',
      origin: 'rievocazione',
      sourceYear: YEAR - 3,
    };
    const oro = kitVerdict(world, club, base, { fidelity: 0.8, golden: true });
    const anonima = kitVerdict(world, club, base, { fidelity: 0.8, golden: false });
    expect(oro).toBeGreaterThan(anonima);
    // Il MODERNO vende di più sui mercati esteri (a parità di verdetto conta i fan ×2).
    club.foreignFans = { BRA: { fans: 500_000, streak: 2 } };
    const m2 = club.marketing!;
    m2.abbonati = 10_000;
    const modernoRes = launchKitDeal(
      world,
      club,
      { ...base, style: 'moderno', origin: 'utente', sourceYear: undefined },
      YEAR,
      { fidelity: 0.8 },
    )!;
    m2.kits = { archive: [] }; // riarma per il confronto (test-only)
    const storicoRes = launchKitDeal(world, club, { ...base, origin: 'utente' }, YEAR, {
      fidelity: 0.8,
    })!;
    const buyersPerVerdict = (r: { income: number; verdictPct: number }) =>
      r.income / (0.4 + r.verdictPct / 100);
    expect(buyersPerVerdict(modernoRes)).toBeGreaterThan(buyersPerVerdict(storicoRes));
  });

  it('tick per-giornata: col piano il gate viene dal modello marketing, senza resta la formula di sempre', () => {
    const { world, club, season } = career(62);
    const total = new Set(season.fixtures.map((x) => x.round)).size;
    const homeRound = season.fixtures.find((x) => x.homeClubId === club.id)!.round;

    tickUserFinances(world, club, season, homeRound, total);
    const legacyGate = club.finances.incomes.filter((e) => e.type === 'gate').at(-1)!.amount;

    const m = openOffice(club);
    m.plan = { prices: { campionato: 'premium', cartello: 'premium' } };
    tickUserFinances(world, club, season, homeRound, total);
    const mktGate = club.finances.incomes.filter((e) => e.type === 'gate').at(-1)!.amount;
    expect(mktGate).not.toBe(legacyGate);
    expect(mktGate).toBeGreaterThan(0);
  });
});
