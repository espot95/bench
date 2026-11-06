/**
 * SCHEDA GIOCATORE v2 (MODULE_UI §11): giudizi, non numeri. L'overall resta nel
 * motore; qui diventa GRADINO (scala a 9 livelli), gli attributi diventano
 * GIUDIZI con banda d'incertezza, il carattere EMERGE, lo staff PARLA.
 *
 * Tutta l'incertezza è percezione dell'utente: rumore DETERMINISTICO via hash su
 * (playerId|chiave), mai un draw del flusso di sim (stesse sigma concettuali di
 * src/scouting/report.ts). La scheda si apre per QUALSIASI giocatore del mondo.
 */

import { playerArchetype, playerMovements } from '../../../src/core/archetypes';
import { PERSONALITY_LABELS, personalityLabel } from '../../../src/core/personality';
import { runningStyle } from '../../../src/core/physique';
import { playerOverall, selectStartingXI } from '../../../src/core/ratings';
import { leagueOfClub } from '../../../src/core/types';
import type { Club, Player, Position } from '../../../src/core/types';
import { injuryLabel } from '../../../src/engine/injury';
import { moraleLabel } from '../../../src/engine/morale';
import { contractYearsLeft } from '../../../src/market/transfers';
import { baseMarketValue } from '../../../src/market/value';
import { type Gradino, type LadderNames, gradinoOf, ladderOf } from '../band';
import type { GameSession } from '../game';
import { playerCareer } from '../game';
import { formFor, hashStr } from './shared';
import { percentilesFor, playerHeatView, seasonStatsView } from './stats';

// ---------------------------------------------------------------------------
// Rumore deterministico
// ---------------------------------------------------------------------------

function h01(key: string): number {
  return (hashStr(key) % 100_000) / 100_000;
}

/** Rumore centrato in [-1, 1], a campana (somma di tre uniformi). */
function noise(key: string): number {
  return (h01(`${key}|a`) + h01(`${key}|b`) + h01(`${key}|c`)) / 1.5 - 1;
}

function clamp99(x: number): number {
  return Math.max(1, Math.min(99, x));
}

// ---------------------------------------------------------------------------
// Conoscenza: quanto DAVVERO sappiamo di lui (MODULE_UI §11)
// ---------------------------------------------------------------------------

export interface Conoscenza {
  /** 0 sconosciuta · 1 scarsa · 2 parziale · 3 buona · 4 piena (i tuoi). */
  level: 0 | 1 | 2 | 3 | 4;
  label: 'sconosciuta' | 'scarsa' | 'parziale' | 'buona' | 'piena';
  /** Riempimento della barra in scheda [0,1]. */
  pct: number;
  obs: number;
}

/** Sigma del rumore percettivo per livello di conoscenza (eco di SCOUTING.SIGMA_*). */
const SIGMA_BY_LEVEL = [9, 6, 4, 2, 0] as const;

export function conoscenzaOf(s: GameSession, p: Player): Conoscenza {
  if (s.club.playerIds.includes(p.id)) return { level: 4, label: 'piena', pct: 1, obs: 0 };
  const obs = s.observations?.[p.id as string] ?? 0;
  if (obs >= 10) return { level: 3, label: 'buona', pct: 0.8, obs };
  if (obs >= 5) return { level: 2, label: 'parziale', pct: 0.55, obs };
  if (obs >= 1) return { level: 1, label: 'scarsa', pct: 0.3, obs };
  return { level: 0, label: 'sconosciuta', pct: 0.12, obs };
}

// ---------------------------------------------------------------------------
// Profilo tecnico: i 6 attributi chiave del ruolo, come GIUDIZI
// ---------------------------------------------------------------------------

const PROFILE_KEYS: Record<Position, readonly (readonly [string, string])[]> = {
  GK: [
    ['reflexes', 'Riflessi'],
    ['handling', 'Presa'],
    ['oneOnOne', 'Uno contro uno'],
    ['positioning', 'Piazzamento'],
    ['aerial', 'Gioco aereo'],
    ['composure', 'Freddezza'],
  ],
  DF: [
    ['tackling', 'Contrasto'],
    ['marking', 'Marcatura'],
    ['positioning', 'Senso della posizione'],
    ['decisions', 'Letture difensive'],
    ['strength', 'Forza fisica'],
    ['pace', 'Velocità'],
  ],
  MF: [
    ['decisions', 'Visione di gioco'],
    ['passing', 'Passaggio'],
    ['tackling', 'Lettura difensiva'],
    ['stamina', 'Resistenza'],
    ['pace', 'Velocità'],
    ['dribbling', 'Dribbling'],
  ],
  FW: [
    ['finishing', 'Finalizzazione'],
    ['dribbling', 'Dribbling'],
    ['pace', 'Velocità'],
    ['composure', 'Freddezza'],
    ['positioning', 'Movimento in area'],
    ['decisions', 'Scelte'],
  ],
};

export type Giudizio = 'Eccellente' | 'Ottimo' | 'Buono' | 'Discreto' | 'Limitato';

/** Giudizio-voto (invariante, da pagella scolastica): mai il numero. */
function giudizioOf(v: number): Giudizio {
  if (v >= 85) return 'Eccellente';
  if (v >= 75) return 'Ottimo';
  if (v >= 65) return 'Buono';
  if (v >= 55) return 'Discreto';
  return 'Limitato';
}

export interface VoceProfilo {
  label: string;
  giudizio: Giudizio | 'Da verificare';
  /** Banda d'incertezza [0,100] per la barra (il margine dell'osservatore). */
  lo: number;
  hi: number;
}

function attrOf(p: Player, key: string): number {
  return (p.attributes as unknown as Record<string, number>)[key] ?? 50;
}

function profiloTecnico(p: Player, c: Conoscenza): VoceProfilo[] {
  const sigma = SIGMA_BY_LEVEL[c.level];
  const keys = PROFILE_KEYS[p.position];
  // Gli attributi "da verificare": mai osservati abbastanza (1 con conoscenza
  // scarsa/parziale, 2 da sconosciuto). Scelta deterministica via hash.
  const verifyCount = c.level === 0 ? 2 : c.level <= 2 ? 1 : 0;
  const firstVerify = hashStr(`${p.id}|verify`) % keys.length;
  const verifyIdx = new Set<number>();
  for (let i = 0; i < verifyCount; i++) verifyIdx.add((firstVerify + i * 3) % keys.length);
  const rows = keys.map(([key, label], i) => {
    const est = clamp99(attrOf(p, key) + noise(`${p.id}|${key}`) * sigma);
    const half = c.level === 4 ? 3 : Math.max(5, sigma * 1.4);
    const verify = verifyIdx.has(i);
    return {
      label,
      giudizio: verify ? ('Da verificare' as const) : giudizioOf(est),
      lo: Math.max(0, Math.round(est - (verify ? half * 2 : half))),
      hi: Math.min(100, Math.round(est + (verify ? half * 2 : half))),
      est,
    };
  });
  rows.sort((a, b) => b.est - a.est);
  return rows.map(({ est: _est, ...row }) => row);
}

// ---------------------------------------------------------------------------
// Carattere: etichetta (fallibile), sintesi, pro/contro, radar qualitativo
// ---------------------------------------------------------------------------

const SUMMARY_BY_LABEL: Record<string, string> = {
  'Professionista modello': "Professionista affidabile, guida con l'esempio",
  'Leader nato': 'Carattere da capitano: prende per mano la squadra',
  Trascinatore: 'Energia contagiosa: lo spogliatoio lo segue',
  'Silenzioso professionista': 'Parla poco, lavora tanto',
  Mercenario: 'Professionale, ma il cuore segue il contratto',
  'Talento sregolato': "Il talento c'è, la testa va gestita",
  Discontinuo: 'Quando gira è un altro giocatore — non gira sempre',
  'Anima della festa': 'Tiene vivo lo spogliatoio, a volte troppo',
  'Testa calda': 'Miccia corta: va protetto da se stesso',
  'Spirito libero': 'Imprevedibile, dentro e fuori dal campo',
  'Nella media': 'Carattere equilibrato, senza spigoli',
};

interface ProContro {
  text: string;
  score: number;
}

function prosOf(p: Player): ProContro[] {
  const t = p.personality;
  const out: ProContro[] = [];
  if (t.composure >= 0.66)
    out.push({ text: 'Non trema nelle serate che pesano', score: t.composure - 0.5 });
  if (t.professionalism >= 0.66)
    out.push({
      text: 'Si allena come gioca: esempio per i più giovani',
      score: t.professionalism - 0.5,
    });
  if (t.temperament <= 0.34)
    out.push({
      text: 'Morale stabile anche dopo le sconfitte, raramente ammonito',
      score: 0.5 - t.temperament,
    });
  if (t.loyalty >= 0.66)
    out.push({
      text: 'Legato ai colori: un rinnovo non sarà mai una guerra',
      score: t.loyalty - 0.5,
    });
  if (t.consistency >= 0.66)
    out.push({
      text: 'Rende sempre, con qualsiasi modulo e qualsiasi maglia',
      score: t.consistency - 0.5,
    });
  if (t.leadership >= 0.66)
    out.push({ text: 'Negli spogliatoi la sua voce pesa', score: t.leadership - 0.5 });
  return out;
}

function controsOf(p: Player): ProContro[] {
  const t = p.personality;
  const out: ProContro[] = [];
  if (t.ambition >= 0.66 && t.loyalty <= 0.5)
    out.push({
      text: "L'ambizione alta lo porterà a chiedere un club da coppe",
      score: t.ambition - 0.5 + (0.5 - t.loyalty),
    });
  if (t.temperament >= 0.66)
    out.push({ text: 'Rischia il cartellino nelle serate storte', score: t.temperament - 0.5 });
  if (t.consistency <= 0.34)
    out.push({ text: 'Alterna picchi e pomeriggi anonimi', score: 0.5 - t.consistency });
  if (t.professionalism <= 0.34)
    out.push({ text: "Va tenuto d'occhio fuori dal campo", score: 0.5 - t.professionalism });
  if (t.adaptability <= 0.34)
    out.push({
      text: 'Ambientamento lento: soffre i cambi di contesto',
      score: 0.5 - t.adaptability,
    });
  return out;
}

function best(list: ProContro[]): string | null {
  return list.length === 0 ? null : list.sort((a, b) => b.score - a.score)[0]!.text;
}

/** Tratto distintivo per la chip in testata (primo che scatta). */
function trattoDistintivo(p: Player): string | null {
  const a = (k: string) => attrOf(p, k);
  if (p.position === 'GK') {
    if (a('reflexes') >= 82) return 'Riflessi felini';
    if (a('oneOnOne') >= 80) return "Gigante nell'uno contro uno";
    if (a('handling') >= 80) return 'Mani di colla';
    return null;
  }
  if (a('finishing') >= 82) return "Killer d'area";
  if (a('passing') >= 80) return 'Piede educato';
  if (a('pace') >= 82) return 'Progressioni fulminanti';
  if (a('tackling') >= 80) return 'Recupera-palloni';
  if (a('composure') >= 80) return 'Ghiaccio nelle vene';
  if (a('stamina') >= 76 && a('workRate') >= 76) return 'Polmoni infiniti';
  if (p.preferredFoot === 'L') return 'Mancino naturale';
  if (p.preferredFoot === 'both') return 'Ambidestro';
  return null;
}

// ---------------------------------------------------------------------------
// Cosa dice lo staff: voci deterministiche ancorate a fatti veri
// ---------------------------------------------------------------------------

export interface VoceStaff {
  text: string;
  source: string;
  aff: 'alta' | 'media' | 'bassa';
}

const VICE_BY_KEY: Record<string, string> = {
  passing: '«È il nostro cervello: quando ha la palla lui, la squadra respira.»',
  decisions: '«Vede il gioco due secondi prima degli altri.»',
  finishing: '«Dategli mezza occasione e la butta dentro.»',
  tackling: '«Dalle sue parti non si passa: pulisce tutto.»',
  marking: "«Si porta a casa l'attaccante: non lo molla mai.»",
  reflexes: '«Certe domeniche ci tiene in piedi lui.»',
  oneOnOne: "«Nell'uno contro uno coi suoi tempi d'uscita vinciamo noi.»",
  handling: '«Due mani sicure: la difesa dorme tranquilla.»',
  dribbling: "«Nell'uno contro uno accende lo stadio.»",
  pace: '«In campo aperto non lo prende nessuno.»',
  positioning: '«Sa sempre dove stare: ordine puro.»',
  aerial: '«Sulle palle alte comanda lui.»',
  composure: '«Freddo: nelle partite sporche è il primo a non tremare.»',
  strength: '«Un armadio: a corpo a corpo non lo sposti.»',
  stamina: "«Corre per due: il primo a difendere, l'ultimo a mollare.»",
};

const OSS_BY_KEY: Record<string, string> = {
  passing: 'ottimo in impostazione',
  decisions: 'legge il gioco prima degli altri',
  finishing: 'cinico sotto porta',
  tackling: 'aggressivo nel recupero',
  marking: 'cancella il diretto avversario',
  reflexes: 'reattivo tra i pali',
  oneOnOne: 'padrone della sua area',
  handling: 'sicuro nella presa',
  dribbling: 'imprendibile nello stretto',
  pace: 'strappa in campo aperto',
  positioning: 'sempre nel posto giusto',
  aerial: 'domina nel gioco aereo',
  composure: 'freddo nelle scelte',
  strength: 'fisicamente dominante',
  stamina: 'non si ferma mai',
};

function topKey(p: Player): string {
  const keys = PROFILE_KEYS[p.position].map(([k]) => k);
  let bestK = keys[0]!;
  for (const k of keys) if (attrOf(p, k) > attrOf(p, bestK)) bestK = k;
  return bestK;
}

function staffVoices(s: GameSession, p: Player, c: Conoscenza, owner: Club | null): VoceStaff[] {
  const out: VoceStaff[] = [];
  const key = topKey(p);
  if (c.level === 4) {
    out.push({
      text: VICE_BY_KEY[key] ?? "«Non ruba l'occhio, ma l'allenatore sa perché gioca.»",
      source: 'Vice allenatore',
      aff: 'alta',
    });
    const stamina = attrOf(p, 'stamina');
    out.push({
      text:
        p.injuryProneness >= 0.6
          ? '«La cartella clinica consiglia prudenza: carichi su misura e niente straordinari.»'
          : stamina < 55
            ? '«Fisicamente non regge 90 minuti a ritmi alti. Va gestito.»'
            : stamina >= 75
              ? '«Un motore raro: potrebbe giocare ogni tre giorni.»'
              : '«Condizione nella norma: nessun allarme, nessun extra.»',
      source: 'Preparatore atletico',
      aff: 'alta',
    });
    if (p.age <= 23 && p.potential >= playerOverall(p) + 6) {
      out.push({
        text: "«Il margine c'è: tra due anni ne riparliamo a un'altra cifra.»",
        source: 'Capo scouting',
        aff: 'media',
      });
    }
    return out;
  }
  if (c.level === 0) {
    return [
      {
        text: '«Mai visto dal vivo: solo spezzoni e sentito dire. Serve mandarci qualcuno.»',
        source: 'Osservatore',
        aff: 'bassa',
      },
    ];
  }
  const frase = OSS_BY_KEY[key] ?? 'solido nel suo ruolo';
  out.push(
    c.level >= 3
      ? {
          text: `«Lo seguiamo da mesi: ${frase}. Per me è pronto per il salto.»`,
          source: 'Osservatore',
          aff: 'media',
        }
      : {
          text: `«Visto ${c.obs === 1 ? 'una volta' : `${c.obs} volte`}: ${frase}, ma non so dire quanto regga la pressione.»`,
          source: 'Osservatore',
          aff: c.level === 1 ? 'bassa' : 'media',
        },
  );
  if (c.level >= 2 && owner) {
    out.push({
      text:
        owner.reputation >= 70
          ? "«Occhio al contesto: in quella squadra brillano un po' tutti.»"
          : '«Gioca in un contesto che lo nasconde: dal vivo è più di quel che dicono i numeri.»',
      source: 'Capo scouting',
      aff: 'media',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mercato: forbice di valore, ingaggio, interesse CONTATO, procuratore
// ---------------------------------------------------------------------------

/** Semi-ampiezza della forbice di valore per livello di conoscenza. */
const VALUE_WIDTH = [0.55, 0.4, 0.25, 0.15, 0.08] as const;

function interestFor(s: GameSession, p: Player, est: number, owner: Club | null) {
  const byLeague = new Map<string, number>();
  for (const club of s.world.clubs.values()) {
    if (club.id === s.club.id || club.id === owner?.id) continue;
    if (Math.abs(club.reputation - est) > 20) continue;
    const xi = selectStartingXI(club, s.world).filter((x) => x.position === p.position);
    const weakest = xi.length > 0 ? Math.min(...xi.map((x) => playerOverall(x))) : 0;
    if (est > weakest + 1) {
      const name = leagueOfClub(s.world, club.id).name;
      byLeague.set(name, (byLeague.get(name) ?? 0) + 1);
    }
  }
  let bestLeague: string | null = null;
  let bestCount = 0;
  for (const [name, n] of byLeague) {
    if (n > bestCount) {
      bestLeague = name;
      bestCount = n;
    }
  }
  if (!bestLeague) return null;
  return { count: Math.min(5, bestCount), plus: bestCount > 5, league: bestLeague };
}

function procuratoreLine(p: Player): string {
  if (p.agencyId === null) return 'Si rappresenta da solo: tratta direttamente, senza commissioni.';
  const t = p.personality;
  if (t.ambition >= 0.66)
    return 'Il suo procuratore lo descrive come «pronto per il grande salto». Da prendere con cautela.';
  if (t.loyalty >= 0.66)
    return "«Sta bene dove sta», filtra l'entourage: servirà un'offerta seria per smuoverlo.";
  return "L'entourage ascolta tutti: nessuna preclusione, conta il progetto.";
}

// ---------------------------------------------------------------------------
// Numero di maglia: DERIVATO, mai memorizzato (pool per ruolo, anziani prima)
// ---------------------------------------------------------------------------

const SHIRT_POOLS: Record<Position, readonly number[]> = {
  GK: [1, 12, 22, 13, 31],
  DF: [3, 4, 5, 2, 6, 13, 15, 23, 24, 33],
  MF: [8, 6, 10, 4, 14, 16, 18, 21, 20, 23],
  FW: [9, 10, 7, 11, 17, 19, 27, 30, 21, 99],
};

export function shirtOf(s: GameSession, p: Player, owner: Club | null): number | null {
  if (!owner) return null;
  const squad = owner.playerIds
    .map((id) => s.world.players.get(id))
    .filter((x): x is Player => !!x)
    .sort((a, b) => b.age - a.age || (a.id as string).localeCompare(b.id as string));
  const taken = new Set<number>();
  for (const q of squad) {
    let n = SHIRT_POOLS[q.position].find((x) => !taken.has(x));
    if (n === undefined) {
      n = 2;
      while (taken.has(n)) n++;
    }
    taken.add(n);
    if (q.id === p.id) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// La vista completa
// ---------------------------------------------------------------------------

const POS_LABEL: Record<Position, string> = { GK: 'POR', DF: 'DIF', MF: 'CEN', FW: 'ATT' };

function ladderNames(s: GameSession): LadderNames {
  const userLeague = leagueOfClub(s.world, s.club.id);
  const nat = userLeague.nationId;
  const leagues = [...s.world.leagues.values()].filter(
    (l) => nat === undefined || l.nationId === nat,
  );
  return {
    t1: leagues.find((l) => l.tier === 1)?.name ?? 'prima divisione',
    t2: leagues.find((l) => l.tier === 2)?.name ?? 'seconda divisione',
  };
}

function findByName(s: GameSession, name: string): { p: Player; owner: Club | null } | null {
  // Prima i TUOI (i nomi possono ripetersi nel mondo: vince il tuo spogliatoio).
  for (const id of s.club.playerIds) {
    const p = s.world.players.get(id);
    if (p?.name === name) return { p, owner: s.club };
  }
  for (const club of s.world.clubs.values()) {
    for (const id of club.playerIds) {
      const p = s.world.players.get(id);
      if (p?.name === name) return { p, owner: club };
    }
  }
  for (const p of s.world.players.values()) if (p.name === name) return { p, owner: null };
  return null;
}

export function schedaView(s: GameSession, name: string) {
  const found = findByName(s, name);
  if (!found) return null;
  const { p, owner } = found;
  const mine = owner?.id === s.club.id;
  const c = conoscenzaOf(s, p);
  const sigma = SIGMA_BY_LEVEL[c.level];
  const names = ladderNames(s);

  // Il gradino (stima + forbice quando la conoscenza è bassa).
  const trueO = playerOverall(p);
  const est = clamp99(trueO + noise(`${p.id}|ovr`) * sigma);
  const gradino = gradinoOf(est, names);
  let forbice: { from: Gradino; to: Gradino } | null = null;
  if (sigma >= 4) {
    const hi = gradinoOf(clamp99(est + sigma), names);
    const lo = gradinoOf(clamp99(est - sigma), names);
    if (hi.idx !== lo.idx) forbice = { from: hi, to: lo };
  }
  const estPot = Math.max(est, clamp99(p.potential + noise(`${p.id}|pot`) * sigma * 1.4));
  const gradinoPot = gradinoOf(estPot, names);

  // Carattere: etichetta vera per i tuoi, ipotesi (fallibile) per gli altri.
  const pRight = Math.min(0.9, 0.35 + 0.08 * c.obs);
  const shownLabel =
    c.level === 4 || h01(`${p.id}|plab`) < pRight
      ? personalityLabel(p)
      : PERSONALITY_LABELS[hashStr(`${p.id}|plab2`) % PERSONALITY_LABELS.length]!;
  const seasons = p.clubSeasons ?? 0;
  const emerged = mine && seasons >= 1;
  const traitRadar = emerged
    ? [
        { label: 'Professionalità', pct: p.personality.professionalism * 100, value: '' },
        { label: 'Ambizione', pct: p.personality.ambition * 100, value: '' },
        { label: 'Leadership', pct: p.personality.leadership * 100, value: '' },
        { label: 'Temperamento', pct: p.personality.temperament * 100, value: '' },
        { label: 'Lealtà', pct: p.personality.loyalty * 100, value: '' },
        { label: 'Adattabilità', pct: p.personality.adaptability * 100, value: '' },
      ]
    : null;

  // Mercato: forbice di valore intorno alla stima (mai il numero "vero" per gli altri).
  const center =
    baseMarketValue(est, p.age, Math.max(est, estPot), contractYearsLeft(s.world, p, s.year)) *
    formFor(s, p, owner ?? undefined);
  const w = VALUE_WIDTH[c.level];
  const r100k = (x: number) => Math.max(0, Math.round(x / 100_000) * 100_000);
  const contract = p.contractId ? s.world.contracts.get(p.contractId) : undefined;
  const wage = contract ? contract.wage * 52 : null;
  const wageView: { amount: number; esatto: boolean } | null =
    wage === null
      ? null
      : mine
        ? { amount: wage, esatto: true }
        : c.level >= 2
          ? { amount: wage * (1 + noise(`${p.id}|wage`) * 0.2), esatto: false }
          : null;

  const tags = [playerArchetype(p).label, shownLabel];
  const tratto = trattoDistintivo(p);
  if (tratto) tags.push(tratto);

  return {
    name: p.name,
    pos: p.position,
    posLabel: POS_LABEL[p.position],
    age: p.age,
    nationality: p.nationality,
    foot:
      p.preferredFoot === 'L' ? 'sinistro' : p.preferredFoot === 'both' ? 'ambidestro' : 'destro',
    clubName: owner?.name ?? 'Svincolato',
    leagueName: owner ? leagueOfClub(s.world, owner.id).name : null,
    shirt: shirtOf(s, p, owner),
    mine,
    conoscenza: c,
    gradino,
    forbice,
    /** Mostrato solo se il potenziale stimato sale di gradino. */
    gradinoPot: gradinoPot.idx < gradino.idx ? gradinoPot : null,
    ladder: ladderOf(names),
    profilo: profiloTecnico(p, c),
    carattere: {
      tags,
      summary: SUMMARY_BY_LABEL[shownLabel] ?? shownLabel,
      pro: mine || c.level >= 3 ? best(prosOf(p)) : null,
      contro: mine || c.level >= 3 ? best(controsOf(p)) : null,
      radar: traitRadar,
      note: mine
        ? emerged
          ? `Emerso in ${seasons === 1 ? 'una stagione' : `${seasons} stagioni`} con il club`
          : 'Prima stagione: il gruppo lo sta ancora conoscendo'
        : 'Impressioni degli osservatori — da confermare',
    },
    staff: staffVoices(s, p, c, mine ? null : owner),
    mercato: {
      valueLo: r100k(center * (1 - w)),
      valueHi: r100k(center * (1 + w)),
      wage: wageView,
      contractEnd: mine ? (contract?.endYear ?? null) : null,
      interesse: interestFor(s, p, est, owner),
      procuratore: procuratoreLine(p),
    },
    // I blocchi già esistenti (scala mondo, coi loro gate).
    stats: seasonStatsView(s, p),
    career: playerCareer(s, p.id as string),
    heat: playerHeatView(s, p.id as string),
    percentiles: percentilesFor(s, p.id as string),
    movements: playerMovements(p),
    running: runningStyle(p),
    morale: mine ? moraleLabel(p.morale) : null,
    injury: injuryLabel(p) || null,
  };
}

export type SchedaView = NonNullable<ReturnType<typeof schedaView>>;
