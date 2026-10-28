/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { playableRoles, playerArchetype } from '../../../src/core/archetypes';
import { runningStyle } from '../../../src/core/physique';
import { bestAssignment } from '../../../src/engine/lineup';
import { spendingRoom } from '../../../src/finances/treasury';
import { NEGOTIATION } from '../../../src/market/negotiation';
import { gazzetta, refreshTreasury } from './shared';

import type { Player } from '../../../src/core/types';
import {
  ACADEMY,
  academyIntake,
  levelSpec,
  promoteProspect,
  scoutJudgment,
  sellProspectDeal,
  sendOnLoan,
  youthOffers,
} from '../../../src/engine/academy';
import type { GameSession } from '../game';
import { abilityAxes } from './tactics';

// ---- SETTORE GIOVANILE (F4b): accademia, Primavera, giudizi, promozioni ----

/** La vista dell'accademia: livello, costi, la Primavera coi giudizi parlati. */
export function academyView(s: GameSession) {
  const a = s.academy;
  const first = ACADEMY.LEVELS[0]!;
  if (!a) {
    return {
      built: false as const,
      buildCost: first.cost,
      annual: first.annual,
      intake: first.intake,
    };
  }
  const spec = levelSpec(a.level);
  const next = a.level < ACADEMY.LEVELS.length ? ACADEMY.LEVELS[a.level]! : null;
  const squadRoom = NEGOTIATION.SQUAD_CAP - s.club.playerIds.length;
  return {
    built: true as const,
    level: a.level,
    maxLevel: ACADEMY.LEVELS.length,
    annual: spec.annual,
    intake: spec.intake,
    upgrade: next ? { cost: next.cost, annual: next.annual, intake: next.intake } : null,
    squadRoom,
    leaveAge: ACADEMY.LEAVE_AGE,
    prospects: [...a.prospects]
      .sort((x, y) => y.player.age - x.player.age)
      .map((pr) => {
        const p = pr.player;
        const j = scoutJudgment(pr, s.year);
        return {
          id: p.id as string,
          name: p.name,
          age: p.age,
          nationality: p.nationality,
          role: playableRoles(p).primary,
          archetype: playerArchetype(p).label,
          running: runningStyle(p).label,
          judgment: j.label,
          confidence: j.confidence,
          yearsIn: Math.max(0, s.year - pr.joinedYear),
          minutes: pr.minutes ?? null,
          loan: pr.loan?.clubName ?? null,
          canLoan: pr.loan === undefined && p.age >= ACADEMY.LOAN_MIN_AGE,
          axes: abilityAxes(p),
        };
      }),
    /** G2: le offerte AI dell'anno per i gioielli (ignorarle = tenerli). */
    offers: youthOffers(s.world, s.club, a, s.year),
    /** G2: com'è andata l'ultima Primavera. */
    primavera: a.lastPrimavera ?? null,
    /** G3: le bandiere cresciute in casa. */
    bandiere: (s.academyGrads ?? [])
      .filter((g) => g.bandiera)
      .map((g) => ({ name: g.name, promotedYear: g.promotedYear })),
  };
}

/** Fonda l'accademia (livello 1) o la porta al livello successivo. */
export function investInAcademy(s: GameSession): string {
  const nextLevel = (s.academy?.level ?? 0) + 1;
  if (nextLevel > ACADEMY.LEVELS.length) return "L'accademia è già al massimo.";
  const spec = ACADEMY.LEVELS[nextLevel - 1]!;
  if (spendingRoom(s.world, s.club, s.year) < spec.cost)
    return 'Non c’è margine in cassa (nemmeno col fido) per il cantiere.';
  s.club.finances.cash -= spec.cost;
  s.club.finances.expenses.push({
    type: 'giovanile',
    amount: spec.cost,
    year: s.year,
    note: `accademia: livello ${nextLevel}`,
  });
  if (!s.academy) {
    s.academy = { level: 1, builtYear: s.year, prospects: [] };
    // La prima classe arriva subito: l'accademia apre coi ragazzi dentro.
    const classe = academyIntake(s.world, s.club, s.academy, s.year);
    refreshTreasury(s);
    gazzetta(
      s,
      0,
      `Nasce il SETTORE GIOVANILE: aprono i cancelli dell'accademia, prima classe di ${classe.length} ragazzi.`,
    );
    return `Accademia fondata: ${classe.length} ragazzi della classe ${s.year} già al lavoro.`;
  }
  s.academy.level = nextLevel;
  refreshTreasury(s);
  gazzetta(
    s,
    0,
    `Il settore giovanile cresce: accademia al livello ${nextLevel} — più campi, più occhi, più classe.`,
  );
  return `Accademia al livello ${nextLevel}.`;
}

/** Promuove un ragazzo in prima squadra: Player vero, cresciuto nel club. */
export function promoteYouth(s: GameSession, prospectId: string): string {
  if (!s.academy) return "Prima serve l'accademia.";
  const player = promoteProspect(
    s.world,
    s.club,
    s.academy,
    prospectId,
    s.year,
    NEGOTIATION.SQUAD_CAP,
  );
  if (!player)
    return s.club.playerIds.length >= NEGOTIATION.SQUAD_CAP
      ? 'Rosa piena: serve spazio prima di promuovere.'
      : 'Il ragazzo non è più in accademia.';
  s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
  // G3: il registro dei promossi — tra qualche anno, la bandiera.
  s.academyGrads = [
    ...(s.academyGrads ?? []),
    { playerId: player.id as string, name: player.name, promotedYear: s.year },
  ];
  refreshTreasury(s);
  gazzetta(
    s,
    0,
    `DAL VIVAIO: ${player.name} (${player.age} anni) sale in prima squadra — cresciuto in casa, la curva lo aspettava.`,
  );
  return `${player.name} è in prima squadra.`;
}

/** G2 — Prestito formativo: un anno a farsi le ossa in una provinciale. */
export function loanYouth(s: GameSession, prospectId: string): string {
  if (!s.academy) return "Prima serve l'accademia.";
  const res = sendOnLoan(s.world, s.club, s.academy, prospectId, s.year);
  if (!res) return 'Il ragazzo non può partire (età, o è già in prestito).';
  const name = s.academy.prospects.find((p) => (p.player.id as string) === prospectId)?.player.name;
  gazzetta(
    s,
    0,
    `${name ?? 'Un ragazzo del vivaio'} va a farsi le ossa: prestito formativo al ${res.clubName}. Si rivedrà in estate.`,
  );
  return `In prestito al ${res.clubName}: torna la prossima estate, cresciuto (si spera).`;
}

/** G2 — Vende il gioiello all'offerente: plusvalenza pura, curva ferita. */
export function sellYouth(s: GameSession, prospectId: string): string {
  if (!s.academy) return "Prima serve l'accademia.";
  const offer = youthOffers(s.world, s.club, s.academy, s.year).find(
    (o) => o.prospectId === prospectId,
  );
  if (!offer) return 'Nessuna offerta sul tavolo per questo ragazzo.';
  const name = sellProspectDeal(s.club, s.academy, offer, s.year);
  if (!name) return 'Il ragazzo non è più in accademia.';
  // La piazza non perdona chi vende il futuro (morde i rinnovi abbonamenti).
  if (s.club.marketing) {
    const hit = offer.judgment === 'predestinato' ? 0.08 : 0.04;
    s.club.marketing.lastSatisfaction = Math.max(
      0,
      (s.club.marketing.lastSatisfaction ?? 0.5) - hit,
    );
  }
  refreshTreasury(s);
  gazzetta(
    s,
    0,
    `VENDUTO IL GIOIELLO: ${name} al ${offer.bidderName} per ${(offer.fee / 1e6).toFixed(1)}M — plusvalenza pura, ma la curva parla di futuro svenduto.`,
  );
  return `${name} ceduto per ${(offer.fee / 1e6).toFixed(1)}M (tutta plusvalenza). I tifosi non l'hanno presa bene.`;
}
