/**
 * CALENDARIO (richiesta utente): mappa deterministica round→data e helper dei giorni.
 * Il tempo di gioco resta round-based nel motore; qui vive solo la PRESENTAZIONE del
 * tempo: giorno 0 = 10 agosto (quartier generale estivo), campionato la domenica a
 * partire dalla prima domenica dal 24 agosto in poi, coppe il mercoledì successivo
 * alla giornata di sblocco. Zero RNG, zero stato: tutto derivato da (year, round).
 */

const DAY_MS = 86_400_000;

/** Giorno 0 della stagione: 10 agosto dell'anno di kick-off. */
export function seasonStartDate(year: number): Date {
  return new Date(Date.UTC(year, 7, 10));
}

/** La prima domenica dal 24 agosto in poi (giornata 1). */
function firstMatchday(year: number): Date {
  const d = new Date(Date.UTC(year, 7, 24));
  const shift = (7 - d.getUTCDay()) % 7; // 0 = domenica
  return new Date(d.getTime() + shift * DAY_MS);
}

/** Offset in giorni (dal giorno 0) della giornata di campionato `round`. */
export function roundDay(year: number, round: number): number {
  const start = seasonStartDate(year).getTime();
  const first = firstMatchday(year).getTime();
  return Math.round((first - start) / DAY_MS) + 7 * (round - 1);
}

/** Il mercoledì infrasettimanale dopo la giornata `round` (turni di coppa). */
export function midweekDay(year: number, round: number): number {
  return roundDay(year, round) + 3;
}

export function dayToDate(year: number, day: number): Date {
  return new Date(seasonStartDate(year).getTime() + day * DAY_MS);
}

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "dom 15 set" — l'etichetta breve di un giorno di stagione. */
export function fmtDay(year: number, day: number): string {
  const d = dayToDate(year, day);
  return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`;
}

/** "domenica 15 settembre 2026" — l'etichetta lunga. */
export function fmtDayLong(year: number, day: number): string {
  const FULL_G = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const FULL_M = [
    'gennaio',
    'febbraio',
    'marzo',
    'aprile',
    'maggio',
    'giugno',
    'luglio',
    'agosto',
    'settembre',
    'ottobre',
    'novembre',
    'dicembre',
  ];
  const d = dayToDate(year, day);
  return `${FULL_G[d.getUTCDay()]} ${d.getUTCDate()} ${FULL_M[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
