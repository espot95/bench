import { describe, expect, it } from 'vitest';
import { playerOverall } from '../core/ratings.js';
import {
  COMMERCIALS,
  commercialSeasonIncome,
  defaultStadium,
  stadiumCapacity,
} from '../core/stadium.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { createRunner, createSeason } from './season.js';
import {
  STADIUM_BUILD,
  fanDensityAt,
  fanNamingProposal,
  fanZones,
  quoteProject,
  renameSector,
  sectorName,
  setStadiumActivityPrice,
  setStructurePrice,
  setTicketPrice,
  startProject,
  tickStadiumProjects,
  ticketFactors,
} from './stadium.js';

describe('stadio componibile (MODULE_STADIUM)', () => {
  it('la capienza è derivata dai settori e la worldgen resta nelle bande 8k-63k', () => {
    const world = generateWorld(createRng(7));
    for (const club of world.clubs.values()) {
      const cap = stadiumCapacity(club);
      expect(cap).toBeGreaterThanOrEqual(7900);
      expect(cap).toBeLessThanOrEqual(63500);
      expect(club.stadium.pitch).toBe('erba');
      // Angoli solo nei grandi impianti.
      if (cap < 40000) expect(club.stadium.sectors.angoloNE.seats).toBe(0);
    }
  });

  it('un cantiere di espansione scala la cassa, dura N giornate e aggiunge posti', () => {
    const world = generateWorld(createRng(7));
    const club = [...world.clubs.values()][0]!;
    club.finances.cash = 500_000_000; // sblocca il vincolo hard
    const before = stadiumCapacity(club);
    const cashBefore = club.finances.cash;

    const res = startProject(
      world,
      club,
      { kind: 'espansione', target: 'curvaNord', seats: 2000 },
      2026,
    );
    expect(res.ok).toBe(true);
    expect(club.stadium.project?.matchdaysLeft).toBe(2);
    expect(cashBefore - club.finances.cash).toBe(
      Math.round(
        2000 *
          STADIUM_BUILD.EXPANSION_PER_SEAT *
          (club.stadium.sectors.curvaNord.covered ? STADIUM_BUILD.EXPANSION_COVERED_MULT : 1),
      ),
    );
    // Un solo cantiere alla volta.
    expect(startProject(world, club, { kind: 'terreno' }, 2026).ok).toBe(false);

    tickStadiumProjects(world, [club.id]);
    expect(stadiumCapacity(club)).toBe(before); // ancora in cantiere
    tickStadiumProjects(world, [club.id]);
    expect(club.stadium.project).toBeUndefined();
    expect(stadiumCapacity(club)).toBe(before + 2000);
  });

  it('vincolo hard: senza cassa il presidente non apre il cantiere', () => {
    const world = generateWorld(createRng(7));
    const club = [...world.clubs.values()][0]!;
    club.finances.cash = 0;
    const res = startProject(
      world,
      club,
      { kind: 'espansione', target: 'curvaNord', seats: 1000 },
      2026,
    );
    expect(res.ok).toBe(false);
  });

  it('requisiti commerciali: centro commerciale solo ≥40k, una sola volta', () => {
    const world = generateWorld(createRng(7));
    const clubs = [...world.clubs.values()];
    const small = clubs.find((c) => stadiumCapacity(c) < 40000)!;
    expect(quoteProject(small, { kind: 'commerciale', commercial: 'centroCommerciale' }).ok).toBe(
      false,
    );

    const big = clubs.find((c) => stadiumCapacity(c) >= 40000)!;
    big.finances.cash = 1_000_000_000;
    expect(
      startProject(world, big, { kind: 'commerciale', commercial: 'centroCommerciale' }, 2026).ok,
    ).toBe(true);
    for (let i = 0; i < STADIUM_BUILD.COMMERCIAL_DAYS; i++) tickStadiumProjects(world, [big.id]);
    expect(big.stadium.commercial).toContain('centroCommerciale');
    expect(quoteProject(big, { kind: 'commerciale', commercial: 'centroCommerciale' }).ok).toBe(
      false,
    );
  });

  it("l'anello superiore aumenta i posti del 60% e i ricavi commerciali sono >0 dopo la costruzione", () => {
    const world = generateWorld(createRng(7));
    const club = [...world.clubs.values()][0]!;
    club.finances.cash = 1_000_000_000;
    const sec = club.stadium.sectors.principale;
    const seats = sec.seats;
    const tiersBefore = sec.tiers;
    expect(startProject(world, club, { kind: 'anello', target: 'principale' }, 2026).ok).toBe(
      tiersBefore < 3,
    );
    if (tiersBefore < 3) {
      for (let i = 0; i < STADIUM_BUILD.TIER_DAYS; i++) tickStadiumProjects(world, [club.id]);
      expect(club.stadium.sectors.principale.seats).toBe(Math.round(seats * 1.6));
    }

    expect(commercialSeasonIncome(club, 0.8)).toBe(0);
    club.stadium.commercial.push('bar');
    expect(commercialSeasonIncome(club, 0.8)).toBeGreaterThan(0);
  });

  it('i cantieri avanzano con le giornate simulate dal runner', () => {
    const world = generateWorld(createRng(11));
    const league = world.leagues[0]!;
    const club = world.clubs.get(league.clubIds[0]!)!;
    club.finances.cash = 500_000_000;
    startProject(world, club, { kind: 'espansione', target: 'curvaSud', seats: 5000 }, 2026);
    const days = club.stadium.project!.matchdaysLeft;
    const season = createSeason(world, league, 2026, 11);
    const runner = createRunner(world, season, createRng(11));
    for (let i = 0; i < days; i++) runner.playRound();
    expect(club.stadium.project).toBeUndefined();
  });

  it('struttura in città: si costruisce nel punto scelto e rende a fine cantiere', () => {
    const world = generateWorld(createRng(7));
    const club = [...world.clubs.values()][0]!;
    club.finances.cash = 500_000_000;
    const res = startProject(
      world,
      club,
      { kind: 'struttura', structure: 'negozio', dx: 0.01, dy: -0.004 },
      2026,
    );
    expect(res.ok).toBe(true);
    expect(club.stadium.project?.structure).toBe('negozio');
    for (let i = 0; i < STADIUM_BUILD.STRUCTURE_DAYS; i++) tickStadiumProjects(world, [club.id]);
    expect(club.structures).toEqual([{ id: 'negozio', dx: 0.01, dy: -0.004 }]);
    // Una sola per tipo; il ricavo entra nel canale commerciale unificato.
    expect(quoteProject(club, { kind: 'struttura', structure: 'negozio', dx: 0, dy: 0 }).ok).toBe(
      false,
    );
    expect(commercialSeasonIncome(club, 0.8)).toBeGreaterThan(0);
  });

  it('zone di tifo: deterministiche, densità in [0,1], il luogo e il prezzo cambiano il ricavo', () => {
    const world = generateWorld(createRng(7));
    const club = [...world.clubs.values()][0]!;
    const zones = fanZones(club.name, club.reputation);
    expect(zones.length).toBeGreaterThanOrEqual(4);
    expect(zones).toEqual(fanZones(club.name, club.reputation)); // stabile
    const hot = zones[0]!; // quartiere storico, peso 1
    const dHot = fanDensityAt(club.name, club.reputation, hot.dx, hot.dy);
    const dFar = fanDensityAt(club.name, club.reputation, 0.5, 0.5);
    expect(dHot).toBeGreaterThan(0.6);
    expect(dFar).toBeLessThan(0.05);
    expect(dHot).toBeLessThanOrEqual(1);

    // Stessa struttura: nel cuore del tifo rende più che in periferia.
    club.structures = [{ id: 'negozio', dx: hot.dx, dy: hot.dy }];
    const inHot = commercialSeasonIncome(club, 0.8);
    club.structures = [{ id: 'negozio', dx: 0.5, dy: 0.5 }];
    const inFar = commercialSeasonIncome(club, 0.8);
    expect(inHot).toBeGreaterThan(inFar * 1.5);

    // Prezzi: nel cuore del tifo il premium batte lo standard, che batte il popolare.
    club.structures = [{ id: 'negozio', dx: hot.dx, dy: hot.dy, price: 'premium' }];
    const premium = commercialSeasonIncome(club, 0.8);
    club.structures[0]!.price = 'popolare';
    const popolare = commercialSeasonIncome(club, 0.8);
    expect(premium).toBeGreaterThan(inHot);
    expect(popolare).toBeLessThan(inHot);
    expect(setStructurePrice(club, 'museo', 'premium').ok).toBe(false);
  });

  it('prezzi dello stadio: biglietteria muove incasso+riempimento, attività premium paga a stadio pieno', () => {
    const world = generateWorld(createRng(7));
    const club = [...world.clubs.values()][0]!;
    // Biglietteria: fattori coerenti col MODULE §3.2.
    expect(ticketFactors('popolare')).toEqual({ gate: 0.7, fillDelta: 0.08 });
    expect(ticketFactors(undefined)).toEqual({ gate: 1, fillDelta: 0 });
    expect(ticketFactors('premium').gate).toBeGreaterThan(1);
    expect(ticketFactors('premium').fillDelta).toBeLessThan(0);
    setTicketPrice(club, 'premium');
    expect(club.stadium.ticketPrice).toBe('premium');

    // Attività dello stadio: premium > standard a stadio pieno, < standard a stadio vuoto.
    club.stadium.commercial.push('bar');
    const std = commercialSeasonIncome(club, 0.95);
    expect(setStadiumActivityPrice(club, 'bar', 'premium').ok).toBe(true);
    expect(commercialSeasonIncome(club, 0.95)).toBeGreaterThan(std);
    const premiumEmpty = commercialSeasonIncome(club, 0.3);
    expect(setStadiumActivityPrice(club, 'bar', 'standard').ok).toBe(true);
    expect(premiumEmpty).toBeLessThan(commercialSeasonIncome(club, 0.3));
    // Non costruita → rifiuto.
    expect(setStadiumActivityPrice(club, 'teatro', 'premium').ok).toBe(false);
  });

  it('otto settori ampliabili, rinomina e proposta della curva (MODULE §3.3)', () => {
    const world = generateWorld(createRng(7));
    const club = [...world.clubs.values()][0]!;
    club.finances.cash = 500_000_000;

    // Gli angoli (Distinti NE/NO/SE/SO) si espandono liberamente, senza vincolo catino.
    const cornerBefore = club.stadium.sectors.angoloNE.seats;
    expect(quoteProject(club, { kind: 'espansione', target: 'angoloNE', seats: 2000 }).ok).toBe(
      true,
    );
    expect(
      startProject(world, club, { kind: 'espansione', target: 'angoloNE', seats: 2000 }, 2026).ok,
    ).toBe(true);
    for (let i = 0; i < 2; i++) tickStadiumProjects(world, [club.id]);
    expect(club.stadium.sectors.angoloNE.seats).toBe(cornerBefore + 2000);

    // Nomi: default parlante, rinomina valida, rifiuto se troppo corto.
    expect(sectorName(club.stadium, 'angoloNE')).toBe('Distinti Nord-Est');
    expect(renameSector(club, 'curvaNord', 'Curva Fossa dei Leoni').ok).toBe(true);
    expect(sectorName(club.stadium, 'curvaNord')).toBe('Curva Fossa dei Leoni');
    expect(renameSector(club, 'curvaSud', 'X').ok).toBe(false);

    // Proposta della curva: SOLO per una vera bandiera (MODULE §3.3 rivisto).
    for (const pid of club.playerIds) {
      const p = world.players.get(pid)!;
      p.clubSeasons = 0;
      p.titlesWithClub = 0;
      p.bigSeasons = 0;
    }
    expect(fanNamingProposal(world, club, createRng(5))).toBeNull();

    const star = club.playerIds
      .map((id) => world.players.get(id)!)
      .sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;
    // La sola permanenza non basta: servono meriti.
    star.clubSeasons = 8;
    star.bigSeasons = 2;
    expect(fanNamingProposal(world, club, createRng(5))).toBeNull();
    // Bandiera vera: 8 stagioni e un titolo → la curva si muove.
    star.titlesWithClub = 1;
    const prop = fanNamingProposal(world, club, createRng(5));
    expect(prop).not.toBeNull();
    expect(prop!.hero).toBe(star.name);
    expect(prop!.sector).toBe('curvaSud'); // la Nord è già battezzata sopra
    expect(prop!.reason).toContain('8 stagioni');
    expect(fanNamingProposal(world, club, createRng(5))).toEqual(prop);
  });

  it('il catalogo commerciale è coerente col MODULE (7 attività)', () => {
    expect(COMMERCIALS).toHaveLength(7);
    expect(defaultStadium(70000).sectors.principale.tiers).toBe(3);
    expect(defaultStadium(500).pitch).toBe('terra');
  });
});
