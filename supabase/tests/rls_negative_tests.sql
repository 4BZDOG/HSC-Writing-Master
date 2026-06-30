-- =============================================================================
-- RLS negative tests — run these AFTER schema.sql in the Supabase SQL editor
-- (or `psql`) to prove the authorisation boundaries actually hold, not just
-- that they look right on paper.
--
-- Technique: the SQL editor / psql connects as the Postgres superuser, which
-- bypasses RLS entirely. To test as a real end-user we have to:
--   1. `set local role authenticated;`            — adopt the RLS-bound role
--   2. set the `request.jwt.claims` GUC so `auth.uid()` resolves to a chosen
--      profile id, exactly like PostgREST does for a real session.
-- Each block is wrapped in its own transaction and rolled back, so this is
-- safe to run against a project with real data.
--
-- Expected result for every block below: the privileged action FAILS (raises
-- an exception, or affects 0 rows / returns 0 rows). If any block instead
-- succeeds, the corresponding policy/trigger has regressed.
-- =============================================================================

-- ---- Setup: two throwaway, non-admin profiles -------------------------------
begin;
insert into public.profiles (id, username, display_name, role)
values
  ('00000000-0000-0000-0000-0000000000a1', 'rls_test_student_a', 'RLS Test A', 'student'),
  ('00000000-0000-0000-0000-0000000000a2', 'rls_test_student_b', 'RLS Test B', 'student')
on conflict (id) do update set role = 'student';
commit;

-- ---- 1. A student cannot self-promote to admin ------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

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
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

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
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

do $$
declare v_dot_point_id uuid; v_prompt_id uuid;
begin
  -- Reuse any existing dot_point as a parent; skip cleanly if none exist yet.
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
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

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

-- ---- Cleanup ------------------------------------------------------------------
begin;
delete from public.profiles where id in (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a2'
);
commit;
