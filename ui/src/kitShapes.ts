/**
 * Forme, etichette e font dell'atelier divise — condivisi tra il renderer SVG
 * (KitShirt) e il tavolo da lavoro react-konva (KitEditor), senza cicli.
 */

import type { KitDecalShape, KitFont } from '../../src/core/types';

/** Le forme GEOMETRICHE (path centrati sull'origine, raggio ~6 unità di viewBox). */
export type GeomShape = Exclude<KitDecalShape, 'testo' | 'logo'>;

export const DECAL_D: Record<GeomShape, string> = {
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

export const DECAL_LABEL: Record<GeomShape, string> = {
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

export const GEOM_SHAPES = Object.keys(DECAL_D) as GeomShape[];

/** Stack web-safe dei caratteri per le scritte (identici in SVG e Konva). */
export const FONT_FAMILY: Record<KitFont, string> = {
  block: 'Verdana, sans-serif',
  corsivo: '"Brush Script MT", "Segoe Script", cursive',
  serif: 'Georgia, serif',
};

export const FONT_LABEL: Record<KitFont, string> = {
  block: 'Stampatello',
  corsivo: 'Corsivo',
  serif: 'Serif',
};

/** Limiti dell'editor (anche per il peso dei salvataggi). */
export const MAX_DECALS = 8;
export const MAX_LOGOS = 3;
export const MAX_TEXT_LEN = 14;
