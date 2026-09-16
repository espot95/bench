import { describe, expect, it } from 'vitest';
import type { CoachStyle } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { type GrassLength, type Watering, createRunner, createSeason } from './season.js';

const YEAR = 2026;

describe('manto erboso (MODULE_STADIUM)', () => {
  /** Gioca la 1ª giornata con stili forzati sulla gara-campione e l'erba scelta. */
  const roundOf = (
    seasonSeed: number,
    homeStyle: CoachStyle,
    awayStyle: CoachStyle,
    grass: GrassLength | null,
  ) => {
    const w = generateWorld(createRng(96));
    const l = w.leagues[0]!;
    const s = createSeason(w, l, YEAR, seasonSeed);
    const fixture = s.fixtures.find((m) => m.round === 1)!;
    const home = [...(w.managers?.values() ?? [])].find((m) => m.clubId === fixture.homeClubId);
    if (home) home.style = homeStyle;
    const away = [...(w.managers?.values() ?? [])].find((m) => m.clubId === fixture.awayClubId);
    if (away) away.style = awayStyle;
    const r = createRunner(w, s, createRng(seasonSeed), { aiMarket: false });
    if (grass) r.setGrass(fixture.homeClubId, grass);
    r.playRound();
    return s.fixtures
      .filter((m) => m.round === 1)
      .map((m) => `${m.homeGoals}-${m.awayGoals}`)
      .join(';');
  };

  it("l'erba media è bit-identica a nessuna scelta", () => {
    for (let seed = 970; seed < 976; seed++) {
      expect(roundOf(seed, 'possession', 'catenaccio', 'media')).toBe(
        roundOf(seed, 'possession', 'catenaccio', null),
      );
    }
  });

  it('bassa e alta spostano i risultati quando in campo ci sono palleggio o catenaccio', () => {
    let flippedShort = false;
    let flippedTall = false;
    for (let seed = 970; seed < 995 && !(flippedShort && flippedTall); seed++) {
      const base = roundOf(seed, 'possession', 'catenaccio', null);
      if (roundOf(seed, 'possession', 'catenaccio', 'bassa') !== base) flippedShort = true;
      if (roundOf(seed, 'possession', 'catenaccio', 'alta') !== base) flippedTall = true;
    }
    expect(flippedShort).toBe(true);
    expect(flippedTall).toBe(true);
  });

  it('con stili non interessati il manto non tocca nulla (bit-identico)', () => {
    for (let seed = 970; seed < 976; seed++) {
      expect(roundOf(seed, 'motivator', 'wings', 'alta')).toBe(
        roundOf(seed, 'motivator', 'wings', null),
      );
    }
  });

  /** Come roundOf, ma sull'IRRIGAZIONE. */
  const roundWater = (seasonSeed: number, water: Watering | null) => {
    const w = generateWorld(createRng(96));
    const l = w.leagues[0]!;
    const s = createSeason(w, l, YEAR, seasonSeed);
    const fixture = s.fixtures.find((m) => m.round === 1)!;
    const home = [...(w.managers?.values() ?? [])].find((m) => m.clubId === fixture.homeClubId);
    if (home) home.style = 'possession';
    const away = [...(w.managers?.values() ?? [])].find((m) => m.clubId === fixture.awayClubId);
    if (away) away.style = 'catenaccio';
    const r = createRunner(w, s, createRng(seasonSeed), { aiMarket: false });
    if (water) r.setWatering(fixture.homeClubId, water);
    r.playRound();
    return s.fixtures
      .filter((m) => m.round === 1)
      .map((m) => `${m.homeGoals}-${m.awayGoals}`)
      .join(';');
  };

  it("l'irrigazione normale è bit-identica; bagnato e asciutto spostano i risultati", () => {
    for (let seed = 970; seed < 974; seed++) {
      expect(roundWater(seed, 'normale')).toBe(roundWater(seed, null));
    }
    let flippedWet = false;
    let flippedDry = false;
    for (let seed = 970; seed < 1000 && !(flippedWet && flippedDry); seed++) {
      const base = roundWater(seed, null);
      if (roundWater(seed, 'bagnato') !== base) flippedWet = true;
      if (roundWater(seed, 'asciutto') !== base) flippedDry = true;
    }
    expect(flippedWet).toBe(true);
    expect(flippedDry).toBe(true);
  });

  it('lo snapshot porta con sé il manto; "media" rimuove la voce', () => {
    const w = generateWorld(createRng(96));
    const l = w.leagues[0]!;
    const s = createSeason(w, l, YEAR, 970);
    const r = createRunner(w, s, createRng(970), { aiMarket: false });
    const clubId = l.clubIds[0]!;
    r.setGrass(clubId, 'alta');
    expect(r.snapshot().grass).toEqual([[clubId, 'alta']]);
    r.setGrass(clubId, 'media');
    expect(r.snapshot().grass).toEqual([]);
    r.setWatering(clubId, 'bagnato');
    expect(r.snapshot().watering).toEqual([[clubId, 'bagnato']]);
    r.setWatering(clubId, 'normale');
    expect(r.snapshot().watering).toEqual([]);
  });
});
