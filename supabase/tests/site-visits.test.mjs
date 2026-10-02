/** Executes the real company, directory and visit migrations in disposable PGlite.
 * Auth is a minimal shim. Hosted PostgREST and multi-connection races are separate gates.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const template=JSON.parse(await readFile(new URL('../../web/lib/site-visits/questionnaire.json',import.meta.url),'utf8'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const req=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const emptyAnswers=()=>Object.fromEntries(template.questions.map(q=>[q.id,{state:'unanswered',value:null,source:'',note:''}]));
const answer=(value,source='observed',note='')=>({state:'answered',value,source,note});
const visitData=(overrides={})=>({title:'Initial site visit',reference:'',visit_date:'',lead_name:'',contact_name:'',contact_role:'',contact_email:'',contact_phone:'',notes:'',status:'draft',template_key:template.key,answers:emptyAnswers(),...overrides});
const withAnswer=(key,value,extra={})=>visitData({answers:{...emptyAnswers(),[key]:value},...extra});
const clientData=(overrides={})=>({legal_name:'Acme Properties',reference:'',address:'1 Client Road',notes:'',status:'active',contact_name:'',contact_role:'',contact_email:'',contact_phone:'',...overrides});
const siteData=(client,overrides={})=>({client_company_id:client,name:'London office',reference:'',address:'10 Office Road',timezone:'Europe/London',building_type:'office',notes:'',status:'active',contact_name:'',contact_role:'',contact_email:'',contact_phone:'',...overrides});
const portfolioData=(client,ids)=>({client_company_id:client,name:'Portfolio offices',reference:'',notes:'',status:'active',site_ids:ids});

test('Site Visits 3A SQL: owner isolation, typed drafts, immutable revisions and snapshots',async(t)=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid()to anon,authenticated;`);
 for(const file of ['20261002000100_company_setup.sql','20261002002000_directory.sql','20261002003000_site_visits.sql','20261002004000_site_visit_layout.sql'])await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 for(let n=1;n<=9;n++)await db.query('insert into auth.users values($1,now())',[uuid(n)]);
 async function asActor(actor,fn,role='authenticated'){
  await db.exec('begin');try{await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor??'']);const result=await fn();await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}
 }
 const rowsAs=(actor,sql,params=[],role='authenticated')=>asActor(actor,async()=>(await db.query(sql,params)).rows,role);
 const fail=(fn,message,code)=>assert.rejects(fn,e=>{if(message)assert.equal(e.message,message);if(code)assert.equal(e.code,code);return true;});
 const tenantA=(await rowsAs(uuid(1),'select create_operator_tenant($1,$2,$3,$4)id',['First Operator','GBP','Europe/London',req(1)]))[0].id;
 const tenantB=(await rowsAs(uuid(2),'select create_operator_tenant($1,$2,$3,$4)id',['Other Operator','CHF','Europe/Zurich',req(1)]))[0].id;
 for(const [actor,type,status,roles]of [[3,'internal','active',['admin']],[4,'internal','active',['sales']],[5,'client','active',['owner']],[6,'internal','suspended',['owner']],[7,'internal','revoked',['owner']],[8,'internal','active',['owner']]])await db.query('insert into membership(tenant_id,auth_user_id,member_type,status,role_codes)values($1,$2,$3,$4,$5)',[tenantA,uuid(actor),type,status,roles]);
 let sequence=100;
 const c1=uuid(101),c2=uuid(102),cOther=uuid(103),sites=Array.from({length:15},(_,i)=>uuid(201+i)),siteOther=uuid(299),wrongClientSite=uuid(298),visits=Array.from({length:10},(_,i)=>uuid(301+i));
 const dir=(kind,id,data,version=0,{actor=uuid(1),tenant=tenantA}={})=>rowsAs(actor,'select save_directory_record($1,$2,$3,$4,$5,$6)',[kind,tenant,id,version,req(++sequence),data]);
 const save=(id,data=visitData(),version=0,{actor=uuid(1),tenant=tenantA,client=c1,site=sites[0],key=req(++sequence)}={})=>rowsAs(actor,'select save_site_visit($1,$2,$3,$4,$5,$6,$7)id',[tenant,client,site,id,version,key,data]).then(r=>r[0].id);
 const get=(id=visits[0],revision=null,{actor=uuid(1),tenant=tenantA,client=c1,site=sites[0]}={})=>rowsAs(actor,'select get_site_visit($1,$2,$3,$4,$5)data',[tenant,client,site,id,revision]).then(r=>r[0].data);
 const list=({actor=uuid(1),tenant=tenantA,client=c1,site=sites[0],offset=0,limit=50}={})=>rowsAs(actor,'select list_site_visits($1,$2,$3,$4,$5)data',[tenant,client,site,offset,limit]).then(r=>r[0].data);
 const history=(id=visits[0],{actor=uuid(1),tenant=tenantA,client=c1,site=sites[0],offset=0,limit=50}={})=>rowsAs(actor,'select list_visit_revisions($1,$2,$3,$4,$5,$6)data',[tenant,client,site,id,offset,limit]).then(r=>r[0].data);
 const count=async(table,where='',params=[])=>(await db.query(`select count(*)::int n from ${table} ${where}`,params)).rows[0].n;
 await dir('client',c1,clientData());await dir('client',c2,clientData({legal_name:'Second client'}));await dir('client',cOther,clientData(),0,{actor:uuid(2),tenant:tenantB});
 for(let i=0;i<sites.length;i++)await dir('site',sites[i],siteData(c1,{name:`Building ${i+1}`,reference:`B${i+1}`}));
 await dir('site',siteOther,siteData(cOther),0,{actor:uuid(2),tenant:tenantB});await dir('site',wrongClientSite,siteData(c2));
 await dir('portfolio',uuid(401),portfolioData(c1,sites));await dir('portfolio',uuid(402),portfolioData(c1,sites.slice(0,10)));
 const firstKey=req(20);

 await t.test('anonymous and missing-actor saves cannot execute',async()=>{
  await fail(()=>rowsAs(null,'select save_site_visit($1,$2,$3,$4,$5,$6,$7)',[tenantA,c1,sites[0],visits[0],0,firstKey,visitData()],'anon'),undefined,'42501');
  await fail(()=>save(visits[0],visitData(),0,{actor:null}),'AUTH_REQUIRED','28000');
 });
 await t.test('admin, sales, client-owner, suspended, revoked and unrelated users cannot save',async()=>{
  for(const n of [2,3,4,5,6,7,9])await fail(()=>save(visits[0],visitData(),0,{actor:uuid(n)}),'FORBIDDEN','42501');
  assert.equal(await count('site_visit'),0);
 });
 await t.test('first draft saves unanswered required fields and captures a complete immutable template',async()=>{
  assert.equal(await save(visits[0],visitData(),0,{key:firstKey}),visits[0]);const data=await get();
  assert.equal(data.visit.row_version,1);assert.equal(data.revision.revision_number,1);assert.equal(data.visit.current_revision_id,data.revision.id);
  assert.equal(data.visit.created_by,uuid(1));assert.equal(data.visit.updated_by,uuid(1));assert.equal(data.revision.created_by,uuid(1));
  assert.deepEqual(data.revision.template_snapshot,template);assert.deepEqual(data.revision.answers,emptyAnswers());assert.equal(data.revision.visit_date,null);
 });
 await t.test('client and building snapshots contain exactly the specified data at time of save',async()=>{
  const {revision}=await get();assert.deepEqual(revision.client_snapshot,{id:c1,legal_name:'Acme Properties',reference:'',address:'1 Client Road'});
  assert.deepEqual(revision.site_snapshot,{id:sites[0],name:'Building 1',reference:'B1',address:'10 Office Road',timezone:'Europe/London',building_type:'office'});
 });
 await t.test('normalized idempotent retry neither duplicates revision nor refreshes snapshots',async()=>{
  await save(visits[0],visitData({title:'\u00a0Initial site visit\ufeff '}),0,{key:firstKey});assert.equal((await history()).total,1);assert.equal((await get()).visit.row_version,1);
 });
 await t.test('reusing a receipt with changed payload, version or visit ID is rejected',async()=>{
  await fail(()=>save(visits[0],visitData({notes:'Changed'}),0,{key:firstKey}),'REQUEST_KEY_REUSED');
  await fail(()=>save(visits[0],visitData(),1,{key:firstKey}),'REQUEST_KEY_REUSED');await fail(()=>save(uuid(399),visitData(),0,{key:firstKey}),'REQUEST_KEY_REUSED');
 });
 await t.test('ten buildings in a fifteen-building portfolio get independent visits without site duplication',async()=>{
  for(let i=1;i<10;i++)await save(visits[i],visitData({title:`Survey building ${i+1}`,notes:`Notes ${i+1}`}),0,{site:sites[i]});
  assert.equal(await count('site','where tenant_id=$1 and client_company_id=$2',[tenantA,c1]),15);
  assert.equal(await count('site_visit','where tenant_id=$1',[tenantA]),10);assert.equal(await count('portfolio_site','where tenant_id=$1 and left_at is null',[tenantA]),25);
  assert.equal((await list({site:sites[10]})).total,0);assert.equal((await get(visits[9],null,{site:sites[9]})).revision.notes,'Notes 10');
 });
 await t.test('known false and numeric zero survive exactly without becoming missing answers',async()=>{
  const data=visitData({answers:{...emptyAnswers(),water_available:answer(false),service_days:answer(0,'client'),typical_occupancy:answer(0,'measured')}});
  await save(visits[0],data,1);const {revision}=await get();assert.equal(revision.answers.water_available.value,false);assert.equal(revision.answers.service_days.value,0);assert.equal(revision.answers.typical_occupancy.value,0);
 });
 await t.test('unknown and not-applicable retain null and their explanations',async()=>{
  await save(visits[0],withAnswer('typical_occupancy',{state:'unknown',value:null,source:'',note:'Awaiting client confirmation'},{status:'in_progress'}),2);
  await save(visits[0],withAnswer('current_issues',{state:'not_applicable',value:null,source:'',note:'New building; no previous service'}),3);
  assert.equal((await get(visits[0],3)).revision.answers.typical_occupancy.value,null);assert.equal((await get(visits[0],3)).revision.status,'in_progress');
  assert.equal((await get()).revision.answers.current_issues.state,'not_applicable');
 });
 await t.test('every new unique save appends a revision even for unchanged content',async()=>{
  const data=visitData();await save(visits[0],data,4);await save(visits[0],data,5);const result=await get();assert.equal(result.visit.row_version,6);assert.equal((await history()).total,6);
 });
 await t.test('stale edits, create collisions and missing-record updates fail without partial history',async()=>{
  await fail(()=>save(visits[0],visitData({notes:'Overwrite'}),1),'STALE_RECORD','PT409');await fail(()=>save(visits[0]),'STALE_RECORD','PT409');
  await fail(()=>save(uuid(399),visitData(),1),'RECORD_NOT_FOUND');assert.equal((await history()).total,6);assert.equal((await get()).revision.notes,'');
 });
 await t.test('a successful old retry never reverts later revisions',async()=>{
  await save(visits[0],visitData(),0,{key:firstKey});assert.equal((await get()).visit.row_version,6);assert.equal((await history()).total,6);
 });
 await t.test('parent edits do not rewrite historical snapshots; later save captures new parent values',async()=>{
  await dir('client',c1,clientData({legal_name:'Renamed client'}),1);await dir('site',sites[0],siteData(c1,{name:'Renamed building',address:'20 New Road',reference:'B1'}),1);
  assert.equal((await get()).revision.site_snapshot.name,'Building 1');assert.equal((await get()).revision.client_snapshot.legal_name,'Acme Properties');
  await save(visits[0],visitData(),6);assert.equal((await get()).revision.site_snapshot.name,'Renamed building');assert.equal((await get()).revision.client_snapshot.legal_name,'Renamed client');
  assert.equal((await get(visits[0],1)).revision.site_snapshot.address,'10 Office Road');
 });
 await t.test('portfolio membership changes never move, clone or change a visit',async()=>{
  const before=await get();await dir('portfolio',uuid(402),portfolioData(c1,sites.slice(1,10)),1);assert.deepEqual(await get(),before);assert.equal((await list()).total,1);
 });
 await t.test('existing visit cannot move to another valid site or client',async()=>{
  await fail(()=>save(visits[0],visitData(),7,{site:sites[1]}),'IMMUTABLE_SITE');
  await fail(()=>save(visits[0],visitData(),7,{client:c2,site:wrongClientSite}),'IMMUTABLE_SITE');
 });
 await t.test('wrong-client, foreign-tenant and nonexistent ancestry are rejected on write',async()=>{
  for(const scope of [{client:c2},{site:siteOther},{site:uuid(999)},{client:cOther,site:siteOther}])await fail(()=>save(uuid(399),visitData(),0,scope),'RECORD_NOT_FOUND');
 });
 await t.test('get, list and history independently enforce owner scope and ancestry',async()=>{
  for(const n of [2,3,4,5,6,7,9]){await fail(()=>get(visits[0],null,{actor:uuid(n)}),'FORBIDDEN');await fail(()=>list({actor:uuid(n)}),'FORBIDDEN');await fail(()=>history(visits[0],{actor:uuid(n)}),'FORBIDDEN');}
  await fail(()=>get(visits[0],null,{actor:null}),'AUTH_REQUIRED');
  for(const scope of [{client:c2},{site:uuid(999)}]){await fail(()=>get(visits[0],null,scope),'RECORD_NOT_FOUND');await fail(()=>list(scope),'RECORD_NOT_FOUND');await fail(()=>history(visits[0],scope),'RECORD_NOT_FOUND');}
  await fail(()=>get(visits[0],null,{site:sites[1]}),'RECORD_NOT_FOUND');await fail(()=>history(visits[0],{site:sites[1]}),'RECORD_NOT_FOUND');
 });
 await t.test('RLS tables reveal nothing to unauthorized users while co-owner can read',async()=>{
  for(const table of ['site_visit','visit_revision']){for(const n of [2,3,4,5,6,7,9])assert.deepEqual(await rowsAs(uuid(n),`select * from ${table} where tenant_id=$1`,[tenantA]),[]);assert.ok((await rowsAs(uuid(8),`select * from ${table} where tenant_id=$1`,[tenantA])).length>0);}
 });
 await t.test('no anonymous table reads or owner direct insert, update or delete grants',async()=>{
  for(const table of ['site_visit','visit_revision']){await fail(()=>rowsAs(null,`select * from ${table}`,[],'anon'),undefined,'42501');for(const sql of [`insert into ${table}(tenant_id,id)values($1,$2)`,`update ${table} set id=$2 where tenant_id=$1`,`delete from ${table} where tenant_id=$1 and id=$2`])await fail(()=>rowsAs(uuid(1),sql,[tenantA,visits[0]]),undefined,'42501');}
 });
 await t.test('receipt and template helper are private even to owner',async()=>{
  await fail(()=>rowsAs(uuid(1),'select * from abysta_private.site_visit_request'),undefined,'42501');await fail(()=>rowsAs(uuid(1),'select abysta_private.site_visit_template()'),undefined,'42501');await fail(()=>rowsAs(uuid(1),'select abysta_private.require_visit_scope($1,$2,$3)',[tenantA,c1,sites[0]]),undefined,'42501');
 });
 await t.test('extra/missing fields and actor, parent, version or approval spoofing are rejected',async()=>{
  const missing=visitData();delete missing.notes;
  for(const data of [null,[],missing,visitData({created_by:uuid(2)}),visitData({site_id:sites[1]}),visitData({row_version:99}),visitData({approved:true}),visitData({notes:null}),visitData({title:123})])await fail(()=>save(uuid(399),data),'INVALID_INPUT');
 });
 await t.test('text bounds, single-line controls, contact dependencies and status allowlist enforced',async()=>{
  for(const data of [visitData({title:'x'}),visitData({title:'x'.repeat(161)}),visitData({title:'A\nB'}),visitData({reference:'x'.repeat(41)}),visitData({lead_name:'x'.repeat(161)}),visitData({notes:'x'.repeat(4001)}),visitData({notes:'bad\u0001value'}),visitData({contact_role:'Manager'}),visitData({contact_name:'Alex',contact_email:'invalid@'}),visitData({status:'approved'}),visitData({template_key:'other'})])await fail(()=>save(uuid(399),data),'INVALID_INPUT');
 });
 await t.test('Unicode trimming and code-point lengths agree with the web contract',async()=>{
  const id=uuid(500);await save(id,withAnswer('client_objectives',answer('\u00a0Measured\n\ttext\ufeff','measured','\u00a0Evidence note\ufeff'),{title:'🏢'.repeat(160),notes:'Line 1\r\nLine 2'}));const data=await get(id);
  assert.equal(data.revision.answers.client_objectives.value,'Measured\n\ttext');assert.equal(data.revision.answers.client_objectives.note,'Evidence note');
  await fail(()=>save(uuid(399),visitData({title:'🏢'.repeat(161)})),'INVALID_INPUT');
 });
 await t.test('real ISO dates and leap days are accepted; impossible or out-of-range dates fail',async()=>{
  await save(uuid(501),visitData({visit_date:'2024-02-29'}));assert.equal((await get(uuid(501))).revision.visit_date,'2024-02-29');
  for(const date of ['2025-02-29','2026-02-30','2026-13-01','2026-01-32','01/10/2026','2026-1-01','1899-12-31','2101-01-01','today'])await fail(()=>save(uuid(399),visitData({visit_date:date})),'INVALID_INPUT');
 });
 await t.test('answers must have exactly all sixteen question IDs and all four answer keys',async()=>{
  const missing=emptyAnswers();delete missing.follow_up;const altered=emptyAnswers();delete altered.follow_up.note;
  for(const answers of [null,[],{},missing,{...emptyAnswers(),unexpected:{}},altered,{...emptyAnswers(),follow_up:{...emptyAnswers().follow_up,actor:uuid(2)}},{...emptyAnswers(),follow_up:null}])await fail(()=>save(uuid(399),visitData({answers})),'INVALID_INPUT');
 });
 await t.test('unanswered, unknown and NA cannot smuggle values, provenance or invisible notes',async()=>{
  for(const a of [{state:'unanswered',value:0,source:'',note:''},{state:'unanswered',value:null,source:'',note:'Hidden note'},{state:'unknown',value:null,source:'',note:''},{state:'unknown',value:0,source:'',note:'Unknown'},{state:'unknown',value:null,source:'estimated',note:'Unknown'},{state:'not_applicable',value:null,source:'',note:''}])await fail(()=>save(uuid(399),withAnswer('typical_occupancy',a)),'INVALID_INPUT');
  await fail(()=>save(uuid(399),withAnswer('water_available',{state:'not_applicable',value:null,source:'',note:'Cannot inspect'})),'INVALID_INPUT');
 });
 await t.test('answered fields require allowed provenance and bounded notes',async()=>{
  for(const a of [answer('Known',''),answer('Known','ai'),answer('Known','observed','x'.repeat(1001)),answer('Known','observed','bad\u0001note'),{state:null,value:'Known',source:'observed',note:''},answer('Known',null)])await fail(()=>save(uuid(399),withAnswer('client_objectives',a)),'INVALID_INPUT');
 });
 await t.test('text answers are nonempty bounded strings with permitted multiline whitespace',async()=>{
  for(const value of [null,false,1,[],{},' ','x'.repeat(2001),'bad\u0001text'])await fail(()=>save(uuid(399),withAnswer('client_objectives',answer(value))),'INVALID_INPUT');
 });
 await t.test('select codes, actual booleans and finite integer numeric bounds are enforced',async()=>{
  for(const [key,value]of [['service_type','invalid'],['service_type',true],['water_available','false'],['water_available',0],['service_days','7'],['service_days',7.5],['service_days',8],['service_days',-1],['typical_occupancy',1000001],['typical_occupancy',null]])await fail(()=>save(uuid(399),withAnswer(key,answer(value))),'INVALID_INPUT');
  await save(uuid(502),visitData({answers:{...emptyAnswers(),service_type:answer('recurring','client'),water_available:answer(true),service_days:answer(7),typical_occupancy:answer(1000000,'document')}}));
 });
 await t.test('null identities and unsupported expected versions are rejected',async()=>{
  await fail(()=>save(null),'INVALID_INPUT');for(const version of [null,-1,9007199254740991])await fail(()=>save(uuid(399),visitData(),version),'INVALID_INPUT');
  await fail(()=>save(uuid(399),visitData(),0,{key:null}),'INVALID_INPUT');await fail(()=>save(uuid(399),visitData(),0,{client:null}),'INVALID_INPUT');await fail(()=>save(uuid(399),visitData(),0,{site:null}),'INVALID_INPUT');
 });
 await t.test('read RPC pagination is bounded, deterministic and returns accurate totals',async()=>{
  const first=await list({limit:1}),second=await list({offset:1,limit:1});assert.equal(first.records.length,1);assert.notEqual(first.records[0].id,second.records[0].id);assert.equal(first.total,second.total);assert.equal(first.total,4);
  assert.deepEqual((await list({offset:1000})).records,[]);const h=await history(visits[0],{offset:1,limit:2});assert.deepEqual(h.records.map(r=>r.revision_number),[6,5]);assert.equal(h.total,7);
  for(const scope of [{offset:-1},{offset:null},{limit:0},{limit:101},{limit:null}]){await fail(()=>list(scope),'INVALID_INPUT');await fail(()=>history(visits[0],scope),'INVALID_INPUT');}
  await fail(()=>get(visits[0],0),'INVALID_INPUT');await fail(()=>get(visits[0],99),'RECORD_NOT_FOUND');
 });
 await t.test('list latest revision and detail pointer return matching data and actor identity',async()=>{
  await save(visits[0],visitData({title:'Current survey',lead_name:'Lead is only a label'}),7,{actor:uuid(8)});const detail=await get();const row=(await list()).records.find(r=>r.id===visits[0]);
  assert.equal(row.title,detail.revision.title);assert.equal(row.row_version,8);assert.equal(detail.revision.revision_number,8);assert.equal(detail.visit.created_by,uuid(1));assert.equal(detail.visit.updated_by,uuid(8));assert.equal(detail.revision.created_by,uuid(8));
 });
 await t.test('immutable revision triggers block privileged updates and deletion',async()=>{
  const {revision}=await get();await fail(()=>db.query("update visit_revision set notes='changed' where tenant_id=$1 and id=$2",[tenantA,revision.id]),'IMMUTABLE_VISIT_HISTORY');await fail(()=>db.query('delete from visit_revision where tenant_id=$1 and id=$2',[tenantA,revision.id]),'IMMUTABLE_VISIT_HISTORY');
  await fail(()=>db.query('delete from site_visit where tenant_id=$1 and id=$2',[tenantA,visits[0]]),'IMMUTABLE_VISIT_HISTORY');
 });
 await t.test('stable identity and current pointer/revision-number integrity also resist privileged updates',async()=>{
  await fail(()=>db.query('update site_visit set site_id=$1 where tenant_id=$2 and id=$3',[sites[1],tenantA,visits[0]]),'IMMUTABLE_SITE');
  await fail(()=>db.query('update site_visit set row_version=row_version+1 where tenant_id=$1 and id=$2',[tenantA,visits[0]]),'INVALID_VISIT_VERSION');
  await fail(()=>db.query('update site_visit set row_version=row_version+1,current_revision_id=$1 where tenant_id=$2 and id=$3',[uuid(999),tenantA,visits[0]]),undefined,'23503');
 });
 await t.test('composite foreign keys block cross-client and cross-tenant privileged identity inserts',async()=>{
  await fail(()=>db.query('insert into site_visit(tenant_id,id,client_company_id,site_id,row_version,current_revision_id,created_by,updated_by)values($1,$2,$3,$4,1,$5,$6,$6)',[tenantA,uuid(700),c2,sites[0],uuid(701),uuid(1)]),undefined,'23503');
  await fail(()=>db.query('insert into site_visit(tenant_id,id,client_company_id,site_id,row_version,current_revision_id,created_by,updated_by)values($1,$2,$3,$4,1,$5,$6,$6)',[tenantB,uuid(700),c1,sites[0],uuid(701),uuid(2)]),undefined,'23503');
 });
 await t.test('failed revision insertion rolls back new identity, pointer and receipt atomically',async()=>{
  await db.exec(`create function abysta_private.fail_visit_test()returns trigger language plpgsql as $$begin if new.title='Forced failure' then raise exception 'TEST_VISIT_FAILURE';end if;return new;end;$$;create trigger fail_visit_test before insert on visit_revision for each row execute function abysta_private.fail_visit_test();`);
  const key=req(9999);await fail(()=>save(uuid(599),visitData({title:'Forced failure'}),0,{key}),'TEST_VISIT_FAILURE');assert.equal(await count('site_visit','where id=$1',[uuid(599)]),0);assert.equal(await count('abysta_private.site_visit_request','where request_id=$1',[key]),0);
  const before=await get();await fail(()=>save(visits[0],visitData({title:'Forced failure'}),8),'TEST_VISIT_FAILURE');assert.deepEqual(await get(),before);
  await db.exec('drop trigger fail_visit_test on visit_revision;drop function abysta_private.fail_visit_test();');await save(uuid(599),visitData({title:'Forced failure'}),0,{key});
 });
 await t.test('archived building remains readable but rejects new save and successful old receipt',async()=>{
  await dir('site',sites[0],siteData(c1,{name:'Renamed building',address:'20 New Road',reference:'B1',status:'archived'}),2);
  assert.equal((await get()).visit.row_version,8);assert.ok((await list()).total>0);assert.equal((await history()).total,8);
  await fail(()=>save(visits[0],visitData(),8),'PARENT_ARCHIVED');await fail(()=>save(visits[0],visitData(),0,{key:firstKey}),'PARENT_ARCHIVED');
  await dir('site',sites[0],siteData(c1,{name:'Renamed building',address:'20 New Road',reference:'B1'}),3);
 });
 await t.test('archived client remains readable but blocks creation, updates and receipt replay',async()=>{
  await dir('client',c1,clientData({legal_name:'Renamed client',status:'archived'}),2);assert.equal((await get()).visit.row_version,8);
  await fail(()=>save(uuid(799)),'PARENT_ARCHIVED');await fail(()=>save(visits[0],visitData(),8),'PARENT_ARCHIVED');await fail(()=>save(visits[0],visitData(),0,{key:firstKey}),'PARENT_ARCHIVED');
  await dir('client',c1,clientData({legal_name:'Renamed client'}),3);
 });
 await t.test('current membership revocation blocks reads, writes and receipt replay immediately',async()=>{
  await db.query("update membership set status='revoked' where tenant_id=$1 and auth_user_id=$2",[tenantA,uuid(1)]);
  assert.deepEqual(await rowsAs(uuid(1),'select * from visit_revision where tenant_id=$1',[tenantA]),[]);await fail(()=>get(),'FORBIDDEN');await fail(()=>save(visits[0],visitData(),0,{key:firstKey}),'FORBIDDEN');
  await db.query("update membership set status='active' where tenant_id=$1 and auth_user_id=$2",[tenantA,uuid(1)]);
 });
 await t.test('removing owner role or archiving tenant blocks access without stale authorization',async()=>{
  await db.query("update membership set role_codes=array['admin'] where tenant_id=$1 and auth_user_id=$2",[tenantA,uuid(1)]);await fail(()=>get(),'FORBIDDEN');await fail(()=>save(visits[0],visitData(),0,{key:firstKey}),'FORBIDDEN');
  await db.query("update membership set role_codes=array['owner'] where tenant_id=$1 and auth_user_id=$2",[tenantA,uuid(1)]);
  await db.query("update operator_tenant set status='archived' where id=$1",[tenantA]);await fail(()=>list(),'FORBIDDEN');await fail(()=>save(visits[0],visitData(),0,{key:firstKey}),'FORBIDDEN');
  await db.query("update operator_tenant set status='active' where id=$1",[tenantA]);
 });
 await t.test('list snapshot tokens detect edits with equal totals and are stable on receipt retry',async()=>{
  const id=uuid(803),key=req(10001),scope={site:sites[2]};await save(id,visitData(),0,scope);
  const before=await list(scope),oldHistory=await history(id,scope);
  await save(id,visitData({notes:'Updated'}),1,{...scope,key});
  const after=await list(scope),newHistory=await history(id,scope);
  assert.equal(before.total,after.total);assert.notEqual(before.snapshot_token,after.snapshot_token);
  assert.equal(oldHistory.snapshot_token,'1');assert.equal(newHistory.snapshot_token,'2');
  await save(id,visitData({notes:'Updated'}),1,{...scope,key});
  assert.equal((await list(scope)).snapshot_token,after.snapshot_token);
  assert.equal((await history(id,scope)).snapshot_token,newHistory.snapshot_token);
  assert.equal((await list({site:sites[14]})).snapshot_token,'0:0');
 });

 await t.test('separate tenant and separate actor can reuse a request UUID without crossing receipts',async()=>{
  await save(uuid(801),visitData(),0,{tenant:tenantB,actor:uuid(2),client:cOther,site:siteOther,key:firstKey});assert.equal((await get(uuid(801),null,{tenant:tenantB,actor:uuid(2),client:cOther,site:siteOther})).visit.created_by,uuid(2));
  await save(uuid(802),visitData(),0,{actor:uuid(8),key:firstKey});assert.equal((await get(uuid(802))).visit.created_by,uuid(8));assert.equal((await get()).visit.row_version,8);
 });
});
