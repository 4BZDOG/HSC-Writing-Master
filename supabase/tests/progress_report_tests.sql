-- =============================================================================
-- Progress report tests — schema §26, get_progress_report().
--
-- The same harness as the other SQL suites: CI runs this against a plain
-- Postgres container after the compat shim + schema + grants, and a real project
-- can paste it into the SQL editor. Run with `psql -v ON_ERROR_STOP=1`.
--
-- What is asserted, and why:
--   * Refusals: a student cannot call it, an anonymous caller cannot execute it,
--     and a teacher cannot name a class they do not teach. Each raises.
--   * Scope: a teacher sees only their own students (and no one else's); a
--     teacher with no classes sees nothing; an admin sees everyone when no class
--     is named and only that class when one is.
--   * Course filter: narrows EVERY collection, not only the totals. An unmatched
--     course returns empty collections rather than the unfiltered report.
--   * Privacy: the payload carries counts and averages, never draft text.
--   * Shape: the window clamp and its echo, week 0 as the oldest week, and
--     byClass present only when no class is named.
--
-- The fixture lives in one transaction that is rolled back, so this is safe to
-- run against a project with real data. Each block sets `request.jwt.claims` so
-- auth.uid() resolves to a chosen profile, exactly as PostgREST does.
-- =============================================================================

begin;

-- ---- Fixture ----------------------------------------------------------------
-- Users: two teachers with classes, one teacher with none, two students (student
-- A is enrolled in BOTH classes), a student who is not a reviewer, and an admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000b001', 'rpr_teacher_a@example.test',
   '{"username":"rpr_teacher_a","display_name":"RPR Teacher A"}'),
  ('00000000-0000-0000-0000-00000000b002', 'rpr_teacher_b@example.test',
   '{"username":"rpr_teacher_b","display_name":"RPR Teacher B"}'),
  ('00000000-0000-0000-0000-00000000b003', 'rpr_teacher_c@example.test',
   '{"username":"rpr_teacher_c","display_name":"RPR Teacher C"}'),
  ('00000000-0000-0000-0000-00000000b004', 'rpr_student_a@example.test',
   '{"username":"rpr_student_a","display_name":"RPR Student A"}'),
  ('00000000-0000-0000-0000-00000000b005', 'rpr_student_b@example.test',
   '{"username":"rpr_student_b","display_name":"RPR Student B"}'),
  ('00000000-0000-0000-0000-00000000b006', 'rpr_caller@example.test',
   '{"username":"rpr_caller","display_name":"RPR Caller"}'),
  ('00000000-0000-0000-0000-00000000b007', 'rpr_admin@example.test',
   '{"username":"rpr_admin","display_name":"RPR Admin"}')
on conflict (id) do nothing;

update public.profiles set role = 'teacher'
 where id in ('00000000-0000-0000-0000-00000000b001',
              '00000000-0000-0000-0000-00000000b002',
              '00000000-0000-0000-0000-00000000b003');
update public.profiles set role = 'admin'
 where id = '00000000-0000-0000-0000-00000000b007';

insert into public.schools (id, name) values
  ('00000000-0000-0000-0000-00000000b101', 'RPR School A'),
  ('00000000-0000-0000-0000-00000000b102', 'RPR School B')
on conflict (id) do nothing;

insert into public.classes (id, school_id, name, owner_id, year) values
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000b101',
   'RPR Class A', '00000000-0000-0000-0000-00000000b001', 12),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000b102',
   'RPR Class B', '00000000-0000-0000-0000-00000000b002', 11)
on conflict (id) do nothing;

-- Student A is in both classes, so byClass must count their answers twice.
insert into public.class_members (class_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000b004', 'student'),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000b005', 'student'),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000b004', 'student')
on conflict (class_id, user_id) do nothing;

-- Two courses, each with one topic, sub-topic, dot point and question, so the
-- course filter has something to narrow away.
insert into public.courses (id, name, status) values
  ('00000000-0000-0000-0000-00000000b301', 'RPR Course One', 'approved'),
  ('00000000-0000-0000-0000-00000000b302', 'RPR Course Two', 'approved')
on conflict (id) do nothing;
insert into public.topics (id, course_id, name, status) values
  ('00000000-0000-0000-0000-00000000b311', '00000000-0000-0000-0000-00000000b301',
   'RPR Topic One', 'approved'),
  ('00000000-0000-0000-0000-00000000b312', '00000000-0000-0000-0000-00000000b302',
   'RPR Topic Two', 'approved')
on conflict (id) do nothing;
insert into public.sub_topics (id, topic_id, name, status) values
  ('00000000-0000-0000-0000-00000000b321', '00000000-0000-0000-0000-00000000b311',
   'RPR Sub One', 'approved'),
  ('00000000-0000-0000-0000-00000000b322', '00000000-0000-0000-0000-00000000b312',
   'RPR Sub Two', 'approved')
on conflict (id) do nothing;
insert into public.dot_points (id, sub_topic_id, description, status) values
  ('00000000-0000-0000-0000-00000000b331', '00000000-0000-0000-0000-00000000b321',
   'RPR Dot One', 'approved'),
  ('00000000-0000-0000-0000-00000000b332', '00000000-0000-0000-0000-00000000b322',
   'RPR Dot Two', 'approved')
on conflict (id) do nothing;
insert into public.prompts (id, dot_point_id, question, verb, total_marks, status) values
  ('00000000-0000-0000-0000-00000000b341', '00000000-0000-0000-0000-00000000b331',
   'RPR Explain question', 'EXPLAIN', 6, 'approved'),
  ('00000000-0000-0000-0000-00000000b342', '00000000-0000-0000-0000-00000000b332',
   'RPR Identify question', 'IDENTIFY', 4, 'approved')
on conflict (id) do nothing;

-- Three answers. Student A: course one (3/6, band 3) two days ago, and course two
-- (2/4, band 1) now. Student B: course one (6/6, band 5) 85 days ago. Week 0 is
-- the oldest week, so B's answer must land there; A's two answers, 88 and 90 days
-- old, both land in week 12 of a 90-day window. Each draft carries a marker the
-- privacy block searches for.
insert into public.responses
  (prompt_id, user_id, draft, word_count, overall_mark, overall_band, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000b341', '00000000-0000-0000-0000-00000000b004',
   'RPR-DRAFT-MARKER a1', 40, 3, 3, now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000b342', '00000000-0000-0000-0000-00000000b004',
   'RPR-DRAFT-MARKER a2', 20, 2, 1, now(), now()),
  ('00000000-0000-0000-0000-00000000b341', '00000000-0000-0000-0000-00000000b005',
   'RPR-DRAFT-MARKER b1', 60, 6, 5, now() - interval '85 days', now() - interval '85 days')
on conflict (user_id, prompt_id) do nothing;

-- ---- 1. A student cannot read the progress report ---------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b006","role":"authenticated"}';
set local role authenticated;

do $$
begin
  perform public.get_progress_report(90);
  raise exception 'TEST FAILED: a student was able to read the progress report';
exception
  when others then
    if sqlerrm like 'TEST FAILED%' then
      raise;
    end if;
    raise notice 'PASS: a student is refused the progress report (%, %)', sqlstate, sqlerrm;
end $$;
reset role;

-- ---- 2. An anonymous caller cannot even execute it --------------------------
set local role anon;

do $$
begin
  perform public.get_progress_report(90);
  raise exception 'TEST FAILED: an anonymous caller could execute the progress report';
exception
  when insufficient_privilege then
    raise notice 'PASS: anon has no EXECUTE on the progress report (42501)';
  when others then
    if sqlerrm like 'TEST FAILED%' then
      raise;
    end if;
    raise exception 'TEST FAILED: anon refused with the wrong error (%, %)', sqlstate, sqlerrm;
end $$;
reset role;

-- ---- 3. A teacher with no classes sees nothing ------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b003","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_progress_report(90);
  if (v->'totals'->>'attempts')::int <> 0 or (v->'totals'->>'active_students')::int <> 0 then
    raise exception 'TEST FAILED: a teacher with no classes saw answers: %', v->'totals';
  end if;
  if jsonb_array_length(v->'byStudent') <> 0 or jsonb_array_length(v->'byClass') <> 0 then
    raise exception 'TEST FAILED: a teacher with no classes saw a roster or classes: %', v;
  end if;
  if v::text like '%rpr_student%' then
    raise exception 'TEST FAILED: a teacher with no classes can see a student name: %', v;
  end if;
  raise notice 'PASS: a teacher with no classes gets an empty report (fails closed)';
end $$;
reset role;

-- ---- 4. A teacher sees their own class, and nobody else's -------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_progress_report(90);
  if (v->'totals'->>'attempts')::int <> 2 then
    raise exception 'TEST FAILED: teacher A should see 2 answers from their own student, saw %', v->'totals';
  end if;
  if (v->'totals'->>'active_students')::int <> 1 then
    raise exception 'TEST FAILED: teacher A should see 1 active student, saw %', v->'totals';
  end if;
  if v->'byStudent' @> '[{"username":"rpr_student_b"}]'::jsonb
     or v::text like '%rpr_student_b%' then
    raise exception 'TEST FAILED: teacher A can see student B, who is not in their class: %', v;
  end if;
  if not (v->'byStudent' @> '[{"username":"rpr_student_a"}]'::jsonb) then
    raise exception 'TEST FAILED: teacher A cannot see their own student: %', v->'byStudent';
  end if;
  -- byClass lists only the classes the caller teaches.
  if jsonb_array_length(v->'byClass') <> 1 or v->'byClass'->0->>'name' <> 'RPR Class A' then
    raise exception 'TEST FAILED: teacher A sees classes other than their own: %', v->'byClass';
  end if;
  raise notice 'PASS: a teacher sees only their own students and classes';
end $$;
reset role;

-- ---- 5. A teacher cannot name a class they do not teach ---------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
set local role authenticated;

do $$
begin
  perform public.get_progress_report(90, '00000000-0000-0000-0000-00000000b202');
  raise exception 'TEST FAILED: teacher A read the report for a class they do not teach';
exception
  when others then
    if sqlerrm like 'TEST FAILED%' then
      raise;
    end if;
    raise notice 'PASS: naming a class the caller does not teach is refused (%, %)', sqlstate, sqlerrm;
end $$;
reset role;

-- ---- 6. An admin sees everyone when no class is named -----------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb; v_a jsonb; v_b jsonb;
begin
  v := public.get_progress_report(90);
  if (v->'totals'->>'attempts')::int <> 3 or (v->'totals'->>'active_students')::int <> 2 then
    raise exception 'TEST FAILED: admin should see 3 answers from 2 students, saw %', v->'totals';
  end if;
  if not (v->'byStudent' @> '[{"username":"rpr_student_a"},{"username":"rpr_student_b"}]'::jsonb) then
    raise exception 'TEST FAILED: admin did not see both students: %', v->'byStudent';
  end if;

  -- Student A is in both classes, so each class counts their answers. The class
  -- rows therefore sum to 5 against 3 answers in the totals.
  select x into v_a from jsonb_array_elements(v->'byClass') x where x->>'name' = 'RPR Class A';
  select x into v_b from jsonb_array_elements(v->'byClass') x where x->>'name' = 'RPR Class B';
  if (v_a->>'students')::int <> 1 or (v_a->>'attempts')::int <> 2 then
    raise exception 'TEST FAILED: class A should hold 1 student and 2 answers: %', v_a;
  end if;
  if (v_b->>'students')::int <> 2 or (v_b->>'attempts')::int <> 3 then
    raise exception 'TEST FAILED: class B should hold 2 students and 3 answers (A is in both): %', v_b;
  end if;
  raise notice 'PASS: an admin sees the whole deployment, and a student in two classes counts in each';
end $$;
reset role;

-- ---- 7. An admin naming one class gets that class only, and no byClass ------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_progress_report(90, '00000000-0000-0000-0000-00000000b201');
  if (v->'totals'->>'attempts')::int <> 2 or (v->'totals'->>'active_students')::int <> 1 then
    raise exception 'TEST FAILED: admin naming class A should see 2 answers from 1 student, saw %', v->'totals';
  end if;
  if v::text like '%rpr_student_b%' then
    raise exception 'TEST FAILED: admin naming class A saw student B: %', v;
  end if;
  if v ? 'byClass' then
    raise exception 'TEST FAILED: byClass is present when a class is named: %', v->'byClass';
  end if;
  raise notice 'PASS: naming a class narrows the report to it and drops byClass';
end $$;
reset role;

-- ---- 8. The course filter narrows every collection --------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_progress_report(90, null, '00000000-0000-0000-0000-00000000b301');

  if (v->'totals'->>'attempts')::int <> 2 then
    raise exception 'TEST FAILED: course one should hold 2 answers, totals say %', v->'totals';
  end if;
  if jsonb_array_length(v->'byCourse') <> 1 or v->'byCourse'->0->>'label' <> 'RPR Course One' then
    raise exception 'TEST FAILED: byCourse is not narrowed to course one: %', v->'byCourse';
  end if;
  if jsonb_array_length(v->'byTopic') <> 1 or v->'byTopic'->0->>'label' <> 'RPR Topic One' then
    raise exception 'TEST FAILED: byTopic is not narrowed to course one: %', v->'byTopic';
  end if;
  if jsonb_array_length(v->'byVerb') <> 1 or v->'byVerb'->0->>'label' <> 'EXPLAIN' then
    raise exception 'TEST FAILED: byVerb is not narrowed to course one: %', v->'byVerb';
  end if;
  if (select coalesce(sum((x->>'attempts')::int), 0) from jsonb_array_elements(v->'byStudent') x) <> 2
     or (select count(*) from jsonb_array_elements(v->'byStudent') x where (x->>'attempts')::int <> 1) <> 0 then
    raise exception 'TEST FAILED: byStudent is not narrowed to course one: %', v->'byStudent';
  end if;
  if (select count(*) from jsonb_array_elements(v->'byStudentVerb') x where x->>'verb' <> 'EXPLAIN') <> 0 then
    raise exception 'TEST FAILED: byStudentVerb holds a verb from another course: %', v->'byStudentVerb';
  end if;
  if (select coalesce(sum((x->>'attempts')::int), 0) from jsonb_array_elements(v->'byStudentWeek') x) <> 2 then
    raise exception 'TEST FAILED: byStudentWeek is not narrowed to course one: %', v->'byStudentWeek';
  end if;
  if (select coalesce(sum((x->>'attempts')::int), 0) from jsonb_array_elements(v->'weekly') x) <> 2 then
    raise exception 'TEST FAILED: weekly is not narrowed to course one: %', v->'weekly';
  end if;
  if (select coalesce(sum((x->>'attempts')::int), 0) from jsonb_array_elements(v->'byClass') x) <> 3 then
    raise exception 'TEST FAILED: byClass is not narrowed to course one (expected 1 + 2): %', v->'byClass';
  end if;
  if v::text like '%RPR Course Two%' or v::text like '%RPR Topic Two%' then
    raise exception 'TEST FAILED: a course-two name leaked into a course-one report: %', v;
  end if;
  raise notice 'PASS: the course filter narrows totals, every breakdown, the weekly trend and byClass';
end $$;
reset role;

-- ---- 9. A course with no answers gives empty collections, not everything ----
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_progress_report(90, null, '00000000-0000-0000-0000-00000000ffff');
  if (v->'totals'->>'attempts')::int <> 0
     or jsonb_array_length(v->'byCourse') <> 0
     or jsonb_array_length(v->'byTopic') <> 0
     or jsonb_array_length(v->'byStudent') <> 0
     or jsonb_array_length(v->'weekly') <> 0 then
    raise exception 'TEST FAILED: an unmatched course returned data, so the filter did not apply: %', v;
  end if;
  raise notice 'PASS: a course that matches nothing returns empty collections';
end $$;
reset role;

-- ---- 10. No draft text, ever ------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_progress_report(90);
  if v::text like '%RPR-DRAFT-MARKER%' or v::text like '%draft%' or v::text like '%evaluation%' then
    raise exception 'TEST FAILED: the progress report carries draft or evaluation text: %', v;
  end if;
  raise notice 'PASS: the progress report carries counts and averages, never draft text';
end $$;
reset role;

-- ---- 11. The window is clamped to 1–365 days and echoed back ----------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_progress_report(0);
  if (v->>'days')::int <> 1 or (v->>'weeks')::int <> 1 then
    raise exception 'TEST FAILED: a zero-day window was not clamped to 1 day: %', v;
  end if;
  v := public.get_progress_report(5000);
  if (v->>'days')::int <> 365 or (v->>'weeks')::int <> 53 then
    raise exception 'TEST FAILED: a 5000-day window was not clamped to 365 days: %', v;
  end if;
  v := public.get_progress_report(null);
  if (v->>'days')::int <> 90 or (v->>'weeks')::int <> 13 then
    raise exception 'TEST FAILED: a null window did not default to 90 days: %', v;
  end if;
  raise notice 'PASS: the window is clamped to 1–365 days, defaults to 90, and is echoed back';
end $$;
reset role;

-- ---- 12. Week 0 is the oldest week in the window ----------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b007","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  v := public.get_progress_report(90);
  -- Student B's answer (85 days old) is in week 0; student A's two answers (88
  -- and 90 days old) are in week 12, the newest bucket of a 13-week window.
  if not (v->'weekly' @> '[{"week":0,"attempts":1}]'::jsonb) then
    raise exception 'TEST FAILED: the 85-day-old answer is not in week 0: %', v->'weekly';
  end if;
  if not (v->'weekly' @> '[{"week":12,"attempts":2}]'::jsonb) then
    raise exception 'TEST FAILED: the two recent answers are not in week 12: %', v->'weekly';
  end if;
  if not (v->'byStudentWeek' @> '[{"username":"rpr_student_b","week":0,"attempts":1}]'::jsonb) then
    raise exception 'TEST FAILED: student B week 0 is missing from byStudentWeek: %', v->'byStudentWeek';
  end if;
  raise notice 'PASS: week 0 is the oldest bucket, and weeks are counted from the window start';
end $$;
reset role;

rollback;
