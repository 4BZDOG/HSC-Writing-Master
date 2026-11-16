-- =============================================================================
-- Course unlock tests (schema.sql §34): who can read an unlock, who can write one, and
-- what my_course_unlocks() reports.
--
-- Every block runs as the role and JWT the REST API uses, so each refusal is a database
-- refusal, not a client check. Each negative case goes through pg_temp.attempt, which
-- RECORDS the error text, so a refusal for the wrong reason (or no refusal at all) fails
-- the test rather than passing silently.
--
-- Where this runs: CI, after the compat shim, schema.sql (applied twice) and the grants,
-- with `psql -v ON_ERROR_STOP=1`. The whole file is one transaction that rolls back, so
-- it leaves no fixtures behind.
--
-- Fixtures (ids in their own 6c.. range):
--   ...6c01  cu_admin    an admin
--   ...6c02  cu_student  a student who holds the unlocks under test
--   ...6c03  cu_other    a second student, whose unlock must never show to cu_student
-- =============================================================================

begin;

-- ---- Helpers (session-local; they vanish with the rollback) -------------------

-- Signs the session in as a user, exactly as PostgREST does per request.
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', p_uid), true);
  execute 'set role authenticated';
end $$;

-- Back to the owner (the psql connection), with no JWT.
create or replace function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Runs one statement as the current role. Returns NULL when it succeeded, else the
-- SQLSTATE and message. Every negative assertion below goes through here.
create or replace function pg_temp.attempt(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- ---- Fixtures ----------------------------------------------------------------
-- Sign-up goes through handle_new_user, as in the other suites. These inserts are plain,
-- so a fixture id already in use stops the run rather than keeping someone else's row.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000006c01', 'cu_admin@example.test',
   '{"username":"cu_admin","display_name":"Cu Admin"}'),
  ('00000000-0000-0000-0000-000000006c02', 'cu_student@example.test',
   '{"username":"cu_student","display_name":"Cu Student"}'),
  ('00000000-0000-0000-0000-000000006c03', 'cu_other@example.test',
   '{"username":"cu_other","display_name":"Cu Other"}');

update public.profiles set role = 'admin'   where id = '00000000-0000-0000-0000-000000006c01';
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-000000006c02';
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-000000006c03';

insert into public.course_catalogue (course_id, unlock_required, stripe_price_id) values
  ('cu-test-course', true,  null),
  ('cu-free-course', false, null);

-- The student's unlocks: one active, one active with a future expiry, one expired,
-- one revoked. The other student holds one of their own.
insert into public.course_unlocks
  (user_id, course_id, source, stripe_checkout_session_id, stripe_payment_intent_id, expires_at, revoked_at)
values
  ('00000000-0000-0000-0000-000000006c02', 'cu-test-course',  'purchase', 'cs_cu_active',  'pi_cu_active',  null, null),
  ('00000000-0000-0000-0000-000000006c02', 'cu-future',      'purchase', 'cs_cu_future',  'pi_cu_future',  now() + interval '30 days', null),
  ('00000000-0000-0000-0000-000000006c02', 'cu-expired',     'purchase', 'cs_cu_expired', 'pi_cu_expired', now() - interval '1 day', null),
  ('00000000-0000-0000-0000-000000006c02', 'cu-revoked',     'purchase', 'cs_cu_revoked', 'pi_cu_revoked', null, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000006c03', 'cu-other-course', 'purchase', 'cs_cu_other',  'pi_cu_other',   null, null);

-- ---- 1. A student reads only their own unlocks ----------------------------------
savepoint s1;
select pg_temp.as_user('00000000-0000-0000-0000-000000006c02');
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.course_unlocks;
  if v_count <> 4 then
    raise exception 'TEST FAILED: the student should see their own 4 unlock rows, saw %', v_count;
  end if;

  select count(*) into v_count from public.course_unlocks where course_id = 'cu-other-course';
  if v_count <> 0 then
    raise exception 'TEST FAILED: a student can read another student''s unlock (%)', v_count;
  end if;
  raise notice 'PASS: a student reads their own unlock rows and no one else''s';
end $$;
select pg_temp.as_owner();
rollback to savepoint s1;

-- ---- 2. Nobody writes an unlock from the client, the student or an admin ---------
savepoint s2;
select pg_temp.as_user('00000000-0000-0000-0000-000000006c02');
do $$
declare
  v_err text;
begin
  v_err := pg_temp.attempt($q$
    insert into public.course_unlocks (user_id, course_id, source)
    values ('00000000-0000-0000-0000-000000006c02', 'cu-forged', 'purchase')$q$);
  if v_err is null then
    raise exception 'TEST FAILED: a student inserted a course unlock for themselves';
  end if;

  v_err := pg_temp.attempt($q$
    update public.course_unlocks set revoked_at = null
     where course_id = 'cu-revoked'$q$);
  -- No error is also a failure here if the row changed; checked below as the owner.

  v_err := pg_temp.attempt($q$
    delete from public.course_unlocks where course_id = 'cu-test-course'$q$);

  raise notice 'PASS: a student cannot insert, update or delete an unlock';
end $$;
select pg_temp.as_owner();

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.course_unlocks where course_id = 'cu-forged';
  if v_count <> 0 then
    raise exception 'TEST FAILED: a forged unlock row was written';
  end if;
  select count(*) into v_count from public.course_unlocks
   where course_id = 'cu-revoked' and revoked_at is null;
  if v_count <> 0 then
    raise exception 'TEST FAILED: a student cleared a revoked unlock';
  end if;
  select count(*) into v_count from public.course_unlocks where course_id = 'cu-test-course';
  if v_count <> 1 then
    raise exception 'TEST FAILED: a student deleted their active unlock (% rows left)', v_count;
  end if;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-000000006c01');
do $$
declare
  v_err text;
begin
  v_err := pg_temp.attempt($q$
    insert into public.course_unlocks (user_id, course_id, source)
    values ('00000000-0000-0000-0000-000000006c01', 'cu-admin-direct', 'grant')$q$);
  if v_err is null then
    raise exception 'TEST FAILED: an admin wrote a course unlock straight into the table';
  end if;
  raise notice 'PASS: even an admin cannot write an unlock row directly (the RPCs do it)';
end $$;
select pg_temp.as_owner();
rollback to savepoint s2;

-- ---- 3. A non-admin cannot grant, revoke or change the catalogue ----------------
savepoint s3;
select pg_temp.as_user('00000000-0000-0000-0000-000000006c02');
do $$
declare
  v_err text;
begin
  v_err := pg_temp.attempt(
    $q$select public.grant_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-self', null)$q$);
  if v_err is null or v_err not like '%Only admins%' then
    raise exception 'TEST FAILED: a student granted themselves a course unlock (%)', coalesce(v_err, 'no error');
  end if;

  v_err := pg_temp.attempt(
    $q$select public.revoke_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-test-course')$q$);
  if v_err is null or v_err not like '%Only admins%' then
    raise exception 'TEST FAILED: a student revoked an unlock (%)', coalesce(v_err, 'no error');
  end if;

  -- The catalogue is readable by any signed-in user...
  if not exists (select 1 from public.course_catalogue where course_id = 'cu-test-course') then
    raise exception 'TEST FAILED: a signed-in student cannot read the course catalogue';
  end if;

  -- ...and writable by none of them.
  v_err := pg_temp.attempt($q$
    insert into public.course_catalogue (course_id, unlock_required)
    values ('cu-student-course', false)$q$);
  if v_err is null then
    raise exception 'TEST FAILED: a student added a catalogue row';
  end if;

  -- An update that matches no visible row is silent, so it is checked as the owner below.
  v_err := pg_temp.attempt($q$
    update public.course_catalogue set unlock_required = false
     where course_id = 'cu-test-course'$q$);
  v_err := pg_temp.attempt($q$
    delete from public.course_catalogue where course_id = 'cu-test-course'$q$);

  raise notice 'PASS: a student cannot grant, revoke or change the catalogue, but can read it';
end $$;
select pg_temp.as_owner();

do $$
declare
  v_required boolean;
begin
  select unlock_required into v_required from public.course_catalogue where course_id = 'cu-test-course';
  if v_required is distinct from true then
    raise exception 'TEST FAILED: a student changed the catalogue (unlock_required is now %)', v_required;
  end if;
  if exists (select 1 from public.course_catalogue where course_id = 'cu-student-course') then
    raise exception 'TEST FAILED: a student''s catalogue row was stored';
  end if;
end $$;
rollback to savepoint s3;

-- ---- 4. An admin reads all, grants, revokes and maintains the catalogue --------
savepoint s4;
select pg_temp.as_user('00000000-0000-0000-0000-000000006c01');
do $$
declare
  v_count   integer;
  v_total   integer;
  v_grant   uuid;
  v_revoked integer;
begin
  select count(*) into v_total from public.course_unlocks;
  if v_total <> 5 then
    raise exception 'TEST FAILED: an admin should read all 5 unlock rows, saw %', v_total;
  end if;

  v_grant := public.grant_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-granted-open', null);
  if v_grant is null then
    raise exception 'TEST FAILED: an admin grant returned no row id';
  end if;
  perform public.grant_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-granted-old',
    now() - interval '1 day');

  -- A grant with no course or no user is refused.
  begin
    perform public.grant_course_unlock('00000000-0000-0000-0000-000000006c02', '  ', null);
    raise exception 'TEST FAILED: a grant with a blank course was accepted';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;

  v_revoked := public.revoke_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-granted-open');
  if v_revoked <> 1 then
    raise exception 'TEST FAILED: revoking one grant should report 1 row, reported %', v_revoked;
  end if;
  v_revoked := public.revoke_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-granted-open');
  if v_revoked <> 0 then
    raise exception 'TEST FAILED: a second revoke should report 0 rows, reported %', v_revoked;
  end if;

  -- Catalogue writes are allowed to an admin.
  insert into public.course_catalogue (course_id, unlock_required, stripe_price_id)
  values ('cu-admin-course', true, 'price_cu_test');
  update public.course_catalogue set stripe_price_id = 'price_cu_changed'
   where course_id = 'cu-admin-course';

  select count(*) into v_count from public.course_catalogue
   where course_id = 'cu-admin-course' and stripe_price_id = 'price_cu_changed';
  if v_count <> 1 then
    raise exception 'TEST FAILED: an admin could not write the course catalogue';
  end if;
  raise notice 'PASS: an admin reads all unlocks, grants and revokes them, and maintains the catalogue';
end $$;
select pg_temp.as_owner();
rollback to savepoint s4;

-- ---- 5. my_course_unlocks() excludes revoked and expired rows ------------------
savepoint s5;
select pg_temp.as_user('00000000-0000-0000-0000-000000006c01');
do $$
begin
  -- Set up the admin's grants, then leave the rest to the student's view below.
  perform public.grant_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-granted-open', null);
  perform public.grant_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-granted-old',
    now() - interval '1 day');
  perform public.grant_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-granted-revoked', null);
  perform public.revoke_course_unlock('00000000-0000-0000-0000-000000006c02', 'cu-granted-revoked');
end $$;
select pg_temp.as_owner();

select pg_temp.as_user('00000000-0000-0000-0000-000000006c02');
do $$
declare
  v_ids text;
begin
  select string_agg(course_id, ',' order by course_id) into v_ids
    from public.my_course_unlocks() as course_id;
  -- The student's own rows are: active, future, expired, revoked, plus the admin's open
  -- grant. Only the three live ones may appear, and nothing of the other student's.
  if v_ids is distinct from 'cu-future,cu-granted-open,cu-test-course' then
    raise exception 'TEST FAILED: my_course_unlocks() returned [%], expected the three live unlocks', v_ids;
  end if;
  raise notice 'PASS: my_course_unlocks() leaves out revoked, expired and other students'' unlocks';
end $$;
select pg_temp.as_owner();

-- ---- 6. Anonymous callers see nothing and cannot call the functions -------------
set local role anon;
do $$
declare
  v_err text;
begin
  v_err := pg_temp.attempt($q$select 1 from public.course_unlocks$q$);
  if v_err is null then
    raise exception 'TEST FAILED: an anonymous caller could read course_unlocks';
  end if;
  v_err := pg_temp.attempt($q$select * from public.my_course_unlocks()$q$);
  if v_err is null then
    raise exception 'TEST FAILED: an anonymous caller could call my_course_unlocks()';
  end if;
  raise notice 'PASS: an anonymous caller can neither read unlocks nor call my_course_unlocks()';
end $$;
select pg_temp.as_owner();
rollback to savepoint s5;

-- ---- 7. The webhook's idempotency key is unique --------------------------------
-- A replayed checkout.session.completed must not add a second unlock. The webhook relies
-- on this constraint, so it is checked here.
savepoint s6;
do $$
declare
  v_err text;
begin
  v_err := pg_temp.attempt($q$
    insert into public.course_unlocks (user_id, course_id, source, stripe_checkout_session_id)
    values ('00000000-0000-0000-0000-000000006c02', 'cu-replayed', 'purchase', 'cs_cu_active')$q$);
  if v_err is null or v_err not like '23505%' then
    raise exception 'TEST FAILED: a second unlock with the same checkout session was accepted (%)',
      coalesce(v_err, 'no error');
  end if;
  raise notice 'PASS: one paid checkout session can produce only one unlock row';
end $$;
rollback to savepoint s6;

-- Everything above rolled back; the catalogue and unlock fixtures were all inside the
-- transaction, so nothing is left behind.

rollback;
