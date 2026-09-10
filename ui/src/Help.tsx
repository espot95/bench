/**
 * Il "?" che spiega il gioco (richiesta utente): chip piccolo, tooltip ricco al
 * passaggio del mouse o al focus da tastiera. Il popover si RIBALTA sotto quando
 * sta per uscire dal bordo alto dello schermo e si sposta se sfora ai lati.
 */

import { useRef, useState } from 'react';

const POP_HALF = 130; // metà larghezza del popover (px), margine incluso

export function Help({ text }: { text: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [below, setBelow] = useState(false);
  const [shift, setShift] = useState(0);

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setBelow(r.top < 200); // vicino al bordo alto: apri verso il basso
    const cx = r.left + r.width / 2;
    let s = 0;
    if (cx - POP_HALF < 8) s = 8 - (cx - POP_HALF);
    else if (cx + POP_HALF > window.innerWidth - 8) s = window.innerWidth - 8 - (cx + POP_HALF);
    setShift(s);
  };

  return (
    <button
      type="button"
      ref={ref}
      className="help-chip"
      aria-label={text}
      onMouseEnter={place}
      onFocus={place}
    >
      ?
      <span className={`help-pop${below ? ' below' : ''}`} style={{ marginLeft: shift }}>
        {text}
      </span>
    </button>
  );
}
