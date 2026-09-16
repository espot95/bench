/**
 * RADAR dei percentili di ruolo (G2): esagono SVG fatto in casa, zero dipendenze.
 * Ogni asse è un percentile 0-100 vs i PARI RUOLO del campionato; l'etichetta
 * porta anche il valore vero. Dataviz: una sola tinta + testo in inchiostro.
 */

export interface RadarMetric {
  label: string;
  /** Percentile 0-100 tra i pari ruolo. */
  pct: number;
  /** Valore vero, già formattato (va nel tooltip/etichetta). */
  value: string;
}

export function Radar({
  metrics,
  color,
  size = 220,
}: {
  metrics: RadarMetric[];
  color: string;
  size?: number;
}) {
  const n = metrics.length;
  if (n < 3) return null;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const R = size / 2 - 34;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) =>
    `${(cx + Math.cos(angle(i)) * r).toFixed(1)},${(cy + Math.sin(angle(i)) * r).toFixed(1)}`;
  const ring = (f: number) => Array.from({ length: n }, (_, i) => pt(i, R * f)).join(' ');
  const shape = metrics
    .map((m, i) => pt(i, R * Math.max(0.04, Math.min(1, m.pct / 100))))
    .join(' ');
  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label={`percentili di ruolo: ${metrics.map((m) => `${m.label} ${Math.round(m.pct)}`).join(', ')}`}
    >
      <title>
        {metrics.map((m) => `${m.label}: ${m.value} (${Math.round(m.pct)}° pct)`).join(' · ')}
      </title>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill="none" stroke="#27272a" strokeWidth={1} />
      ))}
      {metrics.map((_, i) => (
        <line
          key={`ax-${metrics[i]!.label}`}
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(angle(i)) * R}
          y2={cy + Math.sin(angle(i)) * R}
          stroke="#27272a"
          strokeWidth={1}
        />
      ))}
      <polygon points={shape} fill={color} opacity={0.25} stroke={color} strokeWidth={2} />
      {metrics.map((m, i) => {
        const lx = cx + Math.cos(angle(i)) * (R + 16);
        const ly = cy + Math.sin(angle(i)) * (R + 14);
        const anchor =
          Math.abs(Math.cos(angle(i))) < 0.3 ? 'middle' : Math.cos(angle(i)) > 0 ? 'start' : 'end';
        return (
          <g key={m.label}>
            <text x={lx} y={ly} textAnchor={anchor} fontSize={9} fill="#a1a1aa">
              {m.label}
            </text>
            <text
              x={lx}
              y={ly + 10}
              textAnchor={anchor}
              fontSize={9}
              fontWeight={700}
              fill="#e4e4e7"
            >
              {m.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
