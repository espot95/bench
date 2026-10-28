/**
 * UI-side game session (SHELL: wires the pure engine, no game logic — MODULE_UI).
 * Mirrors the manage-loop essentials for the MANAGER career, in the browser.
 */

import { leagueOfClub, nationOfClub } from '../../../src/core/types';
import type { KitDesign, KitPattern, KitStyle } from '../../../src/core/types';
import { hasFeature, launchKitDeal } from '../../../src/finances/marketing';
import { clubIdentity } from '../identity';
import { gazzetta, hashStr, refreshTreasury } from './shared';

import type { GameSession } from '../game';
import { ensureMarketing } from './marketing';

// ---- ATELIER DELLE DIVISE (E): editor, proposte sponsor, verdetto, archivio ----

/** I colori sociali del club (l'ancora della fedeltà). */
function identityColors(s: GameSession): { primary: string; secondary: string } {
  const league = leagueOfClub(s.world, s.club.id);
  const nation = nationOfClub(s.world, s.club.id)?.code ?? 'ITA';
  const id = clubIdentity(s.club.name, s.club.reputation, league.name, nation);
  return { primary: id.primary, secondary: id.secondary };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [
    Number.parseInt(v.slice(0, 2), 16) || 0,
    Number.parseInt(v.slice(2, 4), 16) || 0,
    Number.parseInt(v.slice(4, 6), 16) || 0,
  ];
}

function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 441.7;
}

/** Fedeltà [0..1] della divisa ai colori sociali (corpo+dettaglio, il migliore dei versi). */
export function kitFidelity(s: GameSession, design: KitDesign): number {
  const id = identityColors(s);
  const dritta =
    (colorDist(design.primary, id.primary) + colorDist(design.secondary, id.secondary)) / 2;
  const rovescia =
    (colorDist(design.primary, id.secondary) + colorDist(design.secondary, id.primary)) / 2;
  return Math.max(0, 1 - Math.min(dritta, rovescia) * 1.6);
}

/** Com'era quell'annata? Per la rievocazione: oro, buona o anonima. */
export function annataOf(s: GameSession, year: number): { label: string; golden: boolean } | null {
  const e = (s.annals ?? []).find((a) => a.year === year);
  if (!e) return null;
  if (e.cupWon && e.position === 1 && e.tier === 1) return { label: 'DOPPIETTA', golden: true };
  if (e.position === 1 && e.tier === 1) return { label: 'campioni', golden: true };
  if (e.cupWon) return { label: 'coppa vinta', golden: true };
  if (e.promoted) return { label: 'promozione', golden: true };
  if (e.relegated) return { label: 'retrocessione', golden: false };
  if (e.position <= 4) return { label: `${e.position}º posto`, golden: false };
  return { label: `${e.position}º posto`, golden: false };
}

const KIT_PATTERNS: readonly KitPattern[] = [
  'tinta',
  'palato',
  'palatoSottile',
  'fasciato',
  'fasciaUnica',
  'sash',
  'bandaSottile',
  'mezzo',
  'quarti',
  'croce',
  'scacchi',
  'rombi',
  'vstorica',
  'sfumato',
  'spallato',
  'palaCentrale',
  'gessato',
  'cerchiato',
  'diagonaleDoppia',
  'metaOrizzontale',
  'geometrico90',
  'saetta',
  'onda',
  'doppiaV',
] as const;

/** Le 3 proposte dello sponsor tecnico (deterministiche da brand+anno). */
function sponsorKitProposals(s: GameSession): { brandName: string; designs: KitDesign[] } | null {
  const tech =
    (s.club.sponsors ?? []).find((c) => c.slot === 'tecnico') ??
    (s.club.sponsors ?? []).find((c) => c.slot === 'maglia');
  if (!tech) return null;
  const id = identityColors(s);
  const shade = (hex: string, f: number) => {
    const [r, g, b] = hexToRgb(hex);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `#${c(r).toString(16).padStart(2, '0')}${c(g).toString(16).padStart(2, '0')}${c(b).toString(16).padStart(2, '0')}`;
  };
  const designs: KitDesign[] = [0, 1, 2].map((i) => {
    const h = hashStr(`${tech.brandId}|kit|${s.year}|${i}`);
    const pattern = KIT_PATTERNS[h % KIT_PATTERNS.length] ?? 'palato';
    const flip = h % 2 === 0;
    return {
      pattern,
      primary: flip ? id.primary : id.secondary,
      secondary: flip ? id.secondary : id.primary,
      sleeves: i === 2 ? shade(id.primary, 0.55) : flip ? id.primary : id.secondary,
      collar: i === 1 ? '#f5f5f4' : shade(id.secondary, 0.7),
      style: (['moderno', 'storico', 'creativo'] as const)[i % 3] as KitStyle,
      origin: 'sponsor',
    };
  });
  return { brandName: tech.brandName, designs };
}

/** La vista dell'Atelier: maglia dell'anno, archivio con le annate, proposte sponsor. */
export function kitAtelierView(s: GameSession) {
  const m = ensureMarketing(s);
  const kits = m.kits ?? { archive: [] };
  return {
    owned: hasFeature(s.club, 'divise'),
    launched: kits.current?.year === s.year,
    current: kits.current ?? null,
    identity: identityColors(s),
    sponsorName: (s.club.sponsors ?? []).find((c) => c.slot === 'maglia')?.brandName ?? null,
    proposals: sponsorKitProposals(s),
    archive: [...kits.archive]
      .reverse()
      .slice(0, 12)
      .map((e) => ({
        year: e.year,
        design: e.design,
        verdictPct: e.verdictPct,
        annata: annataOf(s, e.year),
      })),
  };
}

/** Lancia la divisa dell'anno: verdetto della piazza, incasso merch, archivio. */
export function launchKit(s: GameSession, design: KitDesign): string {
  if (!hasFeature(s.club, 'divise')) return "Prima serve l'Atelier delle divise.";
  ensureMarketing(s);
  const golden =
    design.origin === 'rievocazione' && design.sourceYear !== undefined
      ? (annataOf(s, design.sourceYear)?.golden ?? false)
      : false;
  const res = launchKitDeal(s.world, s.club, design, s.year, {
    fidelity: kitFidelity(s, design),
    golden,
  });
  if (!res) return 'La maglia di quest’anno è già stata lanciata: la prossima all’estate.';
  refreshTreasury(s);
  const rievoca =
    design.origin === 'rievocazione' && design.sourceYear !== undefined
      ? ` La rievocazione del ${design.sourceYear} ${golden ? 'fa impazzire i nostalgici' : 'lascia qualche alzata di spalle'}.`
      : '';
  gazzetta(
    s,
    0,
    res.verdict === 'amore'
      ? `NUOVA MAGLIA (${design.style}): la piazza la ama — ${(res.income / 1e6).toFixed(1)}M di merchandising al lancio.${rievoca}`
      : res.verdict === 'fischi'
        ? `Nuova maglia (${design.style}): fischi dalla curva. Vende comunque ${(res.income / 1e6).toFixed(1)}M.${rievoca}`
        : `Nuova maglia (${design.style}): accoglienza tiepida, ${(res.income / 1e6).toFixed(1)}M al lancio.${rievoca}`,
  );
  return res.verdict === 'amore'
    ? `La piazza la AMA (${res.verdictPct}/100): +${(res.income / 1e6).toFixed(1)}M di merch.`
    : res.verdict === 'fischi'
      ? `Fischi (${res.verdictPct}/100)... ma ${(res.income / 1e6).toFixed(1)}M entrano comunque.`
      : `Tiepida (${res.verdictPct}/100): ${(res.income / 1e6).toFixed(1)}M di merch.`;
}

/** Prezzo base del biglietto in € (richiesta utente); null = torna al default di lega. */
