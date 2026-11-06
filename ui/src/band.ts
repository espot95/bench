/**
 * FASCE di valutazione (G2, richiesta utente: "il numero sparisca del tutto").
 * L'overall resta un fatto interno del motore; qui diventa linguaggio da
 * scouting — una fascia parlata e le stelle per le righe compatte.
 */

export function bandOf(overall: number, age: number): string {
  if (overall >= 86) return 'Fuoriclasse';
  if (overall >= 79) return 'Da nazionale';
  if (overall >= 72) return 'Titolare di vertice';
  if (overall >= 64) return 'Buon titolare';
  if (overall >= 56) return 'Rotazione';
  return age <= 21 ? 'Prospetto' : 'Gregario';
}

// ---------------------------------------------------------------------------
// SCALA DEI GRADINI (scheda v2, MODULE_UI §11): 9 livelli in linguaggio
// calcistico, coi nomi veri dei campionati del mondo procedurale. Le soglie
// sono tarate sulla distribuzione reale (XI mediano T1 ≈ 68, big ≈ 84-89).
// ---------------------------------------------------------------------------

export interface Gradino {
  /** Indice 0 (Fuoriclasse mondiale) … 8 (Categoria inferiore). */
  idx: number;
  label: string;
  desc: string;
}

/** Nomi dei campionati di riferimento (tier 1 e 2 della nazione dell'utente). */
export interface LadderNames {
  t1: string;
  t2: string;
}

/** La scala intera, dal gradino più alto al più basso (per la legenda in scheda). */
export function ladderOf(names: LadderNames): Gradino[] {
  return [
    { idx: 0, label: 'Fuoriclasse mondiale', desc: 'Decide le partite al massimo livello europeo' },
    { idx: 1, label: 'Top in Europa', desc: 'Titolare in una squadra da grandi coppe' },
    { idx: 2, label: 'Titolare da big', desc: `Fisso nell'undici di una big di ${names.t1}` },
    {
      idx: 3,
      label: 'Rotazione di una big',
      desc: 'Utile in una rosa da vertice, non sempre titolare',
    },
    { idx: 4, label: `Titolare da ${names.t1}`, desc: 'Fisso in una squadra di media classifica' },
    { idx: 5, label: `Rotazione di ${names.t1}`, desc: `Alternativa affidabile in ${names.t1}` },
    { idx: 6, label: `Top della ${names.t2}`, desc: 'Fa la differenza in cadetteria' },
    { idx: 7, label: `Titolare da ${names.t2}`, desc: `Fisso in una squadra di ${names.t2}` },
    { idx: 8, label: 'Categoria inferiore', desc: 'Serie minori, o in crescita nelle giovanili' },
  ];
}

const GRADINO_SOGLIE = [90, 83, 77, 71, 64, 58, 53, 46] as const;

/** Il gradino di un livello (overall derivato o stimato): MAI il numero in UI. */
export function gradinoOf(level: number, names: LadderNames): Gradino {
  const ladder = ladderOf(names);
  for (let i = 0; i < GRADINO_SOGLIE.length; i++) {
    if (level >= GRADINO_SOGLIE[i]!) return ladder[i]!;
  }
  return ladder[8]!;
}

/** Stelle 1-5 per le righe (mai il numero). */
export function starsOf(overall: number): number {
  if (overall >= 84) return 5;
  if (overall >= 76) return 4;
  if (overall >= 68) return 3;
  if (overall >= 60) return 2;
  return 1;
}

/** "★★★★☆" — la stringa compatta per tabelle e select. */
export function starString(overall: number): string {
  const n = starsOf(overall);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
