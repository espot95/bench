/**
 * UFFICIO COMMERCIALE (richiesta utente): dall'edificio in città si apre il
 * planisfero dell'influenza a tutto schermo, come un gioco di guerra — le tue zone
 * nel colore sociale, il club DOMINANTE di ogni nazione nel SUO colore, lo spione
 * per accendere le zone di un club qualsiasi, le missioni di marketing coi "?" che
 * spiegano le regole. Qui si costruiscono negozi e sedi fan club nei territori.
 */

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TOUR_DESTINATIONS } from '../../src/engine/events';
import { Crest } from './Crest';
import { Help } from './Help';
import { Sparkline } from './charts';
import { DualLines } from './charts';
import {
  type GameSession,
  buildTerritoryShop,
  chooseTour,
  clubZones,
  dsReminderPending,
  empireView,
  foundTerritoryFanClub,
  influenceCompare,
  influenceView,
  leaveDsReminder,
  nationBrands,
  selectorClubs,
  summerView,
  territoryView,
} from './game';
import { NATION_COORDS } from './geo';
import { type ClubIdentity, clubIdentity } from './identity';
import { countryFeature } from './worldShapes';

const M = (n: number) => `${(n / 1e6).toFixed(1)}M`;
const FANS = (n: number) =>
  n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : `${Math.max(1, Math.round(n / 1000))}k`;

const RANK_TAG: Record<string, string> = {
  avamposto: '⛺ avamposto',
  colonia: '🏴 colonia',
  roccaforte: '🏰 roccaforte',
  impero: '👑 impero',
};

/** Lo STEMMA del club con il nome sotto (richiesta utente: "capire chi è"). */
function crestFlagHtml(
  identity: ClubIdentity,
  name: string,
  reputation: number,
  mine: boolean,
): string {
  const crest = renderToStaticMarkup(
    <Crest id={identity} name={name} reputation={reputation} className="h-9 w-9" />,
  );
  return `<div class="dom-flag">${crest}<div class="dom-name" style="border-color:${identity.accent}">${mine ? '⭐ ' : ''}${name}</div></div>`;
}

/** Disegna la NAZIONE colorata (poligono vero; cerchio di riserva se manca la forma). */
function paintNation(
  map: L.Map,
  nation: string,
  at: [number, number],
  opts: {
    color: string;
    fillOpacity: number;
    weight?: number;
    dashArray?: string;
    className?: string;
    onClick?: () => void;
  },
  layer?: L.LayerGroup,
): void {
  const target = layer ?? map;
  const shape = countryFeature(nation);
  if (shape) {
    const g = L.geoJSON(shape, {
      style: {
        color: opts.color,
        weight: opts.weight ?? 1.2,
        dashArray: opts.dashArray,
        opacity: 0.9,
        fillColor: opts.color,
        fillOpacity: opts.fillOpacity,
        className: opts.className,
      },
      interactive: opts.onClick !== undefined,
    });
    if (opts.onClick) g.on('click', opts.onClick);
    g.addTo(target as L.Map);
  } else {
    const c = L.circle(at, {
      radius: 450_000,
      color: opts.color,
      weight: opts.weight ?? 1.2,
      dashArray: opts.dashArray,
      opacity: 0.9,
      fillColor: opts.color,
      fillOpacity: opts.fillOpacity,
      className: opts.className,
      interactive: opts.onClick !== undefined,
    });
    if (opts.onClick) c.on('click', opts.onClick);
    c.addTo(target as L.Map);
  }
}

export function CommercialMap({
  session,
  id,
  onBack,
  onScout,
}: {
  session: GameSession;
  id: ClubIdentity;
  onBack: () => void;
  /** "Cerca giocatori di questa nazione": apre il mercato col filtro pronto. */
  onScout: (nation: string) => void;
}) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const spyLayer = useRef<L.LayerGroup | null>(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [territory, setTerritory] = useState<string | null>(null);
  const territoryRef = useRef<string | null>(null);
  territoryRef.current = territory;
  const [placing, setPlacing] = useState<'shop' | 'fanclub' | null>(null);
  const placingRef = useRef<'shop' | 'fanclub' | null>(null);
  placingRef.current = placing;
  const [spyClub, setSpyClub] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);
  const openTerritoryRef = useRef<(nation: string) => void>(() => {});
  /** Lo stato cliccato: apre la BARRA AZIONI in basso. `viaDominant` = click sullo
   *  stemma del club dominante → si sblocca il Confronto storico (richiesta utente). */
  const [focus, setFocus] = useState<{ nation: string; viaDominant: boolean } | null>(null);
  const focusRef = useRef<(nation: string, viaDominant?: boolean) => void>(() => {});
  focusRef.current = (nation: string, viaDominant = false) => {
    setFocus({ nation, viaDominant });
    setPanel(null);
  };
  /** Pannelli aperti dalla barra: sponsor della nazione / confronto storico. */
  const [panel, setPanel] = useState<'sponsor' | 'confronto' | null>(null);

  const home: [number, number] = [id.city.lat, id.city.lon];
  const empire = empireView(session);
  const influence = influenceView(session);
  const clubs = selectorClubs(session);

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
        kind === 'shop'
          ? `🏪 negozio del club (${nation}): +15% merchandising qui`
          : `🏠 sede fan club (${nation}): i tifosi non ti mollano`,
        { direction: 'top', offset: [0, -8], className: 'city-label' },
      );
  };

  // La mappa (una volta): zone tue, dominanti, asset, bersagli sponsor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mappa Leaflet costruita una volta al mount
  useEffect(() => {
    if (!mapDiv.current) return;
    const map = L.map(mapDiv.current, {
      center: [28, 15],
      zoom: 2,
      minZoom: 2,
      maxZoom: 7,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
    });
    map.attributionControl.setPrefix('');
    // Basemap neutra scura ma TINTA leggera del club (coerenza con le altre mappe).
    import('./basemap').then(({ addBasemap, clubTintFilter }) => {
      addBasemap(map);
      const pane = map.getPane('tilePane');
      if (pane) pane.style.filter = clubTintFilter(id.hue, 1.6, 1.6);
    });

    // Casa: anello ORO ad alto contrasto (le strutture non usano più i colori club).
    L.marker(home, {
      icon: L.divIcon({
        html: '<svg width="24" height="24" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="#fbbf24" stroke-width="3"/><circle cx="10" cy="10" r="2.5" fill="#fbbf24"/></svg>',
        className: 'hub-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
      interactive: false,
    })
      .addTo(map)
      .bindTooltip('Casa tua', { direction: 'top', offset: [0, -10], className: 'city-label' });

    // I TUOI territori: la NAZIONE si colora del tuo colore (più tifosi = più intensa).
    for (const m of empire.markets) {
      const at = NATION_COORDS[m.nation];
      if (!at) continue;
      paintNation(map, m.nation, at, {
        color: m.covered ? id.accent : '#71717a',
        fillOpacity: Math.min(0.5, 0.16 + Math.sqrt(Math.max(m.fans, 0)) / 3200),
        weight: m.rivals > 0 ? 2 : 1.2,
        dashArray: m.rivals > 0 ? '6 6' : undefined,
        className: 'territory-zone',
        onClick: () => focusRef.current(m.nation),
      });
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
          iconAnchor: [5, 24],
        }),
      }).addTo(map);
      tag.bindTooltip(
        `${FANS(m.fans)} tifosi tuoi · guarnigione ${m.garrison} in rosa${m.rivals > 0 ? ` · contendenti: ${m.rivalTop.map((r) => r.name).join(', ')}` : ''} — clicca per gestire il territorio`,
        { direction: 'top', offset: [0, -12], className: 'city-label' },
      );
      tag.on('click', () => focusRef.current(m.nation));
    }

    // Il club DOMINANTE di ogni nazione: lo STATO si illumina del SUO colore, con
    // lo stemma e il nome sotto (richiesta utente). Dove il dominante sei tu, ⭐.
    const myMarkets = new Set(empire.markets.map((m) => m.nation));
    for (const row of influence) {
      const at = NATION_COORDS[row.nation];
      if (!at || !row.dominant) continue;
      const rivalId = row.dominant.mine
        ? id
        : clubIdentity(
            row.dominant.name,
            row.dominant.reputation,
            row.dominant.league,
            row.dominant.nationCode,
          );
      // Il colore-nazione del rivale solo dove NON hai già la tua zona.
      if (!row.dominant.mine && !myMarkets.has(row.nation)) {
        paintNation(map, row.nation, at, {
          color: rivalId.accent,
          fillOpacity: 0.2,
          weight: 1.4,
          onClick: () => focusRef.current(row.nation),
        });
      }
      const flag = L.marker(at, {
        icon: L.divIcon({
          html: crestFlagHtml(
            rivalId,
            row.dominant.name,
            row.dominant.reputation,
            row.dominant.mine,
          ),
          className: 'hub-marker',
          iconSize: [10, 10],
          iconAnchor: [5, myMarkets.has(row.nation) ? -22 : 5],
        }),
      }).addTo(map);
      // Click sullo STEMMA del dominante: barra con Confronto storico sbloccato.
      flag.on('click', () => focusRef.current(row.nation, true));
      flag.bindTooltip(
        row.dominant.mine
          ? `Qui il club dominante sei TU (più giocatori ${row.nation} pesati per fama).`
          : `${row.dominant.name} è il club più presente su ${row.nation}: più giocatori ${row.nation} in rosa, pesati per stelle e fama.`,
        { direction: 'top', offset: [0, -14], className: 'city-label' },
      );
    }

    // Bersagli sponsor.
    for (const t of empire.targets) {
      const at = NATION_COORDS[t.nation];
      if (!at) continue;
      L.marker([at[0] + 4, at[1]], {
        icon: L.divIcon({
          html: '<div class="objective-pin">🎯</div>',
          className: 'hub-marker',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
        .addTo(map)
        .bindTooltip(
          t.kind === 'mercato'
            ? `🎯 ${t.brand}: porta un giocatore ${t.nation} in rosa (+${Math.round(t.bonusPct * 100)}% dall'annuo sponsor)`
            : `🎯 ${t.brand}: porta il TOUR estivo in ${t.nation} (+${Math.round(t.bonusPct * 100)}%)`,
          { direction: 'top', offset: [0, -12], className: 'city-label' },
        );
    }

    // Gli asset già piazzati.
    for (const [nation, pins] of Object.entries(session.territoryPins ?? {})) {
      for (const p of pins) drawAssetPin(map, nation, p.kind, p.lat, p.lon);
    }

    // Le TERRE DI NESSUNO: anche gli stati vuoti si cliccano (barra azioni).
    const covered = new Set([
      ...empire.markets.map((m) => m.nation),
      ...influence.filter((r) => r.dominant && !r.dominant.mine).map((r) => r.nation),
    ]);
    for (const nation of Object.keys(NATION_COORDS)) {
      if (covered.has(nation)) continue;
      const at = NATION_COORDS[nation];
      if (!at) continue;
      paintNation(map, nation, at, {
        color: '#52525b',
        fillOpacity: 0.03,
        weight: 0.5,
        onClick: () => focusRef.current(nation),
      });
    }

    openTerritoryRef.current = (nation: string) => {
      const at = NATION_COORDS[nation];
      if (!at) return;
      setTerritory(nation);
      map.flyTo(at, 5, { duration: 0.9 });
    };
    map.on('click', (e: L.LeafletMouseEvent) => {
      const kind = placingRef.current;
      const nation = territoryRef.current;
      if (!kind || !nation) return;
      const before = (session.territoryPins?.[nation] ?? []).length;
      const out =
        kind === 'shop'
          ? buildTerritoryShop(session, nation, e.latlng.lat, e.latlng.lng)
          : foundTerritoryFanClub(session, nation, e.latlng.lat, e.latlng.lng);
      setMsg(out);
      if ((session.territoryPins?.[nation] ?? []).length > before) {
        drawAssetPin(map, nation, kind, e.latlng.lat, e.latlng.lng);
      }
      setPlacing(null);
      refresh();
    });

    spyLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      spyLayer.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Lo SPIONE: scegli un club e le sue zone si accendono (lampeggiando).
  useEffect(() => {
    const layer = spyLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!spyClub) return;
    const info = clubs.find((c) => c.id === spyClub);
    if (!info) return;
    const spyId = clubIdentity(info.name, info.reputation, info.league, info.nation);
    const zones = clubZones(session, spyClub);
    const map = mapRef.current;
    if (!map) return;
    for (const z of zones) {
      const at = NATION_COORDS[z.nation];
      if (!at) continue;
      // La nazione LAMPEGGIA nel colore del club spiato (poligono vero).
      const shape = countryFeature(z.nation);
      if (shape) {
        L.geoJSON(shape, {
          style: {
            color: spyId.accent,
            weight: 3,
            opacity: 0.95,
            fillColor: spyId.accent,
            fillOpacity: 0.28,
            className: 'zone-flash',
          },
          interactive: false,
        }).addTo(layer);
      } else {
        L.circle(at, {
          radius: 500_000,
          color: spyId.accent,
          weight: 3,
          opacity: 0.95,
          fillColor: spyId.accent,
          fillOpacity: 0.28,
          className: 'zone-flash',
          interactive: false,
        }).addTo(layer);
      }
    }
  }, [spyClub, session, clubs]);

  const cursorStyle = placing ? 'crosshair' : '';
  useEffect(() => {
    const el = mapRef.current?.getContainer();
    if (el) el.style.cursor = cursorStyle;
  }, [cursorStyle]);

  const spyInfo = spyClub ? clubs.find((c) => c.id === spyClub) : null;
  const spyZoneCount = spyClub ? clubZones(session, spyClub).length : 0;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <div ref={mapDiv} className="h-full w-full" />

      {/* intestazione */}
      <div className="anim-in absolute left-5 top-5 z-[1010] flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-zinc-700 bg-zinc-950/90 px-3 py-1.5 text-sm backdrop-blur hover:bg-zinc-800"
        >
          ← Torna in città
        </button>
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/90 px-3 py-1.5 backdrop-blur">
          <span className="text-sm font-bold" style={{ color: id.accent }}>
            🌍 Ufficio Commerciale
          </span>
          <Help text="La mappa del marketing mondiale. Le zone col TUO colore sono i mercati dove hai tifosi. Le zone con altri colori mostrano il club DOMINANTE di quella nazione: chi ha più giocatori di quella nazione in rosa, pesati per stelle e fama. Clicca la targa di un tuo territorio per gestirlo." />
        </div>
      </div>

      {/* bollettino + spione + missioni */}
      <div className="panel-left absolute bottom-5 left-5 top-20 z-[1010] flex w-[320px] flex-col gap-3 overflow-y-auto pr-1">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-xs backdrop-blur">
          <div className="font-bold uppercase tracking-widest text-zinc-400">
            il tuo impero
            <Help text="I tifosi si conquistano schierando giocatori di quella nazione: più fama, stelle, sponsor che investono lì e tour estivi = crescita più veloce. Senza giocatori il mercato si spegne (le sedi fan club lo frenano). Ranghi: ⛺ sotto 20k, 🏴 colonia da 20k (parte il merchandising), 🏰 roccaforte da 100k, 👑 impero da 1M." />
          </div>
          {empire.markets.length === 0 ? (
            <p className="mt-1 text-zinc-500">
              Nessun territorio ancora: compra un giocatore straniero "emergente" (Cina, USA,
              Giappone, Corea, India) e schieralo — i suoi connazionali inizieranno a seguirti.
            </p>
          ) : (
            <div className="mt-1 text-zinc-300">
              {empire.markets.length} territor{empire.markets.length === 1 ? 'io' : 'i'} ·{' '}
              <b>{FANS(empire.totalFans)}</b> tifosi nel mondo
              {empire.merch + empire.tv > 0 && (
                <>
                  {' '}
                  · rendita ~<b className="text-emerald-300">{M(empire.merch + empire.tv)}</b>
                  /anno
                </>
              )}
            </div>
          )}
          {empire.totalHistory.length >= 2 && (
            <div className="mt-1.5">
              <Sparkline values={empire.totalHistory} color={id.accent} width={280} />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-xs backdrop-blur">
          <div className="font-bold uppercase tracking-widest text-zinc-400">
            spia un club
            <Help text="Scegli un club qualsiasi: sulla mappa LAMPEGGIANO le nazioni dove ha presenza marketing (giocatori di quella nazione in rosa). Serve a capire chi ti contende un mercato — e dove attaccare." />
          </div>
          <select
            value={spyClub}
            onChange={(e) => setSpyClub(e.target.value)}
            className="mt-1.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5"
          >
            <option value="">— nessuno —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.league})
              </option>
            ))}
          </select>
          {spyInfo && (
            <p className="mt-1.5 text-zinc-400">
              {spyZoneCount === 0
                ? `${spyInfo.name} non ha presenza sui mercati esteri: via libera.`
                : `${spyInfo.name} si accende su ${spyZoneCount} nazion${spyZoneCount === 1 ? 'e' : 'i'} (zone lampeggianti).`}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-xs backdrop-blur">
          <div className="font-bold uppercase tracking-widest text-zinc-400">
            🎖 missioni di marketing
            <Help text="Obiettivi generati dal tuo impero: completali entro la scadenza e la reputazione del club sale (+1). Si verificano al conguaglio di fine stagione. Passa il mouse sul ? di ogni missione per capire COME completarla." />
          </div>
          {empire.missions.length === 0 && (
            <p className="mt-1 text-zinc-500">Nessuna missione attiva.</p>
          )}
          <ul className="mt-1.5 space-y-2">
            {empire.missions.map((m) => (
              <li key={m.text} className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-zinc-200">{m.text}</span>
                  {m.hint && <Help text={m.hint} />}
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-500">
                  entro la stagione {m.deadline} · premio: +1 reputazione
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* esito azioni */}
      {msg && (
        <button
          type="button"
          onClick={() => setMsg(null)}
          className="toast-in absolute left-1/2 top-5 z-[1030] max-w-xl -translate-x-1/2 rounded-xl border border-zinc-600 bg-zinc-950/95 px-5 py-2.5 text-sm backdrop-blur hover:border-zinc-400"
        >
          {msg} ✕
        </button>
      )}

      {/* BARRA AZIONI dello stato cliccato (richiesta utente): cosa puoi FARE qui. */}
      {focus &&
        (() => {
          const nation = focus.nation;
          const mine = empire.markets.find((m) => m.nation === nation) ?? null;
          const dom = influence.find((r) => r.nation === nation)?.dominant ?? null;
          const tourDest = TOUR_DESTINATIONS.find((d) => d.nation === nation) ?? null;
          const summer = summerView(session);
          const canTour = tourDest !== null && !summer.locked && summer.tourId == null;
          const dsPending = dsReminderPending(session, nation);
          return (
            <div className="note-in absolute bottom-5 left-1/2 z-[1020] w-[min(94%,860px)] -translate-x-1/2 rounded-xl border border-zinc-600 bg-zinc-950/95 p-3 backdrop-blur">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-bold">{nation}</span>
                  <span className="ml-2 text-xs text-zinc-400">
                    {mine
                      ? `${FANS(mine.fans)} tifosi tuoi · ${RANK_TAG[mine.rank]}`
                      : 'nessun tuo tifoso qui'}
                    {dom
                      ? dom.mine
                        ? ' · qui comandi TU ⭐'
                        : ` · domina ${dom.name}`
                      : ' · terra di nessuno: chi arriva primo la prende'}
                  </span>
                  <Help text="Come si conquista uno stato: metti in rosa giocatori di quella nazione (le stelle e la fama del club pesano), firma sponsor che investono lì, porta il tour estivo. I tifosi arrivano al conguaglio di fine stagione." />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFocus(null);
                    setPanel(null);
                  }}
                  className="rounded bg-zinc-800 px-2 py-0.5 text-sm text-zinc-400 hover:bg-zinc-700"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {mine && (
                  <button
                    type="button"
                    onClick={() => {
                      setFocus(null);
                      setPanel(null);
                      openTerritoryRef.current(nation);
                    }}
                    className="rounded px-3 py-1.5 font-bold text-zinc-950"
                    style={{ background: id.accent }}
                  >
                    🗺 Gestisci territorio
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onScout(nation)}
                  className="rounded border border-zinc-600 px-3 py-1.5 font-semibold hover:bg-zinc-800"
                >
                  🔍 Cerca giocatori {nation}
                </button>
                <button
                  type="button"
                  disabled={dsPending}
                  onClick={() => {
                    setMsg(leaveDsReminder(session, nation));
                    refresh();
                  }}
                  title={
                    dsPending
                      ? 'il DS ci sta già lavorando: il rapporto arriva in Gazzetta'
                      : `il DS studia ${nation} e in un paio di giornate porta in Gazzetta i migliori profili alla tua portata, già visionati dagli scout`
                  }
                  className="rounded border border-zinc-600 px-3 py-1.5 font-semibold hover:bg-zinc-800 disabled:opacity-40"
                >
                  📋 {dsPending ? 'Il DS ci sta lavorando…' : 'Promemoria al DS'}
                </button>
                {tourDest && (
                  <button
                    type="button"
                    disabled={!canTour}
                    onClick={() => {
                      setMsg(chooseTour(session, tourDest.id));
                      refresh();
                    }}
                    title={
                      canTour
                        ? 'porta qui il tour: soldi subito e tifosi in crescita'
                        : summer.tourId != null
                          ? 'il tour di quest’estate è già stato fatto'
                          : 'i tour si pianificano in estate, prima della 1ª giornata'
                    }
                    className="rounded border border-zinc-600 px-3 py-1.5 font-semibold hover:bg-zinc-800 disabled:opacity-40"
                  >
                    ✈ Porta il tour qui
                  </button>
                )}
                {dom && !dom.mine && (
                  <button
                    type="button"
                    onClick={() => setSpyClub(dom.clubId)}
                    className="rounded border border-zinc-600 px-3 py-1.5 font-semibold hover:bg-zinc-800"
                  >
                    🕵 Spia {dom.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPanel(panel === 'sponsor' ? null : 'sponsor')}
                  className={`rounded border px-3 py-1.5 font-semibold hover:bg-zinc-800 ${panel === 'sponsor' ? 'border-amber-500 text-amber-300' : 'border-zinc-600'}`}
                >
                  🤝 Sponsor {nation}
                </button>
                {focus.viaDominant && dom && !dom.mine && (
                  <button
                    type="button"
                    onClick={() => setPanel(panel === 'confronto' ? null : 'confronto')}
                    className={`rounded border px-3 py-1.5 font-semibold hover:bg-zinc-800 ${panel === 'confronto' ? 'border-amber-500 text-amber-300' : 'border-zinc-600'}`}
                  >
                    📊 Confronto storico
                  </button>
                )}
              </div>

              {/* 🤝 i brand di questa nazione */}
              {panel === 'sponsor' &&
                (() => {
                  const brands = nationBrands(session, nation);
                  return (
                    <div className="anim-in mt-3 border-t border-zinc-800 pt-2 text-xs">
                      <div className="font-bold uppercase tracking-widest text-zinc-500">
                        aziende di {nation}
                        <Help text="I brand di una nazione offrono clausole legate al loro paese: la clausola merch paga se hai un loro connazionale in rosa. Le offerte sponsor arrivano a fine stagione per gli slot scoperti (Sede → Sponsor): più fama hai, più le aziende grandi si fanno avanti." />
                      </div>
                      {brands.length === 0 ? (
                        <p className="mt-1 text-zinc-500">
                          Nessuna azienda di {nation} nel giro degli sponsor calcistici.
                        </p>
                      ) : (
                        <div className="mt-1 grid gap-x-4 gap-y-0.5 md:grid-cols-2">
                          {brands.map((b) => (
                            <div key={b.name} className="flex justify-between gap-2">
                              <span className="truncate text-zinc-300">
                                {b.name}{' '}
                                <span className="text-zinc-600">
                                  ({b.sector}, {b.tier})
                                </span>
                              </span>
                              <span
                                className={
                                  b.status === 'firmato'
                                    ? 'shrink-0 font-semibold text-emerald-300'
                                    : b.status === 'in offerta'
                                      ? 'shrink-0 font-semibold text-amber-300'
                                      : 'shrink-0 text-zinc-500'
                                }
                              >
                                {b.status === 'firmato'
                                  ? '✓ firmato con te'
                                  : b.status === 'in offerta'
                                    ? '→ ti sta offrendo (Sede → Sponsor)'
                                    : 'possibile partner'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

              {/* 📊 tu contro il dominante, negli anni */}
              {panel === 'confronto' &&
                dom &&
                (() => {
                  const cmp = influenceCompare(session, nation);
                  const rows = cmp.history.map((h) => ({
                    label: `'${String(h.year).slice(2)}`,
                    a: h.mine,
                    b: h.top,
                  }));
                  const maxW = Math.max(cmp.mineNow, cmp.topNow?.weight ?? 0, 0.1);
                  return (
                    <div className="anim-in mt-3 border-t border-zinc-800 pt-2 text-xs">
                      <div className="font-bold uppercase tracking-widest text-zinc-500">
                        tu contro {dom.name} in {nation}
                        <Help text="Il peso marketing = giocatori della nazione in rosa × stelle (overall 80+) × fama del club. Le barre mostrano OGGI; il grafico, stagione per stagione, chi comandava (la linea del 'top' segue il club dominante di ogni anno, chiunque fosse)." />
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {[
                          { label: 'TU', v: cmp.mineNow, color: id.accent },
                          { label: dom.name, v: cmp.topNow?.weight ?? 0, color: '#f87171' },
                        ].map((r) => (
                          <div key={r.label} className="flex items-center gap-2">
                            <span className="w-28 truncate text-zinc-400">{r.label}</span>
                            <svg
                              width={200}
                              height={10}
                              role="img"
                              aria-label={`${r.label}: peso ${r.v.toFixed(1)}`}
                            >
                              <rect
                                x={0}
                                y={1}
                                width={Math.max(2, (r.v / maxW) * 196)}
                                height={8}
                                rx={2}
                                fill={r.color}
                                opacity={0.9}
                              />
                            </svg>
                            <span className="w-10 text-right font-semibold text-zinc-300">
                              {r.v.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        {rows.length >= 2 ? (
                          <DualLines
                            rows={rows}
                            aLabel="tu"
                            bLabel="il top"
                            unit="peso"
                            width={420}
                            height={100}
                          />
                        ) : (
                          <p className="text-zinc-600">
                            La storia si scrive da qui in poi: ogni fine stagione registro chi pesa
                            quanto su {nation}.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
            </div>
          );
        })()}

      {/* banner piazzamento */}
      {placing && territory && (
        <div className="note-in pointer-events-none absolute left-1/2 top-16 z-[1020] -translate-x-1/2 rounded-lg border border-amber-600/70 bg-zinc-950/90 px-4 py-2 text-xs text-amber-200 backdrop-blur">
          {placing === 'shop' ? '🏪' : '🏠'} Clicca il punto in {territory} dove aprire la sede
        </div>
      )}

      {/* pannello del territorio */}
      {territory &&
        (() => {
          const tv = territoryView(session, territory);
          if (!tv) return null;
          return (
            <div className="note-in absolute right-5 top-20 z-[1010] w-[290px] rounded-xl border border-zinc-600 bg-zinc-950/95 p-3 text-xs backdrop-blur">
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
                stirpe {tv.streak}
                <Help text="Le stagioni CONSECUTIVE con almeno un giocatore di questa nazione in rosa. Da 3 in su le TV locali comprano le tue partite (piccola rendita extra). Si azzera se resti una stagione senza." />{' '}
                · 🏪 {tv.shops}/{tv.maxShops}
                <Help text="I negozi del club moltiplicano il merchandising di QUESTO mercato: +15% l'uno. Il territorio deve essere abbastanza grande: 1 negozio da 20k tifosi, 2 da 100k, 4 da 1M." />{' '}
                · 🏠 {tv.fanClubs}/3
                <Help text="Le sedi fan club rendono i tifosi FEDELI: crescita più veloce e, se resti senza giocatori della nazione, la fanbase cala molto più lentamente. A 100k tifosi e stirpe 3 nascono anche da sole." />
              </div>
              {tv.history.length >= 2 ? (
                <div className="mt-1.5">
                  <Sparkline values={tv.history.map((h) => h.fans)} color={id.accent} width={260} />
                </div>
              ) : (
                <div className="mt-1 text-zinc-600">
                  La storia del territorio si scrive negli anni.
                </div>
              )}
              {tv.rivals.length > 0 && (
                <div className="mt-1.5 text-amber-300/90">
                  ⚔ Ti contendono il mercato:{' '}
                  {tv.rivals.map((r) => `${r.name} (${r.count} giocatori)`).join(' · ')}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!tv.canShop}
                  onClick={() => setPlacing(placing === 'shop' ? null : 'shop')}
                  className={`rounded border px-2 py-1 font-semibold disabled:opacity-40 ${
                    placing === 'shop'
                      ? 'border-amber-500 text-amber-300'
                      : 'border-zinc-600 hover:bg-zinc-800'
                  }`}
                >
                  🏪 Apri negozio ({(tv.shopCost / 1e6).toFixed(0)}M)
                </button>
                <button
                  type="button"
                  disabled={!tv.canFanClub}
                  onClick={() => setPlacing(placing === 'fanclub' ? null : 'fanclub')}
                  className={`rounded border px-2 py-1 font-semibold disabled:opacity-40 ${
                    placing === 'fanclub'
                      ? 'border-amber-500 text-amber-300'
                      : 'border-zinc-600 hover:bg-zinc-800'
                  }`}
                >
                  🏠 Fonda sede ({(tv.fanClubCost / 1e6).toFixed(0)}M)
                </button>
              </div>
              {!tv.canShop && tv.shops >= tv.maxShops && (
                <div className="mt-1 text-[10px] text-zinc-600">
                  Negozi al massimo per questo rango: fai crescere i tifosi per sbloccarne altri.
                </div>
              )}
            </div>
          );
        })()}

      <span className="absolute bottom-1 right-2 z-[1010] text-[8px] text-zinc-600">
        © OpenStreetMap
      </span>
    </div>
  );
}
