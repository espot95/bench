import { describe, expect, it } from 'vitest';
import { captainBonusMode, neutralPersonality, personalityLabel } from '../core/personality.js';
import type { Personality, Player } from '../core/types.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng } from '../rng/rng.js';
import { type Fielded, matchStrength, naturalFielded } from './lineup.js';

function player(
  overrides: Omit<Partial<Player>, 'personality'> & { personality?: Partial<Personality> } = {},
): Player {
  const { personality, ...rest } = overrides;
  return {
    id: 'p' as never,
    name: 'X',
    age: 25,
    nationality: 'ITA',
    position: 'MF',
    preferredFoot: 'R',
    attributes: {
      pace: 60,
      stamina: 60,
      strength: 60,
      workRate: 60,
      positioning: 60,
      decisions: 60,
      composure: 60,
      finishing: 60,
      passing: 60,
      tackling: 60,
      dribbling: 60,
      marking: 60,
    },
    potential: 70,
    injuryProneness: 0.5,
    morale: 0.5,
    contractId: null,
    ...rest,
    personality: { ...neutralPersonality(), ...personality },
  };
}

describe('personalityLabel', () => {
  it('labels clusters and defaults to average', () => {
    expect(
      personalityLabel(player({ personality: { professionalism: 0.9, determination: 0.9 } })),
    ).toBe('Professionista modello');
    expect(personalityLabel(player({ potential: 85, personality: { professionalism: 0.1 } }))).toBe(
      'Talento sregolato',
    );
    expect(personalityLabel(player({ personality: { consistency: 0.1 } }))).toBe('Discontinuo');
    expect(personalityLabel(player({ personality: { ambition: 0.9, loyalty: 0.1 } }))).toBe(
      'Mercenario',
    );
    expect(personalityLabel(player({}))).toBe('Nella media');
  });
});

describe('social axis (SPEC §11.10)', () => {
  it('labels the extrovert leader, silent pro, party animal and divergent', () => {
    expect(personalityLabel(player({ personality: { socialita: 0.9, leadership: 0.9 } }))).toBe(
      'Trascinatore',
    );
    expect(
      personalityLabel(player({ personality: { socialita: 0.1, professionalism: 0.9 } })),
    ).toBe('Silenzioso professionista');
    expect(personalityLabel(player({ personality: { socialita: 0.9, determination: 0.1 } }))).toBe(
      'Anima della festa',
    );
    expect(personalityLabel(player({ personality: { divergente: true, temperament: 0.9 } }))).toBe(
      'Testa calda',
    );
    expect(
      personalityLabel(
        player({ personality: { divergente: true, temperament: 0.4, determination: 0.6 } }),
      ),
    ).toBe('Spirito libero');
  });

  it('chooses the captain-bonus propagation mode from sociability', () => {
    expect(captainBonusMode(player({ personality: { socialita: 0.8 } }))).toBe('diffused');
    expect(captainBonusMode(player({ personality: { socialita: 0.2 } }))).toBe('local');
  });

  it('generates a centred sociability and a rare, independent divergent flag', () => {
    const world = generateWorld(createRng(5));
    const players = [...world.players.values()];
    const soc = players.map((p) => p.personality.socialita);
    const share = (pred: (v: number) => boolean) => soc.filter(pred).length / soc.length;
    expect(share((v) => v > 0.35 && v < 0.65)).toBeGreaterThan(0.45);

    const divergentShare = players.filter((p) => p.personality.divergente).length / players.length;
    expect(divergentShare).toBeGreaterThan(0.01);
    expect(divergentShare).toBeLessThan(0.08);
  });
});

describe('trait generation', () => {
  it('produces a centred distribution (mass in the middle, rare extremes)', () => {
    const world = generateWorld(createRng(1));
    const pros = [...world.players.values()].map((p) => p.personality.professionalism);
    const share = (pred: (v: number) => boolean) => pros.filter(pred).length / pros.length;
    expect(share((v) => v > 0.35 && v < 0.65)).toBeGreaterThan(0.45); // centred mass
    expect(share((v) => v > 0.9 || v < 0.1)).toBeLessThan(0.06); // rare extremes
  });

  it('most players are labelled "Nella media"', () => {
    const world = generateWorld(createRng(2));
    const labels = [...world.players.values()].map((p) => personalityLabel(p));
    const avg = labels.filter((l) => l === 'Nella media').length / labels.length;
    expect(avg).toBeGreaterThan(0.4);
    expect(
      labels.filter((l) => l === 'Professionista modello').length / labels.length,
    ).toBeLessThan(0.15);
  });
});

describe('matchStrength — consistency', () => {
  it('an inconsistent side swings more match-to-match than a consistent one', () => {
    const world = generateWorld(createRng(3));
    const club = [...world.clubs.values()][0]!;
    const fielded: Fielded = naturalFielded(club, world);

    const consistent: Fielded = {
      ...fielded,
      players: fielded.players.map((p) => ({
        ...p,
        personality: { ...p.personality, consistency: 0.98 },
      })),
      entries: fielded.entries.map((e) => ({
        ...e,
        player: { ...e.player, personality: { ...e.player.personality, consistency: 0.98 } },
      })),
    };
    const erratic: Fielded = {
      ...fielded,
      players: fielded.players.map((p) => ({
        ...p,
        personality: { ...p.personality, consistency: 0.02 },
      })),
      entries: fielded.entries.map((e) => ({
        ...e,
        player: { ...e.player, personality: { ...e.player.personality, consistency: 0.02 } },
      })),
    };

    const stdOf = (f: Fielded) => {
      const rng = createRng(42);
      const xs = Array.from({ length: 400 }, () => matchStrength(f, rng).attack);
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };

    expect(stdOf(erratic)).toBeGreaterThan(stdOf(consistent) * 3);
  });
});

describe('matchStrength — captain (leadership)', () => {
  it('a strong captain lifts the team ratings measurably', () => {
    const world = generateWorld(createRng(4));
    const club = [...world.clubs.values()][0]!;
    const base: Fielded = naturalFielded(club, world);

    const withCaptain = (leadership: number): Fielded => ({
      ...base,
      players: base.players.map((p, i) => ({
        ...p,
        personality: { ...p.personality, leadership: i === 0 ? leadership : 0.2 },
      })),
      entries: base.entries.map((e, i) => ({
        ...e,
        player: {
          ...e.player,
          personality: { ...e.player.personality, leadership: i === 0 ? leadership : 0.2 },
        },
      })),
    });

    // No consistency noise: give everyone consistency 1 so we isolate the captain effect.
    const still = (f: Fielded): Fielded => ({
      ...f,
      entries: f.entries.map((e) => ({
        ...e,
        player: { ...e.player, personality: { ...e.player.personality, consistency: 1 } },
      })),
    });

    const strong = matchStrength(still(withCaptain(0.95)), createRng(1)).attack;
    const weak = matchStrength(still(withCaptain(0.2)), createRng(1)).attack;
    expect(strong).toBeGreaterThan(weak);
  });
});
