/** Player attributes, scale 1-100. See SPEC.md §1.1. */

/** Attributes every player has (mental + physical). */
export interface CommonAttributes {
  pace: number;
  stamina: number;
  strength: number;
  workRate: number;
  positioning: number;
  decisions: number;
  composure: number;
}

/** Outfield-only (technical) attributes. */
export interface OutfieldAttributes extends CommonAttributes {
  finishing: number;
  passing: number;
  tackling: number;
  dribbling: number;
  marking: number;
}

/** Goalkeeper-only attributes. */
export interface GoalkeeperAttributes extends CommonAttributes {
  reflexes: number;
  handling: number;
  aerial: number;
  oneOnOne: number;
}

export type Attributes = OutfieldAttributes | GoalkeeperAttributes;

export const ATTR_MIN = 1;
export const ATTR_MAX = 100;

export function clampAttr(value: number): number {
  return Math.max(ATTR_MIN, Math.min(ATTR_MAX, value));
}

export function isGoalkeeperAttributes(a: Attributes): a is GoalkeeperAttributes {
  return 'reflexes' in a;
}

/**
 * Physical vs technical/mental classification, driving differential aging (SPEC §11):
 * physical attributes decline at full rate, technical/mental ones far slower.
 */
export type AttributeKind = 'physical' | 'technical';

const PHYSICAL_ATTRS = new Set(['pace', 'stamina', 'strength']);

export function attributeKind(key: string): AttributeKind {
  return PHYSICAL_ATTRS.has(key) ? 'physical' : 'technical';
}
