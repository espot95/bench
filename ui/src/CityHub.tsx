/**
 * L'hub del club (MODULE_UI §3, richiesta utente): la mappa reale della città, scura,
 * a schermo intero e senza cornice, con i dettagli (strade) tinti del colore sociale.
 * Le strutture attive si aprono al click (con zoomata), le altre sono "in costruzione";
 * al passaggio del mouse le strutture mostrano un'anteprima.
 */

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { type ClubIdentity, type GeoCity, spreadLat } from './identity';

export type Structure = 'stadio' | 'campo' | 'staff';

const OFF = '#71717a';

/** Segnaposti d'epoca, coerenti con lo stile della vetrina: forme semplici, un colore. */
const SHAPES: Record<string, (c: string) => string> = {
  ring: (c) =>
    `<svg width="24" height="24" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="${c}" stroke-width="3"/><circle cx="10" cy="10" r="2.5" fill="${c}"/></svg>`,
  square: (c) =>
    `<svg width="18" height="18" viewBox="0 0 20 20"><rect x="4" y="4" width="12" height="12" rx="3" fill="${c}" opacity="0.92"/></svg>`,
  diamond: (c) =>
    `<svg width="18" height="18" viewBox="0 0 20 20"><rect x="5.5" y="5.5" width="9" height="9" rx="2" fill="${c}" opacity="0.92" transform="rotate(45 10 10)"/></svg>`,
  dot: (c) =>
    `<svg width="14" height="14" viewBox="0 0 20 20"><circle cx="10" cy="10" r="5" fill="${c}" opacity="0.9"/></svg>`,
  cross: (c) =>
    `<svg width="16" height="16" viewBox="0 0 20 20"><path d="M8 3h4v5h5v4h-5v5H8v-5H3V8h5Z" fill="${c}" opacity="0.9"/></svg>`,
  triangle: (c) =>
    `<svg width="16" height="16" viewBox="0 0 20 20"><path d="M10 3 L17 16 H3 Z" fill="${c}" opacity="0.9"/></svg>`,
};

/** Marker extra: strutture del club in città (costruite o in cantiere). */
export interface CityExtra {
  key: string;
  name: string;
  lat: number;
  lon: number;
  building: boolean;
}

export function CityHub({
  id,
  onEnter,
  matchPending = false,
  details = {},
  extras = [],
  placing = null,
  onPlace,
  onInspect,
  fans,
}: {
  id: ClubIdentity;
  onEnter: (b: Structure) => void;
  /** Se c'è una giornata da giocare, l'anello dello stadio pulsa. */
  matchPending?: boolean;
  /** Anteprima mostrata sotto l'etichetta al passaggio del mouse. */
  details?: Partial<Record<Structure, string>>;
  extras?: CityExtra[];
  /** Nome della struttura in piazzamento: la mappa aspetta un click col mirino. */
  placing?: string | null;
  onPlace?: (lat: number, lon: number) => void;
  onInspect?: (key: string) => void;
  /** Zone di tifo (mostrate durante il piazzamento): intensità w in [0.4..1]. */
  fans?: { lat: number; lon: number; r: number; w: number }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let navTimer: number | undefined;
    const map = L.map(ref.current, {
      center: [id.city.lat, id.city.lon],
      zoom: 13,
      minZoom: 12,
      maxZoom: 15,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: false,
      maxBounds: [
        [id.city.lat - 0.12, id.city.lon - 0.2],
        [id.city.lat + 0.12, id.city.lon + 0.2],
      ],
      attributionControl: true,
    });
    map.attributionControl.setPrefix('');
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Tinta del club sulle tile scure: sepia porta tutto su ~40° di tonalità,
    // hue-rotate la sposta sulla tonalità sociale — le strade prendono il colore.
    const pane = map.getPane('tilePane');
    if (pane) {
      // Contrasto naturale delle tile, ma più luce: la città si vede bene.
      pane.style.filter = `sepia(1) hue-rotate(${id.hue - 40}deg) saturate(2.6) brightness(2.5)`;
    }

    const add = (
      geo: GeoCity,
      shape: keyof typeof SHAPES,
      label: string,
      target?: Structure,
      pulse = false,
    ) => {
      const active = target !== undefined;
      const m = L.marker([geo.lat, geo.lon], {
        icon: L.divIcon({
          html: SHAPES[shape]!(active ? id.accent : OFF),
          className: pulse ? 'hub-marker hub-pulse' : 'hub-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        interactive: active,
      }).addTo(map);
      const base = active ? label : `${label} · in costruzione`;
      m.bindTooltip(base, {
        permanent: true,
        direction: 'right',
        offset: [12, 0],
        className: active ? 'city-label' : 'city-label city-label-off',
      });
      if (target && !placing) {
        // Zoomata sul luogo prima di entrare: il click diventa un "arrivare lì".
        m.on('click', () => {
          map.flyTo([geo.lat, geo.lon], 14, { duration: 0.7 });
          navTimer = window.setTimeout(() => onEnter(target), 780);
        });
        const detail = details[target];
        if (detail) {
          m.on('mouseover', () =>
            m.setTooltipContent(`${base}<div class="city-sub">${detail}</div>`),
          );
          m.on('mouseout', () => m.setTooltipContent(base));
        }
      }
    };

    // Copie distanziate in latitudine (min ~830 m): a minZoom 12 sono ≥30 px,
    // più dell'altezza di un'etichetta — nessuna sovrapposizione possibile.
    const [stadium, training, sede, scouting, infermeria, giovanile] = spreadLat(
      [id.stadium, id.training, id.sede, id.scouting, id.infermeria, id.giovanile].map((g) => ({
        ...g,
      })),
      0.0075,
    );
    add(stadium!, 'ring', 'Stadio', 'stadio', matchPending);
    add(training!, 'square', "Campo d'allenamento", 'campo');
    add(sede!, 'diamond', 'Sede del club — Presidenza', 'staff');
    add(scouting!, 'dot', 'Palazzina scouting');
    add(infermeria!, 'cross', 'Infermeria');
    add(giovanile!, 'triangle', 'Settore giovanile');

    // Strutture del club in città: casetta (finita) o gru (cantiere), cliccabili.
    const house = `<svg width="18" height="18" viewBox="0 0 20 20"><path d="M10 3 L17 9 V17 H3 V9 Z" fill="${id.accent}" opacity="0.95"/></svg>`;
    const craneSvg = `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M9 17 V5 H16 M12.5 5 V9" stroke="#e0b13e" stroke-width="2" fill="none"/><rect x="7.4" y="16" width="5.2" height="2" fill="#e0b13e"/></svg>`;
    for (const ex of extras) {
      const m = L.marker([ex.lat, ex.lon], {
        icon: L.divIcon({
          html: ex.building ? craneSvg : house,
          className: 'hub-marker',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(map);
      m.bindTooltip(ex.building ? `${ex.name} · cantiere` : ex.name, {
        permanent: true,
        direction: 'right',
        offset: [11, 0],
        className: 'city-label',
      });
      if (onInspect) m.on('click', () => onInspect(ex.key));
    }

    // Modalità piazzamento: mirino, click-to-build e ZONE DI TIFO colorate.
    if (placing && onPlace) {
      map.getContainer().style.cursor = 'crosshair';
      map.on('click', (e: L.LeafletMouseEvent) => onPlace(e.latlng.lat, e.latlng.lng));
      for (const z of fans ?? []) {
        const color = z.w >= 0.85 ? '#ef4444' : z.w >= 0.6 ? '#f97316' : '#eab308';
        // Due anelli concentrici per un alone morbido da "heatmap".
        L.circle([z.lat, z.lon], {
          radius: z.r * 111_000,
          color,
          weight: 1,
          opacity: 0.35,
          fillColor: color,
          fillOpacity: 0.14,
          interactive: false,
        }).addTo(map);
        L.circle([z.lat, z.lon], {
          radius: z.r * 111_000 * 0.5,
          stroke: false,
          fillColor: color,
          fillOpacity: 0.22,
          interactive: false,
        }).addTo(map);
      }
    }

    return () => {
      if (navTimer !== undefined) window.clearTimeout(navTimer);
      map.remove();
    };
  }, [id, onEnter, matchPending, details, extras, placing, onPlace, onInspect, fans]);

  return <div ref={ref} className="h-full w-full" />;
}
