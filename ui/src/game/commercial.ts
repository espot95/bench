/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { leagueOfClub, nationOfClub } from '../../../src/core/types';
import { SPONSOR_BRANDS } from '../../../src/finances/sponsor-brands';
import {
  FANBASE,
  buildShop,
  dominantClubIn,
  foundFanClub,
  maxShopsFor,
  presenceByNation,
  rivalPresence,
} from '../../../src/finances/sponsors';
import { overdraftLimit, spendingRoom } from '../../../src/finances/treasury';
import { NATION_COORDS } from '../geo';
import { gazzetta, hashStr, refreshTreasury } from './shared';

import type { GameSession } from '../game';

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
export function syncTerritoryPins(s: GameSession): void {
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
