/**
 * Grafici SVG fatti in casa (impero v2 / Finanze) — zero dipendenze, tema scuro.
 * Nota dataviz: la coppia entrate/uscite (#34d399/#f87171) ha ΔE deutan 6.5 (range
 * 6-8: legale SOLO con encoding secondario) → i costi sono SEMPRE tratteggiati e
 * ogni serie porta etichette dirette; i numeri stanno in inchiostro, mai nel colore
 * della serie. Tooltip nativi via <title> su ogni marchio.
 */

const INK = '#a1a1aa';
const INK_DIM = '#71717a';
const GRID = '#27272a';
export const POS = '#34d399';
export const NEG = '#f87171';

const fmtM = (v: number) => `${v < 0 ? '−' : ''}${(Math.abs(v) / 1e6).toFixed(1)}M`;
const fmtFans = (v: number) =>
  v >= 1_000_000 ? `${(v / 1e6).toFixed(1)}M` : `${Math.max(0, Math.round(v / 1000))}k`;

/** Piccola serie singola (tifosi di un territorio, totale impero). */
export function Sparkline({
  values,
  color,
  width = 150,
  height = 36,
  unit = 'fans',
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  unit?: 'fans' | 'money';
}) {
  if (values.length < 2) {
    return <span className="text-[10px] text-zinc-600">storia in costruzione…</span>;
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const x = (i: number) => 4 + (i * (width - 24)) / (values.length - 1);
  const y = (v: number) => height - 6 - ((v - min) / (max - min || 1)) * (height - 12);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values[values.length - 1] ?? 0;
  const fmt = unit === 'money' ? fmtM : fmtFans;
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`andamento: ${values.map(fmt).join(', ')}`}
    >
      <title>{values.map(fmt).join(' → ')}</title>
      <polyline
        points={`${x(0)},${height - 6} ${pts} ${x(values.length - 1)},${height - 6}`}
        fill={color}
        opacity={0.12}
        stroke="none"
      />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} fill={color} />
    </svg>
  );
}

/** Barre stagionali ± attorno allo zero (netto storico + previsione tratteggiata). */
export function SeasonNetBars({
  rows,
  width = 460,
  height = 120,
}: {
  rows: { label: string; value: number; forecast?: boolean }[];
  width?: number;
  height?: number;
}) {
  if (rows.length === 0) return <p className="text-xs text-zinc-600">Ancora niente storia.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const bw = Math.min(34, (width - 8) / rows.length - 6);
  const zero = height / 2;
  const scale = (height / 2 - 18) / max;
  return (
    <svg width={width} height={height} role="img" aria-label="netto per stagione">
      <line x1={0} x2={width} y1={zero} y2={zero} stroke={GRID} strokeWidth={1} />
      {rows.map((r, i) => {
        const x = 6 + i * (bw + 6);
        const h = Math.max(2, Math.abs(r.value) * scale);
        const yTop = r.value >= 0 ? zero - h : zero;
        const color = r.value >= 0 ? POS : NEG;
        return (
          <g key={r.label}>
            <title>{`${r.label}: ${fmtM(r.value)}${r.forecast ? ' (previsione)' : ''}`}</title>
            <rect
              x={x}
              y={yTop}
              width={bw}
              height={h}
              rx={2}
              fill={color}
              opacity={r.forecast ? 0.4 : 0.9}
              stroke={r.forecast ? color : 'none'}
              strokeDasharray={r.forecast ? '3 3' : undefined}
            />
            <text
              x={x + bw / 2}
              y={r.value >= 0 ? yTop - 4 : yTop + h + 10}
              textAnchor="middle"
              fontSize={9}
              fill={INK}
            >
              {fmtM(r.value)}
            </text>
            <text x={x + bw / 2} y={height - 2} textAnchor="middle" fontSize={9} fill={INK_DIM}>
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Due linee (ricavi pieni, costi TRATTEGGIATI — encoding secondario obbligatorio). */
export function DualLines({
  rows,
  aLabel,
  bLabel,
  width = 460,
  height = 130,
}: {
  rows: { label: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
  width?: number;
  height?: number;
}) {
  if (rows.length < 2)
    return <p className="text-xs text-zinc-600">Serve almeno una stagione chiusa in più.</p>;
  const all = rows.flatMap((r) => [r.a, r.b]);
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const x = (i: number) => 8 + (i * (width - 58)) / (rows.length - 1);
  const y = (v: number) => height - 18 - ((v - min) / (max - min || 1)) * (height - 34);
  const path = (get: (r: (typeof rows)[number]) => number) =>
    rows.map((r, i) => `${x(i)},${y(get(r))}`).join(' ');
  const lastA = rows[rows.length - 1]!.a;
  const lastB = rows[rows.length - 1]!.b;
  return (
    <svg width={width} height={height} role="img" aria-label={`${aLabel} e ${bLabel} per stagione`}>
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={GRID} strokeWidth={1} />
      <polyline points={path((r) => r.a)} fill="none" stroke={POS} strokeWidth={2} />
      <polyline
        points={path((r) => r.b)}
        fill="none"
        stroke={NEG}
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      {rows.map((r, i) => (
        <g key={r.label}>
          <circle cx={x(i)} cy={y(r.a)} r={2.5} fill={POS}>
            <title>{`${r.label} — ${aLabel}: ${fmtM(r.a)}`}</title>
          </circle>
          <circle cx={x(i)} cy={y(r.b)} r={2.5} fill={NEG}>
            <title>{`${r.label} — ${bLabel}: ${fmtM(r.b)}`}</title>
          </circle>
          <text x={x(i)} y={height - 4} textAnchor="middle" fontSize={9} fill={INK_DIM}>
            {r.label}
          </text>
        </g>
      ))}
      {/* etichette dirette a fine linea: l'identità non è mai solo colore */}
      <text x={x(rows.length - 1) + 6} y={y(lastA) + 3} fontSize={9} fill={INK}>
        {aLabel}
      </text>
      <text x={x(rows.length - 1) + 6} y={y(lastB) + 3} fontSize={9} fill={INK}>
        {bLabel}
      </text>
    </svg>
  );
}

/** Barre orizzontali di composizione (una tonalità, testo in inchiostro). */
export function HBars({
  rows,
  color,
  width = 220,
}: {
  rows: { label: string; value: number }[];
  color: string;
  width?: number;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center gap-2 text-[10px]"
          title={`${r.label}: ${fmtM(r.value)}`}
        >
          <span className="w-28 truncate text-zinc-400">{r.label}</span>
          <svg
            width={width - 100}
            height={10}
            role="img"
            aria-label={`${r.label}: ${fmtM(r.value)}`}
          >
            <rect
              x={0}
              y={1}
              width={Math.max(2, (r.value / max) * (width - 104))}
              height={8}
              rx={2}
              fill={color}
              opacity={0.85}
            />
          </svg>
          <span className="w-12 text-right font-semibold text-zinc-300">{fmtM(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
