create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  room_id text,
  mode text not null check (mode in ('single', 'multi')),
  player_a_name text,
  player_b_name text,
  winner_side text not null check (winner_side in ('A', 'B')),
  winner_name text,
  games_a integer not null default 0,
  games_b integer not null default 0,
  final_points_a integer not null default 0,
  final_points_b integer not null default 0,
  set_scores jsonb not null default '[]'::jsonb,
  duration_seconds integer,
  client_version text not null default 'badminton0.1'
);

alter table public.match_results enable row level security;

drop policy if exists "match_results_public_insert" on public.match_results;
create policy "match_results_public_insert"
on public.match_results
for insert
to anon, authenticated
with check (true);

drop policy if exists "match_results_public_select" on public.match_results;
create policy "match_results_public_select"
on public.match_results
for select
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select, insert on public.match_results to anon, authenticated;
