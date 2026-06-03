-- ============================================================
-- Caffeine Committee — add optional breakdown + comment columns
-- Adds: taste, price, vibes, service (1–5 sub-ratings), comment.
-- Run this in Supabase → SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS guards).
-- ============================================================

alter table ratings
  add column if not exists taste   smallint,
  add column if not exists price   smallint,
  add column if not exists vibes   smallint,
  add column if not exists service smallint,
  add column if not exists comment text;

-- Constrain sub-ratings to the 1–5 range used by the UI.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ratings_taste_range'
  ) then
    alter table ratings
      add constraint ratings_taste_range
      check (taste is null or taste between 1 and 5);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ratings_price_range'
  ) then
    alter table ratings
      add constraint ratings_price_range
      check (price is null or price between 1 and 5);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ratings_vibes_range'
  ) then
    alter table ratings
      add constraint ratings_vibes_range
      check (vibes is null or vibes between 1 and 5);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ratings_service_range'
  ) then
    alter table ratings
      add constraint ratings_service_range
      check (service is null or service between 1 and 5);
  end if;
end $$;

-- Force PostgREST to refresh its schema cache so the new columns
-- are visible to the JS client immediately.
notify pgrst, 'reload schema';
