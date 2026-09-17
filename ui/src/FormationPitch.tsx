/**
 * FORMAZIONE (richiesta utente): il campo virtuale con le PEDINE colorate per
 * reparto + la panchina. v1: slot fissi (4-4-2), l'utente decide CHI — click su
 * una pedina, poi click su un'altra (scambio) o su un panchinaro (entra).
 */

import { useState } from 'react';
import { Ic } from './Ic';
import { type GameSession, formationSwap, formationView, resetFormation } from './game';

/** Colori delle pedine per REPARTO (fissi, mai i colori del club). */
const ROLE_COLOR: Record<string, string> = {
  GK: '#eab308',
  DF: '#38bdf8',
  MF: '#34d399',
  FW: '#f87171',
};

const ROW_Y: Record<string, number> = { GK: 465, DF: 375, MF: 245, FW: 115 };

function surname(name: string): string {
  const parts = name.split(' ');
  return parts[parts.length - 1] ?? name;
}

export function FormationPitch({
  session,
  accent,
}: {
  session: GameSession;
  accent: string;
}) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [selected, setSelected] = useState<number | null>(null); // slotIndex
  const [msg, setMsg] = useState<string | null>(null);
  const fv = formationView(session);

  // Coordinate degli slot: righe per reparto, spalmate in orizzontale.
  const byRow = new Map<string, number[]>();
  for (const p of fv.xi) {
    if (!p) continue;
    byRow.set(p.slot, [...(byRow.get(p.slot) ?? []), p.slotIndex]);
  }
  const coord = (slotIndex: number, slot: string): { x: number; y: number } => {
    const row = byRow.get(slot) ?? [slotIndex];
    const i = row.indexOf(slotIndex);
    return { x: (360 * (i + 1)) / (row.length + 1), y: ROW_Y[slot] ?? 300 };
  };

  const clickSlot = (slotIndex: number) => {
    if (selected === null) {
      setSelected(slotIndex);
      return;
    }
    if (selected === slotIndex) {
      setSelected(null);
      return;
    }
    const targetId = fv.xi[slotIndex]?.id;
    if (targetId) {
      const err = formationSwap(session, selected, targetId);
      setMsg(err || null);
    }
    setSelected(null);
    refresh();
  };

  const clickBench = (playerId: string) => {
    if (selected === null) {
      setMsg('Prima scegli la pedina in campo da sostituire, poi chi entra.');
      return;
    }
    const err = formationSwap(session, selected, playerId);
    setMsg(err || null);
    setSelected(null);
    refresh();
  };

  return (
    <div className="flex flex-wrap items-start gap-5">
      {/* il campo */}
      <div className="relative">
        <svg
          width={360}
          height={520}
          viewBox="0 0 360 520"
          role="img"
          aria-label="campo con la formazione"
          className="rounded-xl"
        >
          {/* prato con fasce di taglio */}
          <rect width={360} height={520} fill="#14532d" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} y={i * 74.3} width={360} height={37.15} fill="#166534" opacity={0.5} />
          ))}
          {/* linee */}
          <g stroke="#e7e5e4" strokeWidth={1.6} opacity={0.65} fill="none">
            <rect x={8} y={8} width={344} height={504} />
            <line x1={8} y1={260} x2={352} y2={260} />
            <circle cx={180} cy={260} r={42} />
            <rect x={90} y={8} width={180} height={62} />
            <rect x={138} y={8} width={84} height={26} />
            <rect x={90} y={450} width={180} height={62} />
            <rect x={138} y={486} width={84} height={26} />
          </g>
          {/* le pedine */}
          {fv.xi.map((p) => {
            if (!p) return null;
            const { x, y } = coord(p.slotIndex, p.slot);
            const sel = selected === p.slotIndex;
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: interazione via click sulle pedine SVG
              <g
                key={p.slotIndex}
                onClick={() => clickSlot(p.slotIndex)}
                style={{ cursor: 'pointer' }}
                opacity={p.unavailable ? 0.55 : 1}
              >
                {sel && <circle cx={x} cy={y} r={22} fill="none" stroke={accent} strokeWidth={3} />}
                <circle
                  cx={x}
                  cy={y}
                  r={16}
                  fill={ROLE_COLOR[p.slot] ?? '#a1a1aa'}
                  stroke="#09090b"
                  strokeWidth={2}
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={800}
                  fill="#09090b"
                >
                  {p.slot}
                </text>
                {p.offRole && (
                  <text x={x + 14} y={y - 12} fontSize={11} fontWeight={900} fill="#fbbf24">
                    !
                  </text>
                )}
                {p.unavailable && (
                  <text x={x - 22} y={y - 12} fontSize={11} fill="#f87171">
                    🚑
                  </text>
                )}
                <text
                  x={x}
                  y={y + 30}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="#fafafa"
                  style={{ paintOrder: 'stroke', stroke: '#09090b', strokeWidth: 2.5 }}
                >
                  {surname(p.name)}
                </text>
                <text
                  x={x}
                  y={y + 41}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#fbbf24"
                  style={{ paintOrder: 'stroke', stroke: '#09090b', strokeWidth: 2 }}
                >
                  {p.stars}
                </text>
              </g>
            );
          })}
        </svg>
        {msg && (
          <button
            type="button"
            onClick={() => setMsg(null)}
            className="toast-in absolute left-1/2 top-2 w-[92%] -translate-x-1/2 rounded-lg border border-zinc-600 bg-zinc-950/95 px-3 py-1.5 text-left text-xs backdrop-blur hover:border-zinc-400"
          >
            {msg} ✕
          </button>
        )}
      </div>

      {/* la panchina */}
      <div className="min-w-[260px] flex-1">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
            panchina — {selected !== null ? 'scegli chi entra' : 'seleziona prima una pedina'}
          </span>
          <button
            type="button"
            onClick={() => {
              setMsg(resetFormation(session));
              setSelected(null);
              refresh();
            }}
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
            title="torna all'XI scelto dall'allenatore"
          >
            <Ic name="restart_alt" /> XI dell'allenatore
          </button>
        </div>
        <div className="space-y-1">
          {fv.bench.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => clickBench(b.id)}
              disabled={b.unavailable}
              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-45 ${
                selected !== null
                  ? 'border-zinc-600 hover:bg-zinc-800'
                  : 'border-zinc-800 hover:bg-zinc-900'
              }`}
              title={b.unavailable ? 'indisponibile: infortunio, squalifica o fuori lista' : b.band}
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ background: ROLE_COLOR[b.pos] ?? '#a1a1aa' }}
              />
              <span className="min-w-0 flex-1 truncate">
                {b.name}
                <span className="ml-1.5 text-xs text-zinc-500">{b.archetype}</span>
              </span>
              <span className="shrink-0 text-xs text-amber-300/90">{b.stars}</span>
              {b.unavailable && <span className="shrink-0 text-xs">🚑</span>}
            </button>
          ))}
        </div>
        {fv.problems.length > 0 && <p className="mt-2 text-xs text-red-400">⚠ {fv.problems[0]}</p>}
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
          Pedine per reparto: <b style={{ color: ROLE_COLOR.GK }}>portiere</b> ·{' '}
          <b style={{ color: ROLE_COLOR.DF }}>difesa</b> ·{' '}
          <b style={{ color: ROLE_COLOR.MF }}>centrocampo</b> ·{' '}
          <b style={{ color: ROLE_COLOR.FW }}>attacco</b>. Il <b className="text-amber-300">!</b>{' '}
          segnala un giocatore fuori ruolo.
        </p>
      </div>
    </div>
  );
}
