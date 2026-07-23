/**
 * Procedural club identity (UI-side presentation, deterministic from the club name):
 * crest colors/shape, founding year, history text, city map coordinates. No engine RNG.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded pseudo-randoms in [0,1) from a name + salt. */
function rand(name: string, salt: number): number {
  return (hash(`${name}#${salt}`) % 10000) / 10000;
}

export type CityScale = 'piccola' | 'media' | 'grande' | 'metropoli';

export interface GeoCity {
  name: string;
  lat: number;
  lon: number;
  /** Taglia urbana: guida il contesto cittadino attorno allo stadio 3D. */
  size?: CityScale;
}

const CITIES: Record<string, GeoCity[]> = {
  ITA: [
    { name: 'Milano', lat: 45.4642, lon: 9.19, size: 'metropoli' },
    { name: 'Torino', lat: 45.0703, lon: 7.6869, size: 'grande' },
    { name: 'Roma', lat: 41.9028, lon: 12.4964, size: 'metropoli' },
    { name: 'Napoli', lat: 40.8518, lon: 14.2681, size: 'grande' },
    { name: 'Genova', lat: 44.4056, lon: 8.9463, size: 'grande' },
    { name: 'Firenze', lat: 43.7696, lon: 11.2558, size: 'media' },
    { name: 'Bologna', lat: 44.4949, lon: 11.3426, size: 'media' },
    { name: 'Verona', lat: 45.4384, lon: 10.9916, size: 'media' },
    { name: 'Bergamo', lat: 45.6983, lon: 9.6773, size: 'media' },
    { name: 'Udine', lat: 46.0711, lon: 13.2346, size: 'piccola' },
    { name: 'Palermo', lat: 38.1157, lon: 13.3615, size: 'grande' },
    { name: 'Bari', lat: 41.1171, lon: 16.8719, size: 'media' },
    { name: 'Cagliari', lat: 39.2238, lon: 9.1217, size: 'media' },
    { name: 'Parma', lat: 44.8015, lon: 10.3279, size: 'piccola' },
    { name: 'Salerno', lat: 40.6824, lon: 14.7681, size: 'piccola' },
    { name: 'Perugia', lat: 43.1107, lon: 12.3908, size: 'piccola' },
  ],
  ENG: [
    { name: 'Londra', lat: 51.5074, lon: -0.1278, size: 'metropoli' },
    { name: 'Manchester', lat: 53.4808, lon: -2.2426, size: 'metropoli' },
    { name: 'Liverpool', lat: 53.4084, lon: -2.9916, size: 'grande' },
    { name: 'Leeds', lat: 53.8008, lon: -1.5491, size: 'grande' },
    { name: 'Birmingham', lat: 52.4862, lon: -1.8904, size: 'grande' },
    { name: 'Newcastle', lat: 54.9783, lon: -1.6178, size: 'media' },
    { name: 'Sheffield', lat: 53.3811, lon: -1.4701, size: 'media' },
    { name: 'Bristol', lat: 51.4545, lon: -2.5879, size: 'media' },
    { name: 'Nottingham', lat: 52.9548, lon: -1.1581, size: 'media' },
    { name: 'Southampton', lat: 50.9097, lon: -1.4044, size: 'media' },
    { name: 'Brighton', lat: 50.8225, lon: -0.1372, size: 'piccola' },
    { name: 'Leicester', lat: 52.6369, lon: -1.1398, size: 'media' },
    { name: 'Sunderland', lat: 54.9069, lon: -1.3838, size: 'piccola' },
    { name: 'Portsmouth', lat: 50.8198, lon: -1.088, size: 'piccola' },
    { name: 'Norwich', lat: 52.6309, lon: 1.2974, size: 'piccola' },
    { name: 'Coventry', lat: 52.4068, lon: -1.5197, size: 'media' },
  ],
};

/**
 * Palette STORICHE per città (richiesta utente): i colori delle maglie che quella
 * città ha reso celebri — niente nomi, solo cromie — in versione vintage smorzata.
 * Più palette dove la città ha più tradizioni: i club della stessa città pescano
 * maglie diverse, come nella realtà.
 */
const CITY_KITS: Record<string, { p: string; s: string }[]> = {
  Milano: [
    { p: '#8e2f36', s: '#1c1917' }, // rossonero
    { p: '#1f3a68', s: '#141416' }, // nerazzurro
  ],
  Torino: [
    { p: '#7a2430', s: '#e8e2d2' }, // granata
    { p: '#2b2b2e', s: '#e8e2d2' }, // bianconero
  ],
  Roma: [
    { p: '#8f2f3c', s: '#d9a441' }, // giallorosso
    { p: '#6d9dc0', s: '#e8e8e6' }, // biancoceleste
  ],
  Napoli: [{ p: '#2f6b9e', s: '#e8e2d2' }], // azzurro
  Genova: [
    { p: '#8f2f38', s: '#26436e' }, // rossoblù
    { p: '#27548a', s: '#e8e2d2' }, // blucerchiato
  ],
  Firenze: [{ p: '#4f3a6b', s: '#e8e2d2' }], // viola
  Bologna: [{ p: '#8f2f38', s: '#26436e' }], // rossoblù
  Verona: [{ p: '#26436e', s: '#d9b13b' }], // gialloblù
  Bergamo: [{ p: '#1f3a68', s: '#17171a' }], // nerazzurro
  Udine: [{ p: '#2b2b2e', s: '#e8e2d2' }], // bianconero
  Palermo: [{ p: '#b06a72', s: '#1c1917' }], // rosanero
  Bari: [{ p: '#a03a40', s: '#ece4d4' }], // biancorosso
  Cagliari: [{ p: '#8f2f38', s: '#26436e' }], // rossoblù
  Parma: [{ p: '#26436e', s: '#d9b13b' }], // crociato gialloblù
  Salerno: [{ p: '#7a2430', s: '#ece4d4' }], // granata
  Perugia: [{ p: '#8f2430', s: '#ece4d4' }], // rosso grifone
  Londra: [
    { p: '#9c3038', s: '#e8e2d2' }, // rosso
    { p: '#27548a', s: '#e8e2d2' }, // blu
    { p: '#30435c', s: '#e8e2d2' }, // navy/bianco
    { p: '#6b2a38', s: '#79a8c9' }, // claret & blue
  ],
  Manchester: [
    { p: '#9c3038', s: '#17171a' }, // rosso/nero
    { p: '#5f93b8', s: '#e8e2d2' }, // sky blue
  ],
  Liverpool: [
    { p: '#8f2f38', s: '#e8e2d2' }, // rosso
    { p: '#2b4f8e', s: '#e8e2d2' }, // royal blue
  ],
  Leeds: [{ p: '#2b3f66', s: '#d9b13b' }], // blu e oro (i colori antichi)
  Birmingham: [
    { p: '#2b4f8e', s: '#e8e2d2' }, // blu
    { p: '#6b2a38', s: '#79a8c9' }, // claret & blue
  ],
  Newcastle: [{ p: '#232326', s: '#e8e2d2' }], // bianconero
  Sheffield: [
    { p: '#a03a40', s: '#e8e2d2' }, // rosso/bianco
    { p: '#2b4f8e', s: '#e8e2d2' }, // blu/bianco
  ],
  Bristol: [
    { p: '#a03a40', s: '#e8e2d2' }, // rosso
    { p: '#3f6da8', s: '#e8e2d2' }, // quarti blu/bianco
  ],
  Nottingham: [
    { p: '#9c3038', s: '#e8e2d2' }, // rosso garibaldino
    { p: '#232326', s: '#e8e2d2' }, // bianconero
  ],
  Southampton: [{ p: '#a03a40', s: '#e8e2d2' }], // strisce rosse/bianche
  Brighton: [{ p: '#2b4f8e', s: '#e8e2d2' }], // blu/bianco
  Leicester: [{ p: '#2b4f8e', s: '#d9b13b' }], // blu/oro
  Sunderland: [{ p: '#a03a40', s: '#e8e2d2' }], // strisce rosse/bianche
  Portsmouth: [{ p: '#27548a', s: '#d9b13b' }], // blu/oro
  Norwich: [{ p: '#3f6f4f', s: '#c2a13a' }], // verde/giallo
  Coventry: [{ p: '#5f93b8', s: '#e8e2d2' }], // sky blue
};

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: Math.round((h * 60 + 360) % 360), s: s * 100, l: l * 100 };
}

export interface ClubIdentity {
  primary: string;
  secondary: string;
  accent: string;
  /** Tonalità HSL del colore sociale — usata per tingere la mappa della città. */
  hue: number;
  crestShape: 'shield' | 'circle' | 'diamond';
  /** Come lo stemma porta l'anno di fondazione (varietà d'epoca). */
  yearStyle: 'ribbon' | 'plaque' | 'split' | 'inset';
  pattern: 'stripes' | 'half' | 'plain' | 'sash';
  founded: number;
  city: GeoCity;
  /** Contesto urbano attorno allo stadio 3D: taglia della città + carattere del quartiere. */
  cityScale: CityScale;
  district: 'operaio' | 'signorile' | 'storico';
  nickname: string;
  history: string;
  /** Real-city geo positions (MODULE_UI): club structures placed around the city. */
  stadium: GeoCity;
  training: GeoCity;
  sede: GeoCity;
  scouting: GeoCity;
  infermeria: GeoCity;
  giovanile: GeoCity;
}

const NICKS = [
  'i Leoni',
  'gli Aquilotti',
  'i Lupi',
  'i Grifoni',
  'le Rondini',
  'i Tori',
  'i Falchi',
  'gli Orsi',
];

export function clubIdentity(
  name: string,
  reputation: number,
  league: string,
  nation = 'ITA',
): ClubIdentity {
  const pool = CITIES[nation] ?? CITIES.ITA!;
  const city = pool[Math.floor(rand(name, 20) * pool.length)]!;
  // I colori delle maglie storiche della città; club diversi = tradizioni diverse.
  const kits = CITY_KITS[city.name] ?? [{ p: '#8f2f38', s: '#e8e2d2' }];
  const kit = kits[Math.floor(rand(name, 25) * kits.length)]!;
  const pHsl = hexToHsl(kit.p);
  const sHsl = hexToHsl(kit.s);
  // Tinta per mappa/accenti: se il primo colore è quasi neutro (nero), usa il secondo.
  const hue = pHsl.s >= 18 ? pHsl.h : sHsl.s >= 18 ? sHsl.h : 42;
  const accentSat = Math.round(Math.max(32, Math.min(58, pHsl.s >= 18 ? pHsl.s : sHsl.s)));
  const founded = 1897 + Math.floor(rand(name, 3) * 34);
  const nickname = NICKS[Math.floor(rand(name, 4) * NICKS.length)]!;
  const tier = reputation >= 75 ? 'big' : reputation >= 55 ? 'mid' : 'small';
  const voice = Math.floor(rand(name, 13) * 3);

  const VOICES: Record<string, string[]> = {
    big: [
      `Fondato nel ${founded} da un gruppo di industriali e studenti, il ${name} è da decenni l'orgoglio di ${city.name}. "${nickname}", come li chiama la città intera, hanno scritto pagine memorabili del calcio nazionale: lo stadio che ribolle nelle notti importanti è tra i più caldi del Paese, e la piazza non accetta niente meno che la vittoria.`,
      `A ${city.name} il calcio ha un solo nome dal ${founded}: ${name}. Bacheca pesante, tifo che non perdona, dirigenze che vanno e vengono ma un'unica ossessione — vincere. Gli avversari li temono, i giornali li inseguono, e ogni estate il mercato de "${nickname}" tiene la città col fiato sospeso.`,
      `C'è chi dice che a ${city.name} prima si tifa e poi si respira. Dal ${founded} il ${name} è istituzione, salotto buono e polveriera insieme: "${nickname}" riempiono lo stadio anche in amichevole, e un derby perso qui si sconta per mesi. Chi indossa questa maglia impara in fretta cosa significa la pressione.`,
    ],
    mid: [
      `Il ${name} nasce nel ${founded} nei quartieri operai di ${city.name}. Squadra di tradizione e orgoglio, "${nickname}" hanno vissuto stagioni d'oro e retrocessioni dolorose, senza mai perdere il legame viscerale con la propria gente. L'ambizione di tornare grandi è il motore di ogni estate.`,
      `Un vecchio adagio di ${city.name} recita: "${nickname} si nasce, non si diventa". Dal ${founded} il ${name} vive di cicli — presidenti visionari, allenatori rivelazione, qualche annata da sogno e brusche cadute. È la classica squadra che nessuno vuole incontrare quando le cose girano.`,
      `Fondato nel ${founded} da ferrovieri e commercianti, il ${name} è la storia di ${city.name} scritta sull'erba. Lo stadio è vecchio stile, la curva sa di famiglia, e "${nickname}" alternano da un secolo la voglia di grandezza alla paura di scendere. Piazza esigente ma giusta.`,
    ],
    small: [
      `Fondato nel ${founded} attorno al circolo parrocchiale di ${city.name}, il ${name} è la classica provinciale che vive di passione. "${nickname}" giocano in uno stadio raccolto dove ogni punto strappato alle grandi vale una festa. Qui i giovani trovano spazio e la piazza chiede solo sudore.`,
      `Dicono che a ${city.name} il campo del ${name} l'abbiano spianato i tifosi stessi, nel ${founded}, con badili e carriole. Vero o no, "${nickname}" sono rimasti quella cosa lì: una famiglia. Pochi soldi, tanto vivaio, e la domenica il paese intero sugli spalti.`,
      `Il ${name} esiste dal ${founded} e a ${city.name} è più di una squadra: è il bar, la piazza, il campanile. "${nickname}" hanno visto più campionati di provincia che riflettori, ma quando arriva la grande in coppa, lo stadio diventa una bolgia che non si dimentica.`,
    ],
  };
  const historyBits = { pick: VOICES[tier]![voice]! } as const;

  const stadium = {
    name: 'Stadio',
    lat: city.lat + (rand(name, 7) - 0.5) * 0.03,
    lon: city.lon + (rand(name, 8) - 0.5) * 0.045,
  };
  const training = {
    name: 'Centro sportivo',
    lat: city.lat + (rand(name, 9) - 0.5) * 0.06,
    lon: city.lon + (rand(name, 10) - 0.5) * 0.09,
  };

  return {
    primary: kit.p,
    hue,
    secondary: kit.s,
    accent: `hsl(${hue} ${accentSat}% 64%)`,
    crestShape: (['shield', 'circle', 'diamond'] as const)[Math.floor(rand(name, 5) * 3)]!,
    yearStyle: (['ribbon', 'plaque', 'split', 'inset'] as const)[Math.floor(rand(name, 12) * 4)]!,
    pattern: (['stripes', 'half', 'plain', 'sash'] as const)[Math.floor(rand(name, 6) * 4)]!,
    founded,
    city,
    cityScale: city.size ?? 'media',
    // Inghilterra: i blasonati vivono nel quartiere signorile (Chelsea-style),
    // gli altri tra le terraced houses operaie; Italia: centro storico sempre.
    district: nation === 'ENG' ? (reputation >= 70 ? 'signorile' : 'operaio') : 'storico',
    nickname,
    history: `${historyBits.pick} Oggi milita in ${league}.`,
    stadium,
    training,
    sede: {
      name: 'Sede del club',
      lat: city.lat + (rand(name, 14) - 0.5) * 0.016,
      lon: city.lon + (rand(name, 15) - 0.5) * 0.024,
    },
    scouting: {
      name: 'Palazzina scouting',
      lat: city.lat + (rand(name, 16) - 0.5) * 0.04,
      lon: city.lon + (rand(name, 17) - 0.5) * 0.06,
    },
    infermeria: {
      // Accanto allo stadio, come le cliniche convenzionate dei club veri.
      lat: stadium.lat + (rand(name, 18) - 0.5) * 0.012,
      lon: stadium.lon + 0.008 + rand(name, 19) * 0.008,
      name: 'Infermeria',
    },
    giovanile: {
      // Il vivaio cresce all'ombra del centro sportivo.
      lat: training.lat - 0.006 - rand(name, 21) * 0.006,
      lon: training.lon + (rand(name, 22) - 0.5) * 0.014,
      name: 'Settore giovanile',
    },
  };
}

/**
 * Anti-sovrapposizione etichette: i tooltip sono bande orizzontali, quindi basta
 * garantire una distanza minima in latitudine tra i punti perché non collidano mai.
 * Ordina per latitudine e spinge in su i punti troppo vicini (deterministico).
 */
export function spreadLat<T extends { lat: number }>(points: T[], minLat: number): T[] {
  const sorted = [...points].sort((a, b) => a.lat - b.lat);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.lat - prev.lat < minLat) cur.lat = prev.lat + minLat;
  }
  return points;
}

/** President "type" from his hidden traits — presentation label only. */
export function presidentType(p: {
  ambition: number;
  composure: number;
  temperament: number;
}): string {
  if (p.temperament >= 0.6) return 'Fumantino';
  if (p.ambition >= 0.65) return 'Ambizioso';
  if (p.composure >= 0.65) return 'Stratega paziente';
  if (p.ambition <= 0.35) return 'Conservatore';
  return 'Equilibrato';
}
