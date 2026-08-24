/**
 * Salvataggi (UI-4, MODULE_UI §4): contratto comune dei backend. La UI parla SOLO con
 * questa interfaccia; il formato del file è del codec puro (`src/persistence/codec.ts`).
 */

import type { SaveFile, SaveMeta } from '../../../src/persistence/codec';

export interface SaveSummary {
  id: string;
  meta: SaveMeta;
  /** ISO. */
  updatedAt: string;
  /** Dimensione memorizzata (testo in locale, gzip nel cloud). */
  bytes: number;
}

export interface SaveStore {
  readonly kind: 'local' | 'cloud';
  list(): Promise<SaveSummary[]>;
  load(id: string): Promise<SaveFile>;
  put(id: string, file: SaveFile): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Slot riservato all'autosalvataggio dopo ogni giornata. */
export const AUTOSAVE_ID = 'autosave';

export function newSaveId(): string {
  return crypto.randomUUID();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}
