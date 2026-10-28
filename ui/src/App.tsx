import { useEffect, useState } from 'react';
import { AcademyPane } from './AcademyPane';
import { CalendarScreen } from './CalendarScreen';
import { CityHub } from './CityHub';
import { ClubShowcase } from './ClubShowcase';
import { CommercialMap } from './CommercialMap';
import { ContractsPane } from './ContractsPane';
import { Crest } from './Crest';
import { EventsPane } from './EventsPane';
import { FormationPitch } from './FormationPitch';
import { HeatCard } from './Heatmap';
import { Help } from './Help';
import { Ic } from './Ic';
import { LiveMatch } from './LiveMatch';
import { MainMenu } from './MainMenu';
import { MarketMap } from './MarketMap';
import { MarketingPane } from './MarketingPane';
import { MatchPlan } from './MatchPlan';
import { OffseasonScreen } from './OffseasonScreen';
import { Radar } from './Radar';
import { SponsorPane } from './SponsorPane';
import { Stadium3D } from './Stadium3D';
import { StadiumBuilder } from './StadiumBuilder';
import { Structure3D } from './Structure3D';
import { BackBar, Chip } from './bits';
import { fmtDay } from './calendar';
import { DualLines, HBars, NEG, POS, SeasonNetBars } from './charts';
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
  chooseGrass,
  chooseWatering,
  cityStructures,
  clubInfo,
  counterOffer,
  cupView,
  currentDay,
  dashboard,
  expiringContracts,
  fanProposal,
  fanZonesView,
  financeDashboard,
  financeDetail,
  financeTrends,
  grassView,
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
  startLiveMatch,
  structureDetail,
  treasuryView,
  worldTables,
} from './game';
import { clubIdentity, presidentType } from './identity';
import { CupModal } from './modals/CupModal';
import { LeagueTableModal } from './modals/LeagueTableModal';
import { PlayerCard } from './modals/PlayerCard';
import { SaveDialog } from './saves/SaveDialog';
import { SavesScreen } from './saves/SavesScreen';
import { localStore } from './saves/local';
import { sessionToSave } from './saves/session';
import { AUTOSAVE_ID } from './saves/store';
import { FinanceTab } from './screens/FinanceTab';
import { StadiumScreen } from './screens/StadiumScreen';

type Screen =
  | 'map'
  | 'stadio'
  | 'campo'
  | 'staff'
  | 'mercato'
  | 'ufficio'
  | 'marketing'
  | 'giovanile'
  | 'diretta'
  | 'calendario';

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
      } catch {
        // Niente autosave su errore: meglio l'ultimo save buono di un mondo a metà.
        setLastResult('Chiusura stagione non riuscita: riprova o ricarica il salvataggio.');
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
  /** G4: quale divisione guardare nel pannello classifiche (null = la tua). */
  const [tableTab, setTableTab] = useState<number | null>(null);
  const [showCup, setShowCup] = useState(false);
  /** Dashboard Finanze (richiesta utente): importi su base annua o settimanale. */
  const [finBasis, setFinBasis] = useState<'anno' | 'settimana'>('anno');
  /** Previsione a 3 o 5 stagioni (impero v2). */
  const [fcYears, setFcYears] = useState<3 | 5>(5);
  /** "Cerca giocatori {nazione}" dall'Ufficio Commerciale: filtro pronto al mercato. */
  const [scoutNation, setScoutNation] = useState<string | null>(null);
  const [dayMode, setDayMode] = useState(false);
  /** Campo d'allenamento: formazione con le pedine o tabella rosa. */
  const [campoTab, setCampoTab] = useState<'formazione' | 'piano' | 'rosa'>('formazione');
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  /** Piazzamento di una struttura in città: si sceglie il punto sulla mappa. */
  const [placing, setPlacing] = useState<{ id: CommercialId; name: string } | null>(null);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ id: string; name: string; building: boolean } | null>(
    null,
  );
  // Cambio di carriera (load/new): lo stato locale della UI si azzera — prima
  // restavano scheda giocatore, piazzamenti e modali della carriera precedente.
  // biome-ignore lint/correctness/useExhaustiveDependencies: i setter sono stabili; il reset va fatto SOLO quando cambia la sessione.
  useEffect(() => {
    setScreen('map');
    setSelectedPlayer(null);
    setStaffMsg(null);
    setBuildMsg(null);
    setPlacing(null);
    setInspect(null);
    setShowTable(false);
    setShowCup(false);
    setTableTab(null);
    setSedeTab('consiglio');
    setCampoTab('formazione');
    setScoutNation(null);
  }, [session]);
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
    return (
      <MarketMap
        session={session}
        id={id}
        initialNationality={scoutNation ?? undefined}
        onBack={() => {
          setScoutNation(null);
          setScreen('map');
        }}
      />
    );
  }

  // Ufficio Commerciale (impero): il planisfero dell'influenza a tutto schermo.
  if (screen === 'ufficio') {
    return (
      <CommercialMap
        session={session}
        id={id}
        onBack={() => setScreen('map')}
        onScout={(nation) => {
          setScoutNation(nation);
          setScreen('mercato');
        }}
      />
    );
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

        {/* classifiche VIVE (G4): tutte le divisioni, dal chip Posizione */}
        {showTable && (
          <LeagueTableModal
            session={session}
            accent={id.accent}
            tab={tableTab}
            onTab={setTableTab}
            onClose={() => {
              setShowTable(false);
              setTableTab(null);
            }}
          />
        )}

        {/* tabellone coppe (MODULE_CUPS): dal chip Coppa */}
        {showCup && <CupModal session={session} onClose={() => setShowCup(false)} />}

        {/* prossima partita + gioca, senza entrare nello stadio — DOCK: mai più largo
            del viewport, va a capo sugli schermi stretti, sempre sopra il ticker */}
        <div className="pointer-events-none absolute inset-x-0 bottom-9 z-[1010] flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-zinc-800/70 bg-zinc-950/85 px-5 py-2.5 shadow-xl backdrop-blur">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest text-zinc-500">
                {dash.finished ? 'stagione' : `giornata ${dash.round}/${dash.total}`}
              </div>
              <div className="max-w-[18rem] truncate font-semibold" title={dash.nextMatch ?? ''}>
                {dash.finished ? 'conclusa' : dash.nextMatch}
              </div>
            </div>
            {!dash.finished && (
              <>
                <button
                  type="button"
                  className="rounded-xl px-5 py-2 font-bold text-zinc-950 transition-transform hover:scale-105"
                  style={{ background: id.accent }}
                  title="vivi la partita: telecronaca, momentum, cambi che contano"
                  onClick={() => {
                    if (startLiveMatch(session)) setScreen('diretta');
                    else {
                      const r = playRound(session);
                      setLastResult(r.scoreline);
                      autosave(session, `g.${r.round}`);
                    }
                  }}
                >
                  <Ic name="stadium" fill /> Vai allo stadio
                </button>
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 font-semibold transition-transform hover:scale-105"
                  style={{ borderColor: `${id.accent}88`, color: id.accent }}
                  title="risultato immediato, senza guardare"
                  onClick={() => {
                    const r = playRound(session);
                    setLastResult(r.scoreline);
                    autosave(session, `g.${r.round}`);
                  }}
                >
                  <Ic name="play_arrow" fill /> Rapido
                </button>
              </>
            )}
            {dash.finished && (
              <button
                type="button"
                disabled={closing}
                className="rounded-xl px-5 py-2 font-bold text-zinc-950 transition-transform hover:scale-105 disabled:opacity-60"
                style={{ background: id.accent }}
                onClick={() => closeSeasonNow(session)}
                title="l'off-season: conti, mercato dei rinnovi, giovani, verdetti (le altre divisioni hanno già giocato con te)"
              >
                {closing ? (
                  <>
                    <Ic name="hourglass_top" /> L'off-season lavora…
                  </>
                ) : (
                  <>
                    <Ic name="skip_next" fill /> Chiudi la stagione
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              className="rounded-xl border px-4 py-2 font-semibold transition-transform hover:scale-105"
              style={{ borderColor: `${id.accent}88`, color: id.accent }}
              onClick={() => setScreen('mercato')}
              title="vola per l'Europa a trattare coi club"
            >
              <Ic name="work" /> Mercato
            </button>
            <button
              type="button"
              className="rounded-xl border border-zinc-700 px-3 py-2 font-semibold text-zinc-300 transition-transform hover:scale-105 hover:border-zinc-400"
              onClick={() => setScreen('calendario')}
              title="agenda: impegni, scadenze e salto nel tempo"
            >
              <Ic name="calendar_month" /> {fmtDay(session.year, currentDay(session))}
            </button>
            <button
              type="button"
              className="rounded-xl border border-zinc-700 px-3 py-2 font-semibold text-zinc-300 transition-transform hover:scale-105 hover:border-zinc-400"
              onClick={() => setSaveOpen(true)}
              title="salva, esporta o torna al menu"
            >
              <Ic name="save" />
            </button>
            {lastResult && (
              <div className="max-w-[16rem] truncate text-sm" title={lastResult}>
                <span className="text-zinc-500">ultimo </span>
                <span className="font-bold">{lastResult}</span>
              </div>
            )}
            {savedNote && <div className="note-in text-[11px] text-zinc-500">{savedNote}</div>}
          </div>
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

        {screen === 'calendario' && (
          <CalendarScreen session={session} accent={id.accent} onBack={() => setScreen('map')} />
        )}

        {screen === 'stadio' && (
          <StadiumScreen
            session={session}
            id={id}
            dayMode={dayMode}
            setDayMode={setDayMode}
            onBack={() => setScreen('map')}
            refresh={refresh}
            setBuildMsg={setBuildMsg}
            onStartPlacing={(pid, pname) => {
              setPlacing({ id: pid, name: pname });
              setScreen('map');
            }}
          />
        )}

        {screen === 'diretta' && (
          <section className={card}>
            <LiveMatch
              session={session}
              accent={id.accent}
              onAbort={() => setScreen('map')}
              onFinished={(r) => {
                setLastResult(r.scoreline);
                autosave(session, `g.${r.round}`);
                setScreen('map');
              }}
            />
          </section>
        )}

        {/* Settore giovanile (F4b): accademia, Primavera, promozioni */}
        {screen === 'giovanile' && (
          <section className={card}>
            <BackBar
              title="Settore giovanile — il vivaio del club"
              onBack={() => setScreen('map')}
            />
            <AcademyPane session={session} accent={id.accent} />
          </section>
        )}

        {/* Ufficio Marketing (MODULE_STADIUM §3.4): biglietti, abbonamenti, campagne */}
        {screen === 'marketing' && (
          <section className={card}>
            <BackBar
              title="Ufficio Marketing — biglietti, abbonamenti e campagne"
              onBack={() => setScreen('map')}
            />
            <MarketingPane session={session} accent={id.accent} />
          </section>
        )}

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
              {sedeTab === 'eventi' && <EventsPane session={session} id={id} />}

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
                          <div className="text-xs text-zinc-500">Monte ingaggi / anno</div>
                          <div className="text-lg font-bold">
                            {((v.weeklyBill * 52) / 1e6).toFixed(1)}M
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

              {sedeTab === 'finanze' && (
                <FinanceTab
                  session={session}
                  accent={id.accent}
                  finBasis={finBasis}
                  setFinBasis={setFinBasis}
                  fcYears={fcYears}
                  setFcYears={setFcYears}
                />
              )}

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
                        onClick={() => {
                          setStaffMsg(hirePreparatore(session));
                          refresh(); // la lista staff e la cassa si aggiornano subito
                        }}
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

        {selectedPlayer && (
          <PlayerCard
            session={session}
            name={selectedPlayer}
            accent={id.accent}
            onClose={() => setSelectedPlayer(null)}
          />
        )}

        {screen === 'campo' && (
          <section className={card}>
            <BackBar title="Campo d'allenamento" onBack={() => setScreen('map')} />
            {/* Formazione (richiesta utente): il campo con le pedine + la rosa */}
            <div className="mb-4 flex gap-2">
              {(
                [
                  ['formazione', 'sports_soccer', 'Formazione'],
                  ['piano', 'strategy', 'Piano partita'],
                  ['rosa', 'groups', 'Rosa'],
                ] as const
              ).map(([tab, icon, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCampoTab(tab)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    campoTab === tab ? 'bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-800/60'
                  }`}
                  style={
                    campoTab === tab ? { borderColor: id.accent, color: id.accent } : undefined
                  }
                >
                  <Ic name={icon} fill={campoTab === tab} /> {label}
                </button>
              ))}
            </div>
            {campoTab === 'formazione' && (
              <div key="formazione" className="anim-in">
                <FormationPitch session={session} accent={id.accent} />
              </div>
            )}
            {campoTab === 'piano' && (
              <div key="piano" className="anim-in">
                <MatchPlan session={session} accent={id.accent} />
              </div>
            )}
            {campoTab === 'rosa' && (
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
                      <td className="font-bold text-amber-300" title={p.band}>
                        {p.stars}
                      </td>
                      <td className="text-zinc-400">{p.morale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
