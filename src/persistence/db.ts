/** Open a SQLite save file and wrap it with Drizzle. See CLAUDE.md (persistence). */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface SaveHandle {
  db: Db;
  sqlite: Database.Database;
  close(): void;
}

/** Open (creating if needed) a save file, ensuring the schema exists. */
export function openSave(path: string): SaveHandle {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(schema.CREATE_TABLES_SQL);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}
