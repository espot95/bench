/**
 * Il PLANISFERO dell'estate (MODULE_EVENTS, richiesta utente): ritiri e tour scelti
 * sulla mappa del mondo. Parte dalla città del club e "si apre" sul mondo; i pin
 * (🏔 ritiri, ✈ tour) si ACCENDONO alla scelta con un alone pulsante, gli altri si
 * spengono, e il tour disegna la rotta di volo animata dalla tua città. Riusa la
 * basemap senza chiave (ui/basemap.ts) tinta col colore sociale.
 */

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { RITIRO_SPOTS, TOUR_DESTINATIONS } from '../../src/engine/events';
import { addBasemap, clubTintFilter } from './basemap';
import { type GameSession, chooseRitiro, chooseTour, summerView } from './game';
import type { ClubIdentity } from './identity';

const M = (n: number) => `${(n / 1e6).toFixed(1)}M`;

type Sel = { kind: 'ritiro' | 'tour'; id: string } | null;

function pinHtml(kind: 'ritiro' | 'tour', state: 'idle' | 'on' | 'off'): string {
  const glyph = kind === 'ritiro' ? '🏔️' : '✈️';
  return `<div class="summer-pin ${state === 'on' ? 'pin-on' : state === 'off' ? 'pin-off' : ''}">${glyph}</div>`;
}

function pinIcon(kind: 'ritiro' | 'tour', state: 'idle' | 'on' | 'off'): L.DivIcon {
  return L.divIcon({
    html: pinHtml(kind, state),
    className: 'hub-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function SummerMap({
  session,
  id,
  onMsg,
}: {
  session: GameSession;
  id: ClubIdentity;
  onMsg: (msg: string) => void;
}) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const pathRef = useRef<L.Polyline | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const selRef = useRef(setSel);

  const summer = summerView(session);
  const home: [number, number] = [id.city.lat, id.city.lon];

  /** Accende il pin scelto, spegne i fratelli; per il tour disegna la rotta animata. */
  const decorate = (map: L.Map, kind: 'ritiro' | 'tour', chosenId: string | null) => {
    if (!chosenId) return;
    const pool = kind === 'ritiro' ? RITIRO_SPOTS : TOUR_DESTINATIONS;
    for (const item of pool) {
      const m = markers.current.get(`${kind}:${item.id}`);
      if (m) m.setIcon(pinIcon(kind, item.id === chosenId ? 'on' : 'off'));
    }
    if (kind === 'tour') {
      const dest = TOUR_DESTINATIONS.find((d) => d.id === chosenId);
      if (dest) {
        pathRef.current?.remove();
        pathRef.current = L.polyline([home, [dest.lat, dest.lon]], {
          color: id.accent,
          weight: 2,
          opacity: 0.85,
          dashArray: '8 10',
          className: 'flight-path',
        }).addTo(map);
      }
    }
  };

  // La mappa si costruisce UNA volta; le scelte già fatte si accendono subito.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mappa Leaflet costruita una volta al mount (identità e sessione stabili nel ciclo di vita del pannello)
  useEffect(() => {
    if (!mapDiv.current) return;
    const map = L.map(mapDiv.current, {
      center: home,
      zoom: 4,
      minZoom: 2,
      maxZoom: 7,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
    });
    map.attributionControl.setPrefix('');
    addBasemap(map);
    const pane = map.getPane('tilePane');
    if (pane) pane.style.filter = clubTintFilter(id.hue, 2.2, 1.9);

    // Casa tua: l'anello acceso da cui parte tutto.
    L.marker(home, {
      icon: L.divIcon({
        html: `<svg width="22" height="22" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="${id.accent}" stroke-width="3"/><circle cx="10" cy="10" r="2.5" fill="${id.accent}"/></svg>`,
        className: 'hub-marker',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      interactive: false,
    }).addTo(map);

    const addPin = (
      kind: 'ritiro' | 'tour',
      itemId: string,
      lat: number,
      lon: number,
      tooltip: string,
    ) => {
      const m = L.marker([lat, lon], { icon: pinIcon(kind, 'idle') }).addTo(map);
      m.bindTooltip(tooltip, { direction: 'top', offset: [0, -10], className: 'city-label' });
      m.on('click', () => {
        selRef.current({ kind, id: itemId });
        map.flyTo([lat, lon], Math.max(4, map.getZoom()), { duration: 0.8 });
      });
      markers.current.set(`${kind}:${itemId}`, m);
    };
    for (const r of RITIRO_SPOTS) {
      addPin(
        'ritiro',
        r.id,
        r.lat ?? id.city.lat,
        r.lon ?? id.city.lon,
        `🏔 ${r.name} · strutture ${r.quality}/100 · ${M(r.cost)}`,
      );
    }
    for (const d of summerView(session).tours) {
      const dest = TOUR_DESTINATIONS.find((x) => x.id === d.id);
      if (!dest) continue;
      addPin(
        'tour',
        d.id,
        dest.lat,
        dest.lon,
        `✈ ${d.name} · stima ${M(d.estimate)}${d.affinity ? ' · ★ mercato caldo' : ''}`,
      );
    }

    // Le scelte già fatte brillano da subito (anche a stagione avviata).
    const sv = summerView(session);
    decorate(map, 'ritiro', sv.ritiroId);
    decorate(map, 'tour', sv.tourId);

    // L'apertura: dalla tua città il mondo si spalanca.
    const t = window.setTimeout(() => map.flyTo([28, 15], 2, { duration: 1.7 }), 450);

    mapRef.current = map;
    return () => {
      window.clearTimeout(t);
      markers.current.clear();
      pathRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  const confirm = () => {
    if (!sel || !mapRef.current) return;
    const msg = sel.kind === 'ritiro' ? chooseRitiro(session, sel.id) : chooseTour(session, sel.id);
    onMsg(msg);
    decorate(
      mapRef.current,
      sel.kind,
      (sel.kind === 'ritiro' ? summerView(session).ritiroId : summerView(session).tourId) ?? null,
    );
    setSel(null);
  };

  // La scheda della meta selezionata (overlay in basso).
  const detail = (() => {
    if (!sel) return null;
    if (sel.kind === 'ritiro') {
      const r = summer.ritiri.find((x) => x.id === sel.id);
      if (!r) return null;
      return {
        title: `🏔 ${r.name}`,
        line: `strutture ${r.quality}/100 · ${r.blurb}`,
        money: `costo ${M(r.cost)}`,
        moneyTone: 'text-red-300',
        action: 'Prenota il ritiro',
        already: summer.ritiroId != null,
      };
    }
    const t = summer.tours.find((x) => x.id === sel.id);
    if (!t) return null;
    return {
      title: `✈ ${t.name}`,
      line: `${t.distance === 'lontano' ? 'volo lungo: gambe pesanti al rientro' : t.distance === 'medio' ? 'trasferta media' : 'dietro casa'}${t.affinity ? ' · ★ mercato caldo' : ''}`,
      money: `stima ${M(t.estimate)}`,
      moneyTone: t.estimate >= 0 ? 'text-emerald-300' : 'text-red-300',
      action: 'Parti in tour',
      already: summer.tourId != null,
    };
  })();

  return (
    <div className="anim-in relative overflow-hidden rounded-lg border border-zinc-700">
      <div ref={mapDiv} className="h-[420px] w-full" />
      {/* stato dell'estate, sopra la mappa */}
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg border border-zinc-700/80 bg-zinc-950/85 px-3 py-2 text-xs backdrop-blur">
        <div>
          🏔 Ritiro:{' '}
          <b className={summer.ritiroId ? 'text-emerald-300' : 'text-zinc-400'}>
            {summer.ritiri.find((r) => r.id === summer.ritiroId)?.name ?? '— da scegliere'}
          </b>
        </div>
        <div>
          ✈ Tour:{' '}
          <b className={summer.tourId ? 'text-emerald-300' : 'text-zinc-400'}>
            {summer.tours.find((t) => t.id === summer.tourId)?.name ?? '— da scegliere'}
          </b>
        </div>
        {summer.locked && !summer.ritiroId && !summer.tourId && (
          <div className="mt-1 text-zinc-500">stagione in corso: se ne riparla in estate</div>
        )}
      </div>
      {/* scheda della meta cliccata */}
      {detail && (
        <div className="note-in absolute bottom-3 left-1/2 z-[1000] w-[min(92%,440px)] -translate-x-1/2 rounded-lg border border-zinc-600 bg-zinc-950/95 p-3 text-sm backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-bold">{detail.title}</span>
            <span className={`text-xs font-semibold ${detail.moneyTone}`}>{detail.money}</span>
          </div>
          <div className="mt-0.5 text-xs text-zinc-400">{detail.line}</div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSel(null)}
              className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Chiudi
            </button>
            {!summer.locked && !detail.already && (
              <button
                type="button"
                onClick={confirm}
                className="rounded px-3 py-1 text-xs font-bold text-zinc-950"
                style={{ background: id.accent }}
              >
                {detail.action}
              </button>
            )}
            {detail.already && (
              <span className="text-[11px] text-zinc-500">già deciso per quest'estate</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
