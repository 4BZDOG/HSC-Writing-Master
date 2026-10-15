-- =============================================================================
-- Schools privacy tests — prove who may read a school and its licence, in the
-- DATABASE, through the same role and JWT the REST API uses.
--
-- schema.sql §12 and §28: a signed-in user reads only their own school's row,
-- and only its id and name; admins read every row; list_schools() is admin-only.
-- The licence columns (stripe_subscription_id, plan_*) and the pool budget are
-- withheld from the client roles altogether, admins included: an admin gets the
-- licence through list_schools(). Before this, every signed-in account read every
-- school's licence through the REST API, and every teacher could call
-- list_schools() for the lot.
--
-- Where this runs: same harness as rls_negative_tests.sql, in CI after the shim,
-- the schema and the grants. The whole file is one transaction that rolls back,
-- so it leaves no fixtures behind. Run with `psql -v ON_ERROR_STOP=1`.
-- =============================================================================

begin;

-- ---- Setup -------------------------------------------------------------------
-- Ids live in their own `fa..` / `fb..` range (no other file uses them).
--   fa01  student at school one        fb01  school one (licence live, 9 seats)
--   fa02  teacher at school one        fb02  school two (licence cancelled, 3 seats)
--   fa03  teacher at school two
--   fa04  admin, no school
--   fa05  student, no school
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000fa01', 'priv_test_student_one@example.test',
   '{"username":"priv_test_student_one","display_name":"Priv Student One"}'),
  ('00000000-0000-0000-0000-00000000fa02', 'priv_test_teacher_one@example.test',
   '{"username":"priv_test_teacher_one","display_name":"Priv Teacher One"}'),
  ('00000000-0000-0000-0000-00000000fa03', 'priv_test_teacher_two@example.test',
   '{"username":"priv_test_teacher_two","display_name":"Priv Teacher Two"}'),
  ('00000000-0000-0000-0000-00000000fa04', 'priv_test_admin@example.test',
   '{"username":"priv_test_admin","display_name":"Priv Admin"}'),
  ('00000000-0000-0000-0000-00000000fa05', 'priv_test_student_none@example.test',
   '{"username":"priv_test_student_none","display_name":"Priv Student None"}')
on conflict (id) do nothing;

update public.profiles set role = 'student'
 where id in ('00000000-0000-0000-0000-00000000fa01',
              '00000000-0000-0000-0000-00000000fa05');
update public.profiles set role = 'teacher'
 where id in ('00000000-0000-0000-0000-00000000fa02',
              '00000000-0000-0000-0000-00000000fa03');
update public.profiles set role = 'admin'
 where id = '00000000-0000-0000-0000-00000000fa04';

insert into public.schools (id, name, daily_ai_limit, stripe_subscription_id,
                            plan_status, plan_seats, plan_period_end, plan_cancel_at_period_end)
values
  ('00000000-0000-0000-0000-00000000fb01', 'Schools Privacy One', 40, 'sub_priv_one',
   'active', 9, now() + interval '1 year', false),
  ('00000000-0000-0000-0000-00000000fb02', 'Schools Privacy Two', 10, 'sub_priv_two',
   'canceled', 3, now() + interval '1 month', true)
on conflict (id) do nothing;

update public.profiles set school_id = '00000000-0000-0000-0000-00000000fb01'
 where id in ('00000000-0000-0000-0000-00000000fa01',
              '00000000-0000-0000-0000-00000000fa02');
update public.profiles set school_id = '00000000-0000-0000-0000-00000000fb02'
 where id = '00000000-0000-0000-0000-00000000fa03';

insert into public.school_ai_usage (school_id, day, calls) values
  ('00000000-0000-0000-0000-00000000fb01', (now() at time zone 'utc')::date, 7),
  ('00000000-0000-0000-0000-00000000fb02', (now() at time zone 'utc')::date, 11)
on conflict (school_id, day) do update set calls = excluded.calls;

-- ---- A signed-in student sees their own school, and nothing else -------------
do $$
declare
  v_count int;
  v_name  text;
  v_join  int;
  v_star  boolean;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000fa01","role":"authenticated"}', true);
  execute 'set role authenticated';
  select count(*), min(name) into v_count, v_name from public.schools;

  -- `select *` names the withheld columns too, so it is refused rather than
  -- returning a partial row.
  v_star := true;
  begin
    execute 'select count(*) from (select * from public.schools) s' into v_join;
  exception when insufficient_privilege then
    v_star := false;
  end;

  -- The name a client joins on still reads: id and name are the granted columns.
  select count(*) into v_join from public.profiles p
    join public.schools s on s.id = p.school_id
   where p.id = '00000000-0000-0000-0000-00000000fa01' and s.name = 'Schools Privacy One';
  execute 'reset role';

  if v_count <> 1 or v_name <> 'Schools Privacy One' then
    raise exception 'TEST FAILED: a student saw % school row(s), expected only their own (%)',
      v_count, v_name;
  end if;
  if v_star then
    raise exception 'TEST FAILED: a student ran select * on schools and got the whole row';
  end if;
  if v_join <> 1 then
    raise exception 'TEST FAILED: a student could not join their school on id and name (%)', v_join;
  end if;
  raise notice 'PASS: a student reads only their own school''s row, and not select *';
end $$;

-- ---- A student cannot select a licence column, or `select *` ------------------
do $$
declare
  v_users text[] := array[
    '00000000-0000-0000-0000-00000000fa01',  -- student at school one
    '00000000-0000-0000-0000-00000000fa02',  -- teacher at school one
    '00000000-0000-0000-0000-00000000fa04'   -- admin
  ];
  v_cols  text[] := array[
    'stripe_subscription_id', 'plan_status', 'plan_seats',
    'plan_period_end', 'plan_cancel_at_period_end', 'daily_ai_limit'
  ];
  v_user  text;
  v_col   text;
  v_read  boolean;
  v_val   text;
begin
  foreach v_user in array v_users loop
    foreach v_col in array v_cols loop
      perform set_config('request.jwt.claims',
        format('{"sub":"%s","role":"authenticated"}', v_user), true);
      execute 'set role authenticated';
      v_read := true;
      begin
        execute format('select %I::text from public.schools limit 1', v_col) into v_val;
      exception when insufficient_privilege then
        v_read := false;
      end;
      execute 'reset role';
      if v_read then
        raise exception 'TEST FAILED: user % read withheld column % through the REST API',
          v_user, v_col;
      end if;
    end loop;
  end loop;
  raise notice 'PASS: no signed-in user, admins included, selects a licence column or pool budget';
end $$;

-- ---- A teacher sees their own school only, and cannot list every school ------
do $$
declare
  v_count int;
  v_name  text;
  v_err   text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000fa02","role":"authenticated"}', true);
  execute 'set role authenticated';
  select count(*), min(name) into v_count, v_name from public.schools;
  execute 'reset role';
  if v_count <> 1 or v_name <> 'Schools Privacy One' then
    raise exception 'TEST FAILED: a teacher saw % school row(s), expected only their own (%)',
      v_count, v_name;
  end if;
  raise notice 'PASS: a teacher reads only their own school''s row';

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000fa02","role":"authenticated"}', true);
  execute 'set role authenticated';
  begin
    perform public.list_schools();
    execute 'reset role';
    raise exception 'TEST FAILED: a teacher called list_schools() and read every school';
  exception when raise_exception then
    execute 'reset role';
    get stacked diagnostics v_err = message_text;
    if v_err like 'TEST FAILED:%' then raise; end if;
    if v_err <> 'Only admins can list schools' then
      raise exception 'TEST FAILED: teacher refused with the wrong message (%)', v_err;
    end if;
  end;
  raise notice 'PASS: a teacher cannot call list_schools()';
end $$;

-- ---- A student who is not in any school reads nothing ------------------------
do $$
declare
  v_count int;
  v_err   text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000fa05","role":"authenticated"}', true);
  execute 'set role authenticated';
  select count(*) into v_count from public.schools;
  execute 'reset role';
  if v_count <> 0 then
    raise exception 'TEST FAILED: a student with no school read % school row(s)', v_count;
  end if;
  raise notice 'PASS: a user with no school reads no school rows';

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000fa05","role":"authenticated"}', true);
  execute 'set role authenticated';
  begin
    perform public.list_schools();
    execute 'reset role';
    raise exception 'TEST FAILED: a student called list_schools() and read every school';
  exception when raise_exception then
    execute 'reset role';
    get stacked diagnostics v_err = message_text;
    if v_err like 'TEST FAILED:%' then raise; end if;
    if v_err <> 'Only admins can list schools' then
      raise exception 'TEST FAILED: student refused with the wrong message (%)', v_err;
    end if;
  end;
  raise notice 'PASS: a student with no school cannot call list_schools()';
end $$;

-- ---- An anonymous caller reads no schools and cannot list them ---------------
do $$
declare
  v_count int;
  v_read  boolean;
begin
  execute 'set role anon';
  v_read := true;
  begin
    select count(*) into v_count from public.schools;
  exception when insufficient_privilege then
    v_read := false;
  end;
  execute 'reset role';
  if v_read then
    raise exception 'TEST FAILED: an anonymous caller read the schools table (% rows)', v_count;
  end if;
  raise notice 'PASS: an anonymous caller has no privilege on schools';

  execute 'set role anon';
  v_read := true;
  begin
    perform public.list_schools();
  exception when insufficient_privilege then
    v_read := false;
  end;
  execute 'reset role';
  if v_read then
    raise exception 'TEST FAILED: an anonymous caller reached list_schools()';
  end if;
  raise notice 'PASS: an anonymous caller cannot call list_schools()';
end $$;

-- ---- An admin reads every school, and gets the licence through list_schools() -
do $$
declare
  v_count int;
  v_list  jsonb;
  v_one   jsonb;
  v_two   jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000fa04","role":"authenticated"}', true);
  execute 'set role authenticated';
  select count(*) into v_count from public.schools
   where id in ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fb02');
  v_list := public.list_schools();
  execute 'reset role';

  if v_count <> 2 then
    raise exception 'TEST FAILED: an admin saw % of the two test schools, expected 2', v_count;
  end if;
  raise notice 'PASS: an admin reads every school row';

  select e into v_one from jsonb_array_elements(v_list) e where e->>'name' = 'Schools Privacy One';
  select e into v_two from jsonb_array_elements(v_list) e where e->>'name' = 'Schools Privacy Two';
  if v_one is null or v_two is null then
    raise exception 'TEST FAILED: list_schools() left out a school: %', v_list;
  end if;
  if v_one->>'plan_status' <> 'active' or (v_one->>'plan_seats')::int <> 9
     or (v_one->>'members')::int <> 2 or (v_one->>'daily_ai_limit')::int <> 40 then
    raise exception 'TEST FAILED: list_schools() gave the wrong picture for school one: %', v_one;
  end if;
  if not (v_two->>'plan_cancel_at_period_end')::boolean or (v_two->>'members')::int <> 1 then
    raise exception 'TEST FAILED: list_schools() gave the wrong picture for school two: %', v_two;
  end if;
  raise notice 'PASS: an admin lists every school with its licence and member count';
end $$;

-- ---- Pool usage: a teacher sees their own school's usage, not another's ------
do $$
declare
  v_one int;
  v_other int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000fa02","role":"authenticated"}', true);
  execute 'set role authenticated';
  select count(*) into v_one from public.school_ai_usage
   where school_id = '00000000-0000-0000-0000-00000000fb01';
  select count(*) into v_other from public.school_ai_usage
   where school_id = '00000000-0000-0000-0000-00000000fb02';
  execute 'reset role';
  if v_one <> 1 then
    raise exception 'TEST FAILED: a teacher could not read their own school''s pool usage (%)', v_one;
  end if;
  if v_other <> 0 then
    raise exception 'TEST FAILED: a teacher at school one read school two''s pool usage (% rows)', v_other;
  end if;
  raise notice 'PASS: a teacher reads their own school''s pool usage and no other';
end $$;

-- ---- The owner (service side, and the RPCs) still reads every column ----------
do $$
declare
  v_sub text;
begin
  select stripe_subscription_id into v_sub from public.schools
   where id = '00000000-0000-0000-0000-00000000fb01';
  if v_sub <> 'sub_priv_one' then
    raise exception 'TEST FAILED: the owner could not read the licence column (%)', v_sub;
  end if;
  raise notice 'PASS: service-side reads of the licence columns are unaffected';
end $$;

rollback;
