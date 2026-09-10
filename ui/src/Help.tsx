/**
 * Il "?" che spiega il gioco (richiesta utente): chip piccolo, tooltip ricco al
 * passaggio del mouse o al focus. Il popover è renderizzato in PORTAL su
 * document.body: sta SOPRA a qualsiasi pannello (niente stacking context che lo
 * copre) e si ribalta sotto quando il chip è vicino al bordo alto.
 */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const POP_HALF = 130; // metà larghezza del popover (px)

export function Help({ text }: { text: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 200;
    const x = Math.max(
      8 + POP_HALF,
      Math.min(window.innerWidth - 8 - POP_HALF, r.left + r.width / 2),
    );
    setPos({ x, y: below ? r.bottom + 8 : r.top - 8, below });
  };
  const close = () => setPos(null);

  return (
    <>
      <button
        type="button"
        ref={ref}
        className="help-chip"
        aria-label={text}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
      >
        ?
      </button>
      {pos &&
        createPortal(
          <div
            className="help-pop-portal"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, ${pos.below ? '0' : '-100%'})`,
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
