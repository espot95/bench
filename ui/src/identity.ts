/**
 * Procedural club identity (UI-side presentation, deterministic from the club name):
 * crest colors/shape, founding year, history text, city map coordinates. No engine RNG.
 */

import { CLUB_LORE } from './lore';

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
    { name: 'Lecce', lat: 40.3515, lon: 18.175, size: 'media' },
    { name: 'Empoli', lat: 43.7189, lon: 10.947, size: 'piccola' },
    { name: 'Monza', lat: 45.5845, lon: 9.2744, size: 'media' },
    { name: 'Como', lat: 45.8081, lon: 9.0852, size: 'piccola' },
    { name: 'Brescia', lat: 45.5416, lon: 10.2118, size: 'media' },
    { name: 'Venezia', lat: 45.4408, lon: 12.3155, size: 'media' },
    { name: 'Modena', lat: 44.6471, lon: 10.9252, size: 'media' },
    { name: 'Cremona', lat: 45.1332, lon: 10.0227, size: 'piccola' },
    { name: 'Pescara', lat: 42.4618, lon: 14.2161, size: 'media' },
    { name: 'Catania', lat: 37.5079, lon: 15.083, size: 'grande' },
    { name: 'Cosenza', lat: 39.2983, lon: 16.2539, size: 'piccola' },
    { name: 'Terni', lat: 42.5636, lon: 12.6427, size: 'piccola' },
    { name: 'Cesena', lat: 44.1391, lon: 12.2431, size: 'piccola' },
    { name: 'Ascoli', lat: 42.854, lon: 13.5749, size: 'piccola' },
    { name: 'Pisa', lat: 43.7228, lon: 10.4017, size: 'piccola' },
    { name: 'Livorno', lat: 43.5485, lon: 10.3106, size: 'media' },
    { name: 'Spezia', lat: 44.1024, lon: 9.8241, size: 'piccola' },
    { name: 'Padova', lat: 45.4064, lon: 11.8768, size: 'media' },
    { name: 'Vicenza', lat: 45.5455, lon: 11.5354, size: 'media' },
    { name: 'Foggia', lat: 41.4622, lon: 15.5446, size: 'media' },
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
    { name: 'Wolverhampton', lat: 52.587, lon: -2.1288, size: 'media' },
    { name: 'Bournemouth', lat: 50.7192, lon: -1.8808, size: 'media' },
    { name: 'Stoke', lat: 53.0027, lon: -2.1794, size: 'media' },
    { name: 'Burnley', lat: 53.7893, lon: -2.2483, size: 'piccola' },
    { name: 'Blackburn', lat: 53.7486, lon: -2.4823, size: 'piccola' },
    { name: 'Bolton', lat: 53.5769, lon: -2.4282, size: 'media' },
    { name: 'Preston', lat: 53.7632, lon: -2.7031, size: 'media' },
    { name: 'Hull', lat: 53.7676, lon: -0.3274, size: 'media' },
    { name: 'Middlesbrough', lat: 54.5742, lon: -1.235, size: 'media' },
    { name: 'Derby', lat: 52.9225, lon: -1.4746, size: 'media' },
    { name: 'Ipswich', lat: 52.0567, lon: 1.1482, size: 'piccola' },
    { name: 'Watford', lat: 51.6565, lon: -0.3903, size: 'piccola' },
    { name: 'Luton', lat: 51.8787, lon: -0.42, size: 'piccola' },
    { name: 'Reading', lat: 51.4543, lon: -0.9781, size: 'media' },
    { name: 'Plymouth', lat: 50.3755, lon: -4.1427, size: 'media' },
    { name: 'Barnsley', lat: 53.5526, lon: -1.4797, size: 'piccola' },
  ],
};

/**
 * Coordinate VERE dello stadio principale di ogni città (richiesta utente: niente
 * stadi in mezzo al mare). Più club nella stessa città condividono l'impianto con un
 * piccolo scarto deterministico.
 */
const STADIUM_COORDS: Record<string, [number, number]> = {
  Milano: [45.4781, 9.124], // San Siro
  Torino: [45.1096, 7.6413],
  Roma: [41.9339, 12.4547], // Olimpico
  Napoli: [40.828, 14.193],
  Genova: [44.4164, 8.9524], // Marassi
  Firenze: [43.7809, 11.2822],
  Bologna: [44.4922, 11.3098],
  Verona: [45.4353, 10.9686],
  Bergamo: [45.7089, 9.6807],
  Udine: [46.0816, 13.2001],
  Palermo: [38.1519, 13.3427],
  Bari: [41.0849, 16.8402],
  Cagliari: [39.1996, 9.1375],
  Parma: [44.795, 10.3384],
  Salerno: [40.6455, 14.8236],
  Perugia: [43.1061, 12.3565],
  Lecce: [40.3327, 18.1963], // Via del Mare
  Empoli: [43.7266, 10.9553],
  Monza: [45.5828, 9.3083],
  Como: [45.8064, 9.0725], // Sinigaglia, in riva al lago
  Brescia: [45.562, 10.235],
  Venezia: [45.4276, 12.3646], // Penzo, Sant'Elena
  Modena: [44.637, 10.933],
  Cremona: [45.14, 10.0353],
  Pescara: [42.4499, 14.2321],
  Catania: [37.5163, 15.0648],
  Cosenza: [39.3086, 16.2432],
  Terni: [42.558, 12.658],
  Cesena: [44.1414, 12.226],
  Ascoli: [42.8557, 13.5919],
  Pisa: [43.7266, 10.4056],
  Livorno: [43.5299, 10.3242],
  Spezia: [44.1128, 9.8129],
  Padova: [45.418, 11.8497], // Euganeo
  Vicenza: [45.555, 11.561],
  Foggia: [41.452, 15.533],
  Londra: [51.556, -0.2795], // Wembley
  Manchester: [53.4631, -2.2913],
  Liverpool: [53.4308, -2.9608],
  Leeds: [53.7778, -1.5721],
  Birmingham: [52.5092, -1.8847],
  Newcastle: [54.9756, -1.6216],
  Sheffield: [53.4115, -1.5006],
  Bristol: [51.44, -2.6202],
  Nottingham: [52.9399, -1.1327],
  Southampton: [50.9058, -1.3911],
  Brighton: [50.8616, -0.0837],
  Leicester: [52.6204, -1.1422],
  Sunderland: [54.9146, -1.3882],
  Portsmouth: [50.7964, -1.0639],
  Norwich: [52.6222, 1.3092],
  Coventry: [52.4481, -1.4956],
  Wolverhampton: [52.5903, -2.1304], // Molineux
  Bournemouth: [50.7352, -1.8384],
  Stoke: [52.9884, -2.1755],
  Burnley: [53.789, -2.2302], // Turf Moor
  Blackburn: [53.7286, -2.4893],
  Bolton: [53.5805, -2.5355],
  Preston: [53.7722, -2.6881], // Deepdale
  Hull: [53.7466, -0.3679],
  Middlesbrough: [54.5781, -1.217], // Riverside
  Derby: [52.915, -1.4471],
  Ipswich: [52.055, 1.1446],
  Watford: [51.6498, -0.4016],
  Luton: [51.8842, -0.4316],
  Reading: [51.4222, -0.9828],
  Plymouth: [50.3881, -4.1509], // Home Park
  Barnsley: [53.5522, -1.4676], // Oakwell
};

/**
 * Palette STORICHE per città (richiesta utente): i colori delle maglie che quella
 * città ha reso celebri — niente nomi, solo cromie — in versione vintage smorzata.
 * Più palette dove la città ha più tradizioni: i club della stessa città pescano
 * maglie diverse, come nella realtà.
 */
const CITY_KITS: Record<string, { p: string; s: string; nick: string }[]> = {
  Milano: [
    { p: '#8e2f36', s: '#1c1917', nick: 'Rossoneri' },
    { p: '#1f3a68', s: '#141416', nick: 'Nerazzurri' },
  ],
  Torino: [
    { p: '#7a2430', s: '#e8e2d2', nick: 'Granata' },
    { p: '#2b2b2e', s: '#e8e2d2', nick: 'Bianconeri' },
  ],
  Roma: [
    { p: '#8f2f3c', s: '#d9a441', nick: 'Giallorossi' },
    { p: '#6d9dc0', s: '#e8e8e6', nick: 'Biancocelesti' },
  ],
  Napoli: [{ p: '#2f6b9e', s: '#e8e2d2', nick: 'Azzurri' }],
  Genova: [
    { p: '#8f2f38', s: '#26436e', nick: 'Rossoblù' },
    { p: '#27548a', s: '#e8e2d2', nick: 'Blucerchiati' },
  ],
  Firenze: [{ p: '#4f3a6b', s: '#e8e2d2', nick: 'Viola' }],
  Bologna: [{ p: '#8f2f38', s: '#26436e', nick: 'Rossoblù' }],
  Verona: [{ p: '#26436e', s: '#d9b13b', nick: 'Gialloblù' }],
  Bergamo: [{ p: '#1f3a68', s: '#17171a', nick: 'Nerazzurri' }],
  Udine: [{ p: '#2b2b2e', s: '#e8e2d2', nick: 'Bianconeri' }],
  Palermo: [{ p: '#b06a72', s: '#1c1917', nick: 'Rosanero' }],
  Bari: [{ p: '#a03a40', s: '#ece4d4', nick: 'Biancorossi' }],
  Cagliari: [{ p: '#8f2f38', s: '#26436e', nick: 'Rossoblù' }],
  Parma: [{ p: '#26436e', s: '#d9b13b', nick: 'Crociati' }],
  Salerno: [{ p: '#7a2430', s: '#ece4d4', nick: 'Granata' }],
  Perugia: [{ p: '#8f2430', s: '#ece4d4', nick: 'Biancorossi' }],
  Lecce: [{ p: '#8f2f3c', s: '#d9a441', nick: 'Giallorossi' }],
  Empoli: [{ p: '#2f6b9e', s: '#e8e2d2', nick: 'Azzurri' }],
  Monza: [{ p: '#a03a40', s: '#ece4d4', nick: 'Biancorossi' }],
  Como: [{ p: '#27548a', s: '#e8e2d2', nick: 'Azzurri' }],
  Brescia: [{ p: '#3f6da8', s: '#e8e2d2', nick: 'Biancazzurri' }],
  Venezia: [{ p: '#1f2a24', s: '#c9803a', nick: 'Arancioneroverdi' }],
  Modena: [{ p: '#c2a13a', s: '#26436e', nick: 'Gialloblù' }],
  Cremona: [{ p: '#8f2f38', s: '#8a8a8f', nick: 'Grigiorossi' }],
  Pescara: [{ p: '#3f6da8', s: '#e8e2d2', nick: 'Biancazzurri' }],
  Catania: [{ p: '#8f2f38', s: '#27548a', nick: 'Rossazzurri' }],
  Cosenza: [{ p: '#8f2f38', s: '#26436e', nick: 'Rossoblù' }],
  Terni: [{ p: '#8f2f38', s: '#3f6f4f', nick: 'Rossoverdi' }],
  Cesena: [{ p: '#2b2b2e', s: '#e8e2d2', nick: 'Bianconeri' }],
  Ascoli: [{ p: '#2b2b2e', s: '#e8e2d2', nick: 'Bianconeri' }],
  Pisa: [{ p: '#1f3a68', s: '#17171a', nick: 'Nerazzurri' }],
  Livorno: [{ p: '#7a2430', s: '#e8e2d2', nick: 'Amaranto' }],
  Spezia: [{ p: '#232326', s: '#e8e2d2', nick: 'Bianchi' }],
  Padova: [{ p: '#a03a40', s: '#ece4d4', nick: 'Biancoscudati' }],
  Vicenza: [{ p: '#a03a40', s: '#ece4d4', nick: 'Biancorossi' }],
  Foggia: [{ p: '#8e2f36', s: '#1c1917', nick: 'Rossoneri' }],
  Londra: [
    { p: '#9c3038', s: '#e8e2d2', nick: 'Reds' },
    { p: '#27548a', s: '#e8e2d2', nick: 'Blues' },
    { p: '#30435c', s: '#e8e2d2', nick: 'Whites' },
    { p: '#6b2a38', s: '#79a8c9', nick: 'Claret' },
    { p: '#3f6da8', s: '#e8e2d2', nick: 'Hoops' },
  ],
  Manchester: [
    { p: '#9c3038', s: '#17171a', nick: 'Reds' },
    { p: '#5f93b8', s: '#e8e2d2', nick: 'Sky Blues' },
  ],
  Liverpool: [
    { p: '#8f2f38', s: '#e8e2d2', nick: 'Reds' },
    { p: '#2b4f8e', s: '#e8e2d2', nick: 'Royal Blues' },
  ],
  Leeds: [{ p: '#30435c', s: '#e8e2d2', nick: 'Whites' }],
  Birmingham: [
    { p: '#2b4f8e', s: '#e8e2d2', nick: 'Blues' },
    { p: '#6b2a38', s: '#79a8c9', nick: 'Claret' },
  ],
  Newcastle: [{ p: '#232326', s: '#e8e2d2', nick: 'Black & Whites' }],
  Sheffield: [
    { p: '#a03a40', s: '#e8e2d2', nick: 'Reds' },
    { p: '#2b4f8e', s: '#e8e2d2', nick: 'Blues' },
  ],
  Bristol: [
    { p: '#a03a40', s: '#e8e2d2', nick: 'Reds' },
    { p: '#3f6da8', s: '#e8e2d2', nick: 'Blue Quarters' },
  ],
  Nottingham: [
    { p: '#9c3038', s: '#e8e2d2', nick: 'Reds' },
    { p: '#232326', s: '#e8e2d2', nick: 'Black & Whites' },
  ],
  Southampton: [{ p: '#a03a40', s: '#e8e2d2', nick: 'Red & Whites' }],
  Brighton: [{ p: '#2b4f8e', s: '#e8e2d2', nick: 'Blue & Whites' }],
  Leicester: [{ p: '#2b4f8e', s: '#d9b13b', nick: 'Blues' }],
  Sunderland: [{ p: '#a03a40', s: '#e8e2d2', nick: 'Red & Whites' }],
  Portsmouth: [{ p: '#27548a', s: '#d9b13b', nick: 'Blue & Golds' }],
  Norwich: [{ p: '#c2a13a', s: '#3f6f4f', nick: 'Yellows' }],
  Coventry: [{ p: '#5f93b8', s: '#e8e2d2', nick: 'Sky Blues' }],
  Wolverhampton: [{ p: '#a8792c', s: '#1c1917', nick: 'Old Golds' }],
  Bournemouth: [{ p: '#8f2f38', s: '#17171a', nick: 'Cherry Reds' }],
  Stoke: [{ p: '#a03a40', s: '#e8e2d2', nick: 'Red Stripes' }],
  Burnley: [{ p: '#6b2a38', s: '#79a8c9', nick: 'Clarets' }],
  Blackburn: [{ p: '#2b4f8e', s: '#e8e2d2', nick: 'Blue & Whites' }],
  Bolton: [{ p: '#30435c', s: '#e8e2d2', nick: 'Whites' }],
  Preston: [{ p: '#30435c', s: '#e8e2d2', nick: 'Lilywhites' }],
  Hull: [{ p: '#c28a2c', s: '#1c1917', nick: 'Amber & Blacks' }],
  Middlesbrough: [{ p: '#8f2f38', s: '#e8e2d2', nick: 'Reds' }],
  Derby: [{ p: '#232326', s: '#e8e2d2', nick: 'Black & Whites' }],
  Ipswich: [{ p: '#2b4f8e', s: '#e8e2d2', nick: 'Blues' }],
  Watford: [{ p: '#c2a13a', s: '#1c1917', nick: 'Yellows' }],
  Luton: [{ p: '#b05f2c', s: '#2b3f66', nick: 'Oranges' }],
  Reading: [{ p: '#27548a', s: '#e8e2d2', nick: 'Blue Hoops' }],
  Plymouth: [{ p: '#3f6f4f', s: '#e8e2d2', nick: 'Greens' }],
  Barnsley: [{ p: '#a03a40', s: '#e8e2d2', nick: 'Reds' }],
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
  /** Ufficio Commerciale (impero): il portale verso il planisfero dell'influenza. */
  ufficio: GeoCity;
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
  // Nomi "Città Colori" (richiesta utente): la città è quella VERA nel nome e la
  // maglia è quella dell'appellativo (Milano Rossoneri veste SEMPRE rossonero).
  // I nomi di fantasia dei vecchi salvataggi cadono sul sorteggio deterministico.
  const [cityWord = '', ...colorWords] = name.split(' ');
  const colors = colorWords.join(' ');
  const namedCity = pool.find((c) => c.name === cityWord) ?? null;
  const city = namedCity ?? pool[Math.floor(rand(name, 20) * pool.length)]!;
  const kits = CITY_KITS[city.name] ?? [{ p: '#8f2f38', s: '#e8e2d2', nick: '' }];
  const kit =
    (namedCity ? kits.find((k) => k.nick === colors) : null) ??
    kits[Math.floor(rand(name, 25) * kits.length)]!;
  const pHsl = hexToHsl(kit.p);
  const sHsl = hexToHsl(kit.s);
  // Tinta per mappa/accenti: se il primo colore è quasi neutro (nero), usa il secondo.
  const hue = pHsl.s >= 18 ? pHsl.h : sHsl.s >= 18 ? sHsl.h : 42;
  const accentSat = Math.round(Math.max(32, Math.min(58, pHsl.s >= 18 ? pHsl.s : sHsl.s)));
  // La storia VERA della tradizione (richiesta utente): anno di fondazione reale
  // e racconto che evoca il club corrispondente — senza nomi propri reali.
  const lore = namedCity ? CLUB_LORE[name] : undefined;
  const founded = lore?.founded ?? 1897 + Math.floor(rand(name, 3) * 34);
  // Il soprannome sono i COLORI, come nella realtà ("gli Azzurri", "the Reds");
  // gli animali restano per i club di fantasia dei vecchi salvataggi.
  const nickname =
    namedCity && colors
      ? nation === 'ENG'
        ? `the ${colors}`
        : /^[aeiou]/i.test(colors)
          ? `gli ${colors}`
          : `i ${colors}`
      : NICKS[Math.floor(rand(name, 4) * NICKS.length)]!;
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

  // Lo stadio sta alle coordinate VERE dell'impianto cittadino (mai in mare);
  // club diversi della stessa città si scostano di poco, deterministicamente.
  const realStadium = STADIUM_COORDS[city.name];
  const stadium = realStadium
    ? {
        name: 'Stadio',
        lat: realStadium[0] + (rand(name, 7) - 0.5) * 0.004,
        lon: realStadium[1] + (rand(name, 8) - 0.5) * 0.006,
      }
    : {
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
    history: `${lore?.story ?? historyBits.pick} Oggi milita in ${league}.`,
    stadium,
    training,
    sede: {
      name: 'Sede del club',
      lat: city.lat + (rand(name, 14) - 0.5) * 0.016,
      lon: city.lon + (rand(name, 15) - 0.5) * 0.024,
    },
    ufficio: {
      // In centro, a due passi dalla sede: da qui si guarda il mondo.
      name: 'Ufficio Commerciale',
      lat: city.lat + (rand(name, 23) - 0.5) * 0.02,
      lon: city.lon + (rand(name, 24) - 0.5) * 0.03,
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
