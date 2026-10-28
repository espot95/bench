/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { playableRoles, playerArchetype } from '../../../src/core/archetypes';
import { playerHeight, runningStyle } from '../../../src/core/physique';
import { playerOverall, selectStartingXI } from '../../../src/core/ratings';
import { type Club, leagueOfClub } from '../../../src/core/types';
import { DUEL, duelThreat } from '../../../src/engine/duels';
import {
  type SlotAssignment,
  bestAssignment,
  validateAssignment,
} from '../../../src/engine/lineup';
import { moraleLabel } from '../../../src/engine/morale';
import {
  type SetPiecePlan,
  type TeamPlan,
  aerialDefence,
  aerialThreat,
  depthDanger,
} from '../../../src/engine/plan';
import { seasonStandings } from '../../../src/engine/season';
import { bandOf, starString } from '../band';
import { applyPlanToRunner } from './shared';

import type { PlayerId } from '../../../src/core/ids';
import type { Player, Position } from '../../../src/core/types';
import { COACH_STYLES, STYLE_KEYS, squadFit } from '../../../src/engine/coach-styles';
import type { GameSession } from '../game';

// ---- LAVAGNA TATTICA (richiesta utente): due fasi, pedine libere ----

export type BoardPhase = 'possesso' | 'difesa';

/** Il campo della lavagna è 360x520, attacco verso l'alto. Fasce di zona verticali. */
const BOARD = { W: 360, H: 520, GK_Y: 445, DF_Y: 330, MF_Y: 195 } as const;

function zoneOf(y: number): Position {
  if (y >= BOARD.GK_Y) return 'GK';
  if (y >= BOARD.DF_Y) return 'DF';
  if (y >= BOARD.MF_Y) return 'MF';
  return 'FW';
}

const BOARD_ROW_Y: Record<Position, number> = { GK: 478, DF: 382, MF: 258, FW: 128 };

/** Posizioni di default: righe per reparto dal modulo corrente. */
function defaultLayout(assignment: SlotAssignment): Record<string, { x: number; y: number }> {
  const byRow = new Map<Position, string[]>();
  for (const a of assignment)
    byRow.set(a.slot, [...(byRow.get(a.slot) ?? []), a.playerId as string]);
  const out: Record<string, { x: number; y: number }> = {};
  for (const [slot, ids] of byRow) {
    ids.forEach((id, idx) => {
      out[id] = { x: Math.round((BOARD.W * (idx + 1)) / (ids.length + 1)), y: BOARD_ROW_Y[slot] };
    });
  }
  return out;
}

function boardLayout(s: GameSession, phase: BoardPhase, assignment: SlotAssignment) {
  const stored = s.board?.[phase] ?? {};
  const def = defaultLayout(assignment);
  const out: Record<string, { x: number; y: number }> = {};
  for (const a of assignment) {
    const id = a.playerId as string;
    out[id] = stored[id] ?? def[id] ?? { x: 180, y: 300 };
  }
  return out;
}

const sideOf = (x: number): 'S' | 'C' | 'D' => (x < 130 ? 'S' : x > 230 ? 'D' : 'C');

/** Dove "vive" ogni ruolo fine sulla lavagna (zona, lato; X = qualsiasi lato). */
const ROLE_SPOTS: Record<string, [Position, 'S' | 'C' | 'D' | 'X'][]> = {
  POR: [['GK', 'X']],
  DC: [['DF', 'C']],
  TD: [['DF', 'D']],
  TS: [['DF', 'S']],
  REG: [['MF', 'C']],
  MED: [['MF', 'C']],
  MC: [['MF', 'X']],
  TRQ: [
    ['MF', 'C'],
    ['FW', 'C'],
  ],
  AD: [
    ['FW', 'D'],
    ['MF', 'D'],
  ],
  AS: [
    ['FW', 'S'],
    ['MF', 'S'],
  ],
  SP: [['FW', 'C']],
  PC: [['FW', 'C']],
};

/** Fit del punto: verde = casa sua, ambra = ci sta, rosso = snaturato. */
export function fitAt(p: Player, x: number, y: number): 'verde' | 'ambra' | 'rosso' {
  const zone = zoneOf(y);
  const side = sideOf(x);
  const { primary, others } = playableRoles(p);
  const roles = [primary, ...others];
  let zoneMatch = false;
  for (const r of roles) {
    for (const [z, sd] of ROLE_SPOTS[r] ?? []) {
      if (z !== zone) continue;
      zoneMatch = true;
      if (sd === 'X' || sd === side) return 'verde';
    }
  }
  if (zoneMatch || p.position === zone) return 'ambra';
  return 'rosso';
}

/** Il modulo letto dalle pedine di una fase (es. "3-4-3"), portiere escluso. */
function moduleOf(layout: Record<string, { x: number; y: number }>): string {
  let df = 0;
  let mf = 0;
  let fw = 0;
  for (const c of Object.values(layout)) {
    const z = zoneOf(c.y);
    if (z === 'DF') df++;
    else if (z === 'MF') mf++;
    else if (z === 'FW') fw++;
  }
  return `${df}-${mf}-${fw}`;
}

/** Radar delle ABILITÀ (senza numeri): 6 assi chiave, da portiere per i portieri. */
export function abilityAxes(p: Player): { label: string; pct: number; value: string }[] {
  const a = p.attributes as unknown as Record<string, number>;
  const v = (k: string) => Math.max(0, Math.min(100, a[k] ?? 50));
  const ax = (label: string, pct: number) => ({ label, pct, value: '' });
  if (p.position === 'GK')
    return [
      ax('Riflessi', v('reflexes')),
      ax('Presa', v('handling')),
      ax('Uscite', v('aerial')),
      ax('1c1', v('oneOnOne')),
      ax('Posizione', v('positioning')),
      ax('Freddezza', v('composure')),
    ];
  return [
    ax('Velocità', v('pace')),
    ax('Tecnica', v('dribbling')),
    ax('Tiro', v('finishing')),
    ax('Passaggio', v('passing')),
    ax('Difesa', (v('tackling') + v('marking')) / 2),
    ax('Fisico', (v('strength') + v('stamina')) / 2),
  ];
}

/** Gli assi-abilità di un giocatore per id (pannello della lavagna). */
export function abilityAxesFor(s: GameSession, playerId: string) {
  const p = s.world.players.get(playerId as PlayerId);
  return p ? abilityAxes(p) : [];
}

/** La lavagna: XI con coordinate per FASE, ruoli giocabili, fit, moduli e panchina. */
export function boardView(s: GameSession) {
  const assignment = s.runner.lineup(s.club.id) ?? bestAssignment(s.club, s.world);
  const unavailable = s.runner.isFinished()
    ? new Set<PlayerId>()
    : s.runner.unavailableNow(s.club.id);
  const layouts = {
    possesso: boardLayout(s, 'possesso', assignment),
    difesa: boardLayout(s, 'difesa', assignment),
  };
  const xiIds = new Set(assignment.map((a) => a.playerId as string));
  const xi = assignment.flatMap((a) => {
    const p = s.world.players.get(a.playerId);
    if (!p) return [];
    const id = p.id as string;
    const roles = playableRoles(p);
    const arch = playerArchetype(p);
    return [
      {
        id,
        name: p.name,
        pos: p.position,
        slot: a.slot,
        band: bandOf(playerOverall(p), p.age),
        archetypeId: arch.id,
        archetype: arch.label,
        roles,
        running: runningStyle(p).label,
        unavailable: unavailable.has(p.id),
        coord: {
          possesso: layouts.possesso[id]!,
          difesa: layouts.difesa[id]!,
        },
        fit: {
          possesso: fitAt(p, layouts.possesso[id]!.x, layouts.possesso[id]!.y),
          difesa: fitAt(p, layouts.difesa[id]!.x, layouts.difesa[id]!.y),
        },
      },
    ];
  });
  const bench = s.club.playerIds
    .filter((id) => !xiIds.has(id as string))
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => playerOverall(b) - playerOverall(a))
    .map((p) => {
      const roles = playableRoles(p);
      return {
        id: p.id as string,
        name: p.name,
        pos: p.position,
        band: bandOf(playerOverall(p), p.age),
        rolesLabel: [roles.primary, ...roles.others].join(' · '),
        archetype: playerArchetype(p).label,
        running: runningStyle(p).label,
        unavailable: unavailable.has(p.id),
      };
    });
  return {
    xi,
    bench,
    modules: { possesso: moduleOf(layouts.possesso), difesa: moduleOf(layouts.difesa) },
    problems: validateAssignment(assignment, s.club, s.world),
  };
}

/**
 * Sposta una pedina nella fase scelta. La FASE DIFENSIVA definisce il modulo
 * nominale: da lì il motore deriva i ruoli di zona (il portiere resta in porta).
 */
export function moveToken(
  s: GameSession,
  phase: BoardPhase,
  playerId: string,
  x: number,
  y: number,
): string {
  const assignment = s.runner.lineup(s.club.id) ?? bestAssignment(s.club, s.world);
  const entry = assignment.find((a) => (a.playerId as string) === playerId);
  if (!entry) return 'La pedina non è in campo.';
  const p = s.world.players.get(entry.playerId);
  const isGk = p?.position === 'GK' || entry.slot === 'GK';
  const cx = Math.max(24, Math.min(BOARD.W - 24, Math.round(x)));
  let cy = Math.max(24, Math.min(BOARD.H - 24, Math.round(y)));
  if (isGk) cy = Math.max(BOARD.GK_Y + 5, cy); // il portiere non esce dalla sua zona
  const board = {
    possesso: { ...(s.board?.possesso ?? {}) },
    difesa: { ...(s.board?.difesa ?? {}) },
  };
  const prev = board[phase][playerId];
  board[phase][playerId] = { x: cx, y: cy };
  if (phase === 'difesa') {
    const stored = board.difesa;
    const def = defaultLayout(assignment);
    const next: SlotAssignment = assignment.map((a) => {
      const q = s.world.players.get(a.playerId);
      const id = a.playerId as string;
      const c = stored[id] ?? def[id] ?? { x: 180, y: 300 };
      const slot: Position = q?.position === 'GK' ? 'GK' : zoneOf(c.y);
      return { slot, playerId: a.playerId };
    });
    const problems = validateAssignment(next, s.club, s.world);
    if (problems.length > 0) {
      if (prev) board[phase][playerId] = prev;
      else delete board[phase][playerId];
      s.board = board;
      return problems[0]!;
    }
    s.runner.setLineup(s.club.id, next);
  }
  s.board = board;
  return '';
}

/** Scambio XI ↔ panchina: chi entra eredita le posizioni (in entrambe le fasi). */
export function boardSwap(s: GameSession, xiPlayerId: string, benchPlayerId: string): string {
  const assignment = s.runner.lineup(s.club.id) ?? bestAssignment(s.club, s.world);
  const entry = assignment.find((a) => (a.playerId as string) === xiPlayerId);
  if (!entry) return 'La pedina non è in campo.';
  const incoming = s.world.players.get(benchPlayerId as PlayerId);
  if (!incoming || !s.club.playerIds.includes(incoming.id)) return 'Giocatore introvabile.';
  const unavailable = s.runner.isFinished()
    ? new Set<PlayerId>()
    : s.runner.unavailableNow(s.club.id);
  if (unavailable.has(incoming.id))
    return `${incoming.name} non è disponibile (infortunio, squalifica o fuori lista).`;
  const next = assignment.map((a) =>
    (a.playerId as string) === xiPlayerId ? { ...a, playerId: incoming.id } : { ...a },
  );
  const problems = validateAssignment(next, s.club, s.world);
  if (problems.length > 0) return problems[0]!;
  const board = {
    possesso: { ...(s.board?.possesso ?? {}) },
    difesa: { ...(s.board?.difesa ?? {}) },
  };
  for (const phase of ['possesso', 'difesa'] as const) {
    const c = board[phase][xiPlayerId];
    if (c) {
      board[phase][benchPlayerId] = c;
      delete board[phase][xiPlayerId];
    }
  }
  s.board = board;
  s.runner.setLineup(s.club.id, next);
  return '';
}

/** Torna all'XI e alle posizioni dell'allenatore (entrambe le fasi). */
export function resetFormation(s: GameSession): string {
  s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
  s.board = undefined;
  return 'Lavagna dell\u2019allenatore ripristinata.';
}

// ---- Lavagne salvate (max 3) ----

const PRESET_MAX = 3;

/** Salva la lavagna corrente (XI + posizioni di entrambe le fasi) con un nome. */
export function savePreset(s: GameSession, rawName: string): string {
  const name = rawName.trim().slice(0, 18);
  if (name.length < 2) return 'Dai un nome alla lavagna (almeno 2 lettere).';
  const assignment = (s.runner.lineup(s.club.id) ?? bestAssignment(s.club, s.world)).map((a) => ({
    slot: a.slot,
    playerId: a.playerId as string,
  }));
  const layouts = {
    possesso: { ...(s.board?.possesso ?? {}) },
    difesa: { ...(s.board?.difesa ?? {}) },
  };
  const others = (s.boardPresets ?? []).filter((p) => p.name !== name);
  if (others.length >= PRESET_MAX)
    return `Hai già ${PRESET_MAX} lavagne salvate: cancellane una o usa lo stesso nome.`;
  s.boardPresets = [...others, { name, assignment, board: layouts }];
  return `Lavagna "${name}" salvata.`;
}

/** Richiama una lavagna salvata (se i giocatori sono ancora in rosa). */
export function applyPreset(s: GameSession, name: string): string {
  const preset = (s.boardPresets ?? []).find((p) => p.name === name);
  if (!preset) return 'Lavagna non trovata.';
  const missing = preset.assignment.find((a) => !s.club.playerIds.includes(a.playerId as PlayerId));
  if (missing) {
    const gone = s.world.players.get(missing.playerId as PlayerId);
    return `Non si può: ${gone?.name ?? 'un giocatore'} non è più in rosa.`;
  }
  const next: SlotAssignment = preset.assignment.map((a) => ({
    slot: a.slot,
    playerId: a.playerId as PlayerId,
  }));
  const problems = validateAssignment(next, s.club, s.world);
  if (problems.length > 0) return problems[0]!;
  s.runner.setLineup(s.club.id, next);
  s.board = {
    possesso: { ...preset.board.possesso },
    difesa: { ...preset.board.difesa },
  };
  return `Lavagna "${name}" in campo.`;
}

export function deletePreset(s: GameSession, name: string): string {
  s.boardPresets = (s.boardPresets ?? []).filter((p) => p.name !== name);
  return `Lavagna "${name}" cancellata.`;
}

/** Le lavagne salvate, col modulo letto dall'assegnazione. */
export function presetList(s: GameSession) {
  return (s.boardPresets ?? []).map((p) => {
    let df = 0;
    let mf = 0;
    let fw = 0;
    for (const a of p.assignment) {
      if (a.slot === 'DF') df++;
      else if (a.slot === 'MF') mf++;
      else if (a.slot === 'FW') fw++;
    }
    return { name: p.name, module: `${df}-${mf}-${fw}` };
  });
}

// ---- Il duello di giornata sulla lavagna ----

/**
 * Il pericolo n°1 del prossimo avversario e il TUO marcatore consigliato per stile
 * di corsa (le leve mordono nei duelli): gap efficace minimo, poi la marcatura.
 */
export function matchupView(s: GameSession) {
  if (s.runner.isFinished()) return null;
  const round = s.runner.nextRound();
  const m = s.season.fixtures.find(
    (x) => x.round === round && (x.homeClubId === s.club.id || x.awayClubId === s.club.id),
  );
  if (!m) return null;
  const oppId = m.homeClubId === s.club.id ? m.awayClubId : m.homeClubId;
  const opp = s.world.clubs.get(oppId);
  if (!opp) return null;
  const oppXi = selectStartingXI(opp, s.world);
  const attacker = [...oppXi]
    .filter((p) => p.position === 'FW' || p.position === 'MF')
    .sort((a, b) => duelThreat(b) - duelThreat(a))[0];
  if (!attacker || duelThreat(attacker) < 0.35) return null;
  const atkPace = (attacker.attributes as unknown as Record<string, number>).pace ?? 60;
  const atkStyle = runningStyle(attacker).id;
  const xiIds = new Set(
    (s.runner.lineup(s.club.id) ?? bestAssignment(s.club, s.world)).map(
      (a) => a.playerId as string,
    ),
  );
  const myDefs = s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined && p.position === 'DF');
  let best: { p: Player; score: number } | null = null;
  for (const d of myDefs) {
    const a = d.attributes as unknown as Record<string, number>;
    const defPace = a.pace ?? 60;
    const rawGap = Math.max(0, Math.min(1, (atkPace - defPace) / DUEL.PACE_GAP_SPAN));
    const dStyle = runningStyle(d).id;
    let gap = rawGap;
    if (atkStyle === 'esplosivo') gap += DUEL.BURST_EDGE;
    if (atkStyle === 'falcata' && rawGap >= DUEL.OPEN_GAP) gap += DUEL.STRIDE_EDGE;
    if (dStyle === 'esplosivo' || dStyle === 'frequenza') gap -= DUEL.BURST_COVER;
    if (dStyle === 'falcata' && rawGap >= DUEL.OPEN_GAP) gap -= DUEL.STRIDE_COVER;
    gap = Math.max(0, Math.min(1, gap));
    const score = gap * 0.7 + (1 - (a.marking ?? 50) / 100) * 0.3;
    if (!best || score < best.score) best = { p: d, score };
  }
  if (!best) return null;
  return {
    opponent: opp.name,
    home: m.homeClubId === s.club.id,
    attacker: {
      name: attacker.name,
      archetype: playerArchetype(attacker).label,
      running: runningStyle(attacker).label,
      band: bandOf(playerOverall(attacker), attacker.age),
    },
    marker: {
      id: best.p.id as string,
      name: best.p.name,
      running: runningStyle(best.p).label,
      inXI: xiIds.has(best.p.id as string),
    },
  };
}

// ---- PIANO PARTITA (richiesta utente): istruzioni di squadra ----

function myXiPlayers(s: GameSession): Player[] {
  const assignment = s.runner.lineup(s.club.id) ?? bestAssignment(s.club, s.world);
  return assignment
    .map((a) => s.world.players.get(a.playerId))
    .filter((p): p is Player => p !== undefined);
}

function nextOpponentXi(s: GameSession): { name: string; xi: Player[] } | null {
  if (s.runner.isFinished()) return null;
  const round = s.runner.nextRound();
  const m = s.season.fixtures.find(
    (x) => x.round === round && (x.homeClubId === s.club.id || x.awayClubId === s.club.id),
  );
  if (!m) return null;
  const oppId = m.homeClubId === s.club.id ? m.awayClubId : m.homeClubId;
  const opp = s.world.clubs.get(oppId);
  if (!opp) return null;
  return { name: opp.name, xi: selectStartingXI(opp, s.world) };
}

/** Aggiorna il piano (merge) e lo consegna al motore. */
export function updatePlan(s: GameSession, patch: Partial<TeamPlan>): void {
  s.plan = { ...(s.plan ?? {}), ...patch };
  applyPlanToRunner(s);
}

export function updateSetPiece(s: GameSession, patch: Partial<SetPiecePlan>): void {
  const sp: SetPiecePlan = { scheme: 'zona', ...(s.plan?.setPiece ?? {}), ...patch };
  s.plan = { ...(s.plan ?? {}), setPiece: sp };
  applyPlanToRunner(s);
}

/** Marca SPECIALE su un bersaglio (max 2); markerId null la toglie. */
export function setSpecialMark(s: GameSession, targetId: string, markerId: string | null): string {
  const current = (s.plan?.setPiece?.special ?? []).filter((x) => x.targetId !== targetId);
  if (markerId) {
    if (current.length >= 2) return 'Massimo 2 marcature speciali: il resto è schema.';
    current.push({ targetId, markerId });
  }
  updateSetPiece(s, { special: current });
  return '';
}

/** La vista del PIANO: stato + consigli vivi calcolati sul prossimo avversario. */
export function planView(s: GameSession) {
  const coach = [...(s.world.managers?.values() ?? [])].find((m) => m.clubId === s.club.id);
  const plan = s.plan ?? {};
  const styles = STYLE_KEYS.filter((k) => k !== 'motivator' && k !== 'youth').map((k) => ({
    id: k,
    label: COACH_STYLES[k].label,
    fit: Math.round(squadFit(s.world, s.club, k) * 100),
    isCoach: coach?.style === k,
  }));
  const opp = nextOpponentXi(s);
  const xi = myXiPlayers(s);
  const danger = opp ? depthDanger(xi, opp.xi) : 0;
  const defs = xi.filter((p) => p.position === 'DF');
  const markAvg =
    defs.reduce(
      (sum, p) => sum + ((p.attributes as unknown as Record<string, number>).marking ?? 50),
      0,
    ) / Math.max(1, defs.length);
  return {
    plan: {
      style: plan.style ?? null,
      line: plan.line ?? 'media',
      marking: plan.marking ?? 'zona',
      aggression: plan.aggression ?? 'normale',
    },
    coachStyle: coach ? { id: coach.style, label: COACH_STYLES[coach.style].label } : null,
    friction: plan.style !== undefined && coach !== undefined && plan.style !== coach.style,
    styles,
    opponent: opp?.name ?? null,
    lineDanger: Math.round(danger * 100),
    markingGood: markAvg >= 62,
  };
}

/** La vista PALLE INATTIVE: le torri del prossimo avversario e i tuoi uomini. */
export function setPieceView(s: GameSession) {
  const sp: SetPiecePlan = { scheme: 'zona', ...(s.plan?.setPiece ?? {}) };
  const opp = nextOpponentXi(s);
  const xi = myXiPlayers(s);
  const towers = (opp?.xi ?? [])
    .filter((p) => p.position !== 'GK')
    .map((p) => ({
      id: p.id as string,
      name: p.name,
      height: playerHeightOf(p),
      threat: Math.round(aerialThreat(p) * 100),
      archetype: playerArchetype(p).label,
    }))
    .sort((a, b) => b.threat - a.threat)
    .slice(0, 4);
  const markers = xi
    .filter((p) => p.position === 'DF' || p.position === 'MF')
    .map((p) => ({
      id: p.id as string,
      name: p.name,
      height: playerHeightOf(p),
      def: Math.round(aerialDefence(p) * 100),
    }))
    .sort((a, b) => b.def - a.def);
  const takers = [...xi]
    .filter((p) => p.position !== 'GK')
    .sort(
      (a, b) =>
        ((b.attributes as unknown as Record<string, number>).passing ?? 0) -
        ((a.attributes as unknown as Record<string, number>).passing ?? 0),
    )
    .slice(0, 6)
    .map((p) => ({ id: p.id as string, name: p.name }));
  const captains = [...xi]
    .sort((a, b) => b.personality.leadership - a.personality.leadership)
    .map((p) => ({
      id: p.id as string,
      name: p.name,
      leader: p.personality.leadership >= 0.65,
    }));
  const shooters = [...xi]
    .filter((p) => p.position !== 'GK')
    .sort(
      (a, b) =>
        ((b.attributes as unknown as Record<string, number>).finishing ?? 0) +
        ((b.attributes as unknown as Record<string, number>).composure ?? 0) -
        ((a.attributes as unknown as Record<string, number>).finishing ?? 0) -
        ((a.attributes as unknown as Record<string, number>).composure ?? 0),
    )
    .slice(0, 6)
    .map((p) => ({ id: p.id as string, name: p.name }));
  return {
    opponent: opp?.name ?? null,
    scheme: sp.scheme,
    preventive: sp.preventive === true,
    special: sp.special ?? [],
    takerId: sp.takerId ?? null,
    penaltyTakerId: sp.penaltyTakerId ?? null,
    captainId: sp.captainId ?? null,
    towers,
    markers,
    takers,
    captains,
    shooters,
  };
}

function playerHeightOf(p: Player): number {
  return playerHeight(p);
}

export function squadRows(s: GameSession) {
  return s.club.playerIds
    .map((id) => s.world.players.get(id)!)
    .filter(Boolean)
    .sort((a, b) => playerOverall(b) - playerOverall(a))
    .map((p) => ({
      name: p.name,
      pos: p.position,
      age: p.age,
      stars: starString(playerOverall(p)),
      band: bandOf(playerOverall(p), p.age),
      morale: moraleLabel(p.morale),
    }));
}

export function tableRows(s: GameSession) {
  return seasonStandings(s.world, s.season).map((r, i) => ({
    pos: i + 1,
    name: s.world.clubs.get(r.clubId)?.name ?? '?',
    pts: r.points,
    played: r.played,
    gd: r.goalDiff,
    mine: r.clubId === s.club.id,
  }));
}

/**
 * G4 — IL MONDO CHE GIOCA: le classifiche VIVE di ogni divisione, giornata per
 * giornata (prima esistevano solo a giugno). Una scheda per lega: tabella,
 * capocannonieri e migliori pagelle, dagli store G1 veri di quel campionato.
 */
export function worldTables(s: GameSession) {
  const userLeagueId = leagueOfClub(s.world, s.club.id).id;
  const clubOfPid = new Map<string, Club>();
  for (const c of s.world.clubs.values())
    for (const pid of c.playerIds) clubOfPid.set(pid as string, c);
  return s.world.leagues.map((lg) => {
    const mine = lg.id === userLeagueId;
    const o = mine ? null : (s.others ?? []).find((x) => x.season.leagueId === lg.id);
    const season = mine ? s.season : o?.season;
    const stats = mine ? s.runner.playerStats() : o?.runner.playerStats();
    const rows = season
      ? seasonStandings(s.world, season).map((r, i) => ({
          pos: i + 1,
          name: s.world.clubs.get(r.clubId)?.name ?? '?',
          pts: r.points,
          played: r.played,
          gd: r.goalDiff,
          mine: r.clubId === s.club.id,
        }))
      : [];
    const people: {
      name: string;
      clubName: string;
      role: Position;
      goals: number;
      assists: number;
      apps: number;
      media: number;
      myClub: boolean;
    }[] = [];
    for (const [pid, st] of stats ?? []) {
      if (st.apps === 0) continue;
      const p = s.world.players.get(pid);
      if (!p) continue;
      const club = clubOfPid.get(pid as string);
      people.push({
        name: p.name,
        clubName: club?.name ?? '—',
        role: p.position,
        goals: st.goals,
        assists: st.assists,
        apps: st.apps,
        media: st.ratingSum / st.apps,
        myClub: club?.id === s.club.id,
      });
    }
    const scorers = people
      .filter((x) => x.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name))
      .slice(0, 10);
    const assistmen = people
      .filter((x) => x.assists > 0)
      .sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.name.localeCompare(b.name))
      .slice(0, 5);
    const ratings = people
      .filter((x) => x.apps >= 3)
      .sort((a, b) => b.media - a.media || b.apps - a.apps || a.name.localeCompare(b.name))
      .slice(0, 5);
    return { league: lg.name, mine, rows, scorers, assistmen, ratings };
  });
}
