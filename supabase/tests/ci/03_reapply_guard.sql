-- =============================================================================
-- Re-apply guard — FOR CI / LOCAL POSTGRES TESTING ONLY.
--
-- schema.sql is designed to be re-run, and the operator instructions say so. It
-- must therefore never MUTATE data on a second apply. It did: the structural
-- moderation migration backfilled
--
--     update <table> set status = 'approved'
--      where created_by is null and status = 'private'
--
-- on every apply. That predicate is right on the migration that introduces the
-- column, and wrong forever after — it also describes an ordinary unmoderated
-- row, including anything `seed.mjs` writes without SEED_ADMIN_ID set. A routine
-- re-apply silently published it.
--
-- This cannot be asserted from inside the schema's own test files, which cannot
-- re-run schema.sql. So it is a two-step check driven by the workflow:
--
--   1. psql -f 03_reapply_guard.sql            (arm: write a private row)
--   2. psql -f supabase/schema.sql             (the re-apply under test)
--   3. psql -f 03_reapply_guard.sql -v check=1 (assert: still private)
--
-- The AI pre-screen migration is the second thing here for the same reason. It
-- nulls the quality scores written back when the browser chose them, and it
-- runs on every apply — so it is a data mutation that has to keep matching only
-- the rows it was written for. It tells them apart by `quality_screened_at`,
-- and the fixtures below are one of each: a score the server wrote must still
-- be there afterwards, and a legacy client-written one must not.
-- =============================================================================

\if :{?check}
do $$
declare v_status text;
begin
  select status into v_status from public.topics
   where id = '00000000-0000-0000-0000-00000000ba01';
  if v_status is null then
    raise exception 'TEST FAILED: the guard fixture is missing — step 1 did not run';
  end if;
  if v_status <> 'private' then
    raise exception
      'TEST FAILED: re-applying schema.sql published an unmoderated topic (status=%)', v_status;
  end if;
  raise notice 'PASS: re-applying schema.sql does not publish unmoderated content';
end $$;

do $$
declare v_trusted int; v_legacy int;
begin
  select quality_score into v_trusted from public.prompts
   where id = '00000000-0000-0000-0000-00000000ba05';
  select quality_score into v_legacy from public.prompts
   where id = '00000000-0000-0000-0000-00000000ba06';
  if v_trusted is null then
    raise exception 'TEST FAILED: re-applying schema.sql wiped a server-written pre-screen';
  end if;
  if v_legacy is not null then
    raise exception
      'TEST FAILED: a client-written pre-screen survived the cleanup (score %)', v_legacy;
  end if;
  raise notice 'PASS: the pre-screen cleanup keeps server scores and drops client ones';
end $$;

delete from public.courses where id = '00000000-0000-0000-0000-00000000ba00';
\else
insert into public.courses (id, name, status)
  values ('00000000-0000-0000-0000-00000000ba00', 'Re-apply Guard Course', 'approved')
  on conflict (id) do nothing;
-- created_by null + status private: exactly what the backfill used to match.
insert into public.topics (id, course_id, name, status, created_by)
  values ('00000000-0000-0000-0000-00000000ba01',
          '00000000-0000-0000-0000-00000000ba00', 'Unmoderated Topic', 'private', null)
  on conflict (id) do update set status = 'private', created_by = null;

-- Somewhere to hang the two pre-screen fixtures.
insert into public.sub_topics (id, topic_id, name, status)
  values ('00000000-0000-0000-0000-00000000ba03',
          '00000000-0000-0000-0000-00000000ba01', 'Guard SubTopic', 'approved')
  on conflict (id) do nothing;
insert into public.dot_points (id, sub_topic_id, description, status)
  values ('00000000-0000-0000-0000-00000000ba04',
          '00000000-0000-0000-0000-00000000ba03', 'Guard dot point', 'approved')
  on conflict (id) do nothing;

-- Screened by the endpoint: has a timestamp, so the cleanup must leave it be.
insert into public.prompts (id, dot_point_id, question, status,
                            quality_score, quality_notes, quality_screened_at)
  values ('00000000-0000-0000-0000-00000000ba05',
          '00000000-0000-0000-0000-00000000ba04', 'Server-screened guard prompt', 'private',
          62, 'Screened server-side.', now())
  on conflict (id) do update
    set quality_score = 62, quality_notes = 'Screened server-side.', quality_screened_at = now();

-- Written by a browser under the old rule: no timestamp, so it must be cleared.
insert into public.prompts (id, dot_point_id, question, status,
                            quality_score, quality_notes, quality_screened_at)
  values ('00000000-0000-0000-0000-00000000ba06',
          '00000000-0000-0000-0000-00000000ba04', 'Client-scored guard prompt', 'private',
          100, 'Scored by its own author.', null)
  on conflict (id) do update
    set quality_score = 100, quality_notes = 'Scored by its own author.', quality_screened_at = null;
\endif
