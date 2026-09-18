import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import { stadiumCapacity } from '../core/stadium.js';
import { type Club, leagueOfClub, nationById } from '../core/types.js';
import { createRunner, createSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  MKT,
  abroadCampaignNation,
  applyMatchOutcome,
  defaultTicketPrice,
  isDerby,
  livePosition,
  marketingMatchGate,
  matchClassOf,
  officePower,
  recentForm,
  resolveSeasonTickets,
  seasonTicketPrice,
  subscriberDemand,
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
  club.marketing = { plan: {}, features: ['abbonamenti', 'campagne', 'estero'] };
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
    const prima = officePower(club);
    club.reputation = Math.min(95, club.reputation + 20);
    expect(officePower(club)).toBeGreaterThan(prima);
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
