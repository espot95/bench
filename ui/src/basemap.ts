/**
 * Basemap SENZA chiave: le tile scure di CARTO ora richiedono una API key, quindi il
 * default è OSM standard resa scura via filtro CSS (nessuna registrazione). Chi vuole
 * una basemap a chiave (CARTO/MapTiler/Stadia) la imposta in `ui/.env.local`:
 *   VITE_BASEMAP_URL="https://.../{z}/{x}/{y}.png?api_key=..."
 *   VITE_BASEMAP_ATTRIBUTION="&copy; OpenStreetMap &copy; CARTO"
 * Con l'override si assume una tile GIÀ scura (niente filtro di inversione).
 */

import * as L from 'leaflet';

const OVERRIDE = import.meta.env.VITE_BASEMAP_URL as string | undefined;

export const BASEMAP = {
  url: OVERRIDE ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    (import.meta.env.VITE_BASEMAP_ATTRIBUTION as string | undefined) ?? '&copy; OpenStreetMap',
  /** Default OSM = tile chiare: vanno invertite per il tema scuro. */
  darken: !OVERRIDE,
} as const;

/** Aggancia la basemap a una mappa Leaflet (attribuzione inclusa). */
export function addBasemap(map: L.Map): void {
  L.tileLayer(BASEMAP.url, { attribution: BASEMAP.attribution, maxZoom: 19 }).addTo(map);
}

/**
 * Filtro-tinta del club per il tilePane: con le tile chiare di OSM prima inverte e
 * neutralizza i colori (grayscale evita l'acqua arancione), poi applica la stessa
 * ricetta sepia+hue usata sulle tile scure; la luminosità è ridotta perché le tile
 * invertite partono già più chiare delle dark_all.
 */
export function clubTintFilter(hue: number, saturate: number, brightness: number): string {
  const tint = `sepia(1) hue-rotate(${hue - 40}deg) saturate(${saturate})`;
  if (!BASEMAP.darken) return `${tint} brightness(${brightness})`;
  return `invert(1) grayscale(1) ${tint} brightness(${Math.max(0.9, brightness * 0.55)})`;
}

/** Scuro neutro senza tinta club (la vetrina città): l'inversione classica da dark-mode. */
export function plainDarkFilter(): string {
  return BASEMAP.darken ? 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9)' : '';
}
