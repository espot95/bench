/**
 * Dialog 💾 dall'hub: salva con nome (locale / cloud), esporta su file, torna al menu.
 */

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import type { GameSession } from '../game';
import { gzipText, hasGzip } from './gzip';
import { localStore } from './local';
import { sessionToSave, suggestedName } from './session';
import { newSaveId } from './store';
import { cloudConfigured, cloudStore, currentUser, onAuthChange } from './supabase';

const GOLD = '#c9a961';

export function SaveDialog({
  session,
  accent,
  onClose,
  onExit,
}: {
  session: GameSession;
  accent: string;
  onClose: () => void;
  onExit: () => void;
}) {
  const [name, setName] = useState(() => suggestedName(session));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const cloudOn = cloudConfigured();

  useEffect(() => {
    if (!cloudOn) return;
    void currentUser().then(setUser);
    return onAuthChange(setUser);
  }, [cloudOn]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(`Errore: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveLocal = () =>
    run(async () => {
      await localStore.put(
        newSaveId(),
        sessionToSave(session, name.trim() || suggestedName(session)),
      );
      return 'Salvato in locale.';
    });

  const saveCloud = () =>
    run(async () => {
      await cloudStore.put(
        newSaveId(),
        sessionToSave(session, name.trim() || suggestedName(session)),
      );
      return 'Salvato nel cloud.';
    });

  const exportFile = () =>
    run(async () => {
      const file = sessionToSave(session, name.trim() || suggestedName(session));
      const text = JSON.stringify(file);
      const gz = hasGzip();
      const blob = gz ? await gzipText(text) : new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${file.meta.clubName.replace(/\s+/g, '_')}_${file.meta.year}_g${file.meta.round}.bench.json${gz ? '.gz' : ''}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return 'File esportato.';
    });

  const btn =
    'rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 hover:border-zinc-400 disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center">
      <button
        type="button"
        aria-label="chiudi"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <dialog
        open
        aria-modal="true"
        className="relative w-[min(92vw,480px)] rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="text-xs uppercase tracking-widest text-zinc-500">Salvataggio</div>
        <h2 className="mt-1 text-xl font-bold">Salva la carriera</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-400"
          placeholder="nome del salvataggio"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLocal()}
            className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-40"
            style={{ background: accent || GOLD }}
          >
            💾 Salva in locale
          </button>
          <button
            type="button"
            disabled={busy || !cloudOn || !user}
            onClick={() => void saveCloud()}
            className={btn}
            title={
              !cloudOn
                ? 'cloud non configurato (ui/.env.local)'
                : !user
                  ? 'accedi dal menu → Continua partita → Cloud'
                  : 'salva nel tuo account Supabase'
            }
          >
            ☁️ Salva nel cloud
          </button>
          <button type="button" disabled={busy} onClick={() => void exportFile()} className={btn}>
            ⤒ Esporta file
          </button>
        </div>
        {msg && <div className="mt-3 text-sm text-zinc-300">{msg}</div>}
        <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={onExit}
            className="text-xs uppercase tracking-widest text-zinc-500 hover:text-red-300"
            title="l'autosalvataggio dell'ultima giornata resta in locale"
          >
            esci al menu
          </button>
          <button type="button" onClick={onClose} className={btn}>
            Chiudi
          </button>
        </div>
      </dialog>
    </div>
  );
}
