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
  liveCancelSub,
  liveFinish,
  livePlayTo,
  liveSub,
  liveView,
} from './game';

/**
 * Posizioni-pedina: ogni squadra si dispone PER LINEE secondo il suo modulo vero
 * (GK/DF/MF/FW dagli slot dello schieramento, distribuiti equidistanti — un 4-3-3
 * si VEDE 4-3-3); la squadra dell'utente, se ha la lavagna tattica, usa le SUE
 * posizioni disegnate (fase difensiva), coi subentrati che cadono sulla linea.
 */
/** Linee del modulo TUTTE nella propria metà campo (mezzeria a 70). */
const LINE_Y_HOME: Record<string, number> = { GK: 130, DF: 112, MF: 94, FW: 76 };

interface PitchRow {
  id: string;
  name: string;
  role: string;
  line: string;
  bx?: number | null;
  by?: number | null;
  red?: boolean;
}

function layoutSide(rows: PitchRow[], isHome: boolean): (PitchRow & { x: number; y: number })[] {
  // Prima le posizioni della lavagna (360×520, porta propria in basso)...
  const placed = rows.map((p) => {
    if (p.bx !== null && p.bx !== undefined && p.by !== null && p.by !== undefined) {
      const px = isHome ? 8 + (p.bx / 360) * 84 : 92 - (p.bx / 360) * 84;
      const py = isHome ? 72 + (p.by / 520) * 61 : 68 - (p.by / 520) * 61;
      return { ...p, x: px, y: py };
    }
    return { ...p, x: -1, y: -1 };
  });
  // ...poi le LINEE del modulo per chi non ha un punto suo (o tutta la squadra AI).
  for (const line of ['GK', 'DF', 'MF', 'FW']) {
    const inLine = placed.filter((p) => p.line === line);
    const free = inLine.filter((p) => p.x < 0);
    if (free.length === 0) continue;
    const yBase = LINE_Y_HOME[line] ?? 85;
    const y = isHome ? yBase : 140 - yBase;
    free.forEach((p, i) => {
      p.x = Math.max(10, Math.min(90, ((i + 1) * 100) / (free.length + 1)));
      p.y = y;
    });
  }
  return placed;
}

function Pitch({
  home,
  away,
}: {
  home: { rows: PitchRow[]; color: string };
  away: { rows: PitchRow[]; color: string };
}) {
  const tokens = (side: typeof home, isHome: boolean) => layoutSide(side.rows, isHome);
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
        ([tks, color]) =>
          tks.map((t) => (
            <g key={t.id} opacity={t.red ? 0.25 : 1}>
              <circle cx={t.x} cy={t.y} r="3.2" fill={color} stroke="#000000aa" strokeWidth="0.6" />
              <text
                x={t.x}
                y={t.y + 6}
                textAnchor="middle"
                fontSize="2.6"
                fill="#ffffffcc"
                style={{ fontFamily: 'sans-serif' }}
              >
                {t.name.split(' ').at(-1)?.slice(0, 9)}
              </text>
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
          disabled={side !== userSide || v.minute >= 90}
          onClick={() => {
            setPaused(true);
            setSubOut(subOut === p.id ? null : p.id);
          }}
          className={`flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left ${
            align === 'right' ? 'flex-row-reverse text-right' : ''
          } ${side === userSide ? 'hover:bg-zinc-800' : 'cursor-default'} ${
            subOut === p.id ? 'bg-zinc-800 ring-1 ring-amber-400' : ''
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
      {/* La PANCHINA vive sotto la tua colonna, SEMPRE visibile (fix: prima
          esisteva solo nel pannello del cambio e "spariva" dopo il primo). */}
      {side === userSide && (
        <div className="pt-2">
          <div
            className={`mb-1 text-[9px] font-bold uppercase tracking-widest ${
              subOut ? 'text-amber-300' : 'text-zinc-600'
            } ${align === 'right' ? 'text-right' : ''}`}
          >
            {subOut ? 'Chi entra?' : `Panchina · ${v.subsLeft} cambi`}
          </div>
          {/* Il cartello del quarto uomo: annunciato, entra all'interruzione. */}
          {v.pending.map((ps) => (
            <div
              key={ps.outId}
              className="mb-0.5 flex items-center gap-1 rounded border border-amber-700/60 bg-amber-950/30 px-1.5 py-0.5 text-[10px] text-amber-200"
            >
              <Ic name="swap_vert" />
              <span className="min-w-0 flex-1 truncate">
                {ps.inName} ▸ per {ps.outName} — alla prossima interruzione
              </span>
              <button
                type="button"
                className="shrink-0 underline"
                onClick={() => {
                  liveCancelSub(session, ps.outId);
                  refresh();
                }}
              >
                annulla
              </button>
            </div>
          ))}
          {v.bench.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={!subOut || v.minute >= 90 || v.subsLeft <= 0}
              onClick={() => {
                if (subOut && liveSub(session, subOut, b.id)) setSubOut(null);
                refresh();
              }}
              className={`flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left ${
                align === 'right' ? 'flex-row-reverse text-right' : ''
              } ${
                subOut
                  ? 'text-zinc-200 ring-1 ring-zinc-700 hover:bg-amber-950/40'
                  : 'text-zinc-500'
              }`}
              title={subOut ? 'entra lui' : 'prima clicca chi esce'}
            >
              <span className="w-8 shrink-0 rounded border border-zinc-800 bg-zinc-950 text-center text-[9px] font-bold text-zinc-500">
                {b.role}
              </span>
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
            </button>
          ))}
          {v.bench.length === 0 && <div className="text-zinc-600">panchina finita</div>}
        </div>
      )}
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
              <Help text="Clicca chi esce nella tua lista e poi chi entra dalla panchina: il cambio viene ANNUNCIATO al quarto uomo ed entra alla prossima interruzione di gioco (un fallo, una rimessa, un evento — di solito 1-3 minuti). Finché il gioco non si ferma puoi annullarlo. E i cambi TATTICI? Il Piano partita (linea, marcatura, aggressività, stile) si può cambiare anche a gara in corso: la diretta lo applica dalla finestra successiva." />
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
