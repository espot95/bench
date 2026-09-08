/**
 * Sede → Eventi (MODULE_EVENTS): l'estate (ritiro + tour mondiale, bloccati alla 1ª
 * giornata) e le proposte concerti con pubblicità per il pienone. Guscio puro: tutta
 * la logica vive in game.ts / engine/events.ts.
 */

import { useState } from 'react';
import {
  type GameSession,
  acceptConcert,
  chooseRitiro,
  chooseTour,
  concertView,
  declineConcert,
  summerView,
} from './game';

const M = (n: number) => `${(n / 1e6).toFixed(1)}M`;

export function EventsPane({ session, accent }: { session: GameSession; accent: string }) {
  const [, setTick] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const act = (fn: () => string) => {
    setMsg(fn());
    setTick((t) => t + 1);
  };
  const summer = summerView(session);
  const concerts = concertView(session);

  return (
    <div className="space-y-4 text-sm">
      {msg && (
        <div className="note-in rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-emerald-200">
          {msg}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {/* Ritiro estivo (§1): la città conta */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
          <div className="text-xs uppercase tracking-widest text-zinc-500">Ritiro estivo</div>
          {summer.ritiroId ? (
            <p className="mt-2 text-emerald-300">
              Fatto: {summer.ritiri.find((r) => r.id === summer.ritiroId)?.name}. La preparazione
              lavora nelle prime giornate.
            </p>
          ) : summer.locked ? (
            <p className="mt-2 text-zinc-500">
              Stagione in corso: se ne riparla l’estate prossima. (Niente ritiro = partenza diesel.)
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {summer.ritiri.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-zinc-600 px-2 py-0.5 text-xs font-bold hover:bg-zinc-800"
                    style={{ color: accent }}
                    onClick={() => act(() => chooseRitiro(session, r.id))}
                  >
                    Prenota {M(r.cost)}
                  </button>
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-xs text-zinc-500">
                    strutture {r.quality}/100 · {r.blurb}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tour estivo (§2): in tutto il mondo */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
          <div className="text-xs uppercase tracking-widest text-zinc-500">Tour estivo</div>
          {summer.tourId ? (
            <p className="mt-2 text-emerald-300">
              Fatto: {summer.tours.find((t) => t.id === summer.tourId)?.name}. Il mercato se ne
              ricorderà al conguaglio.
            </p>
          ) : summer.locked ? (
            <p className="mt-2 text-zinc-500">Le valigie si fanno in estate.</p>
          ) : (
            <div className="mt-2 max-h-72 space-y-1.5 overflow-auto pr-1">
              {summer.tours.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-zinc-600 px-2 py-0.5 text-xs font-bold hover:bg-zinc-800"
                    style={{ color: accent }}
                    onClick={() => act(() => chooseTour(session, t.id))}
                  >
                    Parti
                  </button>
                  <span className="font-semibold">{t.name}</span>
                  <span
                    className={`text-xs ${t.estimate >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    ~{M(t.estimate)}
                  </span>
                  {t.affinity && <span className="text-xs text-amber-300">★ mercato caldo</span>}
                  {t.distance === 'lontano' && (
                    <span className="text-xs text-zinc-500">✈ gambe pesanti al rientro</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Concerti (§3): cachet, pienone a pagamento, usura del campo */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-4">
        <div className="text-xs uppercase tracking-widest text-zinc-500">Concerti allo stadio</div>
        {!concerts.licensed && (
          <p className="mt-2 text-zinc-500">
            Serve la licenza concerti (Stadio → attività commerciali, 2 settori coperti).
          </p>
        )}
        {concerts.licensed && concerts.offers.length === 0 && (
          <p className="mt-2 text-zinc-500">
            Nessuna data sul tavolo: i promoter bussano durante la stagione.
          </p>
        )}
        {concerts.offers.map((o) => (
          <div key={o.id} className="mt-3 rounded border border-zinc-800 p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-bold">
                {o.artist} <span className="text-xs font-normal text-zinc-500">({o.tier})</span>
              </span>
              <span className="text-zinc-400">
                cachet <b className="text-emerald-300">{M(o.cachet)}</b> · data: prima della g.
                {o.round}
              </span>
            </div>
            {o.homeClash && (
              <div className="mt-1 text-xs text-amber-300">
                ⚠ A ridosso della gara IN CASA: il campo si rovina — chi palleggia (tu compreso) ne
                soffre.
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {o.options.map((opt) => (
                <button
                  key={opt.level}
                  type="button"
                  className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800"
                  onClick={() => act(() => acceptConcert(session, o.id, opt.level))}
                >
                  {opt.level === 0
                    ? 'Senza pubblicità'
                    : opt.level === 1
                      ? 'Pubblicità base'
                      : 'Martellamento'}{' '}
                  · {Math.round(opt.fill * 100)}% pieno ·{' '}
                  <b className={opt.net >= 0 ? 'text-emerald-300' : 'text-red-300'}>{M(opt.net)}</b>
                </button>
              ))}
              <button
                type="button"
                className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                onClick={() => act(() => declineConcert(session, o.id))}
              >
                Rifiuta
              </button>
            </div>
          </div>
        ))}
        <p className="mt-3 text-xs text-zinc-500">
          La pubblicità compra riempimento: rende con lo stadio grande e la piazza tiepida, è denaro
          buttato a stadio già pieno.
        </p>
      </div>
    </div>
  );
}
