/**
 * Fine stagione (MODULE_UI §6): il verdetto del campo, i verdetti del mondo, i conti,
 * chi se ne va. Un solo bottone in fondo: la stagione nuova.
 */

import type { OffseasonSummary } from '../../src/engine/career';
import type { ClubIdentity } from './identity';

const M = (v: number) => `${v < 0 ? '−' : ''}${(Math.abs(v) / 1e6).toFixed(1)}M`;
const K = (v: number) => `${Math.round(v / 1000)}k`;

export function OffseasonScreen({
  s,
  id,
  onContinue,
}: {
  s: OffseasonSummary;
  id: ClubIdentity;
  onContinue: () => void;
}) {
  const yy = (y: number) => `${y}/${String(y + 1).slice(2)}`;
  const outcome =
    s.outcome === 'promoted'
      ? { label: `⬆ PROMOSSA in ${s.newLeagueName}!`, tone: 'text-emerald-300' }
      : s.outcome === 'relegated'
        ? { label: `⬇ Retrocessa in ${s.newLeagueName}.`, tone: 'text-red-300' }
        : { label: `Resti in ${s.newLeagueName}.`, tone: 'text-zinc-300' };
  const card = 'rounded-xl border border-zinc-800 bg-zinc-900/80 p-4';
  const h = 'text-[11px] uppercase tracking-widest text-zinc-500';

  return (
    <div
      className="min-h-screen overflow-y-auto px-6 py-8 text-zinc-100"
      style={{
        background: `radial-gradient(ellipse at top, ${id.primary}33, #09090b 60%)`,
      }}
    >
      <div className="mx-auto max-w-5xl">
        <div className={h}>stagione {yy(s.year)} conclusa</div>
        <h1 className="mt-1 text-3xl font-black tracking-wide">
          {s.clubName}: {s.finalPosition}° in {s.oldLeagueName}
        </h1>
        <div className={`mt-1 text-lg font-semibold ${outcome.tone}`}>{outcome.label}</div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {/* classifica finale */}
          <div className={`${card} md:row-span-2`}>
            <div className={h}>classifica finale</div>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {s.finalTable.map((r, i) => (
                  <tr
                    key={r.name}
                    className={r.mine ? 'bg-emerald-950/60 font-semibold' : ''}
                    style={
                      i < 3 || i >= s.finalTable.length - 3
                        ? { borderLeft: `2px solid ${i < 3 ? '#4ade80' : '#f87171'}` }
                        : undefined
                    }
                  >
                    <td className="w-7 py-0.5 pr-2 text-right text-zinc-500">{i + 1}</td>
                    <td className="truncate">{r.name}</td>
                    <td className="text-right text-zinc-400">
                      {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                    </td>
                    <td className="w-9 text-right font-bold">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* i conti */}
          <div className={card}>
            <div className={h}>il bilancio della stagione</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-zinc-500">ricavi</div>
                <div className="font-bold text-emerald-300">{M(s.accounts.revenue)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">costi</div>
                <div className="font-bold text-red-300">{M(s.accounts.costs)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">netto</div>
                <div
                  className={`font-bold ${s.accounts.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                >
                  {M(s.accounts.net)}
                </div>
              </div>
            </div>
            {s.bonusPaid > 0 && (
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-zinc-400">di cui bonus contrattuali</span>
                <span className="font-semibold text-amber-300">{M(s.bonusPaid)}</span>
              </div>
            )}
            <div className="mt-3 border-t border-zinc-800 pt-3 text-sm">
              <div className={h}>la nuova stagione</div>
              <div className="mt-1 flex justify-between">
                <span className="text-zinc-400">cassa</span>
                <span className={s.cash < 0 ? 'font-semibold text-red-300' : 'font-semibold'}>
                  {M(s.cash)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">budget mercato</span>
                <span className="font-semibold">{M(s.transferBudget)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">tetto ingaggi / settimana</span>
                <span className="font-semibold">{K(s.wageBudget)}</span>
              </div>
              {s.cash < 0 && (
                <div className="mt-2 text-xs text-amber-300">
                  ⚠ Cassa in rosso: austerità — mercato bloccato, monte ingaggi congelato.
                </div>
              )}
            </div>
          </div>

          {/* la rosa */}
          <div className={card}>
            <div className={h}>chi se ne va</div>
            {s.retiredMine.length === 0 && s.releasedMine.length === 0 ? (
              <div className="mt-2 text-sm text-zinc-400">Nessuno: la rosa resta unita.</div>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {s.retiredMine.map((p) => (
                  <li key={`r-${p.name}`}>
                    <span className="text-zinc-500">{p.position}</span> {p.name}
                    <span className="text-zinc-500"> — si ritira a {p.age} anni</span>
                  </li>
                ))}
                {s.releasedMine.map((p) => (
                  <li key={`s-${p.name}`}>
                    <span className="text-zinc-500">{p.position}</span> {p.name}
                    <span className="text-zinc-500"> — contratto scaduto, svincolato</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 border-t border-zinc-800 pt-2 text-xs text-zinc-500">
              Nel mondo: {s.retiredTotal} ritiri, {s.youthCount} giovani promossi dai vivai.
            </div>
          </div>

          {/* verdetti del mondo */}
          <div className={`${card} md:col-span-2`}>
            <div className={h}>i verdetti</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {s.verdicts.map((v) => (
                <div key={v.league} className="text-sm">
                  <div className="font-semibold">{v.league}</div>
                  <div>
                    <span className="text-zinc-500">🏆 </span>
                    {v.champion}
                  </div>
                  {v.promoted.length > 0 && (
                    <div className="text-emerald-300">⬆ {v.promoted.join(', ')}</div>
                  )}
                  {v.relegated.length > 0 && (
                    <div className="text-red-300">⬇ {v.relegated.join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-xl px-6 py-3 text-lg font-bold text-zinc-950 transition-transform hover:scale-105"
            style={{ background: id.accent }}
          >
            ▶ Stagione {yy(s.nextYear)} — {s.newLeagueName}
          </button>
        </div>
      </div>
    </div>
  );
}
