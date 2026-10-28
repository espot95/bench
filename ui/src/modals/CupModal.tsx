/** Tabellone delle coppe nazionali (MODULE_CUPS). Estratto da App.tsx. */

import { useEscape } from '../bits';
import { type GameSession, cupView } from '../game';

export function CupModal({ session, onClose }: { session: GameSession; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div
      className="backdrop-fade fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
      onClick={() => onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
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
              <span className="text-xs font-normal uppercase text-zinc-500">{cup.status}</span>
            </h3>
            {cup.winner && <div className="mb-2 text-amber-300">Vincitrice: {cup.winner}</div>}
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
  );
}
