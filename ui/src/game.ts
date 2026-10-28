/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import type { RenewalState } from '../../src/contracts/renewal-negotiation';
import { playerOverall } from '../../src/core/ratings';
import { stadiumCapacity } from '../../src/core/stadium';
import {
  type Club,
  type Season,
  type StandingRow,
  type World,
  leagueOfClub,
  nationOfClub,
} from '../../src/core/types';
import type { SponsorSlot } from '../../src/core/types';
import { type OffseasonSummary, closeSeason, offseasonSummary } from '../../src/engine/career';
import {
  type NationalCup,
  createNationalCups,
  cupStagesDue,
  playCupStage,
} from '../../src/engine/cup';
import {
  type ConcertOffer,
  type Mission,
  SUMMER,
  type SummerPlan,
  checkMissions,
  concertOfferAt,
  generateMissions,
} from '../../src/engine/events';
import { bestAssignment } from '../../src/engine/lineup';
import { moraleLabel } from '../../src/engine/morale';
import type { TeamPlan } from '../../src/engine/plan';
import {
  type CareerSeasonLine,
  type PlayerSeasonStats,
  careerLineOf,
  mergeSeasonStats,
} from '../../src/engine/player-stats';
import {
  type RoundResult as EngineRoundResult,
  type GrassLength,
  type LiveMatchSession,
  type SeasonRunner,
  WATER,
  type Watering,
  createRunner,
  createSeason,
  seasonStandings,
} from '../../src/engine/season';
import type { NamingProposal } from '../../src/engine/stadium';
import { resolveSeasonTickets, settleMarketingYear } from '../../src/finances/marketing';
import {
  type SponsorOffer,
  dominantClubIn,
  initialSponsors,
  presenceByNation,
  sponsorOffersFor,
} from '../../src/finances/sponsors';
import { generateWorld } from '../../src/generation/generate-world';
import { applyRosterPack } from '../../src/generation/roster-pack';
import {
  type DealNews,
  type IncomingOffer,
  marketWindowOpen,
  returnOffer,
  solicitOffers,
} from '../../src/market/ai';
import {
  type AgreedDeal,
  NEGOTIATION,
  type NegotiationState,
  dsNationReport,
  executeDeal,
  resolveThink,
} from '../../src/market/negotiation';
import { executeTransfer } from '../../src/market/transfers';
import { expectedWage, offeredYears } from '../../src/market/value';
import type { MarketPromise, RejectedOfferMemory, RenewalNote } from '../../src/persistence/codec';
import { createRng } from '../../src/rng/rng';
import {
  allTables,
  applyPlanToRunner,
  currentDay,
  gazzetta,
  hashStr,
  refreshTreasury,
} from './game/shared';
export { currentDay, refreshTreasury } from './game/shared';
import type { ClubId, PlayerId } from '../../src/core/ids';
import type { Position } from '../../src/core/types';
import { type AcademyState, settleAcademyYear } from '../../src/engine/academy';
import { injuryLabel } from '../../src/engine/injury';
import { starString } from './band';
import { roundDay } from './calendar';
import { syncTerritoryPins } from './game/commercial';
import { checkPromises, fulfilPromises } from './game/renewals';
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
  /**
   * G4 — IL MONDO CHE GIOCA (richiesta utente): le ALTRE divisioni avanzano
   * giornata per giornata insieme alla tua, coi loro runner veri (mercato AI,
   * infortuni, morale, Elo). Le statistiche di TUTTO il mondo si leggono con
   * worldPlayerStats(). Nei save: stagioni + snapshot (SessionExtras.otherLeagues).
   */
  others?: { season: Season; runner: SeasonRunner }[];
  /** G4 — storico di carriera per giocatore: una riga per stagione chiusa. */
  careerStats?: Record<string, CareerSeasonLine[]>;
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
  // G4 — IL MONDO CHE GIOCA: le altre divisioni chiudono il loro calendario
  // (se hanno più giornate della tua, le recuperano qui) e closeSeason le LEGGE
  // invece di risimularle.
  const preSeasons = new Map<Season['leagueId'], Season>();
  for (const o of s.others ?? []) {
    while (!o.runner.isFinished()) o.runner.playRound();
    preSeasons.set(o.season.leagueId, o.season);
  }
  // G4 — STORICO: la stagione di ogni giocatore del mondo diventa una riga di
  // carriera, PRIMA che l'offseason muova il mondo (ritiri, trasferimenti).
  const clubOfPid = new Map<string, Club>();
  for (const c of s.world.clubs.values())
    for (const pid of c.playerIds) clubOfPid.set(pid as string, c);
  const careers = { ...(s.careerStats ?? {}) };
  for (const [pid, st] of worldPlayerStats(s)) {
    if (st.apps === 0) continue;
    const c = clubOfPid.get(pid as string);
    if (!c) continue;
    const line = careerLineOf(st, s.year, c.id as string, leagueOfClub(s.world, c.id).tier);
    careers[pid as string] = [...(careers[pid as string] ?? []), line].slice(-15);
  }
  s.careerStats = careers;
  const closed = closeSeason(s.world, s.season, s.seed, s.year, {
    userClubId: s.club.id,
    // MODULE_EVENTS §2: il tour dell'estate scorsa spinge fanbase e clausola sponsor.
    touredNation: s.summer?.year === s.year ? s.summer.tourNation : undefined,
    preSeasons,
  });
  // Lo storico resta solo per chi è ancora nel mondo (i ritirati escono dal save).
  for (const pid of Object.keys(careers))
    if (!s.world.players.has(pid as PlayerId)) delete careers[pid];
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
  // G4: anche le altre divisioni ripartono (promozioni/retrocessioni già applicate).
  createOtherLeagues(s);
  // REVISIONE: potatura del save e piano senza riferimenti pendenti.
  pruneSession(s);
  sanitizeLineupAndPlan(s);
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

/**
 * G4 — IL MONDO CHE GIOCA: crea stagione e runner di ogni ALTRA divisione, con gli
 * STESSI seed storici di closeSeason (seed + anno + (i+1)·1000) — il mondo che prima
 * veniva simulato in blocco a giugno ora gioca giornata per giornata. Il club utente
 * è protetto dal loro mercato AI.
 */
export function createOtherLeagues(s: GameSession): void {
  const userLeagueId = leagueOfClub(s.world, s.club.id).id;
  const others: NonNullable<GameSession['others']> = [];
  s.world.leagues.forEach((lg, i) => {
    if (lg.id === userLeagueId) return;
    const seedL = s.seed + s.year + (i + 1) * 1000;
    const season = createSeason(s.world, lg, s.year, seedL);
    others.push({
      season,
      runner: createRunner(s.world, season, createRng(seedL), { protectedClubId: s.club.id }),
    });
  });
  s.others = others;
}

/**
 * G4: le statistiche stagionali di TUTTO il mondo — la fusione degli store di ogni
 * lega (un trasferito a gennaio è la somma delle sue due mezze stagioni). Memoizzata
 * per giornata: gli store cambiano solo quando un runner chiude un turno.
 */
const worldStatsMemo = new WeakMap<
  GameSession,
  { key: string; map: Map<PlayerId, PlayerSeasonStats> }
>();
export function worldPlayerStats(s: GameSession): Map<PlayerId, PlayerSeasonStats> {
  const key = `${s.year}|${s.runner.nextRound()}|${(s.others ?? [])
    .map((o) => o.runner.nextRound())
    .join(',')}`;
  const hit = worldStatsMemo.get(s);
  if (hit && hit.key === key) return hit.map;
  const out = new Map<PlayerId, PlayerSeasonStats>();
  mergeSeasonStats(out, s.runner.playerStats());
  for (const o of s.others ?? []) mergeSeasonStats(out, o.runner.playerStats());
  worldStatsMemo.set(s, { key, map: out });
  return out;
}

/**
 * G4: la riga-stagione PUBBLICA di un giocatore qualsiasi del mondo (quella che
 * leggeresti sul giornale: presenze, gol, media). Null = mai sceso in campo.
 */
export function playerSeasonLine(s: GameSession, playerId: string) {
  const st = worldPlayerStats(s).get(playerId as PlayerId);
  if (!st || st.apps === 0) return null;
  return {
    apps: st.apps,
    minutes: st.minutes,
    goals: st.goals,
    assists: st.assists,
    media: st.ratingSum / st.apps,
  };
}

/** G4: lo storico di carriera di un giocatore (righe per stagione, più recente in cima). */
export function playerCareer(s: GameSession, playerId: string) {
  const lines = s.careerStats?.[playerId] ?? [];
  return [...lines].reverse().map((l) => ({
    ...l,
    clubName: s.world.clubs.get(l.clubId as ClubId)?.name ?? '—',
  }));
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
  const s: GameSession = {
    world,
    club,
    season,
    runner,
    year,
    seed,
    // REVISIONE: stesso schema di seed delle stagioni successive (seed + anno).
    cups: createNationalCups(world, year, seed + year),
    summer: { year },
    missions: generateMissions(world, club, year, []),
  };
  // G4 — IL MONDO CHE GIOCA: le altre divisioni partono insieme alla tua.
  createOtherLeagues(s);
  return s;
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
 * REVISIONE — dopo una cessione (o a chiusura stagione) formazione sticky e piano
 * partita non devono più puntare a chi non è in rosa: la lavagna mostrava in XI
 * il giocatore venduto, e battitore/rigorista/capitano restavano su ceduti.
 */
export function sanitizeLineupAndPlan(s: GameSession): void {
  const roster = new Set(s.club.playerIds.map((id) => id as string));
  const lu = s.runner.lineup(s.club.id);
  if (lu?.some((a) => !roster.has(a.playerId as string))) {
    s.runner.setLineup(s.club.id, bestAssignment(s.club, s.world));
  }
  const sp = s.plan?.setPiece;
  if (sp) {
    if (sp.takerId && !roster.has(sp.takerId)) sp.takerId = undefined;
    if (sp.penaltyTakerId && !roster.has(sp.penaltyTakerId)) sp.penaltyTakerId = undefined;
    if (sp.captainId && !roster.has(sp.captainId)) sp.captainId = undefined;
    if (sp.special) sp.special = sp.special.filter((m) => roster.has(m.markerId));
    applyPlanToRunner(s);
  }
}

/**
 * REVISIONE — potatura a chiusura stagione: liste che crescevano per sempre nel
 * save (osservazioni, note-rinnovo, promesse chiuse, lavagna, agenda) e id di
 * giocatori ritirati/ceduti che restavano vivi (shortlist, hot-list).
 */
function pruneSession(s: GameSession): void {
  const exists = (pid: string) => s.world.players.has(pid as PlayerId);
  const mine = new Set(s.club.playerIds.map((id) => id as string));
  s.shortlist = (s.shortlist ?? []).filter((pid) => exists(pid) && !mine.has(pid));
  if (s.observations) {
    for (const pid of Object.keys(s.observations)) {
      if (!exists(pid)) delete s.observations[pid];
    }
  }
  if (s.renewalNotes) {
    for (const [pid, n] of Object.entries(s.renewalNotes)) {
      const keep = n.leaving || n.betrayed || n.wantsOut;
      if (!exists(pid) || !mine.has(pid) || !keep) delete s.renewalNotes[pid];
    }
  }
  const open = (s.promises ?? []).filter((p) => p.status === 'aperta' && exists(p.playerId));
  const settled = (s.promises ?? []).filter((p) => p.status !== 'aperta').slice(-10);
  s.promises = [...open, ...settled];
  if (s.board) {
    for (const phase of ['possesso', 'difesa'] as const) {
      for (const pid of Object.keys(s.board[phase])) {
        if (!mine.has(pid)) delete s.board[phase][pid];
      }
    }
  }
  s.calls = (s.calls ?? []).filter((c) => exists(c.playerId));
}

/**
 * La coda della giornata (mercato, coppe, eventi, gazzetta, calendario): CONDIVISA
 * tra il quick-result e la DIRETTA — la giornata finisce sempre dallo stesso posto.
 */
export function afterRound(s: GameSession, res: EngineRoundResult): RoundResult {
  // G4 — IL MONDO CHE GIOCA: le altre divisioni disputano la LORO giornata
  // (ordine fisso di lega: tutto deterministico dal seed).
  for (const o of s.others ?? []) if (!o.runner.isFinished()) o.runner.playRound();
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
  // La gazzetta ricorda la shortlist all'apertura della finestra — il taccuino
  // si POTA prima di contarlo (dentro restavano ritirati, ceduti e già tuoi).
  if (window && !marketWindowOpen(res.round - 1, total)) {
    s.shortlist = (s.shortlist ?? []).filter(
      (pid) => s.world.players.has(pid as PlayerId) && !s.club.playerIds.includes(pid as PlayerId),
    );
  }
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
      .filter(([id, n]) => (n.leaving || n.wantsOut) && s.club.playerIds.includes(id as PlayerId))
      .map(([id]) => id as PlayerId);
    if (hot.length > 0) {
      const extra = solicitOffers(
        s.world,
        s.club,
        hot,
        res.round,
        total,
        createRng((s.seed ^ 0x9f37) + res.round * 613),
        s.year,
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
        s.year,
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

// ---- SPEZZATURA (revisione): i domini del guscio vivono in ui/src/game/* ----
export * from './game/live';
export * from './game/tactics';
export * from './game/stats';
export * from './game/market';
export * from './game/negotiation';
export * from './game/renewals';
export * from './game/hq';
export * from './game/marketing';
export * from './game/academy';
export * from './game/kits';
export * from './game/agenda';
export * from './game/finance';
export * from './game/events';
export * from './game/cups';
export * from './game/commercial';
export * from './game/sponsors';
