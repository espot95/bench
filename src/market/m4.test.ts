import { describe, expect, it } from 'vitest';
import { leagueOfClub } from '../core/types.js';
import { advanceOffseason } from '../engine/progression.js';
import { createSeason, seasonStandings, simulateSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { aiMarketRound, marketRumors, returnOffer, solicitOffers } from './ai.js';
import { openNegotiation } from './negotiation.js';
import { RELATIONS, bumpRelation, decayRelations, relationBetween } from './relations.js';
import { executeTransfer } from './transfers.js';

const YEAR = 2026;

describe('M4 — club relations (market/relations)', () => {
  it('deals build relations, offseason cools them, negotiations start warmer', () => {
    const world = generateWorld(createRng(17));
    const clubs = [...world.clubs.values()];
    const [a, b] = [clubs[0]!, clubs[1]!];

    // Un trasferimento vero fa +1 tra i due club.
    const sold = a.playerIds.map((id) => world.players.get(id)!).find((p) => p.position === 'MF')!;
    executeTransfer(world, a, b, sold, 5_000_000, 50_000, 3, 0, YEAR);
    expect(relationBetween(world, a.id, b.id)).toBe(RELATIONS.BUMP);

    // Il decay raffredda; sotto PRUNE la coppia sparisce (sparse).
    decayRelations(world);
    expect(relationBetween(world, a.id, b.id)).toBeCloseTo(RELATIONS.BUMP * RELATIONS.DECAY, 5);
    for (let i = 0; i < 10; i++) decayRelations(world);
    expect(world.clubRelations?.has(`${[a.id, b.id].sort().join('|')}`)).toBe(false);

    // Con rapporto alto il tavolo parte più caldo (stesso seed, stesso giocatore).
    const seller = clubs[2]!;
    const buyer = clubs[3]!;
    const player = seller.playerIds
      .map((id) => world.players.get(id)!)
      .find((p) => p.position === 'FW')!;
    const cold = openNegotiation(
      world,
      buyer,
      seller,
      player,
      YEAR,
      { inPerson: false, deadline: false },
      createRng(9),
    );
    bumpRelation(world, buyer.id, seller.id);
    bumpRelation(world, buyer.id, seller.id);
    const warm = openNegotiation(
      world,
      buyer,
      seller,
      player,
      YEAR,
      { inPerson: false, deadline: false },
      createRng(9),
    );
    if (cold.ok && warm.ok) {
      expect(warm.state.mood).toBeGreaterThan(cold.state.mood);
      expect(warm.state.floor).toBeLessThanOrEqual(cold.state.floor);
      expect(warm.state.log.some((e) => e.text.includes('fiducia'))).toBe(true);
    } else {
      // L'incedibile può rifiutare il tavolo freddo, mai quello caldo (rel ≥ 1).
      expect(warm.ok).toBe(true);
    }
  });
});

describe('M4 — mercato AI con memoria (market/ai)', () => {
  it('windows produce duels/dominoes/gong drama and rumors across a season of rounds', () => {
    const world = generateWorld(createRng(23));
    const league = world.leagues[0]!;
    const rng = createRng(101);
    const all: string[] = [];
    let rumors = 0;
    for (let round = 1; round <= 38; round++) {
      const deals = aiMarketRound(world, league, round, 38, rng);
      for (const d of deals) {
        expect(d.playerId).toBeDefined();
        all.push(d.headline);
      }
      const r = marketRumors(world, league, round, 38, rng);
      for (const n of r) {
        expect(n.fee).toBe(0);
        rumors++;
      }
    }
    expect(all.length).toBeGreaterThan(3); // il mondo si muove davvero
    expect(rumors).toBeGreaterThan(1); // e se ne parla
    // Le meccaniche nuove esistono nel flusso (seed scelto perché le mostri).
    const text = all.join('\n');
    expect(/DUELLO|EFFETTO DOMINO|SFUMA SUL GONG/.test(text)).toBe(true);
    // Le rose restano nelle bande della carriera (nessuna collezione di figurine).
    for (const c of world.clubs.values()) {
      expect(c.playerIds.length).toBeGreaterThanOrEqual(19);
      expect(c.playerIds.length).toBeLessThanOrEqual(28);
    }
  });

  it('rumors also warm up in the two rounds before a window opens', () => {
    const world = generateWorld(createRng(29));
    const league = world.leagues[0]!;
    let hits = 0;
    for (let seed = 0; seed < 20; seed++) {
      hits += marketRumors(world, league, 17, 38, createRng(seed)).length; // vigilia invernale
      expect(marketRumors(world, league, 12, 38, createRng(seed))).toHaveLength(0); // piena stagione
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('hot-listed players draw real discounted offers; rejected suitors can return higher', () => {
    const world = generateWorld(createRng(31));
    const club = [...world.clubs.values()][0]!;
    const star = club.playerIds.map((id) => world.players.get(id)!)[0]!;
    let offer = null;
    for (let seed = 0; seed < 30 && !offer; seed++) {
      offer = solicitOffers(world, club, [star.id], 2, 38, createRng(seed))[0] ?? null;
    }
    expect(offer).not.toBeNull();
    expect(offer!.bid).toBeLessThan(offer!.ask); // scontata: lo sanno che se ne va

    let back = null;
    for (let seed = 0; seed < 30 && !back; seed++) {
      back = returnOffer(
        world,
        club,
        { playerId: star.id as string, fromClubId: offer!.fromClubId as string, bid: offer!.bid },
        3,
        38,
        createRng(seed),
      );
    }
    expect(back).not.toBeNull();
    expect(back!.bid).toBeGreaterThan(offer!.bid); // il rilancio è vero
    expect(back!.fromClubId).toBe(offer!.fromClubId); // ed è lo stesso club
  });

  it('a full season + offseason with the new market keeps the world healthy', () => {
    const world = generateWorld(createRng(37));
    const club = [...world.clubs.values()][0]!;
    const league = leagueOfClub(world, club.id);
    const season = createSeason(world, league, YEAR, 37 + YEAR);
    const before = world.players.size;
    simulateSeason(world, season, createRng(37 + YEAR));
    const standings = new Map([[league.id, seasonStandings(world, season)]]);
    for (const other of world.leagues) {
      if (other.id === league.id) continue;
      const os = createSeason(world, other, YEAR, 37 + YEAR + other.tier * 7);
      simulateSeason(world, os, createRng(37 + YEAR + other.tier * 7));
      standings.set(other.id, seasonStandings(world, os));
    }
    advanceOffseason(world, standings, createRng(999), YEAR + 1);
    expect(world.players.size).toBeGreaterThanOrEqual(before);
    expect(world.players.size).toBeLessThanOrEqual(before + 60);
    for (const c of world.clubs.values()) {
      expect(c.playerIds.length).toBeGreaterThanOrEqual(20);
      expect(c.playerIds.length).toBeLessThanOrEqual(28);
    }
  });
});
