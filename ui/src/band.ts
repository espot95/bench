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
