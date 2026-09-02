/**
 * RosterPack registry (MODULE_ARCHETYPES §4) — CONTENUTO PERSONALE, NON DISTRIBUIRE.
 * La mappatura pack→club è del guscio: città + colore primario del kit (identity).
 */

import type { RosterPack } from '../../../src/generation/roster-pack';
import { PACK_MILANO_NERAZZURRI, PACK_MILANO_ROSSONERI } from './real-ita';

export const REAL_PACKS: readonly RosterPack[] = [PACK_MILANO_NERAZZURRI, PACK_MILANO_ROSSONERI];
