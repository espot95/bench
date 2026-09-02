/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import {
  RENEWAL,
  type RenewalOfferTerms,
  type RenewalState,
  bestRivalInterest,
  isClubFan,
  offerRenewalTerms,
  openRenewal,
  promiseDeadline,
  resumeRenewal,
} from '../../src/contracts/renewal-negotiation';
import { archetypeHeatmap, playerArchetype } from '../../src/core/archetypes';
import { clubWageBill } from '../../src/core/finance';
import { baricentroLabel, playerHeight } from '../../src/core/physique';
import { playerOverall } from '../../src/core/ratings';
import { SECTOR_IDS, stadiumCapacity } from '../../src/core/stadium';
import {
  type Club,
  type Season,
  type StandingRow,
  type World,
  leagueOfClub,
  nationOfClub,
} from '../../src/core/types';
import type { CommercialId, SectorId } from '../../src/core/types';
import type { PriceLevel } from '../../src/core/types';
import type { SponsorContract, SponsorSlot } from '../../src/core/types';
import { type OffseasonSummary, closeSeason, offseasonSummary } from '../../src/engine/career';
import { bestAssignment } from '../../src/engine/lineup';
import { moraleLabel, moraleShock } from '../../src/engine/morale';
import {
  type SeasonRunner,
  createRunner,
  createSeason,
  seasonStandings,
} from '../../src/engine/season';
import {
  CITY_STRUCTURES,
  COMMERCIALS,
  type NamingProposal,
  type ProjectRequest,
  fanDensityAt,
  fanNamingProposal,
  fanZones,
  locationFactor,
  priceMultiplier,
  quoteProject,
  renameSector,
  sectorName,
  setStadiumActivityPrice,
  setStructurePrice,
  setTicketPrice,
  startProject,
  ticketFactors,
} from '../../src/engine/stadium';
import { squadBookValue } from '../../src/finances/book-value';
import { FINANCES } from '../../src/finances/season-economy';
import {
  type SponsorOffer,
  initialSponsors,
  signSponsor,
  sponsorOffersFor,
} from '../../src/finances/sponsors';
import {
  FISCAL,
  overdraftLimit,
  projectedStatement,
  spendingRoom,
  sustainability,
  syncUserBudgets,
} from '../../src/finances/treasury';
import { generateWorld } from '../../src/generation/generate-world';
import { applyRosterPack } from '../../src/generation/roster-pack';
import {
  type DealNews,
  type IncomingOffer,
  isDeadlineDay,
  marketWindowOpen,
  refusalMoraleHit,
  resolveCounter,
  returnOffer,
  sellToAI,
  solicitOffers,
} from '../../src/market/ai';
import {
  type AgreedDeal,
  NEGOTIATION,
  type NegotiationState,
  bookTrip,
  dealFromState,
  dsSuggestions,
  executeDeal,
  offerFee,
  offerWage,
  openNegotiation,
  playerMarketStatus,
} from '../../src/market/negotiation';
import { askingPrice, contractYearsLeft } from '../../src/market/transfers';
import { baseMarketValue } from '../../src/market/value';
import type { MarketPromise, RejectedOfferMemory, RenewalNote } from '../../src/persistence/codec';
import { createRng } from '../../src/rng/rng';
import { scoutedHeatmap } from '../../src/scouting/report';
import { clubIdentity } from './identity';
import { REAL_PACKS } from './packs';

export interface GameSession {
  world: World;
  club: Club;
  season: Season;
  runner: SeasonRunner;
  year: number;
  seed: number;
  /** Proposta della curva per intitolare uno spalto (MODULE_STADIUM §3.3). */
  naming?: NamingProposal | null;
  namingSeason?: number;
  /** Mercato AI (MODULE_MARKET §7): offerte in arrivo e feed notizie. */
  offers?: IncomingOffer[];
  news?: DealNews[];
  /** Viaggi di mercato (MODULE_MARKET §8): stato della sessione, l'engine decide. */
  shortlist?: string[];
  preDeals?: AgreedDeal[];
  lastTripRound?: number;
  negotiation?: NegotiationState | null;
  /** Riepilogo dell'ultima chiusura di stagione, finché l'utente non lo archivia (MODULE_UI §6). */
  offseason?: OffseasonSummary | null;
  /** Rinnovi (MODULE_CONTRACTS): tavolo attivo, dossier per giocatore, promesse di mercato. */
  renewal?: RenewalState | null;
  renewalNotes?: Record<string, RenewalNote>;
  promises?: MarketPromise[];
  /** Memoria delle offerte AI rifiutate: possono tornare col rilancio (MODULE_MARKET §9.4). */
  rejectedOffers?: RejectedOfferMemory[];
  /** Osservazioni-scouting per giocatore (MODULE_SCOUTING §7, v1): sgranano le heatmap. */
  observations?: Record<string, number>;
  /** Offerte sponsor per gli slot scoperti (MODULE_SPONSORS §3). */
  sponsorOffers?: Record<string, SponsorOffer[]>;
}

/**
 * Chiude la stagione giocata e apre la successiva (MODULE_UI §6): le altre divisioni
 * giocano, off-season completo (conti, invecchiamento, ritiri, rinnovi, giovani,
 * promo/retro, budget), nuova stagione nella lega in cui il club si ritrova. Tutto nel
 * motore (`closeSeason`, la stessa funzione della CLI); qui solo il riassemblaggio della
 * sessione. I pre-accordi restano: si onorano alla finestra estiva (MODULE_MARKET §8.5).
 */
export function advanceSeason(s: GameSession): OffseasonSummary {
  if (!s.runner.isFinished()) throw new Error('La stagione non è ancora finita');
  const oldLeague = leagueOfClub(s.world, s.club.id);
  const squadBefore = [...s.club.playerIds];
  const closed = closeSeason(s.world, s.season, s.seed, s.year, { userClubId: s.club.id });
  const summary = offseasonSummary(s.world, s.club, oldLeague, closed, s.year, squadBefore);
  s.year += 1;
  s.season = createSeason(s.world, leagueOfClub(s.world, s.club.id), s.year, s.seed + s.year);
  s.runner = createRunner(s.world, s.season, createRng(s.seed + s.year));
  s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
  // Stato per-stagione: si azzera. Gazzetta, shortlist e pre-accordi sopravvivono;
  // dei dossier-rinnovo restano solo memoria lunga (tradimenti, addii annunciati).
  s.offers = [];
  s.negotiation = null;
  s.lastTripRound = undefined;
  s.naming = null;
  s.renewal = null;
  for (const note of Object.values(s.renewalNotes ?? {})) {
    note.stallState = undefined;
    note.cooldownUntil = undefined;
  }
  // Mercato sponsor (MODULE_SPONSORS §3): offerte per ogni slot rimasto scoperto.
  if (s.club.sponsors !== undefined) {
    const covered = new Set(s.club.sponsors.map((c) => c.slot));
    const offers: Record<string, SponsorOffer[]> = {};
    for (const slot of ['maglia', 'tecnico', 'stadio', 'allenamento'] as SponsorSlot[]) {
      if (covered.has(slot)) continue;
      const incumbent = closed.sponsorResult.expired.find((c) => c.slot === slot);
      offers[slot] = sponsorOffersFor(
        s.world,
        s.club,
        slot,
        s.year,
        createRng((s.seed ^ hashStr(slot)) + s.year * 131),
        incumbent,
      );
    }
    s.sponsorOffers = offers;
  }
  s.offseason = summary;
  return summary;
}

/**
 * RosterPack (MODULE_ARCHETYPES §4): il guscio mappa i pack sui club generati via
 * identity (città + colore del kit) e li applica PRIMA di createSeason (liste/Elo dopo).
 */
export function applyRealPacks(world: World): { club: string; applied: number }[] {
  const out: { club: string; applied: number }[] = [];
  for (const pack of REAL_PACKS) {
    // Più club generati possono condividere città e kit: il pack veste SOLO il migliore
    // (prima il tier, poi la reputazione) — un solo erede per tradizione.
    const candidates = [...world.clubs.values()]
      .filter((club) => {
        const league = leagueOfClub(world, club.id);
        const nation = nationOfClub(world, club.id)?.code ?? 'ITA';
        const id = clubIdentity(club.name, club.reputation, league.name, nation);
        return (
          pack.city === id.city.name && pack.kitPrimary.toLowerCase() === id.primary.toLowerCase()
        );
      })
      .sort(
        (a, b) =>
          leagueOfClub(world, a.id).tier - leagueOfClub(world, b.id).tier ||
          b.reputation - a.reputation,
      );
    const club = candidates[0];
    if (!club) continue;
    const res = applyRosterPack(world, club.id, pack.players);
    out.push({ club: club.name, applied: res.applied });
  }
  return out;
}

export function newManagerCareer(seed: number, clubIndex: number): GameSession {
  const world = generateWorld(createRng(seed));
  applyRealPacks(world);
  const club = [...world.clubs.values()][clubIndex] ?? [...world.clubs.values()][0]!;
  const year = 2026;
  // Sponsor come contratti (MODULE_SPONSORS §1): 4 slot iniziali, scadenze sfalsate.
  initialSponsors(world, club, year);
  const season = createSeason(world, leagueOfClub(world, club.id), year, seed + year);
  const runner = createRunner(world, season, createRng(seed + year));
  runner.setLineup(club.id, bestAssignment(club, world));
  return { world, club, season, runner, year, seed };
}

export function listClubs(seed: number): { name: string; league: string }[] {
  const world = generateWorld(createRng(seed));
  return [...world.clubs.values()].map((c) => ({
    name: c.name,
    league: leagueOfClub(world, c.id).name,
  }));
}

export interface RoundResult {
  round: number;
  scoreline: string | null;
  standings: StandingRow[];
  position: number;
}

export function playRound(s: GameSession): RoundResult {
  const res = s.runner.playRound(s.club.id);
  // Mercato: accumula notizie e offerte; le scadute cadono, i venduti spariscono.
  s.news = [...(s.news ?? []), ...res.marketNews].slice(-30);
  s.offers = [
    ...(s.offers ?? []).filter(
      (o) => o.expiresRound > res.round && s.club.playerIds.includes(o.playerId),
    ),
    ...res.offers,
  ];
  // Pre-accordi (§8.5): alla prima giornata utile di finestra si onorano (o sfumano).
  const total = s.runner.totalRounds();
  const window = marketWindowOpen(res.round, total);
  if (window && (s.preDeals?.length ?? 0) > 0) {
    for (const d of s.preDeals ?? []) {
      const out = executeDeal(s.world, s.club, d, s.year);
      if (out.ok) {
        s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
        fulfilPromises(s, d.playerId as string, res.round);
      }
      s.news = [
        ...(s.news ?? []),
        {
          round: res.round,
          buyer: s.club.name,
          seller: d.sellerName,
          player: d.playerName,
          fee: d.fee,
          headline: out.ok
            ? `PRE-ACCORDO ONORATO: ${d.playerName} è ufficialmente del ${s.club.name} (${(d.fee / 1e6).toFixed(1)}M).`
            : `SFUMA IL PRE-ACCORDO per ${d.playerName}: ${out.reason}.`,
        },
      ].slice(-30);
    }
    s.preDeals = [];
  }
  // La gazzetta ricorda la shortlist all'apertura della finestra.
  if (window && !marketWindowOpen(res.round - 1, total) && (s.shortlist?.length ?? 0) > 0) {
    s.news = [
      ...(s.news ?? []),
      {
        round: res.round,
        buyer: s.club.name,
        seller: '',
        player: '',
        fee: 0,
        headline: `MERCATO ${window.toUpperCase()} APERTO: il tuo taccuino conta ${s.shortlist!.length} obiettivi. Il DS aspetta istruzioni.`,
      },
    ].slice(-30);
  }
  // Le promesse di mercato scadono e si verificano (MODULE_CONTRACTS §6).
  checkPromises(s, res.round);
  // Scouting v1 (MODULE_SCOUTING §7): giocare CONTRO qualcuno è un'osservazione.
  if (res.round && s.season.fixtures) {
    const m2 = s.season.fixtures.find(
      (x) => x.round === res.round && (x.homeClubId === s.club.id || x.awayClubId === s.club.id),
    );
    const oppId = m2 ? (m2.homeClubId === s.club.id ? m2.awayClubId : m2.homeClubId) : null;
    const opp = oppId ? s.world.clubs.get(oppId) : undefined;
    if (opp) {
      if (!s.observations) s.observations = {};
      for (const pid of opp.playerIds) {
        s.observations[pid as string] = (s.observations[pid as string] ?? 0) + 1;
      }
    }
  }
  // M4 (MODULE_MARKET §9.4): hot list (addii annunciati/cessioni richieste) e ritorni.
  if (window) {
    const hot = Object.entries(s.renewalNotes ?? {})
      .filter(([, n]) => n.leaving || n.wantsOut)
      .map(([id]) => id as PlayerId);
    if (hot.length > 0) {
      const extra = solicitOffers(
        s.world,
        s.club,
        hot,
        res.round,
        total,
        createRng((s.seed ^ 0x9f37) + res.round * 613),
      );
      s.offers = [...(s.offers ?? []), ...extra];
    }
    for (const r of (s.rejectedOffers ?? []).filter((x) => !x.retried)) {
      r.retried = true;
      const back = returnOffer(
        s.world,
        s.club,
        r,
        res.round,
        total,
        createRng((s.seed ^ 0x3c1f) + res.round * 271 + hashStr(r.playerId)),
      );
      if (back) {
        s.offers = [...(s.offers ?? []), back];
        gazzetta(
          s,
          res.round,
          `IL ${back.fromClubName.toUpperCase()} NON MOLLA: rilancio per ${back.playerName} (${(back.bid / 1e6).toFixed(1)}M).`,
        );
      }
    }
  }
  const m = res.userMatch;
  const home = m ? s.world.clubs.get(m.homeClubId)?.name : null;
  const away = m ? s.world.clubs.get(m.awayClubId)?.name : null;
  return {
    round: res.round,
    scoreline: m ? `${home} ${m.homeGoals} - ${m.awayGoals} ${away}` : null,
    standings: res.standings,
    position: res.standings.findIndex((r) => r.clubId === s.club.id) + 1,
  };
}

export function dashboard(s: GameSession) {
  const table = seasonStandings(s.world, s.season);
  const pos = table.findIndex((r) => r.clubId === s.club.id) + 1;
  const squad = s.club.playerIds.map((id) => s.world.players.get(id)!).filter(Boolean);
  const morale = squad.reduce((a, p) => a + p.morale, 0) / squad.length;
  const next = s.season.fixtures.find(
    (m) => !m.played && (m.homeClubId === s.club.id || m.awayClubId === s.club.id),
  );
  const opp = next
    ? s.world.clubs.get(next.homeClubId === s.club.id ? next.awayClubId : next.homeClubId)
    : undefined;
  return {
    position: pos || '—',
    nextMatch: next
      ? `${opp?.name} (${next.homeClubId === s.club.id ? 'casa' : 'trasferta'})`
      : 'stagione finita',
    morale: moraleLabel(morale),
    finished: s.runner.isFinished(),
    round: s.runner.nextRound(),
    total: s.runner.totalRounds(),
  };
}

/** Anteprime al passaggio del mouse sulle strutture dell'hub cittadino. */
export function hubDetails(s: GameSession): Record<'stadio' | 'campo' | 'staff', string> {
  const d = dashboard(s);
  const squad = s.club.playerIds.map((id) => s.world.players.get(id)!).filter(Boolean);
  const avg = Math.round(squad.reduce((a, p) => a + playerOverall(p), 0) / squad.length);
  const injured = squad.filter((p) => injuryLabel(p)).length;
  const cap = stadiumCapacity(s.club);
  return {
    stadio: d.finished
      ? `${(cap / 1000).toFixed(0)}k posti · stagione finita`
      : `vs ${d.nextMatch} · ${(cap / 1000).toFixed(0)}k posti`,
    campo: `media rosa ${avg} · ${injured === 0 ? 'nessun infortunato' : `${injured} infortunat${injured === 1 ? 'o' : 'i'}`}`,
    staff: `budget mercato ${(s.club.finances.transferBudget / 1e6).toFixed(0)}M · cassa ${(s.club.finances.cash / 1e6).toFixed(0)}M`,
  };
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
      overall: Math.round(playerOverall(p)),
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

// ---- Player detail (own players: real attributes; potential stays HIDDEN) ----
import { personalityLabel } from '../../src/core/personality';
import { injuryLabel } from '../../src/engine/injury';

/** Card-heatmap dal punto di vista dell'utente (i TUOI esatti, gli altrui osservati). */
export interface HeatView {
  grid: number[][];
  archetype: string;
  height: number;
  baricentro: string;
  /** null = conoscenza piena (tuo giocatore). */
  obs: number | null;
}

export function playerHeatView(s: GameSession, playerId: string): HeatView | null {
  const p = s.world.players.get(playerId as PlayerId);
  if (!p) return null;
  const mine = s.club.playerIds.includes(p.id);
  const obs = mine ? null : (s.observations?.[playerId] ?? 0);
  const grid = mine
    ? archetypeHeatmap(playerArchetype(p), p.preferredFoot)
    : scoutedHeatmap(p, Math.max(1, obs ?? 0));
  return {
    grid,
    archetype: playerArchetype(p).label,
    height: playerHeight(p),
    baricentro: baricentroLabel(p),
    obs,
  };
}

export function playerDetail(s: GameSession, name: string) {
  const p = s.club.playerIds.map((id) => s.world.players.get(id)!).find((x) => x?.name === name);
  if (!p) return null;
  const contract = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
  return {
    heat: playerHeatView(s, p.id as string),
    name: p.name,
    pos: p.position,
    age: p.age,
    nationality: p.nationality,
    foot: p.preferredFoot,
    overall: Math.round(playerOverall(p)),
    morale: moraleLabel(p.morale),
    label: personalityLabel(p),
    injury: injuryLabel(p) || null,
    wage: contract ? Math.round(contract.wage / 1000) : 0,
    contractEnd: contract?.endYear ?? null,
    attrs: Object.entries(p.attributes as unknown as Record<string, number>),
    adapting: p.transferStatus ? p.transferStatus.rampRemaining : null,
  };
}

// ---- Mercato (MODULE_MARKET §7): la scrivania delle trattative del presidente ----

export function marketView(s: GameSession) {
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const window = s.runner.isFinished() ? null : marketWindowOpen(round, total);
  return {
    window,
    deadline: window ? isDeadlineDay(round, total) : false,
    offers: (s.offers ?? []).map((o, i) => ({
      index: i,
      player: o.playerName,
      from: o.fromClubName,
      fromRep: o.fromReputation,
      bid: o.bid,
      ask: o.ask,
      expiresIn: Math.max(0, o.expiresRound - round + 1),
      countered: !!o.countered,
      bigStep: o.fromReputation >= s.club.reputation + 10,
    })),
    news: [...(s.news ?? [])].reverse(),
  };
}

function dropOffer(s: GameSession, index: number): IncomingOffer | null {
  const o = (s.offers ?? [])[index] ?? null;
  if (o) s.offers = (s.offers ?? []).filter((_, i) => i !== index);
  return o;
}

/** Il presidente accetta: si vende al prezzo offerto. */
export function acceptOffer(s: GameSession, index: number): string {
  const o = dropOffer(s, index);
  if (!o) return 'Offerta non più valida.';
  const ok = sellToAI(s.world, s.club, o, o.bid);
  refreshTreasury(s);
  return ok
    ? `${o.playerName} ceduto al ${o.fromClubName} per ${(o.bid / 1e6).toFixed(1)}M. La cassa ringrazia.`
    : 'La trattativa è sfumata.';
}

/** Una sola controrichiesta: il prezzo pieno del cartellino. */
export function counterOffer(s: GameSession, index: number): string {
  const o = (s.offers ?? [])[index];
  if (!o) return 'Offerta non più valida.';
  if (o.countered) return 'Hai già rilanciato: ora o accetti o rifiuti.';
  o.countered = true;
  const res = resolveCounter(s.world, o, o.ask, createRng(s.seed * 131 + o.round * 17 + index));
  if (!res.accepted) {
    dropOffer(s, index);
    return res.reason;
  }
  dropOffer(s, index);
  sellToAI(s.world, s.club, o, o.ask);
  return `${o.playerName} ceduto al ${o.fromClubName}: ${res.reason}`;
}

/** Rifiuto: se era il Grande Salto, l'ambizioso la prende male. */
export function rejectOffer(s: GameSession, index: number): string {
  const o = dropOffer(s, index);
  if (!o) return 'Offerta non più valida.';
  const hit = refusalMoraleHit(s.world, s.club, o);
  // Il club rifiutato può tornare col rilancio (MODULE_MARKET §9.4).
  s.rejectedOffers = [
    ...(s.rejectedOffers ?? []),
    {
      playerId: o.playerId as string,
      fromClubId: o.fromClubId as string,
      bid: o.bid,
      round: o.round,
    },
  ].slice(-10);
  return hit > 0
    ? `Offerta respinta. ${o.playerName} sperava nel grande salto: morale in calo.`
    : `Offerta respinta. ${o.playerName} resta concentrato.`;
}

// ---- Sede del club: il centro di controllo della PRESIDENZA (MODULE_PRESIDENT) ----

const LEDGER_LABELS: Record<string, string> = {
  gate: 'Biglietteria',
  sponsor: 'Sponsor',
  tv: 'Diritti TV',
  prize: 'Premi campionato',
  coppa: 'Coppe',
  transfer_out: 'Cessioni (recupero a bilancio)',
  plusvalenza: 'Plusvalenze',
  commerciale: 'Attività commerciali',
  wages: 'Stipendi calciatori',
  facilities: 'Gestione impianti',
  matchday: 'Costi del matchday',
  interessi: 'Interessi sul fido',
  transfer_in: 'Cartellini',
  agency_fees: 'Commissioni agenti',
  stadio: 'Cantieri stadio',
  other: 'Altro',
};

function groupLedger(entries: { type: string; amount: number }[]) {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.type, (m.get(e.type) ?? 0) + e.amount);
  return [...m]
    .map(([type, amount]) => ({ label: LEDGER_LABELS[type] ?? type, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** La scrivania del presidente: consiglio, casse, libri contabili. */
export function sedeView(s: GameSession) {
  const pres = [...(s.world.presidents?.values() ?? [])].find((p) => p.clubId === s.club.id);
  const f = s.club.finances;
  return {
    president: pres
      ? {
          name: pres.name,
          traits: {
            ambition: pres.personality.ambition,
            composure: pres.personality.composure,
            temperament: pres.personality.temperament,
          },
        }
      : null,
    reputation: s.club.reputation,
    cash: f.cash,
    transferBudget: f.transferBudget,
    wageBudget: f.wageBudget,
    weeklyBill: clubWageBill(s.world, s.club),
    incomes: groupLedger(f.incomes),
    expenses: groupLedger(f.expenses),
  };
}

// ---- Staff (MODULE_MANAGER §7): view + hire preparatori ----
import { fitLabel, squadFit, styleLabel } from '../../src/engine/coach-styles';

export function staffView(s: GameSession) {
  const coach = [...(s.world.managers?.values() ?? [])].find((m) => m.clubId === s.club.id);
  return {
    coach: coach
      ? {
          name: coach.name,
          rep: coach.reputation,
          style: styleLabel(coach.style),
          fit: fitLabel(squadFit(s.world, s.club, coach.style)),
        }
      : null,
    staff: (s.club.staff ?? []).map((m) => ({ name: m.name, role: m.role, quality: m.quality })),
    cash: Math.round(s.club.finances.cash / 1e6),
  };
}

const PREP_COST = 2_000_000;

/** Hire an extra athletic trainer (simplified: the president signs off — MODULE_MANAGER §7). */
export function hirePreparatore(s: GameSession): string {
  if (s.club.finances.cash < PREP_COST) return 'Cassa del club insufficiente (servono 2M).';
  const quality = Math.min(95, Math.round(55 + Math.random() * 0 + s.club.reputation * 0.3));
  s.club.finances.cash -= PREP_COST;
  s.club.staff = [
    ...(s.club.staff ?? []),
    { name: `Preparatore ${(s.club.staff?.length ?? 0) + 1}`, role: 'preparatore', quality },
  ];
  s.club.finances.expenses.push({
    type: 'other',
    amount: PREP_COST,
    year: s.year,
    note: 'nuovo preparatore atletico',
  });
  return `Preparatore assunto (qualità ${quality}) — sosterrà il fisico dei veterani.`;
}

// ---- Club dossier for the showcase home (MODULE_UI: one club per screen) ----
export interface ClubDossier {
  index: number;
  name: string;
  league: string;
  reputation: number;
  capacity: number;
  transferBudget: number;
  cash: number;
  presidentName: string;
  presidentTraits: { ambition: number; composure: number; temperament: number };
  coachName: string;
  squadAvg: number;
  nation: string;
}

/** Dati per l'identità procedurale del club della sessione (shell → identity.ts). */
export function clubInfo(s: GameSession): {
  name: string;
  reputation: number;
  league: string;
  nation: string;
} {
  const lg = leagueOfClub(s.world, s.club.id);
  return {
    name: s.club.name,
    reputation: s.club.reputation,
    league: lg.name,
    nation: s.world.nations?.find((n) => n.id === lg.nationId)?.code ?? 'ITA',
  };
}

/** ---- Builder dello stadio (MODULE_STADIUM, guscio: chiama solo l'engine) ---- */

const COMMERCIAL_NAMES: Record<CommercialId, string> = {
  bar: 'Bar',
  ristorante: 'Ristorante',
  hotel: 'Hotel',
  centroCommerciale: 'Centro commerciale',
  teatro: 'Teatro',
  opera: 'Opera',
  concerti: 'Concerti (licenza)',
  negozio: 'Negozio del club',
  museo: 'Museo del club',
};

function projectLabel(s: GameSession): string | null {
  const p = s.club.stadium.project;
  if (!p) return null;
  const target = p.target ? sectorName(s.club.stadium, p.target) : '';
  const what =
    p.kind === 'espansione'
      ? `Espansione ${target} (+${p.addedSeats} posti)`
      : p.kind === 'anello'
        ? `Anello superiore — ${target}`
        : p.kind === 'copertura'
          ? `Copertura — ${target}`
          : p.kind === 'terreno'
            ? 'Rifacimento terreno in erba'
            : `Costruzione: ${p.commercial ? COMMERCIAL_NAMES[p.commercial] : ''}`;
  return `${what} · ${p.matchdaysLeft} giornate al termine`;
}

export function stadiumView(s: GameSession) {
  const st = s.club.stadium;
  return {
    capacity: stadiumCapacity(s.club),
    cash: s.club.finances.cash,
    pitch: st.pitch,
    project: projectLabel(s),
    /** Cantiere per il render 3D (impalcature/gru sul settore in lavori). */
    site: st.project ? { kind: st.project.kind, target: st.project.target ?? null } : null,
    sectors: SECTOR_IDS.map((id) => {
      const sec = st.sectors[id];
      return { id, name: sectorName(st, id), custom: !!st.sectorNames?.[id], ...sec };
    }),
    /** Stato grezzo dei settori per il render 3D per-settore. */
    render: Object.fromEntries(
      SECTOR_IDS.map((id) => [
        id,
        {
          seats: st.sectors[id].seats,
          tiers: st.sectors[id].tiers,
          covered: st.sectors[id].covered,
        },
      ]),
    ),
    commercial: COMMERCIALS.map((c) => {
      const quote = quoteProject(s.club, { kind: 'commerciale', commercial: c.id });
      return {
        id: c.id,
        name: COMMERCIAL_NAMES[c.id],
        cost: c.cost,
        built: st.commercial.includes(c.id),
        price: (st.commercialPrices?.[c.id] ?? 'standard') as PriceLevel,
        ok: quote.ok,
        reason: quote.reason ?? null,
      };
    }),
    /** Biglietteria (MODULE_STADIUM §3.2): prezzo attuale + stime per livello. */
    ticket: {
      current: (st.ticketPrice ?? 'standard') as PriceLevel,
      options: (['popolare', 'standard', 'premium'] as const).map((level) => {
        const f = ticketFactors(level);
        const fill = Math.min(
          1,
          Math.max(
            FINANCES.FILL_MIN,
            FINANCES.FILL_BASE +
              FINANCES.FILL_REP * ((s.club.reputation - 40) / 55) +
              FINANCES.FILL_POS_BONUS * 0.5 +
              f.fillDelta,
          ),
        );
        return {
          level,
          fillPct: Math.round(fill * 100),
          gate: Math.round(
            stadiumCapacity(s.club) * fill * FINANCES.HOME_GAMES * FINANCES.TICKET_PRICE * f.gate,
          ),
        };
      }),
    },
    /** Strutture in città: si posizionano cliccando sulla mappa (MODULE_STADIUM §3). */
    city: CITY_STRUCTURES.map((c) => {
      const quote = quoteProject(s.club, { kind: 'struttura', structure: c.id, dx: 0, dy: 0 });
      return {
        id: c.id,
        name: COMMERCIAL_NAMES[c.id],
        cost: c.cost,
        built: (s.club.structures ?? []).some((x) => x.id === c.id),
        ok: quote.ok,
        reason: quote.reason ?? null,
      };
    }),
  };
}

/** Marker per la mappa della città: strutture costruite + eventuale cantiere. */
export function cityStructures(
  s: GameSession,
): { id: CommercialId; name: string; dx: number; dy: number; building: boolean }[] {
  const out = (s.club.structures ?? []).map((x) => ({
    id: x.id,
    name: COMMERCIAL_NAMES[x.id],
    dx: x.dx,
    dy: x.dy,
    building: false,
  }));
  const p = s.club.stadium.project;
  if (p?.kind === 'struttura' && p.structure) {
    out.push({
      id: p.structure,
      name: COMMERCIAL_NAMES[p.structure],
      dx: p.dx ?? 0,
      dy: p.dy ?? 0,
      building: true,
    });
  }
  return out;
}

function densityLabel(d: number): string {
  return d >= 0.66 ? 'nel cuore del tifo' : d >= 0.33 ? 'zona di passaggio' : 'zona periferica';
}

/** Avvia il cantiere di una struttura in città nel punto scelto dall'utente. */
export function buildCityStructure(
  s: GameSession,
  structure: CommercialId,
  dx: number,
  dy: number,
): string {
  const res = startProject(s.world, s.club, { kind: 'struttura', structure, dx, dy }, s.year);
  if (!res.ok) return `Il progetto non parte: ${res.reason}.`;
  const d = fanDensityAt(s.club.name, s.club.reputation, dx, dy);
  return `Cantiere aperto ${densityLabel(d)} — i lavori avanzano a ogni giornata giocata.`;
}

/** Zone di tifo per la mappa (stesso spazio di offset dei CityStructure). */
export function fanZonesView(s: GameSession): { dx: number; dy: number; r: number; w: number }[] {
  return fanZones(s.club.name, s.club.reputation).map((z) => ({ ...z }));
}

/** Dettaglio di una struttura in città: densità di tifo e stime ricavo per prezzo. */
export function structureDetail(s: GameSession, structure: CommercialId) {
  const built = (s.club.structures ?? []).find((x) => x.id === structure);
  const p = s.club.stadium.project;
  const inWorks = p?.kind === 'struttura' && p.structure === structure;
  const dx = built?.dx ?? p?.dx ?? 0;
  const dy = built?.dy ?? p?.dy ?? 0;
  const density = fanDensityAt(s.club.name, s.club.reputation, dx, dy);
  const spec = CITY_STRUCTURES.find((c) => c.id === structure);
  const base = spec ? spec.season(0, s.club.reputation, 0.8) * locationFactor(density) : 0;
  return {
    id: structure,
    name: COMMERCIAL_NAMES[structure],
    building: inWorks,
    price: (built?.price ?? 'standard') as PriceLevel,
    density,
    densityLabel: densityLabel(density),
    estimates: (['popolare', 'standard', 'premium'] as const).map((level) => ({
      level,
      amount: Math.round(base * priceMultiplier(level, density)),
    })),
  };
}

/** Battezza un settore col nome scelto dall'utente. */
export function renameSectorAction(s: GameSession, sector: SectorId, name: string): string {
  const res = renameSector(s.club, sector, name);
  return res.ok ? `Settore ribattezzato "${name.trim()}".` : `Impossibile: ${res.reason}.`;
}

/** A stagione finita la curva può proporre di intitolare uno spalto al beniamino. */
export function fanProposal(s: GameSession): NamingProposal | null {
  if (!s.runner.isFinished()) return null;
  if (s.namingSeason !== s.year) {
    s.namingSeason = s.year;
    s.naming = fanNamingProposal(s.world, s.club, createRng(s.seed * 31 + s.year));
  }
  return s.naming ?? null;
}

export function resolveFanProposal(s: GameSession, accept: boolean): string {
  const p = s.naming;
  s.naming = null;
  if (!p) return '';
  if (!accept) return 'Proposta respinta: la curva incasserà il colpo.';
  renameSector(s.club, p.sector, p.name);
  return `Da oggi quello spalto si chiama "${p.name}".`;
}

/** Prezzo dei biglietti dello stadio. */
export function changeTicketPrice(s: GameSession, price: PriceLevel): string {
  setTicketPrice(s.club, price);
  return `Biglietti ${price}: ${price === 'popolare' ? 'stadio più pieno, incasso ridotto' : price === 'premium' ? 'incasso alto, spalti meno pieni' : 'equilibrio classico'}.`;
}

/** Prezzo di un'attività dello stadio (bar, ristorante, …). */
export function changeActivityPrice(
  s: GameSession,
  activity: CommercialId,
  price: PriceLevel,
): string {
  const res = setStadiumActivityPrice(s.club, activity, price);
  return res.ok ? `Prezzi ${price} impostati.` : `Impossibile: ${res.reason}.`;
}

/** Cambia il prezzo di una struttura costruita. */
export function changeStructurePrice(
  s: GameSession,
  structure: CommercialId,
  price: PriceLevel,
): string {
  const res = setStructurePrice(s.club, structure, price);
  return res.ok ? `Prezzi ${price} impostati.` : `Impossibile: ${res.reason}.`;
}

export type { PriceLevel };

/** Preventivo rapido per i bottoni struttura (ok/motivo + costo). */
export function stadiumQuote(s: GameSession, req: ProjectRequest) {
  const q = quoteProject(s.club, req);
  return { ok: q.ok, reason: q.reason ?? null, cost: q.cost, matchdays: q.matchdays };
}

export function buildStadiumProject(s: GameSession, req: ProjectRequest): string {
  const res = startProject(s.world, s.club, req, s.year);
  if (!res.ok) return `Il progetto non parte: ${res.reason}.`;
  return 'Cantiere aperto — i lavori avanzano a ogni giornata giocata.';
}

export type { CommercialId, ProjectRequest, SectorId };

let dossierWorld: World | null = null;
let dossierSeed = -1;

export function clubDossiers(seed: number): ClubDossier[] {
  if (!dossierWorld || dossierSeed !== seed) {
    dossierWorld = generateWorld(createRng(seed));
    dossierSeed = seed;
  }
  const world = dossierWorld;
  return [...world.clubs.values()].map((c, index) => {
    const pres = [...(world.presidents?.values() ?? [])].find((p) => p.clubId === c.id);
    const coach = [...(world.managers?.values() ?? [])].find((m) => m.clubId === c.id);
    const squad = c.playerIds.map((id) => world.players.get(id)!).filter(Boolean);
    return {
      index,
      name: c.name,
      league: leagueOfClub(world, c.id).name,
      reputation: c.reputation,
      capacity: stadiumCapacity(c),
      transferBudget: c.finances.transferBudget,
      cash: c.finances.cash,
      presidentName: pres?.name ?? '-',
      presidentTraits: pres
        ? {
            ambition: pres.personality.ambition,
            composure: pres.personality.composure,
            temperament: pres.personality.temperament,
          }
        : { ambition: 0.5, composure: 0.5, temperament: 0.5 },
      coachName: coach?.name ?? 'traghettatore',
      nation:
        world.nations?.find((n) => n.id === leagueOfClub(world, c.id).nationId)?.code ?? 'ITA',
      squadAvg: Math.round(squad.reduce((s, p) => s + playerOverall(p), 0) / squad.length),
    };
  });
}

// ---- Viaggi di mercato (MODULE_MARKET §8): mappa, ricerca, trattativa (guscio) ----
import type { ClubId, PlayerId } from '../../src/core/ids';
import type { Player, Position } from '../../src/core/types';

function hashStr(str: string): number {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Stato generale della sezione mercato: finestra, budget, viaggio, pre-accordi. */
export function marketWorldView(s: GameSession) {
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const window = s.runner.isFinished() ? null : marketWindowOpen(round, total);
  return {
    window,
    deadline: window ? isDeadlineDay(round, total) : false,
    budget: s.club.finances.transferBudget,
    cash: s.club.finances.cash,
    tripDone: s.lastTripRound === round,
    tripCost: NEGOTIATION.TRIP_COST,
    squadSize: s.club.playerIds.length,
    squadCap: NEGOTIATION.SQUAD_CAP,
    preDeals: (s.preDeals ?? []).map((d) => ({
      player: d.playerName,
      from: d.sellerName,
      fee: d.fee,
    })),
  };
}

export interface MarketClubRow {
  id: string;
  name: string;
  league: string;
  nation: string;
  reputation: number;
  avg: number;
  squad: number;
  mine: boolean;
}

/** Tutti i club del mondo per la mappa (la UI li colloca in città via clubIdentity). */
export function marketClubs(s: GameSession): MarketClubRow[] {
  return [...s.world.clubs.values()].map((c) => {
    const lg = leagueOfClub(s.world, c.id);
    const squad = c.playerIds.map((id) => s.world.players.get(id)!).filter(Boolean);
    return {
      id: c.id as string,
      name: c.name,
      league: lg.name,
      nation: s.world.nations?.find((n) => n.id === lg.nationId)?.code ?? 'ITA',
      reputation: c.reputation,
      avg: Math.round(squad.reduce((a, p) => a + playerOverall(p), 0) / Math.max(1, squad.length)),
      squad: squad.length,
      mine: c.id === s.club.id,
    };
  });
}

export interface MarketPlayerRow {
  id: string;
  name: string;
  pos: Position;
  age: number;
  nat: string;
  overall: number;
  club: string;
  clubId: string;
  league: string;
  nation: string;
  ask: number;
  status: 'incedibile' | 'cedibile' | 'vetrina';
  contractEnd: number | null;
  listed: boolean;
}

function playerRow(s: GameSession, p: Player, seller: Club): MarketPlayerRow {
  const lg = leagueOfClub(s.world, seller.id);
  const pres = [...(s.world.presidents?.values() ?? [])].find((x) => x.clubId === seller.id);
  const status = playerMarketStatus(s.world, seller, p, s.year);
  const ask =
    Math.round(
      (askingPrice(s.world, seller, pres, p, s.year) * NEGOTIATION.STATUS_ASK[status]) / 100_000,
    ) * 100_000;
  const contract = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
  return {
    id: p.id as string,
    name: p.name,
    pos: p.position,
    age: p.age,
    nat: p.nationality,
    overall: Math.round(playerOverall(p)),
    club: seller.name,
    clubId: seller.id as string,
    league: lg.name,
    nation: s.world.nations?.find((n) => n.id === lg.nationId)?.code ?? 'ITA',
    ask,
    status,
    contractEnd: contract?.endYear ?? null,
    listed: (s.shortlist ?? []).includes(p.id as string),
  };
}

export interface PlayerSearchFilters {
  name?: string;
  position?: Position | '';
  nationality?: string;
  league?: string;
  ageMax?: number | null;
  maxAsk?: number | null;
  expiring?: boolean;
}

/** Ricerca globale con filtri combinabili (§8.1). Mai i propri giocatori. */
export function searchPlayers(
  s: GameSession,
  f: PlayerSearchFilters,
  limit = 40,
): MarketPlayerRow[] {
  const name = (f.name ?? '').trim().toLowerCase();
  const out: MarketPlayerRow[] = [];
  for (const seller of s.world.clubs.values()) {
    if (seller.id === s.club.id) continue;
    const lg = leagueOfClub(s.world, seller.id);
    if (f.league && lg.name !== f.league) continue;
    for (const pid of seller.playerIds) {
      const p = s.world.players.get(pid);
      if (!p) continue;
      if (name && !p.name.toLowerCase().includes(name)) continue;
      if (f.position && p.position !== f.position) continue;
      if (f.nationality && p.nationality !== f.nationality) continue;
      if (f.ageMax != null && p.age > f.ageMax) continue;
      if (f.expiring && contractYearsLeft(s.world, p, s.year) > 1) continue;
      const row = playerRow(s, p, seller);
      if (f.maxAsk != null && row.ask > f.maxAsk) continue;
      out.push(row);
    }
  }
  return out.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Le nazionalità presenti nel mondo (per il filtro). */
export function marketNationalities(s: GameSession): string[] {
  const set = new Set<string>();
  for (const p of s.world.players.values()) set.add(p.nationality);
  return [...set].sort();
}

/** I campionati del mondo (per il filtro). */
export function marketLeagues(s: GameSession): string[] {
  return s.world.leagues.map((l) => l.name);
}

/** La rosa di un club sulla mappa, pronta per la trattativa. */
export function marketClubSquad(s: GameSession, clubId: string): MarketPlayerRow[] {
  const seller = s.world.clubs.get(clubId as ClubId);
  if (!seller || seller.id === s.club.id) return [];
  return seller.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => playerRow(s, p, seller))
    .sort((a, b) => b.overall - a.overall);
}

/** Stellina sul taccuino: aggiunge/toglie. Ritorna lo stato finale. */
export function toggleShortlist(s: GameSession, playerId: string): boolean {
  const list = s.shortlist ?? [];
  if (list.includes(playerId)) {
    s.shortlist = list.filter((id) => id !== playerId);
    return false;
  }
  s.shortlist = [...list, playerId];
  return true;
}

/** Il taccuino del DS: gli obiettivi seguiti (i venduti/comprati cadono da soli). */
export function shortlistRows(s: GameSession): MarketPlayerRow[] {
  const out: MarketPlayerRow[] = [];
  for (const id of s.shortlist ?? []) {
    const p = s.world.players.get(id as PlayerId);
    if (!p) continue;
    const seller = [...s.world.clubs.values()].find((c) => c.playerIds.includes(p.id));
    if (!seller || seller.id === s.club.id) continue;
    out.push(playerRow(s, p, seller));
  }
  return out;
}

/** I consigli del DS (§8.6): deterministici, dal bisogno reale della rosa. */
export function dsAdvice(s: GameSession) {
  return dsSuggestions(s.world, s.club, s.year, 5).map((t) => ({
    id: t.playerId as string,
    name: t.name,
    pos: t.position,
    age: t.age,
    overall: t.overall,
    club: t.clubName,
    clubId: t.clubId as string,
    ask: t.ask,
    status: t.status,
    why: t.why,
  }));
}

/** Apre il tavolo (§8.3). In persona = trasferta: costo vero, max 1 per giornata. */
export function startNegotiation(
  s: GameSession,
  playerId: string,
  inPerson: boolean,
): string | null {
  if (s.negotiation && (s.negotiation.stage === 'fee' || s.negotiation.stage === 'wage'))
    return 'Hai già un tavolo aperto: chiudilo prima.';
  const player = s.world.players.get(playerId as PlayerId);
  const seller = player
    ? [...s.world.clubs.values()].find((c) => c.playerIds.includes(player.id))
    : undefined;
  if (!player || !seller) return 'Giocatore introvabile.';
  if (seller.id === s.club.id) return 'È già un tuo giocatore.';
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  if (inPerson) {
    if (s.lastTripRound === round) return 'Hai già viaggiato questa giornata: il jet è a terra.';
    const trip = bookTrip(s.club, seller.name, s.year, s.world);
    if (!trip.ok) return `Trasferta impossibile: ${trip.reason}.`;
    s.lastTripRound = round;
  }
  const window = s.runner.isFinished() ? null : marketWindowOpen(round, total);
  const res = openNegotiation(
    s.world,
    s.club,
    seller,
    player,
    s.year,
    { inPerson, deadline: window ? isDeadlineDay(round, total) : false },
    createRng((s.seed ^ hashStr(playerId)) + round * 7919),
  );
  if (!res.ok) return res.reason;
  s.negotiation = res.state;
  // Sederti al tavolo per lui = studiarlo (MODULE_SCOUTING §7).
  if (!s.observations) s.observations = {};
  s.observations[playerId] = (s.observations[playerId] ?? 0) + 1;
  return null;
}

/** Vista della trattativa per la UI (il floor del venditore resta segreto). */
export function negotiationView(s: GameSession) {
  const st = s.negotiation;
  if (!st) return null;
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  return {
    player: st.playerName,
    seller: st.sellerName,
    stage: st.stage,
    status: st.status,
    mood: st.mood,
    inPerson: st.inPerson,
    ask: st.ask,
    round: st.round,
    roundsLeft: Math.max(0, NEGOTIATION.MAX_ROUNDS - st.round),
    wageAsk: st.wageAsk ?? null,
    wageRoundsLeft: Math.max(0, NEGOTIATION.WAGE_ROUNDS - st.wageRound),
    agreedFee: st.agreedFee ?? null,
    agreedWage: st.agreedWage ?? null,
    commission: st.commission ?? 0,
    windowOpen: !s.runner.isFinished() && marketWindowOpen(round, total) !== null,
    log: st.log.map((e) => ({ ...e })),
  };
}

/** Un'offerta sul cartellino. */
export function negotiationFee(s: GameSession, amount: number): void {
  const st = s.negotiation;
  if (!st) return;
  offerFee(
    s.world,
    st,
    s.club,
    Math.max(0, Math.round(amount)),
    s.year,
    createRng((s.seed ^ hashStr(st.playerId as string)) + st.round * 131 + 7),
  );
}

/** Un'offerta d'ingaggio settimanale. */
export function negotiationWage(s: GameSession, weekly: number): void {
  const st = s.negotiation;
  if (!st) return;
  offerWage(
    s.world,
    st,
    Math.max(0, Math.round(weekly)),
    createRng((s.seed ^ hashStr(st.playerId as string)) + st.wageRound * 271 + 13),
  );
}

/** Chiude il tavolo: firma (finestra aperta), pre-accordo (chiusa) o archivia il fallito. */
export function closeNegotiation(s: GameSession): string {
  const st = s.negotiation;
  if (!st) return '';
  s.negotiation = null;
  if (st.stage !== 'done') return 'Il tavolo si chiude senza accordo.';
  const deal = dealFromState(st);
  if (!deal) return 'Il tavolo si chiude senza accordo.';
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const window = !s.runner.isFinished() && marketWindowOpen(round, total) !== null;
  if (!window) {
    s.preDeals = [...(s.preDeals ?? []), deal];
    return `Pre-accordo depositato: ${deal.playerName} arriverà all'apertura della finestra (${(deal.fee / 1e6).toFixed(1)}M + ingaggio ${Math.round(deal.wage / 1000)}k).`;
  }
  const out = executeDeal(s.world, s.club, deal, s.year);
  if (!out.ok) return `L'affare sfuma alla firma: ${out.reason}.`;
  s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
  refreshTreasury(s);
  fulfilPromises(s, deal.playerId as string, round);
  s.shortlist = (s.shortlist ?? []).filter((id) => id !== (deal.playerId as string));
  s.news = [
    ...(s.news ?? []),
    {
      round,
      buyer: s.club.name,
      seller: deal.sellerName,
      player: deal.playerName,
      fee: deal.fee,
      headline: `UFFICIALE: ${deal.playerName} è un nuovo giocatore del ${s.club.name} — ${(deal.fee / 1e6).toFixed(1)}M al ${deal.sellerName}.`,
    },
  ].slice(-30);
  return `UFFICIALE: ${deal.playerName} è tuo per ${(deal.fee / 1e6).toFixed(1)}M.`;
}

/** Ci si alza dal tavolo senza firmare. */
export function abandonNegotiation(s: GameSession): void {
  s.negotiation = null;
}

// ---------------------------------------------------------------------------
// Rinnovi negoziati (MODULE_CONTRACTS): guscio sul motore contracts/.
// ---------------------------------------------------------------------------

const gazzetta = (s: GameSession, round: number, headline: string): void => {
  s.news = [
    ...(s.news ?? []),
    { round, buyer: s.club.name, seller: '', player: '', fee: 0, headline },
  ].slice(-30);
};

/** Contratti del club, i più urgenti in cima (Sede → Contratti). */
export function contractRows(s: GameSession) {
  const notes = s.renewalNotes ?? {};
  return s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => {
      const c = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
      const n = notes[p.id as string];
      const note = n?.leaving
        ? 'addio annunciato'
        : n?.wantsOut
          ? 'chiede la cessione'
          : n?.stallState
            ? `prende tempo (torna g.${n.stallState.stallUntilRound})`
            : n?.cooldownUntil !== undefined && s.runner.nextRound() < n.cooldownUntil
              ? `tavolo gelato fino a g.${n.cooldownUntil}`
              : n?.betrayed
                ? 'promessa tradita: pretende di più'
                : null;
      const agency = p.agencyId
        ? (s.world.agencies?.find((a) => a.id === p.agencyId)?.name ?? 'agenzia')
        : 'si rappresenta da solo';
      const bonusCount = c?.bonuses ? Object.keys(c.bonuses).length : 0;
      return {
        id: p.id as string,
        name: p.name,
        pos: p.position,
        age: p.age,
        overall: Math.round(playerOverall(p)),
        wage: c?.wage ?? 0,
        endYear: c?.endYear ?? 0,
        yearsLeft: c ? c.endYear - s.year : 0,
        expiring: c !== undefined && c.endYear <= s.year,
        fan: isClubFan(p, s.club.id),
        agency,
        bonusCount,
        note,
      };
    })
    .sort(
      (a, b) =>
        Number(b.expiring) - Number(a.expiring) ||
        a.yearsLeft - b.yearsLeft ||
        b.overall - a.overall,
    );
}

/** Contratti che scadono in questa stagione (per il ticker dell'hub). */
export function expiringContracts(s: GameSession): number {
  return s.club.playerIds.filter((id) => {
    const p = s.world.players.get(id);
    const c = p?.contractId ? s.world.contracts.get(p.contractId) : undefined;
    return c !== undefined && c.endYear <= s.year;
  }).length;
}

/** Apre (o riapre da uno stallo) il tavolo del rinnovo. Ritorna un messaggio o null se aperto. */
export function startRenewalTalk(s: GameSession, playerId: string): string | null {
  if (s.renewal && s.renewal.stage === 'terms') return 'Hai già un tavolo aperto: chiudilo prima.';
  const player = s.world.players.get(playerId as PlayerId);
  if (!player || !s.club.playerIds.includes(player.id)) return 'Giocatore introvabile.';
  const round = s.runner.nextRound();
  if (!s.renewalNotes) s.renewalNotes = {};
  const notes = s.renewalNotes;
  const n = notes[playerId];
  if (n?.leaving) return `${player.name} ha annunciato l'addio: non c'è più niente da trattare.`;
  if (n?.cooldownUntil !== undefined && round < n.cooldownUntil)
    return `L'entourage non risponde: il tavolo è gelato fino alla giornata ${n.cooldownUntil}.`;
  if (n?.stallState) {
    // Lo stallo si riapre citando un rivale REALE (MODULE_MARKET §9.4).
    const st = resumeRenewal(
      n.stallState,
      round,
      bestRivalInterest(s.world, s.club, player, s.year),
    );
    if (st.stage === 'stalled')
      return `${player.name} sta ancora prendendo tempo: se ne riparla dalla giornata ${st.stallUntilRound}.`;
    n.stallState = undefined;
    if (st.stage === 'leaving') {
      n.leaving = true;
      gazzetta(s, round, `CASO ${player.name.toUpperCase()}: niente rinnovo, a scadenza saluta.`);
      return `${player.name} ha deciso: a scadenza se ne andrà.`;
    }
    s.renewal = st;
    return null;
  }
  const res = openRenewal(
    s.world,
    s.club,
    player,
    s.year,
    seasonStandings(s.world, s.season),
    { betrayed: n?.betrayed },
    createRng((s.seed ^ hashStr(playerId)) + round * 104729 + 13),
  );
  if (!res.ok) return res.reason;
  s.renewal = res.state;
  return null;
}

/** Vista del tavolo per la UI (il floor resta privato). */
export function renewalTableView(s: GameSession) {
  const st = s.renewal;
  if (!st) return null;
  const player = s.world.players.get(st.playerId);
  const c = player?.contractId ? s.world.contracts.get(player.contractId) : undefined;
  return {
    player: st.playerName,
    agent: st.agentName,
    stage: st.stage,
    mood: st.mood,
    ask: st.askWage,
    roundsLeft: Math.max(0, RENEWAL.MAX_ROUNDS - st.round),
    yearsWanted: st.yearsWanted,
    guaranteeNeeded: st.guaranteeNeeded,
    badges: [
      st.fan ? '❤ cuore di tifoso' : null,
      st.mercenary ? '💼 mercenario' : null,
      st.bigThinker
        ? st.projectOk
          ? '👑 pensa in grande'
          : '👑 pensa in grande — progetto in dubbio'
        : null,
      st.betrayed ? '🥀 tradito in passato' : null,
    ].filter((x): x is string => x !== null),
    currentWage: c?.wage ?? 0,
    currentEnd: c?.endYear ?? 0,
    log: st.log,
  };
}

/** Importi-base sensati per i chip bonus della UI, scalati sulla richiesta. */
export function suggestedBonuses(s: GameSession) {
  const ask = s.renewal?.askWage ?? 20_000;
  const r5 = (v: number) => Math.max(5_000, Math.round(v / 5_000) * 5_000);
  return {
    perGoal: r5(ask * 0.3),
    perAssist: r5(ask * 0.2),
    trophy: r5(ask * 20),
    topFinish: r5(ask * 13),
    survival: r5(ask * 8),
  };
}

/** Un'offerta al tavolo. L'esito vive nel log dello stato. */
export function renewalOffer(s: GameSession, terms: RenewalOfferTerms): void {
  const st = s.renewal;
  if (!st || st.stage !== 'terms') return;
  const player = s.world.players.get(st.playerId);
  if (!player) return;
  const round = s.runner.nextRound();
  const after = offerRenewalTerms(
    s.world,
    st,
    s.club,
    player,
    terms,
    s.year,
    round,
    seasonStandings(s.world, s.season),
    createRng((s.seed ^ hashStr(st.playerId as string)) + round * 31 + st.round * 977),
  );
  if (after.stage === 'done') {
    refreshTreasury(s); // il nuovo ingaggio muove sostenibilità e specchi
    const c = player.contractId ? s.world.contracts.get(player.contractId) : undefined;
    gazzetta(
      s,
      round,
      `RINNOVO: ${player.name} firma fino al ${c?.endYear} (${Math.round((after.agreedWage ?? 0) / 1000)}k/sett).`,
    );
    if (after.agreedPromise != null) addPromise(s, player, after.agreedPromise);
  }
}

/** Chiude il tavolo e archivia l'esito nel dossier del giocatore. */
export function closeRenewalTalk(s: GameSession): string {
  const st = s.renewal;
  if (!st) return '';
  s.renewal = null;
  if (!s.renewalNotes) s.renewalNotes = {};
  const notes = s.renewalNotes;
  const n = notes[st.playerId as string] ?? {};
  notes[st.playerId as string] = n;
  if (st.stage === 'done') return `Rinnovo firmato: ${st.playerName} resta.`;
  if (st.stage === 'stalled') {
    n.stallState = st;
    return `${st.playerName} si prende qualche settimana per pensarci.`;
  }
  if (st.stage === 'leaving') {
    n.leaving = true;
    gazzetta(
      s,
      s.runner.nextRound(),
      `CASO ${st.playerName.toUpperCase()}: niente rinnovo, a scadenza saluta.`,
    );
    return `${st.playerName} andrà via a scadenza.`;
  }
  if (st.stage === 'failed') {
    n.cooldownUntil = st.cooldownUntilRound ?? s.runner.nextRound() + 6;
    return 'Niente accordo, per ora.';
  }
  return 'Il tavolo si chiude.';
}

/** Le promesse aperte (per il pannello Contratti). */
export function openPromises(s: GameSession) {
  return (s.promises ?? []).filter((p) => p.status === 'aperta');
}

/** Borsino (MODULE_MARKET §9.3): gli ultimi movimenti, con la freccia sopra/sotto valutazione. */
export function borsinoRows(s: GameSession) {
  return [...(s.news ?? [])]
    .filter((n) => n.playerId !== undefined)
    .slice(-12)
    .reverse()
    .map((n) => {
      const p = s.world.players.get(n.playerId as PlayerId);
      const value = p
        ? baseMarketValue(
            playerOverall(p),
            p.age,
            p.potential,
            contractYearsLeft(s.world, p, s.year),
          )
        : 0;
      const trend =
        n.fee === 0
          ? ('caldo' as const)
          : value > 0 && n.fee > value * 1.15
            ? ('sopra' as const)
            : value > 0 && n.fee < value * 0.85
              ? ('sotto' as const)
              : ('pari' as const);
      return { round: n.round, player: n.player, fee: n.fee, trend };
    });
}

function deptAvgOverall(s: GameSession, position: Position): number {
  const dept = s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined && p.position === position);
  if (dept.length === 0) return 50;
  return dept.reduce((a, p) => a + playerOverall(p), 0) / dept.length;
}

function addPromise(s: GameSession, player: Player, position: Position): void {
  const total = s.runner.totalRounds();
  const round = s.runner.nextRound();
  const dl = promiseDeadline(round, total);
  s.promises = [
    ...(s.promises ?? []),
    {
      playerId: player.id as string,
      playerName: player.name,
      position,
      minOverall: Math.round(deptAvgOverall(s, position)),
      madeYear: s.year,
      deadlineYear: dl === null ? s.year + 1 : s.year,
      deadlineRound: dl ?? promiseDeadline(0, total) ?? 4,
      status: 'aperta',
    },
  ];
}

/** Un acquisto appena firmato può mantenere le promesse aperte. */
function fulfilPromises(s: GameSession, signedPlayerId: string, round: number): void {
  const signed = s.world.players.get(signedPlayerId as PlayerId);
  if (!signed) return;
  const overall = playerOverall(signed);
  for (const p of s.promises ?? []) {
    if (p.status !== 'aperta') continue;
    if (p.position !== signed.position || overall < p.minOverall) continue;
    p.status = 'mantenuta';
    gazzetta(
      s,
      round,
      `PROMESSA MANTENUTA: ${signed.name} è il rinforzo garantito a ${p.playerName}.`,
    );
  }
}

/** A scadenza, le promesse non mantenute presentano il conto (morale + fiducia). */
function checkPromises(s: GameSession, round: number): void {
  for (const p of s.promises ?? []) {
    if (p.status !== 'aperta') continue;
    const overdue =
      s.year > p.deadlineYear || (s.year === p.deadlineYear && round > p.deadlineRound);
    if (!overdue) continue;
    p.status = 'tradita';
    const player = s.world.players.get(p.playerId as PlayerId);
    if (player && s.club.playerIds.includes(player.id)) {
      moraleShock(player, -(0.1 + 0.1 * player.personality.ambition));
      if (!s.renewalNotes) s.renewalNotes = {};
      const note = s.renewalNotes[p.playerId] ?? {};
      note.betrayed = true;
      // Il tradito ambizioso chiede la cessione: entra nella hot-list (§9.4).
      if (player.personality.ambition >= 0.5) note.wantsOut = true;
      s.renewalNotes[p.playerId] = note;
      gazzetta(
        s,
        round,
        note.wantsOut
          ? `PROMESSA TRADITA: ${p.playerName} non ha visto il rinforzo garantito e CHIEDE LA CESSIONE.`
          : `PROMESSA TRADITA: il rinforzo garantito a ${p.playerName} non è mai arrivato. Lo spogliatoio mormora.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tesoreria (MODULE_FINANCES §5): la vista del bilancio vero del presidente.
// ---------------------------------------------------------------------------

/** Riallinea gli specchi dopo un'operazione di denaro fuori dal tick di giornata. */
export function refreshTreasury(s: GameSession): void {
  syncUserBudgets(s.world, s.club, s.year);
}

export function treasuryView(s: GameSession) {
  syncUserBudgets(s.world, s.club, s.year);
  const f = s.club.finances;
  const od = overdraftLimit(s.world, s.club, s.year);
  const sus = sustainability(s.world, s.club, s.year);
  const proj = projectedStatement(s.world, s.club, s.year);
  const sumBy = (list: { type: string; amount: number; year: number }[]) => {
    const acc = new Map<string, number>();
    for (const e of list) {
      if (e.year !== s.year) continue;
      acc.set(e.type, (acc.get(e.type) ?? 0) + e.amount);
    }
    return [...acc.entries()]
      .map(([type, amount]) => ({ label: LEDGER_LABELS[type] ?? type, amount }))
      .sort((a, b) => b.amount - a.amount);
  };
  const incomes = sumBy(f.incomes);
  const expenses = sumBy(f.expenses);
  const inTot = incomes.reduce((a, r) => a + r.amount, 0);
  const outTot = expenses.reduce((a, r) => a + r.amount, 0);
  return {
    cash: f.cash,
    overdraft: od,
    overdraftUsed: Math.max(0, -f.cash),
    room: spendingRoom(s.world, s.club, s.year),
    ratio: sus.ratio,
    ratioStatus: sus.status,
    ratioCap: FISCAL.SQUAD_COST_CAP,
    capWeekly: sus.capWeekly,
    billWeekly: clubWageBill(s.world, s.club),
    // F2b — la rosa a bilancio: valore contabile e quote di ammortamento (non-cassa).
    bookValue: squadBookValue(s.world, s.club, s.year),
    amortization: sus.amortization,
    incomes,
    expenses,
    inTot,
    outTot,
    net: inTot - outTot,
    projection: proj,
  };
}

// ---------------------------------------------------------------------------
// Sponsor (MODULE_SPONSORS): la vista dei 4 slot e la firma delle offerte.
// ---------------------------------------------------------------------------

export function describeSponsorClause(c: SponsorContract['clause']): string | null {
  if (!c) return null;
  if (c.kind === 'nazionalita')
    return `clausola merch: +${Math.round(c.bonusPct * 100)}% con un ${c.nation} in rosa`;
  if (c.kind === 'vetrina')
    return `premio vetrina: +${Math.round(c.bonusPct * 100)}% se top-${c.target}`;
  if (c.kind === 'scommesse') return 'scommesse: paga tanto, la piazza mugugna (−4% botteghino)';
  if (c.kind === 'benefico') return 'benefico: zero soldi, +reputazione e tifosi orgogliosi';
  return null;
}

export function foreignMarketsView(s: GameSession) {
  const raw = s.club.foreignFans ?? {};
  const squadNations = new Set(
    s.club.playerIds.map((id) => s.world.players.get(id)?.nationality).filter(Boolean),
  );
  const invested = new Set(
    (s.club.sponsors ?? [])
      .filter((c) => c.clause?.kind === 'mercato')
      .map((c) => (c.clause as { nation: string }).nation),
  );
  const nations = new Set([...Object.keys(raw), ...invested]);
  // Concorrenza: quanti ALTRI club presidiano lo stesso mercato con almeno un giocatore.
  const rivalsOf = (nation: string) => {
    let n = 0;
    for (const c of s.world.clubs.values()) {
      if (c.id === s.club.id) continue;
      if (c.playerIds.some((id) => s.world.players.get(id)?.nationality === nation)) n++;
    }
    return n;
  };
  return [...nations]
    .map((nation) => {
      const m = raw[nation];
      const market = typeof m === 'number' ? { fans: m, streak: 1 } : (m ?? { fans: 0, streak: 0 });
      return {
        nation,
        fans: market.fans,
        streak: market.streak,
        covered: squadNations.has(nation),
        invested: invested.has(nation),
        rivals: rivalsOf(nation),
      };
    })
    .sort((a, b) => b.fans - a.fans);
}

export function sponsorsView(s: GameSession) {
  const slots = ['maglia', 'tecnico', 'stadio', 'allenamento'] as SponsorSlot[];
  const contracts = s.club.sponsors ?? [];
  return slots.map((slot) => {
    const c = contracts.find((x) => x.slot === slot);
    const offers = (s.sponsorOffers?.[slot] ?? []).map((o, index) => ({
      index,
      name: o.brandName,
      sector: o.sector,
      tier: o.tier,
      annual: o.annualValue,
      years: o.years,
      expectation: o.expectation,
      clause: describeSponsorClause(o.clause),
      rinnovo: o.rinnovo === true,
    }));
    return {
      slot,
      contract: c
        ? {
            name: c.brandName,
            annual: c.annualValue,
            endYear: c.endYear,
            expectation: c.expectation,
            satisfaction: c.satisfaction,
            clause: describeSponsorClause(c.clause),
          }
        : null,
      offers,
    };
  });
}

/** Firma un'offerta per lo slot; la gazzetta racconta. */
export function chooseSponsor(s: GameSession, slot: SponsorSlot, index: number): string {
  const offer = s.sponsorOffers?.[slot]?.[index];
  if (!offer) return 'Offerta non più valida.';
  signSponsor(s.world, s.club, offer, s.year);
  if (s.sponsorOffers) delete s.sponsorOffers[slot];
  refreshTreasury(s);
  const round = s.runner.isFinished() ? s.runner.totalRounds() : s.runner.nextRound();
  gazzetta(
    s,
    round,
    offer.annualValue > 0
      ? `NUOVO SPONSOR (${slot}): ${offer.brandName}, ${(offer.annualValue / 1e6).toFixed(1)}M l'anno per ${offer.years} anni${offer.rinnovo ? ' — rinnovo' : ''}.`
      : `IL CLUB SCEGLIE IL CUORE: ${offer.brandName} sulla ${slot}, a titolo gratuito.`,
  );
  return offer.annualValue > 0
    ? `Firmato: ${offer.brandName} (${slot}) — ${(offer.annualValue / 1e6).toFixed(1)}M/anno.`
    : `Firmato: ${offer.brandName} (${slot}) — la piazza applaude.`;
}
