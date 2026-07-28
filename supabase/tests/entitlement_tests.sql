-- =============================================================================
-- Entitlement tests — prove the paid boundaries hold in the DATABASE, where
-- they can't be cleared with devtools.
--
-- The free tier's daily evaluation limit is the paywall's headline number, and
-- it used to be counted only in localStorage. schema.sql §14 makes it real:
-- api/gemini.ts spends consume_evaluation() on every marking call. These tests
-- cover who is metered, what the counter does at the boundary, and the
-- webhook's idempotency ledger (§13).
--
-- Where this runs: same harness as rls_negative_tests.sql — CI against a plain
-- Postgres container after the compat shim + schema + grants, or pasted into a
-- real project's SQL editor. Run with `psql -v ON_ERROR_STOP=1` so a
-- regression aborts the job non-zero.
--
-- Each block sets `request.jwt.claims` so auth.uid() resolves to a chosen
-- profile, exactly as PostgREST does for a real session, and rolls back.
-- =============================================================================

-- ---- Setup -------------------------------------------------------------------
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'ent_test_free@example.test',
   '{"username":"ent_test_free","display_name":"Ent Free"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'ent_test_paid@example.test',
   '{"username":"ent_test_paid","display_name":"Ent Paid"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'ent_test_teacher@example.test',
   '{"username":"ent_test_teacher","display_name":"Ent Teacher"}'),
  ('00000000-0000-0000-0000-0000000000e4', 'ent_test_member@example.test',
   '{"username":"ent_test_member","display_name":"Ent School Member"}')
on conflict (id) do nothing;

update public.profiles set role = 'student', stripe_plan = 'free'
 where id in ('00000000-0000-0000-0000-0000000000e1',
              '00000000-0000-0000-0000-0000000000e2',
              '00000000-0000-0000-0000-0000000000e4');
update public.profiles set role = 'teacher' where id = '00000000-0000-0000-0000-0000000000e3';
-- A paid personal plan, as the Stripe webhook would leave it.
update public.profiles set stripe_plan = 'plus' where id = '00000000-0000-0000-0000-0000000000e2';

-- A school with a live seat licence, and a student who belongs to it.
insert into public.schools (id, name, plan_status)
  values ('00000000-0000-0000-0000-0000000000f1', 'Ent Test High', 'active')
  on conflict (id) do nothing;
update public.schools set plan_status = 'active'
 where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set school_id = '00000000-0000-0000-0000-0000000000f1'
 where id = '00000000-0000-0000-0000-0000000000e4';

delete from public.evaluation_usage
 where user_id in ('00000000-0000-0000-0000-0000000000e1',
                   '00000000-0000-0000-0000-0000000000e2',
                   '00000000-0000-0000-0000-0000000000e3',
                   '00000000-0000-0000-0000-0000000000e4');
commit;

-- ---- 1. The free tier is cut off at exactly the advertised limit ------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_limit  integer := public.free_evaluation_limit();
  v_result jsonb;
  i        integer;
begin
  -- Every evaluation up to the limit is allowed…
  for i in 1..v_limit loop
    v_result := public.consume_evaluation();
    if not (v_result->>'allowed')::boolean then
      raise exception 'TEST FAILED: free evaluation % of % was refused', i, v_limit;
    end if;
    if (v_result->>'used')::integer <> i then
      raise exception 'TEST FAILED: expected used=% got %', i, v_result->>'used';
    end if;
  end loop;

  -- …and the next one is not.
  v_result := public.consume_evaluation();
  if (v_result->>'allowed')::boolean then
    raise exception 'TEST FAILED: free tier got evaluation % past a limit of %', v_limit + 1, v_limit;
  end if;

  -- A refused attempt must not inflate the count either.
  if (v_result->>'used')::integer <> v_limit then
    raise exception 'TEST FAILED: refused attempt changed the count to %', v_result->>'used';
  end if;

  raise notice 'PASS: free tier allowed exactly % evaluations, then refused', v_limit;
end $$;
rollback;

-- ---- 2. get_evaluation_status() reports without consuming -------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  perform public.consume_evaluation();
  v_before := public.get_evaluation_status();
  v_after  := public.get_evaluation_status();
  if (v_before->>'used')::integer <> 1 or (v_after->>'used')::integer <> 1 then
    raise exception 'TEST FAILED: status call changed the count (% then %)',
      v_before->>'used', v_after->>'used';
  end if;
  raise notice 'PASS: get_evaluation_status() is read-only (used=%)', v_after->>'used';
end $$;
rollback;

-- ---- 3. Paid plans, staff and school members are never metered -------------
begin;
do $$
declare
  v_result jsonb;
  v_case   record;
begin
  for v_case in
    select * from (values
      ('00000000-0000-0000-0000-0000000000e2', 'a personal Plus plan'),
      ('00000000-0000-0000-0000-0000000000e3', 'a teacher account'),
      ('00000000-0000-0000-0000-0000000000e4', 'a member of a licensed school')
    ) as t(uid, label)
  loop
    execute format('set local request.jwt.claims = %L',
      json_build_object('sub', v_case.uid, 'role', 'authenticated')::text);
    set local role authenticated;

    -- Well past the free limit: an unmetered caller must never be refused.
    for i in 1..(public.free_evaluation_limit() + 3) loop
      v_result := public.consume_evaluation();
      if not (v_result->>'allowed')::boolean then
        raise exception 'TEST FAILED: % was refused an evaluation', v_case.label;
      end if;
    end loop;
    if not (v_result->>'unlimited')::boolean then
      raise exception 'TEST FAILED: % was metered', v_case.label;
    end if;

    reset role;
    raise notice 'PASS: % is not metered', v_case.label;
  end loop;
end $$;
rollback;

-- ---- 4. A cancelled school licence stops covering its members --------------
begin;
update public.schools set plan_status = 'canceled'
 where id = '00000000-0000-0000-0000-0000000000f1';

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}';
set local role authenticated;

do $$
begin
  if public.has_unlimited_evaluations('00000000-0000-0000-0000-0000000000e4') then
    raise exception 'TEST FAILED: member of a cancelled school still has unlimited evaluations';
  end if;
  raise notice 'PASS: cancelled school licence no longer covers its members';
end $$;
rollback;

-- ---- 5. past_due keeps the licence (Stripe is still retrying) --------------
begin;
update public.schools set plan_status = 'past_due'
 where id = '00000000-0000-0000-0000-0000000000f1';

do $$
begin
  if not public.has_unlimited_evaluations('00000000-0000-0000-0000-0000000000e4') then
    raise exception 'TEST FAILED: past_due school licence cut off a paying school';
  end if;
  raise notice 'PASS: past_due keeps the school licence (grace period)';
end $$;
rollback;

-- ---- 6. A user cannot write their own evaluation usage ---------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
set local role authenticated;

do $$
begin
  -- No insert/update policy exists: the only write path is the security-definer
  -- RPC. If this succeeds, the limit can be reset from the browser.
  insert into public.evaluation_usage (user_id, day, evaluations)
  values ('00000000-0000-0000-0000-0000000000e1', (now() at time zone 'utc')::date, 0);
  raise exception 'TEST FAILED: user wrote their own evaluation_usage row';
exception
  when others then
    if sqlerrm = 'TEST FAILED: user wrote their own evaluation_usage row' then
      raise;
    end if;
    raise notice 'PASS: direct evaluation_usage write blocked (%, %)', sqlstate, sqlerrm;
end $$;
rollback;

-- ---- 7. caller_plan() resolves the same order the client does --------------
-- The AI proxy asks this before serving a plan-gated feature, so if it drifts
-- from getUserPlan() a paying customer is refused or a free one is served.
begin;
update public.schools set plan_status = 'active'
 where id = '00000000-0000-0000-0000-0000000000f1';

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
set local role authenticated;
do $$
begin
  if public.caller_plan() <> 'free' then
    raise exception 'TEST FAILED: a free student resolved to %', public.caller_plan();
  end if;
  raise notice 'PASS: free student resolves to the free plan';
end $$;
rollback;

begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
set local role authenticated;
do $$
begin
  if public.caller_plan() <> 'plus' then
    raise exception 'TEST FAILED: a Plus subscriber resolved to %', public.caller_plan();
  end if;
  raise notice 'PASS: a personal paid plan resolves to plus';
end $$;
rollback;

begin;
update public.schools set plan_status = 'active'
 where id = '00000000-0000-0000-0000-0000000000f1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}';
set local role authenticated;
do $$
begin
  if public.caller_plan() <> 'school' then
    raise exception 'TEST FAILED: a licensed school member resolved to %', public.caller_plan();
  end if;
  raise notice 'PASS: a live school licence resolves to the school plan';
end $$;
rollback;

begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
set local role authenticated;
do $$
begin
  if public.caller_plan() <> 'plus' then
    raise exception 'TEST FAILED: the teacher staff perk resolved to %', public.caller_plan();
  end if;
  raise notice 'PASS: teachers hold the staff perk plan';
end $$;
rollback;

-- ---- 8. Only an admin can retune the free allowance ------------------------
-- The allowance is a live setting so it can be tuned without a deploy; that is
-- only safe while the setter is closed to everyone else.
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
set local role authenticated;
do $$
begin
  perform public.set_plan_setting('free_evaluation_limit', 500);
  raise exception 'TEST FAILED: a teacher changed the free evaluation limit';
exception
  when others then
    if sqlerrm = 'TEST FAILED: a teacher changed the free evaluation limit' then
      raise;
    end if;
    raise notice 'PASS: set_plan_setting is admin-only (%, %)', sqlstate, sqlerrm;
end $$;
rollback;

-- The setting itself must actually move the limit the meter enforces.
begin;
insert into public.plan_settings (key, value) values ('free_evaluation_limit', 2)
  on conflict (key) do update set value = 2;
do $$
begin
  if public.free_evaluation_limit() <> 2 then
    raise exception 'TEST FAILED: plan_settings row ignored (limit is %)',
      public.free_evaluation_limit();
  end if;
  raise notice 'PASS: the free allowance is adjustable from the database';
end $$;
rollback;

-- …and with no row, the shipped default stands.
begin;
do $$
begin
  if public.free_evaluation_limit() <> 5 then
    raise exception 'TEST FAILED: default free allowance is % (expected 5)',
      public.free_evaluation_limit();
  end if;
  raise notice 'PASS: the shipped default applies when nothing is configured';
end $$;
rollback;

do $$
begin
  raise notice 'All entitlement tests passed.';
end $$;
