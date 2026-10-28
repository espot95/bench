/**
 * Lo STADIO: vista 3D giorno/notte, manto erboso e irrigazione. Estratto da App.tsx.
 */

import type { CommercialId } from '../../../src/core/types';
import { Help } from '../Help';
import { Ic } from '../Ic';
import { Stadium3D } from '../Stadium3D';
import { StadiumBuilder } from '../StadiumBuilder';
import { BackBar } from '../bits';
import { type GameSession, chooseGrass, chooseWatering, grassView, stadiumView } from '../game';
import type { ClubIdentity } from '../identity';

const CARD = 'anim-in rounded-xl border border-zinc-800 bg-zinc-900 p-4';

export function StadiumScreen({
  session,
  id,
  dayMode,
  setDayMode,
  onBack,
  refresh,
  setBuildMsg,
  onStartPlacing,
}: {
  session: GameSession;
  id: ClubIdentity;
  dayMode: boolean;
  setDayMode: (v: boolean) => void;
  onBack: () => void;
  refresh: () => void;
  setBuildMsg: (m: string | null) => void;
  onStartPlacing: (pid: CommercialId, name: string) => void;
}) {
  const accent = id.accent;

  const sv = stadiumView(session);
  return (
    <section className={CARD}>
      <BackBar
        title={`${sv.namingName ?? 'Stadio'} — ${sv.capacity.toLocaleString('it-IT')} posti`}
        onBack={onBack}
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
          <p className="text-xs text-zinc-500">trascina per ruotare · rotella per lo zoom</p>
          <div className="flex gap-1">
            {(
              [
                [false, 'dark_mode', 'Notte'],
                [true, 'light_mode', 'Giorno'],
              ] as const
            ).map(([day, icon, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setDayMode(day)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  dayMode === day ? 'bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-800/60'
                }`}
                style={dayMode === day ? { borderColor: accent, color: accent } : undefined}
              >
                <Ic name={icon} fill={dayMode === day} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Manto erboso (richiesta utente): si sceglie solo prima della 1ª giornata */}
      {(() => {
        const gv = grassView(session);
        return (
          <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-center text-sm font-bold">
              Manto erboso
              <Help
                text={`L'altezza dell'erba di CASA tocca entrambe le squadre che giocano qui, ciascuna per il suo stile: 🌱 bassa fa correre il pallone (esalta il palla a terra, il catenaccio morde meno), 🌾 alta lo frena (palleggio penalizzato, catenaccio esaltato). Si sceglie SOLO prima della 1ª giornata e vale tutta la stagione. L'erba bassa costa ${(gv.upkeep / 1000).toFixed(0)}k di tagli continui.`}
              />
              {gv.locked && (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  <Ic name="lock" fill /> si ritocca la prossima estate
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ['bassa', 'grass', 'Bassa — il pallone corre'],
                  ['media', 'balance', 'Media — campo neutro'],
                  ['alta', 'forest', 'Alta — il pallone frena'],
                ] as const
              ).map(([len, icon, label]) => (
                <button
                  key={len}
                  type="button"
                  disabled={gv.locked}
                  onClick={() => {
                    setBuildMsg(chooseGrass(session, len));
                    refresh();
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                    gv.length === len ? 'bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-800/60'
                  }`}
                  style={gv.length === len ? { borderColor: accent, color: accent } : undefined}
                >
                  <Ic name={icon} fill={gv.length === len} /> {label}
                  {len === 'bassa' ? ` (${(gv.upkeep / 1000).toFixed(0)}k)` : ''}
                </button>
              ))}
            </div>
            {/* Irrigazione (richiesta utente): si cambia tra una giornata e l'altra */}
            <div className="mt-3 flex items-center border-t border-zinc-800 pt-3 text-sm font-bold">
              Irrigazione
              <Help
                text={`L'acqua prima del fischio: 💧 campo bagnato = palla rapida (bonus a chi palleggia, catenaccio spuntato) con ${(gv.wetCost / 1000).toFixed(0)}k di bolletta per OGNI gara in casa; ☀ asciutto = palla che frena (palleggio penalizzato, catenaccio esaltato), gratis. Si cambia quando vuoi tra una giornata e l'altra, e si SOMMA all'effetto dell'erba: bassa+bagnato = biliardo, alta+asciutto = pantano.`}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ['bagnato', 'water_drop', 'Bagnato — palla rapida'],
                  ['normale', 'balance', 'Normale — campo neutro'],
                  ['asciutto', 'sunny', 'Asciutto — palla che frena'],
                ] as const
              ).map(([lvl, icon, label]) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    setBuildMsg(chooseWatering(session, lvl));
                    refresh();
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    gv.watering === lvl ? 'bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-800/60'
                  }`}
                  style={gv.watering === lvl ? { borderColor: accent, color: accent } : undefined}
                >
                  <Ic name={icon} fill={gv.watering === lvl} /> {label}
                  {lvl === 'bagnato' ? ` (${(gv.wetCost / 1000).toFixed(0)}k/gara)` : ''}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      <StadiumBuilder
        session={session}
        accent={accent}
        onChanged={refresh}
        onPlaceRequest={(pid, name) => onStartPlacing(pid as CommercialId, name)}
      />
    </section>
  );
}
