/**
 * President AI — proposal evaluation (MODULE_PRESIDENT §3). The manager (user) proposes a
 * free agent; the president decides with hard constraints (budget, cash, quotas — NEVER
 * violated) and a character-driven merit call (ambition/composure/professionalism/
 * temperament). Pure + RNG-injected (the impulse roll).
 */

import { wageBudgetStatus } from '../core/finance.js';
import { classifyForNation } from '../core/nations.js';
import { playerOverall } from '../core/ratings.js';
import { type Club, type Player, type President, type World, nationOfClub } from '../core/types.js';
import { buildRosterList } from '../engine/roster.js';
import { askingPrice, negotiateTransfer, playerAcceptsMove } from '../market/transfers.js';
import { agencyCommissionFor, expectedWage, offeredYears } from '../market/value.js';
import type { Rng } from '../rng/rng.js';

export const PRESIDENT = {
  /** Base quality tolerance below squad average; bent by ambition/composure. */
  QUALITY_BASE: 8,
  QUALITY_AMBITION: 8,
  QUALITY_COMPOSURE: 6,
  /** Prudence margin on the wage headroom, bent by ambition/composure. */
  MARGIN_SPAN: 0.35,
  /** Max probability of an impulsive flip of the merit call (scaled by temperament). */
  IMPULSE: 0.25,
  /** Veterans threshold for the "no declino" rule. */
  OLD_AGE: 31,
} as const;

export interface ProposalVerdict {
  approved: boolean;
  /** Human-readable Italian motivation (always set). */
  reason: string;
  /** Terms, set when approved. */
  wage?: number;
  years?: number;
  commission?: number;
}

/**
 * Evaluate the manager's proposal to sign free agent `player`.
 * `nonEuUsedThisSeason` = new non-EU registrations already consumed this season.
 */
/** Standard signing terms + the HARD constraints (machine-enforced, role-independent). */
export interface SigningCheck {
  /** First violated constraint, or null when the signing is legal. */
  problem: string | null;
  wage: number;
  years: number;
  commission: number;
}

/**
 * Hard constraints for adding `player` to `club` (MODULE_PRESIDENT §3 punti 1-3):
 * wage headroom, cash for the commission, roster quotas + seasonal non-EU cap.
 * Used by the AI president AND by the user-president mode — never bypassed by anyone.
 */
export function checkHardConstraints(
  world: World,
  club: Club,
  player: Player,
  year: number,
  nonEuUsedThisSeason: number,
): SigningCheck {
  const overall = playerOverall(player);
  const wage = expectedWage(overall, player.age);
  const years = offeredYears(player.age);
  const commission = agencyCommissionFor(wage, player.agencyId != null);

  const { headroom } = wageBudgetStatus(world, club);
  if (wage > headroom) {
    return { problem: 'Non rientra nel monte ingaggi.', wage, years, commission };
  }
  if (commission > club.finances.cash) {
    return { problem: "La cassa non copre la commissione dell'agenzia.", wage, years, commission };
  }
  const quota = quotaProblem(world, club, player, nonEuUsedThisSeason);
  return { problem: quota, wage, years, commission };
}

export function evaluateProposal(
  world: World,
  club: Club,
  president: President,
  player: Player,
  year: number,
  nonEuUsedThisSeason: number,
  rng: Rng,
): ProposalVerdict {
  const overall = playerOverall(player);
  const { problem, wage, years, commission } = checkHardConstraints(
    world,
    club,
    player,
    year,
    nonEuUsedThisSeason,
  );
  if (problem) return { approved: false, reason: problem };
  const { headroom } = wageBudgetStatus(world, club);

  // ------- Merit call (character-driven) -------
  const p = president.personality;
  const squad = club.playerIds
    .map((id) => world.players.get(id))
    .filter((x): x is Player => x !== undefined);
  const squadAvg = squad.reduce((s, x) => s + playerOverall(x), 0) / Math.max(1, squad.length);

  let approved = true;
  let reason = 'Colpo approvato: alza il livello della rosa.';

  const qualityMargin =
    PRESIDENT.QUALITY_BASE +
    PRESIDENT.QUALITY_AMBITION * p.ambition -
    PRESIDENT.QUALITY_COMPOSURE * p.composure;
  if (overall < squadAvg - qualityMargin) {
    approved = false;
    reason = 'Non alza il livello della rosa.';
  } else if (player.age >= PRESIDENT.OLD_AGE && p.professionalism > 0.6 && overall < squadAvg + 3) {
    approved = false;
    reason = 'Troppo avanti con gli anni per questo progetto.';
  } else {
    // Prudence: the composed president wants breathing room on the budget.
    const leniency =
      1 + PRESIDENT.MARGIN_SPAN * (p.ambition - 0.5) - PRESIDENT.MARGIN_SPAN * (p.composure - 0.5);
    if (wage > headroom * Math.max(0.5, leniency)) {
      approved = false;
      reason = 'Ingaggio troppo pesante: voglio margine sul monte stipendi.';
    }
  }

  // Impulsive flip (temperament) — merit only, hard constraints already passed.
  if (rng.chance(PRESIDENT.IMPULSE * p.temperament)) {
    approved = !approved;
    reason = approved
      ? 'Il presidente si è innamorato del colpo: si fa.'
      : 'Il presidente si è impuntato: non se ne fa niente.';
  }

  return approved ? { approved, reason, wage, years, commission } : { approved, reason };
}

/** Quota check (MODULE_PRESIDENT §3 vincolo 3): list squeeze-out + seasonal non-EU cap. */
function quotaProblem(world: World, club: Club, player: Player, nonEuUsed: number): string | null {
  const nation = nationOfClub(world, club.id);
  if (!nation || !nation.rosterRules.enabled) return null;

  // Seasonal cap on NEW non-EU registrations (in ENG every foreigner is non-EU).
  if (classifyForNation(nation, player.nationality) === 'nonEu') {
    const cap = nation.rosterRules.nonEuCap;
    if (cap !== null && nonEuUsed >= cap) {
      return 'Cap extracomunitari stagionale esaurito.';
    }
  }

  // Would he end up squeezed off the over-21 list? Simulate the post-signing roster.
  if (player.age >= nation.rosterRules.under22Age) {
    club.playerIds.push(player.id);
    const hadPlayer = world.players.has(player.id);
    if (!hadPlayer) world.players.set(player.id, player);
    const excluded = buildRosterList(world, club).excluded.includes(player.id);
    club.playerIds = club.playerIds.filter((id) => id !== player.id);
    if (!hadPlayer) world.players.delete(player.id);
    if (excluded) return 'Fuori quota: finirebbe fuori dalla lista over-21.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Club-to-club transfer proposals (MODULE_MARKET §2, §5)
// ---------------------------------------------------------------------------

export interface TransferVerdict extends ProposalVerdict {
  /** Agreed transfer fee when approved. */
  fee?: number;
  /** Narrative of the fee negotiation (always set when it got that far). */
  negotiation?: string;
}

/**
 * The manager proposes buying `player` from `seller`. The buying president checks merit,
 * quotas and wages (as for free agents), then negotiates the fee with the selling
 * president (single-shot) and asks the player. Hard constraints are never violated.
 */
export function evaluateTransferProposal(
  world: World,
  buyer: Club,
  buyerPresident: President,
  seller: Club,
  sellerPresident: President | undefined,
  player: Player,
  year: number,
  nonEuUsedThisSeason: number,
  rng: Rng,
): TransferVerdict {
  // Merit + wage headroom + quotas: same gate as free agents.
  const base = evaluateProposal(
    world,
    buyer,
    buyerPresident,
    player,
    year,
    nonEuUsedThisSeason,
    rng,
  );
  if (!base.approved) return base;

  // Fee negotiation with the seller (MODULE_MARKET §1-§2).
  const ask = askingPrice(world, seller, sellerPresident, player, year);
  const b = buyerPresident.personality;
  const bid = Math.min(
    buyer.finances.transferBudget,
    Math.round((ask * (0.82 + 0.24 * b.ambition)) / 100_000) * 100_000,
  );
  if (buyer.finances.transferBudget <= 0 || bid <= 0) {
    return { approved: false, reason: 'Budget trasferimenti esaurito.' };
  }
  const outcome = negotiateTransfer(
    bid,
    ask,
    buyerPresident,
    sellerPresident,
    buyer.finances.transferBudget,
    rng,
  );
  if (!outcome.agreed) {
    return {
      approved: false,
      reason: outcome.reason,
      negotiation: `Offerti ${(bid / 1e6).toFixed(1)}M su richiesta ${(ask / 1e6).toFixed(1)}M.`,
    };
  }
  // Cash must cover fee + commission (hard).
  const commission = base.commission ?? 0;
  if (outcome.fee + commission > buyer.finances.cash) {
    return { approved: false, reason: 'La cassa non copre cartellino e commissione.' };
  }
  if (!playerAcceptsMove(world, player, seller, buyer, year)) {
    return {
      approved: false,
      reason: 'Il giocatore rifiuta il trasferimento (piazza troppo piccola).',
    };
  }
  return { ...base, fee: outcome.fee, negotiation: outcome.reason };
}
