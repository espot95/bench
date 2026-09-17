/**
 * PIANO PARTITA (richiesta utente): le istruzioni di squadra del club UTENTE —
 * tipo di gioco imposto, linea difensiva, marcatura, aggressività, palle inattive.
 * Puro e deterministico; piano assente o neutro = fattori ESATTAMENTE 1 (i club AI
 * non hanno piano → lega byte-identica, calibrazione salva).
 */

import { playerHeight, runningStyle } from '../core/physique.js';
import type { Club, CoachStyle, Manager, Player, World } from '../core/types.js';
import { COACH_STYLES, type StyleMatchMods, squadFit } from './coach-styles.js';

export interface SetPiecePlan {
  /** Schema sui piazzati DIFENSIVI. */
  scheme: 'zona' | 'uomo' | 'misto';
  /** Marcature SPECIALI per la prossima partita (bersaglio loro → marcatore tuo). */
  special?: { targetId: string; markerId: string }[];
  /** Marcature preventive sui TUOI piazzati: meno ripartenze, una torre in meno. */
  preventive?: boolean;
  /** Battitore dei piazzati (il suo passaggio alimenta i TUOI piazzati). */
  takerId?: string;
  /** Rigorista designato (per ora cosmetico: il motore-rigori arriverà). */
  penaltyTakerId?: string;
  /** Capitano designato: la fascia va a LUI (anche se non è il più carismatico). */
  captainId?: string;
}

export interface TeamPlan {
  /** Tipo di gioco IMPOSTO (undefined = quello dell'allenatore). */
  style?: CoachStyle;
  line?: 'alta' | 'media' | 'bassa';
  marking?: 'uomo' | 'zona';
  aggression?: 'morbida' | 'normale' | 'cattiva';
  setPiece?: SetPiecePlan;
}

export const PLAN = {
  /** Stile imposto ≠ stile del tecnico: lo interpreta peggio. */
  FRICTION: 0.6,
  /** Linea ALTA: recuperi (meno tiri concessi) ma la profondità punisce. */
  HIGH_OPP_SHOTS: 0.94,
  DEPTH_K: 0.12,
  /** Linea BASSA: meno qualità concessa, squadra schiacciata. */
  LOW_OPP_TILT: 0.95,
  LOW_OWN_SHOTS: 0.96,
  /** Marcatura a UOMO: rende con difensori che sanno marcare, si ritorce senza. */
  UOMO_MARK_BAR: 62,
  UOMO_GOOD_TILT: 0.97,
  UOMO_BAD_TILT: 1.03,
  UOMO_DUEL: 1.25,
  /** Aggressività: intensità dei duelli e ritmo spezzato. */
  AGG_DUEL: { morbida: 0.85, normale: 1, cattiva: 1.15 } as Record<string, number>,
  AGG_OPP_SHOTS: { morbida: 1.015, normale: 1, cattiva: 0.98 } as Record<string, number>,
  /** Palle inattive: ampiezza massima del canale sul tilt (~30% del pericolo reale). */
  SP_SHARE: 0.06,
  SP_MATCHUP_GOOD: 0.08,
  SP_MATCHUP_BAD: 0.05,
  SP_PREV_OPP_SHOTS: 0.97,
  SP_PREV_OWN_TILT: 0.99,
} as const;

const attr = (p: Player, k: string): number =>
  (p.attributes as unknown as Record<string, number>)[k] ?? 50;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Pericolo-profondità contro la MIA linea alta: gap di velocità + corse avversarie. */
export function depthDanger(myXI: readonly Player[], oppXI: readonly Player[]): number {
  const myDefs = myXI.filter((p) => p.position === 'DF');
  const oppFwds = oppXI.filter((p) => p.position === 'FW');
  if (myDefs.length === 0 || oppFwds.length === 0) return 0;
  const linePace = myDefs.reduce((s, p) => s + attr(p, 'pace'), 0) / myDefs.length;
  const fastest = [...oppFwds].sort((a, b) => attr(b, 'pace') - attr(a, 'pace'))[0]!;
  let danger = clamp01((attr(fastest, 'pace') - linePace) / 30);
  const rs = runningStyle(fastest).id;
  if (rs === 'falcata' || rs === 'esplosivo') danger = clamp01(danger + 0.2);
  return danger;
}

/** Lo stile IMPOSTO dal piano: come styleMods, ma con l'attrito del tecnico. */
export function planStyleMods(
  world: World,
  club: Club,
  coach: Manager | undefined,
  style: CoachStyle,
): StyleMatchMods {
  const def = COACH_STYLES[style];
  const rep = (coach?.reputation ?? 50) / 100;
  const friction = coach && coach.style === style ? 1 : PLAN.FRICTION;
  const p = rep * squadFit(world, club, style) * friction;
  const scale = (full: number | undefined): number => (full === undefined ? 1 : 1 + (full - 1) * p);
  return {
    ownShots: scale(def.mods.ownShots),
    ownTilt: scale(def.mods.ownTilt),
    oppShots: scale(def.mods.oppShots),
    oppTilt: scale(def.mods.oppTilt),
  };
}

/** Minaccia aerea sui piazzati (altezza vera + fisico + posizione). */
export function aerialThreat(p: Player): number {
  return clamp01(
    ((playerHeight(p) - 172) / 30) * 0.5 + attr(p, 'strength') / 250 + attr(p, 'positioning') / 400,
  );
}

/** Quanto un marcatore SPEGNE una torre (altezza + marcatura + fisico). */
export function aerialDefence(p: Player): number {
  return clamp01(
    ((playerHeight(p) - 172) / 30) * 0.4 + attr(p, 'marking') / 220 + attr(p, 'strength') / 300,
  );
}

/**
 * Il canale PALLE INATTIVE del piano: fattori moltiplicativi sui MIEI mod.
 * Solo per club con piano (l'AI resta neutra → byte-identico).
 */
export function setPieceFactors(
  sp: SetPiecePlan,
  myXI: readonly Player[],
  oppXI: readonly Player[],
): { ownShots: number; ownTilt: number; oppShots: number; oppTilt: number } {
  // Attacco MIO: le mie torri + il battitore.
  const myTowers = [...myXI]
    .filter((p) => p.position !== 'GK')
    .sort((a, b) => aerialThreat(b) - aerialThreat(a))
    .slice(0, 2);
  const taker = sp.takerId ? myXI.find((p) => (p.id as string) === sp.takerId) : undefined;
  let myAttack = myTowers.reduce((s, p) => s + aerialThreat(p), 0) / Math.max(1, myTowers.length);
  if (taker) myAttack = clamp01(myAttack + (attr(taker, 'passing') - 60) / 300);
  if (sp.preventive) myAttack -= 0.08; // una torre resta dietro

  // Difesa MIA: lo schema + le marcature speciali sui bersagli davvero in campo.
  const defs = myXI.filter((p) => p.position === 'DF' || p.position === 'MF').slice(0, 8);
  const avg = (k: string) => defs.reduce((s, p) => s + attr(p, k), 0) / Math.max(1, defs.length);
  let myDefence =
    sp.scheme === 'zona'
      ? avg('positioning') / 100
      : sp.scheme === 'uomo'
        ? avg('marking') / 100
        : (avg('positioning') + avg('marking')) / 200;
  for (const pair of sp.special ?? []) {
    const target = oppXI.find((p) => (p.id as string) === pair.targetId);
    const marker = myXI.find((p) => (p.id as string) === pair.markerId);
    if (!target || !marker) continue;
    const edge = aerialDefence(marker) - aerialThreat(target);
    myDefence += edge >= -0.05 ? PLAN.SP_MATCHUP_GOOD : -PLAN.SP_MATCHUP_BAD;
  }
  myDefence = clamp01(myDefence);

  // Minaccia LORO sui piazzati (dal loro XI, deterministico).
  const oppAttack = clamp01(
    [...oppXI]
      .filter((p) => p.position !== 'GK')
      .sort((a, b) => aerialThreat(b) - aerialThreat(a))
      .slice(0, 2)
      .reduce((s, p) => s + aerialThreat(p), 0) / 2,
  );

  return {
    ownShots: 1,
    ownTilt: (1 + PLAN.SP_SHARE * (myAttack - 0.5)) * (sp.preventive ? PLAN.SP_PREV_OWN_TILT : 1),
    oppShots: sp.preventive ? PLAN.SP_PREV_OPP_SHOTS : 1,
    oppTilt: 1 + PLAN.SP_SHARE * (oppAttack - myDefence),
  };
}

/** Applica linea/marcatura/aggressività/piazzati ai MIEI mod (moltiplicativo). */
export function applyTeamPlan(
  mods: StyleMatchMods,
  plan: TeamPlan,
  myXI: readonly Player[],
  oppXI: readonly Player[],
): StyleMatchMods {
  let { ownShots, ownTilt, oppShots, oppTilt } = mods;
  if (plan.line === 'alta') {
    oppShots *= PLAN.HIGH_OPP_SHOTS;
    oppTilt *= 1 + PLAN.DEPTH_K * depthDanger(myXI, oppXI);
  } else if (plan.line === 'bassa') {
    oppTilt *= PLAN.LOW_OPP_TILT;
    ownShots *= PLAN.LOW_OWN_SHOTS;
  }
  if (plan.marking === 'uomo') {
    const defs = myXI.filter((p) => p.position === 'DF');
    const markAvg = defs.reduce((s, p) => s + attr(p, 'marking'), 0) / Math.max(1, defs.length);
    oppTilt *= markAvg >= PLAN.UOMO_MARK_BAR ? PLAN.UOMO_GOOD_TILT : PLAN.UOMO_BAD_TILT;
  }
  if (plan.aggression && plan.aggression !== 'normale') {
    oppShots *= PLAN.AGG_OPP_SHOTS[plan.aggression] ?? 1;
  }
  if (plan.setPiece) {
    const sp = setPieceFactors(plan.setPiece, myXI, oppXI);
    ownShots *= sp.ownShots;
    ownTilt *= sp.ownTilt;
    oppShots *= sp.oppShots;
    oppTilt *= sp.oppTilt;
  }
  return { ownShots, ownTilt, oppShots, oppTilt };
}

/** Il fattore-duelli del piano (marcatura a uomo + aggressività) per i MIEI difensori. */
export function planDuelFactor(plan: TeamPlan | undefined): number {
  if (!plan) return 1;
  const uomo = plan.marking === 'uomo' ? PLAN.UOMO_DUEL : 1;
  const agg = PLAN.AGG_DUEL[plan.aggression ?? 'normale'] ?? 1;
  return uomo * agg;
}
