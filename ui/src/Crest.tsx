/**
 * Stemmi procedurali — design MINIMAL d'ispirazione storica (richiesta utente):
 * campo pieno nel colore sociale, EMBLEMA CIVICO grande in crema come protagonista,
 * tipografia serif piccola e spaziata, un filo di keyline. Tre famiglie: scudo,
 * tondo, GAGLIARDETTO (la forma più storica del calcio). Niente ornamenti.
 */

import { CityEmblem } from './emblems';
import type { ClubIdentity } from './identity';

const GOLD = '#c9a961';
const CREAM = '#ede5d0';
/** "Inchiostro" dei dettagli incisi negli emblemi: caldo, quasi nero. */
const INK = '#26221c';

const SERIF = "Georgia, 'Times New Roman', serif";

export function Crest({
  id,
  name,
  reputation,
  className = 'h-64 w-64 animate-float drop-shadow-2xl',
}: {
  id: ClubIdentity;
  name: string;
  reputation: number;
  className?: string;
}) {
  const monogram = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  const starred = reputation >= 72;
  const city = id.city.name;

  return (
    <svg viewBox="0 0 220 260" className={className}>
      <title>{name}</title>
      {starred && <Star />}
      {id.crestShape === 'shield' && <ShieldMin id={id} monogram={monogram} city={city} />}
      {id.crestShape === 'circle' && <RoundMin id={id} monogram={monogram} city={city} />}
      {id.crestShape === 'diamond' && <PennantMin id={id} monogram={monogram} city={city} />}
      <YearMark id={id} />
    </svg>
  );
}

/** Pattern minimi sul campo: mezza tinta, filetto diagonale o due righine. */
function FieldPattern({ id, clipId }: { id: ClubIdentity; clipId: string }) {
  if (id.pattern === 'plain') return null;
  return (
    <g clipPath={`url(#${clipId})`}>
      {id.pattern === 'half' && (
        // Velatura, non tinta piatta: l'emblema crema resta leggibile anche
        // quando il secondo colore è bianco/crema (bianconeri, biancorossi…).
        <rect x="110" y="0" width="110" height="260" fill={id.secondary} opacity="0.4" />
      )}
      {id.pattern === 'sash' && (
        <line x1="30" y1="40" x2="190" y2="210" stroke={CREAM} strokeWidth="3" opacity="0.3" />
      )}
      {id.pattern === 'stripes' && (
        <>
          <rect x="58" y="0" width="3" height="260" fill={CREAM} opacity="0.35" />
          <rect x="159" y="0" width="3" height="260" fill={CREAM} opacity="0.35" />
        </>
      )}
    </g>
  );
}

/** Scudo pieno, keyline sottile, emblema grande, monogramma nel cielo. */
function ShieldMin({ id, monogram, city }: { id: ClubIdentity; monogram: string; city: string }) {
  const d = 'M110 26 L186 46 V128 Q186 192 110 222 Q34 192 34 128 V46 Z';
  return (
    <g>
      <path d={d} fill={id.primary} />
      <clipPath id="shield-min">
        <path d={d} />
      </clipPath>
      <FieldPattern id={id} clipId="shield-min" />
      <path
        d={d}
        fill="none"
        stroke={CREAM}
        strokeWidth="1.3"
        opacity="0.55"
        transform="scale(0.93)"
        transform-origin="110 124"
      />
      <text
        x="110"
        y="62"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill={CREAM}
        fontFamily={SERIF}
        letterSpacing="7"
        opacity="0.92"
      >
        {monogram}
      </text>
      <CityEmblem city={city} tone={CREAM} ink={INK} x={110} y={140} size={96} />
    </g>
  );
}

/** Tondo pieno con anello staccato: il badge federale ridotto all'osso. */
function RoundMin({ id, monogram, city }: { id: ClubIdentity; monogram: string; city: string }) {
  return (
    <g>
      <circle cx="110" cy="124" r="92" fill="none" stroke={GOLD} strokeWidth="1.5" opacity="0.9" />
      <circle cx="110" cy="124" r="80" fill={id.primary} />
      <clipPath id="round-min">
        <circle cx="110" cy="124" r="80" />
      </clipPath>
      <FieldPattern id={id} clipId="round-min" />
      <circle cx="110" cy="124" r="72" fill="none" stroke={CREAM} strokeWidth="1" opacity="0.45" />
      <text
        x="110"
        y="70"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill={CREAM}
        fontFamily={SERIF}
        letterSpacing="6"
        opacity="0.92"
      >
        {monogram}
      </text>
      <CityEmblem city={city} tone={CREAM} ink={INK} x={110} y={136} size={88} />
    </g>
  );
}

/** Il gagliardetto: la forma più storica del calcio, con gli occhielli della corda. */
function PennantMin({ id, monogram, city }: { id: ClubIdentity; monogram: string; city: string }) {
  const d = 'M40 32 L180 32 L110 226 Z';
  return (
    <g>
      <path d={d} fill={id.primary} />
      <clipPath id="pennant-min">
        <path d={d} />
      </clipPath>
      <FieldPattern id={id} clipId="pennant-min" />
      <rect x="40" y="32" width="140" height="11" fill={id.secondary} />
      <path
        d={d}
        fill="none"
        stroke={CREAM}
        strokeWidth="1.2"
        opacity="0.5"
        transform="scale(0.92)"
        transform-origin="110 110"
      />
      <circle cx="48" cy="37.5" r="2.6" fill={GOLD} />
      <circle cx="172" cy="37.5" r="2.6" fill={GOLD} />
      <CityEmblem city={city} tone={CREAM} ink={INK} x={110} y={102} size={76} />
      <text
        x="110"
        y="172"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill={CREAM}
        fontFamily={SERIF}
        letterSpacing="5"
        opacity="0.92"
      >
        {monogram}
      </text>
    </g>
  );
}

/** L'anno di fondazione: quattro trattamenti, tutti minimi, in oro antico. */
function YearMark({ id }: { id: ClubIdentity }) {
  const year = String(id.founded);
  const text = (x: number, y: number, size = 12, spacing = 4) => (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={size}
      fontWeight="700"
      fill={GOLD}
      fontFamily={SERIF}
      letterSpacing={spacing}
    >
      {year}
    </text>
  );

  // Il gagliardetto finisce a punta: sotto, gli stili "interni" scalano al piede.
  const isPennant = id.crestShape === 'diamond';

  if (id.yearStyle === 'split' && !isPennant) {
    return (
      <g fontFamily={SERIF} fontWeight="700" fontSize="13" fill={GOLD} opacity="0.85">
        <text x="18" y="130" textAnchor="middle">
          {year.slice(0, 2)}
        </text>
        <text x="202" y="130" textAnchor="middle">
          {year.slice(2)}
        </text>
      </g>
    );
  }
  if (id.yearStyle === 'plaque') {
    return (
      <g>
        <rect
          x="76"
          y="232"
          width="68"
          height="20"
          rx="2"
          fill="none"
          stroke={GOLD}
          strokeWidth="1.2"
        />
        {text(110, 246)}
      </g>
    );
  }
  if (id.yearStyle === 'inset' && !isPennant) {
    return text(110, id.crestShape === 'shield' ? 200 : 196, 11, 5);
  }
  // 'ribbon' (e i casi che al gagliardetto non stanno): anno tra due filetti.
  return (
    <g>
      <line x1="56" y1="242" x2="86" y2="242" stroke={GOLD} strokeWidth="1" />
      <line x1="134" y1="242" x2="164" y2="242" stroke={GOLD} strokeWidth="1" />
      {text(110, 246)}
    </g>
  );
}

/** Stella minima dei blasonati (rep ≥ 72). */
function Star() {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? 8 : 3.4;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    pts.push(`${110 + r * Math.cos(a)},${12 + r * Math.sin(a)}`);
  }
  return <polygon points={pts.join(' ')} fill={GOLD} />;
}
