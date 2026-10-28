/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { playerOverall } from '../../../src/core/ratings';
import { SECTOR_IDS, stadiumCapacity } from '../../../src/core/stadium';
import { type Club, nationOfClub } from '../../../src/core/types';
import type {
  CampaignId,
  CommercialId,
  MarketingFeature,
  MatchClass,
  PromoKind,
  SectorId,
  TicketPlan,
} from '../../../src/core/types';
import type { PriceLevel } from '../../../src/core/types';
import {
  type NamingProposal,
  PRICE_LEVELS,
  fanNamingProposal,
  renameSector,
  sectorName,
  setStadiumActivityPrice,
  setStructurePrice,
  setTicketPrice,
} from '../../../src/engine/stadium';
import {
  CAMPAIGNS,
  MKT,
  MKT_FEATURES,
  boardOffers,
  boardSlots,
  defaultTicketPrice,
  hasFeature,
  isDerby,
  livePosition,
  marketingMatchGate,
  matchClassOf,
  namingOffers,
  officePower,
  recentForm,
  seasonTicketPrice,
  signBoardDeal,
  signNamingDeal,
  subscriberDemand,
  testimonialBoost,
  ticketBasePrice,
} from '../../../src/finances/marketing';
import { spendingRoom } from '../../../src/finances/treasury';
import { createRng } from '../../../src/rng/rng';
import { bandOf } from '../band';
import { NATION_COORDS } from '../geo';
import { gazzetta, refreshTreasury } from './shared';

import type { Player } from '../../../src/core/types';
import type { GameSession } from '../game';

// ---- Ufficio marketing (MODULE_STADIUM §3.4): listino, abbonamenti, campagne ----

export function ensureMarketing(s: GameSession) {
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
