-- ============================================================================
-- Standards in Motion — Supabase migration
-- Creates ONLY new objects prefixed sim_ / SIM — nothing existing is touched.
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- Paste into Supabase → SQL Editor → Run.
-- ============================================================================

-- 1 · Courses (cloud lane for the Studio library) -----------------------------
create table if not exists public.sim_courses (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users (id) on delete set null,
  title       text not null default 'Untitled series',
  status      text not null default 'draft',           -- draft | published
  data        jsonb not null,                          -- the full course document
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.sim_courses enable row level security;

-- signed-in users see and manage only their own courses
drop policy if exists "sim_courses_select_own" on public.sim_courses;
create policy "sim_courses_select_own" on public.sim_courses
  for select to authenticated using (auth.uid() = owner);

drop policy if exists "sim_courses_insert_own" on public.sim_courses;
create policy "sim_courses_insert_own" on public.sim_courses
  for insert to authenticated with check (auth.uid() = owner);

drop policy if exists "sim_courses_update_own" on public.sim_courses;
create policy "sim_courses_update_own" on public.sim_courses
  for update to authenticated using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "sim_courses_delete_own" on public.sim_courses;
create policy "sim_courses_delete_own" on public.sim_courses
  for delete to authenticated using (auth.uid() = owner);


-- 2 · Per-question telemetry rows (analytics mirror of the xAPI stream) ------
create table if not exists public.sim_assessment_rows (
  id             bigint generated always as identity primary key,
  course         text,
  entry          text,
  user_id        text,
  user_name      text,
  at             timestamptz,
  kind           text,          -- question | summary
  interaction_id text,          -- assess-q1-try1, pre-q3, assessment-try-2 …
  chosen         text,
  correct_answer text,
  result         text,          -- correct | wrong
  score          numeric,
  try            int,
  passed         boolean,
  created_at     timestamptz not null default now()
);

alter table public.sim_assessment_rows enable row level security;

-- anyone (even anonymous learners) may append their own rows;
-- only signed-in users may read the pool back for analytics
drop policy if exists "sim_rows_insert_all" on public.sim_assessment_rows;
create policy "sim_rows_insert_all" on public.sim_assessment_rows
  for insert to anon, authenticated with check (true);

drop policy if exists "sim_rows_select_auth" on public.sim_assessment_rows;
create policy "sim_rows_select_auth" on public.sim_assessment_rows
  for select to authenticated using (true);


-- 3 · Published package versions (publish lane + rollback) --------------------
create table if not exists public.sim_package_versions (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references public.sim_courses (id) on delete cascade,
  owner       uuid references auth.users (id) on delete set null,
  version     int not null,                          -- 1, 2, 3 …
  format      text not null,                         -- scorm12 | xapi
  title       text,
  file_path   text not null,                         -- path inside the sim-packages bucket
  size_bytes  bigint,
  note        text,
  created_at  timestamptz not null default now(),
  unique (course_id, version, format)
);

alter table public.sim_package_versions enable row level security;

drop policy if exists "sim_versions_select_own" on public.sim_package_versions;
create policy "sim_versions_select_own" on public.sim_package_versions
  for select to authenticated using (auth.uid() = owner);

drop policy if exists "sim_versions_insert_own" on public.sim_package_versions;
create policy "sim_versions_insert_own" on public.sim_package_versions
  for insert to authenticated with check (auth.uid() = owner);

drop policy if exists "sim_versions_delete_own" on public.sim_package_versions;
create policy "sim_versions_delete_own" on public.sim_package_versions
  for delete to authenticated using (auth.uid() = owner);


-- 4 · Storage bucket for the exported zips ------------------------------------
insert into storage.buckets (id, name, public)
values ('sim-packages', 'sim-packages', false)
on conflict (id) do nothing;

drop policy if exists "sim_packages_owner_rw" on storage.objects;
create policy "sim_packages_owner_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'sim-packages' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sim-packages' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- Done. Objects created: sim_courses, sim_assessment_rows,
-- sim_package_versions, bucket sim-packages. Nothing else was modified.
-- ============================================================================
