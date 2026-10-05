-- Imitação mínima do Supabase para testar as migrações num PostgreSQL comum
-- (usado por ferramentas/testa-banco.sh; NÃO rode isto no Supabase de verdade).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;   -- a chave secreta: só a função do servidor usa
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
-- autenticadores do MFA (no Supabase o status é um enum: unverified / verified)
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friendly_name text, factor_type text not null default 'totp',
  status text not null default 'unverified'
);
-- igual ao auth.uid() do Supabase: lê o "sub" do token (PostgREST 12 grava os dados em request.jwt.claims)
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
-- igual ao auth.jwt() do Supabase: o token inteiro (inclui "aal": aal1 ou aal2)
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- como no Supabase: tudo o que for criado em "public" já nasce liberado para anon, authenticated e service_role.
-- As migrações é que precisam tirar o que não deve ficar aberto (e os testes conferem isso).
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
