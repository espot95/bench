/**
 * Sede → Contratti (MODULE_CONTRACTS §7): la rosa coi contratti, e il tavolo del
 * rinnovo come chat con l'entourage — bolle, mood, bonus, promesse. Guscio puro.
 */

import { useEffect, useRef, useState } from 'react';
import type { ContractBonuses, Position } from '../../src/core/types';
import {
  type GameSession,
  closeRenewalTalk,
  contractRows,
  openPromises,
  renewalOffer,
  renewalTableView,
  startRenewalTalk,
  suggestedBonuses,
} from './game';

const K = (v: number) => `${Math.round(v / 1000)}k`;
const M = (v: number) => `${(v / 1e6).toFixed(1)}M`;

export function ContractsPane({ session, accent }: { session: GameSession; accent: string }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const table = renewalTableView(session);
  const promises = openPromises(session);

  const open = (id: string) => {
    const err = startRenewalTalk(session, id);
    setMsg(err);
    refresh();
  };

  return (
    <div className="space-y-3 text-sm">
      {msg && (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-amber-200">
          {msg}
        </div>
      )}
      {promises.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
          <div className="text-xs uppercase tracking-widest text-zinc-500">promesse aperte</div>
          {promises.map((p) => (
            <div key={p.playerId} className="mt-1">
              🤝 Rinforzo in <b>{p.position}</b> (≥{p.minOverall}) promesso a {p.playerName} — entro
              la giornata {p.deadlineRound}
              {p.deadlineYear !== session.year ? ` del ${p.deadlineYear}` : ''}.
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2">Giocatore</th>
              <th className="px-2 text-right">Ov</th>
              <th className="px-2 text-right">Età</th>
              <th className="px-2 text-right">Ingaggio</th>
              <th className="px-2 text-right">Scadenza</th>
              <th className="px-2">Entourage</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody>
            {contractRows(session).map((r) => (
              <tr key={r.id} className="border-b border-zinc-800/60">
                <td className="px-3 py-1.5">
                  <span className="mr-1 text-zinc-500">{r.pos}</span>
                  {r.name}
                  {r.fan && (
                    <span className="ml-1" title="cuore di tifoso: cresciuto qui">
                      ❤
                    </span>
                  )}
                  {r.bonusCount > 0 && (
                    <span className="ml-1 text-xs text-amber-300" title="contratto con bonus">
                      ★{r.bonusCount}
                    </span>
                  )}
                  {r.note && <div className="text-[11px] italic text-amber-300/80">{r.note}</div>}
                </td>
                <td className="px-2 text-right">{r.overall}</td>
                <td className="px-2 text-right text-zinc-400">{r.age}</td>
                <td className="px-2 text-right">{K(r.wage)}/sett</td>
                <td className="px-2 text-right">
                  {r.expiring ? (
                    <span className="rounded bg-red-950/70 px-1.5 py-0.5 font-semibold text-red-300">
                      {r.endYear} ⚠
                    </span>
                  ) : (
                    <span className="text-zinc-400">{r.endYear}</span>
                  )}
                </td>
                <td className="px-2 text-zinc-500">{r.agency}</td>
                <td className="px-2 text-right">
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                    onClick={() => open(r.id)}
                  >
                    📠 Tratta
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Niente autorinnovi: chi arriva a scadenza senza un accordo se ne va a parametro zero. I
        bonus pattuiti si pagano a fine stagione; le promesse di mercato si verificano davvero.
      </p>

      {table && (
        <RenewalTable
          session={session}
          accent={accent}
          onClose={() => {
            setMsg(closeRenewalTalk(session));
            refresh();
          }}
        />
      )}
    </div>
  );
}

type BonusKey = 'perGoal' | 'perAssist' | 'trophy' | 'topFinish' | 'survival';
const BONUS_LABEL: Record<BonusKey, string> = {
  perGoal: 'a gol',
  perAssist: 'ad assist',
  trophy: 'titolo',
  topFinish: 'top-4',
  survival: 'salvezza',
};

function RenewalTable({
  session,
  accent,
  onClose,
}: {
  session: GameSession;
  accent: string;
  onClose: () => void;
}) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [wageInput, setWageInput] = useState('');
  const [years, setYears] = useState(3);
  const [bonusMult, setBonusMult] = useState<Record<BonusKey, number>>({
    perGoal: 0,
    perAssist: 0,
    trophy: 0,
    topFinish: 0,
    survival: 0,
  });
  const [promise, setPromise] = useState<Position | ''>('');
  const [shown, setShown] = useState(0);
  const logEnd = useRef<HTMLDivElement>(null);

  const nv = renewalTableView(session);

  useEffect(() => {
    if (!nv) return;
    if (shown < nv.log.length) {
      const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 150 : 620);
      return () => window.clearTimeout(t);
    }
  }, [shown, nv]);
  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: 'smooth' });
  });
  if (!nv) return null;

  const waiting = shown < nv.log.length;
  const mood = nv.mood;
  const moodEmoji = mood < 0.3 ? '😠' : mood < 0.5 ? '😒' : mood < 0.7 ? '🙂' : '🤝';
  const moodColor = mood < 0.3 ? '#ef4444' : mood < 0.5 ? '#f59e0b' : '#34d399';
  const base = suggestedBonuses(session);

  const send = (weekly: number) => {
    const bonuses: ContractBonuses = {};
    for (const k of Object.keys(bonusMult) as BonusKey[]) {
      if (bonusMult[k] > 0) bonuses[k] = base[k] * bonusMult[k];
    }
    renewalOffer(session, {
      wage: weekly,
      years,
      bonuses,
      promise: promise === '' ? null : promise,
    });
    setWageInput('');
    refresh();
  };

  const bubbleStyle = (who: string) =>
    who === 'tu'
      ? 'ml-10 self-end border-zinc-600 bg-zinc-800/90'
      : who === 'agente'
        ? 'mr-10 self-start border-amber-900/70 bg-amber-950/40'
        : 'self-center border-transparent bg-transparent text-center text-[11px] italic text-zinc-500';

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/75 p-4">
      <div className="flex h-[680px] max-h-[94vh] w-full max-w-xl flex-col rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h3 className="font-bold">
              {nv.player} <span className="font-normal text-zinc-500">· {nv.agent}</span>
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              <span>
                oggi {K(nv.currentWage)}/sett, scadenza {nv.currentEnd}
              </span>
              {nv.stage === 'terms' && <span>{nv.roundsLeft} rilanci rimasti</span>}
              {nv.badges.map((b) => (
                <span key={b} className="text-amber-300/90">
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl">{moodEmoji}</div>
            <div className="mt-1 h-1.5 w-20 overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full transition-all duration-500"
                style={{ width: `${Math.round(mood * 100)}%`, background: moodColor }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {nv.log.slice(0, shown).map((e, i) => (
            <div
              key={`${i}-${e.text.slice(0, 12)}`}
              className={`max-w-[85%] rounded-xl border px-3 py-1.5 text-sm ${bubbleStyle(e.who)}`}
            >
              {e.who !== 'sistema' && (
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {e.who === 'tu' ? 'la tua offerta' : e.who}
                </div>
              )}
              {e.text}
            </div>
          ))}
          {waiting && (
            <div className="mr-10 max-w-[85%] self-start rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-500">
              <span className="inline-block animate-pulse">sta scrivendo…</span>
            </div>
          )}
          <div ref={logEnd} />
        </div>

        <div className="border-t border-zinc-800 p-3">
          {nv.stage === 'terms' && (
            <>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">
                  Chiede: <b className="text-zinc-100">{K(nv.ask)}/sett</b>
                  <span className="ml-2 text-xs text-zinc-500">
                    (vorrebbe {nv.yearsWanted} anni)
                  </span>
                </span>
                <div className="flex gap-1.5">
                  {[0.85, 0.93, 1.0].map((f) => (
                    <button
                      key={f}
                      type="button"
                      disabled={waiting}
                      onClick={() => send(Math.round((nv.ask * f) / 500) * 500)}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {f === 1 ? 'pareggia' : `−${Math.round((1 - f) * 100)}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* bonus e promessa: il pacchetto abbassa il fisso */}
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                {(Object.keys(BONUS_LABEL) as BonusKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={waiting}
                    onClick={() => {
                      setBonusMult((m) => ({ ...m, [k]: (m[k] + 1) % 3 }));
                    }}
                    className={`rounded-full border px-2 py-1 transition-colors ${
                      bonusMult[k] > 0
                        ? 'border-amber-600/70 bg-amber-950/50 text-amber-200'
                        : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                    }`}
                    title="tocca per 0× → 1× → 2×"
                  >
                    {BONUS_LABEL[k]}{' '}
                    {bonusMult[k] > 0
                      ? base[k] * bonusMult[k] >= 1e6
                        ? M(base[k] * bonusMult[k])
                        : K(base[k] * bonusMult[k])
                      : ''}
                  </button>
                ))}
                <select
                  value={promise}
                  onChange={(e) => setPromise(e.target.value as Position | '')}
                  className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs"
                  title="promessa di un rinforzo nel reparto — si verifica davvero"
                >
                  <option value="">nessuna promessa</option>
                  <option value="GK">🤝 rinforzo GK</option>
                  <option value="DF">🤝 rinforzo DF</option>
                  <option value="MF">🤝 rinforzo MF</option>
                  <option value="FW">🤝 rinforzo FW</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
                >
                  {[1, 2, 3, 4, 5].map((y) => (
                    <option key={y} value={y}>
                      {y} anni
                    </option>
                  ))}
                </select>
                <input
                  value={wageInput}
                  onChange={(e) => setWageInput(e.target.value)}
                  placeholder="ingaggio in k/sett"
                  inputMode="numeric"
                  disabled={waiting}
                  className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  onKeyDown={(e) => {
                    const v = Number(wageInput);
                    if (e.key === 'Enter' && v > 0) send(Math.round(v * 1000));
                  }}
                />
                <button
                  type="button"
                  disabled={waiting || Number(wageInput) <= 0}
                  onClick={() => send(Math.round(Number(wageInput) * 1000))}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-40"
                  style={{ background: accent }}
                >
                  Proponi
                </button>
              </div>
            </>
          )}
          {nv.stage !== 'terms' && (
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-semibold ${
                  nv.stage === 'done'
                    ? 'text-emerald-300'
                    : nv.stage === 'leaving'
                      ? 'text-red-300'
                      : 'text-amber-300'
                }`}
              >
                {nv.stage === 'done'
                  ? '✅ Rinnovo firmato'
                  : nv.stage === 'stalled'
                    ? '⏳ Sta prendendo tempo'
                    : nv.stage === 'leaving'
                      ? '🚪 Andrà via a scadenza'
                      : '❌ Tavolo saltato'}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold hover:border-zinc-400"
              >
                Chiudi
              </button>
            </div>
          )}
          {nv.stage === 'terms' && (
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={onClose}
                className="text-[11px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200"
              >
                alzati dal tavolo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
