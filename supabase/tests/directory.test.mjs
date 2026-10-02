/** Real migrations against disposable PGlite PostgreSQL + a minimal Auth shim.
 * No hosted Supabase, Storage or two-connection concurrency is implied.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const req = (n) => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clientData = (overrides={}) => ({legal_name:'Acme Properties',reference:'ACME',address:'London\nUnited Kingdom',notes:'Client notes',status:'active',contact_name:'Alex Smith',contact_email:'alex@example.test',contact_phone:'+44 20 0000 0000',contact_role:'Facilities Manager',...overrides});
const siteData = (clientId, overrides={}) => ({client_company_id:clientId,name:'City office',reference:'',address:'1 City Road\nLondon',timezone:'Europe/London',building_type:'office',notes:'Reception access',status:'active',contact_name:'Sam Jones',contact_email:'sam@example.test',contact_phone:'+44 20 1111 1111',contact_role:'Site Manager',...overrides});
const portfolioData = (clientId, ids=[], overrides={}) => ({client_company_id:clientId,name:'UK offices',reference:'',notes:'Independent sites',status:'active',site_ids:ids,...overrides});

test('Directory SQL: owner boundary, parent integrity, histories and transactions', async(t)=>{
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `);
  for(const file of ['20261002000100_company_setup.sql','20261002002000_directory.sql']) await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  for(let n=1;n<=9;n++) await db.query('insert into auth.users values($1,now())',[uuid(n)]);
  async function asActor(actor, fn, role='authenticated') {
    await db.exec('begin');
    try { await db.exec(`set local role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor??'']); const result=await fn(); await db.exec('commit'); return result; }
    catch(e){await db.exec('rollback');throw e;}
  }
  const rowsAs=(actor,sql,params=[],role='authenticated')=>asActor(actor,async()=>(await db.query(sql,params)).rows,role);
  const fail=(fn,message,code)=>assert.rejects(fn,e=>{if(message)assert.equal(e.message,message);if(code)assert.equal(e.code,code);return true;});
  const tenantA=(await rowsAs(uuid(1),'select create_operator_tenant($1,$2,$3,$4) id',['First Operator','GBP','Europe/London',req(1)]))[0].id;
  const tenantB=(await rowsAs(uuid(2),'select create_operator_tenant($1,$2,$3,$4) id',['Other Operator','CHF','Europe/Zurich',req(1)]))[0].id;
  for(const [actor,type,status,roles] of [[3,'internal','active',['admin']],[4,'internal','active',['sales']],[5,'client','active',['owner']],[6,'internal','suspended',['owner']],[7,'internal','revoked',['owner']],[8,'internal','active',['owner','sales']]])
    await db.query('insert into membership(tenant_id,auth_user_id,member_type,status,role_codes)values($1,$2,$3,$4,$5)',[tenantA,uuid(actor),type,status,roles]);
  let requestNumber=100;
  const save=(kind,id,data,version=0,{actor=uuid(1),tenant=tenantA,key=req(++requestNumber)}={})=>asActor(actor,async()=>(await db.query('select public.save_directory_record($1,$2,$3,$4,$5,$6::jsonb) id',[kind,tenant,id,version,key,JSON.stringify(data)])).rows[0].id);
  const get=async(table,id)=> (await db.query(`select * from public.${table} where tenant_id=$1 and id=$2`,[tenantA,id])).rows[0];
  const count=async(table,where='',params=[])=> (await db.query(`select count(*)::int n from ${table} ${where}`,params)).rows[0].n;
  const c1=uuid(101),c2=uuid(102),cOther=uuid(103),p1=uuid(201),p2=uuid(202),sites=Array.from({length:15},(_,n)=>uuid(301+n));
  const initialKey=req(40);

  await t.test('anonymous execution and a role without a current actor are rejected',async()=>{
    await fail(()=>rowsAs(null,'select public.save_directory_record($1,$2,$3,$4,$5,$6)', ['client',tenantA,c1,0,initialKey,clientData()],'anon'),undefined,'42501');
    await fail(()=>save('client',c1,clientData(),0,{actor:null}),'AUTH_REQUIRED','28000');
  });
  await t.test('only a current internal owner can save; admin and sales do not inherit directory access',async()=>{
    for(const n of [2,3,4,5,6,7,9])await fail(()=>save('client',c1,clientData(),0,{actor:uuid(n)}),'FORBIDDEN','42501');
    assert.equal(await count('client_company'),0);
  });
  await t.test('client and primary contact are committed together with actor-derived metadata',async()=>{
    assert.equal(await save('client',c1,clientData(),0,{key:initialKey}),c1);
    const client=await get('client_company',c1);assert.equal(client.legal_name,'Acme Properties');assert.equal(client.created_by,uuid(1));assert.equal(Number(client.row_version),1);
    const contacts=(await rowsAs(uuid(1),'select * from client_contact where client_company_id=$1',[c1]));assert.equal(contacts.length,1);assert.equal(contacts[0].name,'Alex Smith');assert.equal(contacts[0].job_title,'Facilities Manager');assert.equal(contacts[0].site_id,null);
  });
  await t.test('same normalized save retry does not duplicate records, contacts or versions',async()=>{
    assert.equal(await save('client',c1,clientData({legal_name:'\u00a0 Acme Properties\ufeff '}),0,{key:initialKey}),c1);
    assert.equal(await count('client_company'),1);assert.equal(await count('client_contact'),1);assert.equal(Number((await get('client_company',c1)).row_version),1);
  });
  await t.test('reusing a request key for a changed payload, entity or version fails',async()=>{
    await fail(()=>save('client',c1,clientData({notes:'Changed'}),0,{key:initialKey}),'REQUEST_KEY_REUSED');
    await fail(()=>save('client',c2,clientData(),0,{key:initialKey}),'REQUEST_KEY_REUSED');
    await fail(()=>save('client',c1,clientData(),1,{key:initialKey}),'REQUEST_KEY_REUSED');
  });
  await t.test('request keys are actor-scoped and creator cannot be spoofed in JSON',async()=>{
    await save('client',cOther,clientData(),0,{actor:uuid(2),tenant:tenantB,key:initialKey});
    await fail(()=>save('client',c2,clientData({created_by:uuid(2)})),'INVALID_INPUT');
  });
  await t.test('unauthorized users cannot read any directory table even with known IDs',async()=>{
    for(const n of [2,3,4,5,6,7,9])for(const table of ['client_company','site','portfolio','client_contact','portfolio_site'])
      assert.deepEqual(await rowsAs(uuid(n),`select * from ${table} where tenant_id=$1`,[tenantA]),[]);
    assert.equal((await rowsAs(uuid(8),'select * from client_company where tenant_id=$1',[tenantA])).length,1);
  });
  await t.test('table grants block anonymous reads and all direct owner writes',async()=>{
    for(const table of ['client_company','site','portfolio','client_contact','portfolio_site']){
      await fail(()=>rowsAs(null,`select * from ${table}`,[],'anon'),undefined,'42501');
      await fail(()=>rowsAs(uuid(1),`delete from ${table} where tenant_id=$1`,[tenantA]),undefined,'42501');
      await fail(()=>rowsAs(uuid(1),`update ${table} set row_version=99 where tenant_id=$1`,[tenantA]),undefined,'42501');
      await fail(()=>rowsAs(uuid(1),`insert into ${table}(tenant_id,id) values($1,$2)`,[tenantA,uuid(999)]),undefined,'42501');
    }
  });
  await t.test('receipts remain private even for owners',async()=>{
    await fail(()=>rowsAs(uuid(1),'select * from abysta_private.directory_request'),undefined,'42501');
    await fail(()=>rowsAs(uuid(1),'delete from abysta_private.directory_request'),undefined,'42501');
  });
  await t.test('unknown, missing, non-string and null JSON fields are rejected',async()=>{
    const missing=clientData();delete missing.notes;
    for(const data of [null,[],missing,clientData({notes:null}),clientData({address:123}),clientData({contact_name:['Alex']}),clientData({owner:true})])await fail(()=>save('client',c2,data),'INVALID_INPUT');
  });
  await t.test('text bounds, control characters, required fields and contact dependencies are enforced',async()=>{
    for(const data of [clientData({legal_name:'A'}),clientData({legal_name:'a'.repeat(161)}),clientData({legal_name:'A\nB'}),clientData({reference:'r'.repeat(41)}),clientData({notes:'a\u0001b'}),clientData({status:'deleted'}),clientData({contact_name:''}),clientData({contact_email:'invalid@'}),clientData({contact_role:'x'.repeat(101)})])await fail(()=>save('client',c2,data),'INVALID_INPUT');
  });
  await t.test('Unicode trimming preserves letters and multiline notes while Unicode length is code-point based',async()=>{
    await save('client',c2,clientData({legal_name:'\u000b vivid\ufeff',reference:'SECOND',notes:'Line one\n\tLine two',contact_name:'',contact_email:'',contact_phone:'',contact_role:''}));
    assert.equal((await get('client_company',c2)).legal_name,'vivid');assert.equal((await get('client_company',c2)).notes,'Line one\n\tLine two');
    await save('client',uuid(104),clientData({legal_name:'🏢'.repeat(160),reference:''}));
    await fail(()=>save('client',uuid(105),clientData({legal_name:'🏢'.repeat(161),reference:''})),'INVALID_INPUT');
  });
  await t.test('client reference uniqueness ignores case within a tenant, with unlimited empty references',async()=>{
    await fail(()=>save('client',uuid(105),clientData({reference:'acme'})),'DUPLICATE_REFERENCE','23505');
    await save('client',uuid(105),clientData({reference:''}));
    assert.equal(await count('client_company','where tenant_id=$1',[tenantB]),1);
  });
  await t.test('15 independent buildings preserve 15 distinct visit contacts',async()=>{
    for(const [i,id]of sites.entries())await save('site',id,siteData(c1,{name:`Building ${i+1}`,reference:`B${i+1}`,contact_name:`Contact ${i+1}`}));
    assert.equal(await count('site','where tenant_id=$1 and client_company_id=$2',[tenantA,c1]),15);
    assert.equal(await count('client_contact','where tenant_id=$1 and client_company_id=$2 and site_id is not null',[tenantA,c1]),15);
  });
  await t.test('sites validate time zone, building type, UUID parent and required address',async()=>{
    for(const data of [siteData(c1,{timezone:'Europe/Fake'}),siteData(c1,{building_type:'unknown'}),siteData(c1,{address:'x'}),siteData('bad-id')])await fail(()=>save('site',uuid(399),data),'INVALID_INPUT');
  });
  await t.test('tenant-aware parents block cross-company inserts and unknown clients',async()=>{
    await fail(()=>save('site',uuid(399),siteData(cOther)),'RECORD_NOT_FOUND');
    await fail(()=>save('portfolio',uuid(299),portfolioData(cOther)),'RECORD_NOT_FOUND');
    await fail(()=>save('site',uuid(399),siteData(uuid(999))),'RECORD_NOT_FOUND');
  });
  await t.test('two portfolios share ten buildings without cloning the 15 building records',async()=>{
    await save('portfolio',p1,portfolioData(c1,sites,{reference:'ALL'}));
    await save('portfolio',p2,portfolioData(c1,sites.slice(0,10),{name:'Tender shortlist',reference:'TENDER'}));
    assert.equal(await count('site','where tenant_id=$1 and client_company_id=$2',[tenantA,c1]),15);
    assert.equal(await count('portfolio_site','where portfolio_id=$1 and left_at is null',[p1]),15);
    assert.equal(await count('portfolio_site','where portfolio_id=$1 and left_at is null',[p2]),10);
  });
  await t.test('empty portfolios are allowed and there is no limit of 10 or 15 sites',async()=>{
    await save('portfolio',uuid(203),portfolioData(c1,[],{name:'Empty portfolio'}));
    const sixteenth=uuid(316);await save('site',sixteenth,siteData(c1,{name:'Building 16',reference:'B16'}));
    await save('portfolio',uuid(204),portfolioData(c1,[...sites,sixteenth],{name:'Sixteen buildings'}));
    assert.equal(await count('portfolio_site','where portfolio_id=$1 and left_at is null',[uuid(204)]),16);
  });
  await t.test('portfolio retries normalize selection order and do not duplicate membership history',async()=>{
    const key=req(900);await save('portfolio',p2,portfolioData(c1,sites.slice(0,10),{name:'Shortlist',reference:'TENDER'}),1,{key});
    await save('portfolio',p2,portfolioData(c1,sites.slice(0,10).reverse(),{name:'Shortlist',reference:'TENDER'}),1,{key});
    assert.equal(await count('portfolio_site','where portfolio_id=$1',[p2]),10);assert.equal(Number((await get('portfolio',p2)).row_version),2);
  });
  await t.test('cross-client, cross-tenant and missing site selections are rejected atomically',async()=>{
    await save('site',uuid(350),siteData(c2));
    await save('site',uuid(351),siteData(cOther),0,{actor:uuid(2),tenant:tenantB});
    for(const wrong of [uuid(350),uuid(351),uuid(999)])await fail(()=>save('portfolio',p1,portfolioData(c1,[...sites,wrong],{reference:'ALL'}),1),'INVALID_SITE_SELECTION');
    assert.equal(Number((await get('portfolio',p1)).row_version),1);assert.equal(await count('portfolio_site','where portfolio_id=$1',[p1]),15);
  });
  await t.test('selection must be a bounded array of distinct UUID strings',async()=>{
    for(const ids of [null,'oops',[null],[123],['bad'],[sites[0],sites[0]],Array(5001).fill(sites[0])])await fail(()=>save('portfolio',uuid(299),portfolioData(c1,ids)),'INVALID_SITE_SELECTION');
  });
  await t.test('removing membership preserves history; re-adding creates a fresh link',async()=>{
    const previous=(await db.query('select id from portfolio_site where portfolio_id=$1 and site_id=$2 and left_at is null',[p2,sites[0]])).rows[0].id;
    await save('portfolio',p2,portfolioData(c1,sites.slice(1,10),{name:'Shortlist',reference:'TENDER'}),2);
    assert.ok((await get('portfolio_site',previous)).left_at);
    await save('portfolio',p2,portfolioData(c1,sites.slice(0,10),{name:'Shortlist',reference:'TENDER'}),3);
    const history=(await db.query('select id,left_at from portfolio_site where portfolio_id=$1 and site_id=$2',[p2,sites[0]])).rows;assert.equal(history.length,2);assert.equal(history.filter(r=>r.left_at===null).length,1);assert.notEqual(history.find(r=>r.left_at===null).id,previous);
  });
  await t.test('editing one building preserves all other buildings and its shared portfolio references',async()=>{
    const before=await get('site',sites[1]);await save('site',sites[0],siteData(c1,{name:'Updated building 1',reference:'B1',contact_name:'Updated contact'}),1);
    assert.deepEqual(await get('site',sites[1]),before);assert.equal(await count('portfolio_site','where site_id=$1 and left_at is null',[sites[0]]),3);
    const contact=(await db.query('select name from client_contact where site_id=$1',[sites[0]])).rows[0];assert.equal(contact.name,'Updated contact');
  });
  await t.test('optimistic versions reject stale updates and stale archive attempts without losing contacts',async()=>{
    await fail(()=>save('site',sites[0],siteData(c1,{name:'Overwrite',reference:'B1'}),1),'STALE_RECORD','40001');
    await fail(()=>save('site',sites[0],siteData(c1,{status:'archived',reference:'B1'}),1),'STALE_RECORD');
    assert.equal((await get('site',sites[0])).name,'Updated building 1');
    assert.equal((await db.query('select name from client_contact where site_id=$1',[sites[0]])).rows[0].name,'Updated contact');
  });
  await t.test('record creation collisions and updates to missing records are explicit',async()=>{
    await fail(()=>save('site',sites[0],siteData(c1,{reference:'new'})),'STALE_RECORD');
    await fail(()=>save('site',uuid(399),siteData(c1),1),'RECORD_NOT_FOUND');
  });
  await t.test('a saved building or portfolio cannot be moved to another client',async()=>{
    await fail(()=>save('site',sites[0],siteData(c2),2),'IMMUTABLE_CLIENT');
    await fail(()=>save('portfolio',p1,portfolioData(c2,[]),1),'IMMUTABLE_CLIENT');
  });
  await t.test('site and portfolio references are case-insensitive per client and separate namespaces',async()=>{
    await fail(()=>save('site',uuid(399),siteData(c1,{reference:'b1'})),'DUPLICATE_REFERENCE');
    await save('site',uuid(352),siteData(c2,{reference:'B1'}));
    await fail(()=>save('portfolio',uuid(299),portfolioData(c1,[],{reference:'all'})),'DUPLICATE_REFERENCE');
    await save('portfolio',uuid(205),portfolioData(c2,[],{reference:'ALL'}));
    await save('portfolio',uuid(206),portfolioData(c1,[],{reference:'B1'}));
  });
  await t.test('archive keeps building and contact history and permits restoration',async()=>{
    await save('site',sites[0],siteData(c1,{name:'Updated building 1',reference:'B1',contact_name:'Updated contact',status:'archived'}),2);
    assert.equal((await get('site',sites[0])).status,'archived');assert.equal(await count('portfolio_site','where site_id=$1 and left_at is null',[sites[0]]),3);
    assert.equal((await db.query('select name from client_contact where site_id=$1',[sites[0]])).rows[0].name,'Updated contact');
  });
  await t.test('already-linked archived sites can remain selected, but cannot be newly linked or re-added',async()=>{
    await save('portfolio',p1,portfolioData(c1,sites,{reference:'ALL',notes:'Archived site retained'}),1);
    await fail(()=>save('portfolio',uuid(299),portfolioData(c1,[sites[0]])),'INVALID_SITE_SELECTION');
    await save('portfolio',p2,portfolioData(c1,sites.slice(1,10),{reference:'TENDER'}),4);
    await fail(()=>save('portfolio',p2,portfolioData(c1,sites.slice(0,10),{reference:'TENDER'}),5),'INVALID_SITE_SELECTION');
    await save('site',sites[0],siteData(c1,{name:'Updated building 1',reference:'B1',contact_name:'Updated contact'}),3);
    await save('portfolio',p2,portfolioData(c1,sites.slice(0,10),{reference:'TENDER'}),5);
  });
  await t.test('archived clients keep children visible but block every new child mutation until restored',async()=>{
    await save('client',c1,clientData({status:'archived'}),1);
    assert.equal((await rowsAs(uuid(1),'select * from site where client_company_id=$1',[c1])).length,16);
    await fail(()=>save('site',uuid(399),siteData(c1)),'PARENT_ARCHIVED');
    await fail(()=>save('site',sites[0],siteData(c1,{reference:'B1'}),4),'PARENT_ARCHIVED');
    await fail(()=>save('portfolio',p1,portfolioData(c1,sites,{reference:'ALL'}),2),'PARENT_ARCHIVED');
    await save('client',c1,clientData(),2);
    assert.equal(Number((await get('client_company',c1)).row_version),3);
  });
  await t.test('archived portfolio can be restored with versions and without deleting links',async()=>{
    await save('portfolio',p1,portfolioData(c1,sites,{reference:'ALL',status:'archived'}),2);
    assert.equal(await count('portfolio_site','where portfolio_id=$1 and left_at is null',[p1]),15);
    await save('portfolio',p1,portfolioData(c1,sites,{reference:'ALL'}),3);assert.equal((await get('portfolio',p1)).status,'active');
  });
  await t.test('clearing a contact updates its record without deleting it or affecting another site contact',async()=>{
    const before=(await db.query('select * from client_contact where site_id=$1',[sites[1]])).rows[0];
    await save('site',sites[1],siteData(c1,{reference:'B2',contact_name:'',contact_email:'',contact_phone:'',contact_role:''}),1);
    const after=(await db.query('select * from client_contact where site_id=$1',[sites[1]])).rows[0];assert.equal(after.id,before.id);assert.equal(after.name,'');assert.equal(after.email,'');assert.equal(Number(after.row_version),2);
    assert.equal((await db.query('select name from client_contact where site_id=$1',[sites[0]])).rows[0].name,'Updated contact');
  });
  await t.test('composite foreign keys enforce same-tenant and same-client integrity even for privileged inserts',async()=>{
    await fail(()=>db.query('insert into portfolio_site(tenant_id,client_company_id,portfolio_id,site_id,created_by)values($1,$2,$3,$4,$5)',[tenantA,c1,p1,uuid(350),uuid(1)]),undefined,'23503');
    await fail(()=>db.query('update client_contact set client_company_id=$1 where tenant_id=$2 and site_id=$3',[c2,tenantA,sites[2]]),undefined,'23503');
    await fail(()=>db.query('insert into site(tenant_id,client_company_id,name,address,building_type,created_by)values($1,$2,$3,$4,$5,$6)',[tenantB,c1,'Wrong tenant','1 City Road','office',uuid(2)]),undefined,'23503');
  });
  await t.test('transactional contact failure rolls back parent, contact and receipt together',async()=>{
    await db.exec(`create function abysta_private.fail_contact_test()returns trigger language plpgsql as $$begin if new.name='Test rejection' then raise exception 'TEST_CONTACT_FAILURE';end if;return new;end;$$;create trigger fail_contact_test before insert on client_contact for each row execute function abysta_private.fail_contact_test();`);
    const key=req(999);await fail(()=>save('client',uuid(109),clientData({reference:'ROLLBACK',contact_name:'Test rejection'}),0,{key}),'TEST_CONTACT_FAILURE');
    assert.equal(await count('client_company','where id=$1',[uuid(109)]),0);assert.equal(await count('abysta_private.directory_request','where request_id=$1',[key]),0);
    await db.exec('drop trigger fail_contact_test on client_contact;drop function abysta_private.fail_contact_test();');
    await save('client',uuid(109),clientData({reference:'ROLLBACK',contact_name:'Test rejection'}),0,{key});
  });
  await t.test('membership revocation blocks reads, writes and successful old receipts immediately',async()=>{
    await db.query("update membership set status='revoked' where tenant_id=$1 and auth_user_id=$2",[tenantA,uuid(1)]);
    assert.deepEqual(await rowsAs(uuid(1),'select * from client_company where tenant_id=$1',[tenantA]),[]);
    await fail(()=>save('client',c1,clientData(),0,{key:initialKey}),'FORBIDDEN');
    await db.query("update membership set status='active' where tenant_id=$1 and auth_user_id=$2",[tenantA,uuid(1)]);
  });
  await t.test('removing owner role blocks directory despite a still-active admin membership',async()=>{
    await db.query("update membership set role_codes=array['admin'] where tenant_id=$1 and auth_user_id=$2",[tenantA,uuid(1)]);
    assert.deepEqual(await rowsAs(uuid(1),'select * from site where tenant_id=$1',[tenantA]),[]);await fail(()=>save('client',c1,clientData(),0,{key:initialKey}),'FORBIDDEN');
    await db.query("update membership set role_codes=array['owner'] where tenant_id=$1 and auth_user_id=$2",[tenantA,uuid(1)]);
  });
  await t.test('operator-company archive blocks even owners and replay; helper leaks no other tenant authority',async()=>{
    await db.query("update operator_tenant set status='archived' where id=$1",[tenantA]);
    assert.deepEqual(await rowsAs(uuid(1),'select * from client_company where tenant_id=$1',[tenantA]),[]);await fail(()=>save('client',c1,clientData(),0,{key:initialKey}),'FORBIDDEN');
    await db.query("update operator_tenant set status='active' where id=$1",[tenantA]);
    assert.equal((await rowsAs(uuid(1),'select abysta_private.is_directory_owner($1) allowed',[tenantB]))[0].allowed,false);
    assert.equal((await rowsAs(uuid(1),'select abysta_private.is_directory_owner($1) allowed',[tenantA]))[0].allowed,true);
  });
  await t.test('old successful retry returns the record without reverting later edits',async()=>{
    await save('client',c1,clientData({legal_name:'Acme renamed'}),3);
    await save('client',c1,clientData(),0,{key:initialKey});assert.equal((await get('client_company',c1)).legal_name,'Acme renamed');assert.equal(Number((await get('client_company',c1)).row_version),4);
  });
  const bundles=(actor,kind,offset=0,limit=500)=>rowsAs(actor,'select get_directory_records($1,$2,$3,$4) data',[tenantA,kind,offset,limit]).then(rows=>rows[0].data);
  await t.test('atomic read RPC returns the parent version and its primary contact together',async()=>{
    const result=await bundles(uuid(1),'client');
    const client=result.records.find(row=>row.id===c1);
    assert.equal(client.legal_name,'Acme renamed'); assert.equal(client.row_version,4);
    assert.equal(client.contact_name,'Alex Smith');assert.equal(client.contact_email,'alex@example.test');
    assert.equal(result.total,await count('client_company','where tenant_id=$1',[tenantA]));
    const siteResult=await bundles(uuid(1),'site');
    const building=siteResult.records.find(row=>row.id===sites[2]);
    assert.equal(building.contact_name,'Contact 3');assert.equal(building.contact_role,'Site Manager');
    assert.ok(building.row_version>=1);
  });
  await t.test('atomic read RPC bundles only current portfolio links with its version',async()=>{
    const result=await bundles(uuid(1),'portfolio');
    const record=result.records.find(row=>row.id===p1);
    const expected=(await db.query('select site_id from portfolio_site where tenant_id=$1 and portfolio_id=$2 and left_at is null order by site_id',[tenantA,p1])).rows.map(row=>row.site_id);
    assert.deepEqual(record.links.map(row=>row.site_id).sort(),expected);
    assert.equal(record.row_version,Number((await get('portfolio',p1)).row_version));
  });
  await t.test('atomic read RPC validates pagination and denies non-owners, other tenants and anonymous callers',async()=>{
    for(const n of [2,3,4,5,6,7,9])await fail(()=>bundles(uuid(n),'client'),'FORBIDDEN');
    await fail(()=>bundles(null,'client'),'AUTH_REQUIRED');
    await fail(()=>rowsAs(null,'select get_directory_records($1,$2)',[tenantA,'client'],'anon'),undefined,'42501');
    for(const args of [['membership',0,10],['client',-1,10],['client',0,0],['client',0,501]])await fail(()=>bundles(uuid(1),...args),'INVALID_INPUT');
    const first=await bundles(uuid(1),'site',0,1),second=await bundles(uuid(1),'site',1,1);
    assert.equal(first.records.length,1);assert.equal(second.records.length,1);assert.notEqual(first.records[0].id,second.records[0].id);
    assert.equal(first.total,second.total);
    assert.deepEqual((await bundles(uuid(1),'site',1000000,5)).records,[]);
  });
  await t.test('atomic portfolio JSON retains more than 1000 nested links without API row truncation',async()=>{
    const bigPortfolio=uuid(8000);
    await db.query("insert into portfolio(tenant_id,id,client_company_id,name,created_by)values($1,$2,$3,'Large Portfolio',$4)",[tenantA,bigPortfolio,c1,uuid(1)]);
    await db.query("insert into site(tenant_id,id,client_company_id,name,address,building_type,created_by) select $1,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$2,'Building '||n,'1 Example Road','office',$3 from generate_series(1,1001)n",[tenantA,c1,uuid(1)]);
    await db.query("insert into portfolio_site(tenant_id,client_company_id,portfolio_id,site_id,created_by) select $1,$2,$3,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$4 from generate_series(1,1001)n",[tenantA,c1,bigPortfolio,uuid(1)]);
    const result=await bundles(uuid(1),'portfolio');
    assert.equal(result.records.find(row=>row.id===bigPortfolio).links.length,1001);
  });

});
