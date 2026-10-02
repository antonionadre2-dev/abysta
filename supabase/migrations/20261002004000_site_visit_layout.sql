-- Abysta 3B: stable building structure and immutable per-visit observations.
-- Additive to the published 3A baseline; old revisions and receipts are not rewritten.
begin;

alter table public.visit_revision add column layout_snapshot jsonb
 check (layout_snapshot is null or pg_catalog.jsonb_typeof(layout_snapshot)='object');

create table public.site_floor (
 tenant_id uuid not null,
 id uuid not null unique,
 client_company_id uuid not null,
 site_id uuid not null,
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default pg_catalog.now(),
 primary key(tenant_id,id),
 unique(tenant_id,client_company_id,site_id,id),
 foreign key(tenant_id,client_company_id,site_id) references public.site(tenant_id,client_company_id,id) on delete restrict
);
create table public.site_zone (
 tenant_id uuid not null,
 id uuid not null unique,
 client_company_id uuid not null,
 site_id uuid not null,
 floor_id uuid not null,
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default pg_catalog.now(),
 primary key(tenant_id,id),
 foreign key(tenant_id,client_company_id,site_id,floor_id) references public.site_floor(tenant_id,client_company_id,site_id,id) on delete restrict
);
create index site_floor_building_idx on public.site_floor(tenant_id,client_company_id,site_id);
create index site_zone_building_idx on public.site_zone(tenant_id,client_company_id,site_id,floor_id);

create table public.site_inventory (
 tenant_id uuid not null,
 client_company_id uuid not null,
 site_id uuid not null,
 row_version bigint not null check(row_version between 0 and 9007199254740991),
 structure jsonb not null check(pg_catalog.jsonb_typeof(structure)='object'),
 primary key(tenant_id,site_id),
 foreign key(tenant_id,client_company_id,site_id) references public.site(tenant_id,client_company_id,id) on delete restrict
);

create function abysta_private.protect_site_layout()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name<>'site_inventory' or tg_op='DELETE' then
  raise exception using errcode='42501',message='IMMUTABLE_LAYOUT_IDENTITY';
 end if;
 if new.tenant_id<>old.tenant_id or new.client_company_id<>old.client_company_id or new.site_id<>old.site_id then
  raise exception using errcode='22023',message='IMMUTABLE_SITE';
 end if;
 if new.row_version<>old.row_version+1 or new.structure=old.structure then
  raise exception using errcode='22023',message='INVALID_INVENTORY_VERSION';
 end if;
 return new;
end;
$$;
revoke all on function abysta_private.protect_site_layout() from public,anon,authenticated;
create trigger immutable_site_floor before update or delete on public.site_floor for each row execute function abysta_private.protect_site_layout();
create trigger immutable_site_zone before update or delete on public.site_zone for each row execute function abysta_private.protect_site_layout();
create trigger protected_site_inventory before update or delete on public.site_inventory for each row execute function abysta_private.protect_site_layout();
do $$ declare v_table text; begin
 foreach v_table in array array['site_floor','site_zone','site_inventory'] loop
  execute pg_catalog.format('alter table public.%I enable row level security',v_table);
  execute pg_catalog.format('revoke all on public.%I from public,anon,authenticated',v_table);
  execute pg_catalog.format('grant select on public.%I to authenticated',v_table);
  execute pg_catalog.format('create policy layout_owner_select on public.%I for select to authenticated using (abysta_private.is_directory_owner(tenant_id))',v_table);
 end loop;
end; $$;

-- Shared canonical text treatment matches the existing questionnaire and JS trim.
create function abysta_private.layout_text(p_value jsonb,p_max integer,p_min integer default 0,p_multiline boolean default false)
returns text language plpgsql immutable set search_path='' as $$
declare
 v_text text;
 v_trim text:=' ' || U&'\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
 if pg_catalog.jsonb_typeof(p_value) is distinct from 'string' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 v_text:=pg_catalog.btrim(p_value#>>'{}',v_trim);
 if pg_catalog.char_length(v_text) not between p_min and p_max
  or (p_multiline and v_text ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]')
  or (not p_multiline and v_text ~ U&'[\0001-\001F\007F]') then
  raise exception using errcode='22023',message='INVALID_INPUT';
 end if;
 return v_text;
end;
$$;
revoke all on function abysta_private.layout_text(jsonb,integer,integer,boolean) from public,anon,authenticated;

create function abysta_private.validate_layout_measurement(p_value jsonb,p_integer boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_state text; v_source text; v_note text; v_number numeric; v_value jsonb;
begin
 if pg_catalog.jsonb_typeof(p_value) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 if not(p_value ?& array['state','value','source','note'])
  or exists(select 1 from pg_catalog.jsonb_object_keys(p_value) k where k not in ('state','value','source','note')) then
  raise exception using errcode='22023',message='INVALID_INPUT';
 end if;
 v_state:=abysta_private.layout_text(p_value->'state',20);
 v_source:=abysta_private.layout_text(p_value->'source',20);
 v_note:=abysta_private.layout_text(p_value->'note',500,0,true);
 v_value:=p_value->'value';
 if v_state not in ('unanswered','answered','unknown','not_applicable')
  or v_source not in ('','measured','client','plan','estimated','document') then
  raise exception using errcode='22023',message='INVALID_INPUT';
 end if;
 if v_state='answered' then
  if v_source='' or pg_catalog.jsonb_typeof(v_value) is distinct from 'number' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_number:=(v_value#>>'{}')::numeric;
  if v_number<0 or v_number>10000000 or v_number<>pg_catalog.round(v_number,2)
   or (p_integer and v_number<>pg_catalog.trunc(v_number)) then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_value:=pg_catalog.to_jsonb(v_number);
 else
  if v_value is distinct from 'null'::jsonb or v_source<>'' or (v_state='unanswered' and v_note<>'')
   or (v_state in ('unknown','not_applicable') and v_note='') then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 end if;
 return pg_catalog.jsonb_build_object('state',v_state,'value',v_value,'source',v_source,'note',v_note);
end;
$$;
revoke all on function abysta_private.validate_layout_measurement(jsonb,boolean) from public,anon,authenticated;

create function abysta_private.validate_visit_layout(p_layout jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
 v_item jsonb; v_normalized jsonb; v_floors jsonb:='[]'::jsonb; v_zones jsonb:='[]'::jsonb; v_key text;
 v_ids text[]:=array[]::text[]; v_floor_ids text[]:=array[]::text[]; v_id text; v_floor_id text;
 v_version numeric;
 v_uuid text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 v_zone_keys text[]:=array['id','floor_id','name','reference','kind','service_scope','material','condition','occupancy','obstacles','access','exclusion_reason','notes','floor_area','glass_area','edge_length','fixture_count','fixture_type'];
begin
 if pg_catalog.jsonb_typeof(p_layout) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 if not(p_layout ?& array['schema_version','inventory_version','gross_floor_area','floors','zones'])
  or exists(select 1 from pg_catalog.jsonb_object_keys(p_layout) k where k not in ('schema_version','inventory_version','gross_floor_area','floors','zones'))
  or p_layout->'schema_version' is distinct from '1'::jsonb
  or pg_catalog.jsonb_typeof(p_layout->'inventory_version') is distinct from 'number'
  or pg_catalog.jsonb_typeof(p_layout->'floors') is distinct from 'array'
  or pg_catalog.jsonb_typeof(p_layout->'zones') is distinct from 'array' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 v_version:=(p_layout->>'inventory_version')::numeric;
 if v_version<0 or v_version>=9007199254740991 or v_version<>pg_catalog.trunc(v_version)
  or pg_catalog.jsonb_array_length(p_layout->'floors')>50 or pg_catalog.jsonb_array_length(p_layout->'zones')>300 then
  raise exception using errcode='22023',message='INVALID_INPUT';
 end if;
 for v_item in select * from pg_catalog.jsonb_array_elements(p_layout->'floors') loop
  if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if not(v_item ?& array['id','name','reference','level'])
   or exists(select 1 from pg_catalog.jsonb_object_keys(v_item) k where k not in ('id','name','reference','level'))
   or pg_catalog.jsonb_typeof(v_item->'id') is distinct from 'string' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_id:=pg_catalog.lower(abysta_private.layout_text(v_item->'id',36,36));
  if v_id !~ v_uuid or v_id=any(v_ids) then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_ids:=pg_catalog.array_append(v_ids,v_id);v_floor_ids:=pg_catalog.array_append(v_floor_ids,v_id);
  v_floors:=v_floors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id,
   'name',abysta_private.layout_text(v_item->'name',100,1),'reference',abysta_private.layout_text(v_item->'reference',40),'level',abysta_private.layout_text(v_item->'level',20)));
 end loop;
 for v_item in select * from pg_catalog.jsonb_array_elements(p_layout->'zones') loop
  if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if not(v_item ?& v_zone_keys) or exists(select 1 from pg_catalog.jsonb_object_keys(v_item) k where not k=any(v_zone_keys))
   or pg_catalog.jsonb_typeof(v_item->'id') is distinct from 'string' or pg_catalog.jsonb_typeof(v_item->'floor_id') is distinct from 'string' then
   raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_id:=pg_catalog.lower(abysta_private.layout_text(v_item->'id',36,36));v_floor_id:=pg_catalog.lower(abysta_private.layout_text(v_item->'floor_id',36,36));
  if v_id !~ v_uuid or v_id=any(v_ids) or not(v_floor_id=any(v_floor_ids)) then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_ids:=pg_catalog.array_append(v_ids,v_id);
  v_normalized:=pg_catalog.jsonb_build_object('id',v_id,'floor_id',v_floor_id,
   'name',abysta_private.layout_text(v_item->'name',100,1),'reference',abysta_private.layout_text(v_item->'reference',40),
   'kind',abysta_private.layout_text(v_item->'kind',20),'service_scope',abysta_private.layout_text(v_item->'service_scope',20),
   'material',abysta_private.layout_text(v_item->'material',100),'condition',abysta_private.layout_text(v_item->'condition',20),
   'occupancy',abysta_private.layout_text(v_item->'occupancy',200),'fixture_type',abysta_private.layout_text(v_item->'fixture_type',100));
  foreach v_key in array array['obstacles','access','exclusion_reason','notes'] loop
   v_normalized:=v_normalized || pg_catalog.jsonb_build_object(v_key,abysta_private.layout_text(v_item->v_key,1000,0,true));
  end loop;
  if v_normalized->>'kind' not in ('reception','office','washroom','kitchen','stairs','corridor','storage','plant_room','external','other')
   or v_normalized->>'service_scope' not in ('included','excluded','undecided')
   or v_normalized->>'condition' not in ('unknown','good','fair','poor')
   or (v_normalized->>'service_scope'='excluded' and v_normalized->>'exclusion_reason'='') then
   raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  foreach v_key in array array['floor_area','glass_area','edge_length','fixture_count'] loop
   v_normalized:=v_normalized || pg_catalog.jsonb_build_object(v_key,abysta_private.validate_layout_measurement(v_item->v_key,v_key='fixture_count'));
  end loop;
  if v_normalized->'fixture_count'->>'state'='answered' and v_normalized->>'fixture_type'='' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_zones:=v_zones || pg_catalog.jsonb_build_array(v_normalized);
 end loop;
 return pg_catalog.jsonb_build_object('schema_version',1,'inventory_version',v_version,
  'gross_floor_area',abysta_private.validate_layout_measurement(p_layout->'gross_floor_area'),'floors',v_floors,'zones',v_zones);
end;
$$;
revoke all on function abysta_private.validate_visit_layout(jsonb) from public,anon,authenticated;

create function public.get_site_inventory(p_tenant_id uuid,p_client_id uuid,p_site_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform abysta_private.require_visit_scope(p_tenant_id,p_client_id,p_site_id);
 select pg_catalog.jsonb_build_object('version',row_version,'structure',structure) into v_result
 from public.site_inventory where tenant_id=p_tenant_id and client_company_id=p_client_id and site_id=p_site_id;
 return coalesce(v_result,'{"version":0,"structure":{"floors":[],"zones":[]}}'::jsonb);
end;
$$;
revoke all on function public.get_site_inventory(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_site_inventory(uuid,uuid,uuid) to authenticated;

create or replace function public.save_site_visit(
 p_tenant_id uuid,p_client_id uuid,p_site_id uuid,p_id uuid,p_expected_version bigint,p_request_id uuid,p_data jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid();
 v_keys text[]:=array['title','reference','visit_date','lead_name','contact_name','contact_role','contact_email','contact_phone','notes','status','template_key','answers'];
 v_key text; v_text text; v_max integer; v_date date;
 v_trim text:=' ' || U&'\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 v_data jsonb:='{}'::jsonb;
 v_template jsonb:=abysta_private.site_visit_template();
 v_answers jsonb:='{}'::jsonb;
 v_question jsonb; v_answer jsonb; v_qid text; v_qids text[];
 v_state text; v_source text; v_note text; v_value jsonb; v_number numeric;
 v_client public.client_company%rowtype;
 v_site public.site%rowtype;
 v_visit public.site_visit%rowtype;
 v_receipt abysta_private.site_visit_request%rowtype;
 v_revision_id uuid:=pg_catalog.gen_random_uuid();
 v_next_version bigint;
 v_layout jsonb; v_structure jsonb; v_inventory public.site_inventory%rowtype;
 v_inventory_version bigint; v_item jsonb; v_identity_id uuid; v_has_layout boolean;
 v_empty_structure jsonb:='{"floors":[],"zones":[]}'::jsonb;
begin
 if v_actor is null then raise exception using errcode='28000',message='AUTH_REQUIRED'; end if;
 perform 1 from public.operator_tenant t where t.id=p_tenant_id and t.status='active' for share;
 if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 perform 1 from public.membership m where m.tenant_id=p_tenant_id and m.auth_user_id=v_actor and m.member_type='internal'
  and m.status='active' and m.role_codes @> array['owner']::text[] for share;
 if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 if p_client_id is null or p_site_id is null or p_id is null or p_request_id is null
  or p_expected_version is null or p_expected_version<0 or p_expected_version>=9007199254740991
  or pg_catalog.jsonb_typeof(p_data) is distinct from 'object' then
  raise exception using errcode='22023',message='INVALID_INPUT';
 end if;
 if pg_catalog.octet_length(pg_catalog.convert_to(p_data::text,'UTF8'))>512000 then raise exception using errcode='22023',message='PAYLOAD_TOO_LARGE'; end if;
 if not(p_data ?& v_keys) or exists(select 1 from pg_catalog.jsonb_object_keys(p_data) k where not k=any(v_keys) and k<>'layout') then
  raise exception using errcode='22023',message='INVALID_INPUT';
 end if;
 foreach v_key in array v_keys loop
  if v_key='answers' then continue; end if;
  if pg_catalog.jsonb_typeof(p_data->v_key) is distinct from 'string' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_text:=pg_catalog.btrim(p_data->>v_key,v_trim);
  v_max:=case v_key when 'title' then 160 when 'reference' then 40 when 'visit_date' then 10 when 'lead_name' then 160
   when 'contact_name' then 160 when 'contact_role' then 100 when 'contact_email' then 254 when 'contact_phone' then 60
   when 'notes' then 4000 else 64 end;
  if pg_catalog.char_length(v_text)>v_max
   or (v_key='notes' and v_text ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]')
   or (v_key<>'notes' and v_text ~ U&'[\0001-\001F\007F]') then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_data:=v_data || pg_catalog.jsonb_build_object(v_key,v_text);
 end loop;
 if pg_catalog.char_length(v_data->>'title')<2 or v_data->>'status' not in ('draft','in_progress')
  or v_data->>'template_key' <> v_template->>'key'
  or (v_data->>'contact_name'='' and (v_data->>'contact_role'<>'' or v_data->>'contact_email'<>'' or v_data->>'contact_phone'<>''))
  or (v_data->>'contact_email'<>'' and v_data->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
  raise exception using errcode='22023',message='INVALID_INPUT';
 end if;
 if v_data->>'visit_date'<>'' then
  if v_data->>'visit_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  begin v_date:=(v_data->>'visit_date')::date;
  exception when datetime_field_overflow or invalid_datetime_format then raise exception using errcode='22023',message='INVALID_INPUT'; end;
  if v_date<date '1900-01-01' or v_date>date '2100-12-31' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 end if;
 if pg_catalog.jsonb_typeof(p_data->'answers') is distinct from 'object' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 select pg_catalog.array_agg(q->>'id') into v_qids from pg_catalog.jsonb_array_elements(v_template->'questions') q;
 if not(p_data->'answers' ?& v_qids) or exists(select 1 from pg_catalog.jsonb_object_keys(p_data->'answers') k where not k=any(v_qids)) then
  raise exception using errcode='22023',message='INVALID_INPUT';
 end if;
 for v_question in select * from pg_catalog.jsonb_array_elements(v_template->'questions') loop
  v_qid:=v_question->>'id'; v_answer:=p_data->'answers'->v_qid;
  if pg_catalog.jsonb_typeof(v_answer) is distinct from 'object' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if not(v_answer ?& array['state','value','source','note']) or exists(select 1 from pg_catalog.jsonb_object_keys(v_answer) k where k not in ('state','value','source','note'))
   or pg_catalog.jsonb_typeof(v_answer->'state') is distinct from 'string'
   or pg_catalog.jsonb_typeof(v_answer->'source') is distinct from 'string'
   or pg_catalog.jsonb_typeof(v_answer->'note') is distinct from 'string' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_state:=pg_catalog.btrim(v_answer->>'state',v_trim); v_source:=pg_catalog.btrim(v_answer->>'source',v_trim);
  v_note:=pg_catalog.btrim(v_answer->>'note',v_trim); v_value:=v_answer->'value';
  if v_state not in ('unanswered','answered','unknown','not_applicable') or v_source not in ('','client','observed','measured','estimated','plan','document')
   or pg_catalog.char_length(v_note)>1000 or v_note ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if v_state<>'answered' then
   if v_value is distinct from 'null'::jsonb or v_source<>'' or (v_state='unanswered' and v_note<>'')
    or (v_state in ('unknown','not_applicable') and v_note='')
    or (v_state='not_applicable' and not(v_question->>'allow_na')::boolean) then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  else
   if v_source='' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
   case v_question->>'type'
   when 'text' then
    if pg_catalog.jsonb_typeof(v_value) is distinct from 'string' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    v_text:=pg_catalog.btrim(v_value#>>'{}',v_trim);
    if pg_catalog.char_length(v_text) not between 1 and 2000 or v_text ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    v_value:=pg_catalog.to_jsonb(v_text);
   when 'select' then
    if pg_catalog.jsonb_typeof(v_value) is distinct from 'string' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    v_text:=pg_catalog.btrim(v_value#>>'{}',v_trim);
    if not exists(select 1 from pg_catalog.jsonb_array_elements(v_question->'options') o where o->>'value'=v_text) then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    v_value:=pg_catalog.to_jsonb(v_text);
   when 'boolean' then
    if pg_catalog.jsonb_typeof(v_value) is distinct from 'boolean' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
   when 'number' then
    if pg_catalog.jsonb_typeof(v_value) is distinct from 'number' then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
    v_number:=(v_value#>>'{}')::numeric;
    if v_number<>pg_catalog.trunc(v_number) or v_number<(v_question->>'min')::numeric or v_number>(v_question->>'max')::numeric then
     raise exception using errcode='22023',message='INVALID_INPUT';
    end if;
    v_value:=pg_catalog.to_jsonb(v_number);
   else raise exception using errcode='22023',message='INVALID_INPUT';
   end case;
  end if;
  v_answers:=v_answers || pg_catalog.jsonb_build_object(v_qid,pg_catalog.jsonb_build_object('state',v_state,'value',v_value,'source',v_source,'note',v_note));
 end loop;
 v_data:=v_data || pg_catalog.jsonb_build_object('answers',v_answers);
 v_has_layout:=p_data ? 'layout';
 if v_has_layout then
  v_layout:=abysta_private.validate_visit_layout(p_data->'layout');
  -- Receipt stores the input expected inventory version, not the resulting one.
  v_data:=v_data || pg_catalog.jsonb_build_object('layout',v_layout);
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visit:'||v_actor::text||':'||p_tenant_id::text||':'||p_request_id::text,0));
 -- Lock ancestry before replay. Archive/revocation cannot be bypassed by receipts.
 select * into v_client from public.client_company where tenant_id=p_tenant_id and id=p_client_id for update;
 if not found then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
 select * into v_site from public.site where tenant_id=p_tenant_id and client_company_id=p_client_id and id=p_site_id for update;
 if not found then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
 if v_client.status<>'active' or v_site.status<>'active' then raise exception using errcode='22023',message='PARENT_ARCHIVED'; end if;
 select * into v_receipt from abysta_private.site_visit_request where auth_user_id=v_actor and tenant_id=p_tenant_id and request_id=p_request_id;
 if found then
  if v_receipt.client_company_id<>p_client_id or v_receipt.site_id<>p_site_id or v_receipt.visit_id<>p_id
   or v_receipt.expected_version<>p_expected_version or v_receipt.payload<>v_data then raise exception using errcode='22023',message='REQUEST_KEY_REUSED'; end if;
  return p_id;
 end if;
 -- The site row serializes initial inventory creation too (there may be no inventory row).
 -- A valid receipt returns above before checking either current version.
 if v_has_layout then
  select * into v_inventory from public.site_inventory where tenant_id=p_tenant_id and site_id=p_site_id for update;
  v_inventory_version:=coalesce(v_inventory.row_version,0);
  if (v_layout->>'inventory_version')::bigint<>v_inventory_version then raise exception using errcode='PT409',message='STALE_INVENTORY'; end if;
 end if;
 select * into v_visit from public.site_visit where tenant_id=p_tenant_id and id=p_id for update;
 if found then
  if v_visit.client_company_id<>p_client_id or v_visit.site_id<>p_site_id then raise exception using errcode='22023',message='IMMUTABLE_SITE'; end if;
  -- A stale form is an application conflict, not a retryable PostgreSQL
  -- serialization failure. PT409 prevents PostgREST from replaying a request
  -- whose expected version can never become current again.
  if p_expected_version=0 or v_visit.row_version<>p_expected_version then raise exception using errcode='PT409',message='STALE_RECORD'; end if;
 else
  if p_expected_version>0 then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
 end if;
 if v_has_layout then
  -- Global ID locks, in a single deterministic order, prevent cross-table races:
  -- the same ID can never be a floor in one building and a zone in another.
  for v_identity_id in
   select (x->>'id')::uuid from pg_catalog.jsonb_array_elements((v_layout->'floors') || (v_layout->'zones')) x order by (x->>'id')::uuid
  loop
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('layout:'||v_identity_id::text,0));
  end loop;
  for v_item in select * from pg_catalog.jsonb_array_elements(v_layout->'floors') loop
   v_identity_id:=(v_item->>'id')::uuid;
   if exists(select 1 from public.site_zone where id=v_identity_id)
    or exists(select 1 from public.site_floor where id=v_identity_id and (tenant_id<>p_tenant_id or client_company_id<>p_client_id or site_id<>p_site_id)) then
    raise exception using errcode='22023',message='INVALID_LAYOUT_ID';
   end if;
   insert into public.site_floor(tenant_id,id,client_company_id,site_id,created_by)
   values(p_tenant_id,v_identity_id,p_client_id,p_site_id,v_actor) on conflict(tenant_id,id) do nothing;
  end loop;
  for v_item in select * from pg_catalog.jsonb_array_elements(v_layout->'zones') loop
   v_identity_id:=(v_item->>'id')::uuid;
   if exists(select 1 from public.site_floor where id=v_identity_id)
    or exists(select 1 from public.site_zone where id=v_identity_id and (tenant_id<>p_tenant_id or client_company_id<>p_client_id or site_id<>p_site_id or floor_id<>(v_item->>'floor_id')::uuid)) then
    raise exception using errcode='22023',message='INVALID_LAYOUT_ID';
   end if;
   insert into public.site_zone(tenant_id,id,client_company_id,site_id,floor_id,created_by)
   values(p_tenant_id,v_identity_id,p_client_id,p_site_id,(v_item->>'floor_id')::uuid,v_actor) on conflict(tenant_id,id) do nothing;
  end loop;
  select pg_catalog.jsonb_build_object('floors',v_layout->'floors','zones',coalesce(pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('id',z->>'id','floor_id',z->>'floor_id','name',z->>'name','reference',z->>'reference','kind',z->>'kind') order by ord),'[]'::jsonb))
  into v_structure from pg_catalog.jsonb_array_elements(v_layout->'zones') with ordinality as zones(z,ord);
  if v_structure<>coalesce(v_inventory.structure,v_empty_structure) then
   if v_inventory_version>=9007199254740991 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
   v_inventory_version:=v_inventory_version+1;
  end if;
  if v_inventory.site_id is null then
   insert into public.site_inventory(tenant_id,client_company_id,site_id,row_version,structure)
   values(p_tenant_id,p_client_id,p_site_id,v_inventory_version,v_structure);
  elsif v_inventory_version<>v_inventory.row_version then
   update public.site_inventory set row_version=v_inventory_version,structure=v_structure where tenant_id=p_tenant_id and site_id=p_site_id;
  end if;
  v_layout:=pg_catalog.jsonb_set(v_layout,'{inventory_version}',pg_catalog.to_jsonb(v_inventory_version));
 else
  -- Old 3A clients keep the preceding snapshot intact, never reset structure.
  select layout_snapshot into v_layout from public.visit_revision where tenant_id=p_tenant_id and id=v_visit.current_revision_id;
 end if;
 v_next_version:=p_expected_version+1;
 if p_expected_version=0 then
  insert into public.site_visit(tenant_id,id,client_company_id,site_id,row_version,current_revision_id,created_by,updated_by)
  values(p_tenant_id,p_id,p_client_id,p_site_id,v_next_version,v_revision_id,v_actor,v_actor);
 end if;
 insert into public.visit_revision(tenant_id,id,site_visit_id,client_company_id,site_id,revision_number,title,reference,visit_date,
  lead_name,contact_name,contact_role,contact_email,contact_phone,notes,status,template_key,template_snapshot,answers,site_snapshot,client_snapshot,created_by,layout_snapshot)
 values(p_tenant_id,v_revision_id,p_id,p_client_id,p_site_id,v_next_version,v_data->>'title',v_data->>'reference',v_date,
  v_data->>'lead_name',v_data->>'contact_name',v_data->>'contact_role',v_data->>'contact_email',v_data->>'contact_phone',v_data->>'notes',v_data->>'status',
  v_data->>'template_key',v_template,v_answers,
  pg_catalog.jsonb_build_object('id',v_site.id,'name',v_site.name,'reference',v_site.reference,'address',v_site.address,'timezone',v_site.timezone,'building_type',v_site.building_type),
  pg_catalog.jsonb_build_object('id',v_client.id,'legal_name',v_client.legal_name,'reference',v_client.reference,'address',v_client.address),v_actor,v_layout);
 if p_expected_version>0 then
  update public.site_visit set row_version=v_next_version,current_revision_id=v_revision_id,updated_by=v_actor,updated_at=pg_catalog.clock_timestamp()
   where tenant_id=p_tenant_id and id=p_id;
 end if;
 insert into abysta_private.site_visit_request(auth_user_id,tenant_id,request_id,client_company_id,site_id,visit_id,expected_version,payload)
 values(v_actor,p_tenant_id,p_request_id,p_client_id,p_site_id,p_id,p_expected_version,v_data);
 return p_id;
end;
$$;
revoke all on function public.save_site_visit(uuid,uuid,uuid,uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_site_visit(uuid,uuid,uuid,uuid,bigint,uuid,jsonb) to authenticated;

comment on table public.site_floor is 'Append-only stable building floor identities; current names/order live in site_inventory. Omission does not delete history.';
comment on table public.site_zone is 'Append-only stable zones with immutable floor/building ancestry; observation values live only in visit revisions.';
comment on table public.site_inventory is 'Current reusable building structure. Optimistic version changes for structure only, never measurements.';
comment on column public.visit_revision.layout_snapshot is 'Nullable for 3A history; null means not recorded. Full frozen 3B layout with resulting inventory version.';
commit;
