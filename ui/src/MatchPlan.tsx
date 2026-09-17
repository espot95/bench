/**
 * PIANO PARTITA (richiesta utente, "user friendly + animazioni belle"): le
 * istruzioni di squadra — tipo di gioco, linea, marcatura, aggressività — e il
 * pannello PALLE INATTIVE (torri avversarie → marcature speciali, preventive,
 * battitori, capitano). Segmented control con cursore animato, linea difensiva
 * che SCIVOLA sul mini-campo, collegamenti delle marcature che si disegnano.
 */

import { useState } from 'react';
import { Help } from './Help';
import { Ic } from './Ic';
import {
  type GameSession,
  planView,
  setPieceView,
  setSpecialMark,
  updatePlan,
  updateSetPiece,
} from './game';

/** Segmented control col cursore che scivola. */
function Seg<T extends string>({
  value,
  options,
  onPick,
  accent,
}: {
  value: T;
  options: { id: T; label: string; icon?: string }[];
  onPick: (v: T) => void;
  accent: string;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  return (
    <div className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <div
        className="seg-thumb"
        style={{
          left: 3,
          width: `calc(${100 / options.length}% - 6px)`,
          transform: `translateX(calc(${idx * 100}% + ${idx * 6}px))`,
          background: accent,
        }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={o.id === value ? 'on' : ''}
          style={o.id === value ? { color: accent } : undefined}
          onClick={() => onPick(o.id)}
        >
          {o.icon && <Ic name={o.icon} fill={o.id === value} />} {o.label}
        </button>
      ))}
    </div>
  );
}

const LINE_Y: Record<string, number> = { alta: -34, media: 0, bassa: 26 };

export function MatchPlan({
  session,
  accent,
}: {
  session: GameSession;
  accent: string;
}) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [pickTower, setPickTower] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pv = planView(session);
  const sp = setPieceView(session);
  const card = 'rounded-xl border border-zinc-800 bg-zinc-950/50 p-3';

  const dangerColor = pv.lineDanger >= 55 ? '#ef4444' : pv.lineDanger >= 30 ? '#fbbf24' : '#34d399';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ---- Tipo di gioco ---- */}
      <div className={`anim-in ${card}`}>
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Tipo di gioco
          <Help text="Imponi TU lo stile della squadra. Se è diverso da quello del tuo allenatore lo interpreterà peggio (efficacia ridotta): il tecnico giusto conta. La barra sotto ogni stile è quanto la ROSA lo sa interpretare." />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pv.styles.map((st) => {
            const on = pv.plan.style === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  updatePlan(session, { style: on ? undefined : st.id });
                  refresh();
                }}
                className={`rounded-lg border p-2 text-left transition-all duration-200 ${
                  on ? 'scale-[1.03] bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-900'
                }`}
                style={on ? { borderColor: accent } : undefined}
              >
                <div className="text-xs font-bold" style={on ? { color: accent } : undefined}>
                  {st.label}
                  {st.isCoach && (
                    <span className="ml-1 text-[9px] font-normal text-zinc-500">
                      (il tuo tecnico)
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-zinc-800">
                  <div
                    className="gauge-fill h-full rounded"
                    style={{
                      width: `${st.fit}%`,
                      background: st.fit >= 70 ? '#34d399' : st.fit >= 50 ? '#a1a1aa' : '#52525b',
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
        {pv.plan.style === null && pv.coachStyle && (
          <p className="note-in mt-2 text-[11px] text-zinc-500">
            Nessuna imposizione: si gioca col {pv.coachStyle.label} del tuo allenatore.
          </p>
        )}
        {pv.friction && (
          <p className="note-in mt-2 text-[11px] text-amber-300/90">
            <Ic name="warning" /> Stile diverso da quello del tecnico: lo interpreterà peggio
            (−40%).
          </p>
        )}
      </div>

      {/* ---- Linea difensiva ---- */}
      <div className={`anim-in d1 ${card}`}>
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Linea difensiva
          <Help text="ALTA: recuperi il pallone più su (concedi meno tiri) ma la PROFONDITÀ ti punisce — il rischio scala con la velocità delle punte avversarie contro la tua linea (le corse mordono: un falcatore lanciato contro centrali lenti è un massacro). BASSA: concedi meno qualità ma la squadra si schiaccia. " />
        </div>
        <div className="flex items-center gap-4">
          {/* mini-campo con la linea che scivola */}
          <svg
            width={130}
            height={120}
            viewBox="0 0 130 120"
            role="img"
            aria-label="linea difensiva"
          >
            <rect width={130} height={120} rx={8} fill="#14532d" />
            <g
              className="line-slide"
              style={{ transform: `translateY(${LINE_Y[pv.plan.line]}px)` }}
            >
              <line
                x1={10}
                y1={78}
                x2={120}
                y2={78}
                stroke="#fafafa"
                strokeDasharray="4 4"
                opacity={0.6}
              />
              {[24, 52, 78, 106].map((x) => (
                <circle key={x} cx={x} cy={78} r={6} fill="#38bdf8" stroke="#09090b" />
              ))}
            </g>
            <circle cx={65} cy={22} r={6} fill="#f87171" stroke="#09090b" opacity={0.8} />
            <text x={65} y={12} textAnchor="middle" fontSize={7} fill="#fca5a5">
              le loro punte
            </text>
          </svg>
          <div className="flex-1">
            <Seg
              value={pv.plan.line}
              accent={accent}
              options={[
                { id: 'alta', label: 'Alta' },
                { id: 'media', label: 'Media' },
                { id: 'bassa', label: 'Bassa' },
              ]}
              onPick={(v) => {
                updatePlan(session, { line: v });
                refresh();
              }}
            />
            {pv.opponent && (
              <div className="mt-2 text-[11px] text-zinc-400">
                rischio profondità vs {pv.opponent}
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-800">
                  <div
                    className="gauge-fill h-full rounded"
                    style={{ width: `${Math.max(4, pv.lineDanger)}%`, background: dangerColor }}
                  />
                </div>
                <span style={{ color: dangerColor }} className="font-semibold">
                  {pv.lineDanger >= 55 ? 'ALTO' : pv.lineDanger >= 30 ? 'medio' : 'basso'}
                </span>{' '}
                {pv.plan.line === 'alta' && pv.lineDanger >= 55 && '— la pagherai in profondità'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Marcatura + aggressività ---- */}
      <div className={`anim-in d2 ${card}`}>
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Marcatura
          <Help text="A UOMO: duelli accesi (più contrasti e più cartellini dei tuoi) — rende se i tuoi difensori sanno marcare, si ritorce con difensori scarsi. A ZONA: stabile e neutra." />
        </div>
        <Seg
          value={pv.plan.marking}
          accent={accent}
          options={[
            { id: 'zona', label: 'A zona', icon: 'grid_view' },
            { id: 'uomo', label: 'A uomo', icon: 'person_pin_circle' },
          ]}
          onPick={(v) => {
            updatePlan(session, { marking: v });
            refresh();
          }}
        />
        {pv.plan.marking === 'uomo' && (
          <p
            className={`note-in mt-1.5 text-[11px] ${pv.markingGood ? 'text-emerald-300' : 'text-amber-300'}`}
          >
            {pv.markingGood
              ? 'La tua difesa sa marcare: l’uomo rende.'
              : 'Occhio: i tuoi difensori non sono marcatori — l’uomo può ritorcersi.'}
          </p>
        )}
        <div className="mt-3 mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Aggressività
          <Help text="CATTIVA: spezzi il ritmo e i duelli si accendono — ma i tuoi prendono più cartellini. MORBIDA: pochi falli, ritmo concesso. Occhio ai diffidati." />
        </div>
        <Seg
          value={pv.plan.aggression}
          accent={accent}
          options={[
            { id: 'morbida', label: 'Morbida' },
            { id: 'normale', label: 'Normale' },
            { id: 'cattiva', label: 'Cattiva' },
          ]}
          onPick={(v) => {
            updatePlan(session, { aggression: v });
            refresh();
          }}
        />
      </div>

      {/* ---- Palle inattive ---- */}
      <div className={`anim-in d3 ${card}`}>
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Palle inattive {sp.opponent ? `— vs ${sp.opponent}` : ''}
          <Help text="Le TORRI avversarie sono i loro pericoli aerei (altezza vera + fisico). Clicca una torre e poi un tuo marcatore per la MARCATURA SPECIALE (max 2): un buon accoppiamento la spegne. Lo SCHEMA vale per il resto della squadra. Le PREVENTIVE tengono 2 uomini dietro sui TUOI piazzati: meno ripartenze subite, una torre in meno in area." />
        </div>
        <Seg
          value={sp.scheme}
          accent={accent}
          options={[
            { id: 'zona', label: 'Zona' },
            { id: 'misto', label: 'Misto' },
            { id: 'uomo', label: 'Uomo' },
          ]}
          onPick={(v) => {
            updateSetPiece(session, { scheme: v });
            refresh();
          }}
        />
        {/* torri → marcatori */}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="mb-1 text-[10px] uppercase text-zinc-500">le loro torri</div>
            {sp.towers.map((tw) => {
              const pair = sp.special.find((x) => x.targetId === tw.id);
              const marker = pair ? sp.markers.find((m) => m.id === pair.markerId) : null;
              const picking = pickTower === tw.id;
              return (
                <button
                  key={tw.id}
                  type="button"
                  onClick={() => setPickTower(picking ? null : tw.id)}
                  className={`mb-1 flex w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left transition-all ${
                    picking
                      ? 'tower-pulse border-red-500 bg-red-950/40'
                      : marker
                        ? 'border-emerald-800 bg-emerald-950/20'
                        : 'border-zinc-800 hover:bg-zinc-900'
                  }`}
                >
                  <span className="text-red-300">🗼</span>
                  <span className="min-w-0 flex-1 truncate">
                    {tw.name} <span className="text-zinc-500">{tw.height}cm</span>
                  </span>
                  {marker ? (
                    <span className="link-draw shrink-0 text-emerald-300">⇄ {marker.name}</span>
                  ) : (
                    <span className="shrink-0 text-zinc-600">pericolo {tw.threat}</span>
                  )}
                </button>
              );
            })}
            {sp.towers.length === 0 && <p className="text-zinc-600">niente partita in vista</p>}
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase text-zinc-500">
              {pickTower ? 'scegli il marcatore' : 'i tuoi uomini d’area'}
            </div>
            {sp.markers.slice(0, 6).map((mk) => (
              <button
                key={mk.id}
                type="button"
                disabled={!pickTower}
                onClick={() => {
                  if (!pickTower) return;
                  const err = setSpecialMark(session, pickTower, mk.id);
                  setMsg(err || null);
                  setPickTower(null);
                  refresh();
                }}
                className={`mb-1 flex w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left transition-colors ${
                  pickTower
                    ? 'border-zinc-600 hover:border-emerald-600 hover:bg-zinc-800'
                    : 'border-zinc-800 opacity-70'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {mk.name} <span className="text-zinc-500">{mk.height}cm</span>
                </span>
                <span className="shrink-0 text-zinc-500">presidio {mk.def}</span>
              </button>
            ))}
          </div>
        </div>
        {sp.special.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sp.special.map((pair) => {
              const tw = sp.towers.find((x) => x.id === pair.targetId);
              return (
                <button
                  key={pair.targetId}
                  type="button"
                  onClick={() => {
                    setSpecialMark(session, pair.targetId, null);
                    refresh();
                  }}
                  className="rounded border border-emerald-800 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-zinc-800"
                  title="togli la marcatura speciale"
                >
                  {tw?.name ?? 'bersaglio'} ✕
                </button>
              );
            })}
          </div>
        )}
        {/* preventive + incarichi */}
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={sp.preventive}
            onChange={(e) => {
              updateSetPiece(session, { preventive: e.target.checked });
              refresh();
            }}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          Marcature preventive sui tuoi piazzati
          <span className="text-zinc-600">(meno ripartenze, una torre in meno)</span>
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          {(
            [
              ['takerId', 'Battitore', sp.takers, sp.takerId],
              ['penaltyTakerId', 'Rigorista', sp.shooters, sp.penaltyTakerId],
              ['captainId', 'Capitano', sp.captains, sp.captainId],
            ] as const
          ).map(([key, label, list, current]) => (
            <div key={key}>
              <div className="mb-0.5 text-[10px] uppercase text-zinc-500">{label}</div>
              <select
                value={current ?? ''}
                onChange={(e) => {
                  updateSetPiece(session, { [key]: e.target.value || undefined });
                  refresh();
                }}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1"
              >
                <option value="">auto</option>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {'leader' in p && p.leader ? ' ©' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <button
          type="button"
          onClick={() => setMsg(null)}
          className="toast-in col-span-full rounded-lg border border-zinc-600 bg-zinc-950/95 px-4 py-2 text-left text-sm hover:border-zinc-400"
        >
          {msg} ✕
        </button>
      )}
    </div>
  );
}
