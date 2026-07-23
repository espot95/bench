/**
 * Emblemi civici procedurali (richiesta utente): reinterpretazione degli stemmi
 * STORICI DELLE CITTÀ (croce di San Giorgio, toro, giglio, ape di Manchester,
 * gufi di Leeds…) in chiave da gioco — come facevano i club d'epoca. Nessuna
 * copia di stemmi di club reali: solo iconografia civica, ridisegnata.
 * Ogni emblema vive in un viewBox 100×100 centrato.
 */

// Duotono minimal: tone = figura, ink = dettagli incisi (li passa lo stemma).
interface Tone {
  tone: string;
  ink: string;
}

function Cross({ tone, ink }: Tone) {
  return (
    <g>
      <rect x="43" y="12" width="14" height="76" fill={tone} />
      <rect x="12" y="43" width="76" height="14" fill={tone} />
    </g>
  );
}

/** Croce di Sardegna: croce + quattro losanghe nei quarti (Cagliari). */
function SardCross({ tone, ink }: Tone) {
  return (
    <g>
      <rect x="45" y="14" width="10" height="72" fill={tone} />
      <rect x="14" y="45" width="72" height="10" fill={tone} />
      {[
        [29, 29],
        [71, 29],
        [29, 71],
        [71, 71],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x! - 7}
          y={y! - 7}
          width="14"
          height="14"
          fill={tone}
          transform={`rotate(45 ${x} ${y})`}
        />
      ))}
    </g>
  );
}

/** Toro rampante stilizzato (Torino): testa taurina geometrica. */
function Bull({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M18 24 Q30 8 44 22 L50 28 L56 22 Q70 8 82 24 Q72 22 63 30 L63 48 Q63 70 50 80 Q37 70 37 48 L37 30 Q28 22 18 24 Z" />
      <circle cx="43" cy="44" r="3" fill={ink} />
      <circle cx="57" cy="44" r="3" fill={ink} />
      <circle cx="45" cy="66" r="2.4" fill={ink} />
      <circle cx="55" cy="66" r="2.4" fill={ink} />
    </g>
  );
}

/** Lupa capitolina stilizzata (Roma): muso frontale con orecchie. */
function Wolf({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M28 34 L34 14 L44 30 Q50 27 56 30 L66 14 L72 34 Q80 46 72 58 L58 76 Q50 84 42 76 L28 58 Q20 46 28 34 Z" />
      <circle cx="42" cy="45" r="3" fill={ink} />
      <circle cx="58" cy="45" r="3" fill={ink} />
      <path d="M46 62 L50 68 L54 62 Z" fill={ink} />
    </g>
  );
}

/** Cavallo sfrenato (Napoli): testa e collo rampanti. */
function Horse({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M34 84 Q30 62 40 52 Q30 48 33 34 Q40 20 54 24 L60 14 L63 27 Q76 30 78 43 L68 40 Q73 50 62 55 Q70 66 62 84 L54 84 Q60 68 50 61 Q46 72 40 84 Z" />
      <circle cx="58" cy="35" r="2.6" fill={ink} />
    </g>
  );
}

/** Giglio di Firenze. */
function Lily({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M50 12 Q60 30 50 52 Q40 30 50 12 Z" />
      <path d="M46 48 Q28 46 26 28 Q40 32 47 44 Z" />
      <path d="M54 48 Q72 46 74 28 Q60 32 53 44 Z" />
      <rect x="30" y="52" width="40" height="7" rx="2" />
      <path d="M42 59 Q40 74 32 80 Q38 66 40 59 Z" />
      <path d="M58 59 Q60 74 68 80 Q62 66 60 59 Z" />
      <path d="M47 59 Q50 74 50 84 Q50 74 53 59 Z" />
    </g>
  );
}

/** Le Due Torri (Bologna). */
function Towers({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <rect x="30" y="30" width="14" height="52" />
      {[30, 36, 41].map((x) => (
        <rect key={x} x={x} y="25" width="4" height="6" />
      ))}
      <rect x="54" y="16" width="12" height="66" />
      {[54, 59, 63].map((x) => (
        <rect key={x} x={x} y="11" width="3.6" height="6" />
      ))}
      <rect x="34" y="40" width="5" height="7" fill={ink} />
      <rect x="57" y="28" width="5" height="7" fill={ink} />
    </g>
  );
}

/** La scala (Verona). */
function Ladder({ tone, ink }: Tone) {
  return (
    <g fill={tone} transform="rotate(8 50 50)">
      <rect x="36" y="14" width="6" height="72" rx="2" />
      <rect x="58" y="14" width="6" height="72" rx="2" />
      {[24, 38, 52, 66].map((y) => (
        <rect key={y} x="38" y={y} width="24" height="5" rx="2" />
      ))}
    </g>
  );
}

/** Leone araldico frontale (Bergamo, Norwich). */
function Lion({ tone, ink }: Tone) {
  const spikes = [];
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    spikes.push(
      <path
        key={k}
        d={`M${50 + 24 * Math.cos(a)} ${48 + 24 * Math.sin(a)} L${50 + 36 * Math.cos(a + 0.14)} ${48 + 36 * Math.sin(a + 0.14)} L${50 + 26 * Math.cos(a + 0.3)} ${48 + 26 * Math.sin(a + 0.3)} Z`}
        fill={tone}
      />,
    );
  }
  return (
    <g>
      {spikes}
      <circle cx="50" cy="48" r="25" fill={tone} />
      <circle cx="42" cy="42" r="3.2" fill={ink} />
      <circle cx="58" cy="42" r="3.2" fill={ink} />
      <path d="M44 56 Q50 64 56 56 Q53 60 50 60 Q47 60 44 56 Z" fill={ink} />
      <path d="M47 50 L50 46 L53 50 Z" fill={ink} />
    </g>
  );
}

/** Aquila ad ali spiegate (Udine, Palermo). */
function Eagle({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M50 22 Q46 30 46 37 L28 28 Q16 32 12 44 Q26 41 36 47 L28 60 Q39 58 44 51 L44 66 L36 78 L50 71 L64 78 L56 66 L56 51 Q61 58 72 60 L64 47 Q74 41 88 44 Q84 32 72 28 L54 37 Q54 30 50 22 Z" />
      <circle cx="50" cy="30" r="2.4" fill={ink} />
    </g>
  );
}

/** Torrione (Bari, Newcastle). */
function Castle({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M28 82 L32 40 L40 40 L40 32 L46 32 L46 40 L54 40 L54 32 L60 32 L60 40 L68 40 L72 82 Z" />
      <rect x="45" y="58" width="10" height="24" fill={ink} rx="4" />
      <rect x="24" y="82" width="52" height="6" />
    </g>
  );
}

/** Ippocampo (Salerno). */
function Seahorse({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M56 12 Q72 16 70 32 Q68 42 58 44 Q68 50 66 62 Q63 78 46 82 Q36 84 30 76 Q40 79 47 72 Q56 63 53 52 Q51 44 44 41 Q54 38 56 30 Q57 22 48 21 L42 26 Q44 18 50 14 Q53 12 56 12 Z" />
      <path d="M66 20 L76 16 L70 26 Z" />
      <circle cx="57" cy="22" r="2.4" fill={ink} />
    </g>
  );
}

/** Grifone (Genova, Perugia): testa d'aquila con orecchio ferino. */
function Griffin({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M36 22 L48 12 L50 24 Q66 22 74 34 Q80 44 74 52 L58 48 Q64 56 58 64 L46 58 Q50 70 40 78 Q42 66 36 58 Q26 46 30 32 Z" />
      <path d="M70 40 Q84 42 86 52 Q76 52 70 47 Z" />
      <circle cx="52" cy="32" r="3" fill={ink} />
    </g>
  );
}

/** Spada di San Paolo su campo crociato (Londra). */
function SwordCross({ tone, ink }: Tone) {
  return (
    <g>
      <rect x="44" y="14" width="12" height="72" fill={tone} />
      <rect x="14" y="44" width="72" height="12" fill={tone} />
      <g fill={tone} transform="translate(24 22) scale(0.5)">
        <rect x="46" y="10" width="8" height="52" />
        <path d="M50 74 L42 62 L58 62 Z" />
        <rect x="36" y="8" width="28" height="6" rx="3" />
      </g>
    </g>
  );
}

/** L'ape operaia (Manchester). */
function Bee({ tone, ink }: Tone) {
  return (
    <g>
      <ellipse cx="50" cy="58" rx="17" ry="24" fill={ink} />
      {[44, 56, 68].map((y) => (
        <rect key={y} x="33" y={y} width="34" height="6" rx="3" fill={ink} />
      ))}
      <circle cx="50" cy="30" r="10" fill={tone} />
      <ellipse
        cx="30"
        cy="42"
        rx="13"
        ry="7"
        fill={tone}
        opacity="0.75"
        transform="rotate(-28 30 42)"
      />
      <ellipse
        cx="70"
        cy="42"
        rx="13"
        ry="7"
        fill={tone}
        opacity="0.75"
        transform="rotate(28 70 42)"
      />
      <path d="M44 22 L40 12 M56 22 L60 12" stroke={tone} strokeWidth="2.5" fill="none" />
    </g>
  );
}

/** L'uccello del porto (Liverpool): cormorano con l'alga nel becco. */
function Liverbird({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M42 84 L44 66 Q30 60 32 44 Q34 30 48 28 Q50 18 60 16 L74 20 L62 24 Q64 30 60 34 Q70 44 64 58 Q58 70 48 72 L50 84 Z" />
      <path d="M60 40 Q76 38 82 30 Q80 44 66 50 Z" />
      <circle cx="56" cy="24" r="2.2" fill={ink} />
      <rect x="36" y="84" width="28" height="5" rx="2" />
    </g>
  );
}

/** I gufi (Leeds). */
function Owl({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M30 26 L38 14 L44 26 Q50 23 56 26 L62 14 L70 26 Q76 40 72 56 Q68 76 50 82 Q32 76 28 56 Q24 40 30 26 Z" />
      <circle cx="41" cy="42" r="8" fill={ink} />
      <circle cx="59" cy="42" r="8" fill={ink} />
      <circle cx="41" cy="42" r="3" fill={tone} />
      <circle cx="59" cy="42" r="3" fill={tone} />
      <path d="M46 56 L50 62 L54 56 Z" fill={ink} />
    </g>
  );
}

/** L'ingranaggio dell'officina (Birmingham). */
function Cog({ tone, ink }: Tone) {
  const teeth = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    teeth.push(
      <rect
        key={k}
        x="46"
        y="10"
        width="8"
        height="14"
        fill={tone}
        transform={`rotate(${(a * 180) / Math.PI} 50 50)`}
      />,
    );
  }
  return (
    <g>
      {teeth}
      <circle cx="50" cy="50" r="28" fill={tone} />
      <circle cx="50" cy="50" r="12" fill={ink} />
    </g>
  );
}

/** La rosa bianca dello Yorkshire (Sheffield). */
function Rose({ tone, ink }: Tone) {
  const petals = [];
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    petals.push(
      <circle key={k} cx={50 + 20 * Math.cos(a)} cy={50 + 20 * Math.sin(a)} r="15" fill={tone} />,
    );
  }
  return (
    <g>
      {petals}
      <circle cx="50" cy="50" r="12" fill={ink} />
      <circle cx="50" cy="50" r="5" fill={ink} />
    </g>
  );
}

/** Il vascello (Bristol). */
function Ship({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M22 62 L78 62 L68 78 L32 78 Z" />
      <rect x="48" y="20" width="4" height="42" />
      <path d="M52 24 Q72 32 52 48 Z" />
      <path d="M48 28 Q32 36 48 50 Z" />
      <path
        d="M18 68 Q28 64 38 68 Q48 72 58 68 Q68 64 82 68"
        stroke={tone}
        strokeWidth="3"
        fill="none"
      />
    </g>
  );
}

/** Arco e freccia di Sherwood (Nottingham). */
function Bow({ tone, ink }: Tone) {
  return (
    <g stroke={tone} strokeWidth="4" fill="none">
      <path d="M30 18 Q76 50 30 82" />
      <line x1="30" y1="18" x2="30" y2="82" strokeWidth="2" />
      <line x1="22" y1="50" x2="80" y2="50" />
      <path d="M80 50 L68 43 M80 50 L68 57" />
      <path d="M22 46 L30 50 L22 54" fill={tone} stroke="none" />
    </g>
  );
}

/** L'ancora del porto (Southampton). */
function Anchor({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <circle cx="50" cy="20" r="7" fill="none" stroke={tone} strokeWidth="5" />
      <rect x="46" y="26" width="8" height="44" />
      <rect x="32" y="34" width="36" height="6" rx="3" />
      <path d="M50 78 Q30 74 24 56 L34 58 Q38 68 50 70 Q62 68 66 58 L76 56 Q70 74 50 78 Z" />
    </g>
  );
}

/** I delfini (Brighton). */
function Dolphin({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M20 60 Q30 34 58 30 Q80 28 84 44 Q76 38 66 40 Q78 48 70 60 L60 54 Q64 66 52 70 Q40 74 30 68 Q42 66 46 58 Q34 62 24 58 Z" />
      <path d="M52 30 L58 18 L64 30 Z" />
      <circle cx="72" cy="44" r="2.4" fill={ink} />
    </g>
  );
}

/** La volpe della contea (Leicester). */
function Fox({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M26 22 L38 30 Q50 26 62 30 L74 22 Q78 36 70 46 Q64 54 58 56 L50 70 L42 56 Q36 54 30 46 Q22 36 26 22 Z" />
      <circle cx="42" cy="41" r="2.8" fill={ink} />
      <circle cx="58" cy="41" r="2.8" fill={ink} />
      <path d="M47 52 L50 56 L53 52 Z" fill={ink} />
    </g>
  );
}

/** Il faro sul molo (Sunderland). */
function Lighthouse({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M42 30 L58 30 L64 80 L36 80 Z" />
      <rect x="40" y="20" width="20" height="10" rx="2" fill={ink} />
      <rect x="44" y="12" width="12" height="8" rx="2" />
      <path d="M36 24 L20 18 M64 24 L80 18" stroke={ink} strokeWidth="3" />
      <rect x="43" y="44" width="14" height="6" fill={ink} />
      <rect x="41" y="60" width="18" height="6" fill={ink} />
      <rect x="30" y="80" width="40" height="6" />
    </g>
  );
}

/** Stella e crescente (Portsmouth — concessione civica storica). */
function StarCrescent({ tone, ink }: Tone) {
  const pts: string[] = [];
  for (let k = 0; k < 16; k++) {
    const r = k % 2 === 0 ? 16 : 6;
    const a = -Math.PI / 2 + (k * Math.PI) / 8;
    pts.push(`${50 + r * Math.cos(a)},${34 + r * Math.sin(a)}`);
  }
  return (
    <g fill={tone}>
      <polygon points={pts.join(' ')} />
      <path d="M28 56 Q28 82 50 86 Q72 82 72 56 Q64 74 50 74 Q36 74 28 56 Z" />
    </g>
  );
}

/** Elefante e castello (Coventry). */
function Elephant({ tone, ink }: Tone) {
  return (
    <g fill={tone}>
      <path d="M22 74 Q20 52 36 46 Q52 40 66 48 Q78 54 76 66 L72 74 L64 74 L64 64 Q56 58 46 62 L46 74 L38 74 L36 64 Q30 66 30 74 Z" />
      <path d="M74 56 Q86 58 84 70 Q78 66 74 66 Z" />
      <rect x="40" y="30" width="20" height="16" />
      {[40, 48, 56].map((x) => (
        <rect key={x} x={x} y="25" width="4" height="6" />
      ))}
      <circle cx="68" cy="54" r="2.2" fill={ink} />
    </g>
  );
}

const EMBLEMS: Record<string, (t: Tone) => React.ReactNode> = {
  Milano: (t) => <Cross {...t} />,
  Torino: (t) => <Bull {...t} />,
  Roma: (t) => <Wolf {...t} />,
  Napoli: (t) => <Horse {...t} />,
  Genova: (t) => <Griffin {...t} />,
  Firenze: (t) => <Lily {...t} />,
  Bologna: (t) => <Towers {...t} />,
  Verona: (t) => <Ladder {...t} />,
  Bergamo: (t) => <Lion {...t} />,
  Udine: (t) => <Eagle {...t} />,
  Palermo: (t) => <Eagle {...t} />,
  Bari: (t) => <Castle {...t} />,
  Cagliari: (t) => <SardCross {...t} />,
  Parma: (t) => <Cross {...t} />,
  Salerno: (t) => <Seahorse {...t} />,
  Perugia: (t) => <Griffin {...t} />,
  Londra: (t) => <SwordCross {...t} />,
  Manchester: (t) => <Bee {...t} />,
  Liverpool: (t) => <Liverbird {...t} />,
  Leeds: (t) => <Owl {...t} />,
  Birmingham: (t) => <Cog {...t} />,
  Newcastle: (t) => <Castle {...t} />,
  Sheffield: (t) => <Rose {...t} />,
  Bristol: (t) => <Ship {...t} />,
  Nottingham: (t) => <Bow {...t} />,
  Southampton: (t) => <Anchor {...t} />,
  Brighton: (t) => <Dolphin {...t} />,
  Leicester: (t) => <Fox {...t} />,
  Sunderland: (t) => <Lighthouse {...t} />,
  Portsmouth: (t) => <StarCrescent {...t} />,
  Norwich: (t) => <Lion {...t} />,
  Coventry: (t) => <Elephant {...t} />,
};

/** L'emblema civico della città, centrato e scalato dal chiamante. */
export function CityEmblem({
  city,
  tone,
  ink,
  x,
  y,
  size,
}: {
  city: string;
  tone: string;
  ink: string;
  x: number;
  y: number;
  size: number;
}) {
  const draw = EMBLEMS[city] ?? ((t: Tone) => <Rose {...t} />);
  const s = size / 100;
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`}>
      {draw({ tone, ink })}
    </g>
  );
}
