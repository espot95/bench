/**
 * ATELIER DELLE DIVISE (MODULE_STADIUM §3.4, punto E — richiesta utente): editor
 * della maglia con anteprima SVG viva, trama caricata da file locale (ridotta e
 * compressa nel salvataggio), proposte dello sponsor tecnico, lancio col verdetto
 * della piazza e archivio delle annate da rievocare.
 */

import { useId, useRef, useState } from 'react';
import type {
  KitDecal,
  KitDecalShape,
  KitDesign,
  KitPattern,
  KitStyle,
} from '../../src/core/types';
import { Help } from './Help';
import { Ic } from './Ic';
import { type GameSession, kitAtelierView, kitFidelity, launchKit } from './game';

const PATTERN_LABEL: Record<KitPattern, string> = {
  tinta: 'Tinta unita',
  palato: 'Strisce larghe',
  palatoSottile: 'Strisce sottili',
  fasciato: 'Fasciato',
  fasciaUnica: 'Fascia unica',
  sash: 'Sash',
  bandaSottile: 'Banda sottile',
  mezzo: 'Mezzo',
  quarti: 'Quarti',
  croce: 'Croce',
  scacchi: 'Scacchi',
  rombi: 'Rombi',
  vstorica: 'V storica',
  sfumato: 'Sfumato',
  spallato: 'Spallato ’98',
  palaCentrale: 'Striscia centrale',
  gessato: 'Gessato',
  cerchiato: 'Cerchiato',
  diagonaleDoppia: 'Doppia diagonale',
  metaOrizzontale: 'Metà orizzontale',
  geometrico90: 'Geometrico ’90',
  saetta: 'Saetta ’91',
  onda: 'Onda',
  doppiaV: 'Doppia V',
};

const STYLE_LABEL: Record<KitStyle, string> = {
  storico: 'Storico',
  creativo: 'Creativo',
  moderno: 'Moderno',
};

/** Le forme piazzabili: path centrati sull'origine, raggio ~6 unità di viewBox. */
const DECAL_D: Record<KitDecalShape, string> = {
  stella:
    'M0,-6 L1.76,-1.85 L6,-1.85 L2.85,0.7 L3.7,5 L0,2.5 L-3.7,5 L-2.85,0.7 L-6,-1.85 L-1.76,-1.85 Z',
  cerchio: 'M0,-6 A6,6 0 1,0 0,6 A6,6 0 1,0 0,-6 Z',
  rombo: 'M0,-6 L6,0 L0,6 L-6,0 Z',
  triangolo: 'M0,-6 L6,5 L-6,5 Z',
  cuore: 'M0,5 C-7,-1 -5,-7 0,-3 C5,-7 7,-1 0,5 Z',
  fulmine: 'M1.5,-6 L-3.5,1 L-0.5,1 L-1.5,6 L3.5,-1 L0.5,-1 Z',
  croce:
    'M-1.8,-6 L1.8,-6 L1.8,-1.8 L6,-1.8 L6,1.8 L1.8,1.8 L1.8,6 L-1.8,6 L-1.8,1.8 L-6,1.8 L-6,-1.8 L-1.8,-1.8 Z',
  mezzaluna: 'M2,-5.5 A6,6 0 1,0 2,5.5 A4.6,4.6 0 1,1 2,-5.5 Z',
  strisciaCorta: 'M-8,-2 L8,-2 L8,2 L-8,2 Z',
};

const DECAL_LABEL: Record<KitDecalShape, string> = {
  stella: 'Stella',
  cerchio: 'Cerchio',
  rombo: 'Rombo',
  triangolo: 'Triangolo',
  cuore: 'Cuore',
  fulmine: 'Fulmine',
  croce: 'Croce',
  mezzaluna: 'Mezzaluna',
  strisciaCorta: 'Striscia corta',
};

const MAX_DECALS = 8;

/**
 * La maglia 2D "da album" (richiesta utente: come le maglie di fantacalcio.it):
 * vista frontale piatta, sagoma classica con maniche a 45°, colori netti, collo
 * tondo col bordino, polsini, contorno pulito e un velo di lucido verticale.
 */
export function KitShirt({
  design,
  size = 96,
  sponsor,
  selectedDecal = null,
}: {
  design: KitDesign;
  size?: number;
  sponsor?: string | null;
  /** Editor: indice della forma selezionata (anello tratteggiato attorno). */
  selectedDecal?: number | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (k: string) => `kit-${k}-${uid}`;
  const d = design;

  // Sagoma classica (viewBox 100×92): spalle, maniche corte in giù, corpo, orlo.
  const shirt =
    'M34,5 C38,12 62,12 66,5 L79,10 L97,30 C98,31.5 98,33 97,34.5 L89,44 ' +
    'C88,45.2 86.5,45.4 85.2,44.6 L75,38 L75,81 C75,85 72,87 68,87 L32,87 ' +
    'C28,87 25,85 25,81 L25,38 L14.8,44.6 C13.5,45.4 12,45.2 11,44 L3,34.5 ' +
    'C2,33 2,31.5 3,30 L21,10 Z';
  // Corpo (senza maniche): dove vivono pattern, trama e sponsor.
  const body = 'M25,10 L75,10 L75,81 C75,85 72,87 68,87 L32,87 C28,87 25,85 25,81 Z';
  const sleeveL = 'M25,9 L25,40 L13,47 L1,32.5 L21,9 Z';
  const sleeveR = 'M75,9 L75,40 L87,47 L99,32.5 L79,9 Z';

  return (
    <svg
      width={size}
      height={(size * 92) / 100}
      viewBox="0 0 100 92"
      role="img"
      aria-label="anteprima divisa"
    >
      <defs>
        <clipPath id={id('shirt')}>
          <path d={shirt} />
        </clipPath>
        <clipPath id={id('body')}>
          <path d={body} />
        </clipPath>
        {/* Velo di lucido: appena percettibile, come le figurine stampate. */}
        <linearGradient id={id('gloss')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.10" />
        </linearGradient>
        {/* Sfumato moderno: dal colore-corpo al dettaglio, dall'alto in giù. */}
        <linearGradient id={id('fade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.15" stopColor={d.primary} />
          <stop offset="0.95" stopColor={d.secondary} />
        </linearGradient>
        {d.texture && (
          <pattern id={id('tex')} patternUnits="userSpaceOnUse" width="20" height="20">
            <image href={d.texture} width="20" height="20" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        )}
      </defs>

      <g clipPath={`url(#${id('shirt')})`}>
        {/* Maniche */}
        <path d={sleeveL} fill={d.sleeves} />
        <path d={sleeveR} fill={d.sleeves} />
        {/* Polsini */}
        <path d="M13.5,47.5 L1,32 L-1,34.5 L11,49.5 Z" fill={d.collar} />
        <path d="M86.5,47.5 L99,32 L101,34.5 L89,49.5 Z" fill={d.collar} />
        <path d="M14,46.5 L2,31.7" stroke="#00000033" strokeWidth="0.8" fill="none" />
        <path d="M86,46.5 L98,31.7" stroke="#00000033" strokeWidth="0.8" fill="none" />

        {/* Corpo + pattern */}
        <path d={body} fill={d.primary} />
        <g clipPath={`url(#${id('body')})`}>
          {d.pattern === 'palato' &&
            [30, 50, 70].map((x) => (
              <rect key={x} x={x - 5} y={5} width={10} height={85} fill={d.secondary} />
            ))}
          {d.pattern === 'palatoSottile' &&
            [27.5, 36.5, 45.5, 54.5, 63.5, 72.5].map((x) => (
              <rect key={x} x={x - 2.25} y={5} width={4.5} height={85} fill={d.secondary} />
            ))}
          {d.pattern === 'fasciato' &&
            [16, 36, 56, 76].map((y) => (
              <rect key={y} x={20} y={y} width={60} height={10} fill={d.secondary} />
            ))}
          {d.pattern === 'fasciaUnica' && (
            <>
              <rect x={20} y={33} width={60} height={14} fill={d.secondary} />
              <rect x={20} y={31} width={60} height={1.4} fill={d.collar} />
              <rect x={20} y={47.6} width={60} height={1.4} fill={d.collar} />
            </>
          )}
          {d.pattern === 'sash' && (
            <path d="M25,8 L41,8 L75,64 L75,80 L59,80 L25,24 Z" fill={d.secondary} />
          )}
          {d.pattern === 'bandaSottile' && (
            <path d="M25,14 L34,9 L75,66 L75,78 L66,78 L25,24 Z" fill={d.secondary} />
          )}
          {d.pattern === 'mezzo' && <rect x={50} y={5} width={30} height={85} fill={d.secondary} />}
          {d.pattern === 'quarti' && (
            <>
              <rect x={50} y={5} width={30} height={43} fill={d.secondary} />
              <rect x={20} y={48} width={30} height={42} fill={d.secondary} />
            </>
          )}
          {d.pattern === 'croce' && (
            <>
              <rect x={45} y={5} width={10} height={85} fill={d.secondary} />
              <rect x={20} y={34} width={60} height={10} fill={d.secondary} />
            </>
          )}
          {d.pattern === 'rombi' &&
            [0, 1, 2, 3, 4, 5].flatMap((r) =>
              [0, 1, 2, 3].map((c) => {
                const cx = 25 + c * 16.7 + (r % 2 === 0 ? 0 : 8.35);
                const cy = 12 + r * 14;
                return (
                  <path
                    key={`${r}-${c}`}
                    d={`M${cx},${cy - 8} L${cx + 8.35}, ${cy} L${cx},${cy + 8} L${cx - 8.35},${cy} Z`}
                    fill={d.secondary}
                  />
                );
              }),
            )}
          {d.pattern === 'sfumato' && (
            <rect x={20} y={5} width={60} height={85} fill={`url(#${id('fade')})`} />
          )}
          {d.pattern === 'spallato' && (
            /* il carré alla Lazio-Umbro '98: spalle e alto petto, orlo curvo */
            <path d="M20,5 L80,5 L80,19 C62,26.5 38,26.5 20,19 Z" fill={d.secondary} />
          )}
          {d.pattern === 'palaCentrale' && (
            <>
              <rect x={41} y={5} width={18} height={85} fill={d.secondary} />
              <rect x={49} y={5} width={2} height={85} fill={d.collar} />
            </>
          )}
          {d.pattern === 'gessato' &&
            [28, 34, 40, 46, 52, 58, 64, 70].map((x) => (
              <rect key={x} x={x} y={5} width={1.3} height={85} fill={d.secondary} />
            ))}
          {d.pattern === 'cerchiato' &&
            [13, 21, 29, 37, 45, 53, 61, 69, 77, 85].map((y) => (
              <rect key={y} x={20} y={y} width={60} height={3} fill={d.secondary} />
            ))}
          {d.pattern === 'diagonaleDoppia' && (
            /* stessa pendenza per entrambe: parallele vere */
            <>
              <path d="M25,8 L75,70 L75,77 L25,15 Z" fill={d.secondary} />
              <path d="M25,24 L75,86 L75,93 L25,31 Z" fill={d.secondary} />
            </>
          )}
          {d.pattern === 'metaOrizzontale' && (
            <rect x={20} y={48} width={60} height={42} fill={d.secondary} />
          )}
          {d.pattern === 'geometrico90' && (
            /* i tre nastri obliqui sul petto, alla Germania '90 */
            <>
              <path d="M20,38 L80,20 L80,27 L20,45 Z" fill={d.secondary} />
              <path d="M20,50 L80,32 L80,39 L20,57 Z" fill={d.collar} />
              <path d="M20,62 L80,44 L80,51 L20,69 Z" fill={d.secondary} />
            </>
          )}
          {d.pattern === 'saetta' && (
            <path
              d="M20,40 L34,31 L46,41 L61,29 L71,38 L80,32 L80,42 L71,48 L61,39 L46,51 L34,41 L20,50 Z"
              fill={d.secondary}
            />
          )}
          {d.pattern === 'onda' && (
            <path
              d="M20,36 C34,27 44,45 58,37 C67,32 74,35 80,30 L80,43 C74,48 67,45 58,50 C44,58 34,40 20,49 Z"
              fill={d.secondary}
            />
          )}
          {d.pattern === 'doppiaV' && (
            <>
              <path d="M25,13 L50,30 L75,13 L75,21 L50,38 L25,21 Z" fill={d.secondary} />
              <path d="M25,31 L50,48 L75,31 L75,39 L50,56 L25,39 Z" fill={d.secondary} />
            </>
          )}
          {d.pattern === 'scacchi' &&
            [0, 1, 2, 3, 4, 5, 6].flatMap((r) =>
              [0, 1, 2, 3, 4].map((c) =>
                (r + c) % 2 === 0 ? (
                  <rect
                    key={`${r}-${c}`}
                    x={25 + c * 10}
                    y={10 + r * 11}
                    width={10}
                    height={11}
                    fill={d.secondary}
                  />
                ) : null,
              ),
            )}
          {d.pattern === 'vstorica' && (
            <path d="M25,16 L50,34 L75,16 L75,28 L50,46 L25,28 Z" fill={d.secondary} />
          )}
          {d.texture && (
            <rect x={20} y={5} width={60} height={85} fill={`url(#${id('tex')})`} opacity={0.82} />
          )}
          {/* Forme piazzate dall'utente (sopra pattern e trama) */}
          {(d.decals ?? []).map((dc, i) => (
            <g
              // biome-ignore lint/suspicious/noArrayIndexKey: l'indice È l'identità della forma
              key={i}
              transform={`translate(${dc.x},${dc.y}) rotate(${dc.rot ?? 0}) scale(${dc.scale})`}
            >
              <path d={DECAL_D[dc.shape]} fill={dc.color} />
              {selectedDecal === i && (
                <circle
                  r={8.5}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={0.9 / dc.scale}
                  strokeDasharray="2 1.6"
                  opacity={0.95}
                />
              )}
            </g>
          ))}
          {/* cuciture laterali del corpo */}
          <path d="M25.7,12 L25.7,86 M74.3,12 L74.3,86" stroke="#00000022" strokeWidth="0.8" />
        </g>

        {/* Sponsor sul petto */}
        {sponsor && (
          <text
            x={50}
            y={44}
            textAnchor="middle"
            fontSize="8"
            fontWeight="800"
            fill={d.collar}
            stroke="#00000040"
            strokeWidth="0.35"
            style={{ fontFamily: 'Verdana, sans-serif', letterSpacing: '0.3px' }}
          >
            {sponsor.slice(0, 11)}
          </text>
        )}

        {/* Lucido su tutta la maglia */}
        <path d={shirt} fill={`url(#${id('gloss')})`} />
      </g>

      {/* Collo tondo col bordino */}
      <path d="M34,5 C38,12 62,12 66,5 L62.5,3.2 C58,8.6 42,8.6 37.5,3.2 Z" fill={d.collar} />
      <path
        d="M35.8,4.5 C40,10.4 60,10.4 64.2,4.5"
        fill="none"
        stroke="#00000040"
        strokeWidth="0.8"
      />

      {/* Contorno netto, da figurina */}
      <path
        d={shirt}
        fill="none"
        stroke="#1c1917"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

export function KitAtelier({ session, accent }: { session: GameSession; accent: string }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const v = kitAtelierView(session);

  const [design, setDesign] = useState<KitDesign>(() => ({
    pattern: 'palato',
    primary: v.identity.primary,
    secondary: v.identity.secondary,
    sleeves: v.identity.primary,
    collar: v.identity.secondary,
    style: 'moderno',
    origin: 'utente',
  }));
  const patch = (p: Partial<KitDesign>) =>
    setDesign((d) => ({ ...d, ...p, origin: 'utente', sourceYear: undefined }));

  // ---- Forme libere: selezione, drag sulla maglia, ritocchi ----
  const [selDecal, setSelDecal] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const toView = (e: React.PointerEvent): { vx: number; vy: number } | null => {
    const r = previewRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      vx: ((e.clientX - r.left) / r.width) * 100,
      vy: ((e.clientY - r.top) / r.height) * 92,
    };
  };
  const updDecal = (i: number, p: Partial<KitDecal>) =>
    setDesign((d) => ({
      ...d,
      origin: 'utente',
      sourceYear: undefined,
      decals: (d.decals ?? []).map((dc, j) => (j === i ? { ...dc, ...p } : dc)),
    }));
  const delDecal = (i: number) => {
    setSelDecal(null);
    setDesign((d) => ({
      ...d,
      origin: 'utente',
      sourceYear: undefined,
      decals: (d.decals ?? []).filter((_, j) => j !== i),
    }));
  };
  const addDecal = (shape: KitDecalShape) => {
    if ((design.decals ?? []).length >= MAX_DECALS) return;
    setDesign((d) => ({
      ...d,
      origin: 'utente',
      sourceYear: undefined,
      decals: [...(d.decals ?? []), { shape, x: 50, y: 40, scale: 1, rot: 0, color: d.collar }],
    }));
    setSelDecal((design.decals ?? []).length);
  };
  const onPreviewDown = (e: React.PointerEvent) => {
    const p = toView(e);
    if (!p) return;
    const decals = design.decals ?? [];
    let best: number | null = null;
    let bestDist = 10;
    for (let i = 0; i < decals.length; i++) {
      const dc = decals[i];
      if (!dc) continue;
      const dist = Math.hypot(p.vx - dc.x, p.vy - dc.y) / Math.max(0.6, dc.scale);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setSelDecal(best);
    if (best !== null) {
      draggingRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };
  const onPreviewMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || selDecal === null) return;
    const p = toView(e);
    if (!p) return;
    updDecal(selDecal, {
      x: Math.max(23, Math.min(77, Math.round(p.vx * 2) / 2)),
      y: Math.max(8, Math.min(86, Math.round(p.vy * 2) / 2)),
    });
  };
  const onPreviewUp = () => {
    draggingRef.current = false;
  };
  const curDecal = selDecal !== null ? (design.decals ?? [])[selDecal] : undefined;

  const fidelity = kitFidelity(session, design);
  const fidelityLabel =
    fidelity >= 0.75
      ? 'fedele ai colori sociali'
      : fidelity >= 0.35
        ? 'interpretazione libera'
        : 'rottura totale';

  /** Trama da file locale: ridotta a 96px e compressa (finisce nel salvataggio). */
  const onTexture = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const g = canvas.getContext('2d');
        if (!g) return;
        g.drawImage(img, 0, 0, 96, 96);
        setDesign((d) => ({ ...d, texture: canvas.toDataURL('image/jpeg', 0.72) }));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const ColorInput = ({
    label,
    k,
  }: { label: string; k: 'primary' | 'secondary' | 'sleeves' | 'collar' }) => (
    <label className="flex items-center justify-between gap-2 text-xs text-zinc-400">
      {label}
      <input
        type="color"
        value={design[k]}
        onChange={(e) => patch({ [k]: e.target.value })}
        className="h-7 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      {/* La maglia dell'anno, se già lanciata */}
      {v.current && v.launched && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2">
          <KitShirt design={v.current.design} size={64} sponsor={v.sponsorName} />
          <div className="text-xs">
            <div className="font-semibold" style={{ color: accent }}>
              <Ic name="check_circle" fill /> La maglia {session.year}/
              {String(session.year + 1).slice(2)} è in vendita
            </div>
            <div className="mt-0.5 text-zinc-400">
              {STYLE_LABEL[v.current.design.style]} · verdetto della piazza{' '}
              <b
                className={
                  v.current.verdictPct >= 65
                    ? 'text-emerald-300'
                    : v.current.verdictPct < 35
                      ? 'text-red-300'
                      : 'text-zinc-200'
                }
              >
                {v.current.verdictPct}/100
              </b>
            </div>
          </div>
        </div>
      )}

      {!v.launched && (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          {/* Anteprima viva: la maglia 3D in vetrina, col bagliore del club */}
          <div
            className="flex flex-col items-center gap-1 rounded-xl border border-zinc-800 p-2"
            style={{
              background: `radial-gradient(ellipse 70% 55% at 50% 42%, ${accent}26, transparent 70%), linear-gradient(180deg, #18181b 0%, #09090b 100%)`,
            }}
          >
            <div
              ref={previewRef}
              className="inline-block"
              style={{ touchAction: 'none', cursor: curDecal ? 'grabbing' : 'pointer' }}
              onPointerDown={onPreviewDown}
              onPointerMove={onPreviewMove}
              onPointerUp={onPreviewUp}
              onPointerLeave={onPreviewUp}
            >
              <KitShirt
                design={design}
                size={250}
                sponsor={v.sponsorName}
                selectedDecal={selDecal}
              />
            </div>
            <span
              className={`text-[10px] ${fidelity >= 0.75 ? 'text-emerald-300' : fidelity >= 0.35 ? 'text-zinc-400' : 'text-amber-300'}`}
            >
              {fidelityLabel}
            </span>
            {design.origin === 'rievocazione' && design.sourceYear !== undefined && (
              <span className="text-[10px] text-zinc-500">rievocazione {design.sourceYear}</span>
            )}
          </div>
          {/* Controlli */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <ColorInput label="Corpo" k="primary" />
              <ColorInput label="Dettaglio" k="secondary" />
              <ColorInput label="Maniche" k="sleeves" />
              <ColorInput label="Colletto" k="collar" />
            </div>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(PATTERN_LABEL) as KitPattern[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch({ pattern: p })}
                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    design.pattern === p
                      ? 'bg-zinc-800'
                      : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'
                  }`}
                  style={design.pattern === p ? { borderColor: accent, color: accent } : undefined}
                >
                  {PATTERN_LABEL[p]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-widest text-zinc-600">
                Stile
                <Help text="Lo stile guida il marketing: STORICO parla alla curva (premia la fedeltà ai colori, commuove dopo un'annata felice), MODERNO viaggia (vende di più sui mercati esteri), CREATIVO è una scommessa — capolavoro o fischi." />
              </span>
              {(Object.keys(STYLE_LABEL) as KitStyle[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => patch({ style: st })}
                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    design.style === st
                      ? 'bg-zinc-800'
                      : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900'
                  }`}
                  style={design.style === st ? { borderColor: accent, color: accent } : undefined}
                >
                  {STYLE_LABEL[st]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onTexture(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                <Ic name="texture" /> Carica trama da file
              </button>
              {design.texture && (
                <button
                  type="button"
                  onClick={() => setDesign((d) => ({ ...d, texture: undefined }))}
                  className="text-[10px] text-zinc-500 underline hover:text-zinc-300"
                >
                  rimuovi trama
                </button>
              )}
              <Help text="Scegli un'immagine dal tuo computer: viene ridotta a 96px e compressa (resta piccola nel salvataggio) e diventa la trama del corpo maglia." />
            </div>

            {/* ---- Forme libere: clicca per aggiungere, trascina sulla maglia ---- */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-widest text-zinc-600">
                Forme
                <Help text="Clicca una forma per metterla sulla maglia, poi TRASCINALA dove vuoi col mouse. Selezionandola puoi cambiarle colore, dimensione e rotazione, o eliminarla. Massimo 8 per maglia — e restano identiche nell'archivio e nelle rievocazioni." />
              </span>
              {(Object.keys(DECAL_D) as KitDecalShape[]).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  disabled={(design.decals ?? []).length >= MAX_DECALS}
                  onClick={() => addDecal(shape)}
                  title={DECAL_LABEL[shape]}
                  className="rounded border border-zinc-800 p-1 hover:bg-zinc-900 disabled:opacity-40"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="-8 -8 16 16"
                    role="img"
                    aria-label={DECAL_LABEL[shape]}
                  >
                    <path d={DECAL_D[shape]} fill="#d4d4d8" transform="scale(1.05)" />
                  </svg>
                </button>
              ))}
              {(design.decals ?? []).length >= MAX_DECALS && (
                <span className="text-[10px] text-zinc-500">massimo raggiunto</span>
              )}
            </div>
            {curDecal && selDecal !== null && (
              <div className="note-in flex flex-wrap items-center gap-2 rounded-lg bg-zinc-900/70 px-2.5 py-1.5 text-[11px]">
                <span className="font-semibold text-zinc-300">{DECAL_LABEL[curDecal.shape]}</span>
                <input
                  type="color"
                  value={curDecal.color}
                  onChange={(e) => updDecal(selDecal, { color: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                />
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-1.5 hover:bg-zinc-800"
                    onClick={() =>
                      updDecal(selDecal, { scale: Math.max(0.5, curDecal.scale - 0.2) })
                    }
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-zinc-500">
                    {Math.round(curDecal.scale * 100)}%
                  </span>
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-1.5 hover:bg-zinc-800"
                    onClick={() =>
                      updDecal(selDecal, { scale: Math.min(2.8, curDecal.scale + 0.2) })
                    }
                  >
                    +
                  </button>
                </span>
                <button
                  type="button"
                  className="rounded border border-zinc-700 px-1.5 hover:bg-zinc-800"
                  title="ruota"
                  onClick={() => updDecal(selDecal, { rot: ((curDecal.rot ?? 0) + 30) % 360 })}
                >
                  <Ic name="rotate_right" />
                </button>
                <button
                  type="button"
                  className="rounded border border-red-900/60 px-1.5 text-red-300 hover:bg-red-950/40"
                  onClick={() => delDecal(selDecal)}
                >
                  <Ic name="delete" /> elimina
                </button>
                <button
                  type="button"
                  className="text-zinc-500 underline hover:text-zinc-300"
                  onClick={() => setSelDecal(null)}
                >
                  fatto
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setMsg(launchKit(session, design));
                refresh();
              }}
              className="w-full rounded-lg border px-4 py-2 text-sm font-bold transition-colors hover:bg-zinc-800"
              style={{ borderColor: accent, color: accent }}
            >
              <Ic name="rocket_launch" /> Lancia la maglia {session.year}/
              {String(session.year + 1).slice(2)}
            </button>
          </div>
        </div>
      )}

      {/* Proposte dello sponsor */}
      {!v.launched && v.proposals && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Le proposte di {v.proposals.brandName}
            <Help text="Lo sponsor tecnico presenta i suoi bozzetti dell'anno: cliccane uno per portarlo nell'editor (puoi ancora ritoccarlo), oppure ignorali e fai da te." />
          </div>
          <div className="flex gap-2">
            {v.proposals.designs.map((d, i) => (
              <button
                key={`${d.pattern}-${i}`}
                type="button"
                onClick={() => {
                  setDesign({ ...d, origin: 'sponsor' });
                  setSelDecal(null);
                  refresh();
                }}
                className="rounded-lg border border-zinc-800 p-2 hover:bg-zinc-900"
                title={`${PATTERN_LABEL[d.pattern]} · ${STYLE_LABEL[d.style]}`}
              >
                <KitShirt design={d} size={56} />
                <div className="mt-0.5 text-center text-[9px] text-zinc-500">
                  {STYLE_LABEL[d.style]}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Archivio: le maglie delle stagioni passate, da rievocare */}
      {v.archive.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Archivio
            <Help text="Le maglie lanciate nelle stagioni passate, con l'annata: rievocarne una da un anno d'ORO (titolo, coppa, promozione) fa impazzire i nostalgici; rievocare un'annata anonima strappa alzate di spalle. La rievocazione si lancia come una maglia nuova, in stile storico." />
          </div>
          <div className="flex flex-wrap gap-2">
            {v.archive.map((e) => (
              <div key={e.year} className="rounded-lg border border-zinc-800 p-2 text-center">
                <KitShirt design={e.design} size={48} />
                <div className="text-[9px] text-zinc-400">
                  {e.year} · {e.verdictPct}/100
                </div>
                {e.annata && (
                  <div
                    className={`text-[9px] font-semibold ${e.annata.golden ? 'text-amber-300' : 'text-zinc-600'}`}
                  >
                    {e.annata.label}
                  </div>
                )}
                {!v.launched && e.year < session.year && (
                  <button
                    type="button"
                    onClick={() => {
                      setDesign({
                        ...e.design,
                        style: 'storico',
                        origin: 'rievocazione',
                        sourceYear: e.year,
                      });
                      setSelDecal(null);
                      refresh();
                    }}
                    className="mt-0.5 text-[9px] underline"
                    style={{ color: accent }}
                  >
                    rievoca
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <p className="note-in text-xs text-zinc-400">{msg}</p>}
    </div>
  );
}
