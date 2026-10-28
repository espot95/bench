/**
 * La SCHEDA GIOCATORE: fascia parlata, stagione, carriera, heatmap, radar,
 * movimenti e attributi a barre. Estratto da App.tsx.
 */

import { HeatCard } from '../Heatmap';
import { Ic } from '../Ic';
import { Radar } from '../Radar';
import { useEscape } from '../bits';
import { type GameSession, playerDetail } from '../game';

export function PlayerCard({
  session,
  name,
  accent,
  onClose,
}: {
  session: GameSession;
  name: string;
  accent: string;
  onClose: () => void;
}) {
  useEscape(onClose);

  const d = playerDetail(session, name);
  if (!d) return null;
  return (
    <div
      className="backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        className="modal-pop w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-bold">{d.name}</h3>
          {/* G2: via il numero — la fascia parlata, come in un report vero */}
          <span className="shrink-0 rounded-full border border-emerald-700/60 bg-emerald-950/40 px-3 py-0.5 text-sm font-bold text-emerald-300">
            {d.band}
          </span>
        </div>
        <p className="mb-3 text-sm text-zinc-400">
          {d.pos} · {d.age} anni · {d.nationality} · piede {d.foot} · {d.label} · {d.morale}
          {d.injury ? ` · 🚑 ${d.injury}` : ''}
          {d.adapting ? ` · ambientamento: ${d.adapting} giornate` : ''}
        </p>
        <p className="mb-3 text-sm text-zinc-400">
          Contratto: {((d.wage * 52) / 1000).toFixed(1)}M/anno
          {d.contractEnd ? ` fino al ${d.contractEnd}` : ''} · quotazione ~
          {(d.value / 1e6).toFixed(1)}M
          {d.formPct !== 0 && (
            <span
              className={d.formPct > 0 ? 'text-emerald-400' : 'text-red-400'}
              title="il rendimento (media pagelle per tutti, gol/assist o clean sheet per ruolo, pesato sul campionato) muove la quotazione"
            >
              {' '}
              ({d.formPct > 0 ? '+' : ''}
              {d.formPct}% forma)
            </span>
          )}
        </p>
        {d.heat && (
          <div className="mb-3">
            <HeatCard view={d.heat} />
          </div>
        )}
        {/* G1: la stagione VERA — pagella media e numeri da report (per ruolo) */}
        {d.stats && d.stats.apps > 0 && (
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                la stagione
              </span>
              <span
                className="font-bold"
                style={{
                  color:
                    d.stats.rating >= 6.5 ? '#34d399' : d.stats.rating >= 6 ? '#e4e4e7' : '#f87171',
                }}
                title="media pagella (4-10, 6 = sufficienza)"
              >
                media {d.stats.rating.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-zinc-300">
              <span>
                {d.stats.apps} pres · {d.stats.minutes}'
              </span>
              {d.pos === 'GK' ? (
                <>
                  <span>{d.stats.cleanSheets} clean sheet</span>
                  <span>parate {(d.stats.savePct * 100).toFixed(0)}%</span>
                  <span title="gol evitati rispetto all'xG affrontato">
                    xG evitati {d.stats.psxgDiff >= 0 ? '+' : ''}
                    {d.stats.psxgDiff.toFixed(1)}
                  </span>
                  <span>{d.stats.concededOn} subiti</span>
                </>
              ) : d.pos === 'DF' ? (
                <>
                  <span>{d.stats.cleanSheets} clean sheet</span>
                  <span>contrasti {(d.stats.tackleWinPct * 100).toFixed(0)}%</span>
                  <span>aerei {(d.stats.aerialWinPct * 100).toFixed(0)}%</span>
                  <span>
                    {d.stats.goals} gol · {d.stats.assists} assist
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {d.stats.goals} gol · {d.stats.assists} assist
                  </span>
                  <span>
                    xG {d.stats.xg.toFixed(1)} · xA {d.stats.xa.toFixed(1)}
                  </span>
                  <span>tiri/90 {d.stats.shots90.toFixed(1)}</span>
                  <span>
                    pass. {(d.stats.passAcc * 100).toFixed(0)}% · KP/90{' '}
                    {d.stats.keyPasses90.toFixed(1)}
                  </span>
                </>
              )}
              <span>{d.stats.km.toFixed(1)} km/gara</span>
              <span>
                🟨 {d.stats.yellow} · 🟥 {d.stats.red}
              </span>
            </div>
          </div>
        )}
        {/* G4: lo STORICO di carriera — una riga per stagione chiusa */}
        {d.career.length > 0 && (
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5">
            <div className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
              carriera
            </div>
            <table className="w-full text-xs text-zinc-300">
              <thead>
                <tr className="text-left text-[10px] uppercase text-zinc-500">
                  <th className="font-normal">stagione</th>
                  <th className="font-normal">club</th>
                  <th className="text-right font-normal">pres</th>
                  <th className="text-right font-normal">gol</th>
                  <th className="text-right font-normal">assist</th>
                  <th className="text-right font-normal">media</th>
                </tr>
              </thead>
              <tbody>
                {d.career.slice(0, 6).map((c) => (
                  <tr key={c.year}>
                    <td>
                      {c.year}/{String(c.year + 1).slice(2)}
                    </td>
                    <td className="max-w-[9rem] truncate">{c.clubName}</td>
                    <td className="text-right">{c.apps}</td>
                    <td className="text-right">{c.goals}</td>
                    <td className="text-right">{c.assists}</td>
                    <td
                      className="text-right font-bold"
                      style={{
                        color: c.media >= 6.5 ? '#34d399' : c.media >= 6 ? '#e4e4e7' : '#f87171',
                      }}
                    >
                      {c.media.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* G2: i movimenti senza palla — il linguaggio del report */}
        {d.movements.length > 0 && (
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5 text-sm">
            <div className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
              come si muove
            </div>
            {/* Tipo di corsa (richiesta utente): le leve decidono come si corre */}
            <div className="mb-1 text-zinc-200">
              <Ic name="sprint" /> <b>{d.running.label}</b>
              <span className="text-zinc-400"> — {d.running.desc}</span>
            </div>
            <ul className="space-y-0.5 text-zinc-300">
              {d.movements.map((mv) => (
                <li key={mv}>· {mv}</li>
              ))}
            </ul>
          </div>
        )}
        {/* G2: radar dei percentili di ruolo (statistiche vere di stagione) */}
        {d.percentiles && 'ready' in d.percentiles && d.percentiles.ready && (
          <div className="mb-3 flex justify-center rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
            <div>
              <div className="text-center text-xs font-bold uppercase tracking-widest text-zinc-500">
                percentili vs pari ruolo ({d.percentiles.peers} in lega)
              </div>
              <Radar metrics={d.percentiles.metrics} color={accent} />
            </div>
          </div>
        )}
        {/* G2: gli attributi diventano BARRE — niente più numeri */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm">
          {d.attrs.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 py-0.5">
              <span className="w-24 truncate text-xs text-zinc-400">{k}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max(3, Math.min(100, v))}%`,
                    background: v >= 75 ? '#34d399' : v >= 55 ? '#a1a1aa' : '#52525b',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
          onClick={() => onClose()}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}
