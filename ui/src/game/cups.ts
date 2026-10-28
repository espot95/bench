/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { nationOfClub } from '../../../src/core/types';

import type { GameSession } from '../game';

// ---------------------------------------------------------------------------
// Coppe nazionali (MODULE_CUPS): il tabellone per la UI.
// ---------------------------------------------------------------------------

export function cupView(s: GameSession) {
  const myNation = nationOfClub(s.world, s.club.id)?.code;
  const n = (id: string) => s.world.clubs.get(id as never)?.name ?? '—';
  return (s.cups ?? [])
    .filter((cup) => cup.nationCode === myNation)
    .map((cup) => {
      // Eliminato se ha perso un tie; in attesa se testa di serie non ancora entrata.
      let out = false;
      for (const stage of cup.stages) {
        for (const t of stage.ties) {
          if (
            t.played &&
            (t.homeClubId === s.club.id || t.awayClubId === s.club.id) &&
            t.winnerId !== s.club.id
          )
            out = true;
        }
      }
      const status =
        cup.winnerId === s.club.id
          ? 'vinta'
          : out
            ? 'eliminati'
            : cup.winnerId
              ? 'conclusa'
              : 'in corsa';
      return {
        id: cup.id,
        name: cup.name,
        status,
        winner: cup.winnerId ? n(cup.winnerId) : null,
        stages: cup.stages
          .filter((st) => st.ties.length > 0)
          .map((st) => ({
            name: st.name,
            ties: st.ties.map((t) => ({
              home: n(t.homeClubId),
              away: n(t.awayClubId),
              score: t.played
                ? `${t.homeGoals}-${t.awayGoals}${t.shootout ? ` (${t.shootout.home}-${t.shootout.away} dcr)` : ''}`
                : '—',
              mine: t.homeClubId === s.club.id || t.awayClubId === s.club.id,
            })),
          })),
        nextStage: cup.stages[cup.next]
          ? { name: cup.stages[cup.next]!.name, afterRound: cup.stages[cup.next]!.afterRound }
          : null,
      };
    });
}

// ---------------------------------------------------------------------------
// Sponsor (MODULE_SPONSORS): la vista dei 4 slot e la firma delle offerte.
// ---------------------------------------------------------------------------
