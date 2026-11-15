-- =============================================================================
-- Sign-up limit tests — prove the server-side sign-up limits hold in the DATABASE.
--
-- The browser checks VITE_ENABLE_SIGNUP and the allowed domains (services/signupPolicy.ts),
-- but the anon key is public, so a POST to /auth/v1/signup skips the form. schema.sql §33
-- makes the limits real: Supabase's "Before User Created" hook calls
-- hook_before_user_created(), which reads signup_settings and refuses the account. These
-- tests call the hook exactly as the auth service does, as the supabase_auth_admin role,
-- so they also exercise the grants and the policy that role depends on.
--
-- Where this runs: same harness as the other files: CI against a plain Postgres after the
-- compat shim, schema and grants, or pasted into a scratch project's SQL editor. Run with
-- `psql -v ON_ERROR_STOP=1` so a regression aborts the job non-zero.
--
-- Each block rolls back its own writes. The fixtures are committed, with ids in their own
-- `5a..` range, and nothing else in this file changes the committed settings row.
-- =============================================================================

-- ---- Setup -------------------------------------------------------------------
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a1', 'su_test_admin@example.test',
   '{"username":"su_test_admin","display_name":"Signup Admin"}'),
  ('00000000-0000-0000-0000-0000000005a2', 'su_test_student@example.test',
   '{"username":"su_test_student","display_name":"Signup Student"}')
on conflict (id) do nothing;

update public.profiles set role = 'admin'   where id = '00000000-0000-0000-0000-0000000005a1';
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-0000000005a2';
commit;

-- ---- 1. The shipped defaults allow every sign-up ------------------------------
-- The row schema.sql inserts must change nothing: enabled, any domain, no cap.
begin;
do $$
declare
  v_row public.signup_settings%rowtype;
  v_result jsonb;
begin
  select * into v_row from public.signup_settings;
  if not v_row.signups_enabled
     or cardinality(v_row.allowed_email_domains) <> 0
     or v_row.daily_signup_cap is not null then
    raise exception 'TEST FAILED: the default sign-up settings are not open (enabled=%, domains=%, cap=%)',
      v_row.signups_enabled, v_row.allowed_email_domains, v_row.daily_signup_cap;
  end if;
end $$;

set local role supabase_auth_admin;
do $$
declare
  v_result jsonb;
begin
  v_result := public.hook_before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', 'anyone@anywhere.example')));
  if v_result <> '{}'::jsonb then
    raise exception 'TEST FAILED: default settings refused a sign-up: %', v_result;
  end if;

  -- An account with no email (a phone sign-up) is allowed too while no domain list is set.
  v_result := public.hook_before_user_created('{"user":{}}'::jsonb);
  if v_result <> '{}'::jsonb then
    raise exception 'TEST FAILED: default settings refused an account with no email: %', v_result;
  end if;
  raise notice 'PASS: default settings allow any sign-up (enabled, any domain, no cap)';
end $$;
reset role;
rollback;

-- ---- 2. Admin can read and write; the setter normalises the domains -----------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_count  integer;
begin
  select count(*) into v_count from public.signup_settings;
  if v_count <> 1 then
    raise exception 'TEST FAILED: admin could not read the settings row (saw % rows)', v_count;
  end if;

  v_result := public.set_signup_settings(
    true, array['  @Education.NSW.gov.au ', 'det.nsw.edu.au', 'EDUCATION.nsw.gov.au', ''], 200);
  if v_result->'allowed_email_domains' <> '["det.nsw.edu.au", "education.nsw.gov.au"]'::jsonb then
    raise exception 'TEST FAILED: domains were not normalised and deduplicated: %',
      v_result->'allowed_email_domains';
  end if;
  if (v_result->>'daily_signup_cap')::integer <> 200 then
    raise exception 'TEST FAILED: daily cap not stored: %', v_result;
  end if;
  raise notice 'PASS: admin can read the settings and set them, with domains normalised';
end $$;

-- Bad input is refused, not silently stored.
do $$
begin
  begin
    perform public.set_signup_settings(true, '{}', -1);
    raise exception 'TEST FAILED: a negative daily cap was accepted';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  begin
    perform public.set_signup_settings(true, array['bad domain.example'], null);
    raise exception 'TEST FAILED: a domain with a space was accepted';
  exception when raise_exception then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
  raise notice 'PASS: sign-up settings refuse a negative cap and a malformed domain';
end $$;
reset role;
rollback;

-- ---- 3. Signups switched off refuse every account ------------------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';
set local role authenticated;
select public.set_signup_settings(false, '{}', null);
reset role;

set local role supabase_auth_admin;
do $$
declare
  v_result jsonb;
begin
  v_result := public.hook_before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', 'student@education.nsw.gov.au')));
  if v_result #>> '{error,http_code}' is distinct from '403'
     or v_result #>> '{error,message}' <> 'Sign-ups are closed for this site.' then
    raise exception 'TEST FAILED: disabled sign-ups did not refuse the account: %', v_result;
  end if;
  raise notice 'PASS: disabled sign-ups refuse the account with a 403 and a readable message';
end $$;
reset role;
rollback;

-- ---- 4. Domain list: exact, sub-domain and case-insensitive ---------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';
set local role authenticated;
select public.set_signup_settings(true, array['education.nsw.gov.au', 'det.nsw.edu.au'], null);
reset role;

set local role supabase_auth_admin;
do $$
declare
  v_case   record;
  v_result jsonb;
  v_allowed boolean;
begin
  for v_case in select * from (values
    ('student@education.nsw.gov.au',            true),   -- exact domain
    ('Student@EDUCATION.NSW.GOV.AU',            true),   -- case-insensitive
    ('  student@education.nsw.gov.au  ',        true),   -- surrounding spaces
    ('a.b@school.education.nsw.gov.au',         true),   -- sub-domain
    ('teacher@det.nsw.edu.au',                  true),   -- second listed domain
    ('student@gmail.com',                       false),  -- not listed
    ('student@noteducation.nsw.gov.au',         false),  -- shares letters, not a sub-domain
    ('student@education.nsw.gov.au.evil.test',  false),  -- listed domain as a prefix
    ('student@nsw.gov.au',                      false),  -- parent of a listed domain
    ('student-at-education.nsw.gov.au',         false),  -- no @ at all
    (null,                                      false)   -- no email (phone sign-up)
  ) as t(email, should_allow) loop
    v_result := public.hook_before_user_created(
      case when v_case.email is null then '{"user":{}}'::jsonb
           else jsonb_build_object('user', jsonb_build_object('email', v_case.email)) end);
    v_allowed := v_result = '{}'::jsonb;
    if v_allowed <> v_case.should_allow then
      raise exception 'TEST FAILED: % was % (expected %): %', coalesce(v_case.email, '<no email>'),
        case when v_allowed then 'allowed' else 'refused' end,
        case when v_case.should_allow then 'allowed' else 'refused' end, v_result;
    end if;
    if not v_allowed and v_result #>> '{error,message}'
         <> 'That email address can''t be used to sign up here. Use your school email address.' then
      raise exception 'TEST FAILED: domain refusal for % carried the wrong message: %',
        coalesce(v_case.email, '<no email>'), v_result;
    end if;
  end loop;
  raise notice 'PASS: domain list allows listed domains and their sub-domains, any case, and refuses the rest';
end $$;
reset role;
rollback;

-- ---- 5. Daily cap: refused once today's count reaches it (UTC) ------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';
set local role authenticated;
select public.set_signup_settings(true, '{}', null);
reset role;

-- An account from one minute before UTC midnight is yesterday's, so it must not count.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  (gen_random_uuid(), 'su_yesterday@example.test', '{"username":"su_yesterday"}',
   (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '1 minute');

do $$
declare
  v_today integer;
begin
  select count(*) into v_today from auth.users
   where created_at >= (date_trunc('day', now() at time zone 'UTC')) at time zone 'UTC';
  -- Stash the count for the next blocks by writing it into the cap check below.
  perform set_config('app.signup_test_today', v_today::text, true);
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';
set local role authenticated;
select public.set_signup_settings(true, '{}', current_setting('app.signup_test_today')::integer);
reset role;

set local role supabase_auth_admin;
do $$
declare
  v_result jsonb;
begin
  v_result := public.hook_before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', 'new@example.test')));
  if v_result #>> '{error,message}' <> 'Sign-ups are paused for today. Try again tomorrow.' then
    raise exception 'TEST FAILED: the daily cap did not refuse once reached (cap %): %',
      current_setting('app.signup_test_today'), v_result;
  end if;
  raise notice 'PASS: daily cap refuses the account once today''s count reaches it';
end $$;
reset role;

-- One above today's count: the next account is allowed.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';
set local role authenticated;
select public.set_signup_settings(true, '{}', current_setting('app.signup_test_today')::integer + 1);
reset role;

set local role supabase_auth_admin;
do $$
begin
  if public.hook_before_user_created(
       jsonb_build_object('user', jsonb_build_object('email', 'new@example.test'))) <> '{}'::jsonb then
    raise exception 'TEST FAILED: the daily cap refused an account while under the cap';
  end if;
  raise notice 'PASS: daily cap allows accounts while today is under it';
end $$;
reset role;

-- A cap of zero closes sign-ups for the day; a blank cap is no cap at all.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';
set local role authenticated;
select public.set_signup_settings(true, '{}', 0);
reset role;

set local role supabase_auth_admin;
do $$
begin
  if public.hook_before_user_created(
       jsonb_build_object('user', jsonb_build_object('email', 'new@example.test'))) = '{}'::jsonb then
    raise exception 'TEST FAILED: a daily cap of 0 let an account through';
  end if;
end $$;
reset role;
rollback;

-- ---- 6. Only admins can change or read the settings -----------------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a2","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_count integer;
  v_ok    boolean;
begin
  -- A student cannot open the setter.
  v_ok := false;
  begin
    perform public.set_signup_settings(false, '{}', null);
  exception when others then
    v_ok := sqlerrm like 'Only admins%';
  end;
  if not v_ok then
    raise exception 'TEST FAILED: a non-admin could call set_signup_settings()';
  end if;

  -- Nor read them through the RPC.
  v_ok := false;
  begin
    perform public.get_signup_settings();
  exception when others then
    v_ok := sqlerrm like 'Only admins%';
  end;
  if not v_ok then
    raise exception 'TEST FAILED: a non-admin could call get_signup_settings()';
  end if;

  -- Nor see the row at all: the table read returns nothing rather than an error.
  select count(*) into v_count from public.signup_settings;
  if v_count <> 0 then
    raise exception 'TEST FAILED: a non-admin could read signup_settings (saw % rows)', v_count;
  end if;

  -- Direct writes are refused, by the missing grant or by RLS. Either way the row must not move.
  begin
    update public.signup_settings set signups_enabled = false;
  exception when others then null;
  end;
  begin
    delete from public.signup_settings;
  exception when others then null;
  end;
  begin
    insert into public.signup_settings (id, signups_enabled) values (true, false)
      on conflict (id) do update set signups_enabled = false;
  exception when others then null;
  end;
  raise notice 'PASS: a non-admin cannot call, read or write the sign-up settings';
end $$;
reset role;

do $$
begin
  if not (select signups_enabled from public.signup_settings) then
    raise exception 'TEST FAILED: a non-admin changed signups_enabled';
  end if;
end $$;
rollback;

-- ---- 7. The hook cannot be called by signed-in users or anon --------------------
begin;
set local role authenticated;
do $$
begin
  begin
    perform public.hook_before_user_created('{"user":{"email":"x@example.test"}}'::jsonb);
    raise exception 'TEST FAILED: an authenticated user could call hook_before_user_created()';
  exception when insufficient_privilege then
    raise notice 'PASS: authenticated users cannot call hook_before_user_created()';
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform public.hook_before_user_created('{"user":{"email":"x@example.test"}}'::jsonb);
    raise exception 'TEST FAILED: anon could call hook_before_user_created()';
  exception when insufficient_privilege then
    raise notice 'PASS: anon cannot call hook_before_user_created()';
  end;
end $$;
reset role;
rollback;
