-- =============================================================================
-- HSC AI Evaluator — Supabase / Postgres schema
-- =============================================================================
-- Purpose: move the app from per-browser IndexedDB to a shared, multi-user
--          database where curriculum content grows over time from both the
--          admin (you) and user contributions, with a moderation gate.
--
-- This file is idempotent-ish and intended to be run once in the Supabase SQL
-- editor (or via `supabase db push`). It does NOT touch the running app.
--
-- Data model mirrors types.ts:
--   Course -> outcomes[], topics[]
--   Topic  -> subTopics[], performanceBandDescriptors[]
--   SubTopic -> dotPoints[]
--   DotPoint -> prompts[]
--   Prompt -> sampleAnswers[]
--
-- Moderation model (the core of "everyone contributes, everyone benefits"):
--   private  -> author's own draft, visible only to them
--   pending  -> submitted to the shared library, in the admin review queue
--   approved -> published, visible to all users
--   rejected -> reviewed and declined (kept for audit, hidden from library)
--   archived -> retired content, hidden but preserved
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";        -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin', 'teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_status as enum ('private', 'pending', 'approved', 'rejected', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type answer_source as enum ('AI', 'USER', 'HSC_EXEMPLAR');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Profiles (extends Supabase auth.users)
--    Replaces the mock authService. Stats/preferences carried over from
--    types.ts (stored as jsonb so the app's existing shapes drop straight in).
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique not null,
  display_name text not null default '',
  role         app_role not null default 'student',
  preferences  jsonb not null default '{}'::jsonb,
  stats        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Curriculum hierarchy
--    `legacy_id` preserves the original string ids from the JSON
--    (e.g. "course-ec-01") so existing client code / deep links can map over.
-- ----------------------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text,
  name        text not null,
  subject     text,
  -- New content starts private; only a reviewer can publish it (see the
  -- status-authority trigger in section 9). The seed script sets 'approved'
  -- explicitly via the service role, which bypasses that trigger.
  status      content_status not null default 'private',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.course_outcomes (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  code        text not null,
  description text not null,
  position    int  not null default 0
);

create table if not exists public.topics (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  legacy_id     text,
  name          text not null,
  position      int  not null default 0,
  -- performanceBandDescriptors[] is small + read-as-a-unit: store as jsonb
  band_descriptors jsonb not null default '[]'::jsonb
);

create table if not exists public.sub_topics (
  id        uuid primary key default gen_random_uuid(),
  topic_id  uuid not null references public.topics (id) on delete cascade,
  legacy_id text,
  name      text not null,
  position  int  not null default 0
);

create table if not exists public.dot_points (
  id           uuid primary key default gen_random_uuid(),
  sub_topic_id uuid not null references public.sub_topics (id) on delete cascade,
  legacy_id    text,
  description  text not null,
  position     int  not null default 0
);

-- Prompts = the HSC-style questions + their marking criteria.
-- This is the table that grows the most from user + AI contributions.
create table if not exists public.prompts (
  id                       uuid primary key default gen_random_uuid(),
  dot_point_id             uuid not null references public.dot_points (id) on delete cascade,
  legacy_id                text,
  question                 text not null,
  highlighted_question     text,
  total_marks              int  not null default 0,
  verb                     text,
  scenario                 text,
  marking_criteria         text,
  linked_outcomes          text[] not null default '{}',
  related_topics           text[] not null default '{}',
  prerequisite_knowledge   text[] not null default '{}',
  marker_notes             text[] not null default '{}',
  common_student_errors    text[] not null default '{}',
  keywords                 text[] not null default '{}',
  target_performance_bands int[]  not null default '{}',
  estimated_time           text,
  is_past_hsc              boolean not null default false,
  hsc_year                 int,
  hsc_question_number      text,
  -- moderation + provenance (new content starts private — see section 9)
  status                   content_status not null default 'private',
  -- AI pre-screen score (0-100) + summary, attached at submission time so
  -- reviewers can triage the queue by quality.
  quality_score            int,
  quality_notes            text,
  created_by               uuid references public.profiles (id) on delete set null,
  reviewed_by              uuid references public.profiles (id) on delete set null,
  reviewed_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Sample answers / exemplars attached to a prompt.
create table if not exists public.sample_answers (
  id          uuid primary key default gen_random_uuid(),
  prompt_id   uuid not null references public.prompts (id) on delete cascade,
  legacy_id   text,
  band        int  not null,
  mark        int  not null default 0,
  answer      text not null,
  source      answer_source not null default 'AI',
  feedback    text,
  quick_tip   text,
  status      content_status not null default 'private',
  quality_score int,
  quality_notes text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. Responses — accumulating student work + AI feedback over time.
--    These are NOT part of the public library; they are per-user data that
--    teachers/admins can read for analytics. `evaluation` holds the full
--    EvaluationResult shape from types.ts.
-- ----------------------------------------------------------------------------
create table if not exists public.responses (
  id            uuid primary key default gen_random_uuid(),
  prompt_id     uuid not null references public.prompts (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  draft         text not null default '',
  word_count    int  not null default 0,
  overall_mark  int,
  overall_band  int,
  evaluation    jsonb,          -- full EvaluationResult
  user_feedback jsonb,          -- thumbs up/down on the AI feedback
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. Helpful indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_outcomes_course   on public.course_outcomes (course_id);
create index if not exists idx_topics_course      on public.topics (course_id);
create index if not exists idx_subtopics_topic     on public.sub_topics (topic_id);
create index if not exists idx_dotpoints_subtopic  on public.dot_points (sub_topic_id);
create index if not exists idx_prompts_dotpoint    on public.prompts (dot_point_id);
create index if not exists idx_prompts_status      on public.prompts (status);
create index if not exists idx_prompts_created_by  on public.prompts (created_by);
create index if not exists idx_answers_prompt      on public.sample_answers (prompt_id);
create index if not exists idx_responses_user      on public.responses (user_id);
create index if not exists idx_responses_prompt    on public.responses (prompt_id);

-- ----------------------------------------------------------------------------
-- 6. updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','courses','topics','prompts','responses']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on public.%1$s;
       create trigger trg_%1$s_updated before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Auto-create a profile row when a new auth user signs up
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 8. Role helpers (used by RLS policies)
-- ----------------------------------------------------------------------------
create or replace function public.current_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_reviewer()
returns boolean language sql stable as $$
  select public.current_role() in ('admin', 'teacher');
$$;

-- ----------------------------------------------------------------------------
-- 9. Row-Level Security
--    Principle: anyone signed in can READ approved library content and their
--    own private drafts; only owners/reviewers can change things; only
--    reviewers can publish (see approve_* RPCs below).
-- ----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.courses        enable row level security;
alter table public.course_outcomes enable row level security;
alter table public.topics         enable row level security;
alter table public.sub_topics     enable row level security;
alter table public.dot_points     enable row level security;
alter table public.prompts        enable row level security;
alter table public.sample_answers enable row level security;
alter table public.responses      enable row level security;

-- Profiles ---------------------------------------------------------------
-- Full profile rows (incl. stats/preferences) are personal data — only the
-- owner and reviewers (who need authorship context for moderation) can read
-- them. Nothing in the app needs to browse other users' profiles wholesale.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (id = auth.uid() or public.is_reviewer());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- The policy above is row-level only — Postgres RLS cannot stop a user from
-- updating their OWN row's `role` column. Without this trigger, any signed-in
-- user could run `update profiles set role = 'admin' where id = auth.uid()`
-- via the client SDK and self-promote. The trigger closes that column-level
-- gap: a real end-user session (auth.uid() is not null) may only change
-- `role` if they are already an admin. `auth.uid()` is null for the SQL
-- editor and the service-role key, so bootstrapping/admin scripts still work.
create or replace function public.prevent_role_self_escalation()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only admins can change a profile''s role';
  end if;
  return new;
end; $$;

drop trigger if exists trg_profiles_block_role_escalation on public.profiles;
create trigger trg_profiles_block_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- Sanctioned path for an admin to change someone else's role from the app
-- (re-checks the caller server-side rather than trusting a UI gate).
create or replace function public.set_user_role(p_user_id uuid, p_role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end; $$;

-- The library-content update policies (below) let an owner update their own
-- row, which is row-level only — it cannot stop them setting the `status`
-- *column* to 'approved'. Without this trigger a normal user could publish
-- their own content (or insert it pre-approved, since that used to be the
-- default), bypassing the reviewer gate entirely. This closes that column-level
-- gap on every status-bearing table: a real end-user session (auth.uid() not
-- null) may only move content to/within the un-published states
-- (private/pending). Reaching approved/rejected/archived requires a reviewer.
-- auth.uid() is null for the SQL editor and the service-role seed, so those
-- still publish freely.
create or replace function public.enforce_content_status_authority()
returns trigger language plpgsql as $$
begin
  -- Demote-on-edit: when a non-reviewer end-user session touches an APPROVED
  -- row (the owner fixing their published content — RLS already limits
  -- non-reviewers to their own rows), pull it back into the review queue.
  -- Without this, an author could get benign content approved and then edit
  -- its text while it stays published, bypassing review entirely.
  if tg_op = 'UPDATE'
     and old.status = 'approved'
     and auth.uid() is not null
     and not public.is_reviewer() then
    new.status := 'pending';
  end if;

  if new.status in ('approved', 'rejected', 'archived')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and auth.uid() is not null
     and not public.is_reviewer() then
    raise exception 'Only admins/teachers can publish, reject, or archive content';
  end if;
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['courses','prompts','sample_answers']
  loop
    execute format('drop trigger if exists trg_%1$s_status_authority on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_status_authority
         before insert or update on public.%1$s
         for each row execute function public.enforce_content_status_authority();', t);
  end loop;
end $$;

-- Make the safer default idempotent for databases created before this change.
alter table public.courses        alter column status set default 'private';
alter table public.prompts        alter column status set default 'private';
alter table public.sample_answers alter column status set default 'private';

-- AI pre-screen columns (idempotent for databases created before this change).
alter table public.prompts        add column if not exists quality_score int;
alter table public.prompts        add column if not exists quality_notes text;
alter table public.sample_answers add column if not exists quality_score int;
alter table public.sample_answers add column if not exists quality_notes text;

-- The client write path upserts contributions keyed on (legacy_id, created_by)
-- with a select-then-insert, which can race into duplicates. Back it with a
-- partial unique index so the database guarantees what the client assumes.
-- (Seeded rows with a null created_by are exempt: NULLs are distinct.)
create unique index if not exists uniq_prompts_legacy_owner
  on public.prompts (legacy_id, created_by)
  where legacy_id is not null and created_by is not null;
create unique index if not exists uniq_answers_legacy_owner
  on public.sample_answers (legacy_id, created_by)
  where legacy_id is not null and created_by is not null;

-- Generic "library content" policy applied to the curriculum tables.
-- Visible if approved, OR you created it, OR you're a reviewer.
do $$
declare t text;
begin
  foreach t in array array['courses','topics','sub_topics','dot_points','prompts','sample_answers']
  loop
    -- topics/sub_topics/dot_points have no status column of their own; they
    -- inherit visibility from their parent course in the app query layer.
    -- For the status-bearing tables we gate on status; for the rest we allow
    -- read to any authenticated user (structure is not sensitive).
    null;
  end loop;
end $$;

-- Courses (status-bearing)
drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses for select
  using (status = 'approved' or created_by = auth.uid() or public.is_reviewer());
drop policy if exists courses_insert on public.courses;
create policy courses_insert on public.courses for insert
  with check (auth.uid() is not null and created_by = auth.uid());
drop policy if exists courses_modify on public.courses;
create policy courses_modify on public.courses for update
  using (created_by = auth.uid() or public.is_reviewer());
drop policy if exists courses_delete on public.courses;
create policy courses_delete on public.courses for delete
  using (created_by = auth.uid() or public.is_admin());

-- Structural tables (outcomes/topics/sub_topics/dot_points): readable by any
-- authenticated user, writable by reviewers (or the creator of the course).
do $$
declare t text;
begin
  foreach t in array array['course_outcomes','topics','sub_topics','dot_points']
  loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format('create policy %1$s_read on public.%1$s for select using (auth.uid() is not null);', t);
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format('create policy %1$s_write on public.%1$s for all
                    using (public.is_reviewer()) with check (public.is_reviewer());', t);
  end loop;
end $$;

-- Prompts (status-bearing)
drop policy if exists prompts_read on public.prompts;
create policy prompts_read on public.prompts for select
  using (status = 'approved' or created_by = auth.uid() or public.is_reviewer());
drop policy if exists prompts_insert on public.prompts;
create policy prompts_insert on public.prompts for insert
  with check (auth.uid() is not null and created_by = auth.uid());
drop policy if exists prompts_update on public.prompts;
create policy prompts_update on public.prompts for update
  using (created_by = auth.uid() or public.is_reviewer());
drop policy if exists prompts_delete on public.prompts;
create policy prompts_delete on public.prompts for delete
  using (created_by = auth.uid() or public.is_admin());

-- Sample answers (status-bearing)
drop policy if exists answers_read on public.sample_answers;
create policy answers_read on public.sample_answers for select
  using (status = 'approved' or created_by = auth.uid() or public.is_reviewer());
drop policy if exists answers_insert on public.sample_answers;
create policy answers_insert on public.sample_answers for insert
  with check (auth.uid() is not null and created_by = auth.uid());
drop policy if exists answers_modify on public.sample_answers;
create policy answers_modify on public.sample_answers for update
  using (created_by = auth.uid() or public.is_reviewer());
drop policy if exists answers_delete on public.sample_answers;
create policy answers_delete on public.sample_answers for delete
  using (created_by = auth.uid() or public.is_admin());

-- Responses (per-user private data; reviewers may read for analytics)
drop policy if exists responses_read on public.responses;
create policy responses_read on public.responses for select
  using (user_id = auth.uid() or public.is_reviewer());
drop policy if exists responses_write on public.responses;
create policy responses_write on public.responses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 10. Moderation RPCs — the sanctioned way for reviewers to publish/reject.
--     These set reviewer metadata and re-check the caller; the
--     enforce_content_status_authority trigger (section 9) is the backstop that
--     blocks any *other* path to a published status for non-reviewers.
-- ----------------------------------------------------------------------------
create or replace function public.approve_prompt(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can approve content';
  end if;
  update public.prompts
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
end; $$;

create or replace function public.reject_prompt(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can reject content';
  end if;
  update public.prompts
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
end; $$;

-- Sample answers (no reviewed_by/reviewed_at columns, so status only).
create or replace function public.approve_sample_answer(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can approve content';
  end if;
  update public.sample_answers set status = 'approved' where id = p_id;
end; $$;

create or replace function public.reject_sample_answer(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can reject content';
  end if;
  update public.sample_answers set status = 'rejected' where id = p_id;
end; $$;

-- =============================================================================
-- End of schema.
-- Next: run supabase/seed.mjs to import courseData/*.json as approved content.
-- =============================================================================
