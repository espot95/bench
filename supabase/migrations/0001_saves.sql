-- BENCH — salvataggi cloud (UI-4). Eseguire una volta nel SQL editor di Supabase
-- (o `supabase db push`). Modello: metadati in Postgres, blob gzip in Storage,
-- entrambi isolati per utente via RLS (auth.uid()).

create table if not exists public.saves (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  meta        jsonb not null,
  bytes       integer not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists saves_user_updated_idx on public.saves (user_id, updated_at desc);

alter table public.saves enable row level security;

drop policy if exists "saves: own rows" on public.saves;
create policy "saves: own rows" on public.saves
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Bucket privato: un file per salvataggio, in una cartella per utente ({uid}/{id}.json.gz).
insert into storage.buckets (id, name, public)
  values ('saves', 'saves', false)
  on conflict (id) do nothing;

drop policy if exists "saves blobs: read own" on storage.objects;
create policy "saves blobs: read own" on storage.objects
  for select using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "saves blobs: write own" on storage.objects;
create policy "saves blobs: write own" on storage.objects
  for insert with check (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "saves blobs: update own" on storage.objects;
create policy "saves blobs: update own" on storage.objects
  for update using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "saves blobs: delete own" on storage.objects;
create policy "saves blobs: delete own" on storage.objects
  for delete using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);
