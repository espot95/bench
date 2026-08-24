/**
 * Backend CLOUD: Supabase (Auth + Postgres/RLS + Storage). Zero server nostro.
 * Schema in `supabase/migrations/0001_saves.sql`; chiavi in `ui/.env.local`.
 * Se le variabili mancano il cloud è semplicemente spento (`cloudConfigured()` false).
 */

import { type SupabaseClient, type User, createClient } from '@supabase/supabase-js';
import { type SaveFile, saveFromText, saveToText } from '../../../src/persistence/codec';
import { gunzipToText, gzipText, hasGzip } from './gzip';
import type { SaveStore, SaveSummary } from './store';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const BUCKET = 'saves';
const TABLE = 'saves';

export function cloudConfigured(): boolean {
  return Boolean(URL && KEY);
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!URL || !KEY) throw new Error('Cloud non configurato: manca ui/.env.local');
  if (!client) client = createClient(URL, KEY);
  return client;
}

export async function currentUser(): Promise<User | null> {
  if (!cloudConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user ?? null;
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
  if (!cloudConfigured()) return () => {};
  const { data } = supabase().auth.onAuthStateChange((_evt, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

/** Magic link (e codice OTP se il template email lo include). */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
}

export async function verifyCode(email: string, token: string): Promise<void> {
  const { error } = await supabase().auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

interface SaveRow {
  id: string;
  name: string;
  meta: SaveFile['meta'];
  bytes: number;
  updated_at: string;
}

async function uid(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error('Accedi per usare i salvataggi cloud');
  return user.id;
}

const pathOf = (userId: string, id: string) => `${userId}/${id}.json.gz`;

export class CloudSaveStore implements SaveStore {
  readonly kind = 'cloud' as const;

  async list(): Promise<SaveSummary[]> {
    const { data, error } = await supabase()
      .from(TABLE)
      .select('id, name, meta, bytes, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as SaveRow[]).map((r) => ({
      id: r.id,
      meta: r.meta,
      updatedAt: r.updated_at,
      bytes: r.bytes,
    }));
  }

  async load(id: string): Promise<SaveFile> {
    const user = await uid();
    const { data, error } = await supabase().storage.from(BUCKET).download(pathOf(user, id));
    if (error || !data) throw new Error(error?.message ?? 'Download fallito');
    return saveFromText(await gunzipToText(data));
  }

  async put(id: string, file: SaveFile): Promise<void> {
    if (!hasGzip()) throw new Error('Questo browser non supporta la compressione richiesta');
    const user = await uid();
    const blob = await gzipText(saveToText(file));
    const up = await supabase()
      .storage.from(BUCKET)
      .upload(pathOf(user, id), blob, { upsert: true, contentType: 'application/gzip' });
    if (up.error) throw new Error(up.error.message);
    const row: SaveRow & { user_id: string } = {
      id,
      user_id: user,
      name: file.meta.name,
      meta: file.meta,
      bytes: blob.size,
      updated_at: file.meta.savedAt,
    };
    const { error } = await supabase().from(TABLE).upsert(row);
    if (error) throw new Error(error.message);
  }

  async remove(id: string): Promise<void> {
    const user = await uid();
    await supabase()
      .storage.from(BUCKET)
      .remove([pathOf(user, id)]);
    const { error } = await supabase().from(TABLE).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}

export const cloudStore = new CloudSaveStore();
