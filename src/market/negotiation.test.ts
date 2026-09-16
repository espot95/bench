import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import type { Club, Player } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { ROLE_TARGET } from './ai.js';
import {
  NEGOTIATION,
  bookTrip,
  dealFromState,
  dsSuggestions,
  executeDeal,
  loseToRival,
  offerFee,
  offerWage,
  openNegotiation,
  playerMarketStatus,
  resolveThink,
} from './negotiation.js';

const YEAR = 2026;

function setup(seed = 21) {
  const world = generateWorld(createRng(seed));
  const clubs = [...world.clubs.values()];
  const buyer = clubs[0]!;
  const seller = clubs.find((c) => c.id !== buyer.id)!;
  return { world, buyer, seller };
}

function squadOf(world: ReturnType<typeof setup>['world'], club: Club): Player[] {
  return club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined);
}

describe('viaggi di mercato (MODULE_MARKET §8)', () => {
  it('lo status è derivato: top-2 incedibile, surplus/cassa in vetrina', () => {
    const { world, seller } = setup();
    const squad = squadOf(world, seller).sort((a, b) => playerOverall(b) - playerOverall(a));
    const star = squad[0]!;
    const starStatus = playerMarketStatus(world, seller, star, YEAR);
    // La stella è incedibile (o al più in vetrina se il club è messo male).
    expect(['incedibile', 'vetrina']).toContain(starStatus);

    // Cassa in sofferenza → TUTTI in vetrina, anche la stella.
    const cash = seller.finances.cash;
    seller.finances.cash = 0;
    expect(playerMarketStatus(world, seller, star, YEAR)).toBe('vetrina');
    seller.finances.cash = cash;

    // Un gregario di un reparto in surplus finisce in vetrina.
    const mids = squad.filter((p) => p.position === 'MF');
    if (mids.length > (ROLE_TARGET.MF ?? 9) + 1) {
      const grunt = mids[mids.length - 1]!;
      expect(playerMarketStatus(world, seller, grunt, YEAR)).toBe('vetrina');
    }
  });

  it('la trattativa dinamica: insulto → mood giù; offerta piena → stretta di mano e stage ingaggio', () => {
    const { world, buyer, seller } = setup();
    const squad = squadOf(world, seller).sort((a, b) => playerOverall(a) - playerOverall(b));
    const target = squad.find((p) => playerMarketStatus(world, seller, p, YEAR) !== 'incedibile')!;
    buyer.finances.cash = 500_000_000;
    buyer.finances.transferBudget = 300_000_000;

    const open = openNegotiation(
      world,
      buyer,
      seller,
      target,
      YEAR,
      { inPerson: true, deadline: false },
      createRng(7),
    );
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    const st = open.state;
    expect(st.floor).toBeLessThanOrEqual(st.ask);
    const moodBefore = st.mood;
    const askBefore = st.ask;

    // Offerta insultante: mood giù e richiesta su.
    offerFee(world, st, buyer, Math.round(askBefore * 0.3), YEAR, createRng(11));
    if (st.stage === 'fee') {
      expect(st.mood).toBeLessThan(moodBefore);
      expect(st.ask).toBeGreaterThanOrEqual(askBefore);
      // Offerta piena: si chiude il cartellino e si passa all'ingaggio (o il
      // giocatore rifiuta la piazza — comunque si esce dallo stage fee).
      offerFee(world, st, buyer, st.ask, YEAR, createRng(13));
      const after: string = st.stage;
      expect(['wage', 'failed']).toContain(after);
      if (after === 'wage') {
        expect(st.agreedFee).toBeGreaterThan(0);
        expect(st.wageAsk).toBeGreaterThan(0);
        // Ingaggio pieno → done con termini completi.
        offerWage(world, st, st.wageAsk!, createRng(17));
        expect(st.stage).toBe('done');
        const deal = dealFromState(st);
        expect(deal).not.toBeNull();
        expect(deal!.fee).toBeGreaterThan(0);
        expect(deal!.wage).toBeGreaterThan(0);
      }
    }
    expect(st.log.length).toBeGreaterThan(3);
  });

  it("l'affare chiuso muove giocatore e soldi; i vincoli bloccano (cassa, rosa piena)", () => {
    const { world, buyer, seller } = setup(33);
    const target = squadOf(world, seller)
      .sort((a, b) => playerOverall(a) - playerOverall(b))
      .find((p) => playerMarketStatus(world, seller, p, YEAR) !== 'incedibile')!;
    buyer.finances.cash = 500_000_000;
    buyer.finances.transferBudget = 300_000_000;

    const deal = {
      playerId: target.id,
      playerName: target.name,
      sellerClubId: seller.id,
      sellerName: seller.name,
      fee: 5_000_000,
      wage: 20_000,
      commission: 1_000_000,
    };
    // Oltre il FIDO → blocco (MODULE_FINANCES §5.4: in rosso si compra, ma nel limite).
    const cash = buyer.finances.cash;
    buyer.finances.cash = -1_000_000_000;
    expect(executeDeal(world, buyer, deal, YEAR).ok).toBe(false);
    buyer.finances.cash = cash;

    const sellerCash = seller.finances.cash;
    const res = executeDeal(world, buyer, deal, YEAR);
    expect(res.ok).toBe(true);
    expect(buyer.playerIds).toContain(target.id);
    expect(seller.playerIds).not.toContain(target.id);
    expect(seller.finances.cash).toBe(sellerCash + deal.fee);
    // Ri-eseguire lo stesso pre-accordo fallisce con garbo (giocatore già partito).
    expect(executeDeal(world, buyer, deal, YEAR).ok).toBe(false);
  });

  it('la trasferta costa e finisce a ledger; il DS suggerisce obiettivi raggiungibili', () => {
    const { world, buyer } = setup();
    buyer.finances.cash = 10_000_000;
    const before = buyer.finances.cash;
    expect(bookTrip(buyer, 'Verona', YEAR).ok).toBe(true);
    expect(buyer.finances.cash).toBe(before - NEGOTIATION.TRIP_COST);
    expect(buyer.finances.expenses.at(-1)?.note).toContain('Verona');
    buyer.finances.cash = 0;
    expect(bookTrip(buyer, 'Verona', YEAR).ok).toBe(false);

    const targets = dsSuggestions(world, buyer, YEAR, 5);
    for (const t of targets) {
      expect(t.ask).toBeLessThanOrEqual(buyer.finances.transferBudget);
      expect(t.status).not.toBe('incedibile');
      expect(t.clubId).not.toBe(buyer.id);
    }
    // Determinismo: stessa chiamata, stessi consigli.
    expect(dsSuggestions(world, buyer, YEAR, 5)).toEqual(targets);
  });

  it('stesso seed → stessa trattativa, riga per riga (determinismo pieno)', () => {
    const run = () => {
      const { world, buyer, seller } = setup(5);
      const target = squadOf(world, seller)
        .sort((a, b) => playerOverall(a) - playerOverall(b))
        .find((p) => playerMarketStatus(world, seller, p, YEAR) !== 'incedibile')!;
      buyer.finances.cash = 500_000_000;
      buyer.finances.transferBudget = 300_000_000;
      const open = openNegotiation(
        world,
        buyer,
        seller,
        target,
        YEAR,
        { inPerson: false, deadline: true },
        createRng(42),
      );
      if (!open.ok) return [open.reason];
      const st = open.state;
      offerFee(world, st, buyer, Math.round(st.ask * 0.7), YEAR, createRng(43));
      if (st.stage === 'fee')
        offerFee(world, st, buyer, Math.round(st.ask * 0.9), YEAR, createRng(44));
      return st.log.map((e) => `${e.who}: ${e.text}`);
    };
    expect(run()).toEqual(run());
  });
});

describe('agente venditore v2 (AI di gioco a utilità)', () => {
  function openTable(seed = 21) {
    const world = generateWorld(createRng(seed));
    const clubs = [...world.clubs.values()];
    const buyer = clubs[0]!;
    const seller = clubs.find((c) => c.id !== buyer.id)!;
    buyer.finances.cash = 500_000_000;
    buyer.finances.transferBudget = 300_000_000;
    const squad = seller.playerIds
      .map((id) => world.players.get(id))
      .filter((p): p is Player => p !== undefined)
      .sort((a, b) => playerOverall(a) - playerOverall(b));
    const target = squad.find((p) => playerMarketStatus(world, seller, p, YEAR) !== 'incedibile')!;
    const open = openNegotiation(
      world,
      buyer,
      seller,
      target,
      YEAR,
      { inPerson: true, deadline: false },
      createRng(7),
    );
    if (!open.ok) throw new Error(open.reason);
    return { world, buyer, seller, target, st: open.state };
  }

  it('fuori zona NON concede: la richiesta resta ferma, il mood scende', () => {
    const { world, buyer, st } = openTable();
    // Sopra la soglia insulto ma sotto la zona (floor × ZONE_EDGE).
    const lowball = Math.max(Math.round(st.ask * 0.56), Math.round(st.floor * 0.7));
    if (lowball >= st.floor * NEGOTIATION.ZONE_EDGE) return; // mondo raro: niente da testare
    const askBefore = st.ask;
    const moodBefore = st.mood;
    offerFee(world, st, buyer, lowball, YEAR, createRng(101));
    if (st.stage !== 'fee') return; // fumantino/pazienza: esiti legittimi
    expect(st.ask).toBe(askBefore);
    expect(st.mood).toBeLessThan(moodBefore);
    expect(st.valuation).toBe(askBefore);
  });

  it('in zona concede a passi, mai sotto il floor, e la valutazione resta stabile', () => {
    const { world, buyer, st } = openTable();
    const valuation = st.valuation;
    const floor = st.floor;
    let prevAsk = st.ask;
    for (let i = 0; i < 8 && (st.stage === 'fee' || st.stage === 'pending'); i++) {
      if (st.stage === 'pending') {
        resolveThink(world, st, buyer, YEAR, createRng(300 + i));
        continue;
      }
      offerFee(world, st, buyer, Math.round(floor * 0.95), YEAR, createRng(200 + i));
      expect(st.ask).toBeLessThanOrEqual(
        Math.max(prevAsk, st.rivalBid !== undefined ? st.ask : prevAsk),
      );
      expect(st.ask).toBeGreaterThanOrEqual(Math.min(floor, st.floor));
      prevAsk = st.ask;
    }
    expect(st.valuation).toBe(valuation);
  });

  it('"ci penso" esiste e resolveThink è deterministico (stesso input → stessa risposta)', () => {
    let thoughtSeen = false;
    for (let seed = 21; seed < 29 && !thoughtSeen; seed++) {
      const { world, buyer, st } = openTable(seed);
      for (let k = 0; k < 12 && st.stage === 'fee'; k++) {
        const offer = Math.round((st.floor * (0.92 + 0.01 * k)) / 100_000) * 100_000;
        offerFee(world, st, buyer, offer, YEAR, createRng(400 + k));
      }
      if (st.stage !== 'pending') continue;
      thoughtSeen = true;
      expect(st.thinkDays).toBeGreaterThanOrEqual(1);
      const a = structuredClone(st);
      const b = structuredClone(st);
      resolveThink(world, a, buyer, YEAR, createRng(9));
      resolveThink(world, b, buyer, YEAR, createRng(9));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.stage === 'fee' || a.stage === 'wage' || a.stage === 'failed').toBe(true);
    }
    expect(thoughtSeen).toBe(true);
  });

  it('il rivale chiude DAVVERO: abbandono con concorrente = trasferimento eseguito', () => {
    const { world, buyer, seller, target, st } = openTable();
    const rival = [...world.clubs.values()].find(
      (c) => c.id !== buyer.id && c.id !== seller.id && c.playerIds.length < NEGOTIATION.SQUAD_CAP,
    )!;
    rival.finances.cash = 500_000_000;
    st.rivalClubId = rival.id;
    st.rivalName = rival.name;
    st.rivalBid = st.floor;
    const sellerCash = seller.finances.cash;
    const headline = loseToRival(world, st, YEAR);
    expect(headline).not.toBeNull();
    expect(rival.playerIds).toContain(target.id);
    expect(seller.playerIds).not.toContain(target.id);
    expect(seller.finances.cash).toBe(sellerCash + st.floor);
  });
});
