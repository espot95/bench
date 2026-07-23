/** La vetrina dei club (MODULE_UI): un club per schermata, identità procedurale, animazioni. */

import { useState } from 'react';
import { CityMap } from './CityMap';
import { Crest } from './Crest';
import type { ClubDossier } from './game';
import { clubIdentity, presidentType } from './identity';

export function ClubShowcase({
  clubs,
  onPick,
}: {
  clubs: ClubDossier[];
  onPick: (i: number) => void;
}) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<'left' | 'right'>('right');
  const c = clubs[i]!;
  const id = clubIdentity(c.name, c.reputation, c.league, c.nation);

  const go = (d: number) => {
    setDir(d > 0 ? 'right' : 'left');
    setI((i + d + clubs.length) % clubs.length);
  };

  return (
    <div
      className="min-h-screen p-6 transition-colors duration-700"
      style={{
        background: `radial-gradient(ellipse at 20% 0%, ${id.secondary}33, transparent 60%), radial-gradient(ellipse at 90% 100%, ${id.primary}22, #09090b 65%)`,
      }}
    >
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-widest text-zinc-300">BENCH</h1>
          <span className="text-sm text-zinc-500">
            {i + 1} / {clubs.length} · {c.league}
          </span>
        </header>

        <div key={c.name} className={dir === 'right' ? 'animate-slide-r' : 'animate-slide-l'}>
          <div className="grid gap-8 md:grid-cols-[280px_1fr]">
            <div className="flex flex-col items-center gap-4">
              <Crest id={id} name={c.name} reputation={c.reputation} />
              <div className="text-center">
                <h2 className="text-3xl font-black" style={{ color: id.accent }}>
                  {c.name}
                </h2>
                <p className="text-sm italic text-zinc-400">
                  "{id.nickname}" · {id.city.name}, dal {id.founded}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onPick(c.index)}
                className="animate-pulse-slow rounded-xl px-8 py-3 text-lg font-bold text-zinc-950 shadow-lg transition-transform hover:scale-105"
                style={{ background: id.accent }}
              >
                Presiedi il {c.name}
              </button>
            </div>

            <div className="space-y-5">
              <p className="leading-relaxed text-zinc-300">{id.history}</p>
              <CityMap id={id} />
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm md:grid-cols-3">
                <Info
                  k="Budget mercato"
                  v={`${(c.transferBudget / 1e6).toFixed(0)}M`}
                  accent={id.accent}
                />
                <Info k="Cassa" v={`${(c.cash / 1e6).toFixed(0)}M`} accent={id.accent} />
                <Info
                  k="Stadio"
                  v={`${(c.capacity / 1000).toFixed(0)}k posti`}
                  accent={id.accent}
                />
                <Info k="Presidenza uscente" v={c.presidentName} accent={id.accent} />
                <Info
                  k="Stile della casa"
                  v={presidentType(c.presidentTraits)}
                  accent={id.accent}
                />
                <Info k="Allenatore" v={c.coachName} accent={id.accent} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-6">
          <Nav dir={-1} accent={id.accent} onClick={() => go(-1)} />
          <span className="text-xs uppercase tracking-widest text-zinc-500">sfoglia i club</span>
          <Nav dir={1} accent={id.accent} onClick={() => go(1)} />
        </div>
      </div>
    </div>
  );
}

function Info({ k, v, accent }: { k: string; v: string; accent: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{k}</div>
      <div className="font-semibold" style={{ color: accent }}>
        {v}
      </div>
    </div>
  );
}

function Nav({
  dir,
  accent,
  onClick,
}: {
  dir: -1 | 1;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? 'club precedente' : 'club successivo'}
      className="rounded-full border bg-zinc-900 px-5 py-2 transition-all hover:scale-110 hover:brightness-125"
      style={{ borderColor: accent }}
    >
      {/* freccia SVG: mai resa come emoji (◀▶ su Windows diventano emoji blu) */}
      <svg viewBox="0 0 12 12" className="h-4 w-4 fill-zinc-200">
        <title>{dir < 0 ? 'precedente' : 'successivo'}</title>
        {dir < 0 ? <path d="M9 1 L3 6 L9 11 Z" /> : <path d="M3 1 L9 6 L3 11 Z" />}
      </svg>
    </button>
  );
}
