/**
 * LAVAGNA TATTICA (richiesta utente): due FASI (possesso/difesa) con pedine LIBERE
 * trascinabili — la fase difensiva definisce il modulo nominale per il motore.
 * Fit del punto (verde/ambra/rosso), frecce dei MOVIMENTI veri, pannello con ruoli
 * giocabili e radar delle abilità (senza numeri, senza stelle).
 */

import { useRef, useState } from 'react';
import { Ic } from './Ic';
import { Radar } from './Radar';
import {
  type BoardPhase,
  type GameSession,
  abilityAxesFor,
  applyPreset,
  boardSwap,
  boardView,
  deletePreset,
  matchupView,
  moveToken,
  presetList,
  resetFormation,
  savePreset,
} from './game';

const ROLE_COLOR: Record<string, string> = {
  GK: '#eab308',
  DF: '#38bdf8',
  MF: '#34d399',
  FW: '#f87171',
};

const FIT_COLOR: Record<string, string> = {
  verde: '#34d399',
  ambra: '#fbbf24',
  rosso: '#ef4444',
};

function surname(name: string): string {
  const parts = name.split(' ');
  return parts[parts.length - 1] ?? name;
}

/** Le FRECCE dei movimenti per archetipo e fase (path SVG relativi alla pedina). */
function arrowsFor(archetypeId: string, phase: BoardPhase, x: number, y: number): string[] {
  const inw = x > 180 ? -1 : 1; // verso il centro
  if (phase === 'possesso') {
    switch (archetypeId) {
      case 'gk-libero':
        return [`M ${x},${y - 20} L ${x},${y - 60}`];
      case 'df-impostazione':
        return [`M ${x},${y - 20} L ${x},${y - 65}`];
      case 'df-fascia-spinta':
        return [`M ${x},${y - 20} L ${x},${y - 135}`];
      case 'df-fascia-bloccato':
        return [`M ${x},${y - 20} L ${x},${y - 55}`];
      case 'mf-regista':
        return [`M ${x},${y + 18} L ${x},${y + 48}`];
      case 'mf-mezzala':
        return [`M ${x},${y - 18} Q ${x + inw * 30},${y - 70} ${x + inw * 55},${y - 112}`];
      case 'mf-tuttocampista':
        return [`M ${x},${y - 18} L ${x},${y - 100}`];
      case 'mf-trequartista':
        return [`M ${x},${y - 16} Q ${x + inw * 40},${y - 30} ${x + inw * 55},${y - 20}`];
      case 'fw-punta-area':
        return [`M ${x},${y - 16} Q ${x - inw * 48},${y - 58} ${x},${y - 105}`];
      case 'fw-seconda-punta':
        return [
          `M ${x},${y - 14} C ${x},${y + 22} ${x + inw * 45},${y - 55} ${x + inw * 22},${y - 105}`,
        ];
      case 'fw-falso-nove':
        return [`M ${x},${y + 16} L ${x},${y + 66}`];
      case 'fw-boa':
        return [`M ${x},${y + 16} L ${x},${y + 42}`];
      case 'fw-ala-invertita':
        return [`M ${x},${y - 16} L ${x + inw * 70},${y - 88}`];
      case 'fw-ala-fascia':
        return [`M ${x},${y - 18} L ${x},${y - 118}`];
      default:
        return [];
    }
  }
  switch (archetypeId) {
    case 'df-marcatore':
      return [`M ${x},${y - 18} L ${x},${y - 42}`];
    case 'df-fascia-spinta':
      return [`M ${x},${y + 18} L ${x},${y + 88}`];
    case 'df-fascia-bloccato':
      return [`M ${x},${y} L ${x + inw * 38},${y}`];
    case 'mf-mediano':
      return [`M ${x - 8},${y} L ${x - 46},${y}`, `M ${x + 8},${y} L ${x + 46},${y}`];
    case 'mf-mezzala':
      return [`M ${x},${y + 18} L ${x},${y + 62}`];
    case 'mf-tuttocampista':
      return [`M ${x},${y + 18} L ${x},${y + 74}`];
    case 'mf-trequartista':
    case 'fw-seconda-punta':
    case 'fw-falso-nove':
      return [`M ${x},${y - 16} L ${x},${y - 42}`];
    case 'fw-ala-invertita':
    case 'fw-ala-fascia':
      return [`M ${x},${y + 18} L ${x},${y + 96}`];
    default:
      return [];
  }
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
  const [phase, setPhase] = useState<BoardPhase>('difesa');
  const [showArrows, setShowArrows] = useState(true);
  const [selected, setSelected] = useState<{ kind: 'xi' | 'bench'; id: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fv = boardView(session);
  const presets = presetList(session);
  const duel = matchupView(session);

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 180, y: 260 };
    return { x: ((e.clientX - r.left) * 360) / r.width, y: ((e.clientY - r.top) * 520) / r.height };
  };

  // Il punto di partenza del drag: un semplice CLICK (sotto la soglia) seleziona
  // e basta — prima spostava la pedina dal suo centro al punto cliccato.
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const onTokenDown = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSelected({ kind: 'xi', id });
    dragStart.current = toLocal(e);
    setDrag({ id, ...toLocal(e) });
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag) setDrag({ id: drag.id, ...toLocal(e) });
  };
  const onUp = () => {
    if (!drag) return;
    const start = dragStart.current;
    dragStart.current = null;
    // Soglia anti-click (~5 unità di lavagna ≈ 4-5 px): sotto, è una selezione.
    const moved = !start || Math.hypot(drag.x - start.x, drag.y - start.y) > 5;
    if (moved) {
      const err = moveToken(session, phase, drag.id, drag.x, drag.y);
      setMsg(err || null);
    }
    setDrag(null);
    refresh();
  };
  /** Uscire dal campo ANNULLA il trascinamento (niente commit su un bordo). */
  const onLeave = () => {
    dragStart.current = null;
    setDrag(null);
  };

  const clickBench = (id: string) => {
    if (selected?.kind === 'xi') {
      const err = boardSwap(session, selected.id, id);
      setMsg(err || null);
      setSelected(err ? selected : { kind: 'xi', id });
      refresh();
      return;
    }
    setSelected({ kind: 'bench', id });
  };

  const selXi = selected?.kind === 'xi' ? fv.xi.find((p) => p.id === selected.id) : null;
  const selBench = selected?.kind === 'bench' ? fv.bench.find((b) => b.id === selected.id) : null;
  const panel = selXi
    ? {
        id: selXi.id,
        name: selXi.name,
        band: selXi.band,
        archetype: selXi.archetype,
        roles: [selXi.roles.primary, ...selXi.roles.others],
        running: selXi.running,
        fit: selXi.fit[phase],
      }
    : selBench
      ? {
          id: selBench.id,
          name: selBench.name,
          band: selBench.band,
          archetype: selBench.archetype,
          roles: selBench.rolesLabel.split(' · '),
          running: selBench.running,
          fit: null,
        }
      : null;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="relative">
        {/* fasi + frecce + moduli */}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              ['possesso', 'sports_soccer', 'Possesso'],
              ['difesa', 'shield', 'Difesa'],
            ] as const
          ).map(([ph, icon, label]) => (
            <button
              key={ph}
              type="button"
              onClick={() => setPhase(ph)}
              className={`rounded-lg border px-2.5 py-1 font-semibold ${
                phase === ph ? 'bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-800/60'
              }`}
              style={phase === ph ? { borderColor: accent, color: accent } : undefined}
            >
              <Ic name={icon} fill={phase === ph} /> {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowArrows((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 ${showArrows ? 'border-zinc-500 text-zinc-200' : 'border-zinc-800 text-zinc-500'}`}
            title="mostra i movimenti veri dei giocatori"
          >
            <Ic name="conversion_path" /> movimenti
          </button>
          <span className="ml-auto text-zinc-400">
            difesa <b className="text-zinc-200">{fv.modules.difesa}</b> · possesso{' '}
            <b className="text-zinc-200">{fv.modules.possesso}</b>
          </span>
        </div>
        <svg
          ref={svgRef}
          width={360}
          height={520}
          viewBox="0 0 360 520"
          role="img"
          aria-label="lavagna tattica"
          className="touch-none select-none rounded-xl"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onLeave}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 7 3.5, 0 7" fill="#fafafa" opacity="0.85" />
            </marker>
          </defs>
          <rect width={360} height={520} fill={phase === 'possesso' ? '#14532d' : '#1e3a5f'} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect
              key={i}
              y={i * 74.3}
              width={360}
              height={37.15}
              fill={phase === 'possesso' ? '#166534' : '#1e40739e'}
              opacity={0.5}
            />
          ))}
          {/* bande di zona (guida leggera) */}
          <g fill="#fafafa" opacity={0.04}>
            <rect y={0} width={360} height={195} />
            <rect y={330} width={360} height={115} />
          </g>
          <g stroke="#e7e5e4" strokeWidth={1.6} opacity={0.6} fill="none">
            <rect x={8} y={8} width={344} height={504} />
            <line x1={8} y1={260} x2={352} y2={260} />
            <circle cx={180} cy={260} r={42} />
            <rect x={90} y={8} width={180} height={62} />
            <rect x={138} y={8} width={84} height={26} />
            <rect x={90} y={450} width={180} height={62} />
            <rect x={138} y={486} width={84} height={26} />
          </g>
          {/* frecce dei movimenti */}
          {showArrows &&
            fv.xi.map((p) => {
              const c = drag?.id === p.id ? drag : p.coord[phase];
              return arrowsFor(p.archetypeId, phase, c.x, c.y).map((d) => (
                <path
                  key={`${p.id}-${d}`}
                  d={d}
                  fill="none"
                  stroke="#fafafa"
                  strokeWidth={1.7}
                  strokeDasharray="5 4"
                  opacity={0.55}
                  markerEnd="url(#arrowhead)"
                />
              ));
            })}
          {/* pedine */}
          {fv.xi.map((p) => {
            const c = drag?.id === p.id ? drag : p.coord[phase];
            const sel = selected?.kind === 'xi' && selected.id === p.id;
            return (
              <g
                key={p.id}
                onPointerDown={(e) => onTokenDown(p.id, e)}
                style={{ cursor: 'grab' }}
                opacity={p.unavailable ? 0.55 : 1}
              >
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={19}
                  fill="none"
                  stroke={FIT_COLOR[p.fit[phase]] ?? '#a1a1aa'}
                  strokeWidth={sel ? 3.5 : 2}
                  opacity={sel ? 1 : 0.9}
                />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={14}
                  fill={ROLE_COLOR[p.slot] ?? '#a1a1aa'}
                  stroke="#09090b"
                  strokeWidth={1.5}
                />
                <text
                  x={c.x}
                  y={c.y + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={800}
                  fill="#09090b"
                >
                  {p.roles.primary}
                </text>
                {p.unavailable && (
                  <text x={c.x - 24} y={c.y - 14} fontSize={11} fill="#f87171">
                    🚑
                  </text>
                )}
                <text
                  x={c.x}
                  y={c.y + 30}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="#fafafa"
                  style={{ paintOrder: 'stroke', stroke: '#09090b', strokeWidth: 2.5 }}
                >
                  {surname(p.name)}
                </text>
              </g>
            );
          })}
        </svg>
        {msg && (
          <button
            type="button"
            onClick={() => setMsg(null)}
            className="toast-in absolute left-1/2 top-10 w-[92%] -translate-x-1/2 rounded-lg border border-zinc-600 bg-zinc-950/95 px-3 py-1.5 text-left text-xs backdrop-blur hover:border-zinc-400"
          >
            {msg} ✕
          </button>
        )}
        {/* il duello di giornata: il pericolo loro, il tuo uomo consigliato */}
        {duel && (
          <div className="anim-in mt-2 max-w-[360px] rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs">
            <div className="font-bold text-red-300">
              <Ic name="swords" /> Duello di giornata — {duel.home ? 'vs' : '@'} {duel.opponent}
            </div>
            <div className="mt-0.5 text-zinc-300">
              Occhio a <b>{duel.attacker.name}</b>{' '}
              <span className="text-zinc-500">
                ({duel.attacker.archetype} · {duel.attacker.running})
              </span>
            </div>
            <div className="mt-0.5 text-zinc-300">
              Il tuo uomo: <b style={{ color: accent }}>{duel.marker.name}</b>{' '}
              <span className="text-zinc-500">({duel.marker.running})</span>
              {!duel.marker.inXI && (
                <span className="ml-1 font-semibold text-amber-300">— è in panchina!</span>
              )}
            </div>
          </div>
        )}
        {/* lavagne salvate */}
        <div className="mt-2 flex max-w-[360px] flex-wrap items-center gap-1.5 text-xs">
          {presets.map((p) => (
            <span
              key={p.name}
              className="flex items-center overflow-hidden rounded-lg border border-zinc-700"
            >
              <button
                type="button"
                onClick={() => {
                  setMsg(applyPreset(session, p.name));
                  refresh();
                }}
                className="px-2 py-1 font-semibold hover:bg-zinc-800"
                title={`richiama (${p.module})`}
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMsg(deletePreset(session, p.name));
                  refresh();
                }}
                className="border-l border-zinc-700 px-1.5 py-1 text-zinc-500 hover:bg-zinc-800"
                title="cancella"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              const name = window.prompt('Nome della lavagna (es. anti-catenaccio):');
              if (name) {
                setMsg(savePreset(session, name));
                refresh();
              }
            }}
            className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
            title="salva XI e posizioni correnti (max 3)"
          >
            <Ic name="bookmark_add" /> salva lavagna
          </button>
        </div>
        <p className="mt-1.5 max-w-[360px] text-[11px] leading-relaxed text-zinc-600">
          Trascina le pedine: la <b>fase difensiva</b> definisce il modulo che il motore usa per i
          ruoli. Anello <b style={{ color: FIT_COLOR.verde }}>verde</b> = casa sua,{' '}
          <b style={{ color: FIT_COLOR.ambra }}>ambra</b> = adattato,{' '}
          <b style={{ color: FIT_COLOR.rosso }}>rosso</b> = snaturato.
        </p>
      </div>

      <div className="min-w-[280px] max-w-[360px] flex-1">
        {/* pannello del selezionato: ruoli giocabili + radar abilità */}
        {panel && (
          <div className="anim-in mb-3 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <b>{panel.name}</b>
              <span className="rounded-full border border-emerald-700/60 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                {panel.band}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-zinc-400">
              {panel.archetype} · corsa: {panel.running}
            </div>
            <div className="mt-1.5 text-sm">
              <span className="text-xs uppercase tracking-wide text-zinc-500">ruoli </span>
              {panel.roles.map((r, i) => (
                <span
                  key={r}
                  className={`mr-1 rounded border px-1.5 py-0.5 text-xs ${
                    i === 0
                      ? 'border-emerald-700 font-bold text-emerald-300'
                      : 'border-zinc-700 text-zinc-300'
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
            <div className="mt-1 flex justify-center">
              <Radar metrics={abilityAxesFor(session, panel.id)} color={accent} size={200} />
            </div>
            {selected?.kind === 'bench' && (
              <p className="text-center text-[11px] text-zinc-500">
                clicca una pedina in campo per farlo entrare al suo posto
              </p>
            )}
          </div>
        )}

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
            panchina
          </span>
          <button
            type="button"
            onClick={() => {
              setMsg(resetFormation(session));
              setSelected(null);
              refresh();
            }}
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
            title="torna a XI e posizioni dell'allenatore"
          >
            <Ic name="restart_alt" /> lavagna dell'allenatore
          </button>
        </div>
        <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1">
          {fv.bench.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => clickBench(b.id)}
              disabled={b.unavailable}
              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-45 ${
                selected?.kind === 'bench' && selected.id === b.id
                  ? 'border-emerald-600 bg-zinc-800'
                  : selected?.kind === 'xi'
                    ? 'border-zinc-600 hover:bg-zinc-800'
                    : 'border-zinc-800 hover:bg-zinc-900'
              }`}
              title={b.unavailable ? 'indisponibile' : `${b.archetype} · ${b.band}`}
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ background: ROLE_COLOR[b.pos] ?? '#a1a1aa' }}
              />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              <span className="shrink-0 text-xs font-semibold text-zinc-400">{b.rolesLabel}</span>
              {b.unavailable && <span className="shrink-0 text-xs">🚑</span>}
            </button>
          ))}
        </div>
        {fv.problems.length > 0 && <p className="mt-2 text-xs text-red-400">⚠ {fv.problems[0]}</p>}
      </div>
    </div>
  );
}
