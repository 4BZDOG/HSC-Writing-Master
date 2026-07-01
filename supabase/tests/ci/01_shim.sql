-- =============================================================================
-- Supabase compatibility shim — FOR CI / LOCAL POSTGRES TESTING ONLY.
-- =============================================================================
-- A real Supabase project ships the `auth` schema, the `auth.uid()` /
-- `auth.role()` helpers, and the `anon` / `authenticated` / `service_role`
-- roles. A plain `postgres:15` container in CI does not, so schema.sql (which
-- references `auth.users` and `auth.uid()`) and rls_negative_tests.sql (which
-- impersonates the `authenticated` role) cannot run against it as-is.
--
-- This file stands up the minimal slice of that platform so the SAME schema.sql
-- and tests run unmodified in CI. Run order:
--   1. this shim          2. supabase/schema.sql
--   3. supabase/tests/ci/02_grants.sql   4. supabase/tests/rls_negative_tests.sql
--
-- Never apply this to a real Supabase project — it would collide with the
-- platform's own auth objects.
-- =============================================================================

create extension if not exists pgcrypto;

-- Platform roles. `authenticated`/`anon` are RLS-bound (no bypass); only
-- `service_role` bypasses RLS, mirroring Supabase.
do $$ begin create role anon          nologin noinherit;            exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit;            exception when duplicate_object then null; end $$;
do $$ begin create role service_role  nologin noinherit bypassrls;  exception when duplicate_object then null; end $$;

create schema if not exists auth;

-- Minimal auth.users: only the columns schema.sql touches (the FK target id,
-- the email used by handle_new_user, and raw_user_meta_data it reads).
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- auth.uid(): resolve the 'sub' claim from the request.jwt.claims GUC, exactly
-- as Supabase's PostgREST sets it per request. Returns null when unset (the SQL
-- editor / a service-role connection), which the role-escalation trigger and
-- the RLS policies rely on.
create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
  language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon');
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on auth.users to service_role;
