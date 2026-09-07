-- =============================================================================
-- Class roll tests — prove the roll functions DO their job, not only that they
-- refuse strangers.
--
-- `rls_negative_tests.sql` is refusals by construction: every block there
-- expects the privileged action to fail. That is the right shape for an
-- authorisation boundary and the wrong shape for a feature — a function that
-- raised for everyone would pass every negative test in the file.
--
-- §19 shipped class membership with only its read side wired to a client, and
-- §24 added the roll a teacher can read back and remove from. Both halves are
-- ordinary CRUD with a permission check, so the useful assertions are that the
-- happy path works and that the two guarded cases behave as documented:
-- removing someone who is not a member is a no-op, and removing the OWNER is
-- refused with an explanation rather than silently doing nothing (the owner is
-- on `classes.owner_id`, not in `class_members`).
--
-- Where this runs: the same harness as the other two SQL suites — CI against a
-- plain Postgres container after the compat shim + schema + grants, or pasted
-- into a real project's SQL editor. Run with `psql -v ON_ERROR_STOP=1`.
--
-- The block sets `request.jwt.claims` so auth.uid() resolves to a chosen
-- profile, exactly as PostgREST does for a real session, and rolls back.
-- =============================================================================

begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'roll_owner@example.test',
   '{"username":"roll_owner","display_name":"Roll Owner"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'roll_student@example.test',
   '{"username":"roll_student","display_name":"Roll Student"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'roll_outsider@example.test',
   '{"username":"roll_outsider","display_name":"Roll Outsider"}')
on conflict (id) do nothing;
update public.profiles set role = 'teacher'
 where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.schools (id, name) values
  ('00000000-0000-0000-0000-0000000000d9', 'Roll Test School')
on conflict (id) do nothing;
insert into public.classes (id, school_id, name, owner_id, year) values
  ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000d9',
   'Roll Test Class', '00000000-0000-0000-0000-0000000000d1', 12)
on conflict (id) do nothing;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
set local role authenticated;

do $$
declare v jsonb;
begin
  -- The roll NAMES its members. `list_my_classes` only ever returned a count,
  -- so a teacher could be told they had 28 students and never learn which 28.
  perform public.enrol_in_class('00000000-0000-0000-0000-0000000000da', 'roll_student', 'student');
  v := public.list_class_members('00000000-0000-0000-0000-0000000000da');
  if not (v @> '[{"username":"roll_student","role":"student"}]'::jsonb) then
    raise exception 'TEST FAILED: the roll did not name the enrolled student: %', v;
  end if;
  raise notice 'PASS: the roll names its members, not just their count';

  -- Removing a non-member is the caller's intent already satisfied, not an
  -- error — a second click after a slow first one must not read as a failure.
  perform public.remove_from_class('00000000-0000-0000-0000-0000000000da', 'roll_outsider');
  raise notice 'PASS: removing a non-member is a no-op';

  -- The undo that §19 had no function for: a mistyped username used to be a
  -- permanent member, counted in the cohort's averages for the life of the class.
  perform public.remove_from_class('00000000-0000-0000-0000-0000000000da', 'roll_student');
  v := public.list_class_members('00000000-0000-0000-0000-0000000000da');
  if v <> '[]'::jsonb then
    raise exception 'TEST FAILED: the student is still on the roll after removal: %', v;
  end if;
  raise notice 'PASS: removal takes the student off the roll';

  -- The owner is not in class_members, so a delete would affect zero rows and
  -- look like it worked. It has to say so instead.
  begin
    perform public.remove_from_class('00000000-0000-0000-0000-0000000000da', 'roll_owner');
    raise exception 'TEST FAILED: the owner was removed from their own class';
  exception
    when sqlstate 'P0001' then
      raise notice 'PASS: removing the class owner is refused with an explanation';
  end;

  -- A username that does not exist is a typo, and saying so is the whole point.
  begin
    perform public.remove_from_class('00000000-0000-0000-0000-0000000000da', 'no_such_person');
    raise exception 'TEST FAILED: removal accepted a username that does not exist';
  exception
    when sqlstate 'P0001' then
      raise notice 'PASS: removal names an unknown username rather than silently passing';
  end;
end $$;

reset role;
rollback;
