/**
 * La SCHEDA GIOCATORE v2 (MODULE_UI §11): giudizi, non numeri. Testata con
 * numero di maglia e GRADINO stimato (con forbice e conoscenza), profilo
 * tecnico a giudizi con banda d'incertezza, carattere emerso, voci dello
 * staff, mercato a forbice — più i blocchi vivi (stagione, carriera, heatmap,
 * percentili). Si apre per QUALSIASI giocatore del mondo.
 */

import type { ReactNode } from 'react';
import { HeatCard } from '../Heatmap';
import { Ic } from '../Ic';
import { Radar } from '../Radar';
import { useEscape } from '../bits';
import { type GameSession, schedaView } from '../game';

const GIUDIZIO_COLOR: Record<string, { text: string; bar: string }> = {
  Eccellente: { text: '#34d399', bar: '#34d399' },
  Ottimo: { text: '#6ee7b7', bar: '#6ee7b7' },
  Buono: { text: '#e4e4e7', bar: '#a1a1aa' },
  Discreto: { text: '#a1a1aa', bar: '#71717a' },
  Limitato: { text: '#71717a', bar: '#52525b' },
  'Da verificare': { text: '#fbbf24', bar: '#fbbf24' },
};

const AFF_COLOR: Record<string, string> = {
  alta: '#34d399',
  media: '#e4e4e7',
  bassa: '#fbbf24',
};

function Pannello({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 ${className}`}>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">{title}</div>
      {children}
    </div>
  );
}

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

  const v = schedaView(session, name);
  if (!v) return null;
  const M = (x: number) => `${(x / 1e6).toFixed(1)}M`;
  return (
    <div
      className="backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        className="modal-pop max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* ---- Testata: numero, nome, chips | livello stimato ---- */}
        <div className="mb-4 flex flex-wrap gap-4">
          <div
            className="flex w-20 shrink-0 flex-col items-center justify-center rounded-lg py-3"
            style={{ background: `${accent}22`, border: `1px solid ${accent}55` }}
          >
            <span className="text-4xl font-black" style={{ color: accent }}>
              {v.shirt ?? '—'}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {v.posLabel}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-zinc-500">
              {v.clubName}
              {v.leagueName ? ` · ${v.leagueName}` : ''} · {v.age} anni · piede {v.foot} ·{' '}
              {v.nationality}
            </p>
            <h3 className="truncate text-2xl font-black uppercase">{v.name}</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {v.carattere.tags.map((t, i) => (
                <span
                  key={t}
                  className="rounded-full border px-2.5 py-0.5 text-xs"
                  style={
                    i === 0
                      ? { borderColor: `${accent}88`, color: accent }
                      : { borderColor: '#3f3f46', color: '#d4d4d8' }
                  }
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-zinc-400">
              {v.morale ? `${v.morale} · ` : ''}
              {v.injury ? `🚑 ${v.injury}` : ''}
            </p>
          </div>
          <div className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:w-64">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Livello stimato
            </div>
            <div className="text-lg font-bold" style={{ color: accent }}>
              {v.gradino.label}
            </div>
            <div className="text-xs text-zinc-400">{v.gradino.desc}</div>
            {v.forbice && (
              <div className="mt-1 text-xs text-amber-400/90">
                Forbice: tra «{v.forbice.from.label}» e «{v.forbice.to.label}»
              </div>
            )}
            {v.gradinoPot && (
              <div className="mt-1 text-xs text-zinc-300">
                Potrebbe valere: <b>{v.gradinoPot.label}</b>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full rounded"
                  style={{ width: `${v.conoscenza.pct * 100}%`, background: accent }}
                />
              </div>
              <span className="text-[11px] text-zinc-400">conoscenza: {v.conoscenza.label}</span>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
                ⓘ La scala dei livelli
              </summary>
              <ul className="mt-1.5 space-y-1">
                {v.ladder.map((g) => (
                  <li key={g.label} className="text-[11px] leading-tight">
                    <span
                      className={g.label === v.gradino.label ? 'font-bold' : 'text-zinc-300'}
                      style={g.label === v.gradino.label ? { color: accent } : undefined}
                    >
                      {g.label}
                    </span>
                    <span className="text-zinc-500"> — {g.desc}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* ---- Profilo tecnico: giudizi + banda d'incertezza ---- */}
          <Pannello title="Profilo tecnico">
            <p className="mb-2 text-[11px] text-zinc-500">
              La banda indica il margine d'incertezza dell'osservatore
            </p>
            <div className="space-y-2">
              {v.profilo.map((row) => {
                const col = GIUDIZIO_COLOR[row.giudizio] ?? GIUDIZIO_COLOR.Buono!;
                return (
                  <div key={row.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-zinc-300">{row.label}</span>
                      <span className="font-bold" style={{ color: col.text }}>
                        {row.giudizio}
                      </span>
                    </div>
                    <div className="relative mt-0.5 h-1.5 overflow-hidden rounded bg-zinc-800">
                      <div
                        className="absolute h-full rounded"
                        style={{
                          left: `${row.lo}%`,
                          width: `${Math.max(4, row.hi - row.lo)}%`,
                          background: col.bar,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Pannello>

          {/* ---- Carattere: sintesi, pro/contro, radar emerso ---- */}
          <Pannello title="Carattere">
            <p className="mb-1 text-[11px] text-zinc-500">{v.carattere.note}</p>
            {v.carattere.radar && (
              <div className="flex justify-center">
                <Radar metrics={v.carattere.radar} color={accent} size={190} />
              </div>
            )}
            <p className="mt-1 font-bold text-zinc-100">{v.carattere.summary}</p>
            {v.carattere.pro && (
              <div className="mt-2 rounded border border-zinc-800 bg-zinc-900/70 p-2 text-sm">
                <span className="font-bold text-emerald-400">Pro</span>
                <span className="text-zinc-300"> · {v.carattere.pro}</span>
              </div>
            )}
            {v.carattere.contro && (
              <div className="mt-1.5 rounded border border-zinc-800 bg-zinc-900/70 p-2 text-sm">
                <span className="font-bold text-amber-400">Contro</span>
                <span className="text-zinc-300"> · {v.carattere.contro}</span>
              </div>
            )}
          </Pannello>

          {/* ---- Cosa dice lo staff ---- */}
          <Pannello title="Cosa dice lo staff">
            <div className="space-y-2">
              {v.staff.map((q) => (
                <div key={q.text} className="rounded border border-zinc-800 bg-zinc-900/70 p-2.5">
                  <p className="text-sm text-zinc-200">{q.text}</p>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">{q.source}</span>
                    <span style={{ color: AFF_COLOR[q.aff] }}>Affidabilità: {q.aff}</span>
                  </div>
                </div>
              ))}
            </div>
          </Pannello>

          {/* ---- Mercato ---- */}
          <Pannello title="Mercato">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                <span className="text-zinc-400">Valore stimato</span>
                <span className="font-bold">
                  {M(v.mercato.valueLo)} – {M(v.mercato.valueHi)}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                <span className="text-zinc-400">Ingaggio</span>
                <span className="font-bold">
                  {v.mercato.wage
                    ? `${v.mercato.wage.esatto ? '' : '~'}${M(v.mercato.wage.amount)}/anno${
                        v.mercato.wage.esatto ? '' : ' (stima)'
                      }`
                    : v.clubName === 'Svincolato'
                      ? 'Parametro zero'
                      : 'Riservato'}
                  {v.mercato.contractEnd ? ` · fino al ${v.mercato.contractEnd}` : ''}
                </span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-zinc-400">Interesse</span>
                <span
                  className="font-bold"
                  style={{ color: v.mercato.interesse ? accent : undefined }}
                >
                  {v.mercato.interesse
                    ? `${v.mercato.interesse.count}${v.mercato.interesse.plus ? '+' : ''} club di ${v.mercato.interesse.league}`
                    : 'Nessuna pista concreta'}
                </span>
              </div>
            </div>
            <div className="mt-2 rounded border border-zinc-800 bg-zinc-900/70 p-2 text-sm text-zinc-300">
              {v.mercato.procuratore}
            </div>
          </Pannello>

          {/* ---- La stagione (dati veri del motore) ---- */}
          {v.stats && v.stats.apps > 0 && (
            <Pannello title="Il campo · stagione">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-zinc-400">
                  {v.stats.apps} pres · {v.stats.minutes}'
                </span>
                <span
                  className="font-bold"
                  style={{
                    color:
                      v.stats.rating >= 6.5
                        ? '#34d399'
                        : v.stats.rating >= 6
                          ? '#e4e4e7'
                          : '#f87171',
                  }}
                  title="media pagella (4-10, 6 = sufficienza)"
                >
                  media {v.stats.rating.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-zinc-300">
                {v.pos === 'GK' ? (
                  <>
                    <span>{v.stats.cleanSheets} clean sheet</span>
                    <span>parate {(v.stats.savePct * 100).toFixed(0)}%</span>
                    <span title="gol evitati rispetto all'xG affrontato">
                      xG evitati {v.stats.psxgDiff >= 0 ? '+' : ''}
                      {v.stats.psxgDiff.toFixed(1)}
                    </span>
                    <span>{v.stats.concededOn} subiti</span>
                  </>
                ) : v.pos === 'DF' ? (
                  <>
                    <span>{v.stats.cleanSheets} clean sheet</span>
                    <span>contrasti {(v.stats.tackleWinPct * 100).toFixed(0)}%</span>
                    <span>aerei {(v.stats.aerialWinPct * 100).toFixed(0)}%</span>
                    <span>
                      {v.stats.goals} gol · {v.stats.assists} assist
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {v.stats.goals} gol · {v.stats.assists} assist
                    </span>
                    <span>
                      xG {v.stats.xg.toFixed(1)} · xA {v.stats.xa.toFixed(1)}
                    </span>
                    <span>tiri/90 {v.stats.shots90.toFixed(1)}</span>
                    <span>
                      pass. {(v.stats.passAcc * 100).toFixed(0)}% · KP/90{' '}
                      {v.stats.keyPasses90.toFixed(1)}
                    </span>
                  </>
                )}
                <span>{v.stats.km.toFixed(1)} km/gara</span>
                <span>
                  🟨 {v.stats.yellow} · 🟥 {v.stats.red}
                </span>
              </div>
            </Pannello>
          )}

          {/* ---- Carriera ---- */}
          {v.career.length > 0 && (
            <Pannello title="Carriera">
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
                  {v.career.slice(0, 6).map((c) => (
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
            </Pannello>
          )}

          {/* ---- Come si muove ---- */}
          {v.movements.length > 0 && (
            <Pannello title="Come si muove">
              <div className="mb-1 text-sm text-zinc-200">
                <Ic name="sprint" /> <b>{v.running.label}</b>
                <span className="text-zinc-400"> — {v.running.desc}</span>
              </div>
              <ul className="space-y-0.5 text-sm text-zinc-300">
                {v.movements.map((mv) => (
                  <li key={mv}>· {mv}</li>
                ))}
              </ul>
            </Pannello>
          )}

          {/* ---- Heatmap osservata + percentili di ruolo ---- */}
          <Pannello title="Sul campo">
            {v.heat && <HeatCard view={v.heat} />}
            {v.percentiles && 'ready' in v.percentiles && v.percentiles.ready ? (
              <div className="mt-2 flex justify-center">
                <div>
                  <div className="text-center text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                    percentili vs pari ruolo ({v.percentiles.peers} in lega)
                  </div>
                  <Radar metrics={v.percentiles.metrics} color={accent} />
                </div>
              </div>
            ) : v.percentiles && 'gated' in v.percentiles && v.percentiles.gated ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                Percentili di ruolo: servono più osservazioni ({v.percentiles.have}/
                {v.percentiles.needed}).
              </p>
            ) : null}
          </Pannello>
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
