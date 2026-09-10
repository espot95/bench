/**
 * Il "?" che spiega il gioco (richiesta utente): chip piccolo, tooltip ricco al
 * passaggio del mouse o al focus da tastiera. Solo CSS, niente stato.
 */

export function Help({ text }: { text: string }) {
  return (
    <button type="button" className="help-chip" aria-label={text}>
      ?<span className="help-pop">{text}</span>
    </button>
  );
}
