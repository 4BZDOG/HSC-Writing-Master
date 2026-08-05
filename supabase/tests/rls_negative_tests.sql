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
-- Structure is now status-bearing (moderated like prompts); seed it as approved
-- canonical content so the authenticated test sessions can see it downstream.
insert into public.topics (id, course_id, name, status)
  values ('00000000-0000-0000-0000-0000000000c2',
          '00000000-0000-0000-0000-0000000000c1', 'RLS Test Topic', 'approved')
  on conflict (id) do nothing;
insert into public.sub_topics (id, topic_id, name, status)
  values ('00000000-0000-0000-0000-0000000000c3',
          '00000000-0000-0000-0000-0000000000c2', 'RLS Test SubTopic', 'approved')
  on conflict (id) do nothing;
insert into public.dot_points (id, sub_topic_id, description, status)
  values ('00000000-0000-0000-0000-0000000000c4',
          '00000000-0000-0000-0000-0000000000c3', 'RLS Test DotPoint', 'approved')
  on conflict (id) do nothing;
-- A committed PENDING prompt owned by student a1, for the publish-authority
-- tests (self-approve must fail; reviewer approve must succeed).
insert into public.prompts (id, dot_point_id, question, status, created_by)
  values ('00000000-0000-0000-0000-0000000000c5',
          '00000000-0000-0000-0000-0000000000c4', 'Seeded pending prompt', 'pending',
          '00000000-0000-0000-0000-0000000000a1')
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

-- ---- 7. A student cannot insert pre-approved content -------------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
begin
  insert into public.prompts (dot_point_id, question, status, created_by)
  values ('00000000-0000-0000-0000-0000000000c4', 'Sneaky pre-approved prompt',
          'approved', '00000000-0000-0000-0000-0000000000a1');
  raise exception 'TEST FAILED: student inserted content as already-approved';
exception
  when others then
    if sqlerrm = 'TEST FAILED: student inserted content as already-approved' then
      raise;
    end if;
    raise notice 'PASS: pre-approved insert blocked (%, %)', sqlstate, sqlerrm;
end $$;
rollback;

-- ---- 8. A student cannot self-publish their own pending prompt (direct UPDATE)-
-- This is the moderation-bypass hole the status-authority trigger closes: the
-- update policy lets the owner change their row, but the trigger blocks moving
-- `status` to 'approved' from a non-reviewer session.
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
begin
  update public.prompts set status = 'approved'
   where id = '00000000-0000-0000-0000-0000000000c5';
  raise exception 'TEST FAILED: student self-published their own prompt';
exception
  when others then
    if sqlerrm = 'TEST FAILED: student self-published their own prompt' then
      raise;
    end if;
    raise notice 'PASS: self-publish via direct update blocked (%, %)', sqlstate, sqlerrm;
end $$;
rollback;

-- ---- 9. POSITIVE CONTROL: a reviewer CAN approve a pending prompt ------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
set local role authenticated;

do $$
declare v_status content_status;
begin
  perform public.approve_prompt('00000000-0000-0000-0000-0000000000c5');
  select status into v_status from public.prompts
   where id = '00000000-0000-0000-0000-0000000000c5';
  if v_status is distinct from 'approved' then
    raise exception 'TEST FAILED: reviewer approve did not publish (got %)', v_status;
  end if;
  raise notice 'PASS: reviewer approved a pending prompt via approve_prompt()';
end $$;
rollback;

-- ---- 10. An author's edit to their APPROVED row demotes it back to pending ---
-- Without demote-on-edit, an author could get benign content approved and then
-- rewrite its text while it stays published, bypassing review entirely.
begin;
-- Approve the seeded pending prompt first (superuser bypasses the trigger's
-- auth.uid() guard, mirroring the SQL editor / service role).
update public.prompts set status = 'approved'
 where id = '00000000-0000-0000-0000-0000000000c5';

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
declare v_status content_status;
begin
  update public.prompts set question = 'Edited after approval'
   where id = '00000000-0000-0000-0000-0000000000c5';
  select status into v_status from public.prompts
   where id = '00000000-0000-0000-0000-0000000000c5';
  if v_status is distinct from 'pending' then
    raise exception 'TEST FAILED: author edit left approved content published (got %)', v_status;
  end if;
  raise notice 'PASS: author edit on approved content demoted it to pending';
end $$;
rollback;

-- ---- 11. POSITIVE CONTROL: a reviewer's edit keeps the row approved ----------
begin;
update public.prompts set status = 'approved'
 where id = '00000000-0000-0000-0000-0000000000c5';

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
set local role authenticated;

do $$
declare v_status content_status;
begin
  update public.prompts set question = 'Reviewer touch-up'
   where id = '00000000-0000-0000-0000-0000000000c5';
  select status into v_status from public.prompts
   where id = '00000000-0000-0000-0000-0000000000c5';
  if v_status is distinct from 'approved' then
    raise exception 'TEST FAILED: reviewer edit demoted approved content (got %)', v_status;
  end if;
  raise notice 'PASS: reviewer edit kept the row approved';
end $$;
rollback;

-- ---- 12. Structure moderation: a non-reviewer cannot self-publish structure --
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;
do $$
begin
  -- Own private topic is fine…
  insert into public.topics (id, course_id, name, status, created_by)
    values ('00000000-0000-0000-0000-0000000000d2',
            '00000000-0000-0000-0000-0000000000c1', 'Author Topic Draft', 'private',
            '00000000-0000-0000-0000-0000000000a1');
  -- …but publishing it (insert pre-approved) must be blocked by the trigger.
  begin
    insert into public.topics (id, course_id, name, status, created_by)
      values ('00000000-0000-0000-0000-0000000000d3',
              '00000000-0000-0000-0000-0000000000c1', 'Author Topic Cheat', 'approved',
              '00000000-0000-0000-0000-0000000000a1');
    raise exception 'TEST FAILED: a non-reviewer self-published a topic';
  exception when others then
    if sqlerrm not like '%publish, reject%' then raise; end if;
  end;
  raise notice 'PASS: non-reviewer self-publish of structure blocked';
end $$;
rollback;

-- ---- 13. set_structure_status is reviewer-gated and kind-validated -----------
begin;
insert into public.topics (id, course_id, name, status, created_by)
  values ('00000000-0000-0000-0000-0000000000d4',
          '00000000-0000-0000-0000-0000000000c1', 'Pending Topic', 'pending',
          '00000000-0000-0000-0000-0000000000a1')
  on conflict (id) do nothing;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
set local role authenticated;
do $$
begin
  perform public.set_structure_status('topic', '00000000-0000-0000-0000-0000000000d4', 'approved');
  raise exception 'TEST FAILED: a non-reviewer moderated structure';
exception when others then
  if sqlerrm like '%moderate structure%' then
    raise notice 'PASS: non-reviewer structure moderation blocked';
  else raise; end if;
end $$;
rollback;

-- ---- 14. POSITIVE CONTROL: a reviewer approves a pending topic ---------------
begin;
insert into public.topics (id, course_id, name, status, created_by)
  values ('00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000c1', 'Pending Topic 2', 'pending',
          '00000000-0000-0000-0000-0000000000a1')
  on conflict (id) do nothing;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
set local role authenticated;
do $$
declare v_status content_status;
begin
  perform public.set_structure_status('topic', '00000000-0000-0000-0000-0000000000d5', 'approved');
  select status into v_status from public.topics
   where id = '00000000-0000-0000-0000-0000000000d5';
  if v_status is distinct from 'approved' then
    raise exception 'TEST FAILED: reviewer approval did not stick (got %)', v_status;
  end if;
  raise notice 'PASS: reviewer approved a pending topic via set_structure_status()';
end $$;
rollback;

-- =============================================================================
-- Class-scoped analytics (schema §19)
--
-- Before §19, get_class_analytics / get_student_progress / get_response_students
-- were gated on is_reviewer() and then aggregated EVERY row in public.responses,
-- so any teacher could read cohort aggregates and a roster for students they
-- have no relationship with. These blocks prove the scope now holds: teacher A
-- sees only their own class, and cannot reach teacher B's students at all.
-- =============================================================================

begin;
-- Two schools, two teachers, two students, one class each. Teacher A teaches
-- student A; teacher B teaches student B. Neither should see the other's cohort.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'cls_teacher_a@example.test',
   '{"username":"cls_teacher_a","display_name":"Class Teacher A"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'cls_teacher_b@example.test',
   '{"username":"cls_teacher_b","display_name":"Class Teacher B"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'cls_student_a@example.test',
   '{"username":"cls_student_a","display_name":"Class Student A"}'),
  ('00000000-0000-0000-0000-0000000000e4', 'cls_student_b@example.test',
   '{"username":"cls_student_b","display_name":"Class Student B"}'),
  ('00000000-0000-0000-0000-0000000000e9', 'cls_admin@example.test',
   '{"username":"cls_admin","display_name":"Class Admin"}')
on conflict (id) do nothing;

update public.profiles set role = 'teacher'
 where id in ('00000000-0000-0000-0000-0000000000e1',
              '00000000-0000-0000-0000-0000000000e2');
update public.profiles set role = 'admin'
 where id = '00000000-0000-0000-0000-0000000000e9';

insert into public.schools (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Class Test School A'),
  ('00000000-0000-0000-0000-0000000000f2', 'Class Test School B')
on conflict (id) do nothing;

insert into public.classes (id, school_id, name, owner_id, year) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1',
   'Year 12 A', '00000000-0000-0000-0000-0000000000e1', 12),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
   'Year 12 B', '00000000-0000-0000-0000-0000000000e2', 12)
on conflict (id) do nothing;

insert into public.class_members (class_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e3', 'student'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000e4', 'student')
on conflict (class_id, user_id) do nothing;

-- A scored response for each student, on the shared test prompt.
insert into public.responses (prompt_id, user_id, draft, word_count, overall_mark, overall_band)
values
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000e3',
   'student a draft', 3, 4, 3),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000e4',
   'student b draft', 3, 1, 1)
on conflict (user_id, prompt_id) do nothing;

-- Teacher A: sees exactly their own student, never teacher B's.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_roster jsonb;
  v_totals jsonb;
begin
  v_roster := public.get_response_students(365);
  if v_roster::text like '%cls_student_b%' then
    raise exception 'TEST FAILED: teacher A can see another class''s student in the roster: %', v_roster;
  end if;
  if v_roster::text not like '%cls_student_a%' then
    raise exception 'TEST FAILED: teacher A cannot see their own student: %', v_roster;
  end if;
  raise notice 'PASS: roster is scoped to the caller''s own class';

  v_totals := public.get_class_analytics(365) -> 'totals';
  if (v_totals->>'active_students')::int <> 1 then
    raise exception 'TEST FAILED: teacher A aggregated % students, expected 1 (%)',
      v_totals->>'active_students', v_totals;
  end if;
  raise notice 'PASS: class analytics aggregate only the caller''s own cohort';
end $$;
reset role;
rollback;

begin;
-- Same fixture, re-created for an independent transaction (each block rolls back).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'cls_teacher_a@example.test',
   '{"username":"cls_teacher_a","display_name":"Class Teacher A"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'cls_teacher_b@example.test',
   '{"username":"cls_teacher_b","display_name":"Class Teacher B"}'),
  ('00000000-0000-0000-0000-0000000000e4', 'cls_student_b@example.test',
   '{"username":"cls_student_b","display_name":"Class Student B"}')
on conflict (id) do nothing;
update public.profiles set role = 'teacher'
 where id in ('00000000-0000-0000-0000-0000000000e1',
              '00000000-0000-0000-0000-0000000000e2');
insert into public.schools (id, name) values
  ('00000000-0000-0000-0000-0000000000f2', 'Class Test School B')
on conflict (id) do nothing;
insert into public.classes (id, school_id, name, owner_id, year) values
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
   'Year 12 B', '00000000-0000-0000-0000-0000000000e2', 12)
on conflict (id) do nothing;
insert into public.class_members (class_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000e4', 'student')
on conflict (class_id, user_id) do nothing;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
set local role authenticated;
do $$
begin
  -- Naming another teacher's student by username must raise, not return data.
  begin
    perform public.get_student_progress('cls_student_b', 365);
    raise exception 'TEST FAILED: teacher A read progress for a student they do not teach';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: per-student progress refused for a student outside the caller''s classes';
  end;

  -- Naming another teacher's CLASS id must also raise.
  begin
    perform public.get_class_analytics(365, '00000000-0000-0000-0000-0000000000f4');
    raise exception 'TEST FAILED: teacher A read analytics for a class they do not teach';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: class analytics refused for a class the caller does not teach';
  end;

  -- And enrolling into it must be refused.
  begin
    perform public.enrol_in_class('00000000-0000-0000-0000-0000000000f4', 'cls_teacher_a', 'co_teacher');
    raise exception 'TEST FAILED: teacher A enrolled themselves into another teacher''s class';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: self-enrolment into an unowned class refused';
  end;
end $$;
reset role;
rollback;

begin;
-- A teacher with NO classes must see nothing, not everything. This is the
-- fail-closed default the whole section exists for.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e5', 'cls_teacher_none@example.test',
   '{"username":"cls_teacher_none","display_name":"Class Teacher None"}'),
  ('00000000-0000-0000-0000-0000000000e6', 'cls_student_orphan@example.test',
   '{"username":"cls_student_orphan","display_name":"Class Student Orphan"}')
on conflict (id) do nothing;
update public.profiles set role = 'teacher'
 where id = '00000000-0000-0000-0000-0000000000e5';
insert into public.responses (prompt_id, user_id, draft, word_count, overall_mark, overall_band)
values ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000e6',
        'orphan draft', 2, 4, 3)
on conflict (user_id, prompt_id) do nothing;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}';
set local role authenticated;
do $$
declare v_totals jsonb;
begin
  v_totals := public.get_class_analytics(365) -> 'totals';
  if coalesce((v_totals->>'total_attempts')::int, 0) <> 0 then
    raise exception 'TEST FAILED: class-less teacher saw % attempts, expected 0 (%)',
      v_totals->>'total_attempts', v_totals;
  end if;
  if public.get_response_students(365)::text <> '[]' then
    raise exception 'TEST FAILED: class-less teacher saw a non-empty roster: %',
      public.get_response_students(365);
  end if;
  raise notice 'PASS: a teacher with no classes sees nothing (fails closed)';
end $$;

-- The RPCs are not the only way in. Everything above proves the FUNCTIONS are
-- scoped; none of it proves the TABLES are. That gap is exactly how the original
-- §19 shipped with `responses_read` still reading
-- `user_id = auth.uid() or is_reviewer()`: every RPC assertion passed while one
-- `supabase.from('responses').select('draft')` from a browser console — with the
-- anon key that ships in the bundle — returned every student's work in the
-- database. So assert the direct read too.
do $$
declare
  v_rows int;
  v_draft text;
  v_events int;
begin
  select count(*), max(draft) into v_rows, v_draft from public.responses;
  if v_rows <> 0 then
    raise exception
      'TEST FAILED: class-less teacher read % response row(s) directly from the table; leaked draft: %',
      v_rows, v_draft;
  end if;
  raise notice 'PASS: a class-less teacher reads no responses directly from the table';

  select count(*) into v_events from public.response_events;
  if v_events <> 0 then
    raise exception 'TEST FAILED: class-less teacher read % response_events row(s) directly', v_events;
  end if;
  raise notice 'PASS: a class-less teacher reads no response_events directly from the table';
end $$;
reset role;
rollback;

begin;
-- A student must not reach the reviewer analytics at all, class or no class.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e3', 'cls_student_a@example.test',
   '{"username":"cls_student_a","display_name":"Class Student A"}')
on conflict (id) do nothing;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
set local role authenticated;
do $$
begin
  begin
    perform public.visible_student_ids(null);
    raise exception 'TEST FAILED: a student enumerated a cohort';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: visible_student_ids() refused a non-reviewer';
  end;
  begin
    perform public.list_my_classes();
    raise exception 'TEST FAILED: a student listed classes';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: list_my_classes() refused a non-reviewer';
  end;
  begin
    perform public.create_class('Class Test School A', 'Sneaky', 'cls_student_a', 12);
    raise exception 'TEST FAILED: a student created a class';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: create_class() refused a non-admin';
  end;
end $$;
reset role;
rollback;

begin;
-- A teacher must not create a class either — ownership is what grants sight of
-- student work, so it goes through an admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'cls_teacher_a@example.test',
   '{"username":"cls_teacher_a","display_name":"Class Teacher A"}')
on conflict (id) do nothing;
update public.profiles set role = 'teacher'
 where id = '00000000-0000-0000-0000-0000000000e1';
insert into public.schools (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Class Test School A')
on conflict (id) do nothing;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
set local role authenticated;
do $$
begin
  begin
    perform public.create_class('Class Test School A', 'Self Made', 'cls_teacher_a', 12);
    raise exception 'TEST FAILED: a teacher created their own class';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: create_class() is admin-only';
  end;
end $$;
reset role;
rollback;

begin;
-- Positive control: an admin keeps the system-wide view, so the scoping change
-- has not simply blinded everyone.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e9', 'cls_admin@example.test',
   '{"username":"cls_admin","display_name":"Class Admin"}'),
  ('00000000-0000-0000-0000-0000000000e6', 'cls_student_orphan@example.test',
   '{"username":"cls_student_orphan","display_name":"Class Student Orphan"}')
on conflict (id) do nothing;
update public.profiles set role = 'admin'
 where id = '00000000-0000-0000-0000-0000000000e9';
insert into public.responses (prompt_id, user_id, draft, word_count, overall_mark, overall_band)
values ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000e6',
        'orphan draft', 2, 4, 3)
on conflict (user_id, prompt_id) do nothing;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated"}';
set local role authenticated;
do $$
declare v_totals jsonb;
begin
  v_totals := public.get_class_analytics(365) -> 'totals';
  if coalesce((v_totals->>'total_attempts')::int, 0) < 1 then
    raise exception 'TEST FAILED: admin lost the system-wide view (%)', v_totals;
  end if;
  raise notice 'PASS: an admin still sees every cohort';
end $$;
reset role;
rollback;

begin;
-- §20 get_class_cohort() must obey the same class scope as §19, and bucket weeks
-- oldest-first. Teacher A teaches student A only.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'cls_teacher_a@example.test',
   '{"username":"cls_teacher_a","display_name":"Class Teacher A"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'cls_teacher_b@example.test',
   '{"username":"cls_teacher_b","display_name":"Class Teacher B"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'cls_student_a@example.test',
   '{"username":"cls_student_a","display_name":"Class Student A"}'),
  ('00000000-0000-0000-0000-0000000000e4', 'cls_student_b@example.test',
   '{"username":"cls_student_b","display_name":"Class Student B"}')
on conflict (id) do nothing;
update public.profiles set role = 'teacher'
 where id in ('00000000-0000-0000-0000-0000000000e1',
              '00000000-0000-0000-0000-0000000000e2');
insert into public.schools (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Class Test School A'),
  ('00000000-0000-0000-0000-0000000000f2', 'Class Test School B')
on conflict (id) do nothing;
insert into public.classes (id, school_id, name, owner_id, year) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1',
   'Year 12 A', '00000000-0000-0000-0000-0000000000e1', 12),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2',
   'Year 12 B', '00000000-0000-0000-0000-0000000000e2', 12)
on conflict (id) do nothing;
insert into public.class_members (class_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e3', 'student'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000e4', 'student')
on conflict (class_id, user_id) do nothing;

-- Student A: 2 marks of 4 on the shared prompt, plus two history events one week
-- apart so the weekly buckets can be checked. Student B: work teacher A must not see.
-- A prompt WORTH MARKS. The shared fixture prompt (…c5) has total_marks 0, which
-- is itself worth covering: a mark share over a question with no marks recorded
-- must come back null, not 0.
insert into public.prompts (id, dot_point_id, question, status, verb, total_marks, created_by)
  values ('00000000-0000-0000-0000-0000000000c6',
          '00000000-0000-0000-0000-0000000000c4', 'Marked cohort prompt', 'approved',
          'EXPLAIN', 4, '00000000-0000-0000-0000-0000000000e1')
  on conflict (id) do nothing;

insert into public.responses (prompt_id, user_id, draft, word_count, overall_mark, overall_band)
values
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000e3',
   'a', 1, 2, 3),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000e3',
   'a unmarked', 2, 1, 1),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000e4',
   'b', 1, 4, 4)
on conflict (user_id, prompt_id) do nothing;
insert into public.response_events (prompt_id, user_id, mark, band, word_count, created_at)
values
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000e3',
   2, 3, 1, now() - interval '20 days'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000e3',
   3, 3, 1, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000e4',
   4, 4, 1, now() - interval '2 days');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v jsonb;
  v_marks numeric;
begin
  v := public.get_class_cohort(30);

  if v::text like '%cls_student_b%' then
    raise exception 'TEST FAILED: get_class_cohort leaked another class''s student: %', v;
  end if;
  if v::text not like '%cls_student_a%' then
    raise exception 'TEST FAILED: get_class_cohort omitted the caller''s own student: %', v;
  end if;
  raise notice 'PASS: get_class_cohort is scoped to the caller''s own class';

  -- The daily series is built from response_events, so it must count BOTH of
  -- student A's attempts and neither of student B's.
  if (select coalesce(sum((d->>'attempts')::int), 0)
        from jsonb_array_elements(v->'daily') d) <> 2 then
    raise exception 'TEST FAILED: daily attempts wrong, expected 2 — %', v->'daily';
  end if;
  raise notice 'PASS: the daily series counts every attempt of the caller''s cohort only';

  -- 2 of 4 marks on the EXPLAIN question.
  select (s->>'avg_mark_frac')::numeric into v_marks
    from jsonb_array_elements(v->'byStudent') s
   where s->>'username' = 'cls_student_a' and s->>'verb' = 'EXPLAIN';
  if v_marks is distinct from 0.5 then
    raise exception 'TEST FAILED: avg_mark_frac wrong, expected 0.500 — got %', v_marks;
  end if;
  raise notice 'PASS: per-student mark share is the share of available marks';

  -- The same student's attempt on a question carrying NO marks must report null,
  -- not 0 — "nothing recorded" is not "scored nothing", and the client renders
  -- the two differently.
  select (s->>'avg_mark_frac')::numeric into v_marks
    from jsonb_array_elements(v->'byStudent') s
   where s->>'username' = 'cls_student_a' and s->>'verb' = 'Unspecified';
  if v_marks is not null then
    raise exception 'TEST FAILED: a question with no marks reported a share of %', v_marks;
  end if;
  raise notice 'PASS: a question with no marks recorded reports null, not zero';

  -- Weeks are bucketed oldest-first from the window start, so a 20-day-old and a
  -- 2-day-old attempt must not share a bucket.
  if (select count(distinct s->>'week') from jsonb_array_elements(v->'weekly') s) < 1 then
    raise exception 'TEST FAILED: no weekly buckets — %', v->'weekly';
  end if;
  if (v->>'weeks')::int <> 5 then
    raise exception 'TEST FAILED: expected 5 week buckets for a 30-day window, got %', v->>'weeks';
  end if;
  raise notice 'PASS: weekly buckets are oldest-first over the requested window';

  -- Another teacher's class id must be refused, as with §19.
  begin
    perform public.get_class_cohort(30, '00000000-0000-0000-0000-0000000000f4');
    raise exception 'TEST FAILED: read the cohort of a class the caller does not teach';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: get_class_cohort refused an unowned class id';
  end;
end $$;

-- The table policies, as the positive counterpart to the class-less case above:
-- scoping must narrow the teacher's direct reads to their own students, not
-- blind them entirely. Teacher A teaches student A and not student B.
do $$
declare
  v_own int;
  v_other int;
  v_events int;
begin
  select count(*) into v_own from public.responses r
   where r.user_id = '00000000-0000-0000-0000-0000000000e3';
  if v_own < 1 then
    raise exception
      'TEST FAILED: teacher A cannot read their OWN student''s responses directly (scoping over-tightened)';
  end if;

  select count(*) into v_other from public.responses r
   where r.user_id = '00000000-0000-0000-0000-0000000000e4';
  if v_other <> 0 then
    raise exception
      'TEST FAILED: teacher A read % response row(s) belonging to another class''s student', v_other;
  end if;
  raise notice 'PASS: direct table reads are narrowed to the caller''s own students';

  select count(*) into v_events from public.response_events e
   where e.user_id = '00000000-0000-0000-0000-0000000000e4';
  if v_events <> 0 then
    raise exception 'TEST FAILED: teacher A read % response_events row(s) of another class', v_events;
  end if;
  raise notice 'PASS: response_events reads are narrowed the same way';
end $$;
reset role;
rollback;

begin;
-- A student must not reach it at all.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e3', 'cls_student_a@example.test',
   '{"username":"cls_student_a","display_name":"Class Student A"}')
on conflict (id) do nothing;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
set local role authenticated;
do $$
begin
  begin
    perform public.get_class_cohort(30);
    raise exception 'TEST FAILED: a student read the cohort breakdown';
  exception
    when sqlstate '42501' or sqlstate 'P0001' then
      raise notice 'PASS: get_class_cohort refused a non-reviewer';
  end;
end $$;
reset role;
rollback;

-- ---- Cleanup ------------------------------------------------------------------
begin;
-- SECURITY DEFINER functions that take an ARBITRARY user id must not be reachable
-- with the anon key, which ships in the client bundle. Each returns information
-- about whichever uuid you hand it, so a callable one is an enumeration oracle.
--
-- This assertion was impossible before: the CI harness blanket-granted EXECUTE on
-- every public function to anon AFTER schema.sql ran, silently undoing the
-- schema's own revokes. 01_shim.sql now mirrors Supabase's ALTER DEFAULT
-- PRIVILEGES instead, which fires at creation time, so a revoke is observable.
set local role anon;
do $$
declare
  fn text;
  fns text[] := array[
    'select public.resolve_ai_quota(''00000000-0000-0000-0000-000000000001''::uuid)',
    'select public.resolve_stripe_plan(''00000000-0000-0000-0000-000000000001''::uuid)',
    'select public.has_unlimited_evaluations(''00000000-0000-0000-0000-000000000001''::uuid)'
  ];
begin
  foreach fn in array fns loop
    begin
      execute fn;
      raise exception 'TEST FAILED: anon could execute — %', fn;
    exception
      when insufficient_privilege then null;  -- 42501: what we want
    end;
  end loop;
  raise notice 'PASS: anon cannot enumerate quota/plan/allowance by user id';
end $$;
reset role;
rollback;

begin;
-- The counterpart: the helpers that RLS policies themselves call MUST stay
-- executable by anon, or querying the table raises instead of returning no rows.
set local role anon;
do $$
begin
  perform public.can_view_student('00000000-0000-0000-0000-000000000001'::uuid);
  perform public.can_view_class('00000000-0000-0000-0000-000000000001'::uuid);
  perform public.is_reviewer();
  perform public.is_admin();
  raise notice 'PASS: RLS policy helpers remain callable by anon (they return false, not an error)';
end $$;
reset role;
-- Analytics windows must not move with the database's TimeZone setting.
--
-- The window start was `(now() at time zone 'utc') - make_interval(...)`, which
-- returns a timestamp WITHOUT time zone; assigning that to a timestamptz
-- re-interprets the UTC wall clock in the SESSION's TimeZone. On a UTC database
-- -- Supabase's default -- it is a no-op, which is why it never bit. Set
-- TimeZone to Australia/Sydney, a plausible thing to do for an NSW product, and
-- every "last 30 days" silently became 30 days + 10 hours.
set local timezone = 'Australia/Sydney';
do $$
declare
  v_utc   timestamptz;
  v_local timestamptz;
  v_drift interval;
begin
  set local timezone = 'UTC';
  v_utc := now() - make_interval(days => 30);
  set local timezone = 'Australia/Sydney';
  v_local := now() - make_interval(days => 30);

  v_drift := greatest(v_utc, v_local) - least(v_utc, v_local);
  if v_drift > interval '1 second' then
    raise exception
      'TEST FAILED: the 30-day window start moved by % when the session TimeZone changed', v_drift;
  end if;
  raise notice 'PASS: analytics window starts are absolute instants, not session-local';
end $$;
rollback;

begin;
-- Deleting the course cascades to its topics/sub_topics/dot_points/prompts;
-- deleting the auth users cascades to their profiles.
delete from public.courses where id = '00000000-0000-0000-0000-0000000000c1';
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a9'
);
-- §19 class-scoping fixtures. Classes cascade from their school; profiles and
-- class memberships cascade from the auth users.
delete from public.schools where id in (
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000f2'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000e2',
  '00000000-0000-0000-0000-0000000000e3',
  '00000000-0000-0000-0000-0000000000e4',
  '00000000-0000-0000-0000-0000000000e5',
  '00000000-0000-0000-0000-0000000000e6',
  '00000000-0000-0000-0000-0000000000e9'
);
commit;
