/**
 * SETTORE GIOVANILE (F4b, richiesta utente — G1): l'accademia a livelli come spesa
 * strategica e la Primavera coi giudizi PARLATI dell'osservatore (mai numeri):
 * il gioiello può nascondersi tra i grezzi, e l'occhio si affina con gli anni.
 */

import { useState } from 'react';
import { Help } from './Help';
import { Ic } from './Ic';
import { Radar } from './Radar';
import { type GameSession, academyView, investInAcademy, promoteYouth } from './game';

const M = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`);

const JUDGE_STYLE: Record<string, string> = {
  predestinato: 'border-amber-500/60 bg-amber-950/40 text-amber-300',
  'da seguire': 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300',
  'buon prospetto': 'border-zinc-600 bg-zinc-900 text-zinc-300',
  grezzo: 'border-zinc-800 bg-zinc-950 text-zinc-500',
};

export function AcademyPane({ session, accent }: { session: GameSession; accent: string }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const v = academyView(session);
  const card = 'rounded-xl border border-zinc-800 bg-zinc-950/50 p-3';

  if (!v.built) {
    return (
      <div className={`anim-in ${card} text-sm`}>
        <div className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <Ic name="school" /> Settore giovanile
        </div>
        <p className="text-zinc-400">
          Il vivaio è la scommessa a lungo termine del presidente: una classe di ragazzi ogni
          estate, giudicati solo dall'<b className="text-zinc-200">occhio degli osservatori</b> — il
          gioiello può nascondersi tra i grezzi. Chi cresce qui conta come{' '}
          <b className="text-zinc-200">cresciuto nel club</b> per le liste, e se lo vendi è
          plusvalenza pura.
        </p>
        <button
          type="button"
          onClick={() => {
            setMsg(investInAcademy(session));
            refresh();
          }}
          className="mt-3 rounded-lg border px-4 py-2 text-sm font-bold transition-colors hover:bg-zinc-800"
          style={{ borderColor: accent, color: accent }}
        >
          <Ic name="school" /> Fonda l'accademia · {M(v.buildCost)} + {M(v.annual)}/anno
        </button>
        {msg && <p className="note-in mt-2 text-xs text-zinc-400">{msg}</p>}
      </div>
    );
  }

  const sel = v.prospects.find((p) => p.id === selected) ?? null;

  return (
    <div className="space-y-4">
      {/* ---- Testata: livello, retta, upgrade ---- */}
      <div className={`anim-in ${card} flex flex-wrap items-center gap-3 text-xs`}>
        <span className="font-bold uppercase tracking-widest text-zinc-500">
          <Ic name="school" /> Accademia
        </span>
        <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-zinc-300">
          livello {v.level}/{v.maxLevel} · retta {M(v.annual)}/anno · classe da {v.intake}
          <Help text="Il livello dell'accademia è la leva: più campi e più occhi significano classi estive più numerose e di qualità più alta, e ragazzi che crescono più in fretta. La retta esce dalla cassa ogni estate." />
        </span>
        <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-zinc-400">
          {v.prospects.length} in Primavera · a {v.leaveAge} anni si esce
        </span>
        {v.upgrade && (
          <button
            type="button"
            onClick={() => {
              setMsg(investInAcademy(session));
              refresh();
            }}
            className="rounded-lg border px-3 py-1 font-semibold transition-colors hover:bg-zinc-800"
            style={{ borderColor: accent, color: accent }}
          >
            Amplia · {M(v.upgrade.cost)} (poi {M(v.upgrade.annual)}/anno)
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        {/* ---- La Primavera ---- */}
        <div className={`anim-in ${card}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Ic name="groups" /> La Primavera
            <Help text="I giudizi sono PARLATI e imperfetti: alla 'prima impressione' l'osservatore può sbagliare di grosso, dopo un anno è 'osservato', dal terzo è 'conosciuto' e il giudizio è affidabile. Promuovere un ragazzo lo porta in prima squadra con un contratto da giovane — e per le liste conta come cresciuto nel club." />
          </div>
          <div className="space-y-1.5">
            {v.prospects.length === 0 && (
              <p className="text-xs text-zinc-500">
                Nessun ragazzo in accademia: la prossima classe arriva in estate.
              </p>
            )}
            {v.prospects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id === selected ? null : p.id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                  selected === p.id ? 'bg-zinc-800' : 'border-zinc-800 hover:bg-zinc-900'
                }`}
                style={selected === p.id ? { borderColor: accent } : undefined}
              >
                <span className="inline-block w-9 shrink-0 rounded border border-zinc-700 bg-zinc-900 text-center text-[10px] font-bold text-zinc-400">
                  {p.role}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-zinc-200">{p.name}</span>{' '}
                  <span className="text-zinc-600">
                    {p.age} anni · {p.nationality}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${JUDGE_STYLE[p.judgment] ?? ''}`}
                  title={`giudizio: ${p.confidence}`}
                >
                  {p.judgment}
                </span>
                <span className="shrink-0 text-[9px] uppercase text-zinc-600">{p.confidence}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ---- La scheda del ragazzo selezionato ---- */}
        <div className={`anim-in ${card} w-full lg:w-72`}>
          {sel ? (
            <div className="space-y-2 text-xs">
              <div>
                <div className="text-sm font-bold text-zinc-100">{sel.name}</div>
                <div className="text-zinc-500">
                  {sel.age} anni · {sel.nationality} · in accademia da{' '}
                  {sel.yearsIn === 0
                    ? "quest'anno"
                    : `${sel.yearsIn} ann${sel.yearsIn === 1 ? 'o' : 'i'}`}
                </div>
              </div>
              <div className="text-zinc-400">
                {sel.archetype} · {sel.running}
              </div>
              <Radar metrics={sel.axes} color={accent} size={200} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={v.squadRoom <= 0}
                  onClick={() => {
                    setMsg(promoteYouth(session, sel.id));
                    setSelected(null);
                    refresh();
                  }}
                  className="rounded-lg border px-3 py-1.5 font-bold transition-colors hover:bg-zinc-800 disabled:opacity-40"
                  style={{ borderColor: accent, color: accent }}
                >
                  <Ic name="arrow_upward" /> Promuovi in prima squadra
                </button>
              </div>
              {v.squadRoom <= 0 && (
                <p className="text-[10px] text-amber-300/80">rosa piena: prima serve spazio</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Seleziona un ragazzo per vedere archetipo, corsa e il radar delle abilità — senza
              numeri, come vuole la casa.
            </p>
          )}
        </div>
      </div>
      {msg && <p className="note-in text-xs text-zinc-400">{msg}</p>}
    </div>
  );
}
