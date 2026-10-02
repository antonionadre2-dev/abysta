/** Actual SQL migrations in PGlite with minimal Auth/Storage metadata shims.
 * Storage API, object bytes, bucket enforcement and concurrency need hosted QA.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash='a'.repeat(64);

test('Directory images: immutable references and private Storage policies',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
  create role anon nologin;create role authenticated nologin;create schema auth;
  create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
  create schema storage;
  -- Only the official operation predicate is shimmed; policies themselves are real.
  create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$ select coalesce(current_setting('test.storage.operation',true)=any(operations),false) $$;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated,anon;
  grant select,insert,update,delete on storage.objects to authenticated,anon;
 `);
 for(const file of ['20261002000100_company_setup.sql','20261002002000_directory.sql','20261002002100_directory_images.sql'])await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 for(let n=1;n<=6;n++)await db.query('insert into auth.users values($1,now())',[uuid(n)]);
 async function as(actor,sql,params=[],role='authenticated',operation='object.get_authenticated'){
  await db.exec('begin');try{await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor??'']);await db.query("select set_config('test.storage.operation',$1,true)",[operation]);const rows=(await db.query(sql,params)).rows;await db.exec('commit');return rows;}catch(error){await db.exec('rollback');throw error;}
 }
 const fail=(fn,message,code)=>assert.rejects(fn,e=>{if(message)assert.equal(e.message,message);if(code)assert.equal(e.code,code);return true;});
 const a=(await as(uuid(1),'select create_operator_tenant($1,$2,$3,$4) id',['Alpha Operator','GBP','Europe/London',uuid(50)]))[0].id;
 const b=(await as(uuid(2),'select create_operator_tenant($1,$2,$3,$4) id',['Beta Operator','GBP','Europe/London',uuid(50)]))[0].id;
 for(const [n,type,status,roles]of [[3,'internal','active',['admin']],[4,'internal','active',['owner']],[5,'client','active',['owner']],[6,'internal','revoked',['owner']]])await db.query('insert into membership(tenant_id,auth_user_id,member_type,status,role_codes)values($1,$2,$3,$4,$5)',[a,uuid(n),type,status,roles]);
 const c=uuid(100),c2=uuid(101),site=uuid(200),siteB=uuid(201);
 await db.query('insert into client_company(tenant_id,id,legal_name,created_by)values($1,$2,$3,$4),($1,$5,$6,$4),($7,$8,$9,$10)',[a,c,'Client A',uuid(1),c2,'Second Client',b,uuid(102),'Foreign Client',uuid(2)]);
 await db.query("insert into site(tenant_id,id,client_company_id,name,address,building_type,created_by)values($1,$2,$3,'Building A','1 City Road','office',$4),($5,$6,$7,'Building B','2 City Road','office',$8)",[a,site,c,uuid(1),b,siteB,uuid(102),uuid(2)]);
 const path=(tenant,kind,id,asset)=>`${tenant}/${kind}/${id}/${asset}.webp`;
 const upload=(asset,{actor=uuid(1),tenant=a,kind='client',id=c,owner=actor,mime='image/webp',size=100,name=path(tenant,kind,id,asset)}={})=>as(actor,'insert into storage.objects(bucket_id,name,owner_id,metadata)values($1,$2,$3,$4::jsonb)',['abysta-directory-images',name,owner,JSON.stringify({mimetype:mime,size})],'authenticated','object.upload');
 let sequence=500;
 const attach=(asset,{actor=uuid(1),tenant=a,kind='client',id=c,version=1,key=uuid(++sequence),sha=asset?hash:null,width=asset?100:null,height=asset?100:null,size=asset?100:null}={})=>as(actor,'select set_directory_image($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) v',[kind,tenant,id,version,key,asset,sha,width,height,size]).then(rows=>Number(rows[0].v));
 const asset=uuid(300),request=uuid(5010);

 await t.test('bucket is private with only WebP and 3 MiB configured',async()=>{
  const row=(await db.query('select * from storage.buckets')).rows[0];assert.equal(row.public,false);assert.equal(Number(row.file_size_limit),3145728);assert.deepEqual(row.allowed_mime_types,['image/webp']);
 });
 await t.test('anonymous RPC and missing actor are rejected',async()=>{
  await fail(()=>as(null,'select set_directory_image(null,null,null,null,null,null,null,null,null,null)',[],'anon'),undefined,'42501');
  await fail(()=>attach(asset,{actor:null}),'AUTH_REQUIRED');
 });
 await t.test('other tenants and non-owner memberships cannot upload or register',async()=>{
  for(const n of [2,3,5,6]){await fail(()=>upload(asset,{actor:uuid(n)}),undefined,'42501');await fail(()=>attach(asset,{actor:uuid(n)}),'FORBIDDEN');}
 });
 await t.test('malformed paths, different tenant, missing or foreign parents and spoofed owner fail',async()=>{
  for(const options of [{name:'../image.webp'},{name:path(a,'client',c,asset)+'/extra'},{tenant:b},{id:uuid(999)},{kind:'site',id:siteB},{kind:'company',id:c},{owner:uuid(2)}])await fail(()=>upload(asset,options),undefined,'42501');
 });
 await t.test('registration cannot precede a matching Storage upload',async()=>{
  await fail(()=>attach(asset),'IMAGE_UPLOAD_MISSING');assert.equal((await db.query('select count(*)::int n from asset_version')).rows[0].n,0);
 });
 await t.test('unregistered bytes are unreadable even to the uploader',async()=>{
  await upload(asset);assert.deepEqual(await as(uuid(1),'select * from storage.objects'),[]);
 });
 await t.test('registration atomically adds immutable version and increments parent revision',async()=>{
  assert.equal(await attach(asset,{key:request}),2);
  const parent=(await db.query('select image_asset_id,row_version from client_company where tenant_id=$1 and id=$2',[a,c])).rows[0];assert.equal(parent.image_asset_id,asset);assert.equal(Number(parent.row_version),2);
  const image=(await as(uuid(1),'select * from asset_version'))[0];assert.equal(image.parent_id,c);assert.equal(image.client_company_id,c);assert.equal(image.created_by,uuid(1));
 });
 await t.test('same image request replay returns original result without second asset or revision',async()=>{
  assert.equal(await attach(asset,{key:request}),2);assert.equal((await db.query('select count(*)::int n from asset_version')).rows[0].n,1);
 });
 await t.test('request key reuse with another hash or parent is rejected',async()=>{
  await fail(()=>attach(asset,{key:request,sha:'b'.repeat(64)}),'REQUEST_KEY_REUSED');await fail(()=>attach(asset,{key:request,id:c2}),'REQUEST_KEY_REUSED');
 });
 await t.test('registered images are readable by current owners only',async()=>{
  assert.equal((await as(uuid(1),'select * from storage.objects')).length,1);assert.equal((await as(uuid(4),'select * from storage.objects')).length,1);
  for(const n of [2,3,5,6]){assert.deepEqual(await as(uuid(n),'select * from storage.objects'),[]);assert.deepEqual(await as(uuid(n),'select * from asset_version'),[]);}
 });
 await t.test('parent revisions reject old writes and leave pointers untouched',async()=>{
  await fail(()=>attach(null),'STALE_RECORD');assert.equal((await db.query('select image_asset_id from client_company where tenant_id=$1 and id=$2',[a,c])).rows[0].image_asset_id,asset);
 });
 await t.test('an existing asset cannot be rebound to another client or building',async()=>{
  await fail(()=>attach(asset,{id:c2}),'IMAGE_UPLOAD_MISSING');await fail(()=>attach(asset,{kind:'site',id:site}),'IMAGE_UPLOAD_MISSING');
 });
 await t.test('wrong MIME and mismatched size metadata cannot register',async()=>{
  await upload(uuid(301),{mime:'image/png'});await fail(()=>attach(uuid(301),{version:2}),'IMAGE_UPLOAD_MISSING');
  await upload(uuid(302),{size:200});await fail(()=>attach(uuid(302),{version:2}),'IMAGE_UPLOAD_MISSING');
 });
 await t.test('invalid dimensions, hash, or removal metadata cannot register',async()=>{
  for(const options of [{width:1601},{height:0},{sha:'bad'},{size:3145729}])await fail(()=>attach(uuid(303),{version:2,...options}),'INVALID_IMAGE');
  await fail(()=>attach(null,{version:2,sha:hash}),'INVALID_INPUT');
 });
 await t.test('removing a pointer keeps the version and object for history',async()=>{
  assert.equal(await attach(null,{version:2}),3);assert.equal((await as(uuid(1),'select * from asset_version')).length,1);assert.equal((await as(uuid(1),'select * from storage.objects')).length,1);
  assert.equal((await db.query('select image_asset_id from client_company where tenant_id=$1 and id=$2',[a,c])).rows[0].image_asset_id,null);
 });
 await t.test('authenticated users cannot edit or delete version rows',async()=>{
  for(const sql of ['delete from asset_version','update asset_version set width=1','insert into asset_version(tenant_id,id)values($1,$2)'])await fail(()=>as(uuid(1),sql,sql.includes('$1')?[a,uuid(350)]:[]),undefined,'42501');
 });
 await t.test('broad unrelated permissive Storage policies cannot bypass image restrictions',async()=>{
  await db.exec('create policy unrelated_broad on storage.objects for all to authenticated,anon using(true)with check(true)');
  assert.deepEqual(await as(uuid(2),'select * from storage.objects'),[]);assert.deepEqual(await as(null,'select * from storage.objects',[],'anon'),[]);
  await fail(()=>upload(uuid(351),{actor:uuid(2)}),undefined,'42501');
  assert.deepEqual(await as(uuid(1),'update storage.objects set metadata=metadata returning id'),[]);
  assert.deepEqual(await as(uuid(1),'delete from storage.objects returning id'),[]);
 });
 await t.test('signed URL creation, listing and missing operation cannot read even for an owner',async()=>{
  for(const op of ['object.sign','object.sign_many','object.list','']) assert.deepEqual(await as(uuid(1),'select * from storage.objects',[],'authenticated',op),[]);
  assert.equal((await as(uuid(1),'select * from storage.objects',[],'authenticated','object.get_authenticated_info')).length,1);
 });
 await t.test('signed uploads and missing upload operations are denied',async()=>{
  for(const operation of ['object.sign_upload_url','object.upload_signed','']) {
    await fail(()=>as(uuid(1),'insert into storage.objects(bucket_id,name,owner_id,metadata)values($1,$2,$3,$4::jsonb)', ['abysta-directory-images',path(a,'client',c,uuid(390)),uuid(1),JSON.stringify({mimetype:'image/webp',size:100})],'authenticated',operation),undefined,'42501');
  }
 });
 await t.test('company logo uses the same immutable version workflow',async()=>{
  await upload(uuid(304),{kind:'company',id:a});assert.equal(await attach(uuid(304),{kind:'company',id:a}),2);
  assert.equal((await db.query('select logo_asset_id from operator_tenant where id=$1',[a])).rows[0].logo_asset_id,uuid(304));
 });
 await t.test('building image can be saved independently from client logo',async()=>{
  await upload(uuid(305),{kind:'site',id:site});assert.equal(await attach(uuid(305),{kind:'site',id:site}),2);
 });
 await t.test('archived client prevents client image mutation and all child image uploads',async()=>{
  await db.query("update client_company set status='archived' where tenant_id=$1 and id=$2",[a,c]);
  await fail(()=>upload(uuid(306)),undefined,'42501');await fail(()=>upload(uuid(306),{kind:'site',id:site}),undefined,'42501');
  await fail(()=>attach(null,{version:4}),'PARENT_ARCHIVED');await fail(()=>attach(null,{kind:'site',id:site,version:2}),'PARENT_ARCHIVED');
  await db.query("update client_company set status='active' where tenant_id=$1 and id=$2",[a,c]);
 });
 await t.test('archived building blocks new image uploads and pointer changes',async()=>{
  await db.query("update site set status='archived' where tenant_id=$1 and id=$2",[a,site]);
  await fail(()=>upload(uuid(307),{kind:'site',id:site}),undefined,'42501');await fail(()=>attach(null,{kind:'site',id:site,version:3}),'PARENT_ARCHIVED');
  await db.query("update site set status='active' where tenant_id=$1 and id=$2",[a,site]);
 });
 await t.test('revoked owner immediately loses image reads, uploads and old receipt replay',async()=>{
  await db.query("update membership set status='revoked' where tenant_id=$1 and auth_user_id=$2",[a,uuid(1)]);
  assert.deepEqual(await as(uuid(1),'select * from asset_version'),[]);assert.deepEqual(await as(uuid(1),'select * from storage.objects'),[]);
  await fail(()=>attach(asset,{key:request}),'FORBIDDEN');await fail(()=>upload(uuid(308)),undefined,'42501');
  await db.query("update membership set status='active' where tenant_id=$1 and auth_user_id=$2",[a,uuid(1)]);
 });
 await t.test('company archival immediately prevents image reads and writes',async()=>{
  await db.query("update operator_tenant set status='archived' where id=$1",[a]);assert.deepEqual(await as(uuid(1),'select * from storage.objects'),[]);await fail(()=>attach(asset,{key:request}),'FORBIDDEN');
  await db.query("update operator_tenant set status='active' where id=$1",[a]);
 });
 await t.test('tenant-aware image parent foreign keys prevent dangling client/site assets',async()=>{
  await fail(()=>db.query('delete from site where tenant_id=$1 and id=$2',[a,site]),undefined,'23001');
  await fail(()=>db.query("insert into asset_version(tenant_id,id,parent_kind,parent_id,object_name,byte_size,width,height,sha256,created_by)values($1,$2,'client',$3,'fake',100,100,100,$4,$5)",[a,uuid(399),uuid(102),hash,uuid(1)]),undefined,'23503');
 });
 await t.test('image receipts are private and failed mutations leave no new version',async()=>{
  await fail(()=>as(uuid(1),'select * from abysta_private.directory_image_request'),undefined,'42501');
  assert.equal((await db.query('select count(*)::int n from asset_version')).rows[0].n,3);
 });
});
