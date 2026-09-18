import { describe, expect, it } from 'vitest';
import { stadiumCapacity } from '../core/stadium.js';
import { type Club, leagueOfClub } from '../core/types.js';
import { createRunner, createSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import {
  MKT,
  applyMatchOutcome,
  isDerby,
  marketingMatchGate,
  matchClassOf,
  officePower,
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

function openOffice(club: Club) {
  club.structures = [...(club.structures ?? []), { id: 'ufficioMarketing', dx: 0, dy: 0 }];
  club.marketing = { plan: {} };
  return club.marketing;
}

describe('ufficio marketing (MODULE_STADIUM §3.4)', () => {
  it('abbonamento: il prezzo cresce con la fascia', () => {
    expect(seasonTicketPrice('popolare')).toBeLessThan(seasonTicketPrice('standard'));
    expect(seasonTicketPrice('standard')).toBeLessThan(seasonTicketPrice('premium'));
  });

  it('domanda abbonamenti: tetto rispettato, premium tira meno del popolare, deterministica', () => {
    const { club } = career();
    const m = openOffice(club);
    const cap = stadiumCapacity(club);

    m.plan = { abbPrice: 'popolare', abbCapShare: 0.85 };
    const pop = subscriberDemand(club, m);
    m.plan = { abbPrice: 'premium', abbCapShare: 0.85 };
    const prem = subscriberDemand(club, m);
    expect(prem.abbonati).toBeLessThan(pop.abbonati);

    // Il tetto scelto taglia davvero le tessere in vendita.
    m.plan = { abbPrice: 'popolare', abbCapShare: 0.1 };
    const capped = subscriberDemand(club, m);
    expect(capped.abbonati).toBeLessThanOrEqual(Math.round(cap * 0.1));

    // Zero RNG: stessa domanda a ogni chiamata.
    expect(subscriberDemand(club, m)).toEqual(subscriberDemand(club, m));
  });

  it('memoria dei rinnovi: aumento dopo una stagione storta = crollo; vincere fa rinnovare', () => {
    const { club } = career();
    const m = openOffice(club);
    m.plan = { abbPrice: 'premium', abbCapShare: 0.85 };
    m.lastAbbPrice = 'standard';
    m.lastSatisfaction = 0.3;
    const scontenti = subscriberDemand(club, m);
    m.lastSatisfaction = 0.9;
    const contenti = subscriberDemand(club, m);
    expect(scontenti.abbonati).toBeLessThan(contenti.abbonati);
    // Con la stessa soddisfazione bassa ma SENZA aumento non c'è la mazzata extra.
    m.lastSatisfaction = 0.3;
    m.lastAbbPrice = 'premium';
    expect(subscriberDemand(club, m).abbonati).toBeGreaterThan(scontenti.abbonati);
  });

  it('cartello: derby cittadino e big riconosciuti da soli', () => {
    const { world, club } = career();
    const others = [...world.clubs.values()].filter((c) => c.id !== club.id);
    const derby = others.find((c) => isDerby(club, c));
    if (derby) expect(matchClassOf(club, derby)).toBe('cartello');
    const big = others.find((c) => !isDerby(club, c) && c.reputation >= MKT.CARTELLO_REP);
    const small = others.find((c) => !isDerby(club, c) && c.reputation < MKT.CARTELLO_REP - 10);
    if (big) expect(matchClassOf(club, big)).toBe('cartello');
    if (small) expect(matchClassOf(club, small)).toBe('campionato');
  });

  it('botteghino di gara: il cartello incassa più del campionato; la coppa ignora gli abbonati', () => {
    const { club } = career();
    const m = openOffice(club);
    m.abbonati = Math.round(stadiumCapacity(club) * 0.5);
    const camp = marketingMatchGate(club, 'campionato', 0.5);
    const cart = marketingMatchGate(club, 'cartello', 0.5);
    expect(cart.gate).toBeGreaterThan(camp.gate);
    // Gli abbonati entrano gratis in campionato ma NON esistono in coppa: lì pagano tutti.
    const coppaCon = marketingMatchGate(club, 'coppa', 0.5);
    m.abbonati = 0;
    const coppaSenza = marketingMatchGate(club, 'coppa', 0.5);
    expect(coppaCon.gate).toBe(coppaSenza.gate);
    // In campionato invece gli abbonati tolgono paganti (gate più basso, presenze più alte).
    m.abbonati = Math.round(stadiumCapacity(club) * 0.5);
    expect(camp.gate).toBeLessThan(
      marketingMatchGate({ ...club, marketing: { plan: {} } }, 'campionato', 0.5).gate,
    );
    expect(camp.attendance).toBeGreaterThan(0);
  });

  it('striscia di sold-out: cresce, si azzera, e da 3 in poi accende l’hype sui paganti', () => {
    const { club } = career();
    const m = openOffice(club);
    applyMatchOutcome(club, true);
    applyMatchOutcome(club, true);
    expect(m.soldOutStreak).toBe(2);
    const prima = marketingMatchGate(club, 'campionato', 0.5);
    applyMatchOutcome(club, true);
    expect(m.soldOutStreak).toBe(3);
    const conHype = marketingMatchGate(club, 'campionato', 0.5);
    expect(conHype.fill).toBeGreaterThan(prima.fill);
    applyMatchOutcome(club, false);
    expect(m.soldOutStreak).toBe(0);
  });

  it('campagna d’agosto: incasso unico a ledger, memoria aggiornata, campagna da ricomprare', () => {
    const { club } = career();
    const m = openOffice(club);
    m.plan = { abbPrice: 'standard', abbCapShare: 0.6, campaign: 'curvaPopolare' };
    const cashBefore = club.finances.cash;
    const res = resolveSeasonTickets(club, 0.8, YEAR + 1);
    expect(res).not.toBeNull();
    expect(res!.abbonati).toBeGreaterThan(0);
    expect(res!.income).toBe(res!.abbonati * seasonTicketPrice('standard'));
    expect(club.finances.cash).toBe(cashBefore + res!.income);
    const entry = club.finances.incomes.find((e) => e.type === 'abbonamenti');
    expect(entry?.amount).toBe(res!.income);
    expect(entry?.year).toBe(YEAR + 1);
    expect(m.abbonati).toBe(res!.abbonati);
    expect(m.lastSatisfaction).toBe(0.8);
    expect(m.plan.campaign).toBeUndefined();
    // Senza ufficio non succede NIENTE (club AI/legacy).
    const { club: nudo } = career(SEED + 1);
    expect(resolveSeasonTickets(nudo, 0.8, YEAR + 1)).toBeNull();
  });

  it('la POSIZIONE dell’ufficio non conta (richiesta utente): il potere nazionale viene dal blasone', () => {
    const { club } = career();
    club.marketing = { plan: {} };
    club.structures = [{ id: 'ufficioMarketing', dx: 0.05, dy: -0.03 }];
    const periferia = officePower(club);
    club.structures = [{ id: 'ufficioMarketing', dx: 0, dy: 0 }];
    expect(officePower(club)).toBe(periferia);
    const prima = officePower(club);
    club.reputation = Math.min(95, club.reputation + 20);
    expect(officePower(club)).toBeGreaterThan(prima);
  });

  it('campagna internazionale: semina un mercato vergine al conguaglio, poi si azzera in estate', () => {
    const { world, club } = career();
    const m = openOffice(club);
    club.reputation = 80; // fame 0.64: il seme attecchisce sopra la soglia MIN_KEEP
    m.abroadNation = 'ZZZ';
    settleForeignFans(world, club, YEAR);
    expect(club.foreignFans?.ZZZ?.fans ?? 0).toBeGreaterThan(0);
    // Senza campagna un mercato vergine NON nasce da solo.
    const { world: w2, club: c2 } = career(SEED + 2);
    c2.reputation = 80;
    settleForeignFans(w2, c2, YEAR);
    expect(c2.foreignFans?.ZZZ).toBeUndefined();
    // La chiusura d'agosto azzera anche la campagna internazionale (si ricompra).
    resolveSeasonTickets(club, 0.5, YEAR + 1);
    expect(m.abroadNation).toBeUndefined();
  });

  it('tick per-giornata: col piano il gate viene dal modello marketing, senza resta la formula di sempre', () => {
    const { world, club, season } = career(62);
    const total = new Set(season.fixtures.map((x) => x.round)).size;
    const homeRound = season.fixtures.find((x) => x.homeClubId === club.id)!.round;

    // SENZA marketing: riferimento legacy.
    tickUserFinances(world, club, season, homeRound, total);
    const legacyGate = club.finances.incomes.filter((e) => e.type === 'gate').at(-1)!.amount;

    // CON ufficio + premium sul campionato: il gate cambia (modello nuovo).
    const m = openOffice(club);
    m.plan = { prices: { campionato: 'premium', cartello: 'premium' } };
    tickUserFinances(world, club, season, homeRound, total);
    const mktGate = club.finances.incomes.filter((e) => e.type === 'gate').at(-1)!.amount;
    expect(mktGate).not.toBe(legacyGate);
    expect(mktGate).toBeGreaterThan(0);
  });
});
