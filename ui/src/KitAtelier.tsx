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

/** La maglia SVG: corpo con pattern (o trama caricata), maniche, colletto. */
export function KitShirt({
  design,
  size = 96,
  sponsor,
}: {
  design: KitDesign;
  size?: number;
  sponsor?: string | null;
}) {
  const uid = useId();
  const bodyClip = `kit-body-${uid}`;
  const texId = `kit-tex-${uid}`;
  const d = design;
  const body = 'M38,22 L48,13 L72,13 L82,22 L82,106 L38,106 Z';
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="anteprima divisa">
      <defs>
        <clipPath id={bodyClip}>
          <path d={body} />
        </clipPath>
        {d.texture && (
          <pattern id={texId} patternUnits="userSpaceOnUse" width="24" height="24">
            <image href={d.texture} width="24" height="24" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        )}
      </defs>
      {/* maniche */}
      <path d="M38,22 L18,34 L25,54 L38,45 Z" fill={d.sleeves} />
      <path d="M82,22 L102,34 L95,54 L82,45 Z" fill={d.sleeves} />
      {/* corpo + pattern */}
      <path d={body} fill={d.primary} />
      <g clipPath={`url(#${bodyClip})`}>
        {d.pattern === 'palato' &&
          [44, 56, 68].map((x) => (
            <rect key={x} x={x} y={10} width={6} height={100} fill={d.secondary} />
          ))}
        {d.pattern === 'fasciato' &&
          [30, 52, 74, 96].map((y) => (
            <rect key={y} x={30} y={y} width={60} height={8} fill={d.secondary} />
          ))}
        {d.pattern === 'sash' && <path d="M30,18 L48,10 L92,102 L74,110 Z" fill={d.secondary} />}
        {d.pattern === 'mezzo' && <rect x={60} y={10} width={30} height={100} fill={d.secondary} />}
        {d.pattern === 'scacchi' &&
          [0, 1, 2, 3, 4].flatMap((r) =>
            [0, 1, 2].map((c) =>
              (r + c) % 2 === 0 ? (
                <rect
                  key={`${r}-${c}`}
                  x={38 + c * 15}
                  y={13 + r * 19}
                  width={15}
                  height={19}
                  fill={d.secondary}
                />
              ) : null,
            ),
          )}
        {d.pattern === 'vstorica' && (
          <path d="M38,26 L60,44 L82,26 L82,38 L60,56 L38,38 Z" fill={d.secondary} />
        )}
        {d.texture && <path d={body} fill={`url(#${texId})`} opacity={0.85} />}
      </g>
      {/* colletto */}
      <path d="M48,13 L60,24 L72,13 L66,10 L60,16 L54,10 Z" fill={d.collar} />
      {/* sponsor sul petto */}
      {sponsor && (
        <text
          x={60}
          y={72}
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill={d.collar}
          opacity={0.9}
          style={{ fontFamily: 'sans-serif' }}
        >
          {sponsor.slice(0, 12)}
        </text>
      )}
      <path d={body} fill="none" stroke="#00000055" strokeWidth="1.5" />
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
          {/* Anteprima viva */}
          <div className="flex flex-col items-center gap-1 rounded-lg bg-zinc-900/60 p-3">
            <KitShirt design={design} size={120} sponsor={v.sponsorName} />
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
