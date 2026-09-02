/**
 * RosterPack (MODULE_ARCHETYPES §4): contenuto OPZIONALE che VESTE giocatori già
 * generati con profili autorati (nomi inventati). Conserva id, contratti, agenzie e
 * popolazione: zero migrazioni, zero buchi. Puro e rng-free (rumore via hash).
 * Da applicare PRIMA di createSeason (liste ed Elo si formano dopo).
 */

import { type Archetype, type ArchetypeId, archetypeById } from '../core/archetypes.js';
import { clampAttr } from '../core/attributes.js';
import type { Attributes } from '../core/attributes.js';
import type { ClubId } from '../core/ids.js';
import { playerOverall } from '../core/ratings.js';
import type { Personality, Player, Position, PreferredFoot, World } from '../core/types.js';

export interface PackPlayer {
  /** Nome INVENTATO (mai nomi reali — GAME_DESIGN §9.2). */
  name: string;
  age: number;
  /** Codice 3 lettere (ITA, FRA, ARG…). */
  nationality: string;
  position: Position;
  foot: PreferredFoot;
  archetype: ArchetypeId;
  /** Livello complessivo 1-100: gli attributi nascono da qui + bias archetipo. */
  level: number;
  /** Altezza in cm (opzionale): se assente resta derivata (SPEC §19). */
  height?: number;
  potential?: number;
  /** Attributi puntuali che vincono sul generato (es. finishing: 92). */
  standouts?: Record<string, number>;
  traits?: Partial<Personality>;
  /** Cresciuto nel club (vivaio → tifoso probabile, liste). */
  trainedHere?: boolean;
  /** Fascia di fedeltà del profilo: i 'bassa' si rivedono con l'utente. */
  confidence?: 'alta' | 'media' | 'bassa';
}

export interface RosterPack {
  /** Città reale del club (identity) + colore primario del kit per disambiguare. */
  city: string;
  kitPrimary: string;
  /** Solo documentazione umana del bersaglio (es. "nerazzurri"). */
  clubName?: string;
  players: PackPlayer[];
}

const COMMON = [
  'pace',
  'stamina',
  'strength',
  'workRate',
  'positioning',
  'decisions',
  'composure',
] as const;
const OUTFIELD = ['finishing', 'passing', 'tackling', 'dribbling', 'marking'] as const;
const GK = ['reflexes', 'handling', 'aerial', 'oneOnOne'] as const;

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/**
 * Attributi pieni da livello + bias dell'archetipo + rumore hash (±3), clamp 25-99.
 * `standouts` sovrascrivono i singoli valori. Deterministico per (profilo, seedKey).
 */
export function attributesForArchetype(
  position: Position,
  archetypeId: ArchetypeId,
  level: number,
  seedKey: string,
  standouts?: Record<string, number>,
): Attributes {
  const arch: Archetype = archetypeById(archetypeId);
  const names: readonly string[] =
    position === 'GK' ? [...COMMON, ...GK] : [...COMMON, ...OUTFIELD];
  const out: Record<string, number> = {};
  for (const attr of names) {
    const bias = arch.bias[attr] ?? 0;
    const noise = (hash01(`${seedKey}|${attr}`) - 0.5) * 6;
    out[attr] = Math.max(25, Math.min(99, clampAttr(Math.round(level + bias * 14 + noise))));
  }
  for (const [attr, value] of Object.entries(standouts ?? {})) {
    if (names.includes(attr)) out[attr] = Math.max(1, Math.min(99, Math.round(value)));
  }
  return out as unknown as Attributes;
}

export interface PackResult {
  applied: number;
  /** Profili senza un generato dello stesso ruolo disponibile. */
  skipped: string[];
}

/**
 * Vestizione (MODULE_ARCHETYPES §4): per reparto, i migliori giocatori generati prendono
 * i profili di livello più alto. Sovrascrive nome/età/nazionalità/piede/attributi/tratti/
 * potenziale/vivaio; NON tocca id, contratto, agenzia, morale.
 */
export function applyRosterPack(
  world: World,
  clubId: ClubId,
  players: readonly PackPlayer[],
): PackResult {
  const club = world.clubs.get(clubId);
  if (!club) return { applied: 0, skipped: players.map((p) => p.name) };

  const byPosition = new Map<Position, Player[]>();
  for (const pid of club.playerIds) {
    const p = world.players.get(pid);
    if (!p) continue;
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  }
  for (const list of byPosition.values()) {
    list.sort((a, b) => playerOverall(b) - playerOverall(a));
  }

  const sorted = [...players].sort((a, b) => b.level - a.level);
  const skipped: string[] = [];
  let applied = 0;

  for (const profile of sorted) {
    const pool = byPosition.get(profile.position) ?? [];
    const target = pool.shift();
    if (!target) {
      skipped.push(profile.name);
      continue;
    }
    target.name = profile.name;
    target.age = profile.age;
    target.nationality = profile.nationality;
    target.preferredFoot = profile.foot;
    target.attributes = attributesForArchetype(
      profile.position,
      profile.archetype,
      profile.level,
      `${clubId}|${profile.name}`,
      profile.standouts,
    );
    target.height = profile.height;
    const pot = profile.potential ?? profile.level + (profile.age < 24 ? 8 : 0);
    target.potential = Math.max(pot, Math.round(playerOverall(target)));
    if (profile.traits) Object.assign(target.personality, profile.traits);
    target.trainedClubId = profile.trainedHere ? club.id : null;
    applied++;
  }
  return { applied, skipped };
}
