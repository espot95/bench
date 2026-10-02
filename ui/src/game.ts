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
import {
  archetypeHeatmap,
  playableRoles,
  playerArchetype,
  playerMovements,
} from '../../src/core/archetypes';
import { clubWageBill } from '../../src/core/finance';
import { baricentroLabel, playerHeight, runningStyle } from '../../src/core/physique';
import { playerOverall, selectStartingXI } from '../../src/core/ratings';
import { SECTOR_IDS, stadiumCapacity } from '../../src/core/stadium';
import {
  type Club,
  type Season,
  type StandingRow,
  type World,
  leagueOfClub,
  nationOfClub,
} from '../../src/core/types';
import type {
  CampaignId,
  CommercialId,
  KitDesign,
  KitPattern,
  KitStyle,
  MarketingFeature,
  MatchClass,
  PromoKind,
  SectorId,
  TicketPlan,
} from '../../src/core/types';
import type { PriceLevel } from '../../src/core/types';
import type { SponsorContract, SponsorSlot } from '../../src/core/types';
import { type OffseasonSummary, closeSeason, offseasonSummary } from '../../src/engine/career';
import {
  type NationalCup,
  createNationalCups,
  cupStagesDue,
  playCupStage,
} from '../../src/engine/cup';
import { DUEL, duelThreat } from '../../src/engine/duels';
import {
  type ConcertOffer,
  type Mission,
  RITIRO_SPOTS,
  SUMMER,
  type SummerPlan,
  TOUR_DESTINATIONS,
  checkMissions,
  concertLicensed,
  concertOfferAt,
  generateMissions,
  payRitiro,
  playTour,
  ritiroById,
  ritiroEffects,
  settleConcert,
  tourById,
  tourQuote,
} from '../../src/engine/events';
import { type SlotAssignment, bestAssignment, validateAssignment } from '../../src/engine/lineup';
import { moraleLabel, moraleShock } from '../../src/engine/morale';
import {
  type SetPiecePlan,
  type TeamPlan,
  aerialDefence,
  aerialThreat,
  depthDanger,
} from '../../src/engine/plan';
import type { PlayerSeasonStats } from '../../src/engine/player-stats';
import {
  type RoundResult as EngineRoundResult,
  GRASS,
  type GrassLength,
  type LiveMatchSession,
  type SeasonRunner,
  WATER,
  type Watering,
  createRunner,
  createSeason,
  seasonStandings,
} from '../../src/engine/season';
import {
  CITY_STRUCTURES,
  COMMERCIALS,
  type NamingProposal,
  PRICE_LEVELS,
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
import {
  amortizationInYear,
  squadAmortization,
  squadBookValue,
} from '../../src/finances/book-value';
import {
  CAMPAIGNS,
  MKT,
  MKT_FEATURES,
  boardOffers,
  boardSlots,
  defaultTicketPrice,
  hasFeature,
  isDerby,
  launchKitDeal,
  livePosition,
  marketingMatchGate,
  marketingSeasonGate,
  matchClassOf,
  namingOffers,
  officePower,
  recentForm,
  resolveSeasonTickets,
  seasonTicketPrice,
  settleMarketingYear,
  signBoardDeal,
  signNamingDeal,
  stadiumNamingName,
  subscriberDemand,
  testimonialBoost,
  ticketBasePrice,
} from '../../src/finances/marketing';
import {
  FINANCES,
  clubSeasonLines,
  expectedPositionByReputation,
} from '../../src/finances/season-economy';
import { SPONSOR_BRANDS } from '../../src/finances/sponsor-brands';
import {
  FANBASE,
  type SponsorOffer,
  buildShop,
  dominantClubIn,
  foundFanClub,
  initialSponsors,
  maxShopsFor,
  presenceByNation,
  rivalPresence,
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
  dsNationReport,
  dsSuggestions,
  executeDeal,
  loseToRival,
  offerBuyback,
  offerFee,
  offerLoanBack,
  offerWage,
  openNegotiation,
  playerMarketStatus,
  proposeSwap,
  resolveThink,
  setInstallments,
} from '../../src/market/negotiation';
import { askingPrice, contractYearsLeft, executeTransfer } from '../../src/market/transfers';
import {
  baseMarketValue,
  expectedWage,
  offeredYears,
  performanceFactor,
} from '../../src/market/value';
import type { MarketPromise, RejectedOfferMemory, RenewalNote } from '../../src/persistence/codec';
import { createRng } from '../../src/rng/rng';
import { scoutedHeatmap } from '../../src/scouting/report';
import { bandOf, starString } from './band';
import { fmtDay, fmtDayLong, midweekDay, roundDay } from './calendar';
import { NATION_COORDS } from './geo';
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
  /** Legacy (salvataggi vecchi): migrato in `negotiations` al primo accesso. */
  negotiation?: NegotiationState | null;
  /** I TAVOLI di trattativa aperti in parallelo (hub trattative, richiesta utente). */
  negotiations?: NegotiationState[];
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
  /** Coppe nazionali dell'anno (MODULE_CUPS): il guscio le fa avanzare ai checkpoint. */
  cups?: NationalCup[];
  /** Estate F4 (MODULE_EVENTS): scelte ritiro/tour (bloccate alla 1ª giornata). */
  summer?: SummerPlan;
  /** Proposte concerti pendenti (MODULE_EVENTS §3). */
  concertOffers?: ConcertOffer[];
  /** Impero v2: storia del dominio (tifosi per nazione per anno) e dei conti. */
  empireHistory?: Record<string, { year: number; fans: number }[]>;
  financeHistory?: { year: number; revenue: number; costs: number; net: number; cash: number }[];
  /** Missioni di conquista attive (engine/events §missioni). */
  missions?: Mission[];
  /** Posizioni COSMETICHE degli asset nei territori (i conteggi vivono nel core). */
  territoryPins?: Record<string, { kind: 'shop' | 'fanclub'; lat: number; lon: number }[]>;
  /** Confronto storico (Ufficio Commerciale): peso marketing tuo vs top per nazione/anno. */
  influenceHistory?: Record<string, { year: number; mine: number; top: number; topName: string }[]>;
  /** Promemoria al DS (Ufficio Commerciale): rapporti-nazione in arrivo in Gazzetta. */
  dsReminders?: { nation: string; dueRound: number }[];
  /** Manto erboso (MODULE_STADIUM): scelta stagionale; `paid` = manutenzione già a ledger. */
  grass?: { year: number; length: GrassLength; paid?: boolean };
  /** Irrigazione (MODULE_STADIUM): abitudine del club, si cambia tra una giornata e l'altra. */
  watering?: Watering;
  /** Calendario (richiesta utente): giorno corrente della stagione (offset dal 10 agosto). */
  day?: number;
  /** Call fissate con presidenti/procuratori: gli appuntamenti dell'agenda. */
  calls?: PlannedCall[];
  /** Lavagna tattica (richiesta utente): posizioni delle pedine per fase. */
  board?: {
    possesso: Record<string, { x: number; y: number }>;
    difesa: Record<string, { x: number; y: number }>;
  };
  /** PIANO PARTITA (richiesta utente): istruzioni di squadra del club. */
  plan?: TeamPlan;
  /** Lavagne SALVATE (max 3): XI + posizioni per fase, richiamabili. */
  boardPresets?: {
    name: string;
    assignment: { slot: Position; playerId: string }[];
    board: {
      possesso: Record<string, { x: number; y: number }>;
      difesa: Record<string, { x: number; y: number }>;
    };
  }[];
  /** Rate sui cartellini (v3): quote annuali dovute, addebitate a ogni chiusura di stagione. */
  installmentsDue?: { year: number; amount: number; playerName: string; sellerName: string }[];
  /** DIRETTA in corso (solo runtime: NON si salva — la gara si chiude prima). */
  live?: LiveMatchSession;
  /** SETTORE GIOVANILE (F4b): accademia a livelli + Primavera del club utente. */
  academy?: AcademyState;
  /** G3 — le BANDIERE: i promossi dal vivaio, per riconoscerli negli anni. */
  academyGrads?: { playerId: string; name: string; promotedYear: number; bandiera?: boolean }[];
  /** ALBO D'ORO (Atelier divise E): com'è andata ogni stagione chiusa (max 30). */
  annals?: {
    year: number;
    tier: number;
    position: number;
    n: number;
    promoted?: boolean;
    relegated?: boolean;
    cupWon?: boolean;
  }[];
}

/** Un appuntamento in agenda: la trattativa si apre SOLO al giorno fissato. */
export interface PlannedCall {
  id: string;
  kind: 'presidente' | 'procuratore';
  playerId: string;
  playerName: string;
  /** Controparte: il club del presidente, o "l'entourage". */
  withName: string;
  day: number;
  /** Presidente vecchio stampo: niente call, ti vuole in sede (si vola, ✈). */
  inPerson?: boolean;
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
  // Ufficio marketing: la SODDISFAZIONE dei tifosi si fissa sulla classifica finale
  // (memoria dei rinnovi), prima che la chiusura riscriva il mondo.
  const finalTable = seasonStandings(s.world, s.season);
  const finalPos = Math.max(1, finalTable.findIndex((r) => r.clubId === s.club.id) + 1);
  const fanSatisfaction =
    finalTable.length > 1 ? (finalTable.length - finalPos) / (finalTable.length - 1) : 0.5;
  // Albo d'oro: la coppa si legge PRIMA che l'estate rigeneri i tabelloni.
  const wonCup = (s.cups ?? []).some((c) => c.winnerId === s.club.id);
  const closed = closeSeason(s.world, s.season, s.seed, s.year, {
    userClubId: s.club.id,
    // MODULE_EVENTS §2: il tour dell'estate scorsa spinge fanbase e clausola sponsor.
    touredNation: s.summer?.year === s.year ? s.summer.tourNation : undefined,
  });
  const summary = offseasonSummary(s.world, s.club, oldLeague, closed, s.year, squadBefore);

  // Impero v2: la STORIA del dominio e dei conti si scrive alla chiusura (max 12 anni).
  s.financeHistory = [
    ...(s.financeHistory ?? []),
    {
      year: s.year,
      revenue: summary.accounts.revenue,
      costs: summary.accounts.costs,
      net: summary.accounts.net,
      cash: s.club.finances.cash,
    },
  ].slice(-12);
  const eh = { ...(s.empireHistory ?? {}) };
  for (const [nation, m] of Object.entries(s.club.foreignFans ?? {})) {
    eh[nation] = [...(eh[nation] ?? []), { year: s.year, fans: m.fans }].slice(-12);
  }
  s.empireHistory = eh;
  // Confronto storico: chi pesava quanto su ogni nazione, stagione per stagione.
  const ih = { ...(s.influenceHistory ?? {}) };
  for (const nation of Object.keys(NATION_COORDS)) {
    const mine = presenceByNation(s.world, s.club, [nation])[0]?.weight ?? 0;
    const dom = dominantClubIn(s.world, nation);
    if (mine <= 0 && !dom) continue;
    ih[nation] = [
      ...(ih[nation] ?? []),
      { year: s.year, mine, top: dom?.weight ?? 0, topName: dom?.name ?? '—' },
    ].slice(-12);
  }
  s.influenceHistory = ih;
  // Missioni di conquista: verifica (premi + headline), poi si rigenera il mazzo.
  const checked = checkMissions(s.world, s.club, s.missions ?? [], s.year);
  for (const h of checked.headlines) gazzetta(s, 0, h);
  s.missions = generateMissions(s.world, s.club, s.year + 1, checked.remaining);
  // Pin per gli asset nati in automatico (fan club della fidelizzazione).
  syncTerritoryPins(s);
  s.year += 1;
  // Ufficio marketing (MODULE_STADIUM §3.4): la campagna abbonamenti d'AGOSTO si
  // chiude qui — incasso unico, memoria dei rinnovi aggiornata, campagna da
  // ricomprare. Promozione/retrocessione sono gli shock veri delle tessere.
  const newTier = leagueOfClub(s.world, s.club.id).tier;
  const tierShock =
    newTier < oldLeague.tier ? 'promozione' : newTier > oldLeague.tier ? 'retrocessione' : null;
  // ALBO D'ORO (Atelier divise E): la stagione appena chiusa entra negli annali —
  // è da qui che una rievocazione saprà se quell'annata era ORO o anonimato.
  s.annals = [
    ...(s.annals ?? []),
    {
      year: s.year - 1,
      tier: oldLeague.tier,
      position: finalPos,
      n: finalTable.length,
      promoted: tierShock === 'promozione' || undefined,
      relegated: tierShock === 'retrocessione' || undefined,
      cupWon: wonCup || undefined,
    },
  ].slice(-30);
  const abbCampaign = resolveSeasonTickets(s.world, s.club, fanSatisfaction, s.year, tierShock);
  // SETTORE GIOVANILE (F4b): retta annua, crescita estiva, uscite d'età, classe nuova.
  if (s.academy) {
    const rep = settleAcademyYear(s.world, s.club, s.academy, s.year);
    refreshTreasury(s);
    // G2: il racconto del torneo Primavera appena chiuso.
    gazzetta(
      s,
      0,
      `PRIMAVERA: torneo chiuso al ${rep.primavera.placement}º posto${rep.primavera.topScorer ? ` — ${rep.primavera.topScorer.name} capocannoniere del vivaio con ${rep.primavera.topScorer.goals} gol` : ''}.`,
    );
    for (const r of rep.primavera.rientri)
      gazzetta(
        s,
        0,
        r.esito === 'maturato'
          ? `${r.name} torna dal prestito con un altro passo: il salto l'ha maturato.`
          : `${r.name} torna dal prestito ridimensionato: fuori casa non è scattato nulla.`,
      );
    if (rep.classe.length > 0)
      gazzetta(s, 0, `Primavera, la classe nuova: ${rep.classe.join(', ')}.`);
    for (const nome of rep.cresciuti.slice(0, 2))
      gazzetta(s, 0, `Dal vivaio dicono che ${nome} quest'estate è cresciuto a vista d'occhio.`);
    if (rep.partiti.length > 0)
      gazzetta(
        s,
        0,
        `Fine corsa in Primavera per ${rep.partiti.join(', ')}: l'età non aspetta nessuno.`,
      );
  }
  // G3 — le BANDIERE: tre stagioni in prima squadra da promosso del vivaio.
  for (const g of s.academyGrads ?? []) {
    if (g.bandiera || s.year - g.promotedYear < 3) continue;
    if (!s.club.playerIds.some((id) => (id as string) === g.playerId)) continue;
    g.bandiera = true;
    if (s.club.marketing) {
      s.club.marketing.lastSatisfaction = Math.min(
        1,
        (s.club.marketing.lastSatisfaction ?? 0.5) + 0.03,
      );
    }
    gazzetta(
      s,
      0,
      `${g.name} è una BANDIERA: terzo anno in prima squadra dal vivaio — la curva gli dedica uno striscione.`,
    );
  }
  // Pubblicità: annualità di bordocampo/naming, contratti scaduti, testimonial azzerato.
  const adv = settleMarketingYear(s.club, s.year);
  if (adv.boardIncome + adv.namingIncome > 0) {
    refreshTreasury(s);
    gazzetta(
      s,
      0,
      `La pubblicità paga: ${((adv.boardIncome + adv.namingIncome) / 1e6).toFixed(1)}M da bordocampo e naming per la nuova stagione.`,
    );
  }
  for (const name of adv.expired) gazzetta(s, 0, `Contratto pubblicitario scaduto: ${name}.`);
  if (abbCampaign) {
    refreshTreasury(s);
    gazzetta(
      s,
      0,
      abbCampaign.abbonati > 0
        ? `CAMPAGNA ABBONAMENTI: ${abbCampaign.abbonati.toLocaleString('it-IT')} tessere a ${abbCampaign.price}€ — ${(abbCampaign.income / 1e6).toFixed(1)}M in cassa prima ancora di giocare.`
        : 'Campagna abbonamenti deserta: prezzi e stagione scorsa non hanno convinto nessuno.',
    );
  }
  // v3 — RATE sui cartellini: le quote dovute quest'anno escono dalla cassa.
  const dueInstallments = (s.installmentsDue ?? []).filter((r) => r.year <= s.year);
  for (const r of dueInstallments) {
    s.club.finances.cash -= r.amount;
    s.club.finances.expenses.push({
      type: 'transfer_in',
      amount: r.amount,
      year: s.year,
      note: `Rata cartellino ${r.playerName} (${r.sellerName})`,
    });
    gazzetta(
      s,
      0,
      `Pagata la rata di ${(r.amount / 1e6).toFixed(1)}M per ${r.playerName} al ${r.sellerName}.`,
    );
  }
  s.installmentsDue = (s.installmentsDue ?? []).filter((r) => r.year > s.year);
  // v3 — RECOMPRE: il club con la clausola può riprendersi il ragazzo cresciuto.
  for (const pid of [...s.club.playerIds]) {
    const p = s.world.players.get(pid);
    const c = p?.contractId ? s.world.contracts.get(p.contractId) : undefined;
    const bb = c?.buyback;
    if (!p || !c || !bb) continue;
    if (bb.untilYear < s.year) {
      c.buyback = undefined;
      continue;
    }
    const other = s.world.clubs.get(bb.clubId);
    const wants =
      other !== undefined &&
      playerOverall(p) >= 74 &&
      p.age <= 27 &&
      other.finances.cash >= bb.fee &&
      other.playerIds.length < NEGOTIATION.SQUAD_CAP &&
      hashStr(`${pid}|bbex|${s.year}`) % 100 < 30;
    if (wants && other) {
      const wage = Math.round(expectedWage(playerOverall(p), p.age) / 500) * 500;
      executeTransfer(s.world, s.club, other, p, bb.fee, wage, offeredYears(p.age), 0, s.year);
      gazzetta(
        s,
        0,
        `RECOMPRA ESERCITATA: il ${other.name} si riprende ${p.name} per ${(bb.fee / 1e6).toFixed(1)}M — la clausola parlava chiaro.`,
      );
    }
  }
  if (dueInstallments.length > 0) refreshTreasury(s);
  s.season = createSeason(s.world, leagueOfClub(s.world, s.club.id), s.year, s.seed + s.year);
  s.runner = createRunner(s.world, s.season, createRng(s.seed + s.year));
  s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
  // Calendario: l'estate riparte dal 10 agosto, l'agenda si svuota.
  s.day = 0;
  s.calls = [];
  // L'abitudine sull'irrigazione resta col club anche nella stagione nuova.
  if (s.watering && s.watering !== 'normale') s.runner.setWatering(s.club.id, s.watering);
  // Il PIANO PARTITA resta (le marcature speciali erano per la vecchia avversaria).
  if (s.plan) {
    s.plan = {
      ...s.plan,
      setPiece: s.plan.setPiece ? { ...s.plan.setPiece, special: [] } : undefined,
    };
    applyPlanToRunner(s);
  }
  // Stato per-stagione: si azzera. Gazzetta, shortlist e pre-accordi sopravvivono;
  // dei dossier-rinnovo restano solo memoria lunga (tradimenti, addii annunciati).
  s.offers = [];
  s.negotiation = null;
  s.negotiations = [];
  s.lastTripRound = undefined;
  // Le note al DS non ancora evase si portano alla stagione nuova (rapporto presto).
  s.dsReminders = (s.dsReminders ?? []).map((r) => ({ ...r, dueRound: 2 }));
  // Il manto erboso si risceglie ogni estate (il runner nuovo riparte neutro).
  s.grass = undefined;
  s.naming = null;
  s.renewal = null;
  // Coppe nuove per la stagione nuova (MODULE_CUPS).
  s.cups = createNationalCups(s.world, s.year, s.seed + s.year);
  // Estate nuova (MODULE_EVENTS): si torna a scegliere ritiro e tour.
  s.summer = { year: s.year };
  s.concertOffers = [];
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
  return {
    world,
    club,
    season,
    runner,
    year,
    seed,
    cups: createNationalCups(world, year, seed),
    summer: { year },
    missions: generateMissions(world, club, year, []),
  };
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
  return afterRound(s, s.runner.playRound(s.club.id));
}

/**
 * La coda della giornata (mercato, coppe, eventi, gazzetta, calendario): CONDIVISA
 * tra il quick-result e la DIRETTA — la giornata finisce sempre dallo stesso posto.
 */
function afterRound(s: GameSession, res: EngineRoundResult): RoundResult {
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
    // v3: i prestiti-ritorno maturano solo dal loro anno (il ragazzo gioca lì).
    const dueDeals = (s.preDeals ?? []).filter((d) => (d.arrivalYear ?? 0) <= s.year);
    const laterDeals = (s.preDeals ?? []).filter((d) => (d.arrivalYear ?? 0) > s.year);
    for (const d of dueDeals) {
      const out = executeDeal(s.world, s.club, d, s.year);
      if (out.ok) {
        s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
        fulfilPromises(s, d.playerId as string, res.round);
        if (out.schedule) {
          s.installmentsDue = [
            ...(s.installmentsDue ?? []),
            ...out.schedule.map((x) => ({
              ...x,
              playerName: d.playerName,
              sellerName: d.sellerName,
            })),
          ];
        }
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
    s.preDeals = laterDeals;
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
  // Promemoria al DS (Ufficio Commerciale): i rapporti-nazione maturati escono in
  // Gazzetta, e gli scout hanno già visionato i nomi (+2 osservazioni a testa).
  for (const rem of (s.dsReminders ?? []).filter((r) => res.round >= r.dueRound)) {
    const targets = dsNationReport(s.world, s.club, rem.nation, s.year, 3);
    if (targets.length === 0) {
      gazzetta(
        s,
        res.round,
        `IL DS SU ${rem.nation}: "Ho girato mezzo mondo, ma nessun profilo ${rem.nation} è alla nostra portata oggi. Riproviamo più avanti."`,
      );
    } else {
      if (!s.observations) s.observations = {};
      for (const t of targets) {
        s.observations[t.playerId as string] = (s.observations[t.playerId as string] ?? 0) + 2;
      }
      const list = targets
        .map((t) => `${t.name} (${t.clubName}, ${(t.ask / 1e6).toFixed(1)}M)`)
        .join(' · ');
      gazzetta(
        s,
        res.round,
        `RAPPORTO DEL DS SU ${rem.nation}: ${list}. Gli scout li hanno già visionati — li trovi sul mercato col filtro ${rem.nation}.`,
      );
    }
  }
  s.dsReminders = (s.dsReminders ?? []).filter((r) => res.round < r.dueRound);

  // Coppe nazionali (MODULE_CUPS): i turni infrasettimanali dovuti dopo questa giornata.
  // Ponte v2: gli indisponibili di campionato saltano la coppa; infortuni e fatica
  // di coppa tornano nel runner (solo club della divisione dell'utente).
  const leagueClubIds = leagueOfClub(s.world, s.club.id).clubIds;
  for (const cup of s.cups ?? []) {
    while (cupStagesDue(cup, res.round)) {
      const rep = playCupStage(s.world, cup, {
        lineups: new Map([[s.club.id, bestAssignment(s.club, s.world)]]),
        userClubId: s.club.id,
        unavailable: new Map(leagueClubIds.map((id) => [id, s.runner.unavailableNow(id)])),
        bridge: true,
      });
      const inLeague = new Set<string>(leagueClubIds);
      s.runner.applyCupEffects({
        injuries: rep.effects
          .filter((e) => inLeague.has(e.clubId as string))
          .map((e) => ({ playerId: e.playerId, matches: e.matches })),
        fatigued: rep.participants
          .filter(([clubId]) => inLeague.has(clubId as string))
          .flatMap(([, ids]) => ids),
      });
      for (const e of rep.effects.filter((x) => x.clubId === s.club.id)) {
        gazzetta(
          s,
          res.round,
          `TEGOLA IN COPPA: ${e.playerName} ko, salta ${e.matches} giornat${e.matches === 1 ? 'a' : 'e'}${e.severe ? ' — infortunio grave' : ''}.`,
        );
      }
      const mine = rep.results.find(
        (t) => t.homeClubId === s.club.id || t.awayClubId === s.club.id,
      );
      if (mine) {
        const n = (id: string) => s.world.clubs.get(id as never)?.name ?? '—';
        const pens = mine.shootout ? ` (${mine.shootout.home}-${mine.shootout.away} dcr)` : '';
        const passed = mine.winnerId === s.club.id;
        gazzetta(
          s,
          res.round,
          `${rep.cupName} — ${rep.stageName}: ${n(mine.homeClubId)} ${mine.homeGoals}-${mine.awayGoals}${pens} ${n(mine.awayClubId)}. ${
            passed ? (rep.finished ? 'LA COPPA È VOSTRA!' : 'Turno superato.') : 'Eliminati.'
          }`,
        );
        refreshTreasury(s);
      }
      for (const h of rep.headlines) gazzetta(s, res.round, h);
    }
  }
  // Concerti (MODULE_EVENTS §3): il promoter bussa ai round previsti; le date
  // passate senza risposta decadono. RNG derivato dal seed: zero draw simulazione.
  if ((SUMMER.CONCERT_ROUNDS as readonly number[]).includes(res.round)) {
    const offer = concertOfferAt(
      s.world,
      s.club,
      s.season,
      res.round,
      createRng((s.seed ^ 0xc0c0) + s.year * 977 + res.round * 131),
    );
    if (offer) {
      s.concertOffers = [...(s.concertOffers ?? []), offer];
      gazzetta(
        s,
        res.round,
        `PROPOSTA DAL PROMOTER: ${offer.artist} (${offer.tierLabel}) vuole lo stadio prima della g.${offer.round}${offer.homeClash ? ' — a RIDOSSO della gara in casa' : ''}. Cachet ${(offer.cachet / 1e6).toFixed(1)}M.`,
      );
    }
  }
  s.concertOffers = (s.concertOffers ?? []).filter((o) => o.expiresRound > res.round);

  // Calendario: la giornata giocata sposta il tempo alla sua domenica.
  s.day = Math.max(currentDay(s), roundDay(s.year, res.round));
  // Trattative in riflessione maturate: il presidente risponde da solo (v2).
  for (const st of allTables(s)) {
    if (st.stage === 'pending' && (st.resumeDay ?? 0) <= currentDay(s)) {
      resolveThink(
        s.world,
        st,
        s.club,
        s.year,
        createRng((s.seed ^ hashStr(st.playerId as string)) + st.round * 977 + 13),
      );
      gazzetta(
        s,
        res.round,
        `Il presidente del ${st.sellerName} ha sciolto la riserva su ${st.playerName}: la risposta è al tavolo.`,
      );
    }
  }
  // Irrigazione (MODULE_STADIUM): la bolletta idrica per la gara in casa col campo bagnato.
  const m = res.userMatch;
  if (m && m.homeClubId === s.club.id && (s.watering ?? 'normale') === 'bagnato') {
    s.club.finances.cash -= WATER.WET_COST;
    s.club.finances.expenses.push({
      type: 'other',
      amount: WATER.WET_COST,
      year: s.year,
      note: 'Bolletta idrica (campo bagnato)',
    });
    refreshTreasury(s);
  }
  const home = m ? s.world.clubs.get(m.homeClubId)?.name : null;
  const away = m ? s.world.clubs.get(m.awayClubId)?.name : null;
  return {
    round: res.round,
    scoreline: m ? `${home} ${m.homeGoals} - ${m.awayGoals} ${away}` : null,
    standings: res.standings,
    position: res.standings.findIndex((r) => r.clubId === s.club.id) + 1,
  };
}

// ---- DIRETTA (richiesta utente): guardare la partita, coi cambi che contano ----

/** Apre la diretta sulla giornata corrente. False = niente gara/motore non xg. */
export function startLiveMatch(s: GameSession): boolean {
  if (s.live) return true;
  const sess = s.runner.playRoundLive(s.club.id);
  if (!sess) return false;
  s.live = sess;
  return true;
}

export function liveIsOn(s: GameSession): boolean {
  return s.live !== undefined;
}

const CRONACA: Record<string, string[]> = {
  goal: [
    'GOOOL! {p} la butta dentro!',
    '{p} non sbaglia: è GOL!',
    'La curva esplode: la firma è di {p}!',
    'Palla in rete! {p}, di rapina!',
  ],
  goalAssist: [
    'GOOOL! Palla d’oro di {q}, {p} deve solo spingerla dentro!',
    '{q} disegna, {p} colpisce: GOL!',
  ],
  yellow: ['Giallo per {p}: entrata dura.', 'Ammonito {p}, era diffidabile quell’intervento.'],
  red: ['ROSSO! {p} lascia i suoi in dieci!', 'Espulso {p} — che ingenuità!'],
  sub: ['Cambio: dentro {p}, fuori {q}.', 'Si rivede la panchina: {p} per {q}.'],
  chanceSaved: ['{p} calcia — il portiere dice NO!', 'Che occasione: gran parata su {p}!'],
  chanceMiss: ['{p} a un passo dal gol: fuori di un soffio.', 'Ci prova {p}: alto, non di molto.'],
  injury: ['Guaio: {p} resta a terra, non ce la fa.', '{p} si tocca il muscolo: deve uscire.'],
};

function cronacaLine(kind: string, seedKey: string, p: string, q?: string): string {
  const pool = CRONACA[kind] ?? CRONACA.chanceMiss!;
  const t = pool[hashStr(seedKey) % pool.length] ?? pool[0]!;
  return t.replace('{p}', p).replace('{q}', q ?? '');
}

/** La vista della diretta: tutto ciò che serve allo schermo-partita. */
export function liveView(s: GameSession) {
  const live = s.live;
  if (!live) return null;
  const match = live.match;
  const homeClub = s.world.clubs.get(match.homeClubId);
  const awayClub = s.world.clubs.get(match.awayClubId);
  if (!homeClub || !awayClub) return null;
  const nation = nationOfClub(s.world, s.club.id)?.code ?? 'ITA';
  const idOf = (c: Club) =>
    clubIdentity(c.name, c.reputation, leagueOfClub(s.world, c.id).name, nation);
  const homeId = idOf(homeClub);
  const awayId = idOf(awayClub);
  const nameOf = (pid: string | null): string =>
    pid ? (s.world.players.get(pid as PlayerId)?.name ?? '—') : '—';

  const events = live.events();
  const minute = live.minute();
  const score = live.score();

  // Badge per riga-giocatore: gol, cartellini, cambi.
  const badgesFor = (pid: string) => ({
    goals: events.filter((e) => e.type === 'goal' && (e.playerId as string) === pid).length,
    yellow: events.some((e) => e.type === 'yellow' && (e.playerId as string) === pid),
    red: events.some((e) => e.type === 'red' && (e.playerId as string) === pid),
    off: events.find((e) => e.type === 'sub' && (e.subOutId as string | null) === pid)?.minute,
    on: events.find((e) => e.type === 'sub' && (e.playerId as string) === pid)?.minute,
  });
  const userSideKey: 'home' | 'away' = live.userIsHome ? 'home' : 'away';
  const sideRows = (side: 'home' | 'away') =>
    live.onPitchEntries(side).map(({ player: p, slot }) => {
      // La TUA squadra si disegna con le posizioni VERE della lavagna tattica
      // (fase difensiva = il modulo); i subentrati senza punto cadono sulla linea.
      const board = side === userSideKey ? s.board?.difesa?.[p.id as string] : undefined;
      return {
        id: p.id as string,
        name: p.name,
        role: playableRoles(p).primary,
        line: slot,
        bx: board?.x ?? null,
        by: board?.y ?? null,
        ...badgesFor(p.id as string),
      };
    });

  // Telecronaca: eventi veri + occasioni sintetizzate dai tiri delle finestre.
  const feed: { minute: number; text: string; side: 'home' | 'away' | null }[] = [];
  for (const e of events) {
    const side = e.clubId === match.homeClubId ? 'home' : 'away';
    const key = `${match.id}|${e.minute}|${e.type}|${e.playerId}`;
    if (e.type === 'goal')
      feed.push({
        minute: e.minute,
        side,
        text: e.assistId
          ? cronacaLine('goalAssist', key, nameOf(e.playerId as string), nameOf(e.assistId))
          : cronacaLine('goal', key, nameOf(e.playerId as string)),
      });
    else if (e.type === 'yellow' || e.type === 'red')
      feed.push({
        minute: e.minute,
        side,
        text: cronacaLine(e.type, key, nameOf(e.playerId as string)),
      });
    else if (e.type === 'sub')
      feed.push({
        minute: e.minute,
        side,
        text: cronacaLine('sub', key, nameOf(e.playerId as string), nameOf(e.subOutId)),
      });
  }
  for (const inj of live.injuriesSoFar())
    feed.push({
      minute: inj.minute,
      side: live.userIsHome ? 'home' : 'away',
      text: cronacaLine('injury', `${match.id}|inj|${inj.player.id}`, inj.player.name),
    });
  // Occasioni: nelle finestre coi tiri ma senza gol, il racconto respira.
  const goalMinutes = new Set(events.filter((e) => e.type === 'goal').map((e) => e.minute));
  for (const w of live.windows()) {
    for (const side of ['home', 'away'] as const) {
      const shots = side === 'home' ? w.shotsHome : w.shotsAway;
      if (shots <= 0) continue;
      const hasGoal = [...goalMinutes].some((m) => m > w.from && m <= w.to);
      if (hasGoal || hashStr(`${match.id}|occ|${w.from}|${side}`) % 100 >= 55) continue;
      const xi = live.onPitch(side).filter((p) => p.position !== 'GK');
      const shooter = xi[hashStr(`${match.id}|sh|${w.from}|${side}`) % Math.max(1, xi.length)];
      if (!shooter) continue;
      const m = Math.min(
        90,
        w.from + 1 + (hashStr(`${match.id}|om|${w.from}|${side}`) % Math.max(1, w.to - w.from)),
      );
      feed.push({
        minute: m,
        side,
        text: cronacaLine(
          hashStr(`${match.id}|ok|${w.from}|${side}`) % 2 === 0 ? 'chanceSaved' : 'chanceMiss',
          `${match.id}|oc|${w.from}|${side}`,
          shooter.name,
        ),
      });
    }
  }
  feed.sort((a, b) => a.minute - b.minute);

  // Momentum [-1..1]: le ultime finestre dicono chi sta spingendo (xG recente).
  const wins = live.windows().slice(-3);
  const mh = wins.reduce((a, w) => a + w.xgHome, 0);
  const ma = wins.reduce((a, w) => a + w.xgAway, 0);
  const momentum = mh + ma > 0.02 ? (mh - ma) / (mh + ma) : 0;

  return {
    minute,
    finished: live.finished(),
    userIsHome: live.userIsHome,
    home: {
      name: homeClub.name,
      color: homeId.primary,
      accent: homeId.accent,
      score: score.home,
      rows: sideRows('home'),
    },
    away: {
      name: awayClub.name,
      color: awayId.primary,
      accent: awayId.accent,
      score: score.away,
      rows: sideRows('away'),
    },
    bench: live.bench().map((p) => ({
      id: p.id as string,
      name: p.name,
      role: playableRoles(p).primary,
    })),
    subsLeft: live.subsLeft(),
    momentum,
    feed,
    lastLine: feed.filter((f) => f.minute <= minute).at(-1)?.text ?? 'Si parte!',
  };
}

export function livePlayTo(s: GameSession, minute: number): void {
  s.live?.playTo(minute);
}

export function liveSub(s: GameSession, outId: string, inId: string): boolean {
  return s.live?.sub(outId as PlayerId, inId as PlayerId) ?? false;
}

/** Fischio finale: chiude gara e giornata (stessa coda del quick-result). */
export function liveFinish(s: GameSession): RoundResult | null {
  const live = s.live;
  if (!live) return null;
  const res = live.finish();
  s.live = undefined;
  return afterRound(s, res);
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
export function hubDetails(
  s: GameSession,
): Record<'stadio' | 'campo' | 'staff' | 'ufficio' | 'marketing' | 'giovanile', string> {
  const d = dashboard(s);
  const squad = s.club.playerIds.map((id) => s.world.players.get(id)!).filter(Boolean);
  const avg = Math.round(squad.reduce((a, p) => a + playerOverall(p), 0) / squad.length);
  const injured = squad.filter((p) => injuryLabel(p)).length;
  const cap = stadiumCapacity(s.club);
  const markets = Object.keys(s.club.foreignFans ?? {}).length;
  const worldFans = Object.values(s.club.foreignFans ?? {}).reduce((a, m) => a + m.fans, 0);
  return {
    stadio: d.finished
      ? `${(cap / 1000).toFixed(0)}k posti · stagione finita`
      : `vs ${d.nextMatch} · ${(cap / 1000).toFixed(0)}k posti`,
    campo: `rosa ${starString(avg)} · ${injured === 0 ? 'nessun infortunato' : `${injured} infortunat${injured === 1 ? 'o' : 'i'}`}`,
    staff: `budget mercato ${(s.club.finances.transferBudget / 1e6).toFixed(0)}M · cassa ${(s.club.finances.cash / 1e6).toFixed(0)}M`,
    ufficio:
      markets === 0
        ? 'il planisfero del marketing: conquista il mondo'
        : `${markets} mercat${markets === 1 ? 'o' : 'i'} nel mondo · ${worldFans >= 1e6 ? `${(worldFans / 1e6).toFixed(1)}M` : `${Math.round(worldFans / 1000)}k`} tifosi`,
    marketing:
      s.club.marketing?.abbonati !== undefined && s.club.marketing.abbonati > 0
        ? `${Math.round(s.club.marketing.abbonati / 1000)}k abbonati · biglietti e campagne`
        : 'biglietti, abbonamenti e campagne',
    giovanile: s.academy
      ? `accademia liv. ${s.academy.level} · ${s.academy.prospects.length} ragazzi in Primavera`
      : 'il vivaio aspetta un presidente che ci creda',
  };
}

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

function applyPlanToRunner(s: GameSession): void {
  const p = s.plan;
  const empty =
    !p ||
    (p.style === undefined &&
      (p.line === undefined || p.line === 'media') &&
      (p.marking === undefined || p.marking === 'zona') &&
      (p.aggression === undefined || p.aggression === 'normale') &&
      p.setPiece === undefined);
  s.runner.setPlan(s.club.id, empty ? null : (p as TeamPlan));
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

/**
 * G2 — percentili di ruolo vs i PARI RUOLO del campionato (minuti veri).
 * Per i giocatori NON tuoi serve scouting (≥3 osservazioni); fuori dal tuo
 * campionato le statistiche non sono tracciate (limite dichiarato).
 */
export function percentilesFor(s: GameSession, playerId: string) {
  const p = s.world.players.get(playerId as PlayerId);
  if (!p) return null;
  const mine = s.club.playerIds.includes(p.id);
  const obs = s.observations?.[playerId] ?? 0;
  if (!mine && obs < 3) return { gated: true as const, have: obs, needed: 3 };
  const stats = s.runner.playerStats();
  const st = stats.get(p.id);
  if (!st || st.minutes < 90) return { gated: false as const, ready: false as const };
  const peers: PlayerSeasonStats[] = [];
  for (const [pid, x] of stats) {
    const q = s.world.players.get(pid);
    if (q?.position === p.position && x.minutes >= 180) peers.push(x);
  }
  if (peers.length < 8) return { gated: false as const, ready: false as const };
  const p90 = (x: PlayerSeasonStats, v: number) => (v * 90) / Math.max(1, x.minutes);
  const pctOf = (get: (x: PlayerSeasonStats) => number, v: number, invert = false) => {
    let below = 0;
    let ties = 0;
    for (const x of peers) {
      const w = get(x);
      if (w < v) below++;
      else if (w === v) ties++;
    }
    const raw = ((below + ties / 2) / peers.length) * 100;
    return invert ? 100 - raw : raw;
  };
  const m = (
    label: string,
    get: (x: PlayerSeasonStats) => number,
    fmt: (v: number) => string,
    invert = false,
  ) => ({ label, pct: pctOf(get, get(st), invert), value: fmt(get(st)) });
  const f1 = (v: number) => v.toFixed(1);
  const f2 = (v: number) => v.toFixed(2);
  const pc = (v: number) => `${(v * 100).toFixed(0)}%`;
  const media = (x: PlayerSeasonStats) => (x.apps > 0 ? x.ratingSum / x.apps : 0);
  const metrics =
    p.position === 'GK'
      ? [
          m('parate', (x) => (x.shotsFaced > 0 ? x.saves / x.shotsFaced : 0), pc),
          m('xG evitati/90', (x) => p90(x, x.psxgFaced - x.concededOn), f2),
          m('clean sheet', (x) => (x.apps > 0 ? x.cleanSheets / x.apps : 0), pc),
          m('subiti/90', (x) => p90(x, x.concededOn), f2, true),
          m('pagella', media, f2),
        ]
      : p.position === 'DF'
        ? [
            m('contrasti', (x) => (x.tacklesTot > 0 ? x.tacklesWon / x.tacklesTot : 0), pc),
            m('anticipi/90', (x) => p90(x, x.interceptions), f1),
            m('aerei', (x) => (x.aerialsTot > 0 ? x.aerialsWon / x.aerialsTot : 0), pc),
            m('spazzate/90', (x) => p90(x, x.clearances), f1),
            m('progressivi/90', (x) => p90(x, x.progPasses), f1),
            m('pagella', media, f2),
          ]
        : p.position === 'MF'
          ? [
              m('xA/90', (x) => p90(x, x.xa), f2),
              m('key pass/90', (x) => p90(x, x.keyPasses), f1),
              m('precisione', (x) => (x.passes > 0 ? x.passesOk / x.passes : 0), pc),
              m('recuperi/90', (x) => p90(x, x.recoveries), f1),
              m('progressivi/90', (x) => p90(x, x.progPasses), f1),
              m('pagella', media, f2),
            ]
          : [
              m('gol/90', (x) => p90(x, x.goals), f2),
              m('xG/90', (x) => p90(x, x.xg), f2),
              m('tiri/90', (x) => p90(x, x.shots), f1),
              m('xA/90', (x) => p90(x, x.xa), f2),
              m('dribbling/90', (x) => p90(x, x.dribbles), f1),
              m('pagella', media, f2),
            ];
  return { gated: false as const, ready: true as const, peers: peers.length, metrics };
}

export function playerDetail(s: GameSession, name: string) {
  const p = s.club.playerIds.map((id) => s.world.players.get(id)!).find((x) => x?.name === name);
  if (!p) return null;
  const contract = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
  // G1: le statistiche stagionali vere (pagelle incluse) dal runner.
  const st = s.runner.playerStats().get(p.id);
  const per90 = (v: number) => (st && st.minutes > 0 ? (v * 90) / st.minutes : 0);
  return {
    heat: playerHeatView(s, p.id as string),
    stats: st
      ? {
          apps: st.apps,
          minutes: st.minutes,
          rating: st.apps > 0 ? st.ratingSum / st.apps : 0,
          goals: st.goals,
          assists: st.assists,
          xg: st.xg,
          xa: st.xa,
          xg90: per90(st.xg),
          shots90: per90(st.shots),
          keyPasses90: per90(st.keyPasses),
          dribbles90: per90(st.dribbles),
          passAcc: st.passes > 0 ? st.passesOk / st.passes : 0,
          recoveries90: per90(st.recoveries),
          tackleWinPct: st.tacklesTot > 0 ? st.tacklesWon / st.tacklesTot : 0,
          aerialWinPct: st.aerialsTot > 0 ? st.aerialsWon / st.aerialsTot : 0,
          cleanSheets: st.cleanSheets,
          concededOn: st.concededOn,
          saves: st.saves,
          savePct: st.shotsFaced > 0 ? st.saves / st.shotsFaced : 0,
          psxgDiff: st.psxgFaced - st.concededOn,
          yellow: st.yellow,
          red: st.red,
          km: st.apps > 0 ? st.km / st.apps : 0,
        }
      : null,
    name: p.name,
    pos: p.position,
    age: p.age,
    nationality: p.nationality,
    foot: p.preferredFoot,
    /** G2: niente numero — fascia parlata + movimenti senza palla. */
    band: bandOf(playerOverall(p), p.age),
    movements: playerMovements(p),
    running: runningStyle(p),
    /** G3: quotazione che segue il rendimento. */
    value:
      Math.round(
        (baseMarketValue(
          playerOverall(p),
          p.age,
          p.potential,
          contractYearsLeft(s.world, p, s.year),
        ) *
          formFor(s, p, s.club)) /
          100_000,
      ) * 100_000,
    formPct: Math.round((formFor(s, p, s.club) - 1) * 100),
    percentiles: percentilesFor(s, p.id as string),
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
  eventi: 'Eventi (tour e concerti)',
  abbonamenti: 'Abbonamenti',
  pubblicita: 'Pubblicità (bordocampo e naming)',
  ritiro: 'Ritiro estivo',
  wages: 'Stipendi calciatori',
  facilities: 'Gestione impianti',
  matchday: 'Costi del matchday',
  interessi: 'Interessi sul fido',
  transfer_in: 'Cartellini',
  agency_fees: 'Commissioni agenti',
  stadio: 'Cantieri stadio',
  marketing: 'Campagne marketing',
  giovanile: 'Settore giovanile',
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
import {
  ACADEMY,
  type AcademyState,
  academyIntake,
  levelSpec,
  promoteProspect,
  scoutJudgment,
  sellProspectDeal,
  sendOnLoan,
  settleAcademyYear,
  youthOffers,
} from '../../src/engine/academy';
import {
  COACH_STYLES,
  STYLE_KEYS,
  fitLabel,
  squadFit,
  styleLabel,
} from '../../src/engine/coach-styles';

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
  ufficioMarketing: 'Ufficio marketing',
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
    /** Naming rights (MODULE_STADIUM §3.4): il nome commerciale, se venduto. */
    namingName: stadiumNamingName(s.club),
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

// ---- Ufficio marketing (MODULE_STADIUM §3.4): listino, abbonamenti, campagne ----

function ensureMarketing(s: GameSession) {
  if (!s.club.marketing) s.club.marketing = { plan: {} };
  return s.club.marketing;
}

/** Club-ombra con un piano modificato, per le STIME della UI (zero mutazioni). */
function withPlan(s: GameSession, patch: Partial<TicketPlan>) {
  const m = s.club.marketing ?? { plan: {} };
  return { ...s.club, marketing: { ...m, plan: { ...m.plan, ...patch } } };
}

const MATCH_CLASSES: readonly { id: MatchClass; label: string }[] = [
  { id: 'campionato', label: 'Campionato' },
  { id: 'cartello', label: 'Partita di cartello' },
  { id: 'coppa', label: 'Coppa' },
] as const;

/**
 * La vista dell'ufficio marketing (l'ufficio ESISTE GIÀ, richiesta utente): la
 * biglietteria è inclusa; abbonamenti, campagne nazionali e desk internazionale
 * sono servizi da comprare una tantum. Aprire l'ufficio attiva il modello nuovo.
 */
export function marketingView(s: GameSession) {
  const m = ensureMarketing(s);
  const power = officePower(s.world, s.club);
  const cap = stadiumCapacity(s.club);
  // Classifica VIVA e forma: le stime del listino seguono il campo, non le attese.
  const live = livePosition(s.season, s.club.id as string);
  const posFrac = live && live.n > 1 ? (live.n - live.pos) / (live.n - 1) : 0.5;
  const momentum = recentForm(s.season, s.club.id as string);

  // Listino per classe di gara: fascia attuale + stime per fascia (incasso paganti/gara).
  const listino = MATCH_CLASSES.map((cls) => ({
    ...cls,
    current: (m.plan.prices?.[cls.id] ?? 'standard') as PriceLevel,
    options: PRICE_LEVELS.map((level) => {
      const g = marketingMatchGate(
        s.world,
        withPlan(s, { prices: { ...m.plan.prices, [cls.id]: level } }),
        cls.id,
        posFrac,
        momentum,
      );
      return { level, gate: g.gate, fillPct: Math.round(g.fill * 100) };
    }),
  }));

  // Abbonamenti: fascia + tetto attuali, stime per fascia, campagna chiusa.
  const abbOptions = PRICE_LEVELS.map((level) => {
    const shadow = withPlan(s, { abbPrice: level });
    const d = subscriberDemand(s.world, shadow, shadow.marketing, s.year);
    return {
      level,
      price: seasonTicketPrice(s.world, shadow, level),
      abbonati: d.abbonati,
      income: d.abbonati * seasonTicketPrice(s.world, shadow, level),
    };
  });
  const sat = m.lastSatisfaction;

  // Settori (idea c): fascia per settore con i posti veri.
  const sectors = SECTOR_IDS.filter((id) => s.club.stadium.sectors[id].seats > 0).map((id) => ({
    id,
    name: sectorName(s.club.stadium, id),
    seats: s.club.stadium.sectors[id].seats,
    current: (m.plan.sectorPrices?.[id] ?? 'standard') as PriceLevel,
  }));

  // La prossima in casa: classe riconosciuta (derby/cartello) per orientare il listino.
  let nextHome: { opponent: string; cls: MatchClass; derby: boolean; round: number } | null = null;
  if (!s.runner.isFinished()) {
    const round = s.runner.nextRound();
    for (const f of s.season.fixtures) {
      if (f.round < round || f.homeClubId !== s.club.id) continue;
      const opp = s.world.clubs.get(f.awayClubId);
      if (!opp) continue;
      const oppLive = livePosition(s.season, opp.id as string);
      const totalRounds = new Set(s.season.fixtures.map((x) => x.round)).size;
      nextHome = {
        opponent: opp.name,
        cls: matchClassOf(s.club, opp, {
          myPos: live?.pos,
          oppPos: oppLive?.pos,
          roundFrac: totalRounds > 0 ? f.round / totalRounds : 0,
        }),
        derby: isDerby(s.club, opp),
        round: f.round,
      };
      break;
    }
  }

  // PUBBLICITÀ (A): bordocampo — contratti in essere + offerte dell'anno.
  const boards = {
    owned: hasFeature(s.club, 'pubblicita'),
    slots: boardSlots(s.club),
    deals: (m.boards ?? []).map((b) => ({
      brandName: b.brandName,
      annualValue: b.annualValue,
      endYear: b.endYear,
    })),
    offers:
      (m.boards ?? []).length < boardSlots(s.club)
        ? boardOffers(s.world, s.club, s.year).map((o) => ({
            brandId: o.brandId,
            brandName: o.brandName,
            tier: o.tier,
            annualValue: o.annualValue,
            years: o.years,
          }))
        : [],
  };

  // NAMING RIGHTS (B): il nome dello stadio in vendita (o già venduto).
  const naming = m.naming
    ? {
        active: {
          name: `${m.naming.brandName} Arena`,
          annualValue: m.naming.annualValue,
          endYear: m.naming.endYear,
        },
        offers: [] as ReturnType<typeof namingOffers>,
      }
    : { active: null, offers: namingOffers(s.world, s.club, s.year) };

  // PROMO DELLA GARA (C) + TESTIMONIAL (D).
  const promo = {
    owned: hasFeature(s.club, 'pubblicita'),
    current: m.promo && nextHome && m.promo.round === nextHome.round ? m.promo.kind : null,
    options: (['famiglie', 'omaggio', 'scuole'] as const).map((kind) => ({
      kind,
      fill: Math.round(MKT.PROMO[kind]!.fill * 100),
      gate: Math.round(MKT.PROMO[kind]!.gate * 100),
    })),
  };
  const testimonialFeeOf = (p: Player) => {
    const wage = (p.contractId ? s.world.contracts.get(p.contractId)?.wage : 0) ?? 0;
    return Math.max(
      MKT.TESTIMONIAL_FEE_MIN,
      Math.round((wage * 52 * MKT.TESTIMONIAL_FEE_SHARE) / 10_000) * 10_000,
    );
  };
  const squadPlayers = s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined);
  const currentTestimonial = m.testimonial
    ? squadPlayers.find((p) => (p.id as string) === m.testimonial?.playerId)
    : undefined;
  const testimonial = {
    owned: hasFeature(s.club, 'campagne'),
    current: currentTestimonial
      ? {
          name: currentTestimonial.name,
          boostPct: Math.round(testimonialBoost(s.world, s.club) * 100),
        }
      : m.testimonial
        ? { name: 'ceduto — campagna orfana', boostPct: 0 }
        : null,
    candidates:
      m.testimonial === undefined
        ? [...squadPlayers]
            .sort((a, b) => playerOverall(b) - playerOverall(a))
            .slice(0, 6)
            .map((p) => ({
              id: p.id as string,
              name: p.name,
              band: bandOf(playerOverall(p), p.age),
              fee: testimonialFeeOf(p),
            }))
        : [],
  };

  const covered = Object.values(s.club.stadium.sectors).filter(
    (x) => x.seats > 0 && x.covered,
  ).length;
  // Campagna INTERNAZIONALE: i mercati-nazione (fuori dalla patria), coi tuoi numeri.
  const homeCode = nationOfClub(s.world, s.club.id)?.code;
  const abroadMarkets = Object.keys(NATION_COORDS)
    .filter((code) => code !== homeCode)
    .map((code) => ({
      code,
      fans: s.club.foreignFans?.[code]?.fans ?? 0,
      locals: s.club.playerIds.filter((pid) => s.world.players.get(pid)?.nationality === code)
        .length,
    }))
    .sort((a, b) => b.fans - a.fans || b.locals - a.locals);

  return {
    powerPct: Math.round(power * 100),
    /** Prezzo base in € (richiesta utente): scelto o default della lega. */
    prezzo: {
      base: ticketBasePrice(s.world, s.club),
      default: defaultTicketPrice(s.world, s.club),
      min: MKT.PRICE_MIN,
      max: MKT.PRICE_MAX,
    },
    /** Classifica viva e forma: il pubblico segue il campo. */
    live: live
      ? { pos: live.pos, n: live.n, momentum: Math.round(momentum * MKT.MOMENTUM_N) }
      : null,
    /** Pubblicità (A/B/C/D): bordocampo, naming, promo-gara, testimonial. */
    boards,
    naming,
    promo,
    testimonial,
    /** I servizi comprabili (la biglietteria è sempre inclusa). */
    features: MKT_FEATURES.map((f) => ({
      id: f.id,
      label: f.label,
      cost: f.cost,
      desc: f.desc,
      owned: hasFeature(s.club, f.id),
    })),
    abroad: {
      owned: hasFeature(s.club, 'estero'),
      nation: m.abroadNation ?? null,
      locked: m.abroadPaidYear === s.year,
      cost: MKT.ABROAD_COST,
      markets: abroadMarkets,
    },
    abbOwned: hasFeature(s.club, 'abbonamenti'),
    campaignsOwned: hasFeature(s.club, 'campagne'),
    listino,
    nextHome,
    abbonamenti: {
      current: (m.plan.abbPrice ?? 'standard') as PriceLevel,
      capShare: m.plan.abbCapShare ?? MKT.ABB_DEFAULT_SHARE,
      maxShare: MKT.ABB_MAX_SHARE,
      capacity: cap,
      options: abbOptions,
      sottoscritti: m.abbonati ?? null,
      pricePaid: m.abbPricePaid ? seasonTicketPrice(s.world, s.club, m.abbPricePaid) : null,
      satisfaction: sat === undefined ? null : sat >= 0.6 ? 'alta' : sat >= 0.4 ? 'media' : 'bassa',
    },
    sectors,
    soldOutStreak: m.soldOutStreak ?? 0,
    hypeAt: MKT.HYPE_STREAK,
    campaigns: CAMPAIGNS.map((c) => ({
      id: c.id,
      label: c.label,
      cost: c.cost,
      desc: c.desc,
      active: m.plan.campaign === c.id,
      ok:
        (c.minReputation === undefined || s.club.reputation >= c.minReputation) &&
        (c.minCoveredSectors === undefined || covered >= c.minCoveredSectors),
      reason:
        c.minReputation !== undefined && s.club.reputation < c.minReputation
          ? 'serve più reputazione'
          : c.minCoveredSectors !== undefined && covered < c.minCoveredSectors
            ? `servono ${c.minCoveredSectors} settori coperti`
            : null,
    })),
    campaignLocked: m.campaignPaidYear === s.year,
  };
}

/** Compra un servizio dell'ufficio marketing (una tantum, resta per sempre). */
export function buyFeature(s: GameSession, id: MarketingFeature): string {
  const m = ensureMarketing(s);
  const spec = MKT_FEATURES.find((f) => f.id === id);
  if (!spec) return 'Servizio sconosciuto.';
  if (hasFeature(s.club, id)) return 'Il servizio è già attivo.';
  if (spendingRoom(s.world, s.club, s.year) < spec.cost)
    return 'Non c’è margine in cassa (nemmeno col fido) per attivarlo.';
  s.club.finances.cash -= spec.cost;
  s.club.finances.expenses.push({
    type: 'marketing',
    amount: spec.cost,
    year: s.year,
    note: spec.label,
  });
  m.features = [...(m.features ?? []), id];
  refreshTreasury(s);
  gazzetta(s, 0, `L'ufficio marketing si allarga: attivato il servizio "${spec.label}".`);
  return `"${spec.label}" attivato: da ora è tuo per sempre.`;
}

/**
 * Lancia la campagna INTERNAZIONALE dell'anno su un mercato-nazione (una a stagione):
 * con giocatori del posto moltiplica la crescita dei tifosi al conguaglio, senza
 * SEMINA il mercato da zero (scala con la fama, come i tour).
 */
export function chooseAbroadCampaign(s: GameSession, nation: string): string {
  if (!hasFeature(s.club, 'estero')) return 'Prima serve il Desk internazionale.';
  const m = ensureMarketing(s);
  if (m.abroadPaidYear === s.year) return 'La campagna internazionale di quest’anno è già partita.';
  if (!Object.keys(NATION_COORDS).includes(nation)) return 'Mercato sconosciuto.';
  if (spendingRoom(s.world, s.club, s.year) < MKT.ABROAD_COST)
    return 'Non c’è margine in cassa (nemmeno col fido) per pagarla.';
  s.club.finances.cash -= MKT.ABROAD_COST;
  s.club.finances.expenses.push({
    type: 'marketing',
    amount: MKT.ABROAD_COST,
    year: s.year,
    note: `campagna internazionale: ${nation}`,
  });
  m.abroadNation = nation;
  m.abroadPaidYear = s.year;
  refreshTreasury(s);
  gazzetta(s, 0, `Il club investe sul mercato ${nation}: parte la campagna internazionale.`);
  return `Campagna internazionale lanciata su ${nation}: gli effetti si vedono a fine stagione.`;
}

/** Firma un cartellone a bordocampo (A): prima annualità subito in cassa. */
export function signBoard(s: GameSession, brandId: string): string {
  if (!hasFeature(s.club, 'pubblicita')) return 'Prima serve la Regia pubblicitaria.';
  const offer = boardOffers(s.world, s.club, s.year).find((o) => o.brandId === brandId);
  if (!offer) return 'L’offerta non è più sul tavolo.';
  const deal = signBoardDeal(s.club, offer, s.year);
  if (!deal) return 'Bordocampo pieno: gli slot sono tutti venduti.';
  refreshTreasury(s);
  gazzetta(
    s,
    0,
    `${offer.brandName} compra un cartellone a bordocampo: ${(offer.annualValue / 1000).toFixed(0)}k a stagione per ${offer.years} ann${offer.years === 1 ? 'o' : 'i'}.`,
  );
  return `Firmato: ${offer.brandName} a bordocampo.`;
}

/** Vende il NOME dello stadio (B): anticipo pesante, curva ferita. */
export function sellStadiumName(s: GameSession, brandId: string): string {
  const offer = namingOffers(s.world, s.club, s.year).find((o) => o.brandId === brandId);
  if (!offer) return 'L’offerta non è più sul tavolo.';
  if (!signNamingDeal(s.club, offer, s.year)) return 'Il nome dello stadio è già venduto.';
  refreshTreasury(s);
  gazzetta(
    s,
    0,
    `Lo stadio cambia nome: nasce la ${offer.stadiumName} (${offer.years} anni). La curva espone lo striscione: "IL NOSTRO NOME NON SI VENDE".`,
  );
  return `Fatto: benvenuti alla ${offer.stadiumName}. I tifosi non l'hanno presa bene.`;
}

/** Promo della PROSSIMA gara in casa (C); null la toglie. */
export function setPromo(s: GameSession, round: number, kind: PromoKind | null): void {
  if (!hasFeature(s.club, 'pubblicita')) return;
  const m = ensureMarketing(s);
  m.promo = kind === null ? undefined : { round, kind };
}

/** Sceglie il testimonial dell'anno (D): fee subito, faccia sulle campagne. */
export function setTestimonial(s: GameSession, playerId: string): string {
  if (!hasFeature(s.club, 'campagne')) return 'Prima serve il Reparto creativo.';
  const m = ensureMarketing(s);
  if (m.testimonial) return 'Il testimonial dell’anno è già stato scelto.';
  const p = s.world.players.get(playerId as never);
  if (!p || !s.club.playerIds.some((id) => (id as string) === playerId))
    return 'Il giocatore non è in rosa.';
  const wage = (p.contractId ? s.world.contracts.get(p.contractId)?.wage : 0) ?? 0;
  const fee = Math.max(
    MKT.TESTIMONIAL_FEE_MIN,
    Math.round((wage * 52 * MKT.TESTIMONIAL_FEE_SHARE) / 10_000) * 10_000,
  );
  if (spendingRoom(s.world, s.club, s.year) < fee)
    return 'Non c’è margine in cassa (nemmeno col fido) per la fee.';
  s.club.finances.cash -= fee;
  s.club.finances.expenses.push({
    type: 'marketing',
    amount: fee,
    year: s.year,
    note: `testimonial: ${p.name}`,
  });
  m.testimonial = { playerId, fee };
  refreshTreasury(s);
  gazzetta(s, 0, `${p.name} è la faccia del club: firmata la campagna con il suo entourage.`);
  return `${p.name} è il testimonial dell'anno.`;
}

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

// ---- ATELIER DELLE DIVISE (E): editor, proposte sponsor, verdetto, archivio ----

/** I colori sociali del club (l'ancora della fedeltà). */
function identityColors(s: GameSession): { primary: string; secondary: string } {
  const league = leagueOfClub(s.world, s.club.id);
  const nation = nationOfClub(s.world, s.club.id)?.code ?? 'ITA';
  const id = clubIdentity(s.club.name, s.club.reputation, league.name, nation);
  return { primary: id.primary, secondary: id.secondary };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [
    Number.parseInt(v.slice(0, 2), 16) || 0,
    Number.parseInt(v.slice(2, 4), 16) || 0,
    Number.parseInt(v.slice(4, 6), 16) || 0,
  ];
}

function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 441.7;
}

/** Fedeltà [0..1] della divisa ai colori sociali (corpo+dettaglio, il migliore dei versi). */
export function kitFidelity(s: GameSession, design: KitDesign): number {
  const id = identityColors(s);
  const dritta =
    (colorDist(design.primary, id.primary) + colorDist(design.secondary, id.secondary)) / 2;
  const rovescia =
    (colorDist(design.primary, id.secondary) + colorDist(design.secondary, id.primary)) / 2;
  return Math.max(0, 1 - Math.min(dritta, rovescia) * 1.6);
}

/** Com'era quell'annata? Per la rievocazione: oro, buona o anonima. */
export function annataOf(s: GameSession, year: number): { label: string; golden: boolean } | null {
  const e = (s.annals ?? []).find((a) => a.year === year);
  if (!e) return null;
  if (e.cupWon && e.position === 1 && e.tier === 1) return { label: 'DOPPIETTA', golden: true };
  if (e.position === 1 && e.tier === 1) return { label: 'campioni', golden: true };
  if (e.cupWon) return { label: 'coppa vinta', golden: true };
  if (e.promoted) return { label: 'promozione', golden: true };
  if (e.relegated) return { label: 'retrocessione', golden: false };
  if (e.position <= 4) return { label: `${e.position}º posto`, golden: false };
  return { label: `${e.position}º posto`, golden: false };
}

const KIT_PATTERNS: readonly KitPattern[] = [
  'tinta',
  'palato',
  'palatoSottile',
  'fasciato',
  'fasciaUnica',
  'sash',
  'bandaSottile',
  'mezzo',
  'quarti',
  'croce',
  'scacchi',
  'rombi',
  'vstorica',
  'sfumato',
  'spallato',
  'palaCentrale',
  'gessato',
  'cerchiato',
  'diagonaleDoppia',
  'metaOrizzontale',
  'geometrico90',
  'saetta',
  'onda',
  'doppiaV',
] as const;

/** Le 3 proposte dello sponsor tecnico (deterministiche da brand+anno). */
function sponsorKitProposals(s: GameSession): { brandName: string; designs: KitDesign[] } | null {
  const tech =
    (s.club.sponsors ?? []).find((c) => c.slot === 'tecnico') ??
    (s.club.sponsors ?? []).find((c) => c.slot === 'maglia');
  if (!tech) return null;
  const id = identityColors(s);
  const shade = (hex: string, f: number) => {
    const [r, g, b] = hexToRgb(hex);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `#${c(r).toString(16).padStart(2, '0')}${c(g).toString(16).padStart(2, '0')}${c(b).toString(16).padStart(2, '0')}`;
  };
  const designs: KitDesign[] = [0, 1, 2].map((i) => {
    const h = hashStr(`${tech.brandId}|kit|${s.year}|${i}`);
    const pattern = KIT_PATTERNS[h % KIT_PATTERNS.length] ?? 'palato';
    const flip = h % 2 === 0;
    return {
      pattern,
      primary: flip ? id.primary : id.secondary,
      secondary: flip ? id.secondary : id.primary,
      sleeves: i === 2 ? shade(id.primary, 0.55) : flip ? id.primary : id.secondary,
      collar: i === 1 ? '#f5f5f4' : shade(id.secondary, 0.7),
      style: (['moderno', 'storico', 'creativo'] as const)[i % 3] as KitStyle,
      origin: 'sponsor',
    };
  });
  return { brandName: tech.brandName, designs };
}

/** La vista dell'Atelier: maglia dell'anno, archivio con le annate, proposte sponsor. */
export function kitAtelierView(s: GameSession) {
  const m = ensureMarketing(s);
  const kits = m.kits ?? { archive: [] };
  return {
    owned: hasFeature(s.club, 'divise'),
    launched: kits.current?.year === s.year,
    current: kits.current ?? null,
    identity: identityColors(s),
    sponsorName: (s.club.sponsors ?? []).find((c) => c.slot === 'maglia')?.brandName ?? null,
    proposals: sponsorKitProposals(s),
    archive: [...kits.archive]
      .reverse()
      .slice(0, 12)
      .map((e) => ({
        year: e.year,
        design: e.design,
        verdictPct: e.verdictPct,
        annata: annataOf(s, e.year),
      })),
  };
}

/** Lancia la divisa dell'anno: verdetto della piazza, incasso merch, archivio. */
export function launchKit(s: GameSession, design: KitDesign): string {
  if (!hasFeature(s.club, 'divise')) return "Prima serve l'Atelier delle divise.";
  ensureMarketing(s);
  const golden =
    design.origin === 'rievocazione' && design.sourceYear !== undefined
      ? (annataOf(s, design.sourceYear)?.golden ?? false)
      : false;
  const res = launchKitDeal(s.world, s.club, design, s.year, {
    fidelity: kitFidelity(s, design),
    golden,
  });
  if (!res) return 'La maglia di quest’anno è già stata lanciata: la prossima all’estate.';
  refreshTreasury(s);
  const rievoca =
    design.origin === 'rievocazione' && design.sourceYear !== undefined
      ? ` La rievocazione del ${design.sourceYear} ${golden ? 'fa impazzire i nostalgici' : 'lascia qualche alzata di spalle'}.`
      : '';
  gazzetta(
    s,
    0,
    res.verdict === 'amore'
      ? `NUOVA MAGLIA (${design.style}): la piazza la ama — ${(res.income / 1e6).toFixed(1)}M di merchandising al lancio.${rievoca}`
      : res.verdict === 'fischi'
        ? `Nuova maglia (${design.style}): fischi dalla curva. Vende comunque ${(res.income / 1e6).toFixed(1)}M.${rievoca}`
        : `Nuova maglia (${design.style}): accoglienza tiepida, ${(res.income / 1e6).toFixed(1)}M al lancio.${rievoca}`,
  );
  return res.verdict === 'amore'
    ? `La piazza la AMA (${res.verdictPct}/100): +${(res.income / 1e6).toFixed(1)}M di merch.`
    : res.verdict === 'fischi'
      ? `Fischi (${res.verdictPct}/100)... ma ${(res.income / 1e6).toFixed(1)}M entrano comunque.`
      : `Tiepida (${res.verdictPct}/100): ${(res.income / 1e6).toFixed(1)}M di merch.`;
}

/** Prezzo base del biglietto in € (richiesta utente); null = torna al default di lega. */
export function setBasePrice(s: GameSession, euros: number | null): void {
  const m = ensureMarketing(s);
  m.plan = {
    ...m.plan,
    basePrice:
      euros === null
        ? undefined
        : Math.max(MKT.PRICE_MIN, Math.min(MKT.PRICE_MAX, Math.round(euros))),
  };
  refreshTreasury(s);
}

/** Fascia di prezzo per una classe di gara. */
export function setMatchPrice(s: GameSession, cls: MatchClass, level: PriceLevel): void {
  const m = ensureMarketing(s);
  m.plan = { ...m.plan, prices: { ...m.plan.prices, [cls]: level } };
  refreshTreasury(s);
}

/** Fascia di prezzo di un settore (layer sopra la classe di gara). */
export function setSectorTicketPrice(s: GameSession, sector: SectorId, level: PriceLevel): void {
  const m = ensureMarketing(s);
  m.plan = { ...m.plan, sectorPrices: { ...m.plan.sectorPrices, [sector]: level } };
  refreshTreasury(s);
}

/** Fascia e tetto della campagna abbonamenti (si chiude alla prossima estate). */
export function setAbbonamenti(s: GameSession, level: PriceLevel, capShare: number): void {
  const m = ensureMarketing(s);
  m.plan = {
    ...m.plan,
    abbPrice: level,
    abbCapShare: Math.max(0, Math.min(MKT.ABB_MAX_SHARE, capShare)),
  };
  refreshTreasury(s);
}

/** Lancia la campagna marketing dell'anno (una a stagione, si paga subito). */
export function chooseCampaign(s: GameSession, id: CampaignId): string {
  if (!hasFeature(s.club, 'campagne')) return 'Prima serve il Reparto creativo.';
  const m = ensureMarketing(s);
  if (m.campaignPaidYear === s.year)
    return 'La campagna di quest’anno è già partita: se ne lancia una a stagione.';
  const spec = CAMPAIGNS.find((c) => c.id === id);
  if (!spec) return 'Campagna sconosciuta.';
  if (spec.minReputation !== undefined && s.club.reputation < spec.minReputation)
    return 'Il club non ha ancora il blasone per questa campagna.';
  const covered = Object.values(s.club.stadium.sectors).filter(
    (x) => x.seats > 0 && x.covered,
  ).length;
  if (spec.minCoveredSectors !== undefined && covered < spec.minCoveredSectors)
    return `Servono almeno ${spec.minCoveredSectors} settori coperti.`;
  if (spendingRoom(s.world, s.club, s.year) < spec.cost)
    return 'Non c’è margine in cassa (nemmeno col fido) per pagarla.';
  s.club.finances.cash -= spec.cost;
  s.club.finances.expenses.push({
    type: 'marketing',
    amount: spec.cost,
    year: s.year,
    note: spec.label,
  });
  m.plan = { ...m.plan, campaign: id };
  m.campaignPaidYear = s.year;
  refreshTreasury(s);
  gazzetta(s, 0, `Parte la campagna "${spec.label}": il club investe sul rapporto coi tifosi.`);
  return `Campagna "${spec.label}" lanciata.`;
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

/** Manto erboso + irrigazione (MODULE_STADIUM): stato per la card dello stadio. */
export function grassView(s: GameSession) {
  const length: GrassLength = s.grass?.year === s.year ? s.grass.length : 'media';
  return {
    length,
    // Si sceglie SOLO prima della 1ª giornata: dal fischio d'inizio è bloccato.
    locked: s.runner.nextRound() > 1,
    upkeep: GRASS.SHORT_UPKEEP,
    watering: s.watering ?? ('normale' as Watering),
    wetCost: WATER.WET_COST,
  };
}

/** Irrigazione (richiesta utente): abitudine del club, cambiabile a ogni giornata. */
export function chooseWatering(s: GameSession, level: Watering): string {
  s.watering = level;
  s.runner.setWatering(s.club.id, level);
  return level === 'normale'
    ? 'Irrigazione standard: campo neutro.'
    : level === 'bagnato'
      ? `Campo bagnato prima di ogni gara in casa (${(WATER.WET_COST / 1000).toFixed(0)}k di bolletta a partita): il pallone volerà raso terra.`
      : 'Idranti chiusi: campo asciutto, palla che frena — pantano per i palleggiatori.';
}

/** Sceglie l'altezza dell'erba di casa (solo prima della 1ª giornata). */
export function chooseGrass(s: GameSession, length: GrassLength): string {
  if (s.runner.nextRound() > 1)
    return 'Il campionato è iniziato: il manto si ritocca solo la prossima estate.';
  const paid = s.grass?.year === s.year && s.grass.paid === true;
  if (length === 'bassa' && !paid) {
    if (s.club.finances.cash + overdraftLimit(s.world, s.club, s.year) < GRASS.SHORT_UPKEEP)
      return 'La cassa non copre la manutenzione dei tagli continui.';
    s.club.finances.cash -= GRASS.SHORT_UPKEEP;
    s.club.finances.expenses.push({
      type: 'other',
      amount: GRASS.SHORT_UPKEEP,
      year: s.year,
      note: 'Manutenzione manto erboso (erba bassa)',
    });
    refreshTreasury(s);
  }
  s.grass = { year: s.year, length, paid: paid || length === 'bassa' };
  s.runner.setGrass(s.club.id, length);
  return length === 'media'
    ? 'Manto standard: campo neutro.'
    : length === 'bassa'
      ? `Erba rasata a ${(GRASS.SHORT_UPKEEP / 1000).toFixed(0)}k/stagione: il pallone correrà — festa per chi palleggia, su questo campo.`
      : 'Erba alta tutta la stagione: il palleggio degli ospiti (e il tuo) frenerà su questo campo.';
}

// ---- Calendario & agenda (richiesta utente): il tempo si vede e si salta ----

/** Giorno corrente della stagione (offset dal 10 agosto). Derivato per i save vecchi. */
export function currentDay(s: GameSession): number {
  if (s.day !== undefined) return s.day;
  const next = s.runner.nextRound();
  return next <= 1 ? 0 : roundDay(s.year, next - 1);
}

/** Fin dove ci si può teletrasportare: mai oltre la prossima partita o una call fissata. */
function jumpLimit(s: GameSession): number {
  const today = currentDay(s);
  const limits: number[] = [];
  if (!s.runner.isFinished()) limits.push(roundDay(s.year, s.runner.nextRound()));
  for (const c of s.calls ?? []) if (c.day > today) limits.push(c.day);
  return limits.length > 0 ? Math.min(...limits) : roundDay(s.year, s.runner.totalRounds()) + 7;
}

/** Teletrasporto a un giorno futuro: si ferma agli impegni obbligatori. */
export function goToDay(s: GameSession, target: number): string {
  const today = currentDay(s);
  if (target <= today) return 'Il tempo scorre solo in avanti.';
  const limit = jumpLimit(s);
  const landed = Math.min(target, limit);
  s.day = landed;
  if (landed < target) {
    const isMatch = !s.runner.isFinished() && landed === roundDay(s.year, s.runner.nextRound());
    return `Sei arrivato a ${fmtDayLong(s.year, landed)}: ${isMatch ? "c'è la partita, prima si gioca" : 'hai un appuntamento in agenda'}.`;
  }
  return `Eccoti a ${fmtDayLong(s.year, landed)}.`;
}

export interface AgendaItem {
  day: number;
  date: string;
  icon: string;
  text: string;
  kind: string;
  /** Solo per gli appuntamenti: consente l'annullamento dall'agenda. */
  callId?: string;
}

/** L'agenda di lavoro: TUTTI gli impegni e le scadenze, ordinati per giorno. */
export function agendaView(s: GameSession) {
  const today = currentDay(s);
  const total = s.runner.totalRounds();
  const items: AgendaItem[] = [];
  const push = (day: number, icon: string, text: string, kind = 'info') => {
    if (day >= today) items.push({ day, date: fmtDay(s.year, day), icon, text, kind });
  };
  // Partite di campionato (avversario e casa/trasferta).
  if (!s.runner.isFinished()) {
    for (let r = s.runner.nextRound(); r <= total; r++) {
      const m = s.season.fixtures.find(
        (x) => x.round === r && (x.homeClubId === s.club.id || x.awayClubId === s.club.id),
      );
      const home = m?.homeClubId === s.club.id;
      const opp = m
        ? s.world.clubs.get(m.homeClubId === s.club.id ? m.awayClubId : m.homeClubId)
        : undefined;
      push(
        roundDay(s.year, r),
        'sports_soccer',
        `Giornata ${r}${opp ? ` — ${home ? 'in casa vs' : 'in trasferta a'} ${opp.name}` : ''}`,
        r === s.runner.nextRound() ? 'match-next' : 'match',
      );
    }
  }
  // Coppe: il prossimo turno di ogni coppa in cui il club è ancora in corsa.
  for (const cup of s.cups ?? []) {
    const stage = cup.stages[cup.next];
    if (!stage || stage.played || !cup.alive.includes(s.club.id)) continue;
    push(
      midweekDay(s.year, stage.afterRound),
      'trophy',
      `${cup.name} — ${stage.name} (infrasettimanale)`,
      'cup',
    );
  }
  // Finestre di mercato: apertura e deadline day.
  let prev: ReturnType<typeof marketWindowOpen> = null;
  for (let r = 1; r <= total; r++) {
    const w = marketWindowOpen(r, total);
    if (w && w !== prev) push(roundDay(s.year, r), 'swap_horiz', `Apre il mercato ${w}`, 'market');
    if (w && marketWindowOpen(r + 1, total) !== w)
      push(roundDay(s.year, r), 'alarm', `DEADLINE DAY del mercato ${w}`, 'deadline');
    prev = w;
  }
  // Offerte AI e proposte concerti in scadenza.
  for (const o of s.offers ?? [])
    push(
      roundDay(s.year, Math.min(o.expiresRound, total)),
      'payments',
      `Scade l'offerta del ${o.fromClubName} per ${o.playerName}`,
      'offer',
    );
  for (const c of s.concertOffers ?? [])
    push(
      roundDay(s.year, Math.min(c.expiresRound, total)),
      'mic',
      `Ultimo giorno per rispondere al promoter (${c.artist})`,
      'concert',
    );
  // Call fissate (presidenti e procuratori); quelle arretrate si mostrano OGGI.
  for (const c of s.calls ?? []) {
    const day = Math.max(c.day, today);
    items.push({
      day,
      date: fmtDay(s.year, day),
      icon: c.inPerson ? 'flight' : 'call',
      text:
        c.kind === 'presidente'
          ? c.inPerson
            ? `In sede dal presidente del ${c.withName} per ${c.playerName} (si vola)`
            : `Call col presidente del ${c.withName} per ${c.playerName}`
          : `Call con l'entourage di ${c.playerName} (rinnovo)`,
      kind: 'call',
      callId: c.id,
    });
  }
  // Trattative in riflessione: la risposta del presidente è un impegno d'agenda.
  for (const t of s.negotiations ?? []) {
    if (t.stage !== 'pending') continue;
    const day = Math.max(t.resumeDay ?? today, today);
    items.push({
      day,
      date: fmtDay(s.year, day),
      icon: 'hourglass_top',
      text: `Risposta del presidente del ${t.sellerName} su ${t.playerName}`,
      kind: 'call',
    });
  }
  // Rapporti del DS in arrivo.
  for (const r of s.dsReminders ?? [])
    push(
      roundDay(s.year, Math.min(r.dueRound, total)),
      'description',
      `Rapporto del DS su ${r.nation}`,
      'ds',
    );
  // Estate e fine stagione.
  if (s.runner.nextRound() <= 1)
    push(
      today,
      'beach_access',
      'Estate: ritiro, tour e manto erboso si bloccano alla 1ª giornata',
      'summer',
    );
  push(
    roundDay(s.year, total),
    'sports_score',
    'Ultima giornata: poi si chiude la stagione',
    'end',
  );
  items.sort((a, b) => a.day - b.day || a.text.localeCompare(b.text));
  return {
    today,
    todayLabel: fmtDayLong(s.year, today),
    todayShort: fmtDay(s.year, today),
    jumpLimit: jumpLimit(s),
    items,
  };
}

/** Stato-call per un giocatore del mercato (per i bottoni della riga). */
export function callInfo(s: GameSession, playerId: string) {
  const c = (s.calls ?? []).find((x) => x.playerId === playerId && x.kind === 'presidente');
  if (!c) return null;
  const today = currentDay(s);
  return {
    day: c.day,
    date: fmtDay(s.year, c.day),
    due: c.day <= today,
    inPerson: c.inPerson === true,
    withName: c.withName,
  };
}

/** Fissa la call col presidente del club del giocatore (disponibilità NON immediata). */
export function requestCall(s: GameSession, playerId: string): string {
  const today = currentDay(s);
  const existing = (s.calls ?? []).find((c) => c.playerId === playerId && c.kind === 'presidente');
  if (existing) {
    return existing.day <= today
      ? existing.inPerson
        ? `Il presidente del ${existing.withName} ti aspetta in sede OGGI: si vola (✈).`
        : `La call col ${existing.withName} è per oggi: apri il tavolo.`
      : `Appuntamento già fissato: ${fmtDay(s.year, existing.day)} (📅 in agenda).`;
  }
  const player = s.world.players.get(playerId as PlayerId);
  const seller = player
    ? [...s.world.clubs.values()].find((c) => c.playerIds.includes(player.id))
    : undefined;
  if (!player || !seller) return 'Giocatore introvabile.';
  if (seller.id === s.club.id) return 'È un tuo giocatore: per il rinnovo si passa dalla Sede.';
  const pres = [...(s.world.presidents?.values() ?? [])].find((p) => p.clubId === seller.id);
  // Agenda del presidente: 1-5 giorni (hash deterministico), +2 se è un club blasonato;
  // al deadline day tutti trovano un buco domani.
  let wait = 1 + (hashStr(`${playerId}|call|${s.year}|${today}`) % 5);
  if (seller.reputation >= 75) wait += 2;
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  if (!s.runner.isFinished() && marketWindowOpen(round, total) && isDeadlineDay(round, total))
    wait = 1;
  // Il vecchio stampo (fumantino o conservatore) non fa call: "vieni tu da me".
  const inPerson =
    pres !== undefined &&
    (pres.personality.temperament >= 0.6 || pres.personality.ambition <= 0.35);
  const day = today + wait;
  s.calls = [
    ...(s.calls ?? []),
    {
      id: `call-${playerId}-${s.year}-${day}`,
      kind: 'presidente',
      playerId,
      playerName: player.name,
      withName: seller.name,
      day,
      inPerson,
    },
  ];
  return inPerson
    ? `Il presidente del ${seller.name} è vecchio stampo: "gli affari si fanno guardandosi negli occhi". Ti aspetta in sede ${fmtDay(s.year, day)} — prepara il jet (✈).`
    : `Call fissata col presidente del ${seller.name}: ${fmtDay(s.year, day)}. La trovi in agenda (📅).`;
}

/** Annulla un appuntamento dall'agenda. */
export function cancelCall(s: GameSession, id: string): string {
  const c = (s.calls ?? []).find((x) => x.id === id);
  if (!c) return 'Appuntamento non trovato.';
  s.calls = (s.calls ?? []).filter((x) => x.id !== id);
  return `Appuntamento con ${c.withName} annullato.`;
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
  /** G2: la valutazione VISIBILE (mai il numero). */
  stars: string;
  band: string;
  club: string;
  clubId: string;
  league: string;
  nation: string;
  ask: number;
  status: 'incedibile' | 'cedibile' | 'vetrina';
  contractEnd: number | null;
  listed: boolean;
}

/** G3: la forma del giocatore (media pagelle per TUTTI + ruolo, coeff. campionato). */
function formFor(s: GameSession, p: Player, owner?: Club): number {
  const club = owner ?? [...s.world.clubs.values()].find((c) => c.playerIds.includes(p.id));
  const tier = club ? leagueOfClub(s.world, club.id).tier : 1;
  return performanceFactor(s.runner.playerStats().get(p.id), p.position, tier);
}

function playerRow(s: GameSession, p: Player, seller: Club): MarketPlayerRow {
  const lg = leagueOfClub(s.world, seller.id);
  const pres = [...(s.world.presidents?.values() ?? [])].find((x) => x.clubId === seller.id);
  const status = playerMarketStatus(s.world, seller, p, s.year);
  const ask =
    Math.round(
      (askingPrice(s.world, seller, pres, p, s.year) *
        NEGOTIATION.STATUS_ASK[status] *
        formFor(s, p, seller)) /
        100_000,
    ) * 100_000;
  const contract = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
  return {
    id: p.id as string,
    name: p.name,
    pos: p.position,
    age: p.age,
    nat: p.nationality,
    overall: Math.round(playerOverall(p)),
    stars: starString(playerOverall(p)),
    band: bandOf(playerOverall(p), p.age),
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
    stars: starString(t.overall),
    club: t.clubName,
    clubId: t.clubId as string,
    ask: t.ask,
    status: t.status,
    why: t.why,
  }));
}

/** I tavoli aperti (hub trattative): migra il campo legacy a tavolo singolo. */
function allTables(s: GameSession): NegotiationState[] {
  if (!s.negotiations) {
    s.negotiations = s.negotiation ? [s.negotiation] : [];
    s.negotiation = null;
  }
  return s.negotiations;
}

/** Più trattative in parallelo, ma non un bazar: il DS regge al massimo 3 tavoli vivi. */
const MAX_TABLES = 3;

/** Apre il tavolo (§8.3). In persona = trasferta: costo vero, max 1 per giornata. */
export function startNegotiation(
  s: GameSession,
  playerId: string,
  inPerson: boolean,
): string | null {
  const tables = allTables(s);
  const existing = tables.find((t) => (t.playerId as string) === playerId);
  const alive = (st: NegotiationState) =>
    st.stage === 'fee' || st.stage === 'wage' || st.stage === 'pending';
  if (existing && alive(existing)) return null; // riapri
  if (existing) s.negotiations = tables.filter((t) => t !== existing); // archivia l'esito vecchio
  const openCount = allTables(s).filter(alive).length;
  if (openCount >= MAX_TABLES)
    return `Hai già ${MAX_TABLES} tavoli vivi: chiudine uno prima (hub Tavoli).`;
  const player = s.world.players.get(playerId as PlayerId);
  const seller = player
    ? [...s.world.clubs.values()].find((c) => c.playerIds.includes(player.id))
    : undefined;
  if (!player || !seller) return 'Giocatore introvabile.';
  if (seller.id === s.club.id) return 'È già un tuo giocatore.';
  // Calendario: il tavolo si apre SOLO all'appuntamento. Primo click = si fissa la call.
  const call = (s.calls ?? []).find((c) => c.playerId === playerId && c.kind === 'presidente');
  if (!call) return requestCall(s, playerId);
  if (call.day > currentDay(s))
    return `L'appuntamento col presidente è ${fmtDay(s.year, call.day)}: salta lì dal calendario (📅).`;
  if (call.inPerson && !inPerson)
    return 'Questo presidente è vecchio stampo: ti aspetta in sede. Si va col jet (✈ Vola).';
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
    {
      inPerson,
      deadline: window ? isDeadlineDay(round, total) : false,
      formFactor: formFor(s, player, seller),
    },
    createRng((s.seed ^ hashStr(playerId)) + round * 7919),
  );
  if (!res.ok) return res.reason;
  allTables(s).push(res.state);
  // L'appuntamento è stato onorato: via dall'agenda.
  s.calls = (s.calls ?? []).filter((c) => c !== call);
  // Sederti al tavolo per lui = studiarlo (MODULE_SCOUTING §7).
  if (!s.observations) s.observations = {};
  s.observations[playerId] = (s.observations[playerId] ?? 0) + 1;
  return null;
}

/** Vista della trattativa per la UI (il floor del venditore resta segreto). */
export function negotiationView(s: GameSession, playerId?: string) {
  const tables = allTables(s);
  const st = playerId
    ? tables.find((t) => (t.playerId as string) === playerId)
    : tables[tables.length - 1];
  if (!st) return null;
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  return {
    playerId: st.playerId as string,
    /** Indice del primo messaggio del procuratore: da lì parte la SECONDA chat. */
    agentFrom: st.log.findIndex((e) => e.who === 'agente'),
    player: st.playerName,
    seller: st.sellerName,
    stage: st.stage,
    status: st.status,
    mood: st.mood,
    inPerson: st.inPerson,
    ask: st.ask,
    round: st.round,
    roundsLeft: Math.max(0, (st.patience ?? NEGOTIATION.MAX_ROUNDS) - st.round),
    /** v2: la stima del TUO DS della zona d'accordo. */
    dsLo: st.dsLo ?? null,
    dsHi: st.dsHi ?? null,
    /** v2: il presidente sta riflettendo (risposta al giorno fissato). */
    pending:
      st.stage === 'pending'
        ? {
            day: st.resumeDay ?? 0,
            date: fmtDay(s.year, st.resumeDay ?? 0),
            due: currentDay(s) >= (st.resumeDay ?? 0),
          }
        : null,
    /** v2: il concorrente sul giocatore (batti il bid o lo perdi davvero). */
    rival: st.rivalBid !== undefined ? { name: st.rivalName ?? '—', bid: st.rivalBid } : null,
    /** v3: la struttura dell'affare sul tavolo. */
    structure: {
      swap:
        st.swapPlayerId !== undefined
          ? {
              id: st.swapPlayerId as string,
              name: st.swapPlayerName ?? '',
              value: st.swapValue ?? 0,
            }
          : null,
      buyback:
        st.buybackFee !== undefined
          ? { fee: st.buybackFee, asked: st.buybackAskedBySeller === true }
          : null,
      loanBack: st.loanBack === true,
      installments: st.installments ?? 1,
      /** Contanti da mettere sul tavolo per pareggiare (ask − contropartita). */
      cashAsk: Math.max(0, st.ask - (st.swapValue ?? 0)),
    },
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
export function negotiationFee(s: GameSession, playerId: string, amount: number): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st) return;
  offerFee(
    s.world,
    st,
    s.club,
    Math.max(0, Math.round(amount)),
    s.year,
    createRng((s.seed ^ hashStr(st.playerId as string)) + st.round * 131 + 7),
  );
  // "Ci penso" (v2): il guscio fissa il giorno della risposta in agenda.
  if (st.stage === 'pending' && st.resumeDay === undefined)
    st.resumeDay = currentDay(s) + (st.thinkDays ?? 2);
}

// ---- v3: la STRUTTURA dell'affare al tavolo (scambi, recompra, prestito, rate) ----

/** I tuoi giocatori proponibili come contropartita (col valore che il tavolo riconosce). */
export function swapCandidates(s: GameSession) {
  return s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined)
    .map((p) => ({
      id: p.id as string,
      name: p.name,
      pos: p.position,
      overall: Math.round(playerOverall(p)),
      stars: starString(playerOverall(p)),
      value:
        Math.round(
          (baseMarketValue(
            playerOverall(p),
            p.age,
            p.potential,
            contractYearsLeft(s.world, p, s.year),
          ) *
            NEGOTIATION.SWAP_VALUE *
            formFor(s, p, s.club)) /
            100_000,
        ) * 100_000,
    }))
    .sort((a, b) => b.overall - a.overall);
}

export function tableSwap(s: GameSession, playerId: string, myPlayerId: string | null): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st) return;
  const mine = myPlayerId ? s.world.players.get(myPlayerId as PlayerId) : undefined;
  proposeSwap(
    s.world,
    st,
    s.club,
    myPlayerId as PlayerId | null,
    s.year,
    mine ? formFor(s, mine, s.club) : 1,
  );
}

export function tableBuyback(s: GameSession, playerId: string): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (st) offerBuyback(st);
}

export function tableLoanBack(s: GameSession, playerId: string): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (st) offerLoanBack(st);
}

export function tableInstallments(s: GameSession, playerId: string, n: number): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (st) setInstallments(s.world, st, n);
}

/** La risposta del presidente dopo la riflessione (v2): matura al giorno fissato. */
export function hearAnswer(s: GameSession, playerId: string): string {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st || st.stage !== 'pending') return '';
  if (currentDay(s) < (st.resumeDay ?? 0))
    return `Il presidente risponde ${fmtDay(s.year, st.resumeDay ?? 0)}: salta lì dal calendario (📅).`;
  resolveThink(
    s.world,
    st,
    s.club,
    s.year,
    createRng((s.seed ^ hashStr(playerId)) + st.round * 977 + 13),
  );
  return 'Il presidente è tornato al tavolo: leggi la sua risposta.';
}

/** Un'offerta d'ingaggio settimanale. */
export function negotiationWage(s: GameSession, playerId: string, weekly: number): void {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st) return;
  offerWage(
    s.world,
    st,
    Math.max(0, Math.round(weekly)),
    createRng((s.seed ^ hashStr(st.playerId as string)) + st.wageRound * 271 + 13),
  );
}

/** Chiude il tavolo: firma (finestra aperta), pre-accordo (chiusa) o archivia il fallito. */
export function closeNegotiation(s: GameSession, playerId: string): string {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  if (!st) return '';
  s.negotiations = allTables(s).filter((t) => t !== st);
  if (st.stage !== 'done') return 'Il tavolo si chiude senza accordo.';
  const deal = dealFromState(st);
  if (!deal) return 'Il tavolo si chiude senza accordo.';
  // v3: prestito-ritorno — l'affare è chiuso ma il ragazzo resta lì un anno.
  if (deal.loanBack) {
    deal.arrivalYear = s.year + 1;
    s.preDeals = [...(s.preDeals ?? []), deal];
    gazzetta(
      s,
      s.runner.isFinished() ? 0 : s.runner.nextRound(),
      `COLPO IN PROSPETTIVA: ${deal.playerName} è del ${s.club.name} (${(deal.fee / 1e6).toFixed(1)}M) ma resterà in prestito al ${deal.sellerName} per la stagione.`,
    );
    return `${deal.playerName} è tuo, ma resta in prestito al ${deal.sellerName}: arriverà la prossima estate (pagherai alla consegna).`;
  }
  const round = s.runner.nextRound();
  const total = s.runner.totalRounds();
  const window = !s.runner.isFinished() && marketWindowOpen(round, total) !== null;
  if (!window) {
    s.preDeals = [...(s.preDeals ?? []), deal];
    return `Pre-accordo depositato: ${deal.playerName} arriverà all'apertura della finestra (${(deal.fee / 1e6).toFixed(1)}M + ingaggio ${((deal.wage * 52) / 1e6).toFixed(1)}M l'anno).`;
  }
  const out = executeDeal(s.world, s.club, deal, s.year);
  if (!out.ok) return `L'affare sfuma alla firma: ${out.reason}.`;
  // v3: le rate rimanenti finiscono a scadenzario (addebito a ogni chiusura di stagione).
  if (out.schedule) {
    s.installmentsDue = [
      ...(s.installmentsDue ?? []),
      ...out.schedule.map((x) => ({
        ...x,
        playerName: deal.playerName,
        sellerName: deal.sellerName,
      })),
    ];
  }
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

/** Ci si alza dal tavolo senza firmare (il tavolo sparisce dall'hub). */
export function abandonNegotiation(s: GameSession, playerId: string): string {
  const st = allTables(s).find((t) => (t.playerId as string) === playerId);
  s.negotiations = allTables(s).filter((t) => (t.playerId as string) !== playerId);
  // v2: se c'era un concorrente sul giocatore, abbandonare = perderlo DAVVERO.
  if (st && st.rivalBid !== undefined && (st.stage === 'fee' || st.stage === 'pending')) {
    const headline = loseToRival(s.world, st, s.year);
    if (headline) {
      gazzetta(s, s.runner.isFinished() ? 0 : s.runner.nextRound(), headline);
      return headline;
    }
  }
  return '';
}

/** L'HUB delle trattative (richiesta utente): tutti i tavoli, il rinnovo, gli accordi. */
export function negotiationHub(s: GameSession) {
  const tables = allTables(s).map((t) => ({
    playerId: t.playerId as string,
    player: t.playerName,
    seller: t.sellerName,
    stage: t.stage,
    mood: t.mood,
    inPerson: t.inPerson,
    agreedFee: t.agreedFee ?? null,
  }));
  return {
    tables,
    open: tables.filter((t) => t.stage === 'fee' || t.stage === 'wage' || t.stage === 'pending')
      .length,
    renewal: s.renewal
      ? { player: s.renewal.playerName, agent: s.renewal.agentName, stage: s.renewal.stage }
      : null,
    preDeals: (s.preDeals ?? []).map((d) => ({
      player: d.playerName,
      from: d.sellerName,
      fee: d.fee,
    })),
    offers: (s.offers ?? []).length,
  };
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
        stars: starString(playerOverall(p)),
        /** Ruolo fine (lavagna): apre la riga della tabella contratti. */
        role: playableRoles(p).primary,
        wage: c?.wage ?? 0,
        /** Netto ~52% del lordo (cuneo fiscale da calciatore, approssimazione display). */
        wageNet: Math.round((c?.wage ?? 0) * 0.52),
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
  // Calendario: l'entourage non è sempre libero subito — primo click fissa la call.
  const today = currentDay(s);
  const agentCall = (s.calls ?? []).find(
    (c) => c.playerId === playerId && c.kind === 'procuratore',
  );
  if (!agentCall) {
    const wait = hashStr(`${playerId}|agente|${s.year}|${today}`) % 4; // 0..3: i procuratori vivono al telefono
    if (wait > 0) {
      s.calls = [
        ...(s.calls ?? []),
        {
          id: `call-rin-${playerId}-${s.year}-${today + wait}`,
          kind: 'procuratore',
          playerId,
          playerName: player.name,
          withName: "l'entourage",
          day: today + wait,
        },
      ];
      return `L'entourage di ${player.name} ti richiama ${fmtDay(s.year, today + wait)}: appuntamento in agenda (📅).`;
    }
  } else if (agentCall.day > today) {
    return `La call con l'entourage di ${player.name} è ${fmtDay(s.year, agentCall.day)}: salta lì dal calendario (📅).`;
  } else {
    s.calls = (s.calls ?? []).filter((c) => c !== agentCall);
  }
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
      `RINNOVO: ${player.name} firma fino al ${c?.endYear} (${(((after.agreedWage ?? 0) * 52) / 1e6).toFixed(1)}M l'anno).`,
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

/** Una voce della dashboard Finanze (importo su base ANNUA; la UI divide per 52). */
export interface FinanceRow {
  label: string;
  amount: number;
  /** attesa = proiezione strutturale della stagione; consuntivo = già a ledger quest'anno. */
  kind: 'attesa' | 'consuntivo';
  /** Non muove cassa (ammortamenti): fuori dal saldo, pesa solo sul cap. */
  nonCash?: boolean;
}

/**
 * La dashboard decisionale delle Finanze (richiesta utente): TUTTE le entrate e le
 * uscite su base annua (vista settimanale = /52 nel componente), saldo di gestione e
 * verdetto "puoi investire?". Le voci strutturali sono ATTESE (stessa fonte del
 * motore economico, clubSeasonLines); quelle episodiche (coppe, mercato, eventi)
 * sono il CONSUNTIVO dell'anno a ledger.
 */
export function financeDashboard(s: GameSession) {
  const { world, club, year } = s;
  const league = leagueOfClub(world, club.id);
  const nationCode = nationOfClub(world, club.id)?.code ?? 'DEFAULT';
  const lines = clubSeasonLines(
    world,
    club,
    expectedPositionByReputation(world, club),
    league.clubIds.length,
    nationCode,
    league.tier,
  );
  const ledger = (list: 'incomes' | 'expenses', type: string) =>
    club.finances[list]
      .filter((e) => e.year === year && e.type === type)
      .reduce((a, e) => a + e.amount, 0);

  const attesa = (label: string, amount: number): FinanceRow => ({
    label,
    amount: Math.round(amount),
    kind: 'attesa',
  });
  const consuntivo = (label: string, amount: number): FinanceRow => ({
    label,
    amount: Math.round(amount),
    kind: 'consuntivo',
  });

  const sponsorAnnual =
    club.sponsors !== undefined
      ? club.sponsors.reduce((a, c) => a + c.annualValue, 0)
      : lines.sponsorBase;

  // Con l'ufficio marketing il botteghino atteso si SPACCA: abbonamenti (incasso
  // unico d'agosto) + paganti a gara (MODULE_STADIUM §3.4).
  const mkt = club.marketing !== undefined;
  const expPos = expectedPositionByReputation(world, club);
  const n = league.clubIds.length;
  const posFrac = n > 1 ? (n - expPos) / (n - 1) : 0.5;
  const incomes: FinanceRow[] = [];
  if (mkt && club.marketing) {
    const m = club.marketing;
    const level = m.abbPricePaid ?? m.plan.abbPrice ?? 'standard';
    const abbIncome =
      (m.abbonati ?? subscriberDemand(world, club, m, year).abbonati) *
      seasonTicketPrice(world, club, level);
    const abbLedger = ledger('incomes', 'abbonamenti');
    incomes.push(
      attesa(
        'Botteghino (paganti)',
        Math.max(0, marketingSeasonGate(world, club, posFrac, year) - abbIncome),
      ),
      abbLedger > 0 ? consuntivo('Abbonamenti', abbLedger) : attesa('Abbonamenti', abbIncome),
    );
  } else {
    incomes.push(attesa('Botteghino', lines.gate));
  }
  incomes.push(
    attesa('Diritti TV', lines.tvEqual + lines.tvMerit),
    attesa('Sponsor (contratti attivi)', sponsorAnnual),
    attesa('Premi campionato', lines.prize),
  );
  if (lines.solidarity > 0) incomes.push(attesa('Mutualità', lines.solidarity));
  if (lines.commercial > 0) incomes.push(attesa('Attività commerciali', lines.commercial));
  const optIn: [string, number][] = [
    ['Coppe nazionali', ledger('incomes', 'coppa')],
    ['Merchandising e mercati esteri', ledger('incomes', 'merch')],
    ['Eventi (tour e concerti)', ledger('incomes', 'eventi')],
    ['Plusvalenze', ledger('incomes', 'plusvalenza')],
    ['Cessioni (recupero a bilancio)', ledger('incomes', 'transfer_out')],
  ];
  for (const [label, v] of optIn) if (v > 0) incomes.push(consuntivo(label, v));

  const bill = clubWageBill(world, club) * 52;
  const amortization = squadAmortization(world, club);
  const matchday =
    (mkt
      ? marketingMatchGate(world, club, 'campionato', posFrac).attendance
      : stadiumCapacity(club) * lines.fill) *
    FISCAL.MATCHDAY_COST_PER_FAN *
    FINANCES.HOME_GAMES;
  const interest =
    club.finances.cash < 0
      ? -club.finances.cash * FISCAL.INTEREST_RATE
      : ledger('expenses', 'interessi');

  const expenses: FinanceRow[] = [
    attesa('Stipendi calciatori', bill),
    attesa('Gestione impianti', lines.facilities),
    attesa('Staff tecnico', lines.staff),
    attesa('Costi del matchday', matchday),
  ];
  if (amortization > 0)
    expenses.push({
      label: 'Ammortamenti cartellini',
      amount: Math.round(amortization),
      kind: 'attesa',
      nonCash: true,
    });
  const optOut: [string, number][] = [
    ['Interessi sul fido', interest],
    ['Ritiro estivo', ledger('expenses', 'ritiro')],
    ['Eventi (pubblicità, tour in perdita)', ledger('expenses', 'eventi')],
    ['Cartellini acquistati', ledger('expenses', 'transfer_in')],
    ['Commissioni agenti', ledger('expenses', 'agency_fees')],
    ['Cantieri stadio', ledger('expenses', 'stadio')],
  ];
  for (const [label, v] of optOut) if (v > 0) expenses.push(consuntivo(label, v));

  const totalIn = incomes.reduce((a, r) => a + r.amount, 0);
  const totalOut = expenses.filter((r) => !r.nonCash).reduce((a, r) => a + r.amount, 0);
  const saldo = totalIn - totalOut;

  // Il verdetto: si può investire? Margine di gestione + banca + spazio ingaggi.
  const sus = sustainability(world, club, year);
  const room = spendingRoom(world, club, year);
  const wageHeadroom = Math.max(0, (sus.capWeekly - clubWageBill(world, club)) * 52);
  const reasons: string[] = [];
  if (saldo < 0) reasons.push('la gestione brucia cassa: le uscite superano le entrate attese');
  if (sus.status === 'blocco')
    reasons.push('squad-cost oltre il cap: niente aumenti né nuovi ingaggi');
  if (sus.status === 'allerta') reasons.push('squad-cost in allerta: margine ingaggi sottile');
  if (club.finances.cash < 0) reasons.push('cassa in rosso: gli interessi corrono');
  if (reasons.length === 0) reasons.push('conti in ordine: margine positivo e spazio sotto il cap');
  const level: 'verde' | 'giallo' | 'rosso' =
    sus.status === 'blocco' || (saldo < 0 && club.finances.cash < 0)
      ? 'rosso'
      : sus.status === 'allerta' || saldo < 0
        ? 'giallo'
        : 'verde';

  return {
    incomes,
    expenses,
    totalIn,
    totalOut,
    saldo,
    verdict: { level, reasons, room, wageHeadroom, ratio: sus.ratio, status: sus.status },
  };
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
// Estate ed eventi (MODULE_EVENTS): ritiro, tour mondiale, concerti.
// ---------------------------------------------------------------------------

/** Le scelte estive si bloccano quando la stagione parte. */
export function summerLocked(s: GameSession): boolean {
  return s.runner.nextRound() > 1;
}

export function chooseRitiro(s: GameSession, id: string): string {
  if (summerLocked(s)) return 'La stagione è partita: il ritiro si sceglie in estate.';
  if (s.summer?.ritiroId) return 'Il ritiro è già stato fatto.';
  const spot = ritiroById(id);
  if (!spot) return 'Meta sconosciuta.';
  if (s.club.finances.cash + overdraftLimit(s.world, s.club, s.year) < spot.cost)
    return 'La banca non copre nemmeno il ritiro: scegli una meta più umile.';
  payRitiro(s.club, spot, s.year);
  const fx = ritiroEffects(spot);
  s.runner.applyPreparation(s.club.id, fx);
  s.summer = { ...(s.summer ?? { year: s.year }), ritiroId: id };
  refreshTreasury(s);
  gazzetta(
    s,
    0,
    `RITIRO A ${spot.name.toUpperCase()}: strutture ${spot.quality}/100. La preparazione coprirà le prime ${fx.rounds} giornate.`,
  );
  return `Ritiro fissato a ${spot.name} (${(spot.cost / 1e6).toFixed(1)}M).`;
}

export function chooseTour(s: GameSession, id: string): string {
  if (summerLocked(s)) return 'La stagione è partita: il tour si organizza in estate.';
  if (s.summer?.tourId) return 'Il tour è già stato fatto.';
  const dest = tourById(id);
  if (!dest) return 'Destinazione sconosciuta.';
  const out = playTour(s.world, s.club, dest, s.year);
  if (out.legs.rounds > 0) {
    s.runner.applyPreparation(s.club.id, {
      boost: out.legs.boost,
      injuryMult: 1,
      rounds: out.legs.rounds,
    });
  }
  s.summer = { ...(s.summer ?? { year: s.year }), tourId: id, tourNation: dest.nation };
  refreshTreasury(s);
  gazzetta(s, 0, out.headline.toUpperCase());
  return out.headline;
}

export function summerView(s: GameSession) {
  const locked = summerLocked(s);
  return {
    locked,
    ritiroId: s.summer?.ritiroId ?? null,
    tourId: s.summer?.tourId ?? null,
    ritiri: RITIRO_SPOTS.map((r) => ({
      id: r.id,
      name: r.name,
      country: r.country,
      quality: r.quality,
      cost: r.cost,
      blurb: r.blurb,
    })),
    tours: TOUR_DESTINATIONS.map((d) => {
      const q = tourQuote(s.world, s.club, d);
      return {
        id: d.id,
        name: d.name,
        nation: d.nation,
        distance: d.distance,
        estimate: q.net,
        affinity: q.affinity > 1,
      };
    }).sort((a, b) => b.estimate - a.estimate),
  };
}

export function concertView(s: GameSession) {
  const capacity = stadiumCapacity(s.club);
  return {
    licensed: concertLicensed(s.club),
    offers: (s.concertOffers ?? []).map((o) => ({
      id: o.id,
      artist: o.artist,
      tier: o.tierLabel,
      cachet: o.cachet,
      round: o.round,
      homeClash: o.homeClash,
      // Anteprima del netto per livello di pubblicità (MODULE_EVENTS §3).
      options: ([0, 1, 2] as const).map((lvl) => {
        const fill = Math.min(
          1,
          SUMMER.FILL_BASE +
            SUMMER.FILL_REP * (s.club.reputation / 100) +
            o.draw +
            SUMMER.AD_FILL[lvl]!,
        );
        return {
          level: lvl,
          fill,
          net: Math.round(
            o.cachet + capacity * fill * SUMMER.TICKET - capacity * SUMMER.AD_COST_PER_SEAT[lvl]!,
          ),
        };
      }),
    })),
  };
}

export function acceptConcert(s: GameSession, offerId: string, adLevel: 0 | 1 | 2): string {
  const offer = (s.concertOffers ?? []).find((o) => o.id === offerId);
  if (!offer) return 'La data è sfumata.';
  const out = settleConcert(s.club, offer, adLevel, s.year);
  if (out.wear) s.runner.applyPitchWear(s.club.id, offer.round);
  s.concertOffers = (s.concertOffers ?? []).filter((o) => o.id !== offerId);
  refreshTreasury(s);
  const round = s.runner.isFinished() ? s.runner.totalRounds() : s.runner.nextRound();
  gazzetta(s, round, out.headline.toUpperCase());
  return out.headline;
}

export function declineConcert(s: GameSession, offerId: string): string {
  s.concertOffers = (s.concertOffers ?? []).filter((o) => o.id !== offerId);
  return 'Il promoter porta il circo altrove.';
}

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

export function describeSponsorClause(c: SponsorContract['clause']): string | null {
  if (!c) return null;
  if (c.kind === 'nazionalita')
    return `clausola merch: +${Math.round(c.bonusPct * 100)}% con un ${c.nation} in rosa`;
  if (c.kind === 'tour')
    return `clausola tour: +${Math.round(c.bonusPct * 100)}% se il tour estivo va in ${c.nation}`;
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

/**
 * L'IMPERO sul planisfero (richiesta utente, stile gioco di guerra): i mercati
 * esteri come territori occupati (con rango, guarnigione in rosa, rivali), gli
 * obiettivi sponsor come bersagli, e i totali del dominio.
 */
export function empireView(s: GameSession) {
  const markets = foreignMarketsView(s).map((m) => ({
    ...m,
    /** Quanti tuoi giocatori della nazione (la "guarnigione"). */
    garrison: s.club.playerIds.filter((pid) => s.world.players.get(pid)?.nationality === m.nation)
      .length,
    rank:
      m.fans >= 1_000_000
        ? ('impero' as const)
        : m.fans >= 100_000
          ? ('roccaforte' as const)
          : m.fans >= FANBASE.REVENUE_FROM
            ? ('colonia' as const)
            : ('avamposto' as const),
  }));
  const targets = (s.club.sponsors ?? [])
    .filter((c) => c.clause?.kind === 'mercato' || c.clause?.kind === 'tour')
    .map((c) => ({
      nation: (c.clause as { nation: string }).nation,
      kind: c.clause?.kind as 'mercato' | 'tour',
      brand: c.brandName,
      bonusPct: (c.clause as { bonusPct: number }).bonusPct,
    }));
  const totalFans = markets.reduce((a, m) => a + m.fans, 0);
  const merch = markets
    .filter((m) => m.fans >= FANBASE.REVENUE_FROM)
    .reduce(
      (a, m) =>
        a +
        m.fans *
          FANBASE.REVENUE_PER_FAN *
          (1 + FANBASE.SHOP_MERCH * (s.club.foreignFans?.[m.nation]?.shops ?? 0)),
      0,
    );
  const tv = markets
    .filter((m) => m.streak >= FANBASE.TV_STREAK_FROM)
    .reduce(
      (a, m) =>
        a +
        FANBASE.TV_PER_STREAK *
          Math.min(m.streak, FANBASE.TV_STREAK_CAP) *
          (0.4 + (s.club.reputation / 100) ** 2),
      0,
    );
  return {
    markets: markets.map((m) => ({
      ...m,
      // Impero v2: chi ti contende il territorio (nomi, per la mappa).
      rivalTop: rivalPresence(s.world, s.club, m.nation).map((r) => ({
        name: r.name,
        count: r.count,
        weight: r.weight,
      })),
      shops: s.club.foreignFans?.[m.nation]?.shops ?? 0,
      fanClubs: s.club.foreignFans?.[m.nation]?.fanClubs ?? 0,
      history: s.empireHistory?.[m.nation]?.map((h) => h.fans) ?? [],
    })),
    targets,
    totalFans,
    merch: Math.round(merch),
    tv: Math.round(tv),
    totalHistory: (() => {
      // Andamento dei tifosi totali per anno (unione delle history per nazione).
      const byYear = new Map<number, number>();
      for (const rows of Object.values(s.empireHistory ?? {})) {
        for (const r of rows) byYear.set(r.year, (byYear.get(r.year) ?? 0) + r.fans);
      }
      return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([, fans]) => fans);
    })(),
    missions: (s.missions ?? []).map((m) => ({
      text: m.text,
      hint: m.hint,
      deadline: m.deadlineYear,
    })),
  };
}

/**
 * L'influenza mondiale (Ufficio Commerciale, richiesta utente): per ogni nazione il
 * club DOMINANTE nel marketing (giocatori della nazione × stelle × fama) — con i dati
 * per calcolarne il colore sociale in UI.
 */
export function influenceView(s: GameSession) {
  return Object.keys(NATION_COORDS).map((nation) => {
    const dom = dominantClubIn(s.world, nation);
    const domClub = dom ? s.world.clubs.get(dom.clubId) : undefined;
    return {
      nation,
      dominant:
        dom && domClub
          ? {
              clubId: dom.clubId as string,
              name: dom.name,
              weight: dom.weight,
              mine: dom.clubId === s.club.id,
              reputation: domClub.reputation,
              league: leagueOfClub(s.world, domClub.id).name,
              nationCode: nationOfClub(s.world, domClub.id)?.code ?? 'ITA',
            }
          : null,
      myFans: s.club.foreignFans?.[nation]?.fans ?? 0,
      myWeight: presenceByNation(s.world, s.club, [nation])[0]?.weight ?? 0,
    };
  });
}

/** I club osservabili nello spione dell'Ufficio Commerciale. */
export function selectorClubs(s: GameSession) {
  return [...s.world.clubs.values()]
    .filter((c) => c.id !== s.club.id)
    .sort((a, b) => b.reputation - a.reputation)
    .map((c) => ({
      id: c.id as string,
      name: c.name,
      reputation: c.reputation,
      league: leagueOfClub(s.world, c.id).name,
      nation: nationOfClub(s.world, c.id)?.code ?? 'ITA',
    }));
}

/** Le zone dove un club scelto "si accende": presenza marketing per nazione. */
export function clubZones(s: GameSession, clubId: string) {
  const club = [...s.world.clubs.values()].find((c) => (c.id as string) === clubId);
  if (!club) return [];
  return presenceByNation(s.world, club, Object.keys(NATION_COORDS));
}

/** I brand sponsor di una nazione, col loro stato verso di te (barra azioni). */
export function nationBrands(s: GameSession, nation: string) {
  const contracted = new Set((s.club.sponsors ?? []).map((c) => c.brandId));
  const offering = new Set(
    Object.values(s.sponsorOffers ?? {})
      .flat()
      .map((o) => o.brandId),
  );
  return SPONSOR_BRANDS.filter((b) => b.nation === nation)
    .map((b) => ({
      name: b.name,
      sector: b.sector,
      tier: b.tier,
      status: contracted.has(b.id)
        ? ('firmato' as const)
        : offering.has(b.id)
          ? ('in offerta' as const)
          : ('possibile partner' as const),
    }))
    .sort((a, b) => (a.status === 'firmato' ? -1 : b.status === 'firmato' ? 1 : 0));
}

/** Confronto storico tu-vs-dominante su una nazione (solo dallo stemma del dominante). */
export function influenceCompare(s: GameSession, nation: string) {
  const mineNow = presenceByNation(s.world, s.club, [nation])[0]?.weight ?? 0;
  const dom = dominantClubIn(s.world, nation);
  return {
    mineNow,
    topNow: dom ? { name: dom.name, weight: dom.weight, mine: dom.clubId === s.club.id } : null,
    myFans: s.club.foreignFans?.[nation]?.fans ?? 0,
    history: s.influenceHistory?.[nation] ?? [],
  };
}

/** Pin cosmetici per gli asset nati in automatico (jitter deterministico). */
function syncTerritoryPins(s: GameSession): void {
  const pins = { ...(s.territoryPins ?? {}) };
  for (const [nation, m] of Object.entries(s.club.foreignFans ?? {})) {
    const at = NATION_COORDS[nation];
    if (!at) continue;
    const list = [...(pins[nation] ?? [])];
    const need = (kind: 'shop' | 'fanclub', count: number) => {
      let have = list.filter((p) => p.kind === kind).length;
      while (have < count) {
        have += 1;
        const j = (k: string) =>
          ((hashStr(`${nation}|${kind}|${have}|${k}`) % 100) / 100 - 0.5) * 5;
        list.push({ kind, lat: at[0] + j('lat'), lon: at[1] + j('lon') });
      }
    };
    need('shop', m.shops ?? 0);
    need('fanclub', m.fanClubs ?? 0);
    pins[nation] = list;
  }
  s.territoryPins = pins;
}

/** Costruisce un negozio del club nel territorio, nel punto scelto sulla mappa. */
/** 📋 Promemoria al DS (barra azioni del planisfero): rapporto-nazione in 2 giornate. */
export function leaveDsReminder(s: GameSession, nation: string): string {
  const pending = s.dsReminders ?? [];
  if (pending.some((r) => r.nation === nation))
    return `Il DS sta già lavorando su ${nation}: il rapporto arriva in Gazzetta.`;
  if (pending.length >= 3) return 'Il DS ha già 3 note sul tavolo: aspetta i suoi rapporti.';
  const due = Math.min(s.runner.nextRound() + 1, s.runner.totalRounds());
  s.dsReminders = [...pending, { nation, dueRound: due }];
  return `📋 Nota lasciata al DS: il rapporto sui migliori profili ${nation} arriva in Gazzetta entro un paio di giornate.`;
}

/** Il DS sta già lavorando su questa nazione? (per disattivare il bottone). */
export function dsReminderPending(s: GameSession, nation: string): boolean {
  return (s.dsReminders ?? []).some((r) => r.nation === nation);
}

export function buildTerritoryShop(
  s: GameSession,
  nation: string,
  lat: number,
  lon: number,
): string {
  if (s.club.finances.cash + overdraftLimit(s.world, s.club, s.year) < FANBASE.SHOP_COST)
    return 'La banca non finanzia negozi oltreoceano: prima la cassa.';
  const err = buildShop(s.world, s.club, nation, s.year);
  if (err) return err;
  const pins = { ...(s.territoryPins ?? {}) };
  pins[nation] = [...(pins[nation] ?? []), { kind: 'shop', lat, lon }];
  s.territoryPins = pins;
  refreshTreasury(s);
  gazzetta(
    s,
    0,
    `Il club apre un NEGOZIO ufficiale in ${nation}: il merchandising locale accelera.`,
  );
  return `Negozio aperto in ${nation} (${(FANBASE.SHOP_COST / 1e6).toFixed(1)}M).`;
}

/** Fonda una sede fan club nel territorio, nel punto scelto sulla mappa. */
export function foundTerritoryFanClub(
  s: GameSession,
  nation: string,
  lat: number,
  lon: number,
): string {
  if (s.club.finances.cash + overdraftLimit(s.world, s.club, s.year) < FANBASE.FANCLUB_COST)
    return 'Nemmeno i tifosi lontani meritano una sede a debito: prima la cassa.';
  const err = foundFanClub(s.world, s.club, nation, s.year);
  if (err) return err;
  const pins = { ...(s.territoryPins ?? {}) };
  pins[nation] = [...(pins[nation] ?? []), { kind: 'fanclub', lat, lon }];
  s.territoryPins = pins;
  refreshTreasury(s);
  gazzetta(s, 0, `Nasce la sede del fan club in ${nation}: la piazza lontana ha una casa.`);
  return `Sede fan club fondata in ${nation} (${(FANBASE.FANCLUB_COST / 1e6).toFixed(1)}M).`;
}

/** Il dettaglio di un territorio (zoom nella nazione): asset, rivali, storia. */
export function territoryView(s: GameSession, nation: string) {
  const m = s.club.foreignFans?.[nation];
  if (!m) return null;
  const room = spendingRoom(s.world, s.club, s.year);
  return {
    nation,
    fans: m.fans,
    streak: m.streak,
    shops: m.shops ?? 0,
    fanClubs: m.fanClubs ?? 0,
    maxShops: maxShopsFor(m.fans),
    shopCost: FANBASE.SHOP_COST,
    fanClubCost: FANBASE.FANCLUB_COST,
    canShop: (m.shops ?? 0) < maxShopsFor(m.fans) && room >= FANBASE.SHOP_COST,
    canFanClub:
      m.fans >= FANBASE.FANCLUB_MIN_FANS &&
      (m.fanClubs ?? 0) < FANBASE.FANCLUB_MAX &&
      room >= FANBASE.FANCLUB_COST,
    rivals: rivalPresence(s.world, s.club, nation).map((r) => ({ name: r.name, count: r.count })),
    history: s.empireHistory?.[nation]?.map((h) => ({ year: h.year, fans: h.fans })) ?? [],
    pins: s.territoryPins?.[nation] ?? [],
  };
}

/**
 * Andamento e PREVISIONE dei conti (richiesta utente): storia per stagione + proiezione
 * "a bocce ferme" a 3/5 anni — voci strutturali attese, monte ingaggi corrente, e il
 * piano di ammortamento REALE dei contratti (che si esaurisce da solo).
 */
/**
 * FINANZE — la vista di CONTROLLO TOTALE (richiesta utente): monte ingaggi
 * scomposto, impegni futuri (rate, ammortamenti, scadenze), il mercato dell'anno
 * e la giornata-tipo allo stadio. Tutto derivato, zero stato nuovo.
 */
export function financeDetail(s: GameSession) {
  const year = s.year;
  const inc = s.club.finances.incomes.filter((e) => e.year === year);
  const exp = s.club.finances.expenses.filter((e) => e.year === year);
  const sumI = (type: string) =>
    inc.filter((e) => e.type === type).reduce((a, e) => a + e.amount, 0);
  const sumE = (type: string) =>
    exp.filter((e) => e.type === type).reduce((a, e) => a + e.amount, 0);

  // ---- Monte ingaggi scomposto ----
  const squad = s.club.playerIds
    .map((id) => s.world.players.get(id))
    .filter((p): p is Player => p !== undefined);
  const wageOf = (p: Player) => (p.contractId ? s.world.contracts.get(p.contractId)?.wage : 0) ?? 0;
  const billWeekly = squad.reduce((a, p) => a + wageOf(p), 0);
  const topWages = [...squad]
    .sort((a, b) => wageOf(b) - wageOf(a))
    .slice(0, 6)
    .map((p) => ({
      name: p.name,
      role: playableRoles(p).primary,
      gross: wageOf(p) * 52,
      net: Math.round(wageOf(p) * 0.52) * 52,
      pct: billWeekly > 0 ? wageOf(p) / billWeekly : 0,
    }));
  const byPos = (['GK', 'DF', 'MF', 'FW'] as const).map((pos) => ({
    pos,
    gross: squad.filter((p) => p.position === pos).reduce((a, p) => a + wageOf(p), 0) * 52,
  }));

  // ---- Impegni futuri ----
  const rate = new Map<number, number>();
  for (const r of s.installmentsDue ?? []) rate.set(r.year, (rate.get(r.year) ?? 0) + r.amount);
  const futures = [0, 1, 2].map((k) => ({
    year: year + k,
    ammortamenti: amortizationInYear(s.world, s.club, year + k),
    rate: rate.get(year + k) ?? 0,
  }));
  const expiring = squad.filter((p) => {
    const c = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
    return c !== undefined && c.endYear <= year;
  });
  const expiringWages = expiring.reduce((a, p) => a + wageOf(p), 0) * 52;

  // ---- Il mercato dell'anno (ledger vero) ----
  const market = {
    cessioni: sumI('transfer_out') + sumI('plusvalenza'),
    plusvalenze: sumI('plusvalenza'),
    acquisti: sumE('transfer_in'),
    commissioni: sumE('agency_fees'),
  };

  // ---- La giornata-tipo allo stadio ----
  const gateEntries = inc.filter((e) => e.type === 'gate');
  const gamesPlayed = Math.max(1, gateEntries.length);
  const cap = stadiumCapacity(s.club);
  const matchday = {
    incassoTotale: sumI('gate'),
    incassoMedio: sumI('gate') / gamesPlayed,
    gare: gateEntries.length,
    costiMatchday: sumE('matchday'),
    commerciale: sumI('commerciale'),
    abbonamenti: sumI('abbonamenti'),
    capienza: cap,
  };

  return {
    wages: {
      billAnnual: billWeekly * 52,
      capAnnual: s.club.finances.wageBudget * 52,
      top: topWages,
      byPos,
    },
    futures,
    expiring: { count: expiring.length, wagesFreed: expiringWages },
    market,
    matchday,
  };
}

export function financeTrends(s: GameSession) {
  const d = financeDashboard(s);
  const structuralIn = d.incomes
    .filter((r) => r.kind === 'attesa')
    .reduce((a, r) => a + r.amount, 0);
  const structuralOut = d.expenses
    .filter((r) => r.kind === 'attesa' && !r.nonCash)
    .reduce((a, r) => a + r.amount, 0);
  const forecast = [1, 2, 3, 4, 5].map((k) => {
    const year = s.year + k;
    const am = amortizationInYear(s.world, s.club, year);
    return {
      year,
      revenue: structuralIn,
      costs: structuralOut + am,
      net: structuralIn - structuralOut - am,
      amortization: am,
    };
  });
  return { history: s.financeHistory ?? [], forecast, dashboard: d };
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
