/**
 * Sessione UI ↔ file di salvataggio. Guscio: tutto il formato vive nel codec puro;
 * qui si legge solo l'orologio e si riassembla il runner dallo snapshot.
 */

import { leagueOfClub } from '../../../src/core/types';
import { createRunner } from '../../../src/engine/season';
import { type SaveFile, decodeSave, encodeSave } from '../../../src/persistence/codec';
import { createRng } from '../../../src/rng/rng';
import { type GameSession, createOtherLeagues } from '../game';

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
      renewal: s.renewal,
      renewalNotes: s.renewalNotes,
      promises: s.promises,
      rejectedOffers: s.rejectedOffers,
      observations: s.observations,
      sponsorOffers: s.sponsorOffers,
      cups: s.cups,
      summer: s.summer,
      concertOffers: s.concertOffers,
      negotiations: s.negotiations,
      empireHistory: s.empireHistory,
      financeHistory: s.financeHistory,
      missions: s.missions,
      territoryPins: s.territoryPins,
      influenceHistory: s.influenceHistory,
      dsReminders: s.dsReminders,
      grass: s.grass,
      watering: s.watering,
      day: s.day,
      calls: s.calls,
      installmentsDue: s.installmentsDue,
      annals: s.annals,
      academy: s.academy,
      academyGrads: s.academyGrads,
      board: s.board,
      boardPresets: s.boardPresets,
      plan: s.plan,
      // G4 — IL MONDO CHE GIOCA: le altre divisioni si salvano come la tua
      // (stagione + snapshot): le loro mutazioni sono già nel mondo, al load
      // si RIPRENDE, niente replay.
      otherLeagues: (s.others ?? []).map((o) => ({
        season: o.season,
        runner: o.runner.snapshot(),
      })),
      careerStats: s.careerStats,
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
  const { otherLeagues, ...extras } = d.session;
  const s: GameSession = {
    world: d.world,
    club: d.club,
    season: d.season,
    runner,
    year: d.meta.year,
    seed: d.meta.seed,
    ...extras,
  };
  if (otherLeagues && otherLeagues.length > 0) {
    // G4: le altre divisioni RIPRENDONO dai loro snapshot (mutazioni già nel mondo).
    s.others = otherLeagues.map((o) => ({
      season: o.season,
      runner: createRunner(d.world, o.season, createRng(0), {
        resume: o.runner,
        protectedClubId: d.club.id,
      }),
    }));
  } else {
    // Salvataggi vecchi: il mondo di allora non ha mai visto le altre divisioni
    // giocare in-season — si creano ORA e recuperano le giornate passate (le
    // mutazioni arrivano una volta sola, come arrivavano in blocco a giugno).
    createOtherLeagues(s);
    const target = runner.nextRound();
    for (const o of s.others ?? [])
      while (!o.runner.isFinished() && o.runner.nextRound() < target) o.runner.playRound();
  }
  return s;
}

/** Nome proposto per un salvataggio manuale. */
export function suggestedName(s: GameSession): string {
  const next = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const where = next > total ? 'fine stagione' : `g.${next}`;
  return `${s.club.name} · ${s.year}/${String(s.year + 1).slice(2)} · ${where}`;
}
