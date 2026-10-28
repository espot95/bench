/**
 * SPEZZATURA App.tsx (revisione): i mattoncini UI condivisi tra schermate e
 * modali — prima Chip e BackBar vivevano in fondo ad App.tsx e ogni modale
 * copiava il backdrop SENZA una vera gestione di Esc (il keydown stava su un
 * div non focalizzabile: il tasto non chiudeva mai nulla).
 */

import { useEffect, useRef } from 'react';

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
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/85 px-3 py-1.5 text-sm backdrop-blur">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
      <div className="font-bold" style={accent ? { color: accent } : undefined}>
        {v}
      </div>
    </div>
  );
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
      >
        ← Mappa
      </button>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}
