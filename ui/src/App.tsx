import { useState } from 'react';
import { CityHub } from './CityHub';
import { ClubShowcase } from './ClubShowcase';
import { Crest } from './Crest';
import { MainMenu } from './MainMenu';
import { Stadium3D } from './Stadium3D';
import { StadiumBuilder } from './StadiumBuilder';
import { Structure3D } from './Structure3D';
import { clubDossiers } from './game';
import {
  type CommercialId,
  type GameSession,
  type PriceLevel,
  acceptOffer,
  buildCityStructure,
  changeStructurePrice,
  cityStructures,
  clubInfo,
  counterOffer,
  dashboard,
  fanProposal,
  fanZonesView,
  hirePreparatore,
  hubDetails,
  marketView,
  newManagerCareer,
  playRound,
  playerDetail,
  rejectOffer,
  resolveFanProposal,
  sedeView,
  squadRows,
  stadiumView,
  staffView,
  structureDetail,
  tableRows,
} from './game';
import { clubIdentity, presidentType } from './identity';

type Screen = 'map' | 'stadio' | 'campo' | 'staff';

export default function App() {
  const [atMenu, setAtMenu] = useState(true);
  const [session, setSession] = useState<GameSession | null>(null);
  const [screen, setScreen] = useState<Screen>('map');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [staffMsg, setStaffMsg] = useState<string | null>(null);
  const [sedeTab, setSedeTab] = useState<
    'consiglio' | 'mercato' | 'finanze' | 'staff' | 'progetti'
  >('consiglio');
  const [showTable, setShowTable] = useState(false);
  const [dayMode, setDayMode] = useState(false);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  /** Piazzamento di una struttura in città: si sceglie il punto sulla mappa. */
  const [placing, setPlacing] = useState<{ id: CommercialId; name: string } | null>(null);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ id: string; name: string; building: boolean } | null>(
    null,
  );
  const seed = 42;

  if (!session) {
    if (atMenu) return <MainMenu onStart={() => setAtMenu(false)} />;
    return (
      <ClubShowcase
        clubs={clubDossiers(seed)}
        onPick={(i) => setSession(newManagerCareer(seed, i))}
      />
    );
  }

  const dash = dashboard(session);
  const info = clubInfo(session);
  const id = clubIdentity(info.name, info.reputation, info.league, info.nation);
  const card = 'rounded-xl border border-zinc-800 bg-zinc-900 p-4';

  // L'hub è la mappa a schermo intero: niente cornici, la UI galleggia sopra.
  if (screen === 'map') {
    const pos = dash.position;
    const mv = marketView(session);
    const ticker = [
      mv.window
        ? `MERCATO ${mv.window.toUpperCase()} APERTO${mv.deadline ? ' — DEADLINE DAY!' : ''}`
        : null,
      ...mv.news.slice(0, 2).map((n) => n.headline),
      dash.finished ? 'Stagione conclusa' : `Giornata ${dash.round} di ${dash.total}`,
      typeof pos === 'number' ? `La squadra è ${pos}ª in classifica` : null,
      lastResult ? `Ultimo risultato: ${lastResult}` : null,
      `Spogliatoio: morale ${dash.morale}`,
      dash.finished ? null : `Prossima partita: ${dash.nextMatch}`,
      typeof pos === 'number' && pos <= 3 ? 'La piazza sogna in grande…' : null,
      typeof pos === 'number' && pos >= 15 ? 'La piazza mormora: servono punti' : null,
    ]
      .filter(Boolean)
      .join('      ·      ');

    return (
      <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
        <CityHub
          id={id}
          matchPending={!dash.finished}
          details={hubDetails(session)}
          onEnter={(b) => setScreen(b)}
          extras={cityStructures(session).map((x) => ({
            key: x.id,
            name: x.name,
            lat: id.city.lat + x.dy,
            lon: id.city.lon + x.dx,
            building: x.building,
          }))}
          placing={placing?.name ?? null}
          onPlace={(lat, lon) => {
            if (!placing) return;
            setBuildMsg(
              buildCityStructure(session, placing.id, lon - id.city.lon, lat - id.city.lat),
            );
            setPlacing(null);
          }}
          onInspect={(key) => {
            const x = cityStructures(session).find((e) => e.id === key);
            if (x) setInspect({ id: x.id, name: x.name, building: x.building });
          }}
          fans={
            placing
              ? fanZonesView(session).map((z) => ({
                  lat: id.city.lat + z.dy,
                  lon: id.city.lon + z.dx,
                  r: z.r,
                  w: z.w,
                }))
              : undefined
          }
        />

        {/* banner piazzamento / esito cantiere */}
        {placing && (
          <div className="absolute left-1/2 top-24 z-[1020] flex -translate-x-1/2 items-center gap-4 rounded-xl border border-amber-600/60 bg-zinc-950/90 px-5 py-2.5 backdrop-blur">
            <span>
              📍 Clicca sulla mappa dove costruire <b>{placing.name}</b>
              <span className="ml-3 text-xs text-zinc-400">
                🔴 cuore del tifo · 🟠 caldo · 🟡 tiepido — lì si incassa di più
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPlacing(null)}
              className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
            >
              Annulla
            </button>
          </div>
        )}
        {buildMsg && !placing && (
          <button
            type="button"
            onClick={() => setBuildMsg(null)}
            className="absolute left-1/2 top-24 z-[1020] -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-950/90 px-5 py-2.5 text-sm backdrop-blur hover:border-zinc-500"
          >
            {buildMsg} ✕
          </button>
        )}

        {/* la curva propone di intitolare uno spalto (MODULE_STADIUM §3.3) */}
        {(() => {
          const prop = fanProposal(session);
          if (!prop) return null;
          return (
            <div className="absolute bottom-36 left-1/2 z-[1020] w-full max-w-lg -translate-x-1/2 rounded-xl border border-amber-600/60 bg-zinc-950/95 px-5 py-3 shadow-xl backdrop-blur">
              <div className="mb-1 text-xs uppercase tracking-widest text-amber-500">
                la curva propone
              </div>
              <p className="mb-2 text-sm text-zinc-300">{prop.reason}</p>
              <div className="flex items-center gap-3">
                <span className="font-bold" style={{ color: id.accent }}>
                  → "{prop.name}"
                </span>
                <button
                  type="button"
                  className="rounded-lg px-4 py-1.5 text-sm font-bold text-zinc-950"
                  style={{ background: id.accent }}
                  onClick={() => {
                    setBuildMsg(resolveFanProposal(session, true));
                    refresh();
                  }}
                >
                  Intitola
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
                  onClick={() => {
                    setBuildMsg(resolveFanProposal(session, false));
                    refresh();
                  }}
                >
                  Rifiuta
                </button>
              </div>
            </div>
          );
        })()}

        {/* viewer 3D della struttura cliccata sulla mappa */}
        {inspect && (
          <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setInspect(null)}
            onKeyDown={(e) => e.key === 'Escape' && setInspect(null)}
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              {(() => {
                const det = structureDetail(session, inspect.id as CommercialId);
                const K = (n: number) =>
                  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
                return (
                  <>
                    <div className="mb-2 flex items-baseline justify-between">
                      <h3 className="text-lg font-bold">{det.name}</h3>
                      <span className="text-xs text-zinc-500">
                        {det.building ? 'cantiere in corso' : det.densityLabel}
                      </span>
                    </div>
                    <Structure3D structure={det.id} building={det.building} accent={id.accent} />
                    {!det.building && (
                      <div className="mt-3">
                        <div className="mb-1.5 text-xs uppercase tracking-widest text-zinc-500">
                          Politica prezzi — {det.densityLabel}
                        </div>
                        <div className="flex gap-2">
                          {det.estimates.map((e) => (
                            <button
                              key={e.level}
                              type="button"
                              onClick={() => {
                                changeStructurePrice(session, det.id, e.level as PriceLevel);
                                refresh();
                              }}
                              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                det.price === e.level
                                  ? 'bg-zinc-800 font-bold'
                                  : 'hover:bg-zinc-800/60'
                              }`}
                              style={{
                                borderColor: det.price === e.level ? id.accent : '#3f3f46',
                                color: det.price === e.level ? id.accent : undefined,
                              }}
                            >
                              <div className="capitalize">{e.level}</div>
                              <div className="text-xs text-zinc-400">~{K(e.amount)}/stagione</div>
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] text-zinc-600">
                          il premium rende solo dove il tifo è denso; il popolare è stabile ovunque
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      className="mt-3 rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
                      onClick={() => setInspect(null)}
                    >
                      Chiudi
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* vignettatura: i bordi della mappa sfumano nel buio, niente cornice */}
        <div
          className="pointer-events-none absolute inset-0 z-[1000]"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 62%, rgba(9,9,11,0.95) 100%), linear-gradient(to bottom, rgba(9,9,11,0.8), transparent 16%)',
          }}
        />

        {/* header identitario */}
        <div className="absolute left-6 top-4 z-[1010] flex items-center gap-4">
          <Crest
            id={id}
            name={info.name}
            reputation={info.reputation}
            className="h-24 w-24 drop-shadow-xl"
          />
          <div>
            <h1 className="text-2xl font-black drop-shadow" style={{ color: id.accent }}>
              {info.name}
            </h1>
            <p className="text-xs italic text-zinc-400">
              "{id.nickname}" · {id.city.name} · {info.league}
            </p>
          </div>
        </div>

        {/* stato essenziale */}
        <div className="absolute right-6 top-5 z-[1010] flex gap-2">
          {mv.offers.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSedeTab('mercato');
                setScreen('staff');
              }}
              className="cursor-pointer text-left transition-transform hover:scale-105"
              title="offerte sul tavolo del presidente"
            >
              <div className="rounded-lg border border-amber-600/70 bg-zinc-950/85 px-3 py-1.5 text-sm backdrop-blur">
                <div className="text-[10px] uppercase tracking-wide text-amber-500">Mercato</div>
                <div className="font-bold text-amber-400">
                  📨 {mv.offers.length} offert{mv.offers.length === 1 ? 'a' : 'e'}
                </div>
              </div>
            </button>
          )}
          <Chip k="Stagione" v={String(session.year)} />
          <button
            type="button"
            onClick={() => setShowTable(true)}
            className="cursor-pointer text-left transition-transform hover:scale-105"
            title="classifica completa"
          >
            <Chip k="Posizione" v={`${pos}°`} accent={id.accent} />
          </button>
          <Chip k="Morale" v={dash.morale} />
        </div>

        {/* classifica: pannello sopra la mappa, dal chip Posizione */}
        {showTable && (
          <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowTable(false)}
            onKeyDown={(e) => e.key === 'Escape' && setShowTable(false)}
            role="presentation"
          >
            <div
              className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              <h3 className="mb-3 text-lg font-bold">Classifica — {info.league}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {tableRows(session).map((r) => (
                    <tr key={r.name} className={r.mine ? 'bg-emerald-950/60 font-semibold' : ''}>
                      <td className="w-8 py-1 pr-2 text-right text-zinc-500">{r.pos}</td>
                      <td>{r.name}</td>
                      <td className="text-right text-zinc-400">{r.played}</td>
                      <td className="text-right text-zinc-400">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                      <td className="w-10 text-right font-bold">{r.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* prossima partita + gioca, senza entrare nello stadio */}
        <div className="absolute bottom-12 left-1/2 z-[1010] flex -translate-x-1/2 items-center gap-5 rounded-2xl border border-zinc-800/70 bg-zinc-950/85 px-6 py-3 shadow-xl backdrop-blur">
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500">
              {dash.finished ? 'stagione' : `giornata ${dash.round}/${dash.total}`}
            </div>
            <div className="font-semibold">{dash.finished ? 'conclusa' : dash.nextMatch}</div>
          </div>
          {!dash.finished && (
            <button
              type="button"
              className="rounded-xl px-5 py-2 font-bold text-zinc-950 transition-transform hover:scale-105"
              style={{ background: id.accent }}
              onClick={() => setLastResult(playRound(session).scoreline)}
            >
              ▶ Gioca
            </button>
          )}
          {lastResult && (
            <div className="text-sm">
              <span className="text-zinc-500">ultimo </span>
              <span className="font-bold">{lastResult}</span>
            </div>
          )}
        </div>

        {/* ticker della piazza */}
        <div className="absolute inset-x-0 bottom-0 z-[1010] overflow-hidden border-t border-zinc-800/60 bg-zinc-950/85 py-1.5 backdrop-blur">
          <div className="ticker-track text-xs tracking-wide text-zinc-400">{ticker}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(ellipse at 20% 0%, ${id.secondary}26, transparent 55%), radial-gradient(ellipse at 90% 100%, ${id.primary}1c, #09090b 65%)`,
      }}
    >
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-4 flex items-baseline justify-between">
          <h1 className="text-2xl font-bold" style={{ color: id.accent }}>
            {session.club.name}
          </h1>
          <span className="text-sm text-zinc-400">
            Stagione {session.year} · Giornata {dash.round}/{dash.total}
          </span>
        </header>

        {/* Dashboard essenziale (MODULE_UI §2) */}
        <div className="mb-6 grid grid-cols-4 gap-3 text-sm">
          <div className={card}>
            <div className="text-zinc-500">Posizione</div>
            <div className="text-2xl font-bold text-emerald-400">{dash.position}°</div>
          </div>
          <div className={card}>
            <div className="text-zinc-500">Prossima partita</div>
            <div className="font-semibold">{dash.nextMatch}</div>
          </div>
          <div className={card}>
            <div className="text-zinc-500">Morale squadra</div>
            <div className="font-semibold">{dash.morale}</div>
          </div>
          <div className={card}>
            <div className="text-zinc-500">Ultimo risultato</div>
            <div className="font-semibold">{lastResult ?? '—'}</div>
          </div>
        </div>

        {screen === 'stadio' &&
          (() => {
            const sv = stadiumView(session);
            return (
              <section className={card}>
                <BackBar
                  title={`Stadio — ${sv.capacity.toLocaleString('it-IT')} posti`}
                  onBack={() => setScreen('map')}
                />
                <div className="mb-5">
                  <Stadium3D
                    id={id}
                    capacity={sv.capacity}
                    pitch={sv.pitch}
                    site={sv.site}
                    built={sv.commercial.filter((c) => c.built).map((c) => c.id)}
                    sectors={sv.render}
                    daylight={dayMode}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-zinc-500">
                      trascina per ruotare · rotella per lo zoom
                    </p>
                    <div className="flex gap-1">
                      {(
                        [
                          [false, '🌙 Notte'],
                          [true, '☀️ Giorno'],
                        ] as const
                      ).map(([day, label]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setDayMode(day)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                            dayMode === day ? 'bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-800/60'
                          }`}
                          style={
                            dayMode === day
                              ? { borderColor: id.accent, color: id.accent }
                              : undefined
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <StadiumBuilder
                  session={session}
                  accent={id.accent}
                  onChanged={refresh}
                  onPlaceRequest={(pid, name) => {
                    setPlacing({ id: pid as CommercialId, name });
                    setScreen('map');
                  }}
                />
              </section>
            );
          })()}

        {screen === 'staff' && (
          <section className={card}>
            <BackBar title="Sede del club — Presidenza" onBack={() => setScreen('map')} />
            {/* le sezioni del centro di controllo */}
            <div className="mb-4 flex gap-2">
              {(
                [
                  ['consiglio', 'Consiglio'],
                  ['mercato', 'Mercato'],
                  ['finanze', 'Finanze'],
                  ['staff', 'Staff'],
                  ['progetti', 'Progetti'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSedeTab(k)}
                  className={`rounded-lg border px-4 py-1.5 text-sm font-semibold transition-colors ${
                    sedeTab === k ? 'bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-800/60'
                  }`}
                  style={sedeTab === k ? { borderColor: id.accent, color: id.accent } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            {sedeTab === 'consiglio' &&
              (() => {
                const v = sedeView(session);
                return (
                  <div className="space-y-3 text-sm">
                    <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
                      <div className="text-xs uppercase tracking-widest text-zinc-500">
                        la tua presidenza
                      </div>
                      <div className="mt-1 text-lg font-bold" style={{ color: id.accent }}>
                        Tu — Presidente del {session.club.name}
                      </div>
                      <div className="text-zinc-400">
                        {v.president
                          ? `subentrato a ${v.president.name} (presidenza ${presidentType(v.president.traits).toLowerCase()})`
                          : 'primo presidente della storia del club'}{' '}
                        · club di reputazione {v.reputation}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-zinc-800/60 p-3">
                        <div className="text-xs text-zinc-500">Cassa</div>
                        <div className="text-lg font-bold text-emerald-400">
                          {(v.cash / 1e6).toFixed(1)}M
                        </div>
                      </div>
                      <div className="rounded-lg bg-zinc-800/60 p-3">
                        <div className="text-xs text-zinc-500">Budget mercato</div>
                        <div className="text-lg font-bold">
                          {(v.transferBudget / 1e6).toFixed(1)}M
                        </div>
                      </div>
                      <div className="rounded-lg bg-zinc-800/60 p-3">
                        <div className="text-xs text-zinc-500">Ingaggi / settimana</div>
                        <div className="text-lg font-bold">{(v.weeklyBill / 1e3).toFixed(0)}k</div>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Dalla sede si governa il club: i conti, lo staff, i cantieri. Il campo è
                      affare dell'allenatore.
                    </p>
                  </div>
                );
              })()}

            {sedeTab === 'mercato' &&
              (() => {
                const mv = marketView(session);
                const K = (n: number) => `${(n / 1e6).toFixed(1)}M`;
                return (
                  <div className="space-y-4 text-sm">
                    <div
                      className={`rounded-lg border px-3 py-2 ${
                        mv.window
                          ? 'border-emerald-700/60 bg-emerald-950/30'
                          : 'border-zinc-800 bg-zinc-950/50'
                      }`}
                    >
                      {mv.window
                        ? `🟢 Mercato ${mv.window} APERTO${mv.deadline ? ' — DEADLINE DAY: ultime ore!' : ''}`
                        : '⚪ Mercato chiuso — finestre: estiva (giornate 1-4) e invernale (18-22)'}
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Offerte sul tavolo
                      </h4>
                      {mv.offers.length === 0 && (
                        <p className="text-zinc-500">
                          Nessuna offerta al momento. I club si muovono nelle finestre — e i tuoi
                          migliori fanno gola.
                        </p>
                      )}
                      <div className="space-y-2">
                        {mv.offers.map((o) => (
                          <div
                            key={`${o.player}-${o.from}`}
                            className="rounded-lg border border-amber-700/50 bg-zinc-950/60 p-3"
                          >
                            <div className="flex items-baseline justify-between">
                              <div className="font-bold">
                                {o.player}
                                {o.bigStep && (
                                  <span className="ml-2 text-xs text-amber-500">
                                    ★ il Grande Salto
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-zinc-500">
                                scade tra {o.expiresIn} giornat{o.expiresIn === 1 ? 'a' : 'e'}
                              </span>
                            </div>
                            <div className="mb-2 text-zinc-400">
                              Il {o.from} offre <b className="text-emerald-400">{K(o.bid)}</b> · il
                              cartellino vale {K(o.ask)}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold hover:bg-emerald-500"
                                onClick={() => {
                                  setStaffMsg(acceptOffer(session, o.index));
                                  refresh();
                                }}
                              >
                                Accetta {K(o.bid)}
                              </button>
                              {!o.countered && (
                                <button
                                  type="button"
                                  className="rounded-lg border px-3 py-1.5 font-semibold transition-colors hover:bg-zinc-800"
                                  style={{ borderColor: id.accent, color: id.accent }}
                                  onClick={() => {
                                    setStaffMsg(counterOffer(session, o.index));
                                    refresh();
                                  }}
                                >
                                  Rilancia a {K(o.ask)}
                                </button>
                              )}
                              <button
                                type="button"
                                className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
                                onClick={() => {
                                  setStaffMsg(rejectOffer(session, o.index));
                                  refresh();
                                }}
                              >
                                Rifiuta
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {staffMsg && <p className="mt-2 text-zinc-300">{staffMsg}</p>}
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                        La gazzetta del mercato
                      </h4>
                      {mv.news.length === 0 && (
                        <p className="text-zinc-500">Nessun affare concluso finora.</p>
                      )}
                      <div className="space-y-1.5">
                        {mv.news.slice(0, 12).map((n) => (
                          <div
                            key={`${n.round}-${n.player}`}
                            className="flex gap-3 border-b border-zinc-800/60 py-1.5"
                          >
                            <span className="shrink-0 text-xs text-zinc-600">G{n.round}</span>
                            <span className="text-zinc-300">{n.headline}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

            {sedeTab === 'finanze' &&
              (() => {
                const v = sedeView(session);
                const K = (n: number) =>
                  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
                return (
                  <div className="grid gap-4 text-sm md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Entrate
                      </h4>
                      {v.incomes.length === 0 && (
                        <p className="text-zinc-500">
                          Prima stagione in corso: il bilancio completo arriva a fine stagione.
                        </p>
                      )}
                      {v.incomes.map((e) => (
                        <div
                          key={e.label}
                          className="flex justify-between border-b border-zinc-800/60 py-1.5"
                        >
                          <span className="text-zinc-300">{e.label}</span>
                          <span className="font-semibold text-emerald-400">+{K(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Uscite
                      </h4>
                      {v.expenses.length === 0 && (
                        <p className="text-zinc-500">Nessuna spesa registrata finora.</p>
                      )}
                      {v.expenses.map((e) => (
                        <div
                          key={e.label}
                          className="flex justify-between border-b border-zinc-800/60 py-1.5"
                        >
                          <span className="text-zinc-300">{e.label}</span>
                          <span className="font-semibold text-red-400">−{K(e.amount)}</span>
                        </div>
                      ))}
                      <div className="mt-3 flex justify-between rounded-lg bg-zinc-800/60 px-3 py-2">
                        <span>Tetto ingaggi settimanale</span>
                        <span className="font-bold">{K(v.wageBudget)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {sedeTab === 'staff' &&
              (() => {
                const v = staffView(session);
                return (
                  <div className="space-y-3 text-sm">
                    {v.coach && (
                      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3">
                        <div className="font-bold">{v.coach.name} — Allenatore</div>
                        <div className="text-zinc-400">
                          rep. {v.coach.rep} · {v.coach.style} · {v.coach.fit}
                        </div>
                      </div>
                    )}
                    {v.staff.map((m) => (
                      <div
                        key={m.name}
                        className="flex justify-between rounded-lg bg-zinc-800/60 px-3 py-2"
                      >
                        <span>
                          {m.name} <span className="text-zinc-500">— {m.role}</span>
                        </span>
                        <span className="font-bold text-emerald-400">{m.quality}</span>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500"
                      onClick={() => setStaffMsg(hirePreparatore(session))}
                    >
                      + Assumi preparatore atletico (2M)
                    </button>
                    {staffMsg && <p className="text-zinc-400">{staffMsg}</p>}
                    <p className="text-xs text-zinc-500">
                      I preparatori sostengono il fisico dei giocatori over-28 nella crescita di
                      fine stagione.
                    </p>
                  </div>
                );
              })()}

            {sedeTab === 'progetti' &&
              (() => {
                const sv = stadiumView(session);
                const città = cityStructures(session);
                return (
                  <div className="space-y-3 text-sm">
                    <div className="rounded-lg bg-zinc-800/60 p-3">
                      <div className="text-xs text-zinc-500">Stadio</div>
                      <div className="font-semibold">
                        {sv.capacity.toLocaleString('it-IT')} posti ·{' '}
                        {sv.commercial.filter((c) => c.built).length} attività attive
                      </div>
                    </div>
                    {sv.project ? (
                      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2">
                        🏗 {sv.project}
                      </div>
                    ) : (
                      <p className="text-zinc-500">Nessun cantiere in corso.</p>
                    )}
                    <div className="rounded-lg bg-zinc-800/60 p-3">
                      <div className="text-xs text-zinc-500">Strutture in città</div>
                      <div className="font-semibold">
                        {città.length === 0
                          ? 'nessuna — si costruiscono dalla pagina Stadio'
                          : città
                              .map((x) => x.name + (x.building ? ' (cantiere)' : ''))
                              .join(' · ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border px-4 py-2 font-semibold transition-colors hover:bg-zinc-800"
                      style={{ borderColor: id.accent, color: id.accent }}
                      onClick={() => setScreen('stadio')}
                    >
                      Apri il builder dello stadio →
                    </button>
                  </div>
                );
              })()}
          </section>
        )}

        {selectedPlayer &&
          (() => {
            const d = playerDetail(session, selectedPlayer);
            if (!d) return null;
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                onClick={() => setSelectedPlayer(null)}
                onKeyDown={(e) => e.key === 'Escape' && setSelectedPlayer(null)}
                role="presentation"
              >
                <div
                  className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <div className="mb-1 flex items-baseline justify-between">
                    <h3 className="text-xl font-bold">{d.name}</h3>
                    <span className="text-2xl font-bold text-emerald-400">{d.overall}</span>
                  </div>
                  <p className="mb-3 text-sm text-zinc-400">
                    {d.pos} · {d.age} anni · {d.nationality} · piede {d.foot} · {d.label} ·{' '}
                    {d.morale}
                    {d.injury ? ` · 🚑 ${d.injury}` : ''}
                    {d.adapting ? ` · ambientamento: ${d.adapting} giornate` : ''}
                  </p>
                  <p className="mb-3 text-sm text-zinc-400">
                    Contratto: {d.wage}k/sett.{d.contractEnd ? ` fino al ${d.contractEnd}` : ''}
                  </p>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                    {d.attrs.map(([k, v]) => (
                      <div
                        key={k}
                        className="flex justify-between border-b border-zinc-800/60 py-0.5"
                      >
                        <span className="text-zinc-400">{k}</span>
                        <span
                          className={
                            v >= 75 ? 'font-bold text-emerald-400' : v >= 55 ? '' : 'text-zinc-500'
                          }
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-4 rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
                    onClick={() => setSelectedPlayer(null)}
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            );
          })()}

        {screen === 'campo' && (
          <section className={card}>
            <BackBar title="Campo d'allenamento — Rosa" onBack={() => setScreen('map')} />
            <table className="w-full text-sm">
              <tbody>
                {squadRows(session).map((p) => (
                  <tr
                    key={p.name}
                    onClick={() => setSelectedPlayer(p.name)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPlayer(p.name)}
                    className="cursor-pointer border-b border-zinc-800/60 hover:bg-zinc-800/60"
                  >
                    <td className="py-1 font-medium">{p.name}</td>
                    <td className="text-zinc-400">{p.pos}</td>
                    <td className="text-zinc-400">{p.age}</td>
                    <td className="font-bold text-emerald-400">{p.overall}</td>
                    <td className="text-zinc-400">{p.morale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}

function Chip({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/85 px-3 py-1.5 text-sm backdrop-blur">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
      <div className="font-bold" style={accent ? { color: accent } : undefined}>
        {v}
      </div>
    </div>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
      >
        ← Mappa
      </button>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}
