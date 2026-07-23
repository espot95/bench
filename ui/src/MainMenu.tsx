/**
 * Menu principale (richiesta utente): sfondo REALISTICO cinematografico — la gamba
 * del calciatore sotto il riflettore, a un istante dal calciare il mondo-pallone
 * acceso dalle luci delle città. Immagine generata per il progetto (public/menu-bg.png),
 * lenta zoomata ken-burns, voci del menu a sinistra sul nero.
 */

const GOLD = '#c9a961';

export function MainMenu({ onStart }: { onStart: () => void }) {
  const items: { label: string; sub?: string; go?: boolean }[] = [
    {
      label: 'Carriera Presidente',
      sub: 'governa il club: conti, stadio, città e ambizioni',
      go: true,
    },
    { label: 'Carriera Allenatore', sub: 'in arrivo' },
    { label: 'Carriera Procuratore', sub: 'in arrivo' },
    { label: 'Continua partita', sub: 'salvataggi in arrivo' },
  ];

  return (
    <div className="relative flex min-h-screen items-center overflow-hidden bg-black">
      {/* la scena: notturna, reale, con lenta zoomata */}
      <div
        className="animate-kenburns absolute inset-0 bg-cover bg-right"
        style={{ backgroundImage: "url('/menu-bg.png')" }}
      />

      {/* la scena vive: nebbia che scorre su due piani, a velocità diverse */}
      <div className="animate-mist-slow pointer-events-none absolute inset-y-0 right-0 w-[160%] opacity-60" />
      <div className="animate-mist-fast pointer-events-none absolute inset-y-0 right-0 w-[160%] opacity-40" />

      {/* il bagliore del mondo nella rete, che respira */}
      <div
        className="animate-glow-pulse pointer-events-none absolute"
        style={{
          right: '24%',
          top: '38%',
          width: '340px',
          height: '340px',
          background: 'radial-gradient(circle, rgba(218,165,80,0.22), transparent 60%)',
        }}
      />

      {/* pulviscolo nel fascio del riflettore */}
      {[...Array(14)].map((_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: particelle statiche decorative
          key={i}
          className="animate-dust pointer-events-none absolute rounded-full bg-[#e8dcbe]"
          style={{
            right: `${10 + ((i * 37) % 42)}%`,
            top: `${12 + ((i * 53) % 62)}%`,
            width: i % 3 === 0 ? '3px' : '2px',
            height: i % 3 === 0 ? '3px' : '2px',
            opacity: 0,
            animationDuration: `${7 + (i % 5) * 2.4}s`,
            animationDelay: `${(i * 1.7) % 9}s`,
          }}
        />
      ))}

      {/* la pioggerellina cade nella zona del fascio (nessun cono disegnato) */}
      <div
        className="pointer-events-none absolute inset-y-0 overflow-hidden"
        style={{
          right: '8%',
          width: '44%',
          clipPath: 'polygon(58% 0%, 68% 0%, 100% 100%, 8% 100%)',
        }}
      >
        {[...Array(26)].map((_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: gocce statiche decorative
            key={i}
            className="animate-drizzle absolute"
            style={{
              left: `${4 + ((i * 29) % 92)}%`,
              top: '-6%',
              width: '1px',
              height: `${18 + (i % 4) * 8}px`,
              background: `linear-gradient(to bottom, transparent, rgba(215,222,235,${i % 2 === 0 ? 0.55 : 0.4}), transparent)`,
              transform: 'rotate(13deg)',
              opacity: 0,
              animationDuration: `${1.7 + (i % 5) * 0.45}s`,
              animationDelay: `${(i * 0.61) % 4.5}s`,
            }}
          />
        ))}
      </div>

      {/* rugiada che brilla sull'erba */}
      {[...Array(22)].map((_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: riflessi statici decorativi
          key={i}
          className="animate-twinkle pointer-events-none absolute rounded-full"
          style={{
            right: `${3 + ((i * 23) % 55)}%`,
            bottom: `${2 + ((i * 31) % 16)}%`,
            width: i % 4 === 0 ? '3px' : '2px',
            height: i % 4 === 0 ? '3px' : '2px',
            background: i % 3 === 0 ? '#dfe6f0' : '#f2e8c8',
            boxShadow:
              i % 3 === 0
                ? '0 0 6px 1px rgba(210,225,245,0.6)'
                : '0 0 6px 1px rgba(242,232,200,0.7)',
            opacity: 0,
            animationDuration: `${2.6 + (i % 5) * 0.9}s`,
            animationDelay: `${(i * 0.97) % 6}s`,
          }}
        />
      ))}

      {/* raccordo verso sinistra: il nero della scena diventa il nero del menu */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 30%, rgba(0,0,0,0.25) 52%, transparent 70%), linear-gradient(to top, rgba(0,0,0,0.6), transparent 30%)',
        }}
      />

      {/* ---- le voci del menu ---- */}
      <div className="relative z-10 ml-[7vw] max-w-md">
        <h1
          className="title-sheen text-6xl font-black tracking-[0.35em]"
          style={{ filter: 'drop-shadow(0 2px 18px rgba(0,0,0,0.9))' }}
        >
          BENCH
        </h1>
        <p className="mt-2 text-sm italic tracking-wide text-zinc-400">
          un mondo di calcio, tre modi di viverlo
        </p>

        <nav className="mt-12 space-y-1.5">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              disabled={!it.go}
              onClick={() => it.go && onStart()}
              className={`group block w-full rounded-lg border-l-2 px-5 py-3 text-left backdrop-blur-[2px] transition-all ${
                it.go
                  ? 'border-transparent hover:translate-x-2 hover:border-[#c9a961] hover:bg-black/60'
                  : 'cursor-not-allowed border-transparent opacity-40'
              }`}
            >
              <span
                className={`text-xl font-bold tracking-wide ${
                  it.go ? 'text-zinc-100 group-hover:text-[#c9a961]' : 'text-zinc-400'
                }`}
                style={{ textShadow: '0 1px 12px rgba(0,0,0,0.9)' }}
              >
                {it.go && (
                  <span className="mr-2" style={{ color: GOLD }}>
                    ▸
                  </span>
                )}
                {it.label}
              </span>
              {it.sub && <div className="mt-0.5 text-xs text-zinc-500">{it.sub}</div>}
            </button>
          ))}
        </nav>

        <p className="mt-14 text-[11px] tracking-widest text-zinc-600">
          DUE NAZIONI · QUATTRO CAMPIONATI · UN SOLO MONDO SIMULATO
        </p>
      </div>
    </div>
  );
}
