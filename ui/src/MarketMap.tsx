/**
 * VIAGGI DI MERCATO (MODULE_MARKET §8, guscio UI): la mappa d'Europa scura tinta
 * col colore sociale. Italia e Inghilterra attive (le città reali dei club), le
 * altre nazioni "in costruzione". Ricerca con filtri, taccuino, consigli del DS,
 * e il TAVOLO di trattativa dinamico (chat con mood del venditore).
 */

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HeatCard } from './Heatmap';
import { Ic } from './Ic';
import { addBasemap, clubTintFilter } from './basemap';
import {
  type GameSession,
  type MarketPlayerRow,
  type PlayerSearchFilters,
  abandonNegotiation,
  callInfo,
  closeNegotiation,
  dsAdvice,
  hearAnswer,
  marketClubSquad,
  marketClubs,
  marketLeagues,
  marketNationalities,
  marketWorldView,
  negotiationFee,
  negotiationHub,
  negotiationView,
  negotiationWage,
  playerHeatView,
  searchPlayers,
  shortlistRows,
  startNegotiation,
  toggleShortlist,
} from './game';
import { type ClubIdentity, clubIdentity } from './identity';

const fmtM = (v: number) => `${(v / 1e6).toFixed(1)}M`;
/** Sopra il milione niente migliaia a 4 cifre: si passa ai Milioni (richiesta utente). */
const fmtK = (v: number) => (v >= 1e6 ? fmtM(v) : `${Math.round(v / 1000)}k`);

/** Nazioni future: marker spenti, puro teaser (§8.1). */
const FUTURE_CITIES: { nation: string; name: string; lat: number; lon: number }[] = [
  { nation: 'Spagna', name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  { nation: 'Spagna', name: 'Barcellona', lat: 41.3874, lon: 2.1686 },
  { nation: 'Spagna', name: 'Siviglia', lat: 37.3891, lon: -5.9845 },
  { nation: 'Francia', name: 'Parigi', lat: 48.8566, lon: 2.3522 },
  { nation: 'Francia', name: 'Marsiglia', lat: 43.2965, lon: 5.3698 },
  { nation: 'Francia', name: 'Lione', lat: 45.764, lon: 4.8357 },
  { nation: 'Germania', name: 'Berlino', lat: 52.52, lon: 13.405 },
  { nation: 'Germania', name: 'Monaco', lat: 48.1351, lon: 11.582 },
  { nation: 'Germania', name: 'Dortmund', lat: 51.5136, lon: 7.4653 },
  { nation: 'Portogallo', name: 'Lisbona', lat: 38.7223, lon: -9.1393 },
  { nation: 'Portogallo', name: 'Porto', lat: 41.1579, lon: -8.6291 },
  { nation: 'Paesi Bassi', name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
];

interface CityGroup {
  name: string;
  lat: number;
  lon: number;
  clubs: {
    id: string;
    name: string;
    league: string;
    reputation: number;
    avg: number;
    mine: boolean;
  }[];
}

const STATUS_STYLE: Record<string, string> = {
  incedibile: 'border-red-800 bg-red-950/60 text-red-400',
  cedibile: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
  vetrina: 'border-emerald-800 bg-emerald-950/60 text-emerald-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function MarketMap({
  session,
  id,
  onBack,
  initialNationality,
}: {
  session: GameSession;
  id: ClubIdentity;
  onBack: () => void;
  /** Arrivo dall'Ufficio Commerciale: la ricerca parte già filtrata sulla nazione. */
  initialNationality?: string;
}) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [tab, setTab] = useState<'ricerca' | 'taccuino' | 'ds' | 'tavoli'>('ricerca');
  /** Il tavolo aperto a schermo (playerId); gli altri restano vivi nell'hub Tavoli. */
  const [tableSel, setTableSel] = useState<string | null>(null);
  const [filters, setFilters] = useState<PlayerSearchFilters>(() =>
    initialNationality ? { nationality: initialNationality } : {},
  );
  const [citySel, setCitySel] = useState<string | null>(null);
  const [clubSel, setClubSel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapDiv = useRef<HTMLDivElement>(null);
  const citySelRef = useRef(setCitySel);

  const world = marketWorldView(session);
  const clubs = useMemo(() => marketClubs(session), [session]);
  const cities = useMemo(() => {
    const map = new Map<string, CityGroup>();
    for (const c of clubs) {
      const cid = clubIdentity(c.name, c.reputation, c.league, c.nation);
      const g = map.get(cid.city.name) ?? {
        name: cid.city.name,
        lat: cid.city.lat,
        lon: cid.city.lon,
        clubs: [],
      };
      g.clubs.push({
        id: c.id,
        name: c.name,
        league: c.league,
        reputation: c.reputation,
        avg: c.avg,
        mine: c.mine,
      });
      map.set(cid.city.name, g);
    }
    return [...map.values()];
  }, [clubs]);

  // La mappa d'Europa: si costruisce una volta (le città non si muovono).
  useEffect(() => {
    if (!mapDiv.current) return;
    const map = L.map(mapDiv.current, {
      center: [47.2, 3.5],
      zoom: 5,
      minZoom: 4,
      maxZoom: 13,
      zoomControl: false,
      attributionControl: true,
      maxBounds: [
        [33, -18],
        [62, 26],
      ],
    });
    map.attributionControl.setPrefix('');
    addBasemap(map);
    const pane = map.getPane('tilePane');
    if (pane) pane.style.filter = clubTintFilter(id.hue, 2.2, 1.9);

    // Città attive: anello acceso col conteggio club.
    for (const city of cities) {
      const mine = city.clubs.some((c) => c.mine);
      const m = L.marker([city.lat, city.lon], {
        icon: L.divIcon({
          html: `<svg width="26" height="26" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="${mine ? '#facc15' : id.accent}" stroke-width="3"/><circle cx="10" cy="10" r="2.5" fill="${mine ? '#facc15' : id.accent}"/></svg>`,
          className: 'hub-marker',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(map);
      m.bindTooltip(`${city.name} · ${city.clubs.length} club${mine ? ' · casa tua' : ''}`, {
        direction: 'right',
        offset: [12, 0],
        className: 'city-label',
      });
      m.on('click', () => {
        map.flyTo([city.lat, city.lon], 7, { duration: 0.6 });
        citySelRef.current(city.name);
      });
    }
    // Nazioni in costruzione: marker spenti col cartello.
    for (const f of FUTURE_CITIES) {
      const m = L.marker([f.lat, f.lon], {
        icon: L.divIcon({
          html: `<svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" fill="none" stroke="#52525b" stroke-width="2" stroke-dasharray="3 2"/></svg>`,
          className: 'hub-marker',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        interactive: true,
      }).addTo(map);
      m.bindTooltip(`${f.name} (${f.nation}) · in costruzione 🚧`, {
        direction: 'right',
        offset: [10, 0],
        className: 'city-label city-label-off',
      });
    }
    mapRef.current = map;
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [cities, id.hue, id.accent]);

  const flyToClub = (clubId: string) => {
    const c = clubs.find((x) => x.id === clubId);
    if (!c) return;
    const cid = clubIdentity(c.name, c.reputation, c.league, c.nation);
    mapRef.current?.flyTo([cid.city.lat, cid.city.lon], 7, { duration: 0.6 });
    setCitySel(cid.city.name);
    setClubSel(clubId);
  };

  const openTable = (playerId: string, inPerson: boolean) => {
    const err = startNegotiation(session, playerId, inPerson);
    if (err) setToast(err);
    else setTableSel(playerId);
    refresh();
  };

  const hub = negotiationHub(session);
  const results =
    tab === 'ricerca'
      ? searchPlayers(session, filters)
      : tab === 'taccuino'
        ? shortlistRows(session)
        : [];

  /** I bottoni del tavolo, consapevoli del CALENDARIO: prima la call, poi il tavolo. */
  const TableButtons = ({ playerId }: { playerId: string }) => {
    const call = callInfo(session, playerId);
    if (!call)
      return (
        <button
          type="button"
          title="fissa una call col presidente del club (l'appuntamento finisce in agenda 📅)"
          onClick={() => openTable(playerId, false)}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] hover:bg-zinc-800"
        >
          <Ic name="call" /> Call
        </button>
      );
    if (!call.due)
      return (
        <span
          title={`appuntamento ${call.inPerson ? 'IN SEDE (si vola)' : 'in call'}: ${call.date} — salta lì dal calendario 📅`}
          className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500"
        >
          <Ic name={call.inPerson ? 'flight' : 'call'} /> {call.date}
        </span>
      );
    return (
      <>
        {!call.inPerson && (
          <button
            type="button"
            title="l'appuntamento è OGGI: entra in call e tratta a distanza"
            onClick={() => openTable(playerId, false)}
            className="rounded border border-emerald-700 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-zinc-800"
          >
            <Ic name="call" fill /> Entra
          </button>
        )}
        <button
          type="button"
          title={
            call.inPerson
              ? `il presidente ti aspetta in sede OGGI (${fmtK(world.tripCost)}, sconto al tavolo)`
              : `vola a trattare in sede (${fmtK(world.tripCost)}, sconto al tavolo)`
          }
          disabled={world.tripDone}
          onClick={() => openTable(playerId, true)}
          className={`rounded border px-2 py-0.5 text-[11px] hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 ${
            call.inPerson ? 'border-sky-600 text-sky-300' : 'border-zinc-700'
          }`}
        >
          <Ic name="flight_takeoff" /> Vola{call.inPerson ? ' (ti aspetta)' : ''}
        </button>
      </>
    );
  };

  const rowActions = (r: MarketPlayerRow) => (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title={r.listed ? 'togli dal taccuino' : 'segna sul taccuino'}
        onClick={() => {
          toggleShortlist(session, r.id);
          refresh();
        }}
        className={`text-base leading-none ${r.listed ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-300'}`}
      >
        <Ic name="star" fill={r.listed} />
      </button>
      <TableButtons playerId={r.id} />
    </div>
  );

  const playerLine = (r: MarketPlayerRow) => (
    <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold">{r.name}</span>
          <span className="ml-2 text-xs text-zinc-500">
            {r.pos} · {r.age} anni · {r.nat}
          </span>
        </div>
        <span className="text-lg font-black" style={{ color: id.accent }}>
          {r.overall}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => flyToClub(r.clubId)}
          className="truncate text-left text-xs text-zinc-400 underline-offset-2 hover:underline"
          title="vai alla città del club"
        >
          {r.club} · {r.league}
        </button>
        <div className="flex items-center gap-2">
          <StatusBadge status={r.status} />
          <span className="text-xs font-bold text-zinc-300">{fmtM(r.ask)}</span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-zinc-600">
          contratto {r.contractEnd ? `fino al ${r.contractEnd}` : 'in scadenza'}
        </span>
        {rowActions(r)}
      </div>
    </div>
  );

  const cityGroup = citySel ? cities.find((c) => c.name === citySel) : null;
  const squad = clubSel ? marketClubSquad(session, clubSel) : [];
  const clubRow = clubSel ? clubs.find((c) => c.id === clubSel) : null;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <div ref={mapDiv} className="h-full w-full" />

      {/* vignettatura come nell'hub */}
      <div
        className="pointer-events-none absolute inset-0 z-[1000]"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 60%, rgba(9,9,11,0.95) 100%), linear-gradient(to bottom, rgba(9,9,11,0.85), transparent 14%)',
        }}
      />

      {/* header */}
      <div className="absolute left-5 top-4 z-[1010] flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-zinc-700 bg-zinc-950/85 px-3 py-1.5 text-sm backdrop-blur hover:border-zinc-500"
        >
          ← Città
        </button>
        <div>
          <h1 className="text-xl font-black drop-shadow" style={{ color: id.accent }}>
            Viaggi di mercato
          </h1>
          <p className="text-[11px] text-zinc-400">
            Italia e Inghilterra aperte · il resto d'Europa è in costruzione 🚧
          </p>
        </div>
      </div>

      {/* stato: finestra, budget, jet */}
      <div className="absolute right-5 top-4 z-[1010] flex gap-2 text-sm">
        <div
          className={`rounded-lg border px-3 py-1.5 backdrop-blur ${world.window ? 'border-emerald-700 bg-emerald-950/70' : 'border-zinc-700 bg-zinc-950/85'}`}
        >
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Finestra</div>
          <div className={`font-bold ${world.window ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {world.window
              ? `${world.window}${world.deadline ? ' — DEADLINE!' : ''}`
              : 'chiusa (pre-accordi)'}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/85 px-3 py-1.5 backdrop-blur">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Budget mercato</div>
          <div className="font-bold" style={{ color: id.accent }}>
            {fmtM(world.budget)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/85 px-3 py-1.5 backdrop-blur">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Jet privato</div>
          <div className={`font-bold ${world.tripDone ? 'text-zinc-500' : 'text-sky-400'}`}>
            {world.tripDone ? 'a terra (già usato)' : `pronto · ${fmtK(world.tripCost)}`}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/85 px-3 py-1.5 backdrop-blur">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Rosa</div>
          <div className="font-bold">
            {world.squadSize}/{world.squadCap}
          </div>
        </div>
      </div>

      {/* pannello sinistro: ricerca / taccuino / DS / pre-accordi */}
      <div className="panel-left absolute bottom-4 left-5 top-20 z-[1010] flex w-[390px] flex-col rounded-xl border border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="flex border-b border-zinc-800 text-xs">
          {(
            [
              ['ricerca', '🔍 Ricerca'],
              [
                'taccuino',
                `★ Taccuino${(session.shortlist?.length ?? 0) > 0 ? ` (${session.shortlist!.length})` : ''}`,
              ],
              ['ds', '🧠 Il DS consiglia'],
              ['tavoli', `🪑 Tavoli${hub.open > 0 ? ` (${hub.open})` : ''}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 px-2 py-2.5 ${tab === k ? 'font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
              style={
                tab === k
                  ? { color: id.accent, boxShadow: `inset 0 -2px 0 ${id.accent}` }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'ricerca' && (
          <div className="border-b border-zinc-800 p-3">
            <input
              value={filters.name ?? ''}
              onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              placeholder="Nome del giocatore…"
              className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
            />
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <select
                value={filters.position ?? ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    position: e.target.value as PlayerSearchFilters['position'],
                  })
                }
                className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1"
              >
                <option value="">Ruolo</option>
                <option value="GK">Portiere</option>
                <option value="DF">Difensore</option>
                <option value="MF">Centrocampista</option>
                <option value="FW">Attaccante</option>
              </select>
              <select
                value={filters.nationality ?? ''}
                onChange={(e) => setFilters({ ...filters, nationality: e.target.value })}
                className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1"
              >
                <option value="">Nazionalità</option>
                {marketNationalities(session).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <select
                value={filters.league ?? ''}
                onChange={(e) => setFilters({ ...filters, league: e.target.value })}
                className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1"
              >
                <option value="">Campionato</option>
                {marketLeagues(session).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={filters.ageMax ?? ''}
                onChange={(e) =>
                  setFilters({ ...filters, ageMax: e.target.value ? Number(e.target.value) : null })
                }
                className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1"
              >
                <option value="">Età max</option>
                {[21, 24, 27, 30, 34].map((a) => (
                  <option key={a} value={a}>
                    ≤ {a}
                  </option>
                ))}
              </select>
              <select
                value={filters.maxAsk ?? ''}
                onChange={(e) =>
                  setFilters({ ...filters, maxAsk: e.target.value ? Number(e.target.value) : null })
                }
                className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1"
              >
                <option value="">Prezzo max</option>
                {[2, 5, 10, 20, 50].map((m) => (
                  <option key={m} value={m * 1e6}>
                    ≤ {m}M
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1">
                <input
                  type="checkbox"
                  checked={!!filters.expiring}
                  onChange={(e) => setFilters({ ...filters, expiring: e.target.checked })}
                />
                in scadenza
              </label>
            </div>
          </div>
        )}

        <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {tab === 'ds' &&
            (() => {
              const advice = dsAdvice(session);
              if (advice.length === 0)
                return (
                  <p className="text-sm text-zinc-500">
                    La rosa è completa: il DS si gode il caffè.
                  </p>
                );
              return advice.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-lg font-black" style={{ color: id.accent }}>
                      {t.overall}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {t.pos} · {t.age} anni ·{' '}
                    <button
                      type="button"
                      onClick={() => flyToClub(t.clubId)}
                      className="underline-offset-2 hover:underline"
                    >
                      {t.club}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] italic text-zinc-400">"{t.why}"</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={t.status} />
                      <span className="text-xs font-bold">{fmtM(t.ask)}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <TableButtons playerId={t.id} />
                    </div>
                  </div>
                </div>
              ));
            })()}
          {tab === 'tavoli' && (
            <div className="space-y-2 text-sm">
              {hub.tables.length === 0 && (
                <p className="text-zinc-500">
                  Nessun tavolo aperto. Siediti da un giocatore (🤝) e la trattativa resta viva qui,
                  anche se la metti in pausa. Massimo 3 tavoli in parallelo.
                </p>
              )}
              {hub.tables.map((t) => (
                <div
                  key={t.playerId}
                  className={`rounded-lg border px-3 py-2 ${
                    t.stage === 'done'
                      ? 'border-emerald-800/70 bg-emerald-950/30'
                      : t.stage === 'failed'
                        ? 'border-red-900/70 bg-red-950/20'
                        : 'border-zinc-700 bg-zinc-900/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t.player}</span>
                    <span className="text-[11px] text-zinc-500">{t.seller}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px]">
                      {t.stage === 'fee' && '🪑 al tavolo col presidente'}
                      {t.stage === 'pending' && (
                        <>
                          <Ic name="hourglass_top" /> il presidente sta valutando (anche altre
                          offerte)
                        </>
                      )}
                      {t.stage === 'wage' && (
                        <>
                          💼 in chat col procuratore
                          {t.agreedFee != null && (
                            <span className="text-zinc-500">
                              {' '}
                              · cartellino chiuso a {fmtM(t.agreedFee)}
                            </span>
                          )}
                        </>
                      )}
                      {t.stage === 'done' && '✅ accordo totale — da firmare'}
                      {t.stage === 'failed' && '✗ trattativa saltata'}
                      {t.inPerson && t.stage !== 'failed' && (
                        <span className="text-sky-400">
                          {' '}
                          · <Ic name="flight" /> in sede
                        </span>
                      )}
                    </span>
                    <div className="flex gap-1.5">
                      {t.stage !== 'failed' && (
                        <button
                          type="button"
                          onClick={() => setTableSel(t.playerId)}
                          className="rounded px-2 py-0.5 text-xs font-bold text-zinc-950"
                          style={{ background: id.accent }}
                        >
                          {t.stage === 'done' ? 'Vai alla firma' : 'Riprendi'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const msg = abandonNegotiation(session, t.playerId);
                          if (msg) setToast(msg);
                          refresh();
                        }}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
                      >
                        {t.stage === 'failed' ? 'Archivia' : 'Abbandona'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {hub.renewal && (
                <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 px-3 py-2">
                  🖋 Rinnovo in corso: <b>{hub.renewal.player}</b>
                  <span className="text-zinc-400"> con {hub.renewal.agent}</span>
                  <div className="text-[10px] text-amber-500/80">
                    il tavolo dei rinnovi è in Sede → Contratti
                  </div>
                </div>
              )}
              {hub.preDeals.map((d) => (
                <div
                  key={`${d.player}-${d.from}`}
                  className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2"
                >
                  <span className="font-semibold">{d.player}</span>
                  <span className="text-zinc-400"> dal {d.from} · </span>
                  <span className="font-bold">{fmtM(d.fee)}</span>
                  <div className="text-[10px] text-amber-500/80">
                    pre-accordo: firma automatica all'apertura della finestra
                  </div>
                </div>
              ))}
              {hub.offers > 0 && (
                <p className="text-[11px] text-zinc-500">
                  📨 {hub.offers} offert{hub.offers === 1 ? 'a' : 'e'} in ARRIVO per i tuoi: sul
                  tavolo del presidente (Sede → Mercato).
                </p>
              )}
            </div>
          )}
          {(tab === 'ricerca' || tab === 'taccuino') &&
            (results.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {tab === 'taccuino'
                  ? 'Il taccuino è vuoto: segna i giocatori con la ☆.'
                  : 'Nessun giocatore trovato con questi filtri.'}
              </p>
            ) : (
              results.map(playerLine)
            ))}
        </div>
      </div>

      {/* pannello destro: città → club → rosa */}
      {cityGroup && (
        <div className="panel-right absolute bottom-4 right-5 top-20 z-[1010] flex w-[400px] flex-col rounded-xl border border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <div>
              <h2 className="font-bold">{cityGroup.name}</h2>
              <p className="text-[11px] text-zinc-500">{cityGroup.clubs.length} club in città</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCitySel(null);
                setClubSel(null);
              }}
              className="rounded bg-zinc-800 px-2.5 py-1 text-sm hover:bg-zinc-700"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-4 py-2.5">
            {cityGroup.clubs.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={c.mine}
                onClick={() => setClubSel(c.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  clubSel === c.id ? 'font-bold' : 'border-zinc-700 hover:bg-zinc-800'
                } ${c.mine ? 'cursor-default opacity-50' : ''}`}
                style={clubSel === c.id ? { borderColor: id.accent, color: id.accent } : undefined}
              >
                {c.name}
                {c.mine ? ' (tuo)' : ''}
                <span className="ml-1.5 text-zinc-500">{c.avg}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {clubSel && clubRow ? (
              squad.length > 0 ? (
                squad.map(playerLine)
              ) : (
                <p className="text-sm text-zinc-500">Rosa non disponibile.</p>
              )
            ) : (
              <p className="text-sm text-zinc-500">Scegli un club per sfogliarne la rosa.</p>
            )}
          </div>
        </div>
      )}

      {/* toast esiti */}
      {toast && (
        <button
          type="button"
          onClick={() => setToast(null)}
          className="toast-in absolute left-1/2 top-20 z-[1030] max-w-xl -translate-x-1/2 rounded-xl border border-zinc-600 bg-zinc-950/95 px-5 py-2.5 text-sm backdrop-blur hover:border-zinc-400"
        >
          {toast} ✕
        </button>
      )}

      {/* il TAVOLO di trattativa aperto (gli altri vivono nell'hub Tavoli) */}
      {tableSel && (
        <NegotiationTable
          key={tableSel}
          session={session}
          playerId={tableSel}
          accent={id.accent}
          onDone={(msg) => {
            if (msg) setToast(msg);
            setTableSel(null);
            refresh();
          }}
          onPause={() => {
            setTableSel(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------- il tavolo (modal)

function NegotiationTable({
  session,
  playerId,
  accent,
  onDone,
  onPause,
}: {
  session: GameSession;
  playerId: string;
  accent: string;
  onDone: (msg: string | null) => void;
  /** Chiude il modale ma il tavolo resta VIVO nell'hub Tavoli. */
  onPause: () => void;
}) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [feeInput, setFeeInput] = useState<string>('');
  const [wageInput, setWageInput] = useState<string>('');
  // Riprendendo un tavolo dall'hub si rigiocano solo le ultime battute, non tutto il log.
  const [shown, setShown] = useState(() =>
    Math.max(0, (negotiationView(session, playerId)?.log.length ?? 0) - 2),
  );
  // La chat col presidente: aperta → TIMBRO animato all'accordo → chiusa (resta il riassunto).
  const [presState, setPresState] = useState<'open' | 'stamping' | 'closed'>(() => {
    const v = negotiationView(session, playerId);
    return v && v.agentFrom >= 0 && v.log.length - 2 > v.agentFrom ? 'closed' : 'open';
  });
  const logEnd = useRef<HTMLDivElement>(null);

  const nv = negotiationView(session, playerId);

  // Le risposte compaiono una alla volta: il tavolo respira (in pausa durante il timbro).
  useEffect(() => {
    if (!nv || presState === 'stamping') return;
    if (shown < nv.log.length) {
      const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 150 : 620);
      return () => window.clearTimeout(t);
    }
  }, [shown, nv, presState]);
  // Il procuratore ha parlato: la chat col presidente si chiude col timbro.
  const agentStarted = nv != null && nv.agentFrom >= 0 && shown > nv.agentFrom;
  useEffect(() => {
    if (agentStarted && presState === 'open') {
      setPresState('stamping');
      const t = window.setTimeout(() => setPresState('closed'), 1300);
      return () => window.clearTimeout(t);
    }
  }, [agentStarted, presState]);
  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: 'smooth' });
  });
  if (!nv) return null;

  const waiting = shown < nv.log.length || presState === 'stamping';
  const mood = nv.mood;
  const moodEmoji = mood < 0.3 ? '😠' : mood < 0.5 ? '😒' : mood < 0.7 ? '🙂' : '🤝';
  const moodColor = mood < 0.3 ? '#ef4444' : mood < 0.5 ? '#f59e0b' : '#34d399';

  const sendFee = (amount: number) => {
    negotiationFee(session, playerId, amount);
    setFeeInput('');
    refresh();
  };
  const sendWage = (weekly: number) => {
    negotiationWage(session, playerId, Math.round(weekly));
    setWageInput('');
    refresh();
  };
  const bubbleStyle = (who: string) =>
    who === 'tu'
      ? 'ml-10 self-end border-zinc-600 bg-zinc-800/90'
      : who === 'agente'
        ? 'mr-10 self-start border-amber-900/70 bg-amber-950/40'
        : who === 'venditore'
          ? 'mr-10 self-start border-zinc-700 bg-zinc-900'
          : 'self-center border-transparent bg-transparent text-center text-[11px] italic text-zinc-500';

  return (
    <div className="backdrop-fade fixed inset-0 z-[1100] flex items-center justify-center bg-black/75 p-4">
      <div className="modal-pop flex h-[620px] max-h-[92vh] w-full max-w-xl flex-col rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        {/* intestazione del tavolo */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h3 className="font-bold">
              {nv.player} <span className="font-normal text-zinc-500">· {nv.seller}</span>
            </h3>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
              <StatusBadge status={nv.status} />
              {nv.inPerson && (
                <span className="text-sky-400">
                  <Ic name="flight" /> in sede (sconto al tavolo)
                </span>
              )}
              {nv.stage === 'fee' && <span>{nv.roundsLeft} rilanci rimasti</span>}
              {nv.stage === 'wage' && <span>ingaggio: {nv.wageRoundsLeft} rilanci</span>}
            </div>
            <div className="mt-2">
              {(() => {
                const heat = playerHeatView(session, playerId);
                return heat ? <HeatCard view={heat} compact /> : null;
              })()}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right">
              <div className="text-2xl">{moodEmoji}</div>
              <div className="mt-1 h-1.5 w-20 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${Math.round(mood * 100)}%`, background: moodColor }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onPause}
              title="metti in pausa: il tavolo resta vivo nell'hub Tavoli"
              className="rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-700"
            >
              ✕
            </button>
          </div>
        </div>

        {/* le DUE chat: il presidente (cartellino), poi il procuratore (ingaggio) */}
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {(() => {
            const shownLog = nv.log.slice(0, shown);
            const presLog = nv.agentFrom >= 0 ? shownLog.slice(0, nv.agentFrom) : shownLog;
            const agentLog = nv.agentFrom >= 0 ? shownLog.slice(nv.agentFrom) : [];
            const feeFailed = nv.stage === 'failed' && nv.agentFrom < 0 && shown >= nv.log.length;
            const wageFailed = nv.stage === 'failed' && nv.agentFrom >= 0 && shown >= nv.log.length;
            const bubble = (e: { who: string; text: string }, i: number) => (
              <div
                key={`${i}-${e.text.slice(0, 12)}`}
                className={`max-w-[85%] rounded-xl border px-3 py-1.5 text-sm ${bubbleStyle(e.who)}`}
              >
                {e.who !== 'sistema' && (
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {e.who === 'tu'
                      ? 'la tua offerta'
                      : e.who === 'venditore'
                        ? 'presidente'
                        : e.who}
                  </div>
                )}
                {e.text}
              </div>
            );
            const stamp = (ok: boolean, text: string) => (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <span
                  className={`chat-stamp rounded-lg border-4 bg-zinc-950/80 px-5 py-1.5 text-2xl font-black uppercase tracking-widest ${
                    ok ? 'border-emerald-500 text-emerald-400' : 'border-red-500 text-red-400'
                  }`}
                >
                  {text}
                </span>
              </div>
            );
            return (
              <>
                {/* chat 1: il presidente. All'accordo il TIMBRO, poi si chiude nel riassunto. */}
                {presState === 'closed' ? (
                  <div className="chat-slide-in rounded-lg border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                    ✔ Chat col presidente del {nv.seller} CHIUSA — cartellino concordato
                    {nv.agreedFee != null ? (
                      <>
                        {' '}
                        a <b>{fmtM(nv.agreedFee)}</b>
                      </>
                    ) : null}
                    .
                  </div>
                ) : (
                  <div
                    className={`relative flex flex-col gap-2 ${presState === 'stamping' || feeFailed ? 'chat-dimmed' : ''}`}
                  >
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600">
                      🪑 il tavolo del presidente — {nv.seller}
                    </div>
                    {presLog.map(bubble)}
                    {presState === 'stamping' && stamp(true, 'Accordo ✔')}
                    {feeFailed && stamp(false, 'Saltata ✗')}
                  </div>
                )}
                {/* chat 2: NUOVA chat col procuratore per l'ingaggio. */}
                {presState === 'closed' && agentLog.length > 0 && (
                  <div
                    className={`chat-slide-in relative mt-1 flex flex-col gap-2 border-t border-amber-900/40 pt-2 ${wageFailed ? 'chat-dimmed' : ''}`}
                  >
                    <div className="text-[10px] uppercase tracking-widest text-amber-600">
                      💼 nuova chat — il procuratore di {nv.player}
                    </div>
                    {agentLog.map(bubble)}
                    {wageFailed && stamp(false, 'Saltata ✗')}
                  </div>
                )}
              </>
            );
          })()}
          {waiting && presState !== 'stamping' && (
            <div className="mr-10 max-w-[85%] self-start rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-500">
              <span className="inline-block animate-pulse">sta scrivendo…</span>
            </div>
          )}
          <div ref={logEnd} />
        </div>

        {/* la plancia delle offerte */}
        <div className="border-t border-zinc-800 p-3">
          {nv.rival && nv.stage !== 'done' && nv.stage !== 'failed' && (
            <div className="mb-2 rounded-lg border border-red-900/60 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-300">
              <Ic name="swords" /> Il <b>{nv.rival.name}</b> ha offerto <b>{fmtM(nv.rival.bid)}</b>:
              batti il rilancio o {nv.player} va lì.
            </div>
          )}
          {nv.stage === 'pending' && nv.pending && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">
                <Ic name="hourglass_top" /> Il presidente si è preso del tempo per valutare (anche
                altre offerte).
              </span>
              <button
                type="button"
                disabled={!nv.pending.due || waiting}
                onClick={() => {
                  hearAnswer(session, playerId);
                  refresh();
                }}
                className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-zinc-800 disabled:opacity-40"
                style={{ borderColor: `${accent}88`, color: accent }}
                title={
                  nv.pending.due
                    ? 'la riserva è sciolta: leggi la risposta'
                    : `risponde ${nv.pending.date}: salta lì dal calendario`
                }
              >
                <Ic name="mark_email_unread" />{' '}
                {nv.pending.due ? 'Senti la risposta' : `risponde ${nv.pending.date}`}
              </button>
            </div>
          )}
          {nv.stage === 'fee' && (
            <>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">
                  Richiesta attuale: <b className="text-zinc-100">{fmtM(nv.ask)}</b>
                  {nv.dsLo != null && nv.dsHi != null && (
                    <span
                      className="ml-2 text-xs text-zinc-500"
                      title="la stima del tuo DS: in questa zona l'accordo si può chiudere"
                    >
                      · il DS stima {fmtM(nv.dsLo)}–{fmtM(nv.dsHi)}
                    </span>
                  )}
                </span>
                <div className="flex gap-1.5">
                  {[0.75, 0.85, 0.93].map((f) => (
                    <button
                      key={f}
                      type="button"
                      disabled={waiting}
                      onClick={() => sendFee(Math.round((nv.ask * f) / 100_000) * 100_000)}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {fmtM(Math.round((nv.ask * f) / 100_000) * 100_000)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={waiting}
                    onClick={() => sendFee(nv.ask)}
                    className="rounded px-2 py-1 text-xs font-bold text-zinc-950 disabled:opacity-40"
                    style={{ background: accent }}
                  >
                    Pareggia
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && Number.parseFloat(feeInput) > 0)
                      sendFee(Number.parseFloat(feeInput) * 1e6);
                  }}
                  placeholder="Offerta in milioni (es. 4.5)"
                  disabled={waiting}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={waiting || !(Number.parseFloat(feeInput) > 0)}
                  onClick={() => sendFee(Number.parseFloat(feeInput) * 1e6)}
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-bold hover:bg-zinc-800 disabled:opacity-40"
                >
                  Offri
                </button>
              </div>
            </>
          )}
          {nv.stage === 'wage' && nv.wageAsk != null && presState === 'closed' && (
            <>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">
                  Richiesta d'ingaggio:{' '}
                  <b className="text-zinc-100">{fmtM(nv.wageAsk * 52)}/anno</b>
                </span>
                <div className="flex gap-1.5">
                  {[0.85, 0.93].map((f) => (
                    <button
                      key={f}
                      type="button"
                      disabled={waiting}
                      onClick={() => sendWage(Math.round((nv.wageAsk! * f) / 500) * 500)}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {fmtM(Math.round((nv.wageAsk! * f) / 500) * 500 * 52)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={waiting}
                    onClick={() => sendWage(nv.wageAsk!)}
                    className="rounded px-2 py-1 text-xs font-bold text-zinc-950 disabled:opacity-40"
                    style={{ background: accent }}
                  >
                    Accontenta
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={wageInput}
                  onChange={(e) => setWageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && Number.parseFloat(wageInput) > 0)
                      sendWage((Number.parseFloat(wageInput) * 1e6) / 52);
                  }}
                  placeholder="Ingaggio annuo in milioni (es. 2.5)"
                  disabled={waiting}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={waiting || !(Number.parseFloat(wageInput) > 0)}
                  onClick={() => sendWage((Number.parseFloat(wageInput) * 1e6) / 52)}
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-bold hover:bg-zinc-800 disabled:opacity-40"
                >
                  Proponi
                </button>
              </div>
            </>
          )}
          {nv.stage === 'done' && !waiting && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-bold text-emerald-400">Accordo totale raggiunto</div>
                <div className="text-xs text-zinc-400">
                  {fmtM(nv.agreedFee ?? 0)} al club · {fmtM((nv.agreedWage ?? 0) * 52)}/anno
                  {nv.commission > 0 ? ` · ${fmtM(nv.commission)} d'agenzia` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDone(closeNegotiation(session, playerId))}
                className="rounded-lg px-5 py-2 font-bold text-zinc-950"
                style={{ background: accent }}
              >
                {nv.windowOpen ? '✍ Firma ora' : '🤝 Deposita pre-accordo'}
              </button>
            </div>
          )}
          {nv.stage === 'failed' && !waiting && (
            <button
              type="button"
              onClick={() => {
                closeNegotiation(session, playerId);
                onDone(null);
              }}
              className="w-full rounded-lg bg-zinc-800 py-2 text-sm hover:bg-zinc-700"
            >
              Il tavolo è saltato — archivia
            </button>
          )}
          {(nv.stage === 'fee' || nv.stage === 'wage') && (
            <div className="mt-2 flex items-center justify-center gap-4 text-[11px]">
              <button
                type="button"
                onClick={onPause}
                className="text-zinc-500 hover:text-zinc-300"
                title="il tavolo resta vivo nell'hub Tavoli"
              >
                ⏸ metti in pausa (resta nell'hub)
              </button>
              <button
                type="button"
                onClick={() => {
                  abandonNegotiation(session, playerId);
                  onDone(null);
                }}
                className="text-zinc-600 hover:text-red-400"
              >
                alzati dal tavolo senza accordo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
