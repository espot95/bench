/**
 * SPEZZATURA App.tsx (revisione): i mattoncini UI condivisi tra schermate e
 * modali — prima Chip e BackBar vivevano in fondo ad App.tsx e ogni modale
 * copiava il backdrop SENZA una vera gestione di Esc (il keydown stava su un
 * div non focalizzabile: il tasto non chiudeva mai nulla).
 *
 * CROMATURA (richiesta utente: "è tutto piatto"): BackBar è una TESTATA col velo
 * del colore sociale, Chip ha la tacca d'accento, Tabs è il segmented condiviso
 * con la lineetta che scivola sotto la voce attiva.
 */

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Esc chiude DAVVERO: listener a livello finestra, callback sempre fresca. */
export function useEscape(onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

export function Chip({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div
      className="rounded-lg border border-zinc-800/80 border-l-2 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 px-3 py-1.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur"
      style={{ borderLeftColor: accent ?? '#52525b' }}
    >
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
      <div className="font-bold" style={accent ? { color: accent } : undefined}>
        {v}
      </div>
    </div>
  );
}

/** Testata di sezione: fascia col velo d'accento, non più bottone+titolo nudi.
    I margini negativi mangiano il p-4 della card che la ospita. */
export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sec-head -mx-4 -mt-4 mb-4 flex items-center gap-3 rounded-t-xl px-4 py-3">
      <button
        type="button"
        onClick={onBack}
        className="group flex items-center gap-1 rounded-full border border-zinc-700/80 bg-zinc-950/60 px-3 py-1 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">←</span> Mappa
      </button>
      <h2 className="text-lg font-bold tracking-wide drop-shadow-sm">{title}</h2>
    </div>
  );
}

/**
 * Tab condivisi (sede, campo…): voci asciutte su un filo di base, con la
 * lineetta del colore sociale che SCIVOLA sotto la voce attiva (misurata sul
 * DOM, larghezze libere). L'accento arriva da --accent sul root.
 */
export function Tabs<K extends string>({
  items,
  active,
  onPick,
}: {
  items: readonly { k: K; label: string; icon?: ReactNode }[];
  active: K;
  onPick: (k: K) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState({ left: 0, width: 0 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: si rimisura quando cambia la voce attiva o la lista.
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-k="${CSS.escape(active)}"]`);
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, items.length]);
  return (
    <div ref={wrap} className="tab-row mb-4 flex flex-wrap gap-1">
      {items.map((it) => (
        <button
          key={it.k}
          type="button"
          data-k={it.k}
          onClick={() => onPick(it.k)}
          className={`flex items-center gap-1.5 rounded-t-md px-3.5 py-2 text-sm font-semibold transition-colors ${
            active === it.k
              ? 'text-[var(--accent,#c9a961)]'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
      {bar.width > 0 && <span className="tab-thumb" style={{ left: bar.left, width: bar.width }} />}
    </div>
  );
}
