-- =============================================================================
-- Table/function grants — FOR CI / LOCAL POSTGRES TESTING ONLY.
-- Run AFTER supabase/schema.sql (the objects must exist first).
-- =============================================================================
-- Supabase grants the anon/authenticated roles broad table privileges and lets
-- Row-Level Security do the actual gating. We replicate that here so that, when
-- rls_negative_tests.sql does `set role authenticated`, a blocked operation
-- fails because of an RLS *policy* — not merely a missing table GRANT (which
-- would make the tests pass for the wrong reason).
-- =============================================================================

grant usage on schema public to anon, authenticated;
-- Every table but `schools`. Its privileges are the point of schema §12: the table
-- grant is withdrawn and two columns granted back. A blanket grant here would
-- reopen the whole row for any check that runs before schema.sql's second apply
-- (which re-asserts the revoke), so `schools` takes its grants from schema.sql
-- alone, as it does on a real project.
do $$
declare t text;
begin
  for t in select tablename from pg_tables
            where schemaname = 'public' and tablename <> 'schools' loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to anon, authenticated;
-- NOT granted here: execute on public functions. Those come from the ALTER
-- DEFAULT PRIVILEGES in 01_shim.sql, which fires as each function is created —
-- exactly as Supabase does it. Re-granting after schema.sql would undo every
-- `revoke ... from public, anon` the schema performs, and hide real exposure.
grant execute on all functions in schema auth   to anon, authenticated;
