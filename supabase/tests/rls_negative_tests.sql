-- =============================================================================
-- RLS negative tests — prove the authorisation boundaries actually hold, not
-- just that they look right on paper.
--
-- Where this runs:
--   * CI: against a plain Postgres container, after the compat shim + schema +
--     grants (see supabase/tests/ci/ and .github/workflows/build.yml). Run with
--     `psql -v ON_ERROR_STOP=1` so a regression aborts the job non-zero.
--   * A real Supabase project: paste into the SQL editor after schema.sql.
--
-- Technique: the editor / psql connects as a superuser, which bypasses RLS. To
-- test as a real end-user we, per block:
--   1. set the `request.jwt.claims` GUC so `auth.uid()` resolves to a chosen
--      profile id, exactly like PostgREST does for a real session, then
--   2. `set local role authenticated;` to adopt the RLS-bound role.
-- Each block is its own transaction and is rolled back, so this is safe to run
-- against a project with real data.
--
-- Expected result for every block: the privileged action FAILS (raises, or
-- affects/returns 0 rows). If a block instead succeeds, the matching
-- policy/trigger has regressed and the `raise exception` aborts the run.
-- =============================================================================

-- ---- Setup -------------------------------------------------------------------
-- profiles.id FKs to auth.users, so we seed the auth user first and let the
-- on_auth_user_created trigger create the matching profile (as 'student');
-- inserting into public.profiles directly would violate that FK.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls_test_student_a@example.test',
   '{"username":"rls_test_student_a","display_name":"RLS Test A"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'rls_test_student_b@example.test',
   '{"username":"rls_test_student_b","display_name":"RLS Test B"}'),
  ('00000000-0000-0000-0000-0000000000a9', 'rls_test_admin@example.test',
   '{"username":"rls_test_admin","display_name":"RLS Test Admin"}')
on conflict (id) do nothing;

update public.profiles set role = 'student'
 where id in ('00000000-0000-0000-0000-0000000000a1',
              '00000000-0000-0000-0000-0000000000a2');
update public.profiles set role = 'admin'
 where id = '00000000-0000-0000-0000-0000000000a9';

-- Minimal curriculum so test 3 (prompt approval) has a dot_point to attach to.
insert into public.courses (id, name, status, created_by)
  values ('00000000-0000-0000-0000-0000000000c1', 'RLS Test Course', 'approved',
          '00000000-0000-0000-0000-0000000000a9')
  on conflict (id) do nothing;
insert into public.topics (id, course_id, name)
  values ('00000000-0000-0000-0000-0000000000c2',
          '00000000-0000-0000-0000-0000000000c1', 'RLS Test Topic')
  on conflict (id) do nothing;
insert into public.sub_topics (id, topic_id, name)
  values ('00000000-0000-0000-0000-0000000000c3',
          '00000000-0000-0000-0000-0000000000c2', 'RLS Test SubTopic')
  on conflict (id) do nothing;
insert into public.dot_points (id, sub_topic_id, description)
  values ('00000000-0000-0000-0000-0000000000c4',
          '00000000-0000-0000-0000-0000000000c3', 'RLS Test DotPoint')
  on conflict (id) do nothing;
commit;

-- ---- 1. A student cannot self-promote to admin ------------------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
begin
  update public.profiles set role = 'admin'
   where id = '00000000-0000-0000-0000-0000000000a1';
  raise exception 'TEST FAILED: student was able to self-promote to admin';
exception
  when others then
    if sqlerrm = 'TEST FAILED: student was able to self-promote to admin' then
      raise;
    end if;
    raise notice 'PASS: self-promotion blocked (%, %)', sqlstate, sqlerrm;
end $$;
rollback;

-- ---- 2. A student cannot read another student's full profile ----------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.profiles
   where id = '00000000-0000-0000-0000-0000000000a2';
  if n > 0 then
    raise exception 'TEST FAILED: student could read another student''s profile (% rows)', n;
  end if;
  raise notice 'PASS: cross-user profile read returns 0 rows';
end $$;
rollback;

-- ---- 3. A student cannot approve their own pending prompt --------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
declare v_dot_point_id uuid; v_prompt_id uuid;
begin
  -- Reuse any existing dot_point as a parent; skip cleanly if none exist.
  select id into v_dot_point_id from public.dot_points limit 1;
  if v_dot_point_id is null then
    raise notice 'SKIP: no dot_points present to attach a test prompt to';
    return;
  end if;

  insert into public.prompts (dot_point_id, question, status, created_by)
  values (v_dot_point_id, 'RLS test prompt', 'pending', '00000000-0000-0000-0000-0000000000a1')
  returning id into v_prompt_id;

  begin
    perform public.approve_prompt(v_prompt_id);
    raise exception 'TEST FAILED: student was able to approve their own prompt';
  exception
    when others then
      if sqlerrm = 'TEST FAILED: student was able to approve their own prompt' then
        raise;
      end if;
      raise notice 'PASS: non-reviewer approve_prompt() blocked (%, %)', sqlstate, sqlerrm;
  end;
end $$;
rollback;

-- ---- 4. A student cannot attribute content to someone else -------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
begin
  insert into public.courses (name, status, created_by)
  values ('RLS spoof test', 'private', '00000000-0000-0000-0000-0000000000a2');
  raise exception 'TEST FAILED: student inserted a course attributed to another user';
exception
  when others then
    if sqlerrm = 'TEST FAILED: student inserted a course attributed to another user' then
      raise;
    end if;
    raise notice 'PASS: created_by spoofing on insert blocked (%, %)', sqlstate, sqlerrm;
end $$;
rollback;

-- ---- 5. A student cannot promote anyone via the set_user_role() RPC ----------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
begin
  perform public.set_user_role('00000000-0000-0000-0000-0000000000a1', 'admin');
  raise exception 'TEST FAILED: student promoted themselves via set_user_role()';
exception
  when others then
    if sqlerrm = 'TEST FAILED: student promoted themselves via set_user_role()' then
      raise;
    end if;
    raise notice 'PASS: set_user_role() rejects non-admin callers (%, %)', sqlstate, sqlerrm;
end $$;
rollback;

-- ---- 6. POSITIVE CONTROL: an admin CAN change another user's role ------------
-- Proves the trigger blocks self-escalation without over-blocking the
-- legitimate admin path — otherwise tests 1/5 would "pass" simply because role
-- changes are impossible for everyone.
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
set local role authenticated;

do $$
declare v_role app_role;
begin
  perform public.set_user_role('00000000-0000-0000-0000-0000000000a2', 'teacher');
  -- The admin is a reviewer, so profiles_read lets them read the row back.
  select role into v_role from public.profiles
   where id = '00000000-0000-0000-0000-0000000000a2';
  if v_role is distinct from 'teacher' then
    raise exception 'TEST FAILED: admin could not promote student to teacher (got %)', v_role;
  end if;
  raise notice 'PASS: admin promoted student to teacher via set_user_role()';
end $$;
rollback;

-- ---- Cleanup ------------------------------------------------------------------
begin;
-- Deleting the course cascades to its topics/sub_topics/dot_points/prompts;
-- deleting the auth users cascades to their profiles.
delete from public.courses where id = '00000000-0000-0000-0000-0000000000c1';
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a9'
);
commit;
