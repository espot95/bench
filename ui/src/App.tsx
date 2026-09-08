import { useState } from 'react';
import { CityHub } from './CityHub';
import { ClubShowcase } from './ClubShowcase';
import { ContractsPane } from './ContractsPane';
import { Crest } from './Crest';
import { EventsPane } from './EventsPane';
import { HeatCard } from './Heatmap';
import { MainMenu } from './MainMenu';
import { MarketMap } from './MarketMap';
import { OffseasonScreen } from './OffseasonScreen';
import { SponsorPane } from './SponsorPane';
import { Stadium3D } from './Stadium3D';
import { StadiumBuilder } from './StadiumBuilder';
import { Structure3D } from './Structure3D';
import { clubDossiers } from './game';
import {
  type CommercialId,
  type GameSession,
  type PriceLevel,
  acceptOffer,
  advanceSeason,
  borsinoRows,
  buildCityStructure,
  changeStructurePrice,
  cityStructures,
  clubInfo,
  counterOffer,
  cupView,
  dashboard,
  expiringContracts,
  fanProposal,
  fanZonesView,
  financeDashboard,
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
  treasuryView,
} from './game';
import { clubIdentity, presidentType } from './identity';
import { SaveDialog } from './saves/SaveDialog';
import { SavesScreen } from './saves/SavesScreen';
import { localStore } from './saves/local';
import { sessionToSave } from './saves/session';
import { AUTOSAVE_ID } from './saves/store';

type Screen = 'map' | 'stadio' | 'campo' | 'staff' | 'mercato';

export default function App() {
  const [atMenu, setAtMenu] = useState(true);
  const [atSaves, setAtSaves] = useState(false);
  const [session, setSession] = useState<GameSession | null>(null);
  /** Salvataggi (UI-4): dialog 💾 e nota "autosalvato" dopo ogni giornata. */
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const autosave = (s: GameSession, label: string) => {
    localStore
      .put(AUTOSAVE_ID, sessionToSave(s, 'Autosalvataggio'))
      .then(() => setSavedNote(`autosalvato · ${label}`))
      .catch(() => setSavedNote('autosalvataggio non riuscito'));
  };
  /** Chiusura stagione (MODULE_UI §6): le altre divisioni giocano in-browser (~secondi). */
  const [closing, setClosing] = useState(false);
  const closeSeasonNow = (s: GameSession) => {
    setClosing(true);
    setTimeout(() => {
      try {
        advanceSeason(s);
        setLastResult(null);
        autosave(s, 'nuova stagione');
      } finally {
        setClosing(false);
      }
    }, 40);
  };
  const exitToMenu = () => {
    setSaveOpen(false);
    setSession(null);
    setScreen('map');
    setLastResult(null);
    setSavedNote(null);
    setAtMenu(true);
  };
  const [screen, setScreen] = useState<Screen>('map');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [staffMsg, setStaffMsg] = useState<string | null>(null);
  const [sedeTab, setSedeTab] = useState<
    'consiglio' | 'mercato' | 'contratti' | 'sponsor' | 'finanze' | 'staff' | 'progetti' | 'eventi'
  >('consiglio');
  const [showTable, setShowTable] = useState(false);
  const [showCup, setShowCup] = useState(false);
  /** Dashboard Finanze (richiesta utente): importi su base annua o settimanale. */
  const [finBasis, setFinBasis] = useState<'anno' | 'settimana'>('anno');
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
    if (atSaves) {
      return (
        <SavesScreen
          onLoad={(s) => {
            setSession(s);
            setAtSaves(false);
            setAtMenu(false);
          }}
          onBack={() => setAtSaves(false)}
        />
      );
    }
    if (atMenu) {
      return <MainMenu onStart={() => setAtMenu(false)} onContinue={() => setAtSaves(true)} />;
    }
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
  const card = 'anim-in rounded-xl border border-zinc-800 bg-zinc-900 p-4';

  // Fine stagione: il riepilogo resta finché l'utente non apre la stagione nuova.
  if (session.offseason) {
    return (
      <OffseasonScreen
        s={session.offseason}
        id={id}
        onContinue={() => {
          session.offseason = null;
          setScreen('map');
          refresh();
        }}
      />
    );
  }

  // Viaggi di mercato (MODULE_MARKET §8): mappa d'Europa a schermo intero.
  if (screen === 'mercato') {
    return <MarketMap session={session} id={id} onBack={() => setScreen('map')} />;
  }

  // L'hub è la mappa a schermo intero: niente cornici, la UI galleggia sopra.
  if (screen === 'map') {
    const pos = dash.position;
    const mv = marketView(session);
    const ticker = [
      mv.window
        ? `MERCATO ${mv.window.toUpperCase()} APERTO${mv.deadline ? ' — DEADLINE DAY!' : ''}`
        : null,
      ...mv.news.slice(0, 2).map((n) => n.headline),
      expiringContracts(session) > 0
        ? `⚠ ${expiringContracts(session)} contratti in scadenza: la Sede aspetta`
        : null,
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
            className="toast-in absolute left-1/2 top-24 z-[1020] -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-950/90 px-5 py-2.5 text-sm backdrop-blur hover:border-zinc-500"
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
            className="backdrop-fade fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setInspect(null)}
            onKeyDown={(e) => e.key === 'Escape' && setInspect(null)}
            role="presentation"
          >
            <div
              className="modal-pop w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4"
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
          {cupView(session).length > 0 && (
            <button
              type="button"
              onClick={() => setShowCup(true)}
              className="cursor-pointer text-left transition-transform hover:scale-105"
              title="tabellone delle coppe nazionali"
            >
              <Chip
                k="Coppa"
                v={
                  cupView(session).some((c) => c.status === 'vinta')
                    ? '🏆 vinta!'
                    : cupView(session).some((c) => c.status === 'in corsa')
                      ? 'in corsa'
                      : 'fuori'
                }
              />
            </button>
          )}
          <Chip k="Morale" v={dash.morale} />
        </div>

        {/* classifica: pannello sopra la mappa, dal chip Posizione */}
        {showTable && (
          <div
            className="backdrop-fade fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowTable(false)}
            onKeyDown={(e) => e.key === 'Escape' && setShowTable(false)}
            role="presentation"
          >
            <div
              className="modal-pop max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
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

        {/* tabellone coppe (MODULE_CUPS): dal chip Coppa */}
        {showCup && (
          <div
            className="backdrop-fade fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowCup(false)}
            onKeyDown={(e) => e.key === 'Escape' && setShowCup(false)}
            role="presentation"
          >
            <div
              className="modal-pop max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-sm"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              {cupView(session).map((cup) => (
                <div key={cup.id} className="mb-5">
                  <h3 className="mb-1 text-lg font-bold">
                    🏆 {cup.name}{' '}
                    <span className="text-xs font-normal uppercase text-zinc-500">
                      {cup.status}
                    </span>
                  </h3>
                  {cup.winner && (
                    <div className="mb-2 text-amber-300">Vincitrice: {cup.winner}</div>
                  )}
                  {cup.nextStage && (
                    <div className="mb-2 text-xs text-zinc-500">
                      prossimo turno: {cup.nextStage.name} (dopo la g.{cup.nextStage.afterRound})
                    </div>
                  )}
                  {cup.stages.length === 0 && (
                    <div className="text-zinc-500">Il tabellone si compila turno dopo turno.</div>
                  )}
                  {cup.stages.map((st) => (
                    <div key={st.name} className="mb-2">
                      <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                        {st.name}
                      </div>
                      <div className="grid gap-x-6 md:grid-cols-2">
                        {st.ties.map((t) => (
                          <div
                            key={`${t.home}|${t.away}`}
                            className={`flex justify-between gap-2 ${t.mine ? 'font-semibold text-emerald-300' : 'text-zinc-300'}`}
                          >
                            <span className="truncate">
                              {t.home} – {t.away}
                            </span>
                            <span className="shrink-0 text-zinc-400">{t.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
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
              onClick={() => {
                const r = playRound(session);
                setLastResult(r.scoreline);
                autosave(session, `g.${r.round}`);
              }}
            >
              ▶ Gioca
            </button>
          )}
          {dash.finished && (
            <button
              type="button"
              disabled={closing}
              className="rounded-xl px-5 py-2 font-bold text-zinc-950 transition-transform hover:scale-105 disabled:opacity-60"
              style={{ background: id.accent }}
              onClick={() => closeSeasonNow(session)}
              title="le altre divisioni giocano, poi l'off-season: conti, mercato dei rinnovi, giovani, verdetti"
            >
              {closing ? '⏳ Le altre divisioni giocano…' : '⏭ Chiudi la stagione'}
            </button>
          )}
          <button
            type="button"
            className="rounded-xl border px-4 py-2 font-semibold transition-transform hover:scale-105"
            style={{ borderColor: `${id.accent}88`, color: id.accent }}
            onClick={() => setScreen('mercato')}
            title="vola per l'Europa a trattare coi club"
          >
            🧳 Mercato
          </button>
          <button
            type="button"
            className="rounded-xl border border-zinc-700 px-3 py-2 font-semibold text-zinc-300 transition-transform hover:scale-105 hover:border-zinc-400"
            onClick={() => setSaveOpen(true)}
            title="salva, esporta o torna al menu"
          >
            💾
          </button>
          {lastResult && (
            <div className="text-sm">
              <span className="text-zinc-500">ultimo </span>
              <span className="font-bold">{lastResult}</span>
            </div>
          )}
          {savedNote && <div className="note-in text-[11px] text-zinc-500">{savedNote}</div>}
        </div>

        {saveOpen && (
          <SaveDialog
            session={session}
            accent={id.accent}
            onClose={() => setSaveOpen(false)}
            onExit={exitToMenu}
          />
        )}

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
                  ['contratti', 'Contratti'],
                  ['sponsor', 'Sponsor'],
                  ['finanze', 'Finanze'],
                  ['staff', 'Staff'],
                  ['progetti', 'Progetti'],
                  ['eventi', 'Eventi'],
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

            {/* il contenuto del tab entra con un fade+risalita a ogni cambio */}
            <div key={sedeTab} className="anim-in">
              {sedeTab === 'eventi' && <EventsPane session={session} accent={id.accent} />}

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
                          <div className="text-lg font-bold">
                            {(v.weeklyBill / 1e3).toFixed(0)}k
                          </div>
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
                                Il {o.from} offre <b className="text-emerald-400">{K(o.bid)}</b> ·
                                il cartellino vale {K(o.ask)}
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
                          Borsino
                        </h4>
                        {borsinoRows(session).length === 0 && (
                          <p className="text-zinc-500">
                            Il borsino si accende con le finestre: movimenti, rumors, quotazioni.
                          </p>
                        )}
                        <div className="space-y-1">
                          {borsinoRows(session).map((b, i) => (
                            <div
                              key={`${b.round}-${b.player}-${i}`}
                              className="flex items-center gap-2 border-b border-zinc-800/60 py-1 text-sm"
                            >
                              <span
                                className={
                                  b.trend === 'caldo'
                                    ? 'text-amber-400'
                                    : b.trend === 'sopra'
                                      ? 'text-red-300'
                                      : b.trend === 'sotto'
                                        ? 'text-emerald-300'
                                        : 'text-zinc-500'
                                }
                                title={
                                  b.trend === 'caldo'
                                    ? 'nome caldo: rumors in corso'
                                    : b.trend === 'sopra'
                                      ? 'pagato sopra la valutazione'
                                      : b.trend === 'sotto'
                                        ? 'preso sotto la valutazione'
                                        : 'in linea col valore'
                                }
                              >
                                {b.trend === 'caldo'
                                  ? '🔥'
                                  : b.trend === 'sopra'
                                    ? '↑'
                                    : b.trend === 'sotto'
                                      ? '↓'
                                      : '='}
                              </span>
                              <span className="flex-1 truncate">{b.player}</span>
                              <span className="text-xs text-zinc-500">
                                {b.fee > 0 ? `${(b.fee / 1e6).toFixed(1)}M` : 'rumor'} · g.{b.round}
                              </span>
                            </div>
                          ))}
                        </div>
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

              {sedeTab === 'contratti' && <ContractsPane session={session} accent={id.accent} />}

              {sedeTab === 'sponsor' && <SponsorPane session={session} accent={id.accent} />}

              {sedeTab === 'finanze' &&
                (() => {
                  const t = treasuryView(session);
                  const d = financeDashboard(session);
                  const K = (n: number) =>
                    n >= 1e6 || n <= -1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
                  /** Importo nella base scelta: annuo, o /52 per la vista settimanale. */
                  const B = (n: number) => K(finBasis === 'anno' ? n : n / 52);
                  const statusColor =
                    t.ratioStatus === 'blocco'
                      ? 'text-red-300'
                      : t.ratioStatus === 'allerta'
                        ? 'text-amber-300'
                        : 'text-emerald-300';
                  return (
                    <div className="space-y-4 text-sm">
                      {/* Tesoreria (MODULE_FINANCES §5): cassa, fido, sostenibilità */}
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
                          <div className="text-xs uppercase tracking-widest text-zinc-500">
                            Cassa
                          </div>
                          <div
                            className={`text-2xl font-bold ${t.cash < 0 ? 'text-red-300' : 'text-emerald-300'}`}
                          >
                            {K(t.cash)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            fido {K(t.overdraft)} ·{' '}
                            {t.overdraftUsed > 0
                              ? `usato ${K(t.overdraftUsed)} (interessi in corsa)`
                              : 'non usato'}
                          </div>
                          <div className="mt-1 text-xs text-zinc-400">
                            disponibilità totale <b>{K(t.room)}</b>
                          </div>
                        </div>
                        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
                          <div className="text-xs uppercase tracking-widest text-zinc-500">
                            Sostenibilità (squad-cost)
                          </div>
                          <div className={`text-2xl font-bold ${statusColor}`}>
                            {Math.round(t.ratio * 100)}%
                            <span className="ml-2 text-xs font-normal uppercase">
                              {t.ratioStatus}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-800">
                            <div
                              className={`h-full ${t.ratioStatus === 'blocco' ? 'bg-red-400' : t.ratioStatus === 'allerta' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                              style={{ width: `${Math.min(100, (t.ratio / t.ratioCap) * 100)}%` }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            stipendi {K(t.billWeekly * 52)}/anno · tetto {K(t.capWeekly * 52)}/anno
                            (cap {Math.round(t.ratioCap * 100)}% dei ricavi)
                          </div>
                          {t.amortization > 0 && (
                            <div className="mt-1 text-xs text-zinc-400">
                              rosa a bilancio <b>{K(t.bookValue)}</b> · ammortamenti{' '}
                              {K(t.amortization)}/anno (pesano sul cap)
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
                          <div className="text-xs uppercase tracking-widest text-zinc-500">
                            Proiezione stagione
                          </div>
                          <div
                            className={`text-2xl font-bold ${t.projection.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                          >
                            {t.projection.net >= 0 ? '+' : ''}
                            {K(t.projection.net)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            ricavi attesi {K(t.projection.revenues)} · stipendi{' '}
                            {K(t.projection.wages)} · gestione {K(t.projection.upkeep)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-400">
                            stagione in corso: {K(t.inTot)} entrate · {K(t.outTot)} uscite ·{' '}
                            <b className={t.net >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                              {t.net >= 0 ? '+' : ''}
                              {K(t.net)}
                            </b>
                          </div>
                        </div>
                      </div>

                      {/* Il verdetto (MODULE_FINANCES): si può investire nella squadra? */}
                      <div
                        className={`rounded-lg border p-3 ${
                          d.verdict.level === 'verde'
                            ? 'border-emerald-800 bg-emerald-950/30'
                            : d.verdict.level === 'giallo'
                              ? 'border-amber-800 bg-amber-950/30'
                              : 'border-red-800 bg-red-950/30'
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-bold">
                            {d.verdict.level === 'verde'
                              ? '🟢 Puoi investire'
                              : d.verdict.level === 'giallo'
                                ? '🟡 Investi con prudenza'
                                : '🔴 Niente investimenti'}
                          </span>
                          <span className="text-xs text-zinc-400">
                            mercato (cassa+fido){' '}
                            <b className="text-zinc-200">{K(d.verdict.room)}</b> · spazio ingaggi
                            sotto il cap{' '}
                            <b className="text-zinc-200">{K(d.verdict.wageHeadroom)}/anno</b>
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-400">
                          {d.verdict.reasons.join(' · ')}
                        </div>
                      </div>

                      {/* La dashboard: tutte le voci, base annua o settimanale */}
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                          Bilancio di gestione
                        </h4>
                        <div className="flex gap-1">
                          {(['anno', 'settimana'] as const).map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setFinBasis(b)}
                              className={`rounded border px-3 py-1 text-xs font-semibold ${
                                finBasis === b
                                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                                  : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800/60'
                              }`}
                            >
                              {b === 'anno' ? 'Annuale' : 'Settimanale'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-4 text-sm md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                            Entrate
                          </h4>
                          {d.incomes.map((r) => (
                            <div
                              key={r.label}
                              className="flex items-center justify-between border-b border-zinc-800/60 py-1.5"
                            >
                              <span className="text-zinc-300">
                                {r.label}{' '}
                                <span className="text-[10px] uppercase text-zinc-600">
                                  {r.kind === 'attesa' ? 'attesi' : 'incassati'}
                                </span>
                              </span>
                              <span className="font-semibold text-emerald-400">+{B(r.amount)}</span>
                            </div>
                          ))}
                          <div className="mt-2 flex justify-between rounded-lg bg-zinc-800/60 px-3 py-2">
                            <span>Totale entrate</span>
                            <span className="font-bold text-emerald-300">+{B(d.totalIn)}</span>
                          </div>
                        </div>
                        <div>
                          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                            Uscite
                          </h4>
                          {d.expenses.map((r) => (
                            <div
                              key={r.label}
                              className="flex items-center justify-between border-b border-zinc-800/60 py-1.5"
                            >
                              <span className={r.nonCash ? 'text-zinc-500' : 'text-zinc-300'}>
                                {r.label}{' '}
                                <span className="text-[10px] uppercase text-zinc-600">
                                  {r.nonCash
                                    ? 'non cassa'
                                    : r.kind === 'attesa'
                                      ? 'attesi'
                                      : 'spesi'}
                                </span>
                              </span>
                              <span
                                className={`font-semibold ${r.nonCash ? 'text-zinc-500' : 'text-red-400'}`}
                              >
                                −{B(r.amount)}
                              </span>
                            </div>
                          ))}
                          <div className="mt-2 flex justify-between rounded-lg bg-zinc-800/60 px-3 py-2">
                            <span>Totale uscite</span>
                            <span className="font-bold text-red-300">−{B(d.totalOut)}</span>
                          </div>
                        </div>
                      </div>
                      <div
                        className={`flex items-baseline justify-between rounded-lg border px-4 py-2.5 ${
                          d.saldo >= 0
                            ? 'border-emerald-900/70 bg-emerald-950/30'
                            : 'border-red-900/70 bg-red-950/30'
                        }`}
                      >
                        <span className="font-bold">
                          Saldo di gestione{' '}
                          <span className="text-xs font-normal text-zinc-500">
                            ({finBasis === 'anno' ? 'annuo' : 'a settimana'}, ammortamenti esclusi)
                          </span>
                        </span>
                        <span
                          className={`text-xl font-bold ${d.saldo >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                        >
                          {d.saldo >= 0 ? '+' : ''}
                          {B(d.saldo)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Le voci "attese" sono la proiezione della stagione (stessa formula del
                        motore economico); "incassati/spesi" è quanto già transitato quest'anno per
                        le voci episodiche (coppe, mercato, eventi). Gli ammortamenti non muovono
                        cassa ma pesano sul cap ingaggi.
                      </p>
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
            </div>
          </section>
        )}

        {selectedPlayer &&
          (() => {
            const d = playerDetail(session, selectedPlayer);
            if (!d) return null;
            return (
              <div
                className="backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                onClick={() => setSelectedPlayer(null)}
                onKeyDown={(e) => e.key === 'Escape' && setSelectedPlayer(null)}
                role="presentation"
              >
                <div
                  className="modal-pop w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5"
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
                    Contratto: {((d.wage * 52) / 1000).toFixed(1)}M/anno
                    {d.contractEnd ? ` fino al ${d.contractEnd}` : ''}
                  </p>
                  {d.heat && (
                    <div className="mb-3">
                      <HeatCard view={d.heat} />
                    </div>
                  )}
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
