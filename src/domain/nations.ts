/**
 * Nation registry and nationality/EU classification (SPEC §14.1-§14.2). Pure data + helpers.
 * The world's active nations are built here and stored on `World.nations`; roster rules and
 * EU status live on each `Nation`.
 */

import { type NationId, asNationId } from './ids.js';
import type { Nation, RosterRules } from './types.js';

/** Nationality codes that are EU members (for the extra-comunitari classification). */
export const EU_NATIONALITIES: ReadonlySet<string> = new Set([
  'ITA',
  'FRA',
  'GER',
  'ESP',
  'POR',
  'NED',
  'BEL',
  'CRO',
]);
// Non-EU (of our pool): BRA, ARG, ENG, SRB, MAR, SEN, URU, COL. Note ENG is a footballing
// nation but not an EU member — post-Brexit, English players are extra-comunitari abroad.

export function isEuNationality(nationality: string): boolean {
  return EU_NATIONALITIES.has(nationality);
}

/** How a player's nationality is seen from a given nation (SPEC §14.2). */
export type ForeignerClass = 'home' | 'eu' | 'nonEu';

/**
 * Classify a player's nationality relative to a nation.
 * - `home`  : same as the nation's home nationality (no restriction).
 * - `eu`    : a foreigner, but from an EU country *and the nation is EU* → comunitario.
 * - `nonEu` : counts against the non-EU cap. For a non-EU nation (England) **every** foreigner
 *             is non-EU; for an EU nation (Italy) only genuinely extra-EU nationalities are.
 */
export function classifyForNation(nation: Nation, nationality: string): ForeignerClass {
  if (nationality === nation.homeNationality) return 'home';
  if (nation.euMember && isEuNationality(nationality)) return 'eu';
  return 'nonEu';
}

/** Serie A-style quotas: 25-man list, ≥8 nation-trained (≥4 club-trained), 2 extra-comunitari. */
const ITALY_RULES: RosterRules = {
  enabled: true,
  listSize: 25,
  minGoalkeepers: 2,
  minNationTrained: 8,
  minClubTrained: 4,
  under22Age: 22,
  nonEuCap: 2,
  minPlayAge: 18,
};

/**
 * England: homegrown rule (≥8 home-grown in 25, U21 exempt), and — being non-EU — every
 * foreigner counts as non-EU. Cap left generous for now (the home-grown minimum does the work);
 * tuned in-game in Fase 2f-2.
 */
const ENGLAND_RULES: RosterRules = {
  enabled: true,
  listSize: 25,
  minGoalkeepers: 2,
  minNationTrained: 8,
  minClubTrained: 4,
  under22Age: 21,
  nonEuCap: null,
  minPlayAge: 18,
};

export interface NationSeed {
  id: NationId;
  code: string;
  name: string;
  euMember: boolean;
  homeNationality: string;
  rosterRules: RosterRules;
}

/** The default two-nation setup: Italy (EU) + England (non-EU). Stable ids. */
export const DEFAULT_NATIONS: readonly NationSeed[] = [
  {
    id: asNationId('nation-ita'),
    code: 'ITA',
    name: 'Italia',
    euMember: true,
    homeNationality: 'ITA',
    rosterRules: ITALY_RULES,
  },
  {
    id: asNationId('nation-eng'),
    code: 'ENG',
    name: 'Inghilterra',
    euMember: false,
    homeNationality: 'ENG',
    rosterRules: ENGLAND_RULES,
  },
];

/** Build fresh Nation objects (deep-copied rules so worlds don't share mutable config). */
export function buildDefaultNations(): Nation[] {
  return DEFAULT_NATIONS.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    euMember: n.euMember,
    homeNationality: n.homeNationality,
    rosterRules: { ...n.rosterRules },
  }));
}
