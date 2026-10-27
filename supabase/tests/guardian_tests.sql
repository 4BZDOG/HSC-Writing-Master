-- =============================================================================
-- Guardian tests — parent and guardian accounts (schema §31).
--
-- What a parent may do, and what a child controls. Every block runs as the role
-- and JWT the REST API uses, so each refusal is a database refusal, not a client
-- check. The file does both halves:
--
--   - the happy path works (a child makes a code, a parent redeems it, the parent
--     reads progress and sees who pays);
--   - each refusal is the one documented: a second redeem, an expired code, a
--     student redeeming, a stranger reading progress, a parent writing the link
--     table directly, a payer reading the subscription and a stranger not;
--   - a bad code is an ANSWER, not an error: unknown, used, expired and malformed
--     codes return { ok: false, reason: 'invalid_code' } and look identical, and each
--     one leaves a row in guardian_redeem_attempts. Ten in the hour stop the guardian
--     with a raise, even for a valid code; the window ages out; another parent is not
--     affected; and the attempt table is closed to the client.
--
-- Negative cases use the `attempt` helper below, which RECORDS the error text and
-- then fails the test if there was none. A test that only catches an exception
-- would also pass when the check raised for a reason it should not have.
--
-- Where this runs: CI, after the compat shim, schema.sql (applied twice) and the
-- grants, with `psql -v ON_ERROR_STOP=1`. The whole file is one transaction that
-- rolls back, so it leaves no fixtures behind.
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
--   ...e1  gd_student        a student, the child who makes codes
--   ...e2  gd_parent         a parent, linked to gd_student and paying for it
--   ...e3  gd_stranger       a parent with no link to gd_student
--   ...e4  gd_other_student  a second student, for the 'a student cannot redeem' case
--   ...e5  gd_cap_parent     a parent used for the six-student cap
--   ...f01..f06              gd_cap_1..gd_cap_6, students to fill that cap
--   ...6e0a  gd_limit_parent   a parent who runs into the attempt limit
--   ...6e0b  gd_other_parent   a parent who must be unaffected by 6e0a's failures
--   ...6e0c  gd_window_parent  a parent with old attempts that must not count
-- Sign-up goes through handle_new_user, so this also proves the parent mapping. These
-- inserts are plain, not `on conflict do nothing`: a fixture id already in use must stop
-- the run, not quietly keep someone else's row.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000006e01', 'gd_student@example.test',
   '{"username":"gd_student","display_name":"Gd Student"}'),
  ('00000000-0000-0000-0000-000000006e02', 'gd_parent@example.test',
   '{"username":"gd_parent","display_name":"Gd Parent","account_type":"parent"}'),
  ('00000000-0000-0000-0000-000000006e03', 'gd_stranger@example.test',
   '{"username":"gd_stranger","display_name":"Gd Stranger","account_type":"parent"}'),
  ('00000000-0000-0000-0000-000000006e04', 'gd_other_student@example.test',
   '{"username":"gd_other_student","display_name":"Gd Other"}'),
  ('00000000-0000-0000-0000-000000006e05', 'gd_cap_parent@example.test',
   '{"username":"gd_cap_parent","display_name":"Gd Cap Parent","account_type":"parent"}'),
  ('00000000-0000-0000-0000-000000006f01', 'gd_cap_1@example.test',
   '{"username":"gd_cap_1","display_name":"Gd Cap 1"}'),
  ('00000000-0000-0000-0000-000000006f02', 'gd_cap_2@example.test',
   '{"username":"gd_cap_2","display_name":"Gd Cap 2"}'),
  ('00000000-0000-0000-0000-000000006f03', 'gd_cap_3@example.test',
   '{"username":"gd_cap_3","display_name":"Gd Cap 3"}'),
  ('00000000-0000-0000-0000-000000006f04', 'gd_cap_4@example.test',
   '{"username":"gd_cap_4","display_name":"Gd Cap 4"}'),
  ('00000000-0000-0000-0000-000000006f05', 'gd_cap_5@example.test',
   '{"username":"gd_cap_5","display_name":"Gd Cap 5"}'),
  ('00000000-0000-0000-0000-000000006f06', 'gd_cap_6@example.test',
   '{"username":"gd_cap_6","display_name":"Gd Cap 6"}'),
  ('00000000-0000-0000-0000-000000006e0a', 'gd_limit_parent@example.test',
   '{"username":"gd_limit_parent","display_name":"Gd Limit Parent","account_type":"parent"}'),
  ('00000000-0000-0000-0000-000000006e0b', 'gd_other_parent@example.test',
   '{"username":"gd_other_parent","display_name":"Gd Other Parent","account_type":"parent"}'),
  ('00000000-0000-0000-0000-000000006e0c', 'gd_window_parent@example.test',
   '{"username":"gd_window_parent","display_name":"Gd Window Parent","account_type":"parent"}');

-- ---- Sign-up maps account_type to a role, and nothing else does ---------------
do $$
declare v_roles text;
begin
  select string_agg(username || '=' || role::text, ', ' order by username)
    into v_roles
    from public.profiles
   where username in ('gd_student', 'gd_parent', 'gd_stranger', 'gd_other_student');
  -- `is distinct from`, not `<>`: a missing fixture makes v_roles NULL, and NULL <> x
  -- is not true, so the check would pass having asserted nothing.
  if v_roles is distinct from 'gd_other_student=student, gd_parent=parent, gd_stranger=parent, gd_student=student' then
    raise exception 'TEST FAILED: sign-up roles were %', v_roles;
  end if;
  raise notice 'PASS: account_type = parent signs up as a parent, and everyone else as a student';
end $$;

-- ---- A student creates a code -------------------------------------------------
do $$
declare v jsonb;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
  v := public.create_guardian_invite();
  perform pg_temp.as_owner();

  if v->>'code' !~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then
    raise exception 'TEST FAILED: the code is not XXXX-XXXX from the code alphabet: %', v->>'code';
  end if;
  if (v->>'expiresAt')::timestamptz not between now() + interval '6 days 23 hours'
                                           and now() + interval '7 days 1 hour' then
    raise exception 'TEST FAILED: the code does not expire in seven days: %', v->>'expiresAt';
  end if;
  perform set_config('gd.code', replace(v->>'code', '-', ''), true);
  raise notice 'PASS: a student gets an XXXX-XXXX code that expires in seven days';
end $$;

-- ---- A parent redeems it, in lower case with no hyphen -------------------------
do $$
declare v jsonb; v_links integer;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  v := public.redeem_guardian_invite(lower(current_setting('gd.code')));
  perform pg_temp.as_owner();

  if v->>'studentId' <> '00000000-0000-0000-0000-000000006e01' then
    raise exception 'TEST FAILED: the code linked the wrong student: %', v;
  end if;
  if v->>'displayName' <> 'Gd Student' then
    raise exception 'TEST FAILED: the redeem did not name the student: %', v;
  end if;

  select count(*) into v_links from public.guardian_links
   where guardian_id = '00000000-0000-0000-0000-000000006e02'
     and student_id = '00000000-0000-0000-0000-000000006e01';
  if v_links <> 1 then
    raise exception 'TEST FAILED: the parent is not linked after redeeming (% rows)', v_links;
  end if;
  raise notice 'PASS: a parent redeems a code (case and hyphens ignored) and is linked';
end $$;

-- ---- The student sees the link from their side ----------------------------------
do $$
declare v jsonb;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
  v := public.list_my_guardians();
  perform pg_temp.as_owner();
  if not (v @> '[{"guardianId":"00000000-0000-0000-0000-000000006e02","displayName":"Gd Parent"}]'::jsonb) then
    raise exception 'TEST FAILED: the student does not see their guardian: %', v;
  end if;
  raise notice 'PASS: the student lists the guardian who is linked to them';
end $$;

-- ---- A second redeem of the same code is an invalid code, not a second link ------
-- The answer is a return, not a raise: the attempt is recorded and the parent is told
-- only that the code did not work.
do $$
declare v jsonb; v_links integer;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  v := public.redeem_guardian_invite(current_setting('gd.code'));
  perform pg_temp.as_owner();
  if v is distinct from '{"ok": false, "reason": "invalid_code"}'::jsonb then
    raise exception 'TEST FAILED: a second redeem of a used code did not return invalid_code: %', v;
  end if;

  select count(*) into v_links from public.guardian_links
   where guardian_id = '00000000-0000-0000-0000-000000006e02';
  if v_links <> 1 then
    raise exception 'TEST FAILED: a second redeem changed the links (% rows)', v_links;
  end if;
  raise notice 'PASS: a code cannot be redeemed twice, and the second try returns invalid_code';
end $$;

-- ---- An expired code fails --------------------------------------------------------
-- Written directly as the owner: the RPC can only make a code that expires in seven days.
insert into public.guardian_invites (code, student_id, expires_at)
values ('EXPRD234', '00000000-0000-0000-0000-000000006e01', now() - interval '1 day');

do $$
declare v jsonb; v_links integer;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e03');
  v := public.redeem_guardian_invite('EXPR-D234');
  perform pg_temp.as_owner();
  if v is distinct from '{"ok": false, "reason": "invalid_code"}'::jsonb then
    raise exception 'TEST FAILED: an expired code did not return invalid_code: %', v;
  end if;

  select count(*) into v_links from public.guardian_links
   where guardian_id = '00000000-0000-0000-0000-000000006e03';
  if v_links <> 0 then
    raise exception 'TEST FAILED: an expired code still linked a parent (% rows)', v_links;
  end if;
  raise notice 'PASS: an expired code returns invalid_code and links nobody';
end $$;

-- ---- Unknown, used, expired and malformed codes look identical -----------------------
-- A guesser must not learn whether a code exists, so the four answers are compared
-- byte for byte. Each call is also one failed attempt, so each adds one row.
do $$
declare
  v_codes  text[] := array['ABC', 'QQQQQQQQ', current_setting('gd.code'), 'EXPRD234'];
  v_code   text;
  v        jsonb;
  v_first  jsonb;
  v_before integer;
  v_after  integer;
begin
  foreach v_code in array v_codes loop
    select count(*) into v_before from public.guardian_redeem_attempts
     where guardian_id = '00000000-0000-0000-0000-000000006e03';

    perform pg_temp.as_user('00000000-0000-0000-0000-000000006e03');
    v := public.redeem_guardian_invite(v_code);
    perform pg_temp.as_owner();

    select count(*) into v_after from public.guardian_redeem_attempts
     where guardian_id = '00000000-0000-0000-0000-000000006e03';
    if v_after - v_before <> 1 then
      raise exception 'TEST FAILED: the failed code % recorded % attempt rows, expected 1', v_code, v_after - v_before;
    end if;

    if v_first is null then
      v_first := v;
    elsif v is distinct from v_first then
      raise exception 'TEST FAILED: code % answered differently: % against %', v_code, v, v_first;
    end if;
  end loop;

  if v_first is distinct from '{"ok": false, "reason": "invalid_code"}'::jsonb then
    raise exception 'TEST FAILED: the failed codes did not answer invalid_code: %', v_first;
  end if;
  raise notice 'PASS: unknown, used, expired and malformed codes return the same answer, and each records one attempt';
end $$;

-- ---- The attempt table is closed to the client ---------------------------------------
do $$
declare v_select text; v_insert text;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  v_select := pg_temp.attempt('select count(*) from public.guardian_redeem_attempts');
  v_insert := pg_temp.attempt(
    'insert into public.guardian_redeem_attempts (guardian_id) values (' ||
    quote_literal('00000000-0000-0000-0000-000000006e02') || ')');
  perform pg_temp.as_owner();

  -- No grant and no policy, so both are refused by the grant (SQLSTATE 42501).
  if v_select is null or v_select not like '42501%' then
    raise exception 'TEST FAILED: a parent read guardian_redeem_attempts directly (%)', v_select;
  end if;
  if v_insert is null or v_insert not like '42501%' then
    raise exception 'TEST FAILED: a parent inserted into guardian_redeem_attempts directly (%)', v_insert;
  end if;
  raise notice 'PASS: a parent cannot read or write the attempt table directly';
end $$;

-- ---- Ten failures in the hour stop the guardian, even for a valid code ----------------
-- Ten bad codes are each an answer and each a row. The eleventh is a raise, and it is
-- raised even for a code that would link, so the limit is about the guardian, not the code.
do $$
declare v jsonb; v_err text; v_code text; v_links integer; v_live integer; v_count integer;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e0a');
  for i in 1..10 loop
    v := public.redeem_guardian_invite('QQQQQQQQ');
    if v is distinct from '{"ok": false, "reason": "invalid_code"}'::jsonb then
      perform pg_temp.as_owner();
      raise exception 'TEST FAILED: failure % was not an invalid_code answer: %', i, v;
    end if;
  end loop;
  perform pg_temp.as_owner();

  -- A live code, made by a student who is not linked to this parent.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e04');
  v := public.create_guardian_invite();
  perform pg_temp.as_owner();
  v_code := replace(v->>'code', '-', '');

  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e0a');
  v_err := pg_temp.attempt(format('select public.redeem_guardian_invite(%L)', v_code));
  perform pg_temp.as_owner();

  if v_err is null or v_err not like '%Too many codes tried%' then
    raise exception 'TEST FAILED: an eleventh try in the hour was not refused (%)', v_err;
  end if;

  -- The refusal is a raise, so nothing is linked, the code stays live, and the
  -- refused call is not recorded either: still exactly ten rows.
  select count(*) into v_links from public.guardian_links
   where guardian_id = '00000000-0000-0000-0000-000000006e0a';
  select count(*) into v_live from public.guardian_invites
   where code = v_code and redeemed_at is null;
  select count(*) into v_count from public.guardian_redeem_attempts
   where guardian_id = '00000000-0000-0000-0000-000000006e0a';
  if v_links <> 0 or v_live <> 1 then
    raise exception 'TEST FAILED: the refused redeem changed state (% links, % live codes)', v_links, v_live;
  end if;
  if v_count <> 10 then
    raise exception 'TEST FAILED: attempts were recorded past the limit (% rows, expected 10)', v_count;
  end if;

  perform set_config('gd.limit_code', v_code, true);
  raise notice 'PASS: ten failures in the hour refuse the guardian with a raise, even for a valid code';
end $$;

-- A different parent is not affected by another parent's failures.
do $$
declare v jsonb;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e0b');
  v := public.redeem_guardian_invite(current_setting('gd.limit_code'));
  perform pg_temp.as_owner();
  if (v->>'ok') is distinct from 'true' then
    raise exception 'TEST FAILED: a different parent was refused after another parent''s failures: %', v;
  end if;
  raise notice 'PASS: another parent is not affected by the first parent''s failures';
end $$;

-- Attempts older than an hour do not count. Ten of them, an hour and a half old, must not
-- block a valid redeem. Attempts older than a day are deleted by the RPC, so three two
-- days old are gone after one call, leaving the ten.
insert into public.guardian_redeem_attempts (guardian_id, attempted_at)
select '00000000-0000-0000-0000-000000006e0c', now() - interval '90 minutes'
  from generate_series(1, 10);
insert into public.guardian_redeem_attempts (guardian_id, attempted_at)
select '00000000-0000-0000-0000-000000006e0c', now() - interval '2 days'
  from generate_series(1, 3);

do $$
declare v jsonb; v_code text; v_count integer; v_old integer;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e04');
  v := public.create_guardian_invite();
  perform pg_temp.as_owner();
  v_code := replace(v->>'code', '-', '');

  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e0c');
  v := public.redeem_guardian_invite(v_code);
  perform pg_temp.as_owner();
  if (v->>'ok') is distinct from 'true' then
    raise exception 'TEST FAILED: attempts older than an hour still refused a valid code: %', v;
  end if;

  -- A success is not an attempt and does not clear anything: the ten hour-old rows stay,
  -- and the two-day-old rows went during the call.
  select count(*) into v_count from public.guardian_redeem_attempts
   where guardian_id = '00000000-0000-0000-0000-000000006e0c';
  select count(*) into v_old from public.guardian_redeem_attempts
   where guardian_id = '00000000-0000-0000-0000-000000006e0c'
     and attempted_at < now() - interval '1 day';
  if v_count <> 10 or v_old <> 0 then
    raise exception 'TEST FAILED: attempt housekeeping left % rows, % of them over a day old (expected 10 and 0)', v_count, v_old;
  end if;
  raise notice 'PASS: attempts older than an hour do not count, and attempts older than a day are cleared';
end $$;

-- ---- A student cannot redeem a code -----------------------------------------------
do $$
declare v jsonb; v_code text; v_err text;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e04');
  v := public.create_guardian_invite();
  perform pg_temp.as_owner();
  v_code := replace(v->>'code', '-', '');

  -- The other student tries to redeem their own valid code.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e04');
  v_err := pg_temp.attempt(format('select public.redeem_guardian_invite(%L)', v_code));
  perform pg_temp.as_owner();
  if v_err is null or v_err not like '%Only parent or guardian%' then
    raise exception 'TEST FAILED: a student was allowed to redeem a code (%)', v_err;
  end if;
  raise notice 'PASS: a student cannot redeem a guardian code';
end $$;

-- ---- A parent cannot make a code ----------------------------------------------------
do $$
declare v_err text;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  v_err := pg_temp.attempt('select public.create_guardian_invite()');
  perform pg_temp.as_owner();
  if v_err is null or v_err not like '%Only student accounts%' then
    raise exception 'TEST FAILED: a parent was allowed to create a guardian code (%)', v_err;
  end if;
  raise notice 'PASS: a parent cannot create a guardian code';
end $$;

-- ---- A linked parent can read progress; a stranger cannot ----------------------------
do $$
declare v jsonb; v_err text;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  v := public.get_guardian_student_progress('00000000-0000-0000-0000-000000006e01', 30);
  perform pg_temp.as_owner();
  if v->>'username' <> 'gd_student' or v->>'displayName' <> 'Gd Student' then
    raise exception 'TEST FAILED: the linked parent did not read the student progress: %', v;
  end if;
  if not (v ? 'byVerb' and v ? 'totals' and v ? 'trend') then
    raise exception 'TEST FAILED: the progress payload is missing a section: %', v;
  end if;

  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e03');
  v_err := pg_temp.attempt($q$select public.get_guardian_student_progress('00000000-0000-0000-0000-000000006e01', 30)$q$);
  perform pg_temp.as_owner();
  if v_err is null or v_err not like '%linked%' then
    raise exception 'TEST FAILED: a stranger read a student''s progress (%)', v_err;
  end if;
  raise notice 'PASS: a linked parent reads progress, and an unlinked parent is refused';
end $$;

-- ---- A parent cannot write the link table directly -----------------------------------
do $$
declare v_insert text; v_delete text; v_links integer;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  -- Link the parent to the OTHER student with no code at all.
  v_insert := pg_temp.attempt(
    'insert into public.guardian_links (guardian_id, student_id) values (' ||
    quote_literal('00000000-0000-0000-0000-000000006e02') || ', ' ||
    quote_literal('00000000-0000-0000-0000-000000006e04') || ')');
  -- And delete the link the code made.
  v_delete := pg_temp.attempt(
    'delete from public.guardian_links where guardian_id = ' ||
    quote_literal('00000000-0000-0000-0000-000000006e02'));
  perform pg_temp.as_owner();

  -- Both must be refused by the grant or the policy (SQLSTATE 42501). A DELETE that
  -- quietly matched no rows would not be an error, so the row count is checked too.
  if v_insert is null or v_insert not like '42501%' then
    raise exception 'TEST FAILED: a parent inserted into guardian_links directly (%)', v_insert;
  end if;
  if v_delete is null or v_delete not like '42501%' then
    raise exception 'TEST FAILED: a parent deleted from guardian_links directly (%)', v_delete;
  end if;

  select count(*) into v_links from public.guardian_links
   where guardian_id = '00000000-0000-0000-0000-000000006e02';
  if v_links <> 1 then
    raise exception 'TEST FAILED: the link table changed under a direct write (% rows)', v_links;
  end if;
  raise notice 'PASS: a parent cannot insert into or delete from guardian_links directly';
end $$;

-- ---- The payer reads the subscription they pay for -----------------------------------
-- The holder is the student; the payer is the parent. Written as the owner, the way the
-- webhook writes it.
insert into public.subscriptions (
  id, user_id, payer_id, stripe_customer_id, status, price_id, plan,
  current_period_start, current_period_end, cancel_at_period_end
) values (
  'sub_gd_test_1',
  '00000000-0000-0000-0000-000000006e01',
  '00000000-0000-0000-0000-000000006e02',
  'cus_gd_parent', 'active', 'price_gd_plus_test', 'plus',
  now(), now() + interval '30 days', false
);
update public.profiles set stripe_plan = 'plus'
 where id = '00000000-0000-0000-0000-000000006e01';

do $$
declare v_payer integer; v_stranger integer; v_holder integer; v jsonb;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  select count(*) into v_payer from public.subscriptions where id = 'sub_gd_test_1';
  v := public.list_my_students();
  perform pg_temp.as_owner();
  if v_payer <> 1 then
    raise exception 'TEST FAILED: the payer cannot read the subscription they pay for (% rows)', v_payer;
  end if;
  if not (v @> '[{"studentId":"00000000-0000-0000-0000-000000006e01","plan":"plus","paidByMe":true,"cancelAtPeriodEnd":false}]'::jsonb) then
    raise exception 'TEST FAILED: the parent does not see the plan they pay for: %', v;
  end if;

  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e03');
  select count(*) into v_stranger from public.subscriptions where id = 'sub_gd_test_1';
  perform pg_temp.as_owner();
  if v_stranger <> 0 then
    raise exception 'TEST FAILED: a parent who pays nothing read the subscription (% rows)', v_stranger;
  end if;

  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
  select count(*) into v_holder from public.subscriptions where id = 'sub_gd_test_1';
  perform pg_temp.as_owner();
  if v_holder <> 1 then
    raise exception 'TEST FAILED: the student cannot read their own subscription (% rows)', v_holder;
  end if;
  raise notice 'PASS: the payer reads the subscription they pay for, the holder reads it too, and a stranger does not';
end $$;

-- ---- Removing the link: either side can, and the subscription is left alone -----------
do $$
declare v jsonb; v_err text; v_status text;
begin
  -- The student removes the parent.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
  v := public.remove_guardian_link('00000000-0000-0000-0000-000000006e02');
  perform pg_temp.as_owner();
  if (v->>'removed')::boolean is not true then
    raise exception 'TEST FAILED: the student could not remove the link: %', v;
  end if;

  select status into v_status from public.subscriptions where id = 'sub_gd_test_1';
  if v_status <> 'active' then
    raise exception 'TEST FAILED: removing the link changed the subscription to %', v_status;
  end if;

  -- The parent has lost progress access the moment the link goes.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  v_err := pg_temp.attempt($q$select public.get_guardian_student_progress('00000000-0000-0000-0000-000000006e01', 30)$q$);
  perform pg_temp.as_owner();
  if v_err is null then
    raise exception 'TEST FAILED: a removed guardian still reads the student progress';
  end if;
  raise notice 'PASS: a student can remove a guardian, the subscription stays live, and progress access ends';
end $$;

-- Re-link with a fresh code, then the PARENT removes the student. Both sides must work.
do $$
declare v jsonb; v_code text; v_removed boolean; v_again boolean;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
  v := public.create_guardian_invite();
  perform pg_temp.as_owner();
  v_code := replace(v->>'code', '-', '');

  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  perform public.redeem_guardian_invite(v_code);
  v_removed := (public.remove_guardian_link('00000000-0000-0000-0000-000000006e01')->>'removed')::boolean;
  -- A second removal of the same link finds nothing, and says so.
  v_again := (public.remove_guardian_link('00000000-0000-0000-0000-000000006e01')->>'removed')::boolean;
  perform pg_temp.as_owner();

  if v_removed is not true then
    raise exception 'TEST FAILED: the parent could not remove the link';
  end if;
  if v_again is not false then
    raise exception 'TEST FAILED: removing a link that is already gone reported success';
  end if;
  if (select count(*) from public.guardian_links
       where guardian_id = '00000000-0000-0000-0000-000000006e02') <> 0 then
    raise exception 'TEST FAILED: the link survived the parent removing it';
  end if;
  raise notice 'PASS: a parent can remove a link from their side too';
end $$;

-- ---- The six-student cap ------------------------------------------------------------
-- Link the cap parent to six students directly, then check the seventh is refused. At
-- the cap every code gets the cap answer, live or not, so the answer reveals nothing
-- about the code; that includes a code for a student already linked.
insert into public.guardian_links (guardian_id, student_id) values
  ('00000000-0000-0000-0000-000000006e05', '00000000-0000-0000-0000-000000006f01'),
  ('00000000-0000-0000-0000-000000006e05', '00000000-0000-0000-0000-000000006f02'),
  ('00000000-0000-0000-0000-000000006e05', '00000000-0000-0000-0000-000000006f03'),
  ('00000000-0000-0000-0000-000000006e05', '00000000-0000-0000-0000-000000006f04'),
  ('00000000-0000-0000-0000-000000006e05', '00000000-0000-0000-0000-000000006f05'),
  ('00000000-0000-0000-0000-000000006e05', '00000000-0000-0000-0000-000000006f06');

do $$
declare v_code text; v_err text; v_links integer; v jsonb;
begin
  -- With six students linked, a code for a seventh student is refused.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
  v := public.create_guardian_invite();
  perform pg_temp.as_owner();
  v_code := replace(v->>'code', '-', '');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e05');
  v_err := pg_temp.attempt(format('select public.redeem_guardian_invite(%L)', v_code));
  perform pg_temp.as_owner();
  if v_err is null or v_err not like '%up to 6 students%' then
    raise exception 'TEST FAILED: a seventh student was linked (%)', v_err;
  end if;

  -- A code that never existed gets the same cap answer, so a live code is not singled out.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e05');
  v_err := pg_temp.attempt('select public.redeem_guardian_invite(''ZZZZZZZZ'')');
  perform pg_temp.as_owner();
  if v_err is null or v_err not like '%up to 6 students%' then
    raise exception 'TEST FAILED: at the cap an unknown code got a different answer (%)', v_err;
  end if;

  select count(*) into v_links from public.guardian_links
   where guardian_id = '00000000-0000-0000-0000-000000006e05';
  if v_links <> 6 then
    raise exception 'TEST FAILED: the cap parent has % links, expected 6', v_links;
  end if;
  raise notice 'PASS: a guardian is capped at six students, and at the cap every code gets the same answer';
end $$;

-- ---- Progress and the link list stay scoped to the linked student ------------------
-- The student's own list shows only the guardian who is linked (none, after removal).
do $$
declare v jsonb;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
  v := public.list_my_guardians();
  perform pg_temp.as_owner();
  if v <> '[]'::jsonb then
    raise exception 'TEST FAILED: a removed guardian still appears on the student list: %', v;
  end if;
  raise notice 'PASS: removed guardians disappear from the student''s list';
end $$;

-- ---- A student whose school already provides Plus shows as 'school' ----------------
-- The parent dashboard reads `plan` from list_my_students, and a parent must not be
-- offered Plus for a child who already holds it through their school. The student's own
-- profile says 'free'; the school's live licence is what grants the plan, the same
-- precedence caller_plan() (§17) uses.
insert into public.schools (id, name, plan_status) values
  ('00000000-0000-0000-0000-000000006e09', 'Guardian Test School', 'active');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000006e07', 'gd_school_student@example.test',
   '{"username":"gd_school_student","display_name":"Gd School Student"}');
update public.profiles
   set school_id = '00000000-0000-0000-0000-000000006e09', stripe_plan = 'free'
 where id = '00000000-0000-0000-0000-000000006e07';

-- The stranger parent is linked to the school student (no other links are in play).
insert into public.guardian_links (guardian_id, student_id) values
  ('00000000-0000-0000-0000-000000006e03', '00000000-0000-0000-0000-000000006e07');

do $$
declare v jsonb; v_plan text;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e03');
  v := public.list_my_students();
  perform pg_temp.as_owner();

  select value->>'plan' into v_plan
    from jsonb_array_elements(v) as value
   where value->>'studentId' = '00000000-0000-0000-0000-000000006e07';
  if v_plan is distinct from 'school' then
    raise exception 'TEST FAILED: a student whose school licence is live shows as % (expected school): %', v_plan, v;
  end if;
  raise notice 'PASS: a student whose school already provides Plus shows as school, not free';
end $$;

-- ---- Deleting an account while a plan would renew is refused (schema §16) ----------
-- sub_gd_test_1 is still live: the student holds it, the parent pays for it.
do $$
declare v_child text; v_parent text; v_after text;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
  begin
    perform public.delete_my_account();
  exception when others then v_child := sqlerrm;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006e02');
  begin
    perform public.delete_my_account();
  exception when others then v_parent := sqlerrm;
  end;
  perform pg_temp.as_owner();

  if v_child is null or v_child not like 'Your parent or guardian pays for your plan%' then
    raise exception 'TEST FAILED: a student deleted their account while a parent-paid plan renews (%)', v_child;
  end if;
  if v_parent is null or v_parent not like 'Cancel your subscription before deleting%' then
    raise exception 'TEST FAILED: a parent deleted their account while paying for a renewing plan (%)', v_parent;
  end if;

  -- Once the plan is set to end, deletion goes ahead. The sentinel undoes it.
  update public.subscriptions set cancel_at_period_end = true where id = 'sub_gd_test_1';
  begin
    perform pg_temp.as_user('00000000-0000-0000-0000-000000006e01');
    perform public.delete_my_account();
    raise exception 'sentinel: deleted';
  exception when others then v_after := sqlerrm;
  end;
  perform pg_temp.as_owner();
  update public.subscriptions set cancel_at_period_end = false where id = 'sub_gd_test_1';
  if v_after is distinct from 'sentinel: deleted' then
    raise exception 'TEST FAILED: deletion was refused for a plan already set to end (%)', v_after;
  end if;
  raise notice 'PASS: account deletion waits until a renewing plan is cancelled, for holder and payer';
end $$;

-- ---- A new OAuth sign-up can become a parent account (claim_parent_account, §31) ----
-- An OAuth sign-up cannot carry account_type, so it lands as a student. These fixtures
-- are plain students, as an OAuth sign-up is, and the claim is tested against each guard.
--   ...6a01  gd_claim_new      a brand-new student with no work: the one that may claim
--   ...6a02  gd_claim_worked   a student with a response
--   ...6a03  gd_claim_old      a student created more than 30 minutes ago
--   ...6a04  gd_claim_teacher  a teacher
--   ...6a05  gd_claim_direct   a new student who tries to write the role directly
--   ...6a06  gd_claim_school   a new student attached to a school
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000006a01'::uuid, 'gd_claim_new@example.test',
   '{"username":"gd_claim_new","display_name":"Gd Claim New"}'),
  ('00000000-0000-0000-0000-000000006a02'::uuid, 'gd_claim_worked@example.test',
   '{"username":"gd_claim_worked","display_name":"Gd Claim Worked"}'),
  ('00000000-0000-0000-0000-000000006a03'::uuid, 'gd_claim_old@example.test',
   '{"username":"gd_claim_old","display_name":"Gd Claim Old"}'),
  ('00000000-0000-0000-0000-000000006a04'::uuid, 'gd_claim_teacher@example.test',
   '{"username":"gd_claim_teacher","display_name":"Gd Claim Teacher"}'),
  ('00000000-0000-0000-0000-000000006a05'::uuid, 'gd_claim_direct@example.test',
   '{"username":"gd_claim_direct","display_name":"Gd Claim Direct"}'),
  ('00000000-0000-0000-0000-000000006a06'::uuid, 'gd_claim_school@example.test',
   '{"username":"gd_claim_school","display_name":"Gd Claim School"}');

-- A prompt for the work fixture to answer. Owner-written, so the content rules do not apply.
insert into public.courses (id, name, status)
  values ('00000000-0000-0000-0000-000000006a10'::uuid, 'Gd Claim Course', 'approved');
insert into public.topics (id, course_id, name, status)
  values ('00000000-0000-0000-0000-000000006a11'::uuid,
          '00000000-0000-0000-0000-000000006a10'::uuid, 'Gd Claim Topic', 'approved');
insert into public.sub_topics (id, topic_id, name, status)
  values ('00000000-0000-0000-0000-000000006a12'::uuid,
          '00000000-0000-0000-0000-000000006a11'::uuid, 'Gd Claim SubTopic', 'approved');
insert into public.dot_points (id, sub_topic_id, description, status)
  values ('00000000-0000-0000-0000-000000006a13'::uuid,
          '00000000-0000-0000-0000-000000006a12'::uuid, 'Gd Claim DotPoint', 'approved');
insert into public.prompts (id, dot_point_id, question, status)
  values ('00000000-0000-0000-0000-000000006a14'::uuid,
          '00000000-0000-0000-0000-000000006a13'::uuid, 'Gd Claim Prompt', 'approved');

insert into public.responses (prompt_id, user_id, draft, word_count)
  values ('00000000-0000-0000-0000-000000006a14'::uuid,
          '00000000-0000-0000-0000-000000006a02'::uuid, 'GD-CLAIM-MARKER', 3);

-- An account older than 30 minutes, and a teacher, and a school student: set owner-side,
-- as an admin or the server would. The owner session has no JWT, so the role guard is quiet.
update public.profiles set created_at = now() - interval '31 minutes'
 where id = '00000000-0000-0000-0000-000000006a03'::uuid;
update public.profiles set role = 'teacher'
 where id = '00000000-0000-0000-0000-000000006a04'::uuid;
update public.profiles set school_id = '00000000-0000-0000-0000-000000006e09'::uuid
 where id = '00000000-0000-0000-0000-000000006a06'::uuid;

do $$
declare v jsonb; v_role text;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006a01'::uuid);
  v := public.claim_parent_account();
  perform pg_temp.as_owner();

  select role::text into v_role from public.profiles
   where id = '00000000-0000-0000-0000-000000006a01'::uuid;
  if v->>'role' is distinct from 'parent' or v_role is distinct from 'parent' then
    raise exception 'TEST FAILED: a new student did not become a parent (returned %, row %)', v, v_role;
  end if;
  raise notice 'PASS: a brand-new OAuth student account can claim to be a parent account';
end $$;

-- ---- Claiming again is a no-op, and a parent who calls it is not refused -----------
do $$
declare v jsonb;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006a01'::uuid);
  v := public.claim_parent_account();
  perform pg_temp.as_owner();
  if v is distinct from '{"role":"parent"}'::jsonb then
    raise exception 'TEST FAILED: a second claim did not return the parent role: %', v;
  end if;
  raise notice 'PASS: a second claim returns the parent role without changing anything';
end $$;

-- ---- Each guard refuses, and the role is left as it was ---------------------------
do $$
declare v_err text; v_role text;
begin
  -- A student with a response: the account has work in it.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006a02'::uuid);
  v_err := pg_temp.attempt('select public.claim_parent_account()');
  perform pg_temp.as_owner();
  select role::text into v_role from public.profiles where id = '00000000-0000-0000-0000-000000006a02'::uuid;
  if v_err is null or v_err not like '%already has work%' or v_role <> 'student' then
    raise exception 'TEST FAILED: a student with a response could claim (%, role %)', v_err, v_role;
  end if;

  -- An account older than 30 minutes.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006a03'::uuid);
  v_err := pg_temp.attempt('select public.claim_parent_account()');
  perform pg_temp.as_owner();
  select role::text into v_role from public.profiles where id = '00000000-0000-0000-0000-000000006a03'::uuid;
  if v_err is null or v_err not like '%more than 30 minutes old%' or v_role <> 'student' then
    raise exception 'TEST FAILED: an old account could claim (%, role %)', v_err, v_role;
  end if;

  -- A teacher is never changed by this route.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006a04'::uuid);
  v_err := pg_temp.attempt('select public.claim_parent_account()');
  perform pg_temp.as_owner();
  select role::text into v_role from public.profiles where id = '00000000-0000-0000-0000-000000006a04'::uuid;
  if v_err is null or v_err not like '%Only a student account%' or v_role <> 'teacher' then
    raise exception 'TEST FAILED: a teacher could be changed to a parent (%, role %)', v_err, v_role;
  end if;

  -- A student attached to a school.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006a06'::uuid);
  v_err := pg_temp.attempt('select public.claim_parent_account()');
  perform pg_temp.as_owner();
  select role::text into v_role from public.profiles where id = '00000000-0000-0000-0000-000000006a06'::uuid;
  if v_err is null or v_err not like '%school or paid plan%' or v_role <> 'student' then
    raise exception 'TEST FAILED: a school student could claim (%, role %)', v_err, v_role;
  end if;

  -- No caller at all.
  perform pg_temp.as_owner();
  v_err := pg_temp.attempt('select public.claim_parent_account()');
  if v_err is null or v_err not like '%Sign in%' then
    raise exception 'TEST FAILED: a signed-out call was not refused (%)', v_err;
  end if;

  raise notice 'PASS: a student with work, an old account, a teacher, a school student and a signed-out caller are all refused';
end $$;

-- ---- The role cannot be written directly, claim or no claim ------------------------
-- The RPC runs as its owner, which the role trigger lets through. The client role does not.
do $$
declare v_err text; v_role text;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000006a05'::uuid);
  v_err := pg_temp.attempt($q$update public.profiles set role = 'parent'
                              where id = '00000000-0000-0000-0000-000000006a05'$q$);
  perform pg_temp.as_owner();
  select role::text into v_role from public.profiles where id = '00000000-0000-0000-0000-000000006a05'::uuid;
  if v_err is null or v_err not like '%Only admins can change%' or v_role <> 'student' then
    raise exception 'TEST FAILED: a direct update of role was not refused (%, role %)', v_err, v_role;
  end if;
  raise notice 'PASS: a direct update of profiles.role is still refused for an authenticated user';
end $$;

-- ---- Grants: signed-in users only ----------------------------------------------
do $$
begin
  if not has_function_privilege('authenticated', 'public.claim_parent_account()', 'execute') then
    raise exception 'TEST FAILED: authenticated cannot run claim_parent_account';
  end if;
  if has_function_privilege('anon', 'public.claim_parent_account()', 'execute') then
    raise exception 'TEST FAILED: anon can run claim_parent_account';
  end if;
  raise notice 'PASS: claim_parent_account is callable by signed-in users only';
end $$;

reset role;
rollback;
