/**
 * Rinnovi negoziati col procuratore (MODULE_CONTRACTS): macchina a stati pura, RNG
 * iniettato, log narrativo — la UI è guscio. Il carattere del giocatore fa la stance
 * (tifoso / mercenario / pensa-in-grande), il pacchetto (fisso+bonus+promessa) fa il
 * valore, il monte ingaggi resta vincolo macchina. L'accettazione muta il contratto
 * (stesso owner di `offerRenewal`).
 */

import { clubWageBill, wageBudgetStatus } from '../core/finance.js';
import type { ClubId, PlayerId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type {
  Club,
  Contract,
  ContractBonuses,
  Player,
  Position,
  StandingRow,
  World,
} from '../core/types.js';
import { bookValue } from '../finances/book-value.js';
import { marketWindowOpen } from '../market/ai.js';
import { expectedWage } from '../market/value.js';
import type { Rng } from '../rng/rng.js';

export const RENEWAL = {
  /** Giri massimi di offerte al tavolo. */
  MAX_ROUNDS: 4,
  /** Sotto valore×INSULT rispetto alla richiesta l'offerta è un insulto. */
  INSULT: 0.7,
  /** Sotto questo mood l'agente si alza dal tavolo (cooldown). */
  WALKOUT_MOOD: 0.18,
  /** Giornate di gelo dopo un tavolo saltato. */
  COOLDOWN: 6,
  /** p(tifoso) se cresciuto nel vivaio del club / altrimenti. */
  FAN_P_TRAINED: 0.6,
  FAN_P_OTHER: 0.04,
  /** Sconto del tifoso sulla richiesta (scalato dalla lealtà). */
  FAN_DISCOUNT: 0.15,
  /** Mercenario: soglie e premio sulla richiesta. */
  MERC_AMBITION: 0.65,
  MERC_LOYALTY: 0.35,
  MERC_EDGE: 2,
  MERC_PREMIUM: 0.15,
  /** Il mercenario sconta i bonus (vuole il fisso). */
  MERC_BONUS_HAIRCUT: 0.5,
  /** Dal 2° giro il mercenario può prendere tempo (giornate di stallo). */
  MERC_STALL_P: 0.4,
  MERC_STALL_MIN: 3,
  MERC_STALL_MAX: 5,
  MERC_STALL_RAISE: 1.08,
  /** Pensa-in-grande: soglia ambizione; garanzie = bonus trofeo+top4 ≥ richiesta×settimane. */
  BIG_AMBITION: 0.7,
  BIG_GUARANTEE_WEEKS: 26,
  BIG_TROPHY_BOOST: 1.3,
  /** Valore percepito di una promessa di rinforzi (quota della richiesta). */
  PROMISE_VALUE: 0.08,
  /** Leva extra: contratto in scadenza nell'anno / promessa tradita in passato. */
  EXPIRING_PREMIUM: 0.1,
  BETRAYED_PREMIUM: 0.2,
  /** Floor privato: quota della richiesta iniziale. */
  FLOOR_MIN: 0.86,
  FLOOR_MAX: 0.93,
  /** Eventi attesi a stagione (a qualità piena) per il valore dei bonus. */
  EV_GOALS: { GK: 0, DF: 1.5, MF: 5, FW: 12 } as Record<Position, number>,
  EV_ASSISTS: { GK: 0, DF: 2, MF: 7, FW: 5 } as Record<Position, number>,
  /** Malus di valore per anno di scarto dagli anni desiderati. */
  YEARS_MISMATCH: 0.04,
} as const;

// ------------------------------------------------------------------ stance derivata

/** Hash deterministico in [0,1) — nessun RNG di simulazione consumato. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/**
 * Tifoso del club (MODULE_CONTRACTS §2): il vivaio è il proxy del "nato lì e cresciuto
 * nel club" (il motore non conosce la geografia); la lealtà modula. Derivato, mai salvato.
 */
export function isClubFan(player: Player, clubId: ClubId): boolean {
  const trained = player.trainedClubId === clubId;
  const p =
    (trained ? RENEWAL.FAN_P_TRAINED : RENEWAL.FAN_P_OTHER) +
    0.2 * (player.personality.loyalty - 0.5);
  return hash01(`${player.id}|${clubId}|fan`) < p;
}

/** Rank di reputazione del club tra i club della sua classifica (1 = più blasonato). */
function reputationRank(world: World, club: Club, standings: readonly StandingRow[]): number {
  const reps = standings
    .map((r) => world.clubs.get(r.clubId)?.reputation ?? 0)
    .sort((a, b) => b - a);
  return Math.max(1, reps.findIndex((r) => r <= club.reputation) + 1);
}

/** Il club "lotta" (MODULE_CONTRACTS §2): posizione ≤4 o non peggio del suo blasone. */
export function projectConvinces(
  world: World,
  club: Club,
  standings: readonly StandingRow[],
): boolean {
  const pos = standings.findIndex((r) => r.clubId === club.id) + 1;
  if (pos === 0) return true; // niente classifica → nessuna obiezione
  return pos <= 4 || pos <= reputationRank(world, club, standings);
}

export interface RenewalOfferTerms {
  /** Ingaggio settimanale lordo offerto. */
  wage: number;
  /** Durata offerta in anni (1-5). */
  years: number;
  bonuses?: ContractBonuses;
  /** Promessa di un rinforzo nel reparto (MODULE_CONTRACTS §6). */
  promise?: Position | null;
}

export interface RenewalEvent {
  who: 'agente' | 'tu' | 'sistema';
  text: string;
}

export interface RenewalState {
  playerId: PlayerId;
  playerName: string;
  /** Chi parla dall'altra parte del tavolo. */
  agentName: string;
  stage: 'terms' | 'done' | 'failed' | 'stalled' | 'leaving';
  round: number;
  /** Umore del tavolo 0..1. */
  mood: number;
  /** Richiesta corrente (fisso settimanale equivalente). */
  askWage: number;
  /** Minimo privato (la UI non lo mostra). */
  floor: number;
  yearsWanted: number;
  fan: boolean;
  mercenary: boolean;
  bigThinker: boolean;
  projectOk: boolean;
  betrayed: boolean;
  /** true finché il pensa-in-grande non vede garanzie (bonus pesanti o promessa). */
  guaranteeNeeded: boolean;
  stallUntilRound?: number;
  cooldownUntilRound?: number;
  agreedWage?: number;
  agreedYears?: number;
  agreedBonuses?: ContractBonuses;
  agreedPromise?: Position | null;
  log: RenewalEvent[];
}

/** Sotto il milione in migliaia, sopra in Milioni (richiesta utente): mai "1500k". */
const K = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`);
/** Ingaggi mostrati su base ANNUA (richiesta utente); il motore resta a settimana. */
const A = (weekly: number) => `${((weekly * 52) / 1e6).toFixed(1)}M l'anno`;

function agentNameFor(world: World, player: Player): string {
  if (player.agencyId) {
    const a = world.agencies?.find((x) => x.id === player.agencyId);
    if (a) return a.name;
  }
  return player.name; // auto-rappresentato (o libero): parla lui
}

/** p(titolo) e p(top-4) dal rank di reputazione nella lega. */
function outcomeOdds(rank: number): { pTitle: number; pTop: number; pSurvive: number } {
  const pTitle = Math.max(0.03, 0.45 - 0.07 * (rank - 1));
  const pTop = Math.max(0.05, Math.min(0.85, 0.95 - 0.11 * (rank - 1)));
  const pSurvive = Math.max(0.3, Math.min(0.97, 1.02 - 0.035 * rank));
  return { pTitle, pTop, pSurvive };
}

/** Valore atteso ANNUO dei bonus per il giocatore (MODULE_CONTRACTS §3). */
export function bonusExpectedValue(
  bonuses: ContractBonuses | undefined,
  player: Player,
  rank: number,
  stance: { mercenary: boolean; bigThinker: boolean },
): number {
  if (!bonuses) return 0;
  const q = Math.max(0.4, Math.min(1.1, playerOverall(player) / 85));
  const { pTitle, pTop, pSurvive } = outcomeOdds(rank);
  const bigBoost = stance.bigThinker ? RENEWAL.BIG_TROPHY_BOOST : 1;
  let ev =
    (bonuses.perGoal ?? 0) * RENEWAL.EV_GOALS[player.position] * q +
    (bonuses.perAssist ?? 0) * RENEWAL.EV_ASSISTS[player.position] * q +
    (bonuses.trophy ?? 0) * pTitle * bigBoost +
    (bonuses.topFinish ?? 0) * pTop * bigBoost +
    (bonuses.survival ?? 0) * pSurvive;
  if (stance.mercenary) ev *= RENEWAL.MERC_BONUS_HAIRCUT;
  return ev;
}

// ------------------------------------------------------------------ apertura

export function openRenewal(
  world: World,
  club: Club,
  player: Player,
  year: number,
  standings: readonly StandingRow[],
  opts: { betrayed?: boolean },
  rng: Rng,
): { ok: true; state: RenewalState } | { ok: false; reason: string } {
  const contract = player.contractId ? world.contracts.get(player.contractId) : undefined;
  if (!contract) return { ok: false, reason: 'Nessun contratto attivo da rinnovare.' };

  const squad = club.playerIds
    .map((id) => world.players.get(id))
    .filter((p): p is Player => p !== undefined);
  const avg = squad.reduce((s, p) => s + playerOverall(p), 0) / Math.max(1, squad.length);
  const overall = playerOverall(player);
  const t = player.personality;

  const fan = isClubFan(player, club.id);
  const mercenary =
    t.ambition >= RENEWAL.MERC_AMBITION &&
    t.loyalty <= RENEWAL.MERC_LOYALTY &&
    overall >= avg + RENEWAL.MERC_EDGE;
  const bigThinker = t.ambition >= RENEWAL.BIG_AMBITION;
  const projectOk = projectConvinces(world, club, standings);
  const betrayed = opts.betrayed === true;
  const expiring = contract.endYear <= year;

  let ask = expectedWage(overall, player.age);
  if (fan) ask *= 1 - RENEWAL.FAN_DISCOUNT * (0.5 + 0.5 * t.loyalty);
  if (mercenary) ask *= 1 + RENEWAL.MERC_PREMIUM * (1 + t.ambition);
  if (bigThinker && !projectOk) ask *= 1.1;
  if (expiring) ask *= 1 + RENEWAL.EXPIRING_PREMIUM;
  if (betrayed) ask *= 1 + RENEWAL.BETRAYED_PREMIUM;
  if (player.morale < 0.4) ask *= 1.05;
  ask = Math.max(contract.wage, Math.round(ask / 500) * 500);

  const floor = Math.round(
    ask * rng.uniform(RENEWAL.FLOOR_MIN, RENEWAL.FLOOR_MAX) * (fan ? 0.97 : 1),
  );
  const yearsWanted = mercenary ? 2 : player.age < 24 ? 4 : player.age < 30 ? 3 : 2;
  const mood = betrayed ? 0.38 : fan ? 0.8 : mercenary ? 0.55 : 0.65;
  const guaranteeNeeded = bigThinker && !projectOk;
  const agentName = agentNameFor(world, player);
  const selfRep = !player.agencyId;

  const log: RenewalEvent[] = [
    {
      who: 'sistema',
      text: `Tavolo del rinnovo: ${player.name} (${overall.toFixed(0)}, scadenza ${contract.endYear}) — parla ${selfRep ? 'direttamente il giocatore' : agentName}.`,
    },
    {
      who: 'agente',
      text: fan
        ? `${player.name} qui è a casa: vogliamo restare. Parliamo di ${A(ask)} e non se ne parli più.`
        : mercenary
          ? `Siamo lusingati, ma il mercato è caldo. Si parte da ${A(ask)} — e il mio assistito valuta TUTTE le opzioni.`
          : `Per rinnovare chiediamo ${A(ask)}, ${yearsWanted} anni.`,
    },
  ];
  if (betrayed) {
    log.push({
      who: 'agente',
      text: 'E parliamoci chiaro: le promesse dell’ultima volta sono rimaste sulla carta. Stavolta i numeri parlano.',
    });
  }
  if (guaranteeNeeded) {
    log.push({
      who: 'agente',
      text: `${player.name} pensa in grande: qui non si lotta per niente. Senza garanzie vere — premi su trofei e piazzamenti, o rinforzi — non firma.`,
    });
  }

  return {
    ok: true,
    state: {
      playerId: player.id,
      playerName: player.name,
      agentName,
      stage: 'terms',
      round: 0,
      mood,
      askWage: ask,
      floor,
      yearsWanted,
      fan,
      mercenary,
      bigThinker,
      projectOk,
      betrayed,
      guaranteeNeeded,
      log,
    },
  };
}

// ------------------------------------------------------------------ offerte

/** Le garanzie del pensa-in-grande: bonus da grande club o promessa di mercato. */
function hasGuarantees(state: RenewalState, offer: RenewalOfferTerms): boolean {
  const heavy =
    (offer.bonuses?.trophy ?? 0) + (offer.bonuses?.topFinish ?? 0) >=
    state.askWage * RENEWAL.BIG_GUARANTEE_WEEKS;
  return heavy || offer.promise != null;
}

export function offerRenewalTerms(
  world: World,
  state: RenewalState,
  club: Club,
  player: Player,
  offer: RenewalOfferTerms,
  year: number,
  currentRound: number,
  standings: readonly StandingRow[],
  rng: Rng,
): RenewalState {
  if (state.stage !== 'terms') return state;
  const contract = player.contractId ? world.contracts.get(player.contractId) : undefined;
  if (!contract) {
    state.stage = 'failed';
    state.log.push({ who: 'sistema', text: 'Il contratto non esiste più.' });
    return state;
  }

  const years = Math.max(1, Math.min(5, Math.round(offer.years)));
  state.log.push({
    who: 'tu',
    text: `Offro ${A(offer.wage)} per ${years} anni${describeExtras(offer)}.`,
  });

  // Vincolo macchina: il nuovo fisso deve stare nel monte (i bonus si pagano a consuntivo).
  const { budget } = wageBudgetStatus(world, club);
  const newBill = clubWageBill(world, club) - contract.wage + offer.wage;
  if (newBill > budget) {
    state.log.push({
      who: 'sistema',
      text: `Il monte ingaggi non regge questo fisso (${A(newBill)} > ${A(budget)}): alza il tetto o abbassa l'offerta.`,
    });
    return state;
  }

  state.round += 1;
  const t = player.personality;
  const rank = reputationRank(world, club, standings);
  const stance = { mercenary: state.mercenary, bigThinker: state.bigThinker };
  let value =
    offer.wage +
    bonusExpectedValue(offer.bonuses, player, rank, stance) / 52 +
    (offer.promise != null ? state.askWage * RENEWAL.PROMISE_VALUE : 0);
  const mismatch = Math.abs(years - state.yearsWanted);
  value *= 1 - RENEWAL.YEARS_MISMATCH * mismatch;

  // Il pensa-in-grande senza garanzie non firma, a nessuna cifra (MODULE_CONTRACTS §2).
  if (state.guaranteeNeeded && !hasGuarantees(state, offer)) {
    state.mood = Math.max(0, state.mood - 0.15);
    state.log.push({
      who: 'agente',
      text: 'Non è questione di soldi. Vogliamo un progetto: premi legati ai risultati o rinforzi veri. Così non firma.',
    });
    return closeIfExhausted(state, currentRound, true);
  }

  // Accettazione: pacchetto ≥ richiesta, o ≥ floor all'ultimo giro.
  const lastRound = state.round >= RENEWAL.MAX_ROUNDS;
  if (value >= state.askWage || (lastRound && value >= state.floor)) {
    applyRenewal(contract, offer, year, years);
    state.stage = 'done';
    state.agreedWage = offer.wage;
    state.agreedYears = years;
    state.agreedBonuses = contract.bonuses;
    state.agreedPromise = offer.promise ?? null;
    state.mood = Math.min(1, state.mood + 0.25);
    state.log.push({
      who: 'agente',
      text:
        value >= state.askWage
          ? state.fan
            ? `Affare fatto. ${state.playerName} non vedeva l'ora: qui è casa sua.`
            : `Affare fatto: ${A(offer.wage)} fino al ${contract.endYear}.`
          : `E va bene, a malincuore: firmiamo a ${A(offer.wage)} fino al ${contract.endYear}. Ma ci aspettiamo fatti.`,
    });
    if (offer.promise != null) {
      state.log.push({
        who: 'sistema',
        text: 'Promessa registrata: un rinforzo nel reparto entro la prossima finestra. Le promesse, qui, si verificano.',
      });
    }
    return state;
  }

  // Insulto: il valore non arriva a INSULT × richiesta.
  if (value < state.askWage * RENEWAL.INSULT) {
    state.mood = Math.max(0, state.mood - 0.3 - 0.15 * t.temperament);
    state.askWage = Math.round(state.askWage * 1.02);
    state.log.push({
      who: 'agente',
      text: state.fan
        ? 'Guarda che l’affetto non si sfrutta. Fai un’offerta seria.'
        : 'Questa è un’offesa. Se il club la pensa così, ne prendiamo atto.',
    });
    if (state.mood < RENEWAL.WALKOUT_MOOD) {
      state.stage = 'failed';
      state.cooldownUntilRound = currentRound + RENEWAL.COOLDOWN;
      state.log.push({
        who: 'sistema',
        text: `Il tavolo salta: l'entourage non risponderà per ${RENEWAL.COOLDOWN} giornate.`,
      });
    }
    return state;
  }

  // Il mercenario può prendere tempo dal 2° giro (MODULE_CONTRACTS §2).
  if (state.mercenary && state.round >= 2 && rng.chance(RENEWAL.MERC_STALL_P)) {
    state.stage = 'stalled';
    state.stallUntilRound = currentRound + rng.int(RENEWAL.MERC_STALL_MIN, RENEWAL.MERC_STALL_MAX);
    state.log.push({
      who: 'agente',
      text: 'Mi prendo qualche settimana: ci sono altri club alla porta e sarebbe sciocco non ascoltarli. Ci risentiamo.',
    });
    return state;
  }

  // Controproposta: scende verso il floor con mood e giri; la compostezza frena.
  const give =
    0.5 + 0.25 * state.mood + 0.1 * state.round - 0.25 * t.composure + (state.fan ? 0.1 : 0);
  const newAsk = Math.max(
    state.floor,
    Math.round((value + (state.askWage - value) * Math.max(0.15, 1 - give)) / 500) * 500,
  );
  state.mood = Math.min(1, state.mood + 0.07);
  state.askWage = newAsk;
  state.log.push({
    who: 'agente',
    text: `Non basta. Ci vediamo a ${A(newAsk)} e ne parliamo${mismatch > 0 ? ` — e su ${state.yearsWanted} anni, non ${years}` : ''}.`,
  });
  return closeIfExhausted(state, currentRound, false);
}

/** A giri finiti: rifiuto (cooldown) — o addio annunciato se il progetto non convince. */
function closeIfExhausted(
  state: RenewalState,
  currentRound: number,
  guaranteeRefusal: boolean,
): RenewalState {
  if (state.round < RENEWAL.MAX_ROUNDS) return state;
  if ((state.bigThinker || state.mercenary) && (!state.projectOk || guaranteeRefusal)) {
    state.stage = 'leaving';
    state.log.push({
      who: 'agente',
      text: `Abbiamo deciso: ${state.playerName} arriverà a scadenza e sceglierà altrove. Grazie di tutto.`,
    });
  } else {
    state.stage = 'failed';
    state.cooldownUntilRound = currentRound + RENEWAL.COOLDOWN;
    state.log.push({
      who: 'sistema',
      text: `Niente accordo: se ne riparla tra ${RENEWAL.COOLDOWN} giornate.`,
    });
  }
  return state;
}

/**
 * Riapre uno stallo del mercenario: richiesta su, o addio se il progetto non convince.
 * Se il guscio passa un `rival` REALE (`bestRivalInterest`), l'agente lo cita e la
 * richiesta sale almeno al suo livello (MODULE_MARKET §9.4).
 */
export function resumeRenewal(
  state: RenewalState,
  currentRound: number,
  rival?: { clubName: string; wage: number } | null,
): RenewalState {
  if (state.stage !== 'stalled') return state;
  if (state.stallUntilRound !== undefined && currentRound < state.stallUntilRound) return state;
  if (!state.projectOk) {
    state.stage = 'leaving';
    state.log.push({
      who: 'agente',
      text: rival
        ? `Il ${rival.clubName} ha chiamato davvero. ${state.playerName} a scadenza cambierà aria: il progetto qui non lo convince.`
        : `Le offerte sono arrivate davvero. ${state.playerName} a scadenza cambierà aria: il progetto qui non lo convince.`,
    });
    return state;
  }
  state.stage = 'terms';
  const raised = Math.round((state.askWage * RENEWAL.MERC_STALL_RAISE) / 500) * 500;
  state.askWage = rival ? Math.max(raised, Math.round((rival.wage * 1.02) / 500) * 500) : raised;
  state.floor = Math.round(state.floor * RENEWAL.MERC_STALL_RAISE);
  state.log.push({
    who: 'agente',
    text: rival
      ? `Rieccoci. Il ${rival.clubName} mette sul piatto ${A(rival.wage)}: se volete tenerlo, la base è ${A(state.askWage)}. Decidete.`
      : `Rieccoci. Le altre proposte esistono, quindi la base ora è ${A(state.askWage)}. Decidete.`,
  });
  return state;
}

/**
 * Il rivale più credibile per un giocatore (deterministico, niente RNG): il club più
 * blasonato che potrebbe permetterselo davvero. Nutre lo stallo del mercenario.
 */
export function bestRivalInterest(
  world: World,
  club: Club,
  player: Player,
  _year: number,
): { clubName: string; wage: number } | null {
  const candidates = [...world.clubs.values()]
    .filter(
      (c) =>
        c.id !== club.id &&
        c.reputation >= club.reputation - 5 &&
        c.finances.transferBudget >= 5_000_000,
    )
    .sort((a, b) => b.reputation - a.reputation);
  const rival = candidates[0];
  if (!rival) return null;
  const premium = rival.reputation > club.reputation ? 1.15 : 1.05;
  const wage = Math.round((expectedWage(playerOverall(player), player.age) * premium) / 500) * 500;
  return { clubName: rival.name, wage };
}

function applyRenewal(
  contract: Contract,
  offer: RenewalOfferTerms,
  year: number,
  years: number,
): void {
  // F2b: il residuo a bilancio si ri-spalma sulla nuova durata (MODULE_FINANCES §6.4).
  contract.transferFee = bookValue(contract, year) || undefined;
  contract.wage = offer.wage;
  contract.startYear = year;
  contract.endYear = year + years;
  const b = offer.bonuses ?? {};
  const clean: ContractBonuses = {};
  if (b.perGoal) clean.perGoal = b.perGoal;
  if (b.perAssist) clean.perAssist = b.perAssist;
  if (b.trophy) clean.trophy = b.trophy;
  if (b.topFinish) clean.topFinish = b.topFinish;
  if (b.survival) clean.survival = b.survival;
  contract.bonuses = Object.keys(clean).length > 0 ? clean : undefined;
}

function describeExtras(offer: RenewalOfferTerms): string {
  const parts: string[] = [];
  const b = offer.bonuses;
  if (b?.perGoal) parts.push(`${K(b.perGoal)}/gol`);
  if (b?.perAssist) parts.push(`${K(b.perAssist)}/assist`);
  if (b?.trophy) parts.push(`${K(b.trophy)} titolo`);
  if (b?.topFinish) parts.push(`${K(b.topFinish)} top-4`);
  if (b?.survival) parts.push(`${K(b.survival)} salvezza`);
  if (offer.promise != null) parts.push(`promessa di un rinforzo (${offer.promise})`);
  return parts.length > 0 ? `, con ${parts.join(', ')}` : '';
}

/**
 * Scadenza della promessa (MODULE_CONTRACTS §6): ultima giornata della PROSSIMA finestra
 * di questa stagione; null = la stagione non ha più finestre (il guscio rimanda alla
 * finestra estiva della stagione successiva).
 */
export function promiseDeadline(currentRound: number, totalRounds: number): number | null {
  let last: number | null = null;
  for (let r = currentRound + 1; r <= totalRounds; r++) {
    if (marketWindowOpen(r, totalRounds)) last = r;
    else if (last !== null) return last; // la finestra si è appena chiusa
  }
  return last;
}
