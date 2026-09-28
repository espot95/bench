/**
 * DIRETTA (richiesta utente): la partita si GUARDA — XI di casa a sinistra, ospiti
 * a destra, campo con le pedine al centro, sopra la barra del momentum coi colori
 * delle due squadre e dentro la telecronaca. E dalla panchina si INTERVIENE:
 * sostituzioni e cambi tattici che contano davvero (finestre ricalcolate).
 */

import { useEffect, useRef, useState } from 'react';
import { Help } from './Help';
import { Ic } from './Ic';
import {
  type GameSession,
  type RoundResult,
  liveFinish,
  livePlayTo,
  liveSub,
  liveView,
} from './game';

/** Posizioni-pedina per ruolo (campo verticale 100×140, casa in basso). */
const ROLE_XY: Record<string, [number, number]> = {
  POR: [50, 128],
  DC: [50, 108],
  TD: [82, 104],
  TS: [18, 104],
  REG: [50, 88],
  MED: [38, 90],
  MC: [62, 88],
  TRQ: [50, 72],
  AD: [80, 70],
  AS: [20, 70],
  SP: [60, 62],
  PC: [50, 58],
};

function spot(role: string, index: number, isHome: boolean): [number, number] {
  const [bx, by] = ROLE_XY[role] ?? [50, 90];
  // Ruoli doppi (2 DC, 2 MC...): si distanziano attorno al punto-base.
  const dx = (index % 2 === 0 ? -1 : 1) * (index > 0 ? 10 + 4 * Math.floor(index / 2) : 0);
  const x = Math.max(8, Math.min(92, bx + dx));
  const y = isHome ? by : 140 - by;
  return [x, y];
}

function Pitch({
  home,
  away,
}: {
  home: { rows: { id: string; name: string; role: string; red?: boolean }[]; color: string };
  away: { rows: { id: string; name: string; role: string; red?: boolean }[]; color: string };
}) {
  const seen = new Map<string, number>();
  const tokens = (side: typeof home, isHome: boolean) =>
    side.rows.map((p) => {
      const k = `${isHome}-${p.role}`;
      const idx = seen.get(k) ?? 0;
      seen.set(k, idx + 1);
      const [x, y] = spot(p.role, idx, isHome);
      return { ...p, x, y };
    });
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" role="img" aria-label="campo">
      <rect x="0" y="0" width="100" height="140" fill="#14532d" rx="3" />
      {[10, 30, 50, 70, 90, 110, 130].map((y) => (
        <rect key={y} x="0" y={y - 10} width="100" height="10" fill="#166534" opacity="0.35" />
      ))}
      <rect x="2" y="2" width="96" height="136" fill="none" stroke="#ffffff55" strokeWidth="0.8" />
      <line x1="2" y1="70" x2="98" y2="70" stroke="#ffffff55" strokeWidth="0.8" />
      <circle cx="50" cy="70" r="10" fill="none" stroke="#ffffff55" strokeWidth="0.8" />
      <rect x="28" y="2" width="44" height="16" fill="none" stroke="#ffffff55" strokeWidth="0.8" />
      <rect
        x="28"
        y="122"
        width="44"
        height="16"
        fill="none"
        stroke="#ffffff55"
        strokeWidth="0.8"
      />
      {[[tokens(home, true), home.color] as const, [tokens(away, false), away.color] as const].map(
        ([tks, color], si) =>
          tks.map((t) => (
            <g key={t.id} opacity={t.red ? 0.25 : 1}>
              <circle cx={t.x} cy={t.y} r="3.4" fill={color} stroke="#000000aa" strokeWidth="0.6" />
              <text
                x={t.x}
                y={t.y + 6.4}
                textAnchor="middle"
                fontSize="2.9"
                fill="#ffffffcc"
                style={{ fontFamily: 'sans-serif' }}
              >
                {t.name.split(' ').at(-1)?.slice(0, 8)}
              </text>
              {si === 0 && t.role === 'POR' ? null : null}
            </g>
          )),
      )}
    </svg>
  );
}

export function LiveMatch({
  session,
  accent,
  onFinished,
}: {
  session: GameSession;
  accent: string;
  onFinished: (r: RoundResult) => void;
}) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [subOut, setSubOut] = useState<string | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const v = liveView(session);

  useEffect(() => {
    if (paused) return;
    timer.current = window.setInterval(() => {
      const cur = liveView(session);
      if (!cur || cur.minute >= 90) {
        window.clearInterval(timer.current);
        setPaused(true);
        return;
      }
      livePlayTo(session, Math.min(90, cur.minute + 1));
      setTick((t) => t + 1);
    }, 700 / speed);
    return () => window.clearInterval(timer.current);
  }, [paused, speed, session]);

  if (!v) return null;

  const userSide = v.userIsHome ? v.home : v.away;
  const momPct = 50 + v.momentum * 50; // 0 = tutto ospiti, 100 = tutto casa

  const doFinish = () => {
    const r = liveFinish(session);
    if (r) setResult(r);
  };

  const RowList = ({
    side,
    align,
  }: {
    side: typeof v.home;
    align: 'left' | 'right';
  }) => (
    <div className="w-44 shrink-0 space-y-0.5 text-[11px]">
      <div
        className={`mb-1 truncate font-bold ${align === 'right' ? 'text-right' : ''}`}
        style={{ color: side.accent }}
      >
        {side.name}
      </div>
      {side.rows.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={side !== userSide}
          onClick={() => {
            setPaused(true);
            setSubOut(p.id);
          }}
          className={`flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left ${
            align === 'right' ? 'flex-row-reverse text-right' : ''
          } ${side === userSide ? 'hover:bg-zinc-800' : 'cursor-default'} ${
            subOut === p.id ? 'bg-zinc-800 ring-1' : ''
          }`}
          title={side === userSide ? 'clicca per sostituirlo' : undefined}
        >
          <span className="w-8 shrink-0 rounded border border-zinc-700 bg-zinc-900 text-center text-[9px] font-bold text-zinc-400">
            {p.role}
          </span>
          <span className="min-w-0 flex-1 truncate text-zinc-300">{p.name}</span>
          <span className="shrink-0 space-x-0.5">
            {'⚽'.repeat(Math.min(3, p.goals))}
            {p.yellow && <span title="ammonito">🟨</span>}
            {p.red && <span title="espulso">🟥</span>}
            {p.on !== undefined && <span className="text-emerald-400">▲{p.on}′</span>}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* ---- Scoreboard + barra del momentum con la telecronaca dentro ---- */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
        <div className="mb-2 flex items-center justify-center gap-4 text-lg font-bold">
          <span style={{ color: v.home.accent }}>{v.home.name}</span>
          <span className="rounded-lg bg-zinc-900 px-3 py-1 text-2xl tabular-nums">
            {v.home.score} – {v.away.score}
          </span>
          <span style={{ color: v.away.accent }}>{v.away.name}</span>
          <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-sm tabular-nums text-zinc-300">
            {v.minute}′
          </span>
        </div>
        <div
          className="relative h-9 overflow-hidden rounded-lg border border-zinc-800"
          title="chi sta spingendo adesso"
        >
          <div
            className="absolute inset-y-0 left-0 transition-all duration-700"
            style={{ width: `${momPct}%`, background: `${v.home.color}66` }}
          />
          <div
            className="absolute inset-y-0 right-0 transition-all duration-700"
            style={{ width: `${100 - momPct}%`, background: `${v.away.color}66` }}
          />
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-sm font-semibold text-zinc-100 [text-shadow:0_1px_2px_#000]">
            {v.lastLine}
          </div>
        </div>
      </div>

      {/* ---- XI casa | campo | XI ospiti ---- */}
      <div className="flex justify-center gap-3">
        <RowList side={v.home} align="left" />
        <div className="h-[430px] w-[310px] shrink-0 overflow-hidden rounded-xl border border-zinc-800">
          <Pitch
            home={{ rows: v.home.rows, color: v.home.color }}
            away={{ rows: v.away.rows, color: v.away.color }}
          />
        </div>
        <RowList side={v.away} align="right" />
      </div>

      {/* ---- Controlli: ritmo, cambi, fischio ---- */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        {v.minute < 90 && (
          <>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="rounded-lg border px-4 py-1.5 font-bold"
              style={{ borderColor: accent, color: accent }}
            >
              <Ic name={paused ? 'play_arrow' : 'pause'} fill /> {paused ? 'Gioca' : 'Pausa'}
            </button>
            {[1, 2, 4].map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setSpeed(x)}
                className={`rounded border px-2 py-1 font-semibold ${
                  speed === x ? 'bg-zinc-800' : 'border-zinc-800 text-zinc-500'
                }`}
                style={speed === x ? { borderColor: accent, color: accent } : undefined}
              >
                ×{x}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                livePlayTo(session, 90);
                setPaused(true);
                refresh();
              }}
              className="rounded border border-zinc-700 px-3 py-1.5 font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              <Ic name="skip_next" /> Al 90′
            </button>
            <span className="rounded-full border border-zinc-800 px-2.5 py-1 text-zinc-500">
              cambi rimasti: <b className="text-zinc-200">{v.subsLeft}</b>
              <Help text="Metti in PAUSA, clicca chi vuoi togliere nella tua lista e poi chi entra dalla panchina. E i cambi TATTICI? Il Piano partita (linea, marcatura, aggressività, stile) si può cambiare dal Campo anche a gara in corso: la diretta lo applica dalla finestra successiva." />
            </span>
          </>
        )}
        {v.minute >= 90 && !result && (
          <button
            type="button"
            onClick={doFinish}
            className="rounded-lg border px-5 py-2 font-bold"
            style={{ borderColor: accent, color: accent }}
          >
            <Ic name="sports" /> Fischio finale
          </button>
        )}
      </div>

      {/* ---- Cambio in corso: chi entra? ---- */}
      {subOut && v.minute < 90 && (
        <div className="note-in mx-auto max-w-xl rounded-xl border border-zinc-700 bg-zinc-900/80 p-3 text-xs">
          <div className="mb-1.5 font-bold text-zinc-200">
            Chi entra al posto di {userSide.rows.find((r) => r.id === subOut)?.name}?
          </div>
          <div className="flex flex-wrap gap-1.5">
            {v.bench.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  if (liveSub(session, subOut, b.id)) setSubOut(null);
                  refresh();
                }}
                className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
              >
                <b className="mr-1 text-zinc-500">{b.role}</b>
                {b.name}
              </button>
            ))}
            {v.bench.length === 0 && <span className="text-zinc-500">panchina finita</span>}
            <button
              type="button"
              onClick={() => setSubOut(null)}
              className="ml-auto text-zinc-500 underline"
            >
              annulla
            </button>
          </div>
        </div>
      )}

      {/* ---- Il minuto per minuto ---- */}
      <div className="mx-auto max-h-40 max-w-2xl space-y-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
        {[...v.feed]
          .filter((f) => f.minute <= v.minute)
          .reverse()
          .map((f, i) => (
            <div key={`${f.minute}-${i}`} className="flex gap-2">
              <span className="w-8 shrink-0 text-right tabular-nums text-zinc-600">
                {f.minute}′
              </span>
              <span
                className="min-w-0 flex-1"
                style={{
                  color:
                    f.side === 'home'
                      ? v.home.accent
                      : f.side === 'away'
                        ? v.away.accent
                        : '#d4d4d8',
                }}
              >
                {f.text}
              </span>
            </div>
          ))}
      </div>

      {/* ---- Fischio finale: il verdetto ---- */}
      {result && (
        <div className="backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="modal-pop w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-center">
            <div className="text-xs uppercase tracking-widest text-zinc-500">finale</div>
            <div className="my-3 text-2xl font-bold">{result.scoreline}</div>
            <div className="mb-4 text-sm text-zinc-400">
              {result.position}ª in classifica dopo la giornata {result.round}
            </div>
            <button
              type="button"
              onClick={() => onFinished(result)}
              className="rounded-lg border px-5 py-2 font-bold"
              style={{ borderColor: accent, color: accent }}
            >
              Torna in città
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
