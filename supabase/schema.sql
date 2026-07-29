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
-- One row per (student, prompt): the latest attempt + AI feedback. Lets the
-- client upsert on each evaluation (see services/responseService.ts) and is the
-- substrate for longitudinal analytics. Per-attempt history is a future step.
create unique index if not exists uq_responses_user_prompt
  on public.responses (user_id, prompt_id);

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
  foreach t in array array['profiles','courses','topics','sub_topics','dot_points','prompts','responses']
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
-- Usernames must be unique but OAuth/SSO sign-ups derive them from the email
-- local-part, which collides (john.smith@gmail.com vs john.smith@det.nsw.edu.au).
-- A collision here used to abort the INSERT — rolling back the auth.users row
-- and failing the person's entire sign-up with an opaque "database error".
-- Now: try the base name, and on conflict append a short fragment of the
-- user's id. The unique_violation handler covers the race two concurrent
-- sign-ups can still hit.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_base text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );
  v_name text := v_base;
  v_display text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    v_base
  );
begin
  if exists (select 1 from public.profiles where username = v_name) then
    v_name := v_base || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;

  begin
    insert into public.profiles (id, username, display_name, role)
    values (new.id, v_name, v_display, 'student')
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, username, display_name, role)
    values (new.id, v_base || '-' || left(replace(new.id::text, '-', ''), 6), v_display, 'student')
    on conflict (id) do nothing;
  end;
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
  foreach t in array array['courses','topics','sub_topics','dot_points','prompts','sample_answers']
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

-- Structural moderation (topics/sub_topics/dot_points): bring the syllabus
-- STRUCTURE into the same contribute→moderate model as prompts, so users can
-- push locally-authored structure to the shared library for review. Added
-- idempotently. Existing seeded structure is canonical content that predates
-- these columns, so backfill it to 'approved'; new user-created rows default to
-- 'private' (and the enforce trigger + RLS below gate the rest).
do $struct$
declare t text;
begin
  foreach t in array array['topics', 'sub_topics', 'dot_points']
  loop
    execute format(
      'alter table public.%1$s add column if not exists status content_status not null default ''private'';', t);
    execute format(
      'alter table public.%1$s add column if not exists created_by uuid references public.profiles(id) on delete set null;', t);
    -- updated_at so the maintenance trigger (below) has a column to write.
    -- topics has long been in that trigger's list without the column — a latent
    -- bug that only surfaced once structure became updatable; add it everywhere.
    execute format(
      'alter table public.%1$s add column if not exists updated_at timestamptz not null default now();', t);
    -- Seeded rows have no creator and predate the column → approved canonical.
    execute format(
      'update public.%1$s set status = ''approved'' where created_by is null and status = ''private'';', t);
  end loop;
end $struct$;

-- Race-proof the client's (legacy_id, created_by) upsert, as for prompts.
create unique index if not exists uniq_topics_legacy_owner
  on public.topics (legacy_id, created_by)
  where legacy_id is not null and created_by is not null;
create unique index if not exists uniq_subtopics_legacy_owner
  on public.sub_topics (legacy_id, created_by)
  where legacy_id is not null and created_by is not null;
create unique index if not exists uniq_dotpoints_legacy_owner
  on public.dot_points (legacy_id, created_by)
  where legacy_id is not null and created_by is not null;

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

-- Course outcomes: not part of the contribute model (no status), so keep the
-- simple rule — readable by any authenticated user, writable by reviewers.
drop policy if exists course_outcomes_read on public.course_outcomes;
create policy course_outcomes_read on public.course_outcomes for select
  using (auth.uid() is not null);
drop policy if exists course_outcomes_write on public.course_outcomes;
create policy course_outcomes_write on public.course_outcomes for all
  using (public.is_reviewer()) with check (public.is_reviewer());

-- Structural tables (topics/sub_topics/dot_points) are now status-bearing, so
-- they take the same library-content policy as prompts: visible if approved, or
-- yours, or you're a reviewer; you may create/edit your own; the enforce trigger
-- keeps non-reviewers out of the published states.
do $struct_rls$
declare t text;
begin
  foreach t in array array['topics', 'sub_topics', 'dot_points']
  loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format(
      'create policy %1$s_read on public.%1$s for select
         using (status = ''approved'' or created_by = auth.uid() or public.is_reviewer());', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert
         with check (auth.uid() is not null and created_by = auth.uid());', t);
    execute format('drop policy if exists %1$s_modify on public.%1$s;', t);
    execute format(
      'create policy %1$s_modify on public.%1$s for update
         using (created_by = auth.uid() or public.is_reviewer());', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s;', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete
         using (created_by = auth.uid() or public.is_admin());', t);
    -- Drop the old permissive policies from before structure was moderated.
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
  end loop;
end $struct_rls$;

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

-- Structure moderation: one reviewer-gated entry point for the three structural
-- tables (topic / sub_topic / dot_point). `p_kind` is validated against a fixed
-- allowlist before it reaches the dynamic UPDATE, so it can't be used to touch
-- an arbitrary table; `p_status` must be a publishable/rejected state.
create or replace function public.set_structure_status(
  p_kind text, p_id uuid, p_status content_status
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_table text;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can moderate structure';
  end if;
  v_table := case p_kind
    when 'topic'     then 'topics'
    when 'sub_topic' then 'sub_topics'
    when 'dot_point' then 'dot_points'
    else null
  end;
  if v_table is null then
    raise exception 'Unknown structure kind: %', p_kind;
  end if;
  if p_status not in ('approved', 'rejected', 'archived') then
    raise exception 'set_structure_status only sets a moderation state, not %', p_status;
  end if;
  execute format('update public.%I set status = $1 where id = $2', v_table)
    using p_status, p_id;
end; $$;

-- ----------------------------------------------------------------------------
-- 11. AI usage quotas — per role (group) with per-user overrides.
--     The AI proxy (api/gemini.ts) consumes one unit per call via
--     consume_ai_quota(); when a user's daily budget is spent the proxy
--     returns 429 instead of forwarding to the paid provider. Enforcement is
--     server-side and atomic; the client only displays state.
--     Precedence: profiles.daily_ai_quota (per-user override) beats
--     ai_quota_limits.daily_limit (role default) beats the built-in 50.
-- ----------------------------------------------------------------------------

create table if not exists public.ai_quota_limits (
  role        app_role primary key,
  daily_limit integer not null check (daily_limit >= 0)
);

-- Sensible defaults; adjust with set_role_ai_quota() (admin-only).
insert into public.ai_quota_limits (role, daily_limit) values
  ('admin', 1000),
  ('teacher', 400),
  ('student', 60)
on conflict (role) do nothing;

-- Per-user override: null = use the role default.
alter table public.profiles add column if not exists daily_ai_quota integer
  check (daily_ai_quota is null or daily_ai_quota >= 0);

-- One counter row per user per UTC day. No retention job needed at this
-- scale; rows are tiny and old days are simply never read.
create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  calls   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_quota_limits enable row level security;
alter table public.ai_usage        enable row level security;

-- Limits are visible to any signed-in user (the UI shows your allowance);
-- there is deliberately NO write policy — changes go through the admin RPC.
drop policy if exists quota_limits_read on public.ai_quota_limits;
create policy quota_limits_read on public.ai_quota_limits
  for select using (auth.uid() is not null);

-- Usage: your own row, or any row for reviewers (usage oversight).
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage
  for select using (user_id = auth.uid() or public.is_reviewer());
-- No insert/update policies: the only write path is consume_ai_quota().

-- Effective daily limit for a user (override → plan-aware default → 50).
-- Paid plans (stripe_plan = plus/school, kept in sync by the Stripe webhook)
-- are guaranteed a 300-call floor: "unlimited marking" must be enforced
-- server-side, not just promised by the paywall copy. An explicit per-user
-- override still beats everything, so admins can always dial an individual
-- up or down.

-- Forward guard: resolve_ai_quota below reads profiles.stripe_plan, but the
-- full Stripe billing section (§13) runs later in this file. SQL-language
-- function bodies are validated at CREATE time, so on a FRESH database the
-- column must exist before this point. Idempotent with §13's own alter.
alter table public.profiles
  add column if not exists stripe_plan text not null default 'free';

create or replace function public.resolve_ai_quota(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    p.daily_ai_quota,
    case
      when coalesce(p.stripe_plan, 'free') in ('plus', 'school')
        then greatest(coalesce(l.daily_limit, 50), 300)
      else l.daily_limit
    end,
    50)
  from public.profiles p
  left join public.ai_quota_limits l on l.role = p.role
  where p.id = p_user;
$$;

-- Atomically consume one call from the caller's daily budget. The
-- conditional ON CONFLICT update makes check-and-increment a single
-- statement, so concurrent calls cannot double-spend the last unit.
create or replace function public.consume_ai_quota()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_limit integer;
  v_used  integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  v_limit := coalesce(public.resolve_ai_quota(v_user), 50);

  if v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'used', 0, 'limit', 0);
  end if;

  insert into public.ai_usage (user_id, day, calls)
  values (v_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set calls = ai_usage.calls + 1
    where ai_usage.calls < v_limit
  returning calls into v_used;

  if v_used is null then
    -- Conditional update matched nothing: the budget is already spent.
    select calls into v_used
      from public.ai_usage
     where user_id = v_user and day = (now() at time zone 'utc')::date;
    return jsonb_build_object('allowed', false, 'used', coalesce(v_used, v_limit), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
end; $$;

-- Read-only status for UI display (does not consume).
create or replace function public.get_ai_quota_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_limit integer;
  v_used  integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  v_limit := coalesce(public.resolve_ai_quota(v_user), 50);
  select calls into v_used
    from public.ai_usage
   where user_id = v_user and day = (now() at time zone 'utc')::date;
  return jsonb_build_object(
    'used', coalesce(v_used, 0),
    'limit', v_limit,
    'remaining', greatest(v_limit - coalesce(v_used, 0), 0)
  );
end; $$;

-- Admin management ---------------------------------------------------------

create or replace function public.set_role_ai_quota(p_role app_role, p_limit integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change quota limits';
  end if;
  if p_limit is null or p_limit < 0 then
    raise exception 'Limit must be a non-negative integer';
  end if;
  insert into public.ai_quota_limits (role, daily_limit)
  values (p_role, p_limit)
  on conflict (role) do update set daily_limit = excluded.daily_limit;
end; $$;

-- Per-user override, addressed by username for admin-console usability.
-- Pass null to clear the override (fall back to the role default).
create or replace function public.set_user_ai_quota(p_username text, p_limit integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change quota limits';
  end if;
  if p_limit is not null and p_limit < 0 then
    raise exception 'Limit must be null (clear) or a non-negative integer';
  end if;
  update public.profiles set daily_ai_quota = p_limit where username = p_username;
  if not found then
    raise exception 'No user with username "%"', p_username;
  end if;
end; $$;

-- Usage report for the admin dashboard: per-user, per-day rows over the last
-- p_days days with each user's EFFECTIVE limit (override → role default →
-- built-in 50). Reviewer-gated: teachers/admins can see who is using what.
create or replace function public.get_ai_usage_report(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days   integer := least(greatest(coalesce(p_days, 7), 1), 31);
  v_result jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can view the usage report';
  end if;

  select coalesce(jsonb_agg(row_obj order by row_obj->>'day' desc, (row_obj->>'calls')::int desc), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'username', p.username,
      'role', p.role,
      'day', u.day,
      'calls', u.calls,
      'limit', coalesce(p.daily_ai_quota, l.daily_limit, 50),
      'override', p.daily_ai_quota
    ) as row_obj
    from public.ai_usage u
    join public.profiles p on p.id = u.user_id
    left join public.ai_quota_limits l on l.role = p.role
    where u.day > (now() at time zone 'utc')::date - v_days
  ) sub;

  return v_result;
end; $$;

-- Per-model usage tally, for the dashboard's cost breakdown ------------------
-- REPORTING ONLY. Which model served a call does not change the allowance it
-- spends, so this lives entirely apart from consume_ai_quota()'s enforcement:
-- the proxy records here best-effort AFTER a unit is spent, and a failure here
-- can never block a request or corrupt a budget. One row per user/day/model.
create table if not exists public.ai_model_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  model   text not null,
  calls   integer not null default 0,
  primary key (user_id, day, model)
);

alter table public.ai_model_usage enable row level security;

-- Same visibility as ai_usage: your own rows, or any row for reviewers.
drop policy if exists ai_model_usage_read on public.ai_model_usage;
create policy ai_model_usage_read on public.ai_model_usage
  for select using (user_id = auth.uid() or public.is_reviewer());
-- No insert/update policy: the only write path is record_ai_model_usage().

-- Best-effort per-model increment, called by the proxy after a call is
-- authorised and a quota unit is spent. Deliberately forgiving — a blank or
-- oversized model tag is ignored rather than raised, so a bad/spoofed tag
-- never fails the user's request. Scopes to auth.uid() so a caller can only
-- ever record against their own tally.
create or replace function public.record_ai_model_usage(p_model text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_model text := nullif(btrim(p_model), '');
begin
  if v_user is null or v_model is null then
    return;
  end if;
  v_model := left(v_model, 100); -- bound an untrusted request-body value
  insert into public.ai_model_usage (user_id, day, model, calls)
  values (v_user, (now() at time zone 'utc')::date, v_model, 1)
  on conflict (user_id, day, model) do update
    set calls = ai_model_usage.calls + 1;
end; $$;

-- Reviewer-gated per-model, per-day usage over the last p_days days (1–31),
-- mirroring get_ai_usage_report so the dashboard can filter "today" vs the
-- whole window client-side and price each model from the engine registry.
create or replace function public.get_ai_model_usage_report(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days   integer := least(greatest(coalesce(p_days, 7), 1), 31);
  v_result jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can view the usage report';
  end if;

  select coalesce(jsonb_agg(row_obj order by row_obj->>'day' desc, (row_obj->>'calls')::int desc), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'model', m.model,
      'day', m.day,
      'calls', m.calls
    ) as row_obj
    from public.ai_model_usage m
    where m.day > (now() at time zone 'utc')::date - v_days
  ) sub;

  return v_result;
end; $$;

-- Per-attempt response history ----------------------------------------------
-- `responses` (§4) keeps only the LATEST attempt per (student, prompt) so the
-- current-standing views stay simple. This append-only log records every
-- evaluation as it happens — the substrate for progress-over-time (a student's
-- band trend). Deliberately separate, mirroring ai_model_usage beside ai_usage:
-- the client appends here best-effort alongside the responses upsert, so a lost
-- event only means a shorter trend, never a broken mark. Tiny rows (no draft
-- text), so no retention job is needed at this scale.
create table if not exists public.response_events (
  id         uuid primary key default gen_random_uuid(),
  prompt_id  uuid not null references public.prompts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  mark       int,
  band       int,
  word_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_response_events_user   on public.response_events (user_id, created_at);
create index if not exists idx_response_events_prompt on public.response_events (prompt_id);

alter table public.response_events enable row level security;

-- Same visibility as responses: your own events, or any for reviewers (analytics).
drop policy if exists response_events_read on public.response_events;
create policy response_events_read on public.response_events for select
  using (user_id = auth.uid() or public.is_reviewer());
-- Append-only: you may insert your own events; there is deliberately NO update
-- or delete policy, so history cannot be rewritten.
drop policy if exists response_events_insert on public.response_events;
create policy response_events_insert on public.response_events for insert
  with check (user_id = auth.uid());

-- Class analytics for teachers/admins ---------------------------------------
-- Aggregates persisted responses (§4) over the last p_days days along two
-- dimensions — the prompt's command verb and its owning topic (module) — so a
-- teacher can see where a cohort is struggling: which verbs/topics draw the
-- lowest bands, how many students attempted them, and the overall average.
-- Both dimensions share a `label` field so the client ranks them with one code
-- path. Reviewer-gated (is_reviewer = admin+teacher); reads only what the
-- responses_read policy already exposes to reviewers, but aggregates
-- server-side so no raw student work leaves the database. "Low band" = band ≤ 3
-- (below the HSC "sound" tier), the struggling signal.
create or replace function public.get_class_analytics(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days    integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since   timestamptz := (now() at time zone 'utc') - make_interval(days => v_days);
  v_byverb  jsonb;
  v_bytopic jsonb;
  v_totals  jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can view class analytics';
  end if;

  select coalesce(jsonb_agg(row_obj order by (row_obj->>'attempts')::int desc), '[]'::jsonb)
    into v_byverb
  from (
    select jsonb_build_object(
      'label', coalesce(nullif(btrim(p.verb), ''), 'Unspecified'),
      'attempts', count(*),
      'students', count(distinct r.user_id),
      'avg_mark', round(avg(r.overall_mark)::numeric, 1),
      'avg_band', round(avg(r.overall_band)::numeric, 2),
      'low_band_rate', round(avg((r.overall_band <= 3)::int)::numeric, 3)
    ) as row_obj
    from public.responses r
    join public.prompts p on p.id = r.prompt_id
    where r.created_at >= v_since
      and r.overall_band is not null
    group by coalesce(nullif(btrim(p.verb), ''), 'Unspecified')
  ) sub;

  select coalesce(jsonb_agg(row_obj order by (row_obj->>'attempts')::int desc), '[]'::jsonb)
    into v_bytopic
  from (
    select jsonb_build_object(
      'label', coalesce(nullif(btrim(t.name), ''), 'Uncategorised'),
      'attempts', count(*),
      'students', count(distinct r.user_id),
      'avg_mark', round(avg(r.overall_mark)::numeric, 1),
      'avg_band', round(avg(r.overall_band)::numeric, 2),
      'low_band_rate', round(avg((r.overall_band <= 3)::int)::numeric, 3)
    ) as row_obj
    from public.responses r
    join public.prompts p    on p.id = r.prompt_id
    join public.dot_points d on d.id = p.dot_point_id
    join public.sub_topics s on s.id = d.sub_topic_id
    join public.topics t     on t.id = s.topic_id
    where r.created_at >= v_since
      and r.overall_band is not null
    group by coalesce(nullif(btrim(t.name), ''), 'Uncategorised')
  ) sub;

  select jsonb_build_object(
    'total_attempts', count(*),
    'active_students', count(distinct r.user_id),
    'avg_band', round(avg(r.overall_band)::numeric, 2)
  ) into v_totals
  from public.responses r
  where r.created_at >= v_since
    and r.overall_band is not null;

  return jsonb_build_object('byVerb', v_byverb, 'byTopic', v_bytopic, 'totals', v_totals);
end; $$;

-- Per-student progress for teachers/admins ----------------------------------
-- One student's persisted responses, aggregated by command verb over the last
-- p_days days, so a teacher can see where an individual sits across the
-- cognitive ladder (the client folds these verbs into the six tiers). Same
-- reviewer gate and server-side aggregation as get_class_analytics — only
-- counts/averages leave the database, never the student's writing. Addressed
-- by username so teachers don't need UUIDs.
create or replace function public.get_student_progress(p_username text, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since  timestamptz := (now() at time zone 'utc') - make_interval(days => v_days);
  v_user   uuid;
  v_byverb jsonb;
  v_totals jsonb;
  v_trend  jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can view student progress';
  end if;

  select id into v_user from public.profiles where username = p_username;
  if v_user is null then
    raise exception 'No user with username "%"', p_username;
  end if;

  select coalesce(jsonb_agg(row_obj order by (row_obj->>'attempts')::int desc), '[]'::jsonb)
    into v_byverb
  from (
    select jsonb_build_object(
      'label', coalesce(nullif(btrim(p.verb), ''), 'Unspecified'),
      'attempts', count(*),
      'students', 1,
      'avg_mark', round(avg(r.overall_mark)::numeric, 1),
      'avg_band', round(avg(r.overall_band)::numeric, 2),
      'low_band_rate', round(avg((r.overall_band <= 3)::int)::numeric, 3)
    ) as row_obj
    from public.responses r
    join public.prompts p on p.id = r.prompt_id
    where r.user_id = v_user and r.created_at >= v_since and r.overall_band is not null
    group by coalesce(nullif(btrim(p.verb), ''), 'Unspecified')
  ) sub;

  select jsonb_build_object(
    'total_attempts', count(*),
    'active_students', case when count(*) > 0 then 1 else 0 end,
    'avg_band', round(avg(r.overall_band)::numeric, 2)
  ) into v_totals
  from public.responses r
  where r.user_id = v_user and r.created_at >= v_since and r.overall_band is not null;

  -- Band trend from the append-only history (oldest→newest), capped to the most
  -- recent 100 scored events in the window so the sparkline stays bounded.
  select coalesce(
           jsonb_agg(jsonb_build_object('at', e.created_at, 'band', e.band, 'mark', e.mark)
                     order by e.created_at asc),
           '[]'::jsonb
         )
    into v_trend
  from (
    select created_at, band, mark
    from public.response_events
    where user_id = v_user and created_at >= v_since and band is not null
    order by created_at desc
    limit 100
  ) e;

  return jsonb_build_object(
    'username', p_username, 'byVerb', v_byverb, 'totals', v_totals, 'trend', v_trend
  );
end; $$;

-- Student roster for the Student Progress picker -----------------------------
-- The students who have at least one scored response in the last p_days days,
-- with attempt count, average band and when they were last active — so a
-- teacher can pick from a list instead of typing a username. Reviewer-gated;
-- exposes only usernames + aggregates, never the responses themselves (the same
-- usernames reviewers already see in the Review Queue / Usage Dashboard).
create or replace function public.get_response_students(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since  timestamptz := (now() at time zone 'utc') - make_interval(days => v_days);
  v_result jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can view the student roster';
  end if;

  select coalesce(
           jsonb_agg(row_obj order by (row_obj->>'attempts')::int desc, row_obj->>'username'),
           '[]'::jsonb
         )
    into v_result
  from (
    select jsonb_build_object(
      'username', pr.username,
      'attempts', count(*),
      'avg_band', round(avg(r.overall_band)::numeric, 2),
      'last_active', max(r.created_at)
    ) as row_obj
    from public.responses r
    join public.profiles pr on pr.id = r.user_id
    where r.created_at >= v_since and r.overall_band is not null
    group by pr.username
  ) sub;

  return v_result;
end; $$;

-- ----------------------------------------------------------------------------
-- 12. Schools — shared (pooled) AI quota groups.
--     An admin creates a school, places students AND teachers in it, and can
--     set a pooled daily AI budget for the whole school. Members still have
--     their personal limit (§11); a call must fit under BOTH. A school with
--     daily_ai_limit null has no pooled cap (members are only individually
--     limited), so a school can be used purely as a grouping while budgets
--     are refined over time.
--
--     This section supersedes §11's consume_ai_quota()/get_ai_quota_status()
--     with school-aware versions — on an existing deployment, run this
--     section alone as the migration.
-- ----------------------------------------------------------------------------

create table if not exists public.schools (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique check (length(trim(name)) > 0),
  -- Pooled daily AI budget shared by every member; null = no pooled cap.
  daily_ai_limit integer check (daily_ai_limit is null or daily_ai_limit >= 0),
  created_at     timestamptz not null default now()
);

alter table public.profiles add column if not exists school_id uuid
  references public.schools(id) on delete set null;
create index if not exists profiles_school_idx on public.profiles(school_id);

-- One counter row per school per UTC day (mirrors ai_usage).
create table if not exists public.school_ai_usage (
  school_id uuid not null references public.schools(id) on delete cascade,
  day       date not null default (now() at time zone 'utc')::date,
  calls     integer not null default 0,
  primary key (school_id, day)
);

alter table public.schools         enable row level security;
alter table public.school_ai_usage enable row level security;

-- Any signed-in user can see the school list (the UI names "your school");
-- there is deliberately NO write policy — changes go through the admin RPCs.
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools
  for select using (auth.uid() is not null);

-- Pool usage: your own school's rows, or any row for reviewers.
drop policy if exists school_ai_usage_read on public.school_ai_usage;
create policy school_ai_usage_read on public.school_ai_usage
  for select using (
    public.is_reviewer()
    or school_id = (select school_id from public.profiles where id = auth.uid())
  );
-- No insert/update policies: the only write path is consume_ai_quota().

-- Atomically consume one call from the caller's personal budget AND (when the
-- caller's school sets a pooled limit) the school's shared pool. The verdict
-- carries `scope` so the proxy can say WHICH budget ran out. Supersedes §11.
create or replace function public.consume_ai_quota()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user         uuid := auth.uid();
  v_day          date := (now() at time zone 'utc')::date;
  v_limit        integer;
  v_used         integer;
  v_school       uuid;
  v_school_limit integer;
  v_school_used  integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  v_limit := coalesce(public.resolve_ai_quota(v_user), 50);

  if v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'used', 0, 'limit', 0, 'scope', 'user');
  end if;

  select p.school_id, s.daily_ai_limit into v_school, v_school_limit
    from public.profiles p
    left join public.schools s on s.id = p.school_id
   where p.id = v_user;

  -- A zero pooled budget blocks every member before any unit is spent.
  if v_school is not null and v_school_limit is not null and v_school_limit <= 0 then
    return jsonb_build_object('allowed', false, 'used', 0, 'limit', 0, 'scope', 'school');
  end if;

  -- Personal spend: the conditional ON CONFLICT update makes
  -- check-and-increment a single statement, so concurrent calls cannot
  -- double-spend the last unit.
  insert into public.ai_usage (user_id, day, calls)
  values (v_user, v_day, 1)
  on conflict (user_id, day) do update
    set calls = ai_usage.calls + 1
    where ai_usage.calls < v_limit
  returning calls into v_used;

  if v_used is null then
    select calls into v_used from public.ai_usage
     where user_id = v_user and day = v_day;
    return jsonb_build_object('allowed', false, 'used', coalesce(v_used, v_limit),
                              'limit', v_limit, 'scope', 'user');
  end if;

  -- Pooled school spend (same atomic pattern). Runs only when a pooled limit
  -- is set; a school with daily_ai_limit null is grouping-only.
  if v_school is not null and v_school_limit is not null then
    insert into public.school_ai_usage (school_id, day, calls)
    values (v_school, v_day, 1)
    on conflict (school_id, day) do update
      set calls = school_ai_usage.calls + 1
      where school_ai_usage.calls < v_school_limit
    returning calls into v_school_used;

    if v_school_used is null then
      -- Pool exhausted: hand back the personal unit spent above (same
      -- transaction, so this can never under-count).
      update public.ai_usage set calls = greatest(calls - 1, 0)
       where user_id = v_user and day = v_day;
      select calls into v_school_used from public.school_ai_usage
       where school_id = v_school and day = v_day;
      return jsonb_build_object('allowed', false,
                                'used', coalesce(v_school_used, v_school_limit),
                                'limit', v_school_limit, 'scope', 'school');
    end if;
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'scope', 'user');
end; $$;

-- Read-only status for UI display (does not consume). Supersedes §11: adds a
-- `school` block (null for users not in a school) so the client can show the
-- shared pool alongside the personal allowance.
create or replace function public.get_ai_quota_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user         uuid := auth.uid();
  v_day          date := (now() at time zone 'utc')::date;
  v_limit        integer;
  v_used         integer;
  v_school       uuid;
  v_school_name  text;
  v_school_limit integer;
  v_school_used  integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  v_limit := coalesce(public.resolve_ai_quota(v_user), 50);
  select calls into v_used from public.ai_usage
   where user_id = v_user and day = v_day;

  select s.id, s.name, s.daily_ai_limit into v_school, v_school_name, v_school_limit
    from public.profiles p
    join public.schools s on s.id = p.school_id
   where p.id = v_user;
  if v_school is not null then
    select calls into v_school_used from public.school_ai_usage
     where school_id = v_school and day = v_day;
  end if;

  return jsonb_build_object(
    'used', coalesce(v_used, 0),
    'limit', v_limit,
    'remaining', greatest(v_limit - coalesce(v_used, 0), 0),
    'school', case when v_school is null then null else jsonb_build_object(
      'name', v_school_name,
      'used', coalesce(v_school_used, 0),
      'limit', v_school_limit
    ) end
  );
end; $$;

-- Admin management ------------------------------------------------------------

-- Create a school (optionally with a pooled daily limit). Returns its id.
create or replace function public.create_school(p_name text, p_limit integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create schools';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'School name is required';
  end if;
  if p_limit is not null and p_limit < 0 then
    raise exception 'Limit must be null (no pooled cap) or a non-negative integer';
  end if;
  insert into public.schools (name, daily_ai_limit)
  values (trim(p_name), p_limit)
  returning id into v_id;
  return v_id;
end; $$;

-- Set (or clear, with null) a school's pooled daily limit, by name.
create or replace function public.set_school_ai_quota(p_name text, p_limit integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change school quotas';
  end if;
  if p_limit is not null and p_limit < 0 then
    raise exception 'Limit must be null (no pooled cap) or a non-negative integer';
  end if;
  update public.schools set daily_ai_limit = p_limit where name = trim(p_name);
  if not found then
    raise exception 'No school named "%"', p_name;
  end if;
end; $$;

-- Place a user in a school (or remove them, with a null school name).
-- Addressed by username + school name for admin-console usability.
create or replace function public.assign_user_school(p_username text, p_school_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can assign users to schools';
  end if;
  if p_school_name is not null then
    select id into v_school from public.schools where name = trim(p_school_name);
    if v_school is null then
      raise exception 'No school named "%"', p_school_name;
    end if;
  end if;
  update public.profiles set school_id = v_school where username = p_username;
  if not found then
    raise exception 'No user with username "%"', p_username;
  end if;
end; $$;

-- Reviewer-gated overview for the admin dashboard: every school with its
-- member count and today's pooled usage.
create or replace function public.list_schools()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can list schools';
  end if;
  select coalesce(jsonb_agg(row_obj order by row_obj->>'name'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'daily_ai_limit', s.daily_ai_limit,
      'members', (select count(*) from public.profiles p where p.school_id = s.id),
      'used_today', coalesce((
        select u.calls from public.school_ai_usage u
         where u.school_id = s.id and u.day = (now() at time zone 'utc')::date), 0)
    ) as row_obj
    from public.schools s
  ) sub;
  return v_result;
end; $$;

-- =============================================================================
-- §13 · Stripe billing integration
--
-- Adds Stripe-related columns to profiles and a subscriptions table that the
-- Stripe webhook handler (api/stripe-webhook.ts) writes to.  The client
-- reads `stripe_plan` from the profile to resolve entitlements; the rest is
-- bookkeeping so the admin dashboard can display billing state.
-- =============================================================================

-- Extend profiles with Stripe identity and plan cache.
alter table public.profiles
  add column if not exists stripe_customer_id  text,
  add column if not exists stripe_plan         text not null default 'free',
  add column if not exists plan_period_end     timestamptz;

create unique index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- School seat licences: a teacher/admin buys N seats for their school; every
-- member of that school (profiles.school_id, §12) holds the 'school' plan
-- while the subscription is active. Seats are the billed quantity — member
-- counts are visible to reviewers for true-up, not hard-enforced per login.
alter table public.schools
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_seats             integer not null default 0,
  add column if not exists plan_status            text not null default 'none',
  add column if not exists plan_period_end        timestamptz;

-- Detailed subscription record — one active row per user. Kept in sync by
-- the webhook handler on customer.subscription.created/updated/deleted.
create table if not exists public.subscriptions (
  id                    text primary key,        -- Stripe subscription ID (sub_…)
  user_id               uuid not null references public.profiles (id) on delete cascade,
  stripe_customer_id    text not null,
  status                text not null,           -- active | past_due | canceled | …
  price_id              text not null,
  plan                  text not null default 'plus',
  current_period_start  timestamptz not null,
  current_period_end    timestamptz not null,
  cancel_at_period_end  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Seat count for school licences (quantity on the Stripe subscription item);
-- 1 for individual Plus subscriptions.
alter table public.subscriptions add column if not exists seats integer not null default 1;

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

-- RLS: users can read their own subscription, admins can read all.
alter table public.subscriptions enable row level security;

do $$ begin
  create policy "Users read own subscriptions"
    on public.subscriptions for select
    using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins read all subscriptions"
    on public.subscriptions for select
    using (public.is_admin());
exception when duplicate_object then null; end $$;

-- Webhook handler writes via service-role key, so no insert/update policy
-- is needed for authenticated users.

-- Helper: resolve a user's active plan from their subscription state.
-- Returns 'plus' | 'school' | 'free'.  Called from getUserPlan on the
-- client via the profile's stripe_plan column (cached by the webhook).
-- `past_due` keeps the plan: Stripe is still retrying the charge (grace
-- period) — mirrors the webhook's handleSubscriptionUpsert rule.
create or replace function public.resolve_stripe_plan(p_user_id uuid)
returns text language sql stable security definer as $$
  select coalesce(
    (select s.plan from public.subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'trialing', 'past_due')
      order by s.current_period_end desc
      limit 1),
    'free'
  );
$$;

-- Webhook event ledger — makes delivery idempotent.  Stripe guarantees
-- AT-LEAST-once delivery and no ordering, so the same event can arrive twice
-- (a retry after a slow response) and an older event can arrive after a newer
-- one.  api/stripe-webhook.ts claims each event id here before handling it and
-- releases the claim if handling throws, so a genuine failure is still retried.
create table if not exists public.stripe_events (
  id             text primary key,          -- Stripe event ID (evt_…)
  type           text not null,
  event_created  timestamptz,               -- event.created, for ordering
  received_at    timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- Service-role writes only; readable by reviewers for delivery debugging.
do $$ begin
  create policy "Reviewers read stripe events"
    on public.stripe_events for select
    using (public.is_reviewer());
exception when duplicate_object then null; end $$;

-- Ordering guard: the timestamp of the newest event applied to this
-- subscription row.  handleSubscriptionUpsert refuses to apply an event older
-- than this, so a delayed `customer.subscription.updated` cannot resurrect a
-- plan that a later `deleted` already ended.
alter table public.subscriptions
  add column if not exists last_event_at timestamptz;

-- =============================================================================
-- §14 · Free-tier evaluation limit (server-side)
--
-- The paywall's headline limit — 5 marked answers a day on the free plan — was
-- only ever counted in localStorage, so clearing site data reset it.  This is
-- the authoritative counter: api/gemini.ts spends one unit per evaluation
-- request before the provider call is made.  The client keeps its own optimistic
-- count purely so the UI can say "3 of 5 left" without a round trip.
--
-- Distinct from the AI quota (§11–12), which meters TOTAL provider calls to
-- protect the budget.  This meters one product feature to protect the paywall,
-- and only bites on the free tier.
-- =============================================================================

create table if not exists public.evaluation_usage (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  day          date not null,
  evaluations  integer not null default 0,
  primary key (user_id, day)
);

alter table public.evaluation_usage enable row level security;

-- Your own usage, or any row for reviewers. No write policy: the only write
-- path is consume_evaluation() below.
do $$ begin
  create policy "Users read own evaluation usage"
    on public.evaluation_usage for select
    using (user_id = auth.uid() or public.is_reviewer());
exception when duplicate_object then null; end $$;

-- Adjustable commercial settings.  The paywall's numbers used to be constants
-- compiled into two places (this file and the client bundle), so changing the
-- free allowance meant a migration AND a release.  This table makes the ones
-- worth tuning live: an admin changes a row, and the next evaluation is metered
-- against the new value.  The shipped default stays in the function below, so a
-- database with no row behaves exactly as before.
create table if not exists public.plan_settings (
  key         text primary key,
  value       integer not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

alter table public.plan_settings enable row level security;

-- Readable by anyone signed in (the client shows the number it is held to);
-- writable only through set_plan_setting() below, which checks for admin.
do $$ begin
  create policy "Signed-in users read plan settings"
    on public.plan_settings for select
    using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Daily free-tier evaluation allowance.  The DEFAULT below must match
-- FREE_TIER_EVAL_LIMIT in services/planLimits.ts (pinned by
-- tests/unit/entitlementConstants.test.ts); a plan_settings row overrides it
-- for this deployment without a code change.
create or replace function public.free_evaluation_limit()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from public.plan_settings where key = 'free_evaluation_limit'),
    5
  );
$$;

-- Admin-only setter, so the allowance can be tuned from the app rather than
-- the SQL editor.  Bounded: a negative allowance is meaningless and an absurd
-- one is almost certainly a typo that would quietly give the product away.
create or replace function public.set_plan_setting(p_key text, p_value integer)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change plan settings';
  end if;
  if p_key not in ('free_evaluation_limit') then
    raise exception 'Unknown plan setting %', p_key;
  end if;
  if p_value is null or p_value < 0 or p_value > 1000 then
    raise exception 'Plan setting % out of range (0-1000)', p_key;
  end if;

  insert into public.plan_settings (key, value, updated_by)
  values (p_key, p_value, auth.uid())
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  return p_value;
end; $$;

revoke all on function public.set_plan_setting(text, integer) from public;
grant execute on function public.set_plan_setting(text, integer) to authenticated;

-- True when the user should never be metered: staff (content authors need the
-- tool to work), a personal paid plan, or membership of a school whose licence
-- is live.  Mirrors getUserPlan() in services/entitlements.ts, including the
-- past_due grace period.
create or replace function public.has_unlimited_evaluations(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      left join public.schools s on s.id = p.school_id
     where p.id = p_user
       and (
         p.role in ('admin', 'teacher')
         or coalesce(p.stripe_plan, 'free') in ('plus', 'school')
         or coalesce(s.plan_status, 'none') in ('active', 'trialing', 'past_due')
       )
  );
$$;

-- Atomically spend one evaluation from the caller's daily free allowance.
-- Returns { allowed, used, limit, unlimited }.  The conditional ON CONFLICT
-- update makes check-and-increment a single statement, so two tabs racing the
-- last free evaluation cannot both win (same pattern as consume_ai_quota).
create or replace function public.consume_evaluation()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_limit integer := public.free_evaluation_limit();
  v_used  integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if public.has_unlimited_evaluations(v_user) then
    return jsonb_build_object('allowed', true, 'used', 0, 'limit', -1, 'unlimited', true);
  end if;

  insert into public.evaluation_usage (user_id, day, evaluations)
  values (v_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set evaluations = evaluation_usage.evaluations + 1
    where evaluation_usage.evaluations < v_limit
  returning evaluations into v_used;

  if v_used is null then
    -- Conditional update matched nothing: today's allowance is spent.
    select evaluations into v_used
      from public.evaluation_usage
     where user_id = v_user and day = (now() at time zone 'utc')::date;
    return jsonb_build_object(
      'allowed', false, 'used', coalesce(v_used, v_limit), 'limit', v_limit, 'unlimited', false);
  end if;

  return jsonb_build_object(
    'allowed', true, 'used', v_used, 'limit', v_limit, 'unlimited', false);
end; $$;

-- Read-only view of today's evaluation allowance (does not consume), so the
-- client can show an accurate count instead of trusting localStorage.
create or replace function public.get_evaluation_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_limit integer := public.free_evaluation_limit();
  v_used  integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if public.has_unlimited_evaluations(v_user) then
    return jsonb_build_object('used', 0, 'limit', -1, 'unlimited', true);
  end if;

  select evaluations into v_used
    from public.evaluation_usage
   where user_id = v_user and day = (now() at time zone 'utc')::date;

  return jsonb_build_object(
    'used', coalesce(v_used, 0), 'limit', v_limit, 'unlimited', false);
end; $$;

-- =============================================================================
-- §15 · User agreement acceptance and onboarding
--
-- The durable record of which agreement version a user accepted, and when.
-- Written by services/agreementService.ts as a SOFT update, separate from the
-- main profile write: a deployment that has not run this section yet keeps
-- working (users are simply re-prompted each session) rather than failing
-- every profile save.
--
-- Re-prompting everyone after an agreement change is done in the CLIENT by
-- bumping AGREEMENT_VERSION in data/legalContent.ts — no SQL required. These
-- columns only store what was accepted, so an audit can answer "who agreed to
-- what, and when".
--
-- Idempotent: safe to re-run against an existing database.
-- =============================================================================

alter table public.profiles
  add column if not exists agreement_version      text,
  add column if not exists agreement_accepted_at  timestamptz,
  add column if not exists quick_start_seen_version text;

comment on column public.profiles.agreement_version is
  'AGREEMENT_VERSION (data/legalContent.ts) the user last accepted. Null = never accepted.';
comment on column public.profiles.agreement_accepted_at is
  'When the user accepted agreement_version.';
comment on column public.profiles.quick_start_seen_version is
  'QUICK_START_VERSION the user has been shown, so the guide stops auto-opening.';

-- Reporting helper: who is yet to accept the current agreement. Admin-only —
-- ordinary users have no business enumerating other accounts.
create or replace function public.agreement_acceptance_report(p_version text)
returns table (
  user_id      uuid,
  username     text,
  role         app_role,
  accepted     boolean,
  accepted_at  timestamptz
) language sql security definer set search_path = public as $$
  select p.id,
         p.username,
         p.role,
         (p.agreement_version is not distinct from p_version),
         p.agreement_accepted_at
    from public.profiles p
   where public.is_admin()
   order by p.username;
$$;

-- =============================================================================
-- §16 · Data rights — self-service account deletion
--
-- The Privacy Notice tells users they can have their data deleted. This makes
-- that true without an administrator in the loop.
--
-- The target is derived from auth.uid() and there is deliberately NO user-id
-- parameter: the function cannot be aimed at somebody else's account, whatever
-- the caller's role. Deleting the auth user cascades to profiles, and from
-- there to responses, response_events, ai_usage, ai_model_usage and
-- evaluation_usage.
--
-- What SURVIVES, by design: content the user contributed to the shared library
-- (prompts, sample answers, courses). Those rows reference profiles with
-- `on delete set null`, so the content stays and the authorship link is
-- severed. Other schools depend on that content, and once created_by is null
-- it holds no personal data. The Privacy Notice says exactly this.
--
-- NOTE: this runs as SECURITY DEFINER so it can delete from auth.users, which
-- ordinary roles cannot touch. Create it as the `postgres` owner (running this
-- file in the Supabase SQL editor does that). If your deployment forbids that,
-- leave the function out — the client degrades to telling the user to contact
-- an administrator rather than silently reporting success.
-- =============================================================================

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = v_user;
end; $$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- =============================================================================
-- §17 · Caller plan resolution (server-side entitlements)
--
-- Which plan the CALLER holds, decided by the database rather than by the
-- browser.  The AI proxy (api/gemini.ts) asks this before serving a call
-- tagged as a paid feature — answer upgrades, the AI content studio — so those
-- gates are enforced somewhere the user cannot edit.  Before this, they were
-- enforced in the UI alone: the button was locked, the endpoint was not.
--
-- The order mirrors getUserPlan() in services/entitlements.ts exactly:
--   1. admins hold the most permissive plan, so nothing is locked for them;
--   2. an explicit paid plan on the profile (written by the Stripe webhook);
--   3. membership of a school whose licence is live (past_due included — the
--      same grace period the webhook and has_unlimited_evaluations honour);
--   4. the teacher staff perk;
--   5. free.
--
-- Idempotent: safe to re-run against an existing database.
-- =============================================================================

create or replace function public.caller_plan()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case
        when p.role = 'admin' then 'school'
        when coalesce(p.stripe_plan, 'free') in ('plus', 'school') then p.stripe_plan
        when coalesce(s.plan_status, 'none') in ('active', 'trialing', 'past_due') then 'school'
        when p.role = 'teacher' then 'plus'
        else 'free'
      end
       from public.profiles p
       left join public.schools s on s.id = p.school_id
      where p.id = auth.uid()),
    'free'
  );
$$;

revoke all on function public.caller_plan() from public;
grant execute on function public.caller_plan() to authenticated;

-- ----------------------------------------------------------------------------
-- 13. Marks-based weakness ranking.
--
--     WHY THIS SECTION EXISTS. get_class_analytics() and get_student_progress()
--     ranked a cohort's weaknesses by `low_band_rate` — the share of attempts
--     scoring band 3 or below. That measure is not comparable across questions,
--     because the Verb Gate caps a question's band at its verb's cognitive tier
--     (see getBandForMark in data/commandTerms.ts): full marks on an IDENTIFY
--     question is band 1, and on an EXPLAIN question band 3. Every tier 1–3
--     verb therefore reported a 100% "struggling" rate for every student,
--     however well they answered, while tier 6 verbs looked healthy on far worse
--     work. The ranking measured verb tier, not weakness — and inverted it.
--
--     Worse, a band-relative-to-ceiling measure does not fix it either: on a
--     tier-1 question every non-zero mark maps to band 1, so the band scale has
--     exactly one value there and half marks are indistinguishable from full.
--
--     The measure that is well defined at every tier is the MARK: the share of
--     the available marks the student actually earned. Bands remain the right
--     thing to REPORT against the NESA descriptors (and are still returned);
--     they are the wrong thing to RANK on. `low_band_rate` is kept in the
--     payload for display and backwards compatibility.
--
--     On an existing deployment, run this section alone as the migration — it
--     only replaces two functions.
-- ----------------------------------------------------------------------------

-- Class analytics, ranked on marks -------------------------------------------
-- Adds `avg_mark_frac` (mean share of available marks earned, 0–1) to every
-- dimension row and to the totals. Attempts on a question with no marks
-- recorded (total_marks 0 or null) contribute nothing to that average — avg()
-- skips nulls — but are still counted in `attempts`, so a bank with unmarked
-- questions shows a smaller evidence base rather than a skewed average.
create or replace function public.get_class_analytics(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days    integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since   timestamptz := (now() at time zone 'utc') - make_interval(days => v_days);
  v_byverb  jsonb;
  v_bytopic jsonb;
  v_totals  jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can view class analytics';
  end if;

  select coalesce(jsonb_agg(row_obj order by (row_obj->>'attempts')::int desc), '[]'::jsonb)
    into v_byverb
  from (
    select jsonb_build_object(
      'label', coalesce(nullif(btrim(p.verb), ''), 'Unspecified'),
      'attempts', count(*),
      'students', count(distinct r.user_id),
      'avg_mark', round(avg(r.overall_mark)::numeric, 1),
      'avg_band', round(avg(r.overall_band)::numeric, 2),
      'low_band_rate', round(avg((r.overall_band <= 3)::int)::numeric, 3),
      'avg_mark_frac',
        round(avg(r.overall_mark::numeric / nullif(p.total_marks, 0))::numeric, 3)
    ) as row_obj
    from public.responses r
    join public.prompts p on p.id = r.prompt_id
    where r.created_at >= v_since
      and r.overall_band is not null
    group by coalesce(nullif(btrim(p.verb), ''), 'Unspecified')
  ) sub;

  select coalesce(jsonb_agg(row_obj order by (row_obj->>'attempts')::int desc), '[]'::jsonb)
    into v_bytopic
  from (
    select jsonb_build_object(
      'label', coalesce(nullif(btrim(t.name), ''), 'Uncategorised'),
      'attempts', count(*),
      'students', count(distinct r.user_id),
      'avg_mark', round(avg(r.overall_mark)::numeric, 1),
      'avg_band', round(avg(r.overall_band)::numeric, 2),
      'low_band_rate', round(avg((r.overall_band <= 3)::int)::numeric, 3),
      'avg_mark_frac',
        round(avg(r.overall_mark::numeric / nullif(p.total_marks, 0))::numeric, 3)
    ) as row_obj
    from public.responses r
    join public.prompts p    on p.id = r.prompt_id
    join public.dot_points d on d.id = p.dot_point_id
    join public.sub_topics s on s.id = d.sub_topic_id
    join public.topics t     on t.id = s.topic_id
    where r.created_at >= v_since
      and r.overall_band is not null
    group by coalesce(nullif(btrim(t.name), ''), 'Uncategorised')
  ) sub;

  select jsonb_build_object(
    'total_attempts', count(*),
    'active_students', count(distinct r.user_id),
    'avg_band', round(avg(r.overall_band)::numeric, 2),
    'avg_mark_frac', round(avg(r.overall_mark::numeric / nullif(p.total_marks, 0))::numeric, 3)
  ) into v_totals
  from public.responses r
  join public.prompts p on p.id = r.prompt_id
  where r.created_at >= v_since
    and r.overall_band is not null;

  return jsonb_build_object('byVerb', v_byverb, 'byTopic', v_bytopic, 'totals', v_totals);
end; $$;

-- Per-student progress, ranked on marks --------------------------------------
-- Same addition as above, so a single student's per-verb rows can be ranked by
-- the same measure as the cohort's.
create or replace function public.get_student_progress(p_username text, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since  timestamptz := (now() at time zone 'utc') - make_interval(days => v_days);
  v_user   uuid;
  v_byverb jsonb;
  v_totals jsonb;
  v_trend  jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only admins/teachers can view student progress';
  end if;

  select id into v_user from public.profiles where username = p_username;
  if v_user is null then
    raise exception 'No user with username "%"', p_username;
  end if;

  select coalesce(jsonb_agg(row_obj order by (row_obj->>'attempts')::int desc), '[]'::jsonb)
    into v_byverb
  from (
    select jsonb_build_object(
      'label', coalesce(nullif(btrim(p.verb), ''), 'Unspecified'),
      'attempts', count(*),
      'students', 1,
      'avg_mark', round(avg(r.overall_mark)::numeric, 1),
      'avg_band', round(avg(r.overall_band)::numeric, 2),
      'low_band_rate', round(avg((r.overall_band <= 3)::int)::numeric, 3),
      'avg_mark_frac',
        round(avg(r.overall_mark::numeric / nullif(p.total_marks, 0))::numeric, 3)
    ) as row_obj
    from public.responses r
    join public.prompts p on p.id = r.prompt_id
    where r.user_id = v_user and r.created_at >= v_since and r.overall_band is not null
    group by coalesce(nullif(btrim(p.verb), ''), 'Unspecified')
  ) sub;

  select jsonb_build_object(
    'total_attempts', count(*),
    'active_students', case when count(*) > 0 then 1 else 0 end,
    'avg_band', round(avg(r.overall_band)::numeric, 2),
    'avg_mark_frac', round(avg(r.overall_mark::numeric / nullif(p.total_marks, 0))::numeric, 3)
  ) into v_totals
  from public.responses r
  join public.prompts p on p.id = r.prompt_id
  where r.user_id = v_user and r.created_at >= v_since and r.overall_band is not null;

  -- Band trend from the append-only history (oldest→newest), capped to the most
  -- recent 100 scored events in the window so the sparkline stays bounded.
  select coalesce(
           jsonb_agg(jsonb_build_object('at', e.created_at, 'band', e.band, 'mark', e.mark)
                     order by e.created_at asc),
           '[]'::jsonb
         )
    into v_trend
  from (
    select created_at, band, mark
    from public.response_events
    where user_id = v_user and created_at >= v_since and band is not null
    order by created_at desc
    limit 100
  ) e;

  return jsonb_build_object(
    'username', p_username, 'byVerb', v_byverb, 'totals', v_totals, 'trend', v_trend
  );
end; $$;

-- =============================================================================
-- End of schema.
-- Next: run supabase/seed.mjs to import courseData/*.json as approved content.
-- =============================================================================
