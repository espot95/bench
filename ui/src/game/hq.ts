/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { clubWageBill } from '../../../src/core/finance';
import { playerOverall } from '../../../src/core/ratings';
import { SECTOR_IDS, stadiumCapacity } from '../../../src/core/stadium';
import { type Club, type World, leagueOfClub } from '../../../src/core/types';
import type { CommercialId, SectorId } from '../../../src/core/types';
import type { PriceLevel } from '../../../src/core/types';
import { GRASS, type GrassLength, WATER, type Watering } from '../../../src/engine/season';
import {
  CITY_STRUCTURES,
  COMMERCIALS,
  type ProjectRequest,
  fanDensityAt,
  fanZones,
  locationFactor,
  priceMultiplier,
  quoteProject,
  sectorName,
  startProject,
  ticketFactors,
} from '../../../src/engine/stadium';
import { stadiumNamingName } from '../../../src/finances/marketing';
import { FINANCES } from '../../../src/finances/season-economy';
import { overdraftLimit } from '../../../src/finances/treasury';
import { generateWorld } from '../../../src/generation/generate-world';
import { createRng } from '../../../src/rng/rng';
import { groupLedger, hashStr, refreshTreasury } from './shared';

import type { GameSession } from '../game';

// ---- Sede del club: il centro di controllo della PRESIDENZA (MODULE_PRESIDENT) ----

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
import { fitLabel, squadFit, styleLabel } from '../../../src/engine/coach-styles';

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
  // REVISIONE: via il Math.random()*0 (trappola: innocuo oggi, una bomba a ogni
  // refactor). La variazione di qualità viene da hash deterministico.
  const n = (s.club.staff?.length ?? 0) + 1;
  const wiggle = hashStr(`${s.club.id}|prep|${n}|${s.year}`) % 9;
  const quality = Math.min(95, Math.round(55 + wiggle + s.club.reputation * 0.3));
  s.club.finances.cash -= PREP_COST;
  s.club.staff = [
    ...(s.club.staff ?? []),
    { name: `Preparatore ${n}`, role: 'preparatore', quality },
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
