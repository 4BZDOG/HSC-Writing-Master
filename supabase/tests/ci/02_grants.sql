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
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
-- NOT granted here: execute on public functions. Those come from the ALTER
-- DEFAULT PRIVILEGES in 01_shim.sql, which fires as each function is created —
-- exactly as Supabase does it. Re-granting after schema.sql would undo every
-- `revoke ... from public, anon` the schema performs, and hide real exposure.
grant execute on all functions in schema auth   to anon, authenticated;
