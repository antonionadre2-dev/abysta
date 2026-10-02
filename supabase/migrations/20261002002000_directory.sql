-- Abysta phase 2: owner-only client, building and portfolio directory.
-- No financial permissions, customer access or direct authenticated writes.
begin;

create function abysta_private.is_directory_owner(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership m
    join public.operator_tenant t on t.id = m.tenant_id
    where m.tenant_id = p_tenant_id and m.auth_user_id = (select auth.uid())
      and m.member_type = 'internal' and m.status = 'active'
      and m.role_codes @> array['owner']::text[] and t.status = 'active'
  );
$$;
revoke all on function abysta_private.is_directory_owner(uuid) from public, anon, authenticated;
grant execute on function abysta_private.is_directory_owner(uuid) to authenticated;

create table public.client_company (
  tenant_id uuid not null references public.operator_tenant(id) on delete restrict,
  id uuid not null default pg_catalog.gen_random_uuid(),
  legal_name text not null check (pg_catalog.char_length(legal_name) between 2 and 160),
  reference text not null default '' check (pg_catalog.char_length(reference) <= 40),
  address text not null default '' check (pg_catalog.char_length(address) <= 1000),
  notes text not null default '' check (pg_catalog.char_length(notes) <= 4000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  row_version bigint not null default 1 check (row_version > 0),
  primary key (tenant_id, id)
);
create unique index client_company_reference_uq on public.client_company (tenant_id, pg_catalog.lower(reference)) where reference <> '';

create table public.site (
  tenant_id uuid not null,
  id uuid not null default pg_catalog.gen_random_uuid(),
  client_company_id uuid not null,
  name text not null check (pg_catalog.char_length(name) between 2 and 160),
  reference text not null default '' check (pg_catalog.char_length(reference) <= 40),
  address text not null check (pg_catalog.char_length(address) between 5 and 1000),
  timezone text not null default 'Europe/London',
  building_type text not null check (building_type in ('office','retail','industrial','residential','education','healthcare','hospitality','mixed_use','other')),
  notes text not null default '' check (pg_catalog.char_length(notes) <= 4000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  row_version bigint not null default 1 check (row_version > 0),
  primary key (tenant_id, id),
  unique (tenant_id, client_company_id, id),
  foreign key (tenant_id, client_company_id) references public.client_company(tenant_id,id) on delete restrict
);
create unique index site_reference_uq on public.site (tenant_id, client_company_id, pg_catalog.lower(reference)) where reference <> '';

create table public.portfolio (
  tenant_id uuid not null,
  id uuid not null default pg_catalog.gen_random_uuid(),
  client_company_id uuid not null,
  name text not null check (pg_catalog.char_length(name) between 2 and 160),
  reference text not null default '' check (pg_catalog.char_length(reference) <= 40),
  notes text not null default '' check (pg_catalog.char_length(notes) <= 4000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  row_version bigint not null default 1 check (row_version > 0),
  primary key (tenant_id, id),
  unique (tenant_id, client_company_id, id),
  foreign key (tenant_id, client_company_id) references public.client_company(tenant_id,id) on delete restrict
);
create unique index portfolio_reference_uq on public.portfolio (tenant_id, client_company_id, pg_catalog.lower(reference)) where reference <> '';

create table public.client_contact (
  tenant_id uuid not null,
  id uuid not null default pg_catalog.gen_random_uuid(),
  client_company_id uuid not null,
  site_id uuid,
  name text not null default '' check (pg_catalog.char_length(name) <= 160),
  email text not null default '' check (pg_catalog.char_length(email) <= 254),
  phone text not null default '' check (pg_catalog.char_length(phone) <= 60),
  job_title text not null default '' check (pg_catalog.char_length(job_title) <= 100),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  row_version bigint not null default 1 check (row_version > 0),
  primary key (tenant_id, id),
  foreign key (tenant_id, client_company_id) references public.client_company(tenant_id,id) on delete restrict,
  foreign key (tenant_id, client_company_id, site_id) references public.site(tenant_id,client_company_id,id) on delete restrict,
  check (name <> '' or (email = '' and phone = '' and job_title = ''))
);
create unique index client_contact_primary_uq on public.client_contact(tenant_id,client_company_id) where site_id is null;
create unique index client_contact_site_uq on public.client_contact(tenant_id,site_id) where site_id is not null;

create table public.portfolio_site (
  tenant_id uuid not null,
  id uuid not null default pg_catalog.gen_random_uuid(),
  client_company_id uuid not null,
  portfolio_id uuid not null,
  site_id uuid not null,
  joined_at timestamptz not null default pg_catalog.now(),
  left_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  row_version bigint not null default 1 check (row_version > 0),
  primary key (tenant_id,id),
  foreign key (tenant_id,client_company_id,portfolio_id) references public.portfolio(tenant_id,client_company_id,id) on delete restrict,
  foreign key (tenant_id,client_company_id,site_id) references public.site(tenant_id,client_company_id,id) on delete restrict,
  check (left_at is null or left_at >= joined_at)
);
create unique index portfolio_site_active_uq on public.portfolio_site(tenant_id,portfolio_id,site_id) where left_at is null;
create index portfolio_site_site_idx on public.portfolio_site(tenant_id,site_id) where left_at is null;

create table abysta_private.directory_request (
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  tenant_id uuid not null references public.operator_tenant(id) on delete restrict,
  kind text not null,
  record_id uuid not null,
  expected_version bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (auth_user_id,request_id)
);
revoke all on abysta_private.directory_request from public, anon, authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array['client_company','site','portfolio','client_contact','portfolio_site'] loop
    execute pg_catalog.format('alter table public.%I enable row level security',v_table);
    execute pg_catalog.format('revoke all on public.%I from public, anon, authenticated',v_table);
    execute pg_catalog.format('grant select on public.%I to authenticated',v_table);
    execute pg_catalog.format('create policy directory_owner_select on public.%I for select to authenticated using (abysta_private.is_directory_owner(tenant_id))',v_table);
    execute pg_catalog.format('create trigger directory_row_metadata before update on public.%I for each row execute function abysta_private.advance_row_metadata()',v_table);
  end loop;
end;
$$;

create function public.save_directory_record(
  p_kind text, p_tenant_id uuid, p_id uuid, p_expected_version bigint,
  p_request_id uuid, p_data jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_keys text[];
  v_key text;
  v_value text;
  v_max integer;
  v_data jsonb := '{}'::jsonb;
  v_client_id uuid;
  v_old_client_id uuid;
  v_site_ids uuid[] := '{}'::uuid[];
  v_site_text text;
  v_version bigint;
  v_status text;
  v_contact_id uuid;
  v_receipt abysta_private.directory_request%rowtype;
  v_constraint text;
begin
  if v_actor is null then raise exception using errcode='28000',message='AUTH_REQUIRED'; end if;
  -- Lock current authority until commit. A concurrent revocation/archive either
  -- precedes this write or waits for its transaction to finish.
  perform 1 from public.operator_tenant t where t.id=p_tenant_id and t.status='active' for share;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  perform 1 from public.membership m where m.tenant_id=p_tenant_id and m.auth_user_id=v_actor
    and m.member_type='internal' and m.status='active' and m.role_codes @> array['owner']::text[] for share;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if p_kind is null or p_kind not in ('client','site','portfolio') or p_id is null
    or p_request_id is null or p_expected_version is null or p_expected_version < 0
    or p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode='22023',message='INVALID_INPUT';
  end if;
  v_keys := case p_kind
    when 'client' then array['legal_name','reference','address','notes','status','contact_name','contact_email','contact_phone','contact_role']
    when 'site' then array['client_company_id','name','reference','address','timezone','building_type','notes','status','contact_name','contact_email','contact_phone','contact_role']
    else array['client_company_id','name','reference','notes','status','site_ids'] end;
  if exists (select 1 from pg_catalog.jsonb_object_keys(p_data) k where not k=any(v_keys))
    or not (p_data ?& v_keys) then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  foreach v_key in array v_keys loop
    if v_key='site_ids' then continue; end if;
    if pg_catalog.jsonb_typeof(p_data->v_key) <> 'string' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    v_value := pg_catalog.btrim(p_data->>v_key,' ' || U&'\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
    v_max := case v_key when 'legal_name' then 160 when 'name' then 160 when 'reference' then 40
      when 'address' then 1000 when 'notes' then 4000 when 'contact_name' then 160
      when 'contact_email' then 254 when 'contact_phone' then 60 when 'contact_role' then 100
      when 'timezone' then 128 when 'client_company_id' then 36 else 32 end;
    if pg_catalog.char_length(v_value)>v_max or
      (v_key in ('notes','address') and v_value ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]') or
      (v_key not in ('notes','address') and v_value ~ U&'[\0001-\001F\007F]') then
      raise exception using errcode='22023',message='INVALID_INPUT';
    end if;
    v_data := v_data || pg_catalog.jsonb_build_object(v_key,v_value);
  end loop;
  if pg_catalog.char_length(v_data->>case when p_kind='client' then 'legal_name' else 'name' end)<2
    or v_data->>'status' not in ('active','archived') then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if p_kind<>'portfolio' then
    if (v_data->>'contact_name'='' and (v_data->>'contact_email'<>'' or v_data->>'contact_phone'<>'' or v_data->>'contact_role'<>''))
      or (v_data->>'contact_email'<>'' and v_data->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
      raise exception using errcode='22023',message='INVALID_INPUT';
    end if;
  end if;
  if p_kind='site' and (pg_catalog.char_length(v_data->>'address')<5
    or v_data->>'building_type' not in ('office','retail','industrial','residential','education','healthcare','hospitality','mixed_use','other')
    or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_data->>'timezone')) then
    raise exception using errcode='22023',message='INVALID_INPUT';
  end if;
  if p_kind<>'client' then
    if v_data->>'client_company_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='INVALID_INPUT';
    end if;
    v_client_id := (v_data->>'client_company_id')::uuid;
    v_data := v_data || pg_catalog.jsonb_build_object('client_company_id',v_client_id::text);
  end if;
  if p_kind='portfolio' then
    if pg_catalog.jsonb_typeof(p_data->'site_ids')<>'array' then raise exception using errcode='22023',message='INVALID_SITE_SELECTION'; end if;
    if pg_catalog.jsonb_array_length(p_data->'site_ids')>5000 then raise exception using errcode='22023',message='INVALID_SITE_SELECTION'; end if;
    if exists(select 1 from pg_catalog.jsonb_array_elements(p_data->'site_ids') a where pg_catalog.jsonb_typeof(a)<>'string') then
      raise exception using errcode='22023',message='INVALID_SITE_SELECTION';
    end if;
    for v_site_text in select pg_catalog.jsonb_array_elements_text(p_data->'site_ids') loop
      if v_site_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using errcode='22023',message='INVALID_SITE_SELECTION';
      end if;
      v_site_ids := pg_catalog.array_append(v_site_ids,v_site_text::uuid);
    end loop;
    if (select count(distinct s) from pg_catalog.unnest(v_site_ids) s)<>pg_catalog.cardinality(v_site_ids) then
      raise exception using errcode='22023',message='INVALID_SITE_SELECTION';
    end if;
    select coalesce(pg_catalog.array_agg(s order by s),'{}'::uuid[]) into v_site_ids from pg_catalog.unnest(v_site_ids) s;
    v_data := v_data || pg_catalog.jsonb_build_object('site_ids',pg_catalog.to_jsonb(v_site_ids));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || p_request_id::text,0));
  select * into v_receipt from abysta_private.directory_request r where r.auth_user_id=v_actor and r.request_id=p_request_id;
  if found then
    if v_receipt.tenant_id<>p_tenant_id or v_receipt.kind<>p_kind or v_receipt.record_id<>p_id
      or v_receipt.expected_version<>p_expected_version or v_receipt.payload<>v_data then
      raise exception using errcode='22023',message='REQUEST_KEY_REUSED';
    end if;
    return p_id;
  end if;

  -- All child modifications serialize on their parent client. This also makes
  -- archive/client-change and portfolio selection races deterministic.
  if p_kind<>'client' then
    select c.status into v_status from public.client_company c where c.tenant_id=p_tenant_id and c.id=v_client_id for update;
    if not found then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
    if v_status<>'active' then raise exception using errcode='22023',message='PARENT_ARCHIVED'; end if;
  end if;
  if p_kind='client' then
    select c.row_version into v_version from public.client_company c where c.tenant_id=p_tenant_id and c.id=p_id for update;
  elsif p_kind='site' then
    select s.row_version,s.client_company_id into v_version,v_old_client_id from public.site s where s.tenant_id=p_tenant_id and s.id=p_id for update;
  else
    select p.row_version,p.client_company_id into v_version,v_old_client_id from public.portfolio p where p.tenant_id=p_tenant_id and p.id=p_id for update;
  end if;
  if p_expected_version=0 and v_version is not null then raise exception using errcode='40001',message='STALE_RECORD'; end if;
  if p_expected_version>0 and v_version is null then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
  if p_expected_version>0 and v_version<>p_expected_version then raise exception using errcode='40001',message='STALE_RECORD'; end if;
  if v_old_client_id is not null and v_old_client_id<>v_client_id then raise exception using errcode='22023',message='IMMUTABLE_CLIENT'; end if;

  if p_kind='portfolio' then
    if exists(select 1 from pg_catalog.unnest(v_site_ids) chosen(id)
      left join public.site s on s.tenant_id=p_tenant_id and s.client_company_id=v_client_id and s.id=chosen.id
      where s.id is null or (s.status<>'active' and not exists(
        select 1 from public.portfolio_site ps where ps.tenant_id=p_tenant_id and ps.portfolio_id=p_id and ps.site_id=s.id and ps.left_at is null))) then
      raise exception using errcode='22023',message='INVALID_SITE_SELECTION';
    end if;
  end if;
  if p_kind='client' then
    if p_expected_version=0 then
      insert into public.client_company(tenant_id,id,legal_name,reference,address,notes,status,created_by)
      values(p_tenant_id,p_id,v_data->>'legal_name',v_data->>'reference',v_data->>'address',v_data->>'notes',v_data->>'status',v_actor);
    else
      update public.client_company set legal_name=v_data->>'legal_name',reference=v_data->>'reference',address=v_data->>'address',notes=v_data->>'notes',status=v_data->>'status'
      where tenant_id=p_tenant_id and id=p_id;
    end if;
    v_client_id := p_id;
  elsif p_kind='site' then
    if p_expected_version=0 then
      insert into public.site(tenant_id,id,client_company_id,name,reference,address,timezone,building_type,notes,status,created_by)
      values(p_tenant_id,p_id,v_client_id,v_data->>'name',v_data->>'reference',v_data->>'address',v_data->>'timezone',v_data->>'building_type',v_data->>'notes',v_data->>'status',v_actor);
    else
      update public.site set name=v_data->>'name',reference=v_data->>'reference',address=v_data->>'address',timezone=v_data->>'timezone',building_type=v_data->>'building_type',notes=v_data->>'notes',status=v_data->>'status'
      where tenant_id=p_tenant_id and id=p_id;
    end if;
  else
    if p_expected_version=0 then
      insert into public.portfolio(tenant_id,id,client_company_id,name,reference,notes,status,created_by)
      values(p_tenant_id,p_id,v_client_id,v_data->>'name',v_data->>'reference',v_data->>'notes',v_data->>'status',v_actor);
    else
      update public.portfolio set name=v_data->>'name',reference=v_data->>'reference',notes=v_data->>'notes',status=v_data->>'status' where tenant_id=p_tenant_id and id=p_id;
    end if;
    update public.portfolio_site set left_at=pg_catalog.clock_timestamp()
      where tenant_id=p_tenant_id and portfolio_id=p_id and left_at is null and not(site_id=any(v_site_ids));
    insert into public.portfolio_site(tenant_id,client_company_id,portfolio_id,site_id,created_by)
      select p_tenant_id,v_client_id,p_id,s,v_actor from pg_catalog.unnest(v_site_ids) s
      where not exists(select 1 from public.portfolio_site ps where ps.tenant_id=p_tenant_id and ps.portfolio_id=p_id and ps.site_id=s and ps.left_at is null);
  end if;
  if p_kind<>'portfolio' then
    select c.id into v_contact_id from public.client_contact c
      where c.tenant_id=p_tenant_id and c.client_company_id=v_client_id
      and ((p_kind='client' and c.site_id is null) or (p_kind='site' and c.site_id=p_id));
    if v_contact_id is not null then
      update public.client_contact set name=v_data->>'contact_name',email=v_data->>'contact_email',phone=v_data->>'contact_phone',job_title=v_data->>'contact_role'
        where tenant_id=p_tenant_id and id=v_contact_id;
    elsif v_data->>'contact_name'<>'' then
      insert into public.client_contact(tenant_id,client_company_id,site_id,name,email,phone,job_title,created_by)
      values(p_tenant_id,v_client_id,case when p_kind='site' then p_id else null end,v_data->>'contact_name',v_data->>'contact_email',v_data->>'contact_phone',v_data->>'contact_role',v_actor);
    end if;
  end if;
  insert into abysta_private.directory_request(auth_user_id,request_id,tenant_id,kind,record_id,expected_version,payload)
    values(v_actor,p_request_id,p_tenant_id,p_kind,p_id,p_expected_version,v_data);
  return p_id;
exception when unique_violation then
  get stacked diagnostics v_constraint=constraint_name;
  if v_constraint in ('client_company_reference_uq','site_reference_uq','portfolio_reference_uq') then
    raise exception using errcode='23505',message='DUPLICATE_REFERENCE';
  end if;
  if v_constraint in ('client_company_pkey','site_pkey','portfolio_pkey') then
    raise exception using errcode='40001',message='STALE_RECORD';
  end if;
  raise;
end;
$$;
revoke all on function public.save_directory_record(text,uuid,uuid,bigint,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_directory_record(text,uuid,uuid,bigint,uuid,jsonb) to authenticated;
comment on function public.save_directory_record(text,uuid,uuid,bigint,uuid,jsonb) is 'Owner-only transactional directory save. Complete payload, optimistic version, actor-scoped retry key; no hard delete.';
comment on table public.site is 'Independent building record. Portfolio membership never clones a building.';
comment on table public.portfolio_site is 'Same-client many-to-many history. Removal closes a link; re-add creates a new link.';

-- Each editable bundle is returned with its row_version in one statement
-- snapshot. Separate parent/contact/link API reads can otherwise pair a new
-- parent version with stale dependent fields and defeat optimistic edits.
create function public.get_directory_records(
  p_tenant_id uuid, p_kind text, p_offset integer default 0, p_limit integer default 500
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode='28000',message='AUTH_REQUIRED'; end if;
  if not abysta_private.is_directory_owner(p_tenant_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if p_kind is null or p_kind not in ('client','site','portfolio') or p_offset is null or p_offset<0
    or p_limit is null or p_limit not between 1 and 500 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if p_kind='client' then
    return (
      select pg_catalog.jsonb_build_object(
        'total',(select count(*) from public.client_company c where c.tenant_id=p_tenant_id),
        'records',coalesce((select pg_catalog.jsonb_agg(bundle order by id) from (
          select c.id, pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object(
            'contact_name',coalesce(ct.name,''),'contact_email',coalesce(ct.email,''),
            'contact_phone',coalesce(ct.phone,''),'contact_role',coalesce(ct.job_title,'')
          ) as bundle
          from public.client_company c
          left join public.client_contact ct on ct.tenant_id=c.tenant_id and ct.client_company_id=c.id and ct.site_id is null
          where c.tenant_id=p_tenant_id order by c.id offset p_offset limit p_limit
        ) page),'[]'::jsonb)
      )
    );
  elsif p_kind='site' then
    return (
      select pg_catalog.jsonb_build_object(
        'total',(select count(*) from public.site s where s.tenant_id=p_tenant_id),
        'records',coalesce((select pg_catalog.jsonb_agg(bundle order by id) from (
          select s.id, pg_catalog.to_jsonb(s) || pg_catalog.jsonb_build_object(
            'contact_name',coalesce(ct.name,''),'contact_email',coalesce(ct.email,''),
            'contact_phone',coalesce(ct.phone,''),'contact_role',coalesce(ct.job_title,'')
          ) as bundle
          from public.site s
          left join public.client_contact ct on ct.tenant_id=s.tenant_id and ct.client_company_id=s.client_company_id and ct.site_id=s.id
          where s.tenant_id=p_tenant_id order by s.id offset p_offset limit p_limit
        ) page),'[]'::jsonb)
      )
    );
  end if;
  return (
    select pg_catalog.jsonb_build_object(
      'total',(select count(*) from public.portfolio p where p.tenant_id=p_tenant_id),
      'records',coalesce((select pg_catalog.jsonb_agg(bundle order by id) from (
        select p.id, pg_catalog.to_jsonb(p) || pg_catalog.jsonb_build_object(
          'links',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ps) order by ps.id)
            from public.portfolio_site ps where ps.tenant_id=p.tenant_id and ps.portfolio_id=p.id and ps.left_at is null),'[]'::jsonb)
        ) as bundle
        from public.portfolio p where p.tenant_id=p_tenant_id order by p.id offset p_offset limit p_limit
      ) page),'[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.get_directory_records(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.get_directory_records(uuid,text,integer,integer) to authenticated;
comment on function public.get_directory_records(uuid,text,integer,integer)
is 'Owner-only paged directory bundles. Parent version and editable contact/link fields share one statement snapshot; nested links are not API-row capped.';

commit;
