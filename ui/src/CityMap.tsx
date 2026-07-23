/**
 * Real-city map (MODULE_UI, richiesta utente): dark OSM tiles via Leaflet, with small
 * elegant club-coloured markers for the stadium and the training ground.
 */

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { type ClubIdentity, spreadLat } from './identity';

function dot(color: string, size: number, ring = false): L.DivIcon {
  const s = size;
  const html = ring
    ? `<svg width="${s}" height="${s}" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="${color}" stroke-width="3"/><circle cx="10" cy="10" r="2.5" fill="${color}"/></svg>`
    : `<svg width="${s}" height="${s}" viewBox="0 0 20 20"><rect x="4" y="4" width="12" height="12" rx="3" fill="${color}" opacity="0.9"/></svg>`;
  return L.divIcon({ html, className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
}

export function CityMap({ id }: { id: ClubIdentity }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, {
      center: [id.city.lat, id.city.lon],
      zoom: 12,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(''); // togli "Leaflet |"; ©OSM/©CARTO deve restare (licenza tile)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const [stadium, training] = spreadLat(
      [id.stadium, id.training].map((g) => ({ ...g })),
      0.0075,
    );
    L.marker([stadium!.lat, stadium!.lon], { icon: dot(id.accent, 18, true) })
      .addTo(map)
      .bindTooltip('Stadio', {
        permanent: true,
        direction: 'right',
        offset: [10, 0],
        className: 'city-label',
      });
    L.marker([training!.lat, training!.lon], { icon: dot(id.primary, 14) })
      .addTo(map)
      .bindTooltip('Centro sportivo', {
        permanent: true,
        direction: 'right',
        offset: [8, 0],
        className: 'city-label',
      });

    return () => {
      map.remove();
    };
  }, [id]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <div className="bg-zinc-950/80 px-3 py-1.5 text-xs uppercase tracking-wide text-zinc-500">
        {id.city.name} — la casa del club
      </div>
      <div ref={ref} className="h-56 w-full" />
    </div>
  );
}
