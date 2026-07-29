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
-- Class-scoped analytics (schema §14)
--
-- Before §14, get_class_analytics / get_student_progress / get_response_students
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
-- §14 class-scoping fixtures. Classes cascade from their school; profiles and
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
