/**
 * Classifiche VIVE di tutto il mondo (G4): una scheda per divisione, con
 * capocannonieri, re degli assist e migliori pagelle. Estratto da App.tsx.
 */

import { useEscape } from '../bits';
import { type GameSession, worldTables } from '../game';

export function LeagueTableModal({
  session,
  accent,
  tab,
  onTab,
  onClose,
}: {
  session: GameSession;
  accent: string;
  tab: number | null;
  onTab: (i: number) => void;
  onClose: () => void;
}) {
  useEscape(onClose);

  const all = worldTables(session);
  const idx = Math.min(
    tab ??
      Math.max(
        0,
        all.findIndex((x) => x.mine),
      ),
    all.length - 1,
  );
  const t = all[idx];
  const close = onClose;
  // Mondo anomalo senza leghe: niente crash a schermo bianco.
  if (!t) return null;
  /** Riga di leaderboard: nome+club leggibili, numero grande a destra. */
  const LeadRow = (p: {
    rank: number;
    name: string;
    clubName: string;
    role: string;
    myClub: boolean;
    big: React.ReactNode;
    sub?: string;
  }) => (
    <div className="flex items-center gap-2.5 border-b border-zinc-800/50 py-1.5 last:border-0">
      <span
        className={`w-6 shrink-0 text-center text-xs font-bold ${
          p.rank === 1 ? 'text-amber-300' : 'text-zinc-500'
        }`}
      >
        {p.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-sm font-semibold ${
            p.myClub ? 'text-emerald-300' : 'text-zinc-200'
          }`}
        >
          {p.name}
        </div>
        <div className="truncate text-xs text-zinc-500">
          {p.clubName} · {p.role}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-base font-bold leading-tight">{p.big}</div>
        {p.sub && <div className="text-[10px] text-zinc-500">{p.sub}</div>}
      </div>
    </div>
  );
  return (
    <div
      className="backdrop-fade fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
      onClick={close}
      onKeyDown={(e) => e.key === 'Escape' && close()}
      role="presentation"
    >
      <div
        className="modal-pop max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* G4 — IL MONDO CHE GIOCA: le altre serie avanzano con la tua */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-bold">Classifica — {t.league}</h3>
          <div className="flex flex-wrap gap-1.5">
            {all.map((x, i) => (
              <button
                key={x.league}
                type="button"
                onClick={() => onTab(i)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  i === idx
                    ? 'border-transparent text-zinc-950'
                    : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
                style={i === idx ? { background: accent } : undefined}
              >
                {x.mine ? '★ ' : ''}
                {x.league}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <table className="h-fit w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-[10px] uppercase tracking-widest text-zinc-500">
                <th className="w-8 py-1.5 pr-2 text-right font-normal">#</th>
                <th className="font-normal">squadra</th>
                <th className="text-right font-normal">g</th>
                <th className="text-right font-normal">dr</th>
                <th className="w-12 text-right font-normal">pt</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r) => (
                <tr
                  key={r.name}
                  className={`border-b border-zinc-800/50 last:border-0 ${
                    r.mine ? 'bg-emerald-950/60 font-semibold' : ''
                  }`}
                >
                  <td className="py-1.5 pr-2 text-right text-zinc-500">{r.pos}</td>
                  <td className="truncate">{r.name}</td>
                  <td className="text-right text-zinc-400">{r.played}</td>
                  <td className="text-right text-zinc-400">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td className="text-right font-bold">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-4">
            {t.scorers.length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  ⚽ capocannonieri
                </div>
                {t.scorers.map((p, i) => (
                  <LeadRow
                    key={p.name}
                    rank={i + 1}
                    name={p.name}
                    clubName={p.clubName}
                    role={p.role}
                    myClub={p.myClub}
                    big={p.goals}
                    sub={`${p.apps} pres${p.assists > 0 ? ` · ${p.assists} assist` : ''}`}
                  />
                ))}
              </div>
            )}
            {t.assistmen.length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  🅰 re degli assist
                </div>
                {t.assistmen.map((p, i) => (
                  <LeadRow
                    key={p.name}
                    rank={i + 1}
                    name={p.name}
                    clubName={p.clubName}
                    role={p.role}
                    myClub={p.myClub}
                    big={p.assists}
                    sub={`${p.apps} pres${p.goals > 0 ? ` · ${p.goals} gol` : ''}`}
                  />
                ))}
              </div>
            )}
            {t.ratings.length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  ⭐ migliori pagelle
                </div>
                {t.ratings.map((p, i) => (
                  <LeadRow
                    key={p.name}
                    rank={i + 1}
                    name={p.name}
                    clubName={p.clubName}
                    role={p.role}
                    myClub={p.myClub}
                    big={
                      <span
                        style={{
                          color: p.media >= 6.5 ? '#34d399' : p.media >= 6 ? '#e4e4e7' : '#f87171',
                        }}
                      >
                        {p.media.toFixed(2)}
                      </span>
                    }
                    sub={`${p.apps} pres`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
