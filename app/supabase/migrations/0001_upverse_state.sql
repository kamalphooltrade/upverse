-- UPVerse v1 storage: single-owner state document (SPEC §8 per-table schema is the Phase-2 migration path).
-- Apply in Supabase SQL editor for project aqklpnjzgtpqotxebthn (or `supabase db push`).
create table if not exists public.upverse_state (
  owner_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.upverse_state enable row level security;
-- No policies on purpose: only the service role (server-side) can read/write. Anon/authenticated get nothing.
comment on table public.upverse_state is 'UPVerse app state (paper ledger, tickets, journal, settings, encrypted broker creds). Service-role only.';
