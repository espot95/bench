/**
 * Pannello building dello stadio (MODULE_STADIUM §2-3): settori reali con
 * espansioni/anelli/coperture, terreno, attività commerciali. Guscio puro:
 * ogni azione chiama l'engine via game.ts e mostra l'esito.
 */

import { useState } from 'react';
import {
  type GameSession,
  type PriceLevel,
  type ProjectRequest,
  buildStadiumProject,
  changeActivityPrice,
  changeTicketPrice,
  renameSectorAction,
  stadiumQuote,
  stadiumView,
} from './game';

const M = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : `${Math.round(n / 1000)}k`;

export function StadiumBuilder({
  session,
  accent,
  onChanged,
  onPlaceRequest,
}: {
  session: GameSession;
  accent: string;
  onChanged: () => void;
  /** Struttura in città: chiede all'hub di entrare in modalità piazzamento. */
  onPlaceRequest: (id: string, name: string) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const v = stadiumView(session);

  const run = (req: ProjectRequest) => {
    setMsg(buildStadiumProject(session, req));
    onChanged();
  };

  const Btn = ({ req, label }: { req: ProjectRequest; label: string }) => {
    const q = stadiumQuote(session, req);
    const blocked = !q.ok;
    return (
      <button
        type="button"
        disabled={blocked}
        title={blocked ? (q.reason ?? '') : `${M(q.cost)} · ${q.matchdays} giornate`}
        onClick={() => run(req)}
        className={`rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors ${
          blocked ? 'cursor-not-allowed border-zinc-800 text-zinc-600' : 'hover:bg-zinc-800'
        }`}
        style={blocked ? undefined : { borderColor: accent, color: accent }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-widest text-zinc-500">
          capienza {v.capacity.toLocaleString('it-IT')} · terreno{' '}
          {v.pitch === 'erba' ? 'in erba' : 'in terra battuta'}
        </span>
        <span className="text-xs text-zinc-400">cassa {M(v.cash)}</span>
      </div>

      {v.project && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2">
          <span className="font-semibold">🏗 Cantiere in corso:</span> {v.project}
        </div>
      )}

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Biglietteria
        </h3>
        <div className="flex gap-2">
          {v.ticket.options.map((o) => (
            <button
              key={o.level}
              type="button"
              onClick={() => {
                setMsg(changeTicketPrice(session, o.level));
                onChanged();
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                v.ticket.current === o.level ? 'bg-zinc-800 font-bold' : 'hover:bg-zinc-800/60'
              }`}
              style={{
                borderColor: v.ticket.current === o.level ? accent : '#3f3f46',
                color: v.ticket.current === o.level ? accent : undefined,
              }}
            >
              <div className="capitalize">{o.level}</div>
              <div className="text-xs text-zinc-400">
                ~{M(o.gate)}/stagione · stadio al {o.fillPct}%
              </div>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">
          il prezzo muove anche il riempimento — e uno stadio pieno fa incassare di più bar e
          ristorante
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">Settori</h3>
        <div className="space-y-2">
          {v.sectors.map((sec) => (
            <div
              key={sec.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2"
            >
              <div>
                <div className="font-semibold">
                  {sec.name}
                  {sec.custom && <span className="ml-1.5 text-xs text-zinc-500">✦</span>}
                  <button
                    type="button"
                    title="rinomina il settore"
                    className="ml-1.5 text-xs text-zinc-500 hover:text-zinc-200"
                    onClick={() => {
                      const name = window.prompt(`Nuovo nome per "${sec.name}":`, sec.name);
                      if (name) {
                        setMsg(renameSectorAction(session, sec.id, name));
                        onChanged();
                      }
                    }}
                  >
                    ✏️
                  </button>
                </div>
                <div className="text-xs text-zinc-500">
                  {sec.seats === 0
                    ? 'non costruito — espandi per crearlo'
                    : `${sec.seats.toLocaleString('it-IT')} posti · ${sec.tiers} ${
                        sec.tiers === 1 ? 'anello' : 'anelli'
                      } · ${sec.covered ? 'coperto' : 'scoperto'}`}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Btn req={{ kind: 'espansione', target: sec.id, seats: 1000 }} label="+1k" />
                <Btn req={{ kind: 'espansione', target: sec.id, seats: 2000 }} label="+2k" />
                <Btn req={{ kind: 'espansione', target: sec.id, seats: 5000 }} label="+5k" />
                {sec.seats > 0 && !sec.covered && (
                  <Btn req={{ kind: 'copertura', target: sec.id }} label="Copri" />
                )}
                {sec.seats > 0 && sec.tiers < 3 && (
                  <Btn req={{ kind: 'anello', target: sec.id }} label="Anello" />
                )}
              </div>
            </div>
          ))}
          {v.pitch === 'terra' && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
              <div>
                <div className="font-semibold">Terreno di gioco</div>
                <div className="text-xs text-zinc-500">da terra battuta a manto erboso</div>
              </div>
              <Btn req={{ kind: 'terreno' }} label="Semina l'erba" />
            </div>
          )}
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">
          passa il mouse su un bottone per costo e durata · un solo cantiere alla volta · serve
          cassa per costo + due mesi di ingaggi
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Strutture in città
        </h3>
        <div className="space-y-2">
          {v.city.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 ${
                c.built || c.ok ? '' : 'opacity-50'
              }`}
            >
              <div>
                <div className="font-semibold">
                  {c.name}
                  {c.built && <span className="ml-2 text-emerald-400">✓ attiva</span>}
                </div>
                <div className="text-xs text-zinc-500">
                  {c.built
                    ? 'la vedi sulla mappa della città'
                    : c.ok
                      ? 'scegli tu il punto sulla mappa della città'
                      : c.reason}
                </div>
              </div>
              {!c.built && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{M(c.cost)}</span>
                  <button
                    type="button"
                    disabled={!c.ok}
                    onClick={() => onPlaceRequest(c.id, c.name)}
                    className={`rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors ${
                      c.ok
                        ? 'hover:bg-zinc-800'
                        : 'cursor-not-allowed border-zinc-800 text-zinc-600'
                    }`}
                    style={c.ok ? { borderColor: accent, color: accent } : undefined}
                  >
                    📍 Sulla mappa
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Attività dello stadio
        </h3>
        <div className="space-y-2">
          {v.commercial.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 ${
                c.built ? '' : c.ok ? '' : 'opacity-50'
              }`}
            >
              <div>
                <div className="font-semibold">
                  {c.name}
                  {c.built && <span className="ml-2 text-emerald-400">✓ attiva</span>}
                </div>
                {!c.built && !c.ok && <div className="text-xs text-zinc-500">{c.reason}</div>}
              </div>
              {!c.built && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{M(c.cost)}</span>
                  <Btn req={{ kind: 'commerciale', commercial: c.id }} label="Costruisci" />
                </div>
              )}
              {c.built && c.id !== 'concerti' && (
                <div className="flex gap-1">
                  {(['popolare', 'standard', 'premium'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      title={`prezzi ${level}`}
                      onClick={() => {
                        setMsg(changeActivityPrice(session, c.id, level as PriceLevel));
                        onChanged();
                      }}
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize transition-colors ${
                        c.price === level ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                      }`}
                      style={{
                        borderColor: c.price === level ? accent : '#3f3f46',
                        color: c.price === level ? accent : '#a1a1aa',
                      }}
                    >
                      {level === 'popolare' ? 'pop' : level === 'standard' ? 'std' : 'prem'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {msg && <p className="text-zinc-300">{msg}</p>}
    </div>
  );
}
