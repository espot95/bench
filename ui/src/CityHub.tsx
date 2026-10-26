/**
 * L'hub del club (MODULE_UI §3, richiesta utente): la mappa reale della città, scura,
 * a schermo intero e senza cornice, con i dettagli (strade) tinti del colore sociale.
 * Le strutture attive si aprono al click (con zoomata), le altre sono "in costruzione";
 * al passaggio del mouse le strutture mostrano un'anteprima.
 *
 * REVISIONE: la mappa si crea UNA volta per città e non si ricrea più a ogni render
 * del genitore — i marker vivono in un layerGroup ridisegnato solo quando cambiano i
 * DATI (firma JSON), e gli handler si leggono da ref sempre freschi. Prima ogni
 * setState di App distruggeva la mappa (zoom perso, navigazione del click annullata).
 */

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { addBasemap, clubTintFilter } from './basemap';
import { type ClubIdentity, type GeoCity, spreadLat } from './identity';

export type Structure = 'stadio' | 'campo' | 'staff' | 'ufficio' | 'marketing' | 'giovanile';

const OFF = '#71717a';

/**
 * Colori FISSI ad alto contrasto per le strutture (richiesta utente): mai il colore
 * del club — sulla mappa tinta si mimetizzava. Oro per lo stadio, vivi e distinti.
 */
const STRUCT_COLOR: Record<Structure, string> = {
  stadio: '#fbbf24', // oro
  campo: '#38bdf8', // azzurro
  staff: '#e879f9', // magenta (la sede)
  ufficio: '#22d3ee', // ciano (il mondo)
  marketing: '#4ade80', // verde (i tifosi e i mercati)
  giovanile: '#a3e635', // lime (i germogli del vivaio)
};

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
  globe: (c) =>
    `<svg width="22" height="22" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="${c}" stroke-width="2"/><ellipse cx="10" cy="10" rx="3.2" ry="7" fill="none" stroke="${c}" stroke-width="1.4"/><line x1="3" y1="10" x2="17" y2="10" stroke="${c}" stroke-width="1.4"/></svg>`,
  megaphone: (c) =>
    `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 8.5 L12 5 V15 L3 11.5 Z" fill="${c}" opacity="0.92"/><path d="M13.5 6.5 A5 5 0 0 1 13.5 13.5" fill="none" stroke="${c}" stroke-width="1.6"/><rect x="4.5" y="11.5" width="3" height="4.5" rx="1" fill="${c}" opacity="0.92"/></svg>`,
};

/** Testo utente dentro HTML di tooltip: mai markup non voluto (nomi dai pack). */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Marker extra: strutture del club in città (costruite o in cantiere). */
export interface CityExtra {
  key: string;
  name: string;
  lat: number;
  lon: number;
  building: boolean;
}

interface CityHubProps {
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
}

export function CityHub(props: CityHubProps) {
  const { id } = props;
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Gli handler cambiano identità a ogni render del genitore: si leggono da ref,
  // così non entrano nelle dipendenze e non buttano giù la mappa.
  const cbRef = useRef(props);
  cbRef.current = props;

  const { lat: cityLat, lon: cityLon } = id.city;
  const hue = id.hue;

  // La MAPPA: una volta per città/tinta, mai più ricreata.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const map = L.map(el, {
      center: [cityLat, cityLon],
      zoom: 13,
      minZoom: 12,
      maxZoom: 15,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: false,
      maxBounds: [
        [cityLat - 0.12, cityLon - 0.2],
        [cityLat + 0.12, cityLon + 0.2],
      ],
      attributionControl: true,
    });
    map.attributionControl.setPrefix('');
    addBasemap(map);

    // Tinta del club (ui/basemap.ts): sepia porta tutto su ~40° di tonalità,
    // hue-rotate la sposta sulla tonalità sociale — le strade prendono il colore.
    const pane = map.getPane('tilePane');
    if (pane) pane.style.filter = clubTintFilter(hue, 2.6, 2.5);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      mapRef.current = null;
      layerRef.current = null;
      map.remove();
    };
  }, [cityLat, cityLon, hue]);

  // I MARKER: nel layerGroup, ridisegnati SOLO quando cambiano i dati veri
  // (firma serializzata) o quando la mappa è appena rinata (stessa città inclusa).
  const dataSig = JSON.stringify({
    accent: id.accent,
    spots: [
      id.stadium,
      id.training,
      id.sede,
      id.ufficio,
      id.marketing,
      id.scouting,
      id.infermeria,
      id.giovanile,
    ],
    matchPending: props.matchPending ?? false,
    details: props.details ?? {},
    extras: props.extras ?? [],
    placing: props.placing ?? null,
    fans: props.fans ?? [],
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: città/tinta servono APPOSTA — quando la mappa rinasce (stessi dati, città nuova) i marker vanno ridisegnati sul layer nuovo.
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const { matchPending, details, extras, placing, fans } = JSON.parse(dataSig) as {
      accent: string;
      spots: GeoCity[];
      matchPending: boolean;
      details: Partial<Record<Structure, string>>;
      extras: CityExtra[];
      placing: string | null;
      fans: { lat: number; lon: number; r: number; w: number }[];
    };
    const accent = cbRef.current.id.accent;
    let navTimer: number | undefined;

    const add = (
      geo: GeoCity,
      shape: keyof typeof SHAPES,
      label: string,
      target?: Structure,
      pulse = false,
    ) => {
      const draw = SHAPES[shape];
      if (!draw) return;
      const active = target !== undefined;
      const m = L.marker([geo.lat, geo.lon], {
        icon: L.divIcon({
          html: draw(active && target ? STRUCT_COLOR[target] : OFF),
          className: pulse ? 'hub-marker hub-pulse' : 'hub-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        interactive: active,
      }).addTo(group);
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
          navTimer = window.setTimeout(() => cbRef.current.onEnter(target), 780);
        });
        const detail = details[target];
        if (detail) {
          m.on('mouseover', () =>
            m.setTooltipContent(`${base}<div class="city-sub">${esc(detail)}</div>`),
          );
          m.on('mouseout', () => m.setTooltipContent(base));
        }
      }
    };

    // Copie distanziate in latitudine (min ~830 m): a minZoom 12 sono ≥30 px,
    // più dell'altezza di un'etichetta — nessuna sovrapposizione possibile.
    const geo = cbRef.current.id;
    const [stadium, training, sede, ufficio, marketing, scouting, infermeria, giovanile] =
      spreadLat(
        [
          geo.stadium,
          geo.training,
          geo.sede,
          geo.ufficio,
          geo.marketing,
          geo.scouting,
          geo.infermeria,
          geo.giovanile,
        ].map((g) => ({ ...g })),
        0.0075,
      );
    add(stadium!, 'ring', 'Stadio', 'stadio', matchPending);
    add(training!, 'square', "Campo d'allenamento", 'campo');
    add(sede!, 'diamond', 'Sede del club — Presidenza', 'staff');
    add(ufficio!, 'globe', 'Ufficio Commerciale — il mondo', 'ufficio');
    add(marketing!, 'megaphone', 'Ufficio Marketing — i tifosi', 'marketing');
    add(scouting!, 'dot', 'Palazzina scouting');
    add(infermeria!, 'cross', 'Infermeria');
    add(giovanile!, 'triangle', 'Settore giovanile — il vivaio', 'giovanile');

    // Strutture del club in città: casetta (finita) o gru (cantiere), cliccabili.
    const house = `<svg width="18" height="18" viewBox="0 0 20 20"><path d="M10 3 L17 9 V17 H3 V9 Z" fill="${accent}" opacity="0.95"/></svg>`;
    const craneSvg = `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M9 17 V5 H16 M12.5 5 V9" stroke="#e0b13e" stroke-width="2" fill="none"/><rect x="7.4" y="16" width="5.2" height="2" fill="#e0b13e"/></svg>`;
    for (const ex of extras) {
      const m = L.marker([ex.lat, ex.lon], {
        icon: L.divIcon({
          html: ex.building ? craneSvg : house,
          className: 'hub-marker',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(group);
      m.bindTooltip(ex.building ? `${esc(ex.name)} · cantiere` : esc(ex.name), {
        permanent: true,
        direction: 'right',
        offset: [11, 0],
        className: 'city-label',
      });
      m.on('click', () => cbRef.current.onInspect?.(ex.key));
    }

    // Modalità piazzamento: mirino, click-to-build e ZONE DI TIFO colorate.
    map.getContainer().style.cursor = placing ? 'crosshair' : '';
    const onMapClick = (e: L.LeafletMouseEvent) =>
      cbRef.current.onPlace?.(e.latlng.lat, e.latlng.lng);
    if (placing) {
      map.on('click', onMapClick);
      for (const z of fans) {
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
        }).addTo(group);
        L.circle([z.lat, z.lon], {
          radius: z.r * 111_000 * 0.5,
          stroke: false,
          fillColor: color,
          fillOpacity: 0.22,
          interactive: false,
        }).addTo(group);
      }
    }

    return () => {
      if (navTimer !== undefined) window.clearTimeout(navTimer);
      if (placing) map.off('click', onMapClick);
    };
  }, [dataSig, cityLat, cityLon, hue]);

  return <div ref={ref} className="h-full w-full" />;
}
