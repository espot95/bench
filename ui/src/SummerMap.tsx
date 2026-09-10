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
import { Sparkline } from './charts';
import {
  type GameSession,
  buildTerritoryShop,
  chooseRitiro,
  chooseTour,
  empireView,
  foundTerritoryFanClub,
  summerView,
  territoryView,
} from './game';
import { NATION_COORDS } from './geo';
import type { ClubIdentity } from './identity';

const M = (n: number) => `${(n / 1e6).toFixed(1)}M`;
const FANS = (n: number) =>
  n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : `${Math.max(1, Math.round(n / 1000))}k`;

const RANK_TAG: Record<string, string> = {
  avamposto: '⛺ avamposto',
  colonia: '🏴 colonia',
  roccaforte: '🏰 roccaforte',
  impero: '👑 impero',
};

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
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  /** Territorio aperto (zoom nella nazione) e modalità piazzamento asset. */
  const [territory, setTerritory] = useState<string | null>(null);
  const territoryRef = useRef<string | null>(null);
  territoryRef.current = territory;
  const [placing, setPlacing] = useState<'shop' | 'fanclub' | null>(null);
  const placingRef = useRef<'shop' | 'fanclub' | null>(null);
  placingRef.current = placing;
  const openTerritoryRef = useRef<(nation: string) => void>(() => {});

  const summer = summerView(session);
  const home: [number, number] = [id.city.lat, id.city.lon];

  const assetIcon = (kind: 'shop' | 'fanclub') =>
    L.divIcon({
      html: `<div class="asset-pin">${kind === 'shop' ? '🏪' : '🏠'}</div>`,
      className: 'hub-marker',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

  const drawAssetPin = (
    map: L.Map,
    nation: string,
    kind: 'shop' | 'fanclub',
    lat: number,
    lon: number,
  ) => {
    L.marker([lat, lon], { icon: assetIcon(kind) })
      .addTo(map)
      .bindTooltip(
        kind === 'shop' ? `🏪 negozio del club (${nation})` : `🏠 sede fan club (${nation})`,
        {
          direction: 'top',
          offset: [0, -8],
          className: 'city-label',
        },
      );
  };

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

    // ---- L'IMPERO (richiesta utente): i territori occupati come in un gioco di
    // guerra — zona d'influenza che respira, targa col rango, rotta di rifornimento
    // verso casa, spade per i territori contesi, bersagli sugli obiettivi sponsor.
    const empire = empireView(session);
    for (const m of empire.markets) {
      const at = NATION_COORDS[m.nation];
      if (!at) continue;
      const radius = Math.min(1_100_000, 180_000 + Math.sqrt(Math.max(m.fans, 1)) * 1100);
      L.circle(at, {
        radius,
        color: m.covered ? id.accent : '#71717a',
        weight: m.rivals > 0 ? 2 : 1,
        dashArray: m.rivals > 0 ? '6 6' : undefined,
        opacity: 0.7,
        fillColor: m.covered ? id.accent : '#71717a',
        fillOpacity: 0.16,
        className: 'territory-zone',
        interactive: false,
      }).addTo(map);
      // Rotta di rifornimento: sottile, dal cuore dell'impero.
      L.polyline([home, at], {
        color: id.accent,
        weight: 1,
        opacity: 0.3,
        dashArray: '2 8',
        className: 'supply-path',
        interactive: false,
      }).addTo(map);
      const tag = L.marker(at, {
        icon: L.divIcon({
          html: `<div class="territory-tag">${m.nation} · ${FANS(m.fans)} ${RANK_TAG[m.rank]}${m.rivals > 0 ? ' ⚔' : ''}${m.streak >= 3 ? ' 📺' : ''}</div>`,
          className: 'hub-marker',
          iconSize: [10, 10],
          iconAnchor: [5, -8],
        }),
      }).addTo(map);
      tag.bindTooltip(
        `${FANS(m.fans)} tifosi · stirpe ${m.streak} stagion${m.streak === 1 ? 'e' : 'i'} · guarnigione ${m.garrison} in rosa${m.rivals > 0 ? ` · CONTESO da ${m.rivalTop.map((r) => r.name).join(', ')}` : ''}${m.invested ? ' · 💼 sponsor investe' : ''}${m.covered ? '' : ' · ⚠ senza giocatori si spegne'} — clicca per entrare`,
        { direction: 'top', offset: [0, -12], className: 'city-label' },
      );
      // Dentro il territorio: pannello asset (negozi/fan club) e zoom.
      tag.on('click', () => openTerritoryRef.current(m.nation));
      // Anello RIVALE (impero v2): la pressione degli altri club sul territorio.
      const rivalWeight = m.rivalTop.reduce((a, r) => a + r.weight, 0);
      if (rivalWeight > 0) {
        const mine = Math.max(0.01, (m.garrison || 0.5) * (session.club.reputation / 100) ** 2);
        const ratio = Math.min(2.2, rivalWeight / mine);
        L.circle(at, {
          radius: radius * (0.55 + 0.45 * ratio),
          color: '#ef4444',
          weight: 1.5,
          dashArray: '4 7',
          opacity: 0.55,
          fill: false,
          className: 'rival-ring',
          interactive: false,
        }).addTo(map);
      }
    }
    // Gli asset già piazzati (negozi/sedi) su tutti i territori.
    for (const [nation, pins] of Object.entries(session.territoryPins ?? {})) {
      for (const p of pins) drawAssetPin(map, nation, p.kind, p.lat, p.lon);
    }
    // Gli ordini dello sponsor: bersagli sul planisfero.
    for (const t of empire.targets) {
      const at = NATION_COORDS[t.nation];
      if (!at) continue;
      const m = L.marker([at[0] + 4, at[1]], {
        icon: L.divIcon({
          html: '<div class="objective-pin">🎯</div>',
          className: 'hub-marker',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(map);
      m.bindTooltip(
        t.kind === 'mercato'
          ? `🎯 ${t.brand}: porta un giocatore ${t.nation} in rosa (+${Math.round(t.bonusPct * 100)}%)`
          : `🎯 ${t.brand}: porta il TOUR in ${t.nation} (+${Math.round(t.bonusPct * 100)}%)`,
        { direction: 'top', offset: [0, -12], className: 'city-label' },
      );
    }

    // Le scelte già fatte brillano da subito (anche a stagione avviata).
    const sv = summerView(session);
    decorate(map, 'ritiro', sv.ritiroId);
    decorate(map, 'tour', sv.tourId);

    // Apertura di un territorio: zoom nella nazione (impero v2).
    openTerritoryRef.current = (nation: string) => {
      const at = NATION_COORDS[nation];
      if (!at) return;
      setTerritory(nation);
      map.flyTo(at, 5, { duration: 0.9 });
    };
    // Piazzamento asset: il click sulla mappa fonda negozio/sede NEL punto scelto.
    map.on('click', (e: L.LeafletMouseEvent) => {
      const kind = placingRef.current;
      const nation = territoryRef.current;
      if (!kind || !nation) return;
      const before = (session.territoryPins?.[nation] ?? []).length;
      const msg =
        kind === 'shop'
          ? buildTerritoryShop(session, nation, e.latlng.lat, e.latlng.lng)
          : foundTerritoryFanClub(session, nation, e.latlng.lat, e.latlng.lng);
      onMsg(msg);
      if ((session.territoryPins?.[nation] ?? []).length > before) {
        drawAssetPin(map, nation, kind, e.latlng.lat, e.latlng.lng);
      }
      setPlacing(null);
      refresh();
    });

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

  // Mirino durante il piazzamento (come le strutture in città).
  useEffect(() => {
    const el = mapRef.current?.getContainer();
    if (el) el.style.cursor = placing ? 'crosshair' : '';
  }, [placing]);

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
      {/* il bollettino dell'impero */}
      {(() => {
        const e = empireView(session);
        return (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-[280px] rounded-lg border border-zinc-700/80 bg-zinc-950/85 px-3 py-2 text-xs backdrop-blur">
            <div className="font-bold uppercase tracking-widest text-zinc-400">
              🌍 il tuo impero
            </div>
            {e.markets.length === 0 ? (
              <div className="mt-1 text-zinc-500">
                Nessun territorio: si conquista con giocatori della nazione, sponsor che investono e
                tour.
              </div>
            ) : (
              <div className="mt-1 text-zinc-300">
                {e.markets.length} territor{e.markets.length === 1 ? 'io' : 'i'} ·{' '}
                <b>{FANS(e.totalFans)}</b> tifosi nel mondo
                {e.merch + e.tv > 0 && (
                  <>
                    {' '}
                    · rendita ~<b className="text-emerald-300">{M(e.merch + e.tv)}</b>/anno
                  </>
                )}
                {e.markets.some((m) => m.rivals > 0) && (
                  <div className="mt-0.5 text-amber-300/90">
                    ⚔ {e.markets.filter((m) => m.rivals > 0).length} conteso/i: i rivali reclutano
                    nelle stesse nazioni
                  </div>
                )}
              </div>
            )}
            {e.targets.length > 0 && (
              <div className="mt-1 text-zinc-400">
                🎯 {e.targets.length} obiettiv{e.targets.length === 1 ? 'o' : 'i'} sponsor sul
                planisfero
              </div>
            )}
            {e.totalHistory.length >= 2 && (
              <div className="mt-1.5">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600">
                  tifosi nel mondo, per stagione
                </div>
                <Sparkline values={e.totalHistory} color={id.accent} />
              </div>
            )}
          </div>
        );
      })()}

      {/* banner piazzamento asset */}
      {placing && territory && (
        <div className="note-in pointer-events-none absolute left-1/2 top-3 z-[1001] -translate-x-1/2 rounded-lg border border-amber-600/70 bg-zinc-950/90 px-4 py-2 text-xs text-amber-200 backdrop-blur">
          {placing === 'shop' ? '🏪' : '🏠'} Clicca il punto in {territory} dove aprire la{' '}
          {placing === 'shop' ? 'sede del negozio' : 'sede del fan club'}
        </div>
      )}

      {/* IL TERRITORIO (impero v2): dettaglio, storia, rivali, asset da piazzare */}
      {territory &&
        (() => {
          const tv = territoryView(session, territory);
          if (!tv) return null;
          return (
            <div className="note-in absolute right-3 top-3 z-[1001] w-[270px] rounded-lg border border-zinc-600 bg-zinc-950/95 p-3 text-xs backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="font-bold">
                  {territory} · {FANS(tv.fans)} tifosi
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTerritory(null);
                    setPlacing(null);
                    mapRef.current?.flyTo([28, 15], 2, { duration: 0.9 });
                  }}
                  className="rounded bg-zinc-800 px-1.5 text-zinc-400 hover:bg-zinc-700"
                >
                  ✕
                </button>
              </div>
              <div className="mt-0.5 text-zinc-500">
                stirpe {tv.streak} · 🏪 {tv.shops}/{tv.maxShops} negozi · 🏠 {tv.fanClubs}/3 sedi
              </div>
              {tv.history.length >= 2 ? (
                <div className="mt-1.5">
                  <Sparkline values={tv.history.map((h) => h.fans)} color={id.accent} width={240} />
                </div>
              ) : (
                <div className="mt-1 text-zinc-600">
                  La storia del territorio si scrive negli anni.
                </div>
              )}
              {tv.rivals.length > 0 && (
                <div className="mt-1.5 text-amber-300/90">
                  ⚔ Rivali qui: {tv.rivals.map((r) => `${r.name} (${r.count})`).join(' · ')}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!tv.canShop}
                  onClick={() => setPlacing(placing === 'shop' ? null : 'shop')}
                  title={
                    tv.canShop
                      ? 'apri un negozio: +15% merchandising qui'
                      : 'serve un territorio più grande (o cassa)'
                  }
                  className={`rounded border px-2 py-1 font-semibold disabled:opacity-40 ${
                    placing === 'shop'
                      ? 'border-amber-500 text-amber-300'
                      : 'border-zinc-600 hover:bg-zinc-800'
                  }`}
                >
                  🏪 Negozio ({(tv.shopCost / 1e6).toFixed(0)}M)
                </button>
                <button
                  type="button"
                  disabled={!tv.canFanClub}
                  onClick={() => setPlacing(placing === 'fanclub' ? null : 'fanclub')}
                  title={
                    tv.canFanClub
                      ? 'fonda una sede: crescita e tifosi che non ti mollano'
                      : 'servono 20k tifosi (o cassa)'
                  }
                  className={`rounded border px-2 py-1 font-semibold disabled:opacity-40 ${
                    placing === 'fanclub'
                      ? 'border-amber-500 text-amber-300'
                      : 'border-zinc-600 hover:bg-zinc-800'
                  }`}
                >
                  🏠 Sede fan club ({(tv.fanClubCost / 1e6).toFixed(0)}M)
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-zinc-600">
                A 100k tifosi e stirpe 3 le sedi nascono anche da sole: la piazza si organizza.
              </div>
            </div>
          );
        })()}
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
