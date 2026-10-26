/**
 * Numeri scritti dall'utente (revisione): "2,5" con la virgola italiana prima
 * diventava NaN (Number) o veniva TRONCATO a 2 (parseFloat) — e NaN <= 0 è
 * false, quindi il bottone restava attivo e l'offerta partiva corrotta.
 */

/** Importo in testo → numero positivo, o null se non interpretabile. */
export function parseMoney(s: string): number | null {
  const v = Number.parseFloat(s.trim().replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}
