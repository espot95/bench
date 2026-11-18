/**
 * Matematica dei colori per l'atelier (MODULE_STADIUM §3.4 E-bis): armonie
 * suggerite dal primario e contrasto percepito — a mano, zero dipendenze
 * (hex↔HSL + luminanza WCAG), deterministico.
 */

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0.5 };
  const n = Number.parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const f = (k: number) => {
    const kk = (k + hue / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(kk - 3, 9 - kk, 1));
  };
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

function channel(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** Luminanza relativa WCAG di un colore hex. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = Number.parseInt(m[1]!, 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** Rapporto di contrasto WCAG [1..21] tra due colori hex. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * I suggerimenti per uno slot colore: colori sociali, classici da maglia, e le
 * ARMONIE del corpo attuale (complementare, triadi, analoghi, chiaro/scuro).
 */
export function kitSuggestions(
  primary: string,
  club: { primary: string; secondary: string },
): string[] {
  const { h, s, l } = hexToHsl(primary);
  const sat = Math.max(0.45, s);
  const out = [
    club.primary,
    club.secondary,
    '#ffffff',
    '#0b0b0e',
    '#f3e9d2', // crema vintage
    '#d4af37', // oro antico
    hslToHex(h + 180, sat, Math.min(0.6, Math.max(0.35, l))), // complementare
    hslToHex(h + 120, sat, 0.42), // triade
    hslToHex(h - 120, sat, 0.42),
    hslToHex(h + 30, sat, l), // analoghi
    hslToHex(h - 30, sat, l),
    hslToHex(h, s, Math.max(0.12, l - 0.22)), // più scuro
    hslToHex(h, s, Math.min(0.9, l + 0.22)), // più chiaro
  ].map((c) => c.toLowerCase());
  return [...new Set(out)].slice(0, 12);
}
