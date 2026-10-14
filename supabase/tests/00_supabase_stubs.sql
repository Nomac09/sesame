-- Stubs for the Supabase-provided objects the migration depends on, so the
-- migration can be validated against vanilla Postgres.
create role anon;
create role authenticated;
create role service_role;

grant usage on schema public to anon, authenticated;

-- Supabase grants table privileges to anon/authenticated by default privilege,
-- at creation time. Mirror that so the migration's REVOKE is tested for real.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

create schema auth;
create table auth.users (id uuid primary key);

-- Stand-in for Supabase's auth.jwt(). Returns whatever we stuff into a GUC.
create function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(current_setting('test.jwt', true), '{}')::jsonb;
$$;

create publication supabase_realtime;
