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
  palatoSottile: 'Pali sottili',
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
};

const STYLE_LABEL: Record<KitStyle, string> = {
  storico: 'Storico',
  creativo: 'Creativo',
  moderno: 'Moderno',
};

/**
 * La maglia 2D "da album" (richiesta utente: come le maglie di fantacalcio.it):
 * vista frontale piatta, sagoma classica con maniche a 45°, colori netti, collo
 * tondo col bordino, polsini, contorno pulito e un velo di lucido verticale.
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
            <KitShirt design={design} size={250} sponsor={v.sponsorName} />
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
