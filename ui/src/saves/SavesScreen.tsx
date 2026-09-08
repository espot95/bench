/**
 * "Continua partita": i salvataggi locali (IndexedDB) e cloud (Supabase), import/export.
 */

import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { saveFromText } from '../../../src/persistence/codec';
import { Crest } from '../Crest';
import type { GameSession } from '../game';
import { clubIdentity } from '../identity';
import { gzipText, hasGzip, readMaybeGzip } from './gzip';
import { localStore } from './local';
import { saveToSession } from './session';
import {
  AUTOSAVE_ID,
  type SaveStore,
  type SaveSummary,
  formatBytes,
  formatWhen,
  newSaveId,
} from './store';
import {
  cloudConfigured,
  cloudStore,
  currentUser,
  onAuthChange,
  sendMagicLink,
  signOut,
  verifyCode,
} from './supabase';

const GOLD = '#c9a961';

type Tab = 'local' | 'cloud';

export function SavesScreen({
  onLoad,
  onBack,
}: {
  onLoad: (s: GameSession) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('local');
  const [rows, setRows] = useState<SaveSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [mailSent, setMailSent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const store: SaveStore = tab === 'local' ? localStore : cloudStore;
  const cloudOn = cloudConfigured();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      if (tab === 'cloud' && !user) {
        setRows([]);
        return;
      }
      setRows(await store.list());
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    }
  }, [store, tab, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!cloudOn) return;
    void currentUser().then(setUser);
    return onAuthChange(setUser);
  }, [cloudOn]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const load = (r: SaveSummary) =>
    run('Carico…', async () => {
      const file = await store.load(r.id);
      onLoad(saveToSession(file));
    });

  const remove = (r: SaveSummary) => {
    if (!window.confirm(`Eliminare "${r.meta.name}"?`)) return;
    void run('Elimino…', async () => {
      await store.remove(r.id);
      await refresh();
    });
  };

  const exportFile = (r: SaveSummary) =>
    run('Esporto…', async () => {
      const file = await store.load(r.id);
      const text = JSON.stringify(file);
      const gz = hasGzip();
      const blob = gz ? await gzipText(text) : new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${r.meta.clubName.replace(/\s+/g, '_')}_${r.meta.year}_g${r.meta.round}.bench.json${gz ? '.gz' : ''}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });

  const importFile = (f: File) =>
    run('Importo…', async () => {
      const file = saveFromText(await readMaybeGzip(f));
      await localStore.put(newSaveId(), file);
      if (tab !== 'local') setTab('local');
      else await refresh();
    });

  const toCloud = (r: SaveSummary) =>
    run('Carico nel cloud…', async () => {
      const file = await localStore.load(r.id);
      await cloudStore.put(r.id === AUTOSAVE_ID ? newSaveId() : r.id, file);
      setTab('cloud');
    });

  const toLocal = (r: SaveSummary) =>
    run('Scarico in locale…', async () => {
      const file = await cloudStore.load(r.id);
      await localStore.put(r.id, file);
      setTab('local');
    });

  const login = () =>
    run('Invio il link…', async () => {
      await sendMagicLink(email.trim());
      setMailSent(true);
    });

  const verify = () =>
    run('Verifico…', async () => {
      await verifyCode(email.trim(), code.trim());
      setCode('');
    });

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        tab === t ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="anim-in-slow min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-200"
            >
              ← menu principale
            </button>
            <h1 className="mt-1 text-3xl font-black tracking-wide">Continua partita</h1>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1">
            {tabBtn('local', '💾 Locale')}
            {tabBtn('cloud', '☁️ Cloud')}
          </div>
        </div>

        {tab === 'local' && (
          <div className="mb-4 flex items-center gap-3 text-sm text-zinc-400">
            <span>Sul tuo browser (IndexedDB). L'autosalvataggio si aggiorna a ogni giornata.</span>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 font-semibold text-zinc-200 hover:border-zinc-500"
            >
              ⤓ Importa file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".gz,.json,application/gzip,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {tab === 'cloud' && !cloudOn && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
            <div className="font-semibold text-zinc-200">Cloud non configurato</div>
            <p className="mt-1">
              Copia <code>ui/.env.example</code> in <code>ui/.env.local</code> con URL e anon key
              del tuo progetto Supabase, esegui <code>supabase/migrations/0001_saves.sql</code> e
              riavvia <code>npm run dev</code>.
            </p>
          </div>
        )}

        {tab === 'cloud' && cloudOn && !user && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="font-semibold">Accedi con la tua email</div>
            <p className="mt-1 text-sm text-zinc-400">
              Ti mandiamo un link (o un codice): nessuna password.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@esempio.it"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-zinc-400"
              />
              <button
                type="button"
                disabled={!email.includes('@') || busy !== null}
                onClick={() => void login()}
                className="rounded-lg px-4 py-2 font-bold text-zinc-950 disabled:opacity-40"
                style={{ background: GOLD }}
              >
                Invia link
              </button>
            </div>
            {mailSent && (
              <div className="mt-3 text-sm text-zinc-300">
                Controlla la posta e apri il link. Se hai ricevuto un codice, incollalo qui:
                <div className="mt-2 flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="codice a 6 cifre"
                    className="w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 outline-none focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    disabled={code.trim().length < 6 || busy !== null}
                    onClick={() => void verify()}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 font-semibold hover:border-zinc-400 disabled:opacity-40"
                  >
                    Verifica
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'cloud' && cloudOn && user && (
          <div className="mb-4 flex items-center gap-3 text-sm text-zinc-400">
            <span>
              Connesso come <span className="text-zinc-200">{user.email}</span>
            </span>
            <button
              type="button"
              onClick={() => void run('Esco…', signOut)}
              className="ml-auto text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-200"
            >
              esci
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {busy && <div className="mb-4 text-sm text-zinc-400">{busy}</div>}

        {(tab === 'local' || (cloudOn && user)) && rows.length === 0 && !busy && (
          <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
            Nessun salvataggio {tab === 'local' ? 'in locale' : 'nel cloud'}.
          </div>
        )}

        <div className="space-y-3">
          {rows.map((r) => {
            const id = clubIdentity(r.meta.clubName, 60, r.meta.leagueName, '');
            const isAuto = r.id === AUTOSAVE_ID;
            const done = r.meta.round > r.meta.totalRounds;
            return (
              <div
                key={r.id}
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="h-14 w-14 shrink-0">
                  <Crest id={id} name={r.meta.clubName} reputation={60} className="h-14 w-14" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {r.meta.name}
                    {isAuto && (
                      <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-zinc-400">
                        auto
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm text-zinc-400">
                    {r.meta.clubName} · {r.meta.leagueName} · stagione {r.meta.year}/
                    {String(r.meta.year + 1).slice(2)} ·{' '}
                    {done ? 'stagione conclusa' : `giornata ${r.meta.round}/${r.meta.totalRounds}`}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatWhen(r.updatedAt)} · {formatBytes(r.bytes)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {tab === 'local' && cloudOn && user && (
                    <IconBtn title="carica nel cloud" onClick={() => void toCloud(r)}>
                      ☁️↑
                    </IconBtn>
                  )}
                  {tab === 'cloud' && (
                    <IconBtn title="scarica in locale" onClick={() => void toLocal(r)}>
                      💾↓
                    </IconBtn>
                  )}
                  <IconBtn title="esporta su file" onClick={() => void exportFile(r)}>
                    ⤒
                  </IconBtn>
                  <IconBtn title="elimina" onClick={() => remove(r)}>
                    ✕
                  </IconBtn>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void load(r)}
                    className="rounded-lg px-4 py-2 font-bold text-zinc-950 transition-transform hover:scale-105 disabled:opacity-40"
                    style={{ background: GOLD }}
                  >
                    ▶ Carica
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-lg border border-zinc-700 px-2.5 py-2 text-sm text-zinc-300 hover:border-zinc-400 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}
