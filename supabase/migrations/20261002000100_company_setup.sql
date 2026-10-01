-- Abysta milestone 1: first company setup and read-only workspace access.
-- Apply through Supabase migrations, never from a browser or an untrusted role.

begin;

create schema if not exists abysta_private;
revoke all on schema abysta_private from public, anon, authenticated;
grant usage on schema abysta_private to authenticated;

create table public.operator_tenant (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null check (pg_catalog.char_length(name) between 2 and 120),
  currency text not null check (currency in ('GBP', 'CHF', 'EUR', 'USD')),
  timezone text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  row_version bigint not null default 1 check (row_version > 0)
);

create table public.membership (
  tenant_id uuid not null references public.operator_tenant(id) on delete restrict,
  id uuid not null default pg_catalog.gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  member_type text not null check (member_type in ('internal', 'client')),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  role_codes text[] not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  row_version bigint not null default 1 check (row_version > 0),
  primary key (tenant_id, id),
  unique (tenant_id, auth_user_id),
  check (pg_catalog.cardinality(role_codes) between 1 and 16),
  check (pg_catalog.array_position(role_codes, null) is null),
  check (not (role_codes @> array['']::text[]))
);

create index membership_active_user_idx
  on public.membership (auth_user_id, tenant_id)
  where status = 'active' and member_type = 'internal';

-- A receipt is scoped to the authenticated actor. It is deliberately not an
-- API table and neither its contents nor its existence can be read by clients.
create table abysta_private.company_setup_request (
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  name text not null,
  currency text not null,
  timezone text not null,
  tenant_id uuid not null references public.operator_tenant(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (auth_user_id, request_id)
);
revoke all on abysta_private.company_setup_request from public, anon, authenticated;

create function abysta_private.advance_row_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;
revoke all on function abysta_private.advance_row_metadata() from public, anon, authenticated;

create trigger operator_tenant_row_metadata
before update on public.operator_tenant
for each row execute function abysta_private.advance_row_metadata();
create trigger membership_row_metadata
before update on public.membership
for each row execute function abysta_private.advance_row_metadata();

-- Fixed-path SECURITY DEFINER helpers avoid recursive membership RLS. They
-- always evaluate the current authenticated actor, never a supplied user ID.
create function abysta_private.is_active_internal_member(p_tenant_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    join public.operator_tenant t on t.id = m.tenant_id
    where m.tenant_id = p_tenant_id
      and m.auth_user_id = (select auth.uid())
      and m.member_type = 'internal'
      and m.status = 'active'
      and t.status = 'active'
  );
$$;

create function abysta_private.is_active_company_admin(p_tenant_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    join public.operator_tenant t on t.id = m.tenant_id
    where m.tenant_id = p_tenant_id
      and m.auth_user_id = (select auth.uid())
      and m.member_type = 'internal'
      and m.status = 'active'
      and t.status = 'active'
      and m.role_codes && array['owner', 'admin']::text[]
  );
$$;

revoke all on function abysta_private.is_active_internal_member(uuid) from public, anon, authenticated;
revoke all on function abysta_private.is_active_company_admin(uuid) from public, anon, authenticated;
grant execute on function abysta_private.is_active_internal_member(uuid) to authenticated;
grant execute on function abysta_private.is_active_company_admin(uuid) to authenticated;

alter table public.operator_tenant enable row level security;
alter table public.membership enable row level security;

revoke all on public.operator_tenant from public, anon, authenticated;
revoke all on public.membership from public, anon, authenticated;
grant select on public.operator_tenant to authenticated;
grant select on public.membership to authenticated;

create policy operator_tenant_select_active_member
on public.operator_tenant for select to authenticated
using (abysta_private.is_active_internal_member(id));

create policy membership_select_self_or_company_admin
on public.membership for select to authenticated
using (
  abysta_private.is_active_internal_member(tenant_id)
  and (
    auth_user_id = (select auth.uid())
    or abysta_private.is_active_company_admin(tenant_id)
  )
);

create function public.create_operator_tenant(
  p_name text,
  p_currency text,
  p_timezone text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
  v_tenant_id uuid;
  v_receipt abysta_private.company_setup_request%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_actor and u.email_confirmed_at is not null
  ) then
    raise exception using errcode = '28000', message = 'EMAIL_NOT_VERIFIED';
  end if;

  -- Match JavaScript String.trim(), including non-breaking and Unicode spaces.
  v_name := pg_catalog.btrim(
    p_name,
    ' ' || U&'\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
  );
  if v_name is null or pg_catalog.char_length(v_name) not between 2 and 120
     or v_name ~ U&'[\0001-\001F\007F]' then
    raise exception using errcode = '22023', message = 'INVALID_COMPANY_NAME';
  end if;
  if p_currency is null or p_currency not in ('GBP', 'CHF', 'EUR', 'USD') then
    raise exception using errcode = '22023', message = 'INVALID_CURRENCY';
  end if;
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone
  ) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_ID';
  end if;

  -- Serialize all onboarding requests from this actor, including different
  -- request keys from multiple tabs. A hash collision only delays another user.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 0));

  select * into v_receipt
  from abysta_private.company_setup_request r
  where r.auth_user_id = v_actor and r.request_id = p_request_id;
  if found then
    if v_receipt.name <> v_name or v_receipt.currency <> p_currency
       or v_receipt.timezone <> p_timezone then
      raise exception using errcode = '22023', message = 'REQUEST_KEY_REUSED';
    end if;
    if not abysta_private.is_active_internal_member(v_receipt.tenant_id) then
      raise exception using errcode = '42501', message = 'COMPANY_ACCESS_REVOKED';
    end if;
    return v_receipt.tenant_id;
  end if;

  -- This RPC is the first-workspace onboarding entrypoint, not a general
  -- additional-company creator. Existing/future multi-memberships are valid.
  if exists (
    select 1 from public.membership m
    join public.operator_tenant t on t.id = m.tenant_id
    where m.auth_user_id = v_actor and m.member_type = 'internal'
      and m.status = 'active' and t.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'ABYSTA_ALREADY_HAS_WORKSPACE';
  end if;

  insert into public.operator_tenant (name, currency, timezone, created_by)
  values (v_name, p_currency, p_timezone, v_actor)
  returning id into v_tenant_id;

  insert into public.membership (tenant_id, auth_user_id, member_type, status, role_codes)
  values (v_tenant_id, v_actor, 'internal', 'active', array['owner']::text[]);

  insert into abysta_private.company_setup_request
    (auth_user_id, request_id, name, currency, timezone, tenant_id)
  values (v_actor, p_request_id, v_name, p_currency, p_timezone, v_tenant_id);

  return v_tenant_id;
end;
$$;

revoke all on function public.create_operator_tenant(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_operator_tenant(text, text, text, uuid) to authenticated;

comment on function public.create_operator_tenant(text, text, text, uuid)
is 'First-workspace onboarding only. Atomically creates an operator tenant, authenticated owner membership, and private idempotency receipt. No financial or approval permission is implied.';
comment on table public.operator_tenant is 'Operating company (security tenant), not a customer or a building.';
comment on table public.membership is 'Current workspace membership. Roles do not implement future financial, client, export, or approval capabilities.';

commit;
