/**
 * Sessione UI ↔ file di salvataggio. Guscio: tutto il formato vive nel codec puro;
 * qui si legge solo l'orologio e si riassembla il runner dallo snapshot.
 */

import { leagueOfClub } from '../../../src/core/types';
import { createRunner } from '../../../src/engine/season';
import { type SaveFile, decodeSave, encodeSave } from '../../../src/persistence/codec';
import { createRng } from '../../../src/rng/rng';
import type { GameSession } from '../game';

export function sessionToSave(s: GameSession, name: string): SaveFile {
  return encodeSave({
    world: s.world,
    club: s.club,
    season: s.season,
    runner: s.runner.snapshot(),
    session: {
      naming: s.naming,
      namingSeason: s.namingSeason,
      offers: s.offers,
      news: s.news,
      shortlist: s.shortlist,
      preDeals: s.preDeals,
      lastTripRound: s.lastTripRound,
      negotiation: s.negotiation,
      offseason: s.offseason,
    },
    name,
    seed: s.seed,
    year: s.year,
    leagueName: leagueOfClub(s.world, s.club.id).name,
    savedAt: new Date().toISOString(),
  });
}

export function saveToSession(file: SaveFile): GameSession {
  const d = decodeSave(file);
  const runner = createRunner(d.world, d.season, createRng(0), { resume: d.runner });
  return {
    world: d.world,
    club: d.club,
    season: d.season,
    runner,
    year: d.meta.year,
    seed: d.meta.seed,
    ...d.session,
  };
}

/** Nome proposto per un salvataggio manuale. */
export function suggestedName(s: GameSession): string {
  const next = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const where = next > total ? 'fine stagione' : `g.${next}`;
  return `${s.club.name} · ${s.year}/${String(s.year + 1).slice(2)} · ${where}`;
}
