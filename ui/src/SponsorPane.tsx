/**
 * Sede → Sponsor (MODULE_SPONSORS): i 4 slot con brand/valore/aspettative/clausole e
 * soddisfazione, e il mercato delle offerte quando uno slot è scoperto. Guscio puro.
 */

import { useState } from 'react';
import type { SponsorSlot } from '../../src/core/types';
import { type GameSession, chooseSponsor, foreignMarketsView, sponsorsView } from './game';

const M = (v: number) => `${(v / 1e6).toFixed(1)}M`;
const SLOT_LABEL: Record<string, string> = {
  maglia: 'Sponsor di maglia',
  tecnico: 'Sponsor tecnico',
  stadio: 'Sponsor dello stadio',
  allenamento: 'Maglie d’allenamento',
};
const TIER_LABEL: Record<string, string> = {
  micro: 'micro',
  piccola: 'piccola',
  media: 'media',
  grande: 'grande',
  multinazionale: 'multinazionale',
};

export function SponsorPane({ session, accent }: { session: GameSession; accent: string }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = sponsorsView(session);
  const markets = foreignMarketsView(session);

  const satFace = (v: number) => (v >= 0.7 ? '😊' : v >= 0.35 ? '😐' : '😠');

  return (
    <div className="space-y-3 text-sm">
      {msg && (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-emerald-200">
          {msg}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.slot} className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500">
              {SLOT_LABEL[r.slot]}
            </div>
            {r.contract ? (
              <>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-bold">{r.contract.name}</span>
                  <span
                    className="text-xl"
                    title={`soddisfazione ${Math.round(r.contract.satisfaction * 100)}%`}
                  >
                    {satFace(r.contract.satisfaction)}
                  </span>
                </div>
                <div className="mt-1 text-zinc-400">
                  {r.contract.annual > 0 ? (
                    <>
                      <b className="text-emerald-300">{M(r.contract.annual)}</b>/anno · fino al{' '}
                      {r.contract.endYear}
                    </>
                  ) : (
                    <>a titolo gratuito · fino al {r.contract.endYear}</>
                  )}
                </div>
                {r.contract.expectation < 99 && (
                  <div className="mt-1 text-xs text-zinc-500">
                    si aspetta: almeno {r.contract.expectation}° posto
                  </div>
                )}
                {r.contract.clause && (
                  <div className="mt-1 text-xs text-amber-300/90">📜 {r.contract.clause}</div>
                )}
              </>
            ) : (
              <>
                <div className="mt-1 text-lg font-bold text-red-300">Slot scoperto</div>
                <div className="text-xs text-zinc-500">
                  zero incassi da questo slot finché non firmi
                </div>
                {r.offers.length === 0 && (
                  <div className="mt-2 text-xs text-zinc-500">
                    Le offerte arrivano a fine stagione.
                  </div>
                )}
                {r.offers.map((o) => (
                  <div
                    key={o.index}
                    className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold">
                        {o.name}
                        {o.rinnovo && (
                          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-zinc-400">
                            rinnovo
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {o.sector} · {TIER_LABEL[o.tier]}
                      </span>
                    </div>
                    <div className="mt-1 text-zinc-300">
                      {o.annual > 0 ? (
                        <>
                          <b className="text-emerald-300">{M(o.annual)}</b>/anno · {o.years} anni
                        </>
                      ) : (
                        <>a titolo gratuito · {o.years} anni</>
                      )}
                      {o.expectation < 99 && (
                        <span className="text-xs text-zinc-500"> · chiede ≥{o.expectation}°</span>
                      )}
                    </div>
                    {o.clause && (
                      <div className="mt-1 text-xs text-amber-300/90">📜 {o.clause}</div>
                    )}
                    <button
                      type="button"
                      className="mt-2 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-950"
                      style={{ background: accent }}
                      onClick={() => {
                        setMsg(chooseSponsor(session, r.slot as SponsorSlot, o.index));
                        refresh();
                      }}
                    >
                      Firma
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
      {markets.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
          <div className="text-xs uppercase tracking-widest text-zinc-500">
            I tuoi mercati esteri
          </div>
          <div className="mt-2 space-y-1">
            {markets.map((m) => (
              <div key={m.nation} className="flex items-center gap-3 text-sm">
                <span className="w-12 font-bold">{m.nation}</span>
                <span className="flex-1 text-zinc-300">
                  {m.fans >= 1_000_000
                    ? `${(m.fans / 1_000_000).toFixed(1)}M tifosi`
                    : `${Math.round(m.fans / 1000)}k tifosi`}
                </span>
                <span className={m.covered ? 'text-emerald-300' : 'text-red-300'}>
                  {m.covered
                    ? '▲ in crescita (giocatore in rosa)'
                    : '▼ senza un giocatore, si spegne'}
                </span>
                {m.streak >= 3 && (
                  <span className="text-sky-300" title="le tue partite si vendono lì">
                    📺 stirpe: {m.streak} stagioni
                  </span>
                )}
                {m.rivals > 0 && (
                  <span
                    className="text-zinc-500"
                    title="altri club schierano giocatori di questa nazione"
                  >
                    ⚔ {m.rivals} rivali
                  </span>
                )}
                {m.invested && <span className="text-amber-300">💼 sponsor investe</span>}
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            Il mercato si conquista: serve fama (il piccolo resta invisibile per anni), costanza e
            meno rivali possibile. Dalla 3ª stagione di fila la stirpe vende anche i diritti TV
            locali; in 5-15 anni diventa una rendita di merchandising.
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Le aziende guardano i risultati: l’aspettativa mancata raffredda il rapporto e a scadenza
        possono non rinnovare. Le clausole si verificano davvero a fine stagione.
      </p>
    </div>
  );
}
