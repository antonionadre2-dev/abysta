-- Abysta 3A: online site-visit drafts, typed answers and immutable revisions.
-- Current active internal owners only. No completion, approval or cost calculation.
begin;

create function abysta_private.site_visit_template()
returns jsonb language sql immutable set search_path = '' as $fn$
 select $template${"key":"office-cleaning-v1","version":1,"title":"Office cleaning · initial survey","sections":[{"id":"requirements","title":"Client requirements","description":"Understand what the client needs and what needs to improve."},{"id":"operations","title":"Building operations","description":"Record when the building is used and when cleaning can take place."},{"id":"access","title":"Access and facilities","description":"Confirm practical arrangements and restrictions for the service."},{"id":"followup","title":"Unvisited areas and follow-up","description":"Make information gaps visible before the next stage."}],"questions":[{"id":"service_type","section":"requirements","label":"Which service is being assessed?","type":"select","required":true,"allow_na":false,"options":[{"value":"recurring","label":"Recurring cleaning"},{"value":"initial","label":"Initial / deep clean"},{"value":"periodic","label":"Periodic cleaning"},{"value":"mixed","label":"Mixed services"}]},{"id":"client_objectives","section":"requirements","label":"What does the client want to achieve?","type":"text","required":true,"allow_na":false},{"id":"current_issues","section":"requirements","label":"What is not working in the current service?","type":"text","required":false,"allow_na":true},{"id":"client_requirements","section":"requirements","label":"What requirements or exclusions has the client specified?","type":"text","required":true,"allow_na":true},{"id":"operating_hours","section":"operations","label":"When is the building open or occupied?","type":"text","required":true,"allow_na":false},{"id":"cleaning_window","section":"operations","label":"When can cleaning take place?","type":"text","required":true,"allow_na":false},{"id":"service_days","section":"operations","label":"How many days per week are being considered?","type":"number","required":false,"allow_na":true,"unit":"days / week","min":0,"max":7,"integer":true},{"id":"typical_occupancy","section":"operations","label":"What is the typical number of occupants?","type":"number","required":false,"allow_na":true,"unit":"people","min":0,"max":1000000,"integer":true},{"id":"access_arrangements","section":"access","label":"How will the cleaning team access the building?","type":"text","required":true,"allow_na":false},{"id":"access_restrictions","section":"access","label":"Which access, security or safety restrictions apply?","type":"text","required":true,"allow_na":true},{"id":"water_available","section":"access","label":"Is a suitable water supply available?","type":"boolean","required":true,"allow_na":false},{"id":"power_available","section":"access","label":"Is a suitable power supply available?","type":"boolean","required":true,"allow_na":false},{"id":"storage_available","section":"access","label":"Is secure cleaning storage available?","type":"boolean","required":true,"allow_na":false},{"id":"waste_arrangements","section":"access","label":"How should waste be collected and removed?","type":"text","required":false,"allow_na":true},{"id":"unvisited_areas","section":"followup","label":"Which areas could not be inspected?","type":"text","required":true,"allow_na":true},{"id":"follow_up","section":"followup","label":"What else needs to be confirmed with the client?","type":"text","required":false,"allow_na":true}]}$template$::jsonb;
$fn$;
revoke all on function abysta_private.site_visit_template() from public, anon, authenticated;

create table public.site_visit (
 tenant_id uuid not null,
 id uuid not null,
 client_company_id uuid not null,
 site_id uuid not null,
 row_version bigint not null check(row_version > 0),
 current_revision_id uuid not null,
 created_by uuid not null references auth.users(id) on delete restrict,
 updated_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default pg_catalog.now(),
 updated_at timestamptz not null default pg_catalog.now(),
 primary key(tenant_id,id),
 unique(tenant_id,client_company_id,site_id,id),
 foreign key(tenant_id,client_company_id,site_id) references public.site(tenant_id,client_company_id,id) on delete restrict
);
create index site_visit_building_idx on public.site_visit(tenant_id,client_company_id,site_id,updated_at desc,id);

create table public.visit_revision (
 tenant_id uuid not null,
 id uuid not null,
 site_visit_id uuid not null,
 client_company_id uuid not null,
 site_id uuid not null,
 revision_number bigint not null check(revision_number>0),
 title text not null check(pg_catalog.char_length(title) between 2 and 160),
 reference text not null check(pg_catalog.char_length(reference)<=40),
 visit_date date check(visit_date between date '1900-01-01' and date '2100-12-31'),
 lead_name text not null check(pg_catalog.char_length(lead_name)<=160),
 contact_name text not null check(pg_catalog.char_length(contact_name)<=160),
 contact_role text not null check(pg_catalog.char_length(contact_role)<=100),
 contact_email text not null check(pg_catalog.char_length(contact_email)<=254),
 contact_phone text not null check(pg_catalog.char_length(contact_phone)<=60),
 notes text not null check(pg_catalog.char_length(notes)<=4000),
 status text not null check(status in ('draft','in_progress')),
 template_key text not null check(template_key='office-cleaning-v1'),
 template_snapshot jsonb not null check(pg_catalog.jsonb_typeof(template_snapshot)='object'),
 answers jsonb not null check(pg_catalog.jsonb_typeof(answers)='object'),
 site_snapshot jsonb not null check(pg_catalog.jsonb_typeof(site_snapshot)='object'),
 client_snapshot jsonb not null check(pg_catalog.jsonb_typeof(client_snapshot)='object'),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default pg_catalog.now(),
 primary key(tenant_id,id),
 unique(tenant_id,site_visit_id,revision_number),
 unique(tenant_id,site_visit_id,id,revision_number),
 foreign key(tenant_id,client_company_id,site_id,site_visit_id) references public.site_visit(tenant_id,client_company_id,site_id,id) on delete restrict,
 check(contact_name<>'' or (contact_role='' and contact_email='' and contact_phone=''))
);
alter table public.site_visit add constraint site_visit_current_revision_fk
 foreign key(tenant_id,id,current_revision_id,row_version)
 references public.visit_revision(tenant_id,site_visit_id,id,revision_number)
 deferrable initially deferred;

create table abysta_private.site_visit_request (
 auth_user_id uuid not null references auth.users(id) on delete restrict,
 tenant_id uuid not null references public.operator_tenant(id) on delete restrict,
 request_id uuid not null,
 client_company_id uuid not null,
 site_id uuid not null,
 visit_id uuid not null,
 expected_version bigint not null,
 payload jsonb not null,
 created_at timestamptz not null default pg_catalog.now(),
 primary key(auth_user_id,tenant_id,request_id),
 foreign key(tenant_id,client_company_id,site_id,visit_id) references public.site_visit(tenant_id,client_company_id,site_id,id) on delete restrict
);
revoke all on abysta_private.site_visit_request from public,anon,authenticated;

create function abysta_private.protect_visit_history()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='visit_revision' or tg_op='DELETE' then
  raise exception using errcode='42501',message='IMMUTABLE_VISIT_HISTORY';
 end if;
 if new.tenant_id<>old.tenant_id or new.id<>old.id or new.client_company_id<>old.client_company_id
  or new.site_id<>old.site_id or new.created_by<>old.created_by or new.created_at<>old.created_at then
  raise exception using errcode='22023',message='IMMUTABLE_SITE';
 end if;
 if new.row_version<>old.row_version+1 or new.current_revision_id=old.current_revision_id then
  raise exception using errcode='22023',message='INVALID_VISIT_VERSION';
 end if;
 return new;
end;
$$;
revoke all on function abysta_private.protect_visit_history() from public,anon,authenticated;
create trigger immutable_visit_revision before update or delete on public.visit_revision for each row execute function abysta_private.protect_visit_history();
create trigger immutable_visit_identity before update or delete on public.site_visit for each row execute function abysta_private.protect_visit_history();

do $$ declare v_table text; begin
 foreach v_table in array array['site_visit','visit_revision'] loop
  execute pg_catalog.format('alter table public.%I enable row level security',v_table);
  execute pg_catalog.format('revoke all on public.%I from public,anon,authenticated',v_table);
  execute pg_catalog.format('grant select on public.%I to authenticated',v_table);
  execute pg_catalog.format('create policy site_visit_owner_select on public.%I for select to authenticated using (abysta_private.is_directory_owner(tenant_id))',v_table);
 end loop;
end; $$;

create function public.save_site_visit(
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
 if not(p_data ?& v_keys) or exists(select 1 from pg_catalog.jsonb_object_keys(p_data) k where not k=any(v_keys)) then
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
 v_next_version:=p_expected_version+1;
 if p_expected_version=0 then
  insert into public.site_visit(tenant_id,id,client_company_id,site_id,row_version,current_revision_id,created_by,updated_by)
  values(p_tenant_id,p_id,p_client_id,p_site_id,v_next_version,v_revision_id,v_actor,v_actor);
 end if;
 insert into public.visit_revision(tenant_id,id,site_visit_id,client_company_id,site_id,revision_number,title,reference,visit_date,
  lead_name,contact_name,contact_role,contact_email,contact_phone,notes,status,template_key,template_snapshot,answers,site_snapshot,client_snapshot,created_by)
 values(p_tenant_id,v_revision_id,p_id,p_client_id,p_site_id,v_next_version,v_data->>'title',v_data->>'reference',v_date,
  v_data->>'lead_name',v_data->>'contact_name',v_data->>'contact_role',v_data->>'contact_email',v_data->>'contact_phone',v_data->>'notes',v_data->>'status',
  v_data->>'template_key',v_template,v_answers,
  pg_catalog.jsonb_build_object('id',v_site.id,'name',v_site.name,'reference',v_site.reference,'address',v_site.address,'timezone',v_site.timezone,'building_type',v_site.building_type),
  pg_catalog.jsonb_build_object('id',v_client.id,'legal_name',v_client.legal_name,'reference',v_client.reference,'address',v_client.address),v_actor);
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

-- Stable functions share a command snapshot for authority, ancestry and revision.
create function abysta_private.require_visit_scope(p_tenant_id uuid,p_client_id uuid,p_site_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception using errcode='28000',message='AUTH_REQUIRED'; end if;
 if not abysta_private.is_directory_owner(p_tenant_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 if p_client_id is null or p_site_id is null then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 perform 1 from public.site s join public.client_company c on c.tenant_id=s.tenant_id and c.id=s.client_company_id
 where s.tenant_id=p_tenant_id and s.client_company_id=p_client_id and s.id=p_site_id;
 if not found then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
end;
$$;
revoke all on function abysta_private.require_visit_scope(uuid,uuid,uuid) from public,anon,authenticated;

create function public.get_site_visit(p_tenant_id uuid,p_client_id uuid,p_site_id uuid,p_id uuid,p_revision_number bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform abysta_private.require_visit_scope(p_tenant_id,p_client_id,p_site_id);
 if p_id is null or (p_revision_number is not null and (p_revision_number<1 or p_revision_number>9007199254740991)) then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 select pg_catalog.jsonb_build_object('visit',pg_catalog.to_jsonb(v),'revision',pg_catalog.to_jsonb(r)) into v_result
 from public.site_visit v join public.visit_revision r on r.tenant_id=v.tenant_id and r.site_visit_id=v.id
  and ((p_revision_number is null and r.id=v.current_revision_id) or (p_revision_number is not null and r.revision_number=p_revision_number))
 where v.tenant_id=p_tenant_id and v.client_company_id=p_client_id and v.site_id=p_site_id and v.id=p_id;
 if v_result is null then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
 return v_result;
end;
$$;
revoke all on function public.get_site_visit(uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.get_site_visit(uuid,uuid,uuid,uuid,bigint) to authenticated;

create function public.list_site_visits(p_tenant_id uuid,p_client_id uuid,p_site_id uuid,p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform abysta_private.require_visit_scope(p_tenant_id,p_client_id,p_site_id);
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>100 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 select pg_catalog.jsonb_build_object('records',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.updated_at desc,page.id) from (
  select v.tenant_id,v.id,v.client_company_id,v.site_id,v.row_version,v.created_at,v.updated_at,r.title,r.reference,r.visit_date,r.lead_name,r.status
  from public.site_visit v join public.visit_revision r on r.tenant_id=v.tenant_id and r.site_visit_id=v.id and r.id=v.current_revision_id
  where v.tenant_id=p_tenant_id and v.client_company_id=p_client_id and v.site_id=p_site_id
  order by v.updated_at desc,v.id offset p_offset limit p_limit
 ) page),'[]'::jsonb), 'total',(select count(*) from public.site_visit v where v.tenant_id=p_tenant_id and v.client_company_id=p_client_id and v.site_id=p_site_id),
 'snapshot_token',(select count(*)::text||':'||coalesce(sum(v.row_version),0)::text from public.site_visit v where v.tenant_id=p_tenant_id and v.client_company_id=p_client_id and v.site_id=p_site_id)) into v_result;
 return v_result;
end;
$$;
revoke all on function public.list_site_visits(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.list_site_visits(uuid,uuid,uuid,integer,integer) to authenticated;

create function public.list_visit_revisions(p_tenant_id uuid,p_client_id uuid,p_site_id uuid,p_id uuid,p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform abysta_private.require_visit_scope(p_tenant_id,p_client_id,p_site_id);
 if p_id is null or p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>100 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 perform 1 from public.site_visit v where v.tenant_id=p_tenant_id and v.client_company_id=p_client_id and v.site_id=p_site_id and v.id=p_id;
 if not found then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
 select pg_catalog.jsonb_build_object('records',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.revision_number desc) from (
  select r.id,r.revision_number,r.title,r.status,r.created_by,r.created_at from public.visit_revision r
  where r.tenant_id=p_tenant_id and r.site_visit_id=p_id order by r.revision_number desc offset p_offset limit p_limit
 ) page),'[]'::jsonb),'total',(select count(*) from public.visit_revision r where r.tenant_id=p_tenant_id and r.site_visit_id=p_id),
 'snapshot_token',(select count(*)::text from public.visit_revision r where r.tenant_id=p_tenant_id and r.site_visit_id=p_id)) into v_result;
 return v_result;
end;
$$;
revoke all on function public.list_visit_revisions(uuid,uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.list_visit_revisions(uuid,uuid,uuid,uuid,integer,integer) to authenticated;

comment on table public.site_visit is 'Owner-only online visit identity. Current revision pointer and version are constrained together.';
comment on table public.visit_revision is 'Append-only saved drafts. No completed/approved claim. Typed answers and parent/template snapshots are frozen per revision.';
commit;
