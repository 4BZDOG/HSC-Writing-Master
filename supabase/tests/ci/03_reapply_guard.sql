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
\endif
