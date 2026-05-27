-- ============================================================
-- Caffeine Committee — Option B migration
-- Adds: real auth, teams, team membership, per-rating user_id/team_id.
-- Run this in Supabase → SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS guards).
-- ============================================================

-- 1. Profiles (1 row per auth.user) ---------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);
alter table profiles enable row level security;

drop policy if exists "profiles_read_all"    on profiles;
drop policy if exists "profiles_self_write"  on profiles;
drop policy if exists "profiles_self_update" on profiles;

create policy "profiles_read_all"
  on profiles for select using (true);

create policy "profiles_self_write"
  on profiles for insert with check (auth.uid() = id);

create policy "profiles_self_update"
  on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- 2. Teams ----------------------------------------------------
create or replace function gen_join_code() returns text language sql as $$
  select lower(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  join_code  text not null unique default gen_join_code(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table teams enable row level security;

drop policy if exists "teams_read_all"      on teams;
drop policy if exists "teams_insert_authed" on teams;

create policy "teams_read_all"
  on teams for select using (true);

create policy "teams_insert_authed"
  on teams for insert with check (auth.uid() = created_by);

-- 3. Team membership -----------------------------------------
create table if not exists team_members (
  team_id    uuid not null references teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table team_members enable row level security;

drop policy if exists "team_members_read_all"   on team_members;
drop policy if exists "team_members_self_join"  on team_members;
drop policy if exists "team_members_self_leave" on team_members;

create policy "team_members_read_all"
  on team_members for select using (true);

create policy "team_members_self_join"
  on team_members for insert with check (auth.uid() = user_id);

create policy "team_members_self_leave"
  on team_members for delete using (auth.uid() = user_id);

-- 4. Ratings: add user_id + team_id ---------------------------
alter table ratings
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists team_id uuid references teams(id)      on delete set null;

-- Replace any old "anyone can insert" policy with an auth-only one.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ratings' and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on ratings', pol.policyname);
  end loop;
end $$;

create policy "ratings_insert_authed"
  on ratings for insert
  with check (
    auth.uid() = user_id
    and rating between 0 and 10
    and (
      team_id is null
      or exists (
        select 1 from team_members tm
        where tm.team_id = ratings.team_id and tm.user_id = auth.uid()
      )
    )
  );

-- 5. Realtime publication ------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table teams;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table team_members;
  exception when others then null; end;
end $$;
