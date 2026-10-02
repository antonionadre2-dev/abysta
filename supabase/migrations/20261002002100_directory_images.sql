-- Private, immutable directory image versions. Requires directory migration.
begin;
-- This protects revocation from signed download URLs issued outside the app.
-- Do not remove this guard on an older Storage service; update Storage first.
do $$ begin
 if pg_catalog.to_regprocedure('storage.allow_any_operation(text[])') is null then
  raise exception 'ABYSTA_STORAGE_OPERATION_HELPER_REQUIRED: update Supabase Storage before applying directory images';
 end if;
end $$;

create table public.asset_version (
  tenant_id uuid not null references public.operator_tenant(id) on delete restrict,
  id uuid not null,
  parent_kind text not null check (parent_kind in ('company','client','site')),
  parent_id uuid not null,
  client_company_id uuid generated always as (case when parent_kind='client' then parent_id end) stored,
  site_id uuid generated always as (case when parent_kind='site' then parent_id end) stored,
  check (parent_kind<>'company' or parent_id=tenant_id),
  foreign key (tenant_id,client_company_id) references public.client_company(tenant_id,id) on delete restrict,
  foreign key (tenant_id,site_id) references public.site(tenant_id,id) on delete restrict,
  object_name text not null unique,
  content_type text not null default 'image/webp' check (content_type = 'image/webp'),
  byte_size bigint not null check (byte_size between 1 and 3145728),
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (tenant_id,id)
);
alter table public.asset_version enable row level security;
revoke all on public.asset_version from public,anon,authenticated;
grant select on public.asset_version to authenticated;
create policy directory_asset_owner_read on public.asset_version for select to authenticated
using (abysta_private.is_directory_owner(tenant_id));

alter table public.operator_tenant add column logo_asset_id uuid;
alter table public.operator_tenant add constraint operator_logo_asset_fk
 foreign key (id,logo_asset_id) references public.asset_version(tenant_id,id) on delete restrict;
alter table public.client_company add column image_asset_id uuid;
alter table public.client_company add constraint client_image_asset_fk
 foreign key (tenant_id,image_asset_id) references public.asset_version(tenant_id,id) on delete restrict;
alter table public.site add column image_asset_id uuid;
alter table public.site add constraint site_image_asset_fk
 foreign key (tenant_id,image_asset_id) references public.asset_version(tenant_id,id) on delete restrict;

create table abysta_private.directory_image_request (
 actor_id uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null,
 payload jsonb not null,
 result_version bigint not null,
 created_at timestamptz not null default pg_catalog.now(),
 primary key(actor_id,request_id)
);
revoke all on abysta_private.directory_image_request from public,anon,authenticated;

-- Bucket configuration only; object bytes and metadata are written by Storage API.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 values ('abysta-directory-images','abysta-directory-images',false,3145728,array['image/webp'])
 on conflict (id) do update set public=false,file_size_limit=3145728,allowed_mime_types=array['image/webp'];

create function abysta_private.can_upload_directory_image(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]; t uuid; r uuid; k text;
begin
 if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(company|client|site)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' then return false; end if;
 parts:=pg_catalog.string_to_array(p_name,'/'); t:=parts[1]::uuid; k:=parts[2]; r:=parts[3]::uuid;
 if not abysta_private.is_directory_owner(t) then return false; end if;
 if k='company' then return r=t; end if;
 if k='client' then
  return exists(select 1 from public.client_company c where c.tenant_id=t and c.id=r and c.status='active');
 end if;
 return exists(select 1 from public.site s join public.client_company c on c.tenant_id=s.tenant_id and c.id=s.client_company_id where s.tenant_id=t and s.id=r and s.status='active' and c.status='active');
end $$;
create function abysta_private.can_read_directory_image(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.asset_version a where a.object_name=p_name and abysta_private.is_directory_owner(a.tenant_id));
$$;
revoke all on function abysta_private.can_upload_directory_image(text),abysta_private.can_read_directory_image(text) from public,anon,authenticated;
grant execute on function abysta_private.can_upload_directory_image(text),abysta_private.can_read_directory_image(text) to authenticated;

create policy abysta_image_insert on storage.objects for insert to authenticated
with check(bucket_id='abysta-directory-images' and storage.allow_any_operation(array['object.upload']) and owner_id=(select auth.uid())::text and abysta_private.can_upload_directory_image(name));
create policy abysta_image_read on storage.objects for select to authenticated
using(bucket_id='abysta-directory-images' and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) and abysta_private.can_read_directory_image(name));
-- Restrictive guards prevent unrelated broad permissive policies from opening this bucket.
create policy abysta_image_insert_guard on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'abysta-directory-images' or (storage.allow_any_operation(array['object.upload']) and owner_id=(select auth.uid())::text and abysta_private.can_upload_directory_image(name)));
create policy abysta_image_read_guard on storage.objects as restrictive for select to authenticated
using(bucket_id<>'abysta-directory-images' or (storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) and abysta_private.can_read_directory_image(name)));
create policy abysta_image_no_update on storage.objects as restrictive for update to authenticated
using(bucket_id<>'abysta-directory-images') with check(bucket_id<>'abysta-directory-images');
create policy abysta_image_no_delete on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'abysta-directory-images');
create policy abysta_image_no_anon on storage.objects as restrictive for all to anon
using(bucket_id<>'abysta-directory-images') with check(bucket_id<>'abysta-directory-images');

create function public.set_directory_image(
 p_kind text,p_tenant_id uuid,p_record_id uuid,p_expected_version bigint,p_request_id uuid,
 p_asset_id uuid,p_sha256 text,p_width integer,p_height integer,p_byte_size bigint
) returns bigint language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_version bigint; record_status text; client_id uuid;
 object_path text; receipt abysta_private.directory_image_request%rowtype; payload jsonb; result bigint;
begin
 if actor is null then raise exception using errcode='28000',message='AUTH_REQUIRED'; end if;
 if not abysta_private.is_directory_owner(p_tenant_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 if p_kind is null or p_kind not in ('company','client','site') or p_record_id is null or p_request_id is null or p_expected_version is null or p_expected_version<1 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 -- Lock parent records before validation; archive/edit and image attach cannot race.
 perform 1 from public.operator_tenant where id=p_tenant_id and status='active' for update;
 if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 perform 1 from public.membership where tenant_id=p_tenant_id and auth_user_id=actor and member_type='internal' and status='active' and role_codes @> array['owner'] for share;
 if not found or not abysta_private.is_directory_owner(p_tenant_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 if p_kind='company' then
  if p_record_id<>p_tenant_id then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  select row_version,status into current_version,record_status from public.operator_tenant where id=p_tenant_id;
 elsif p_kind='client' then
  select row_version,status into current_version,record_status from public.client_company where tenant_id=p_tenant_id and id=p_record_id for update;
 else
  select s.client_company_id into client_id from public.site s where s.tenant_id=p_tenant_id and s.id=p_record_id;
  if client_id is null then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
  perform 1 from public.client_company c where c.tenant_id=p_tenant_id and c.id=client_id and c.status='active' for update;
  if not found then raise exception using errcode='22023',message='PARENT_ARCHIVED'; end if;
  select row_version,status into current_version,record_status from public.site where tenant_id=p_tenant_id and id=p_record_id for update;
 end if;
 if current_version is null then raise exception using errcode='P0002',message='RECORD_NOT_FOUND'; end if;
 if record_status<>'active' then raise exception using errcode='22023',message='PARENT_ARCHIVED'; end if;
 payload:=pg_catalog.jsonb_build_array(p_kind,p_tenant_id,p_record_id,p_expected_version,p_asset_id,p_sha256,p_width,p_height,p_byte_size);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':'||p_request_id::text,41));
 select * into receipt from abysta_private.directory_image_request where actor_id=actor and request_id=p_request_id;
 if found then
  if receipt.payload<>payload then raise exception using errcode='22023',message='REQUEST_KEY_REUSED'; end if;
  return receipt.result_version;
 end if;
 if current_version<>p_expected_version then raise exception using errcode='40001',message='STALE_RECORD'; end if;
 if p_asset_id is null then
  if p_sha256 is not null or p_width is not null or p_height is not null or p_byte_size is not null then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
 else
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_width is null or p_width not between 1 and 1600 or p_height is null or p_height not between 1 and 1600 or p_byte_size is null or p_byte_size not between 1 and 3145728 then raise exception using errcode='22023',message='INVALID_IMAGE'; end if;
  object_path:=p_tenant_id::text||'/'||p_kind||'/'||p_record_id::text||'/'||p_asset_id::text||'.webp';
  if not exists(select 1 from storage.objects o where o.bucket_id='abysta-directory-images' and o.name=object_path and o.owner_id=actor::text and o.metadata->>'mimetype'='image/webp' and (o.metadata->>'size')=p_byte_size::text) then raise exception using errcode='22023',message='IMAGE_UPLOAD_MISSING'; end if;
  if exists(select 1 from public.asset_version where tenant_id=p_tenant_id and id=p_asset_id) then raise exception using errcode='22023',message='IMAGE_ALREADY_REGISTERED'; end if;
  insert into public.asset_version(tenant_id,id,parent_kind,parent_id,object_name,byte_size,width,height,sha256,created_by) values(p_tenant_id,p_asset_id,p_kind,p_record_id,object_path,p_byte_size,p_width,p_height,p_sha256,actor);
 end if;
 if p_kind='company' then
  update public.operator_tenant set logo_asset_id=p_asset_id where id=p_tenant_id returning row_version into result;
 elsif p_kind='client' then
  update public.client_company set image_asset_id=p_asset_id where tenant_id=p_tenant_id and id=p_record_id returning row_version into result;
 else
  update public.site set image_asset_id=p_asset_id where tenant_id=p_tenant_id and id=p_record_id returning row_version into result;
 end if;
 insert into abysta_private.directory_image_request(actor_id,request_id,payload,result_version) values(actor,p_request_id,payload,result);
 return result;
end $$;
revoke all on function public.set_directory_image(text,uuid,uuid,bigint,uuid,uuid,text,integer,integer,bigint) from public,anon,authenticated;
grant execute on function public.set_directory_image(text,uuid,uuid,bigint,uuid,uuid,text,integer,integer,bigint) to authenticated;
commit;
