/**
 * ATELIER DELLE DIVISE (MODULE_STADIUM §3.4, punto E — richiesta utente): editor
 * della maglia con anteprima SVG viva, trama caricata da file locale (ridotta e
 * compressa nel salvataggio), proposte dello sponsor tecnico, lancio col verdetto
 * della piazza e archivio delle annate da rievocare.
 */

import { useId, useRef, useState } from 'react';
import type { KitDesign, KitPattern, KitStyle } from '../../src/core/types';
import { Help } from './Help';
import { Ic } from './Ic';
import { type GameSession, kitAtelierView, kitFidelity, launchKit } from './game';

const PATTERN_LABEL: Record<KitPattern, string> = {
  tinta: 'Tinta unita',
  palato: 'Palato',
  fasciato: 'Fasciato',
  sash: 'Sash',
  mezzo: 'Mezzo',
  scacchi: 'Scacchi',
  vstorica: 'V storica',
};

const STYLE_LABEL: Record<KitStyle, string> = {
  storico: 'Storico',
  creativo: 'Creativo',
  moderno: 'Moderno',
};

/**
 * La maglia SVG "da sarto": silhouette curva, luci e ombre in gradiente, cuciture,
 * polsini e bordo colletto, ombra a terra. Il pattern (o la trama caricata) veste
 * SOLO il torso, clippato sulla sagoma vera.
 */
export function KitShirt({
  design,
  size = 96,
  sponsor,
}: {
  design: KitDesign;
  size?: number;
  sponsor?: string | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (k: string) => `kit-${k}-${uid}`;
  const d = design;

  // Sagome (viewBox 140×150): torso con spalle spioventi, vita appena segnata,
  // orlo curvo; maniche raglan corte con polsino.
  const torso =
    'M48,26 C52,20 58,17 62,16 L78,16 C82,17 88,20 92,26 ' +
    'L94,62 C94.5,84 94.5,100 94,116 C94,126 86,132 70,132 C54,132 46,126 46,116 ' +
    'C45.5,100 45.5,84 46,62 Z';
  const sleeveL = 'M48,26 C40,29 30,36 24,46 C22,49 21,52 22,55 L32,72 C34,69 40,63 46,60 L47,40 Z';
  const sleeveR =
    'M92,26 C100,29 110,36 116,46 C118,49 119,52 118,55 L108,72 C106,69 100,63 94,60 L93,40 Z';

  return (
    <svg
      width={size}
      height={(size * 150) / 140}
      viewBox="0 0 140 150"
      role="img"
      aria-label="anteprima divisa"
    >
      <defs>
        <clipPath id={id('torso')}>
          <path d={torso} />
        </clipPath>
        <clipPath id={id('sll')}>
          <path d={sleeveL} />
        </clipPath>
        <clipPath id={id('slr')}>
          <path d={sleeveR} />
        </clipPath>
        {/* Luce dall'alto + ombra sul fondo: il tessuto prende volume. */}
        <linearGradient id={id('light')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="0.75" stopColor="#000000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        {/* Ombre morbide sui fianchi: il torso si arrotonda. */}
        <linearGradient id={id('side')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000000" stopOpacity="0.28" />
          <stop offset="0.14" stopColor="#000000" stopOpacity="0" />
          <stop offset="0.86" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>
        {/* Sheen diagonale: il riflesso del tecnico in vetrina. */}
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.25" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.58" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.75" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Micro-trama del tessuto (quasi invisibile, dà la grana). */}
        <pattern id={id('weave')} patternUnits="userSpaceOnUse" width="3" height="3">
          <path d="M0,3 L3,0" stroke="#ffffff" strokeWidth="0.4" opacity="0.05" />
        </pattern>
        {d.texture && (
          <pattern id={id('tex')} patternUnits="userSpaceOnUse" width="26" height="26">
            <image href={d.texture} width="26" height="26" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        )}
      </defs>

      {/* Ombra a terra */}
      <ellipse cx="70" cy="140" rx="34" ry="5" fill="#000000" opacity="0.30" />

      {/* ---- Maniche (dietro il torso) ---- */}
      {(
        [
          [sleeveL, id('sll'), 'M24,46 C29,53 33,60 35,66'],
          [sleeveR, id('slr'), 'M116,46 C111,53 107,60 105,66'],
        ] as const
      ).map(([path, clip, cuff]) => (
        <g key={clip}>
          <path d={path} fill={d.sleeves} />
          <g clipPath={`url(#${clip})`}>
            <rect x="0" y="0" width="140" height="150" fill={`url(#${id('light')})`} />
            <rect x="0" y="0" width="140" height="150" fill={`url(#${id('weave')})`} />
            {/* polsino nel colore del colletto */}
            <path d={cuff} fill="none" stroke={d.collar} strokeWidth="5" opacity="0.95" />
          </g>
          <path d={path} fill="none" stroke="#000000" strokeWidth="1" opacity="0.35" />
        </g>
      ))}

      {/* ---- Torso ---- */}
      <path d={torso} fill={d.primary} />
      <g clipPath={`url(#${id('torso')})`}>
        {d.pattern === 'palato' &&
          [50, 62, 74, 86].map((x) => (
            <rect key={x} x={x} y={10} width={7} height={130} fill={d.secondary} />
          ))}
        {d.pattern === 'fasciato' &&
          [30, 56, 82, 108].map((y) => (
            <rect key={y} x={40} y={y} width={60} height={11} fill={d.secondary} />
          ))}
        {d.pattern === 'sash' && (
          <>
            <path d="M40,22 L60,12 L104,116 L84,126 Z" fill={d.secondary} />
            <path
              d="M40,22 L60,12 M84,126 L104,116"
              stroke={d.collar}
              strokeWidth="1.4"
              opacity="0.7"
            />
          </>
        )}
        {d.pattern === 'mezzo' && <rect x={70} y={10} width={30} height={130} fill={d.secondary} />}
        {d.pattern === 'scacchi' &&
          [0, 1, 2, 3, 4, 5].flatMap((r) =>
            [0, 1, 2, 3].map((c) =>
              (r + c) % 2 === 0 ? (
                <rect
                  key={`${r}-${c}`}
                  x={46 + c * 12.5}
                  y={16 + r * 19.5}
                  width={12.5}
                  height={19.5}
                  fill={d.secondary}
                />
              ) : null,
            ),
          )}
        {d.pattern === 'vstorica' && (
          <path
            d="M46,34 C55,42 63,49 70,54 C77,49 85,42 94,34 L94,48 C85,56 77,63 70,68 C63,63 55,56 46,48 Z"
            fill={d.secondary}
          />
        )}
        {d.texture && <path d={torso} fill={`url(#${id('tex')})`} opacity={0.82} />}

        {/* volume: luce, fianchi, sheen, grana */}
        <rect x="0" y="0" width="140" height="150" fill={`url(#${id('side')})`} />
        <rect x="0" y="0" width="140" height="150" fill={`url(#${id('light')})`} />
        <rect x="0" y="0" width="140" height="150" fill={`url(#${id('sheen')})`} />
        <rect x="0" y="0" width="140" height="150" fill={`url(#${id('weave')})`} />

        {/* cuciture: giromanica e orlo */}
        <path
          d="M48,26 C50,38 50,50 47,60 M92,26 C90,38 90,50 93,60"
          fill="none"
          stroke="#000000"
          strokeWidth="0.8"
          opacity="0.3"
        />
        <path
          d="M46,124 C54,128 86,128 94,124"
          fill="none"
          stroke="#000000"
          strokeWidth="0.8"
          opacity="0.28"
          strokeDasharray="2 1.6"
        />

        {/* sponsor sul petto, con la sua ombra */}
        {sponsor && (
          <>
            <text
              x={70.6}
              y={82.7}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="800"
              fill="#000000"
              opacity="0.35"
              style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.5px' }}
            >
              {sponsor.slice(0, 12)}
            </text>
            <text
              x={70}
              y={82}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="800"
              fill={d.collar}
              style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.5px' }}
            >
              {sponsor.slice(0, 12)}
            </text>
          </>
        )}
      </g>

      {/* ---- Colletto girocollo con bordino ---- */}
      <path
        d="M56,18 C60,25 80,25 84,18 C82,15 79,13.5 76,13 C74,17 66,17 64,13 C61,13.5 58,15 56,18 Z"
        fill={d.collar}
      />
      <path
        d="M58,19 C62,24.5 78,24.5 82,19"
        fill="none"
        stroke="#000000"
        strokeWidth="0.9"
        opacity="0.3"
      />
      {/* scollo: l'ombra del collo dentro la maglia */}
      <path
        d="M62,16.5 C65,20 75,20 78,16.5 C75,19.5 65,19.5 62,16.5 Z"
        fill="#000"
        opacity="0.45"
      />

      {/* contorno morbido finale */}
      <path
        d={torso}
        fill="none"
        stroke="#000000"
        strokeWidth="1.1"
        opacity="0.4"
        strokeLinejoin="round"
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
          {/* Anteprima viva: la vetrina col bagliore del club */}
          <div
            className="flex flex-col items-center gap-1 rounded-xl border border-zinc-800 p-3"
            style={{
              background: `radial-gradient(ellipse 70% 55% at 50% 42%, ${accent}22, transparent 70%), linear-gradient(180deg, #18181b 0%, #09090b 100%)`,
            }}
          >
            <KitShirt design={design} size={130} sponsor={v.sponsorName} />
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
