/**
 * Archetipi di ruolo (MODULE_ARCHETYPES): forme di gioco, non persone. Libreria
 * condivisa pura — l'archetipo di un giocatore è DERIVATO dagli attributi (mai
 * memorizzato, come l'overall), la heatmap è una funzione parametrica. L'autore dei
 * lobi è il piede DESTRO; `mirrorByFoot` specchia i mancini.
 */

import { playerOverall } from './ratings.js';
import type { Player, Position, PreferredFoot } from './types.js';

export type ArchetypeId =
  | 'gk-linea'
  | 'gk-libero'
  | 'df-marcatore'
  | 'df-impostazione'
  | 'df-fascia-spinta'
  | 'df-fascia-bloccato'
  | 'mf-regista'
  | 'mf-mediano'
  | 'mf-mezzala'
  | 'mf-tuttocampista'
  | 'mf-trequartista'
  | 'fw-punta-area'
  | 'fw-boa'
  | 'fw-seconda-punta'
  | 'fw-falso-nove'
  | 'fw-ala-invertita'
  | 'fw-ala-fascia';

/** Lobo gaussiano su campo normalizzato: x 0=propria porta→1 attacco, y 0=sinistra→1 destra. */
interface HeatLobe {
  x: number;
  y: number;
  sx: number;
  sy: number;
  w: number;
}

export interface Archetype {
  id: ArchetypeId;
  label: string;
  position: Position;
  /** Frase da report osservatore. */
  description: string;
  lobes: HeatLobe[];
  /** Terzini/ali/mezzali: il mancino specchia i lobi sull'asse y. */
  mirrorByFoot?: boolean;
  /** Peso degli attributi nel derivare l'archetipo e nel generarne gli attributi (-1..1). */
  bias: Record<string, number>;
}

export const ARCHETYPES: readonly Archetype[] = [
  // ---- Portieri
  {
    id: 'gk-linea',
    label: 'Portiere di linea',
    position: 'GK',
    description: 'vive sulla linea: riflessi felini, la porta è casa sua',
    lobes: [{ x: 0.04, y: 0.5, sx: 0.04, sy: 0.1, w: 1 }],
    bias: { reflexes: 0.9, handling: 0.6, aerial: 0.3, positioning: 0.4, composure: 0.3 },
  },
  {
    id: 'gk-libero',
    label: 'Portiere-libero',
    position: 'GK',
    description: 'dodicesimo uomo di movimento: esce alto, legge e imposta',
    lobes: [
      { x: 0.06, y: 0.5, sx: 0.07, sy: 0.14, w: 1 },
      { x: 0.18, y: 0.5, sx: 0.08, sy: 0.18, w: 0.35 },
    ],
    bias: { oneOnOne: 0.9, pace: 0.5, decisions: 0.7, composure: 0.5, reflexes: 0.3 },
  },
  // ---- Difensori
  {
    id: 'df-marcatore',
    label: 'Marcatore',
    position: 'DF',
    description: "cancella l'attaccante: duello, anticipo, niente fronzoli",
    lobes: [{ x: 0.18, y: 0.5, sx: 0.1, sy: 0.22, w: 1 }],
    bias: {
      marking: 0.9,
      tackling: 0.8,
      strength: 0.7,
      positioning: 0.5,
      dribbling: -0.4,
      passing: -0.3,
    },
  },
  {
    id: 'df-impostazione',
    label: "Centrale d'impostazione",
    position: 'DF',
    description: 'il primo regista: difende in avanti e cuce il gioco da dietro',
    lobes: [
      { x: 0.2, y: 0.5, sx: 0.11, sy: 0.24, w: 1 },
      { x: 0.35, y: 0.5, sx: 0.1, sy: 0.3, w: 0.3 },
    ],
    bias: { passing: 0.8, decisions: 0.7, composure: 0.6, marking: 0.3, tackling: 0.2 },
  },
  {
    id: 'df-fascia-spinta',
    label: 'Terzino a tutta fascia',
    position: 'DF',
    description: 'un binario: su e giù per la fascia novanta minuti, cross e ripiegamenti',
    mirrorByFoot: true,
    lobes: [
      { x: 0.25, y: 0.85, sx: 0.14, sy: 0.08, w: 1 },
      { x: 0.6, y: 0.88, sx: 0.16, sy: 0.08, w: 0.7 },
      { x: 0.85, y: 0.85, sx: 0.08, sy: 0.1, w: 0.25 },
    ],
    bias: { pace: 0.8, stamina: 0.8, workRate: 0.7, dribbling: 0.4, passing: 0.3, marking: 0.2 },
  },
  {
    id: 'df-fascia-bloccato',
    label: 'Terzino bloccato',
    position: 'DF',
    description: 'prima non prenderle: fascia bassa, diagonali e raddoppi',
    mirrorByFoot: true,
    lobes: [
      { x: 0.2, y: 0.85, sx: 0.12, sy: 0.08, w: 1 },
      { x: 0.45, y: 0.87, sx: 0.12, sy: 0.08, w: 0.35 },
    ],
    bias: { marking: 0.7, tackling: 0.7, positioning: 0.6, pace: 0.3, workRate: 0.3 },
  },
  // ---- Centrocampisti
  {
    id: 'mf-regista',
    label: 'Regista basso',
    position: 'MF',
    description: 'detta i tempi davanti alla difesa: due tocchi, mai in affanno',
    lobes: [{ x: 0.35, y: 0.5, sx: 0.1, sy: 0.22, w: 1 }],
    bias: { passing: 0.9, decisions: 0.9, composure: 0.7, tackling: 0.2, pace: -0.3 },
  },
  {
    id: 'mf-mediano',
    label: 'Mediano di rottura',
    position: 'MF',
    description: 'spezza le trame: chilometri, contrasti e palla al più vicino',
    lobes: [
      { x: 0.35, y: 0.5, sx: 0.12, sy: 0.26, w: 1 },
      { x: 0.25, y: 0.5, sx: 0.08, sy: 0.3, w: 0.4 },
    ],
    bias: { tackling: 0.9, workRate: 0.8, positioning: 0.7, strength: 0.6, finishing: -0.5 },
  },
  {
    id: 'mf-mezzala',
    label: "Mezzala d'inserimento",
    position: 'MF',
    description: "attacca l'area a fari spenti: il gol del centrocampista",
    mirrorByFoot: true,
    lobes: [
      { x: 0.45, y: 0.62, sx: 0.14, sy: 0.14, w: 1 },
      { x: 0.72, y: 0.6, sx: 0.12, sy: 0.14, w: 0.6 },
    ],
    bias: { workRate: 0.7, stamina: 0.7, passing: 0.5, finishing: 0.4, dribbling: 0.4 },
  },
  {
    id: 'mf-tuttocampista',
    label: 'Tuttocampista',
    position: 'MF',
    description: "box-to-box: c'è sempre, in entrambe le aree",
    lobes: [
      { x: 0.3, y: 0.5, sx: 0.14, sy: 0.2, w: 0.8 },
      { x: 0.6, y: 0.5, sx: 0.14, sy: 0.2, w: 0.8 },
    ],
    bias: { stamina: 0.9, workRate: 0.9, tackling: 0.5, passing: 0.4, finishing: 0.3 },
  },
  {
    id: 'mf-trequartista',
    label: 'Trequartista',
    position: 'MF',
    description: "vive tra le linee: l'ultimo passaggio è il suo mestiere",
    lobes: [
      { x: 0.68, y: 0.5, sx: 0.1, sy: 0.2, w: 1 },
      { x: 0.8, y: 0.5, sx: 0.08, sy: 0.24, w: 0.5 },
    ],
    bias: {
      dribbling: 0.8,
      passing: 0.8,
      decisions: 0.7,
      finishing: 0.5,
      tackling: -0.6,
      workRate: -0.3,
    },
  },
  // ---- Attaccanti
  {
    id: 'fw-punta-area',
    label: "Punta d'area",
    position: 'FW',
    description: 'rapace: vive dentro i sedici metri, un tocco e dentro',
    lobes: [{ x: 0.88, y: 0.5, sx: 0.06, sy: 0.14, w: 1 }],
    bias: {
      finishing: 0.9,
      positioning: 0.8,
      composure: 0.6,
      pace: 0.3,
      passing: -0.3,
      workRate: -0.2,
    },
  },
  {
    id: 'fw-boa',
    label: 'Centravanti boa',
    position: 'FW',
    description: 'fa salire la squadra: sponde, fisico, la difesa se lo sogna',
    lobes: [
      { x: 0.82, y: 0.5, sx: 0.08, sy: 0.16, w: 1 },
      { x: 0.6, y: 0.5, sx: 0.1, sy: 0.2, w: 0.35 },
    ],
    bias: { strength: 0.9, positioning: 0.6, finishing: 0.5, passing: 0.3, pace: -0.3 },
  },
  {
    id: 'fw-seconda-punta',
    label: 'Seconda punta',
    position: 'FW',
    description: 'svaria e associa: gioca PER la punta e le ruba i gol',
    lobes: [
      { x: 0.72, y: 0.45, sx: 0.12, sy: 0.2, w: 1 },
      { x: 0.85, y: 0.5, sx: 0.07, sy: 0.14, w: 0.5 },
    ],
    bias: { dribbling: 0.6, finishing: 0.6, decisions: 0.6, passing: 0.5, pace: 0.5 },
  },
  {
    id: 'fw-falso-nove',
    label: 'Falso nove',
    position: 'FW',
    description: "il nove che non c'è: viene incontro, apre spazi, rifinisce",
    lobes: [
      { x: 0.75, y: 0.5, sx: 0.1, sy: 0.18, w: 0.8 },
      { x: 0.55, y: 0.5, sx: 0.1, sy: 0.2, w: 0.6 },
    ],
    bias: { passing: 0.7, decisions: 0.8, dribbling: 0.6, finishing: 0.5, strength: -0.2 },
  },
  {
    id: 'fw-ala-invertita',
    label: 'Ala invertita',
    position: 'FW',
    description: 'parte largo sul piede debole e rientra a calciare',
    mirrorByFoot: true,
    lobes: [
      { x: 0.68, y: 0.15, sx: 0.12, sy: 0.09, w: 1 },
      { x: 0.85, y: 0.3, sx: 0.08, sy: 0.12, w: 0.6 },
    ],
    bias: { dribbling: 0.9, pace: 0.8, finishing: 0.6, passing: 0.3, tackling: -0.5 },
  },
  {
    id: 'fw-ala-fascia',
    label: 'Ala di fascia',
    position: 'FW',
    description: 'punta il fondo e mette in mezzo: il cross è legge',
    mirrorByFoot: true,
    lobes: [
      { x: 0.65, y: 0.88, sx: 0.14, sy: 0.08, w: 1 },
      { x: 0.85, y: 0.8, sx: 0.08, sy: 0.1, w: 0.6 },
    ],
    bias: { pace: 0.9, dribbling: 0.7, passing: 0.5, workRate: 0.4, finishing: 0.2 },
  },
] as const;

const BY_ID = new Map(ARCHETYPES.map((a) => [a.id, a]));

export function archetypeById(id: ArchetypeId): Archetype {
  const a = BY_ID.get(id);
  if (!a) throw new Error(`Archetipo sconosciuto: ${id}`);
  return a;
}

export function archetypesFor(position: Position): readonly Archetype[] {
  return ARCHETYPES.filter((a) => a.position === position);
}

/** Hash deterministico [0,1): il tiebreak non consuma RNG di simulazione. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/**
 * L'archetipo DERIVATO di un giocatore (MODULE_ARCHETYPES §2): il bias incontra gli
 * attributi, un tiebreak hash dà varietà stabile. Mai memorizzato (regola overall §1.2).
 */
export function playerArchetype(player: Player): Archetype {
  const candidates = archetypesFor(player.position);
  const attrs = player.attributes as unknown as Record<string, number>;
  // Conta la FORMA, non il livello: attributi centrati sulla media del giocatore,
  // punteggio normalizzato sulla massa di bias dell'archetipo (sennò vince chi
  // semplicemente pesa più attributi).
  const values = Object.values(attrs);
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  let best: Archetype = candidates[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const a of candidates) {
    let score = 0;
    let mass = 0;
    for (const [attr, weight] of Object.entries(a.bias)) {
      const v = attrs[attr];
      if (v === undefined) continue;
      score += weight * ((v - mean) / 25);
      mass += Math.abs(weight);
    }
    score = mass > 0 ? score / mass : 0;
    score += hash01(`${player.id}|${a.id}`) * 0.06;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/**
 * La heatmap "vera" dell'archetipo (MODULE_ARCHETYPES §3): matrice h×w normalizzata
 * [0..1], x cresce verso l'attacco. Il mancino specchia dove il ruolo ha un lato.
 * Lo scouting la mostrerà con rumore che si affina con le osservazioni.
 */
export function archetypeHeatmap(
  archetype: Archetype,
  foot: PreferredFoot,
  w = 12,
  h = 8,
): number[][] {
  const mirror = archetype.mirrorByFoot === true && foot === 'L';
  const grid: number[][] = [];
  let max = 0;
  for (let r = 0; r < h; r++) {
    const row: number[] = [];
    for (let c = 0; c < w; c++) {
      const x = (c + 0.5) / w;
      const yRaw = (r + 0.5) / h;
      const y = mirror ? 1 - yRaw : yRaw;
      let v = 0;
      for (const l of archetype.lobes) {
        const dx = (x - l.x) / l.sx;
        const dy = (y - l.y) / l.sy;
        v += l.w * Math.exp(-0.5 * (dx * dx + dy * dy));
      }
      row.push(v);
      if (v > max) max = v;
    }
    grid.push(row);
  }
  if (max > 0) {
    for (const row of grid)
      for (let c = 0; c < row.length; c++) row[c] = Math.round((row[c]! / max) * 1000) / 1000;
  }
  return grid;
}

/** Etichetta per report e UI ("Mezzala d'inserimento"). */
export function archetypeLabel(player: Player): string {
  return playerArchetype(player).label;
}

/**
 * I MOVIMENTI del giocatore (G2, richiesta utente): come si muove SENZA palla,
 * in linguaggio da report — profondità, mezzaluna, sovrapposizioni, terzino
 * bloccato… Derivati da archetipo + attributi (hash per la varietà stabile),
 * mai memorizzati. 2-3 frasi brevi per giocatore.
 */
export function playerMovements(player: Player): string[] {
  const a = playerArchetype(player);
  const attrs = player.attributes as unknown as Record<string, number>;
  const v = (k: string) => attrs[k] ?? 50;
  const pick = (salt: string, options: string[]): string =>
    options[Math.floor(hash01(`${player.id}|mov|${salt}`) * options.length)]!;
  const out: string[] = [];
  switch (a.id) {
    case 'gk-linea':
      out.push('resta sulla linea, esplosivo sul tiro ravvicinato');
      if (v('handling') >= 65) out.push('blocca al primo colpo, niente respinte regalate');
      break;
    case 'gk-libero':
      out.push('esce alto alle spalle della difesa, da libero aggiunto');
      if (v('passing') >= 60) out.push('fa ripartire l’azione coi piedi');
      break;
    case 'df-marcatore':
      out.push(
        v('pace') >= 62
          ? 'difende in avanti: anticipo sull’uomo, sempre a contatto'
          : 'difende all’indietro, protegge la profondità senza scommettere',
      );
      if (v('strength') >= 70) out.push('domina l’area sulle palle alte, primo palo suo');
      break;
    case 'df-impostazione':
      out.push('rompe la prima linea di pressione col passaggio');
      out.push(
        pick('imp', ['guida la linea alta col braccio alzato', 'si allarga a costruire da terzo']),
      );
      break;
    case 'df-fascia-spinta':
      out.push('si SOVRAPPONE a ogni azione, fino al fondo');
      if (v('stamina') >= 68) out.push('novanta minuti di corsia, andata e ritorno');
      else out.push('spinge a ondate, poi rifiata dietro la linea della palla');
      break;
    case 'df-fascia-bloccato':
      out.push('resta BLOCCATO dietro: con la palla dall’altra parte forma la linea a tre');
      out.push('accompagna solo con copertura alle spalle');
      break;
    case 'mf-regista':
      out.push('si abbassa tra i centrali a dettare i tempi');
      if (v('decisions') >= 68) out.push('riceve sempre col corpo aperto, gioco che cambia lato');
      break;
    case 'mf-mediano':
      out.push('schermo davanti alla difesa, chiude le linee di passaggio');
      out.push('aggredisce il portatore appena entra in zona');
      break;
    case 'mf-mezzala':
      out.push('si inserisce SENZA palla ad attaccare l’area');
      out.push(
        pick('mez', [
          'arriva a rimorchio sul dischetto',
          'taglia alle spalle del mediano avversario',
        ]),
      );
      break;
    case 'mf-tuttocampista':
      out.push('copre ogni zolla, box-to-box vero');
      if (v('workRate') >= 70) out.push('primo al pressing e primo a riempire l’area');
      break;
    case 'mf-trequartista':
      out.push('cerca la mattonella tra le linee, sempre smarcato');
      out.push(
        pick('tre', [
          'si defila nel mezzo spazio per ricevere',
          'viene incontro a MEZZALUNA per cucire il gioco',
        ]),
      );
      break;
    case 'fw-punta-area':
      out.push(
        v('pace') >= 68
          ? 'attacca la PROFONDITÀ sul filo del fuorigioco'
          : 'vive in area: attacca il primo palo sul cross',
      );
      out.push('stacca sul secondo palo quando la palla viaggia');
      break;
    case 'fw-boa':
      out.push('gioca spalle alla porta e fa salire la squadra');
      out.push('torre sul secondo palo, sponde per gli inserimenti');
      break;
    case 'fw-seconda-punta':
      out.push('si muove a MEZZALUNA incontro al portatore');
      out.push('poi attacca lo spazio lasciato dalla punta');
      break;
    case 'fw-falso-nove':
      out.push('si abbassa tra le linee e libera la PROFONDITÀ per gli esterni');
      if (v('passing') >= 65) out.push('cuce il gioco da dieci travestito da nove');
      break;
    case 'fw-ala-invertita':
      out.push('parte largo e TAGLIA DENTRO sul piede forte');
      if (v('pace') >= 70) out.push('punta l’uomo a ogni ricezione');
      else out.push('si accentra a rifinire, l’ampiezza la dà il terzino');
      break;
    case 'fw-ala-fascia':
      out.push('resta col gesso sulla riga: ampiezza e cross');
      out.push('a palla lontana attacca il secondo palo a rientrare');
      break;
    default:
      out.push('si muove seguendo il ruolo, senza pattern marcati');
  }
  return out.slice(0, 3);
}
