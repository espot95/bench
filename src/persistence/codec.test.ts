import { describe, expect, it } from 'vitest';
import { leagueOfClub } from '../core/types.js';
import { bestAssignment } from '../engine/lineup.js';
import { createRunner, createSeason } from '../engine/season.js';
import { generateWorld } from '../generation/generate-world.js';
import { createRng, restoreRng } from '../rng/rng.js';
import {
  decodeSave,
  decodeWorld,
  encodeSave,
  encodeWorld,
  saveFromText,
  saveToText,
} from './codec.js';

const SEED = 4242;
const YEAR = 2026;

function freshCareer(seed = SEED) {
  const world = generateWorld(createRng(seed));
  const club = [...world.clubs.values()][3]!;
  const season = createSeason(world, leagueOfClub(world, club.id), YEAR, seed + YEAR);
  const runner = createRunner(world, season, createRng(seed + YEAR));
  runner.setLineup(club.id, bestAssignment(club, world));
  return { world, club, season, runner };
}

describe('RNG state round-trip', () => {
  it('a restored stream continues exactly where the original was', () => {
    const a = createRng(99);
    for (let i = 0; i < 37; i++) a.gaussian(0, 1); // leaves a Box-Muller spare in flight
    const b = restoreRng(JSON.parse(JSON.stringify(a.getState())));
    const seqA = [a.next(), a.gaussian(0, 1), a.poisson(2.5), a.int(1, 10), a.gaussian(5, 2)];
    const seqB = [b.next(), b.gaussian(0, 1), b.poisson(2.5), b.int(1, 10), b.gaussian(5, 2)];
    expect(seqB).toEqual(seqA);
  });
});

describe('save codec (persistence/codec)', () => {
  it('world survives encode → JSON text → decode deep-equal', () => {
    const world = generateWorld(createRng(SEED));
    const back = decodeWorld(JSON.parse(JSON.stringify(encodeWorld(world))));
    expect(back).toEqual(world);
    expect(back.players.size).toBe(world.players.size);
    // agencyId semantics preserved: undefined (libero) vs null (auto-rappresentato)
    const selfRep = [...world.players.values()].find((p) => p.agencyId === null);
    const free = [...world.players.values()].find((p) => p.agencyId === undefined);
    if (selfRep) expect(back.players.get(selfRep.id)?.agencyId).toBeNull();
    if (free) expect(back.players.get(free.id)?.agencyId).toBeUndefined();
  });

  it('saving mid-season is a no-op: the resumed season is byte-identical', () => {
    const live = freshCareer();
    const played = 9;
    for (let i = 0; i < played; i++) live.runner.playRound(live.club.id);

    // Save (through the text form, like the real shells do).
    const file = encodeSave({
      world: live.world,
      club: live.club,
      season: live.season,
      runner: live.runner.snapshot(),
      session: { shortlist: ['x'], news: [], negotiation: null },
      name: 'test',
      seed: SEED,
      year: YEAR,
      leagueName: 'L',
      savedAt: '2026-08-24T00:00:00.000Z',
    });
    const text = saveToText(file);
    expect(text.length).toBeLessThan(3_500_000);
    const loaded = decodeSave(saveFromText(text));
    expect(loaded.meta.round).toBe(played + 1);
    expect(loaded.session.shortlist).toEqual(['x']);
    expect(loaded.session.negotiation).toBeNull();

    const resumed = createRunner(loaded.world, loaded.season, createRng(0), {
      resume: loaded.runner,
    });
    expect(resumed.nextRound()).toBe(live.runner.nextRound());
    expect(loaded.season.status).toBe('in_progress');

    // Play the rest on BOTH branches, then compare everything that moves.
    while (!live.runner.isFinished()) {
      const a = live.runner.playRound(live.club.id);
      const b = resumed.playRound(loaded.club.id);
      expect(b.round).toBe(a.round);
      expect(b.marketNews).toEqual(a.marketNews);
      expect(b.offers).toEqual(a.offers);
      expect(b.injuries).toEqual(a.injuries);
    }
    expect(resumed.isFinished()).toBe(true);
    expect(loaded.season).toEqual(live.season);
    expect(loaded.world).toEqual(live.world);
  });

  it('resuming a finished season reports finished and rejects unknown versions', () => {
    const live = freshCareer(7);
    while (!live.runner.isFinished()) live.runner.playRound(live.club.id);
    const snap = JSON.parse(JSON.stringify(live.runner.snapshot()));
    const again = createRunner(live.world, live.season, createRng(0), { resume: snap });
    expect(again.isFinished()).toBe(true);
    expect(live.season.status).toBe('finished');

    expect(() => saveFromText('{"version":99}')).toThrow(/non è un salvataggio/);
    expect(() => saveFromText('nope')).toThrow(/JSON/);
  });
});
