/**
 * CALENDARIO (richiesta utente): l'agenda di lavoro del presidente — tutti gli
 * impegni e le scadenze giorno per giorno, col teletrasporto per saltare i giorni
 * vuoti. Il salto si ferma sempre al prossimo impegno obbligatorio (partita o call).
 */

import { useState } from 'react';
import { Help } from './Help';
import { Ic } from './Ic';
import { type AgendaItem, type GameSession, agendaView, cancelCall, goToDay } from './game';

export function CalendarScreen({
  session,
  accent,
  onBack,
}: {
  session: GameSession;
  accent: string;
  onBack: () => void;
}) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const ag = agendaView(session);

  // Un rigo per GIORNO: gli impegni dello stesso giorno stanno insieme.
  const days = new Map<number, AgendaItem[]>();
  for (const it of ag.items) {
    days.set(it.day, [...(days.get(it.day) ?? []), it]);
  }
  const rows = [...days.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <section className="anim-in rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mr-3 rounded-lg border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800"
          >
            ← Torna
          </button>
          <span className="text-lg font-bold">
            <Ic name="calendar_month" /> Agenda
          </span>
          <Help text="La tua agenda di lavoro: partite, coppe, finestre di mercato, scadenze e call fissate. Clicca «Salta qui» per teletrasportarti a un giorno futuro e bruciare i giorni vuoti — ma il tempo si ferma sempre al prossimo impegno OBBLIGATORIO: la partita va giocata e gli appuntamenti fissati vanno onorati (o annullati)." />
        </div>
        <div className="text-sm text-zinc-400">
          oggi è <b className="text-zinc-200">{ag.todayLabel}</b>
        </div>
      </div>

      {msg && (
        <button
          type="button"
          onClick={() => setMsg(null)}
          className="toast-in mb-3 w-full rounded-lg border border-zinc-600 bg-zinc-950/90 px-4 py-2 text-left text-sm hover:border-zinc-400"
        >
          {msg} ✕
        </button>
      )}

      <div className="space-y-1.5">
        {rows.map(([day, items]) => {
          const isToday = day === ag.today;
          const jumpable = day > ag.today && day <= ag.jumpLimit;
          const locked = day > ag.jumpLimit;
          return (
            <div
              key={day}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                isToday ? 'bg-zinc-800/60' : 'border-zinc-800 bg-zinc-950/40'
              }`}
              style={isToday ? { borderColor: accent } : undefined}
            >
              <div className="w-24 shrink-0 pt-0.5">
                <div className="text-sm font-bold" style={isToday ? { color: accent } : undefined}>
                  {items[0]!.date}
                </div>
                {isToday && <div className="text-[10px] uppercase text-zinc-500">oggi</div>}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                {items.map((it) => (
                  <div key={`${it.kind}-${it.text}`} className="flex items-center gap-2 text-sm">
                    <Ic
                      name={it.icon}
                      fill={it.kind === 'match-next' || it.kind === 'call'}
                      className="text-zinc-400"
                    />
                    <span
                      className={
                        it.kind === 'match-next' || it.kind === 'deadline'
                          ? 'font-semibold text-zinc-100'
                          : 'text-zinc-300'
                      }
                    >
                      {it.text}
                    </span>
                    {it.kind === 'call' && it.callId && (
                      <button
                        type="button"
                        title="annulla l'appuntamento"
                        onClick={() => {
                          setMsg(cancelCall(session, it.callId!));
                          refresh();
                        }}
                        className="rounded border border-zinc-700 px-1.5 text-[10px] text-zinc-400 hover:bg-zinc-800"
                      >
                        annulla
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {jumpable && (
                <button
                  type="button"
                  onClick={() => {
                    setMsg(goToDay(session, day));
                    refresh();
                  }}
                  className="shrink-0 rounded-lg border px-3 py-1 text-xs font-semibold hover:bg-zinc-800"
                  style={{ borderColor: `${accent}88`, color: accent }}
                >
                  <Ic name="fast_forward" fill /> Salta qui
                </button>
              )}
              {locked && (
                <span
                  className="shrink-0 pt-1 text-xs text-zinc-600"
                  title="prima c'è un impegno obbligatorio: partita o appuntamento"
                >
                  <Ic name="lock" fill />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-zinc-500">Agenda vuota: la stagione è agli sgoccioli.</p>
      )}
    </section>
  );
}
