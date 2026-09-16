/**
 * Icone Material Symbols Rounded (richiesta utente: "icone più belle e material").
 * Font variabile bundlato da npm (offline). L'icona eredita corpo e colore dal testo
 * che la contiene (font-size in em, allineamento ottico in CSS: .material-symbols-rounded).
 * `fill` = versione piena (stati attivi/selezionati).
 */

import type { CSSProperties } from 'react';

export function Ic({
  name,
  fill = false,
  className = '',
  style,
}: {
  name: string;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`material-symbols-rounded ${className}`}
      style={{ fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400`, ...style }}
    >
      {name}
    </span>
  );
}

/** L'icona come stringa HTML (per le divIcon di Leaflet). */
export function icHtml(name: string, extra = ''): string {
  return `<span aria-hidden class="material-symbols-rounded" style="${extra}">${name}</span>`;
}
