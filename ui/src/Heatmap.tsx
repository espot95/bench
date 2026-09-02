/**
 * Card-heatmap (MODULE_SCOUTING §7): il campo visto dall'osservatore — sgranata a poche
 * osservazioni, nitida sui tuoi. Attacco verso destra.
 */

import type { HeatView } from './game';

export function HeatCard({ view, compact = false }: { view: HeatView; compact?: boolean }) {
  const h = view.grid.length;
  const w = view.grid[0]?.length ?? 0;
  return (
    <div className={compact ? 'w-44' : 'w-full max-w-xs'}>
      <div
        className="relative overflow-hidden rounded-md border border-emerald-900/70"
        style={{ background: '#123c24' }}
      >
        {/* linee del campo, minime */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-emerald-100/20" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-100/20" />
        <div className="pointer-events-none absolute inset-y-[22%] left-0 w-[13%] border border-l-0 border-emerald-100/20" />
        <div className="pointer-events-none absolute inset-y-[22%] right-0 w-[13%] border border-r-0 border-emerald-100/20" />
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${w}, 1fr)`,
            aspectRatio: '3 / 2',
          }}
        >
          {view.grid.flatMap((row, r) =>
            row.map((v, c) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: griglia statica del campo
                key={`${r}-${c}`}
                style={{ background: `rgba(255, 122, 26, ${Math.min(1, v * 0.92)})` }}
              />
            )),
          )}
        </div>
        <div className="pointer-events-none absolute right-1 bottom-0.5 text-[9px] text-emerald-100/50">
          attacco →
        </div>
      </div>
      <div className="mt-1 text-[11px] leading-tight text-zinc-400">
        <span className="font-semibold text-zinc-200">{view.archetype}</span> · {view.height} cm ·
        baricentro {view.baricentro}
        <div className="text-zinc-500">
          {view.obs === null
            ? 'lo conosci a memoria'
            : view.obs === 0
              ? 'mai osservato: la mappa è un’ipotesi'
              : `vista da ${view.obs} osservazion${view.obs === 1 ? 'e' : 'i'}`}
        </div>
      </div>
    </div>
  );
}
