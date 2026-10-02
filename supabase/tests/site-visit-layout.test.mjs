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
const visitData=(overrides={})=>({title:'Initial site visit',reference:'',visit_date:'',lead_name:'',contact_name:'',contact_role:'',contact_email:'',contact_phone:'',notes:'',status:'draft',template_key:template.key,answers:emptyAnswers(),...overrides});
const clientData=(overrides={})=>({legal_name:'Acme Properties',reference:'',address:'1 Client Road',notes:'',status:'active',contact_name:'',contact_role:'',contact_email:'',contact_phone:'',...overrides});
const siteData=(client,overrides={})=>({client_company_id:client,name:'London office',reference:'',address:'10 Office Road',timezone:'Europe/London',building_type:'office',notes:'',status:'active',contact_name:'',contact_role:'',contact_email:'',contact_phone:'',...overrides});
const portfolioData=(client,ids)=>({client_company_id:client,name:'Portfolio offices',reference:'',notes:'',status:'active',site_ids:ids});

const emptyMeasurement=()=>({state:'unanswered',value:null,source:'',note:''});
const measured=(value,source='measured',note='')=>({state:'answered',value,source,note});
const floor=(id=uuid(1001),name='Ground floor')=>({id,name,reference:'G',level:'0'});
const zone=(id=uuid(1101),floorId=uuid(1001),overrides={})=>({id,floor_id:floorId,name:'Reception',reference:'',kind:'reception',service_scope:'undecided',material:'',condition:'unknown',occupancy:'',obstacles:'',access:'',exclusion_reason:'',notes:'',floor_area:emptyMeasurement(),glass_area:emptyMeasurement(),edge_length:emptyMeasurement(),fixture_count:emptyMeasurement(),fixture_type:'',...overrides});
const layout=(version=0,overrides={})=>({schema_version:1,inventory_version:version,gross_floor_area:emptyMeasurement(),floors:[floor()],zones:[zone()],...overrides});

test('Site Visits 3B SQL: frozen layouts, building identity, validation and access',async(t)=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid()to anon,authenticated;
 create schema storage;
 create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$ select coalesce(current_setting('test.storage.operation',true)=any(operations),false) $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,anon;
 grant select,insert,update,delete on storage.objects to authenticated,anon;`);
 for(const file of ['20261002000100_company_setup.sql','20261002002000_directory.sql','20261002002100_directory_images.sql','20261002003000_site_visits.sql','20261002003100_http_conflict_codes.sql'])await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
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
 const count=async(table,where='',params=[])=>(await db.query(`select count(*)::int n from ${table} ${where}`,params)).rows[0].n;
 await dir('client',c1,clientData());await dir('client',c2,clientData({legal_name:'Second client'}));await dir('client',cOther,clientData(),0,{actor:uuid(2),tenant:tenantB});
 for(let i=0;i<sites.length;i++)await dir('site',sites[i],siteData(c1,{name:`Building ${i+1}`,reference:`B${i+1}`}));
 await dir('site',siteOther,siteData(cOther),0,{actor:uuid(2),tenant:tenantB});await dir('site',wrongClientSite,siteData(c2));
 await dir('portfolio',uuid(401),portfolioData(c1,sites));await dir('portfolio',uuid(402),portfolioData(c1,sites.slice(0,10)));

 const inventory=({actor=uuid(1),tenant=tenantA,client=c1,site=sites[0]}={})=>rowsAs(actor,'select get_site_inventory($1,$2,$3)data',[tenant,client,site]).then(r=>r[0].data);
 const legacyId=uuid(900),legacyKey=req(900);
 await save(legacyId,visitData(),0,{key:legacyKey});
 const legacyBefore=await get(legacyId);
 await db.exec(await readFile(new URL('../migrations/20261002004000_site_visit_layout.sql',import.meta.url),'utf8'));
 const l0=layout(0,{gross_floor_area:measured(900,'plan'),zones:[zone(uuid(1101),uuid(1001),{service_scope:'included',floor_area:measured(100),glass_area:measured(20)}),zone(uuid(1102),uuid(1001),{name:'Office',kind:'office',service_scope:'included',floor_area:measured(50)}),zone(uuid(1103),uuid(1001),{name:'Unvisited store',kind:'storage',floor_area:{state:'unknown',value:null,source:'',note:'Door locked'}})]});
 const firstKey=req(901);

 await t.test('migration preserves every existing revision and makes legacy absence explicit',async()=>{
  const actual=await get(legacyId);assert.equal(actual.revision.layout_snapshot,null);delete actual.revision.layout_snapshot;assert.deepEqual(actual,legacyBefore);
  assert.deepEqual(await inventory(),{version:0,structure:{floors:[],zones:[]}});assert.equal(await count('site_inventory'),0);
 });
 await t.test('receipt written before migration still retries without creating or changing inventory',async()=>{
  assert.equal(await save(legacyId,visitData({title:' Initial site visit '}),0,{key:legacyKey}),legacyId);
  assert.equal((await get(legacyId)).visit.row_version,1);assert.equal(await count('site_inventory'),0);
 });
 await t.test('first layout registers stable identities and stores resulting inventory version',async()=>{
  await save(visits[0],visitData({layout:l0}),0,{key:firstKey});
  assert.equal((await get()).revision.layout_snapshot.inventory_version,1);assert.equal((await inventory()).version,1);
  assert.equal(await count('site_floor'),1);assert.equal(await count('site_zone'),3);
  assert.deepEqual((await inventory()).structure,{floors:l0.floors,zones:l0.zones.map(({id,floor_id,name,reference,kind})=>({id,floor_id,name,reference,kind}))});
 });
 await t.test('measurements, gross reference, glass and unknown remain separate exact fields',async()=>{
  const snap=(await get()).revision.layout_snapshot;
  assert.equal(snap.gross_floor_area.value,900);assert.equal(snap.zones[0].glass_area.value,20);
  assert.equal(snap.zones.filter(z=>z.floor_area.state==='answered').reduce((sum,z)=>sum+z.floor_area.value,0),150);
  assert.equal(snap.zones.filter(z=>z.floor_area.state==='unknown').length,1);assert.equal(snap.zones[2].floor_area.value,null);
 });
 await t.test('same normalized layout retry succeeds with old inventory version and no new revision',async()=>{
  const retry=structuredClone(l0);retry.floors[0].name=' Ground floor ';retry.floors[0].id=' '+retry.floors[0].id.toUpperCase()+' ';retry.zones.forEach(z=>z.floor_id=' '+z.floor_id.toUpperCase()+' ');
  await save(visits[0],visitData({layout:retry}),0,{key:firstKey});assert.equal((await get()).visit.row_version,1);assert.equal((await inventory()).version,1);
 });
 await t.test('receipt binds measurement values, structure and input inventory version',async()=>{
  for(const altered of [layout(1),{...l0,inventory_version:1},{...l0,gross_floor_area:measured(901)}])await fail(()=>save(visits[0],visitData({layout:altered}),0,{key:firstKey}),'REQUEST_KEY_REUSED');
  await fail(()=>save(visits[0],visitData(),0,{key:firstKey}),'REQUEST_KEY_REUSED');
 });
 await t.test('measurement-only save increments visit revision but not building inventory',async()=>{
  const data=structuredClone(l0);data.inventory_version=1;data.zones[0].floor_area=measured(105,'estimated');
  await save(visits[0],visitData({layout:data}),1);assert.equal((await get()).visit.row_version,2);assert.equal((await inventory()).version,1);
  assert.equal((await get(visits[0],1)).revision.layout_snapshot.zones[0].floor_area.value,100);assert.equal((await get()).revision.layout_snapshot.zones[0].floor_area.value,105);
 });
 await t.test('legacy questionnaire-only save carries its own snapshot and never clears building structure',async()=>{
  const before=await inventory(),snapshot=(await get()).revision.layout_snapshot;
  await save(visits[0],visitData({notes:'Legacy questionnaire edit'}),2);assert.deepEqual((await get()).revision.layout_snapshot,snapshot);assert.deepEqual(await inventory(),before);
  await save(uuid(901),visitData());assert.equal((await get(uuid(901))).revision.layout_snapshot,null);assert.deepEqual(await inventory(),before);
 });
 await t.test('renaming and reordering structure versions current inventory without rewriting previous visits',async()=>{
  const data=structuredClone(l0);data.inventory_version=1;data.floors[0].name='Ground level';data.zones.reverse();
  await save(visits[1],visitData({layout:data}));assert.equal((await inventory()).version,2);assert.equal((await get(visits[1])).revision.layout_snapshot.inventory_version,2);
  assert.equal((await get()).revision.layout_snapshot.floors[0].name,'Ground floor');assert.equal((await get()).revision.layout_snapshot.inventory_version,1);
 });
 await t.test('different visit with stale inventory cannot overwrite current building structure',async()=>{
  await fail(()=>save(visits[0],visitData({layout:{...l0,inventory_version:1}}),3),'STALE_INVENTORY','PT409');
  assert.equal((await get()).visit.row_version,3);assert.equal((await inventory()).version,2);
 });
 await t.test('same-visit conflict with current inventory uses PT409 and rolls back all layout changes',async()=>{
  const data={...l0,inventory_version:2};await fail(()=>save(visits[0],visitData({layout:data}),1),'STALE_RECORD','PT409');
  assert.equal((await inventory()).version,2);assert.equal((await get()).visit.row_version,3);
 });
 await t.test('successful old receipt never reverts later inventory or revisions',async()=>{
  await save(visits[0],visitData({layout:l0}),0,{key:firstKey});assert.equal((await get()).visit.row_version,3);assert.equal((await inventory()).version,2);
 });
 await t.test('legacy edit after another visit changed structure retains older layout and version',async()=>{
  await save(visits[0],visitData(),3);assert.equal((await get()).revision.layout_snapshot.inventory_version,1);assert.equal((await inventory()).version,2);
 });
 await t.test('omitting zones removes them only from current inventory; identities and old observations remain',async()=>{
  const data=layout(2,{zones:[]});await save(visits[0],visitData({layout:data}),4);
  assert.equal((await inventory()).version,3);assert.deepEqual((await inventory()).structure.zones,[]);assert.equal(await count('site_zone'),3);
  assert.equal((await get(visits[0],1)).revision.layout_snapshot.zones.length,3);
 });
 await t.test('same stable zone can be reintroduced only to its original floor and building',async()=>{
  const data=layout(3);await save(visits[0],visitData({layout:data}),5);assert.equal((await inventory()).version,4);assert.equal(await count('site_zone'),3);
  const moved=layout(4,{floors:[floor(),floor(uuid(1002),'First floor')],zones:[zone(uuid(1101),uuid(1002))]});
  await fail(()=>save(visits[0],visitData({layout:moved}),6),'INVALID_LAYOUT_ID');assert.equal((await inventory()).version,4);assert.equal(await count('site_floor'),1);
 });
 await t.test('stable IDs cannot be reused across buildings, clients or tenants',async()=>{
  await fail(()=>save(uuid(10000),visitData({layout:layout()}),0,{site:sites[1]}),'INVALID_LAYOUT_ID');
  await fail(()=>save(uuid(10000),visitData({layout:layout()}),0,{client:c2,site:wrongClientSite}),'INVALID_LAYOUT_ID');
  await fail(()=>save(uuid(10000),visitData({layout:layout()}),0,{actor:uuid(2),tenant:tenantB,client:cOther,site:siteOther}),'INVALID_LAYOUT_ID');
  assert.equal(await count('site_inventory'),1);
 });
 await t.test('historical zone IDs cannot become floors and floor IDs cannot become zones',async()=>{
  await fail(()=>save(uuid(10000),visitData({layout:layout(4,{floors:[floor(uuid(1103))],zones:[]})})),'INVALID_LAYOUT_ID');
  await fail(()=>save(uuid(10000),visitData({layout:layout(4,{floors:[floor(uuid(1002))],zones:[zone(uuid(1001),uuid(1002))]})})),'INVALID_LAYOUT_ID');
  assert.equal(await count('site_floor'),1);
 });
 await t.test('fifteen-building portfolios share building identities while ten sites keep independent layouts',async()=>{
  for(let i=1;i<10;i++)await save(uuid(20000+i),visitData({layout:layout(0,{floors:[floor(uuid(21000+i))],zones:[zone(uuid(22000+i),uuid(21000+i),{name:`Reception ${i+1}`})]})}),0,{site:sites[i]});
  assert.equal(await count('site_inventory'),10);assert.equal(await count('site_floor'),10);assert.equal(await count('site','where tenant_id=$1 and client_company_id=$2',[tenantA,c1]),15);
  assert.equal(await count('portfolio_site','where tenant_id=$1 and left_at is null',[tenantA]),25);assert.deepEqual(await inventory({site:sites[14]}),{version:0,structure:{floors:[],zones:[]}});
  const before=await inventory();await dir('portfolio',uuid(402),portfolioData(c1,sites.slice(1,10)),1);assert.deepEqual(await inventory(),before);
 });
 await t.test('explicit zero, unknown, unanswered and not applicable survive as distinct states',async()=>{
  const data=layout(4,{zones:[zone(uuid(1101),uuid(1001),{floor_area:measured(0),glass_area:{state:'not_applicable',value:null,source:'',note:'No glazing'},edge_length:{state:'unknown',value:null,source:'',note:'Not measured'},fixture_count:emptyMeasurement()})]});
  await save(visits[0],visitData({layout:data}),6);const z=(await get()).revision.layout_snapshot.zones[0];assert.equal(z.floor_area.value,0);assert.equal(z.glass_area.state,'not_applicable');assert.equal(z.edge_length.state,'unknown');assert.equal(z.fixture_count.state,'unanswered');
 });
 await t.test('scope, exclusions and integer fixtures with a type are stored',async()=>{
  const data=layout(4,{zones:[zone(uuid(1101),uuid(1001),{service_scope:'excluded',exclusion_reason:'Tenant maintained',floor_area:measured(12.34,'client'),fixture_count:measured(6,'document'),fixture_type:'Washbasins',notes:'Line one\nLine two',material:'Stone',condition:'fair',access:'Escort needed',obstacles:'Desks',occupancy:'30 staff'})]});
  await save(visits[0],visitData({layout:data}),7);const snap=(await get()).revision.layout_snapshot;assert.deepEqual(snap,{...data,inventory_version:4});
 });
 await t.test('new empty layout is valid but not evidence of complete coverage',async()=>{
  await save(uuid(30000),visitData({layout:layout(0,{floors:[],zones:[]})}),0,{site:sites[14]});
  assert.deepEqual(await inventory({site:sites[14]}),{version:0,structure:{floors:[],zones:[]}});assert.equal((await get(uuid(30000),null,{site:sites[14]})).revision.layout_snapshot.gross_floor_area.state,'unanswered');
 });
 await t.test('null, non-object, schema, extra and missing layout fields are rejected',async()=>{
  const missing=layout(4);delete missing.gross_floor_area;
  for(const value of [null,[],{},missing,layout(4,{schema_version:2}),layout(4,{unexpected:true}),layout(4,{floors:{}}),layout(4,{zones:null})])await fail(()=>save(uuid(30001),visitData({layout:value})),'INVALID_INPUT');
 });
 await t.test('inventory versions must be safe nonnegative integers',async()=>{
  for(const value of [null,'4',-1,1.5,9007199254740991,9007199254740992])await fail(()=>save(uuid(30001),visitData({layout:layout(value)})),'INVALID_INPUT');
 });
 await t.test('only fifty floors and three hundred zones are allowed per building',async()=>{
  await fail(()=>save(uuid(30001),visitData({layout:layout(4,{floors:Array.from({length:51},(_,i)=>floor(uuid(40000+i)))})})),'INVALID_INPUT');
  await fail(()=>save(uuid(30001),visitData({layout:layout(4,{zones:Array.from({length:301},(_,i)=>zone(uuid(41000+i)))})})),'INVALID_INPUT');
 });
 await t.test('exact limits fifty floors and three hundred zones save successfully',async()=>{
  const data=layout(0,{floors:Array.from({length:50},(_,i)=>floor(uuid(42000+i))),zones:Array.from({length:300},(_,i)=>zone(uuid(43000+i),uuid(42000+(i%50))))});
  await save(uuid(44000),visitData({layout:data}),0,{site:sites[13]});assert.equal((await inventory({site:sites[13]})).structure.zones.length,300);
 });
 await t.test('alphabetic UUIDs normalize case/whitespace and retry as the same identities',async()=>{
  const fid='abcdefab-cdef-4abc-8def-abcdefabcdef',zid='fedcbafe-dcba-4fed-8cba-fedcbafedcba',key=req(45000);
  const raw=layout(0,{floors:[floor(` ${fid.toUpperCase()} `)],zones:[zone(` ${zid.toUpperCase()} `,` ${fid.toUpperCase()} `)]});
  await save(uuid(45000),visitData({layout:raw}),0,{site:sites[11],key});
  const current=await inventory({site:sites[11]});assert.equal(current.structure.floors[0].id,fid);assert.equal(current.structure.zones[0].id,zid);assert.equal(current.structure.zones[0].floor_id,fid);
  const canonical=layout(0,{floors:[floor(fid)],zones:[zone(zid,fid)]});await save(uuid(45000),visitData({layout:canonical}),0,{site:sites[11],key});
  assert.equal((await get(uuid(45000),null,{site:sites[11]})).visit.row_version,1);
  const duplicate=layout(1,{floors:[floor(fid),floor(fid.toUpperCase())],zones:[]});await fail(()=>save(uuid(45001),visitData({layout:duplicate}),0,{site:sites[11]}),'INVALID_INPUT');
 });
 await t.test('maximum quantity, two decimals, floor NA and zero typed fixtures are valid',async()=>{
  const data=layout(0,{gross_floor_area:measured(10000000),floors:[floor(uuid(46001))],zones:[zone(uuid(46002),uuid(46001),{floor_area:{state:'not_applicable',value:null,source:'',note:'Vertical surface only'},glass_area:measured(12.34),edge_length:measured(0.01),fixture_count:measured(0),fixture_type:'Washbasins'})]});
  await save(uuid(46000),visitData({layout:data}),0,{site:sites[10]});assert.deepEqual((await get(uuid(46000),null,{site:sites[10]})).revision.layout_snapshot,{...data,inventory_version:1});
 });
 await t.test('duplicate, cross-type, malformed and foreign floor references are rejected',async()=>{
  const variants=[{floors:[floor(),floor()]},{zones:[zone(),zone()]},{zones:[zone(uuid(1001))]},{floors:[floor('bad')]},{zones:[zone(uuid(1101),uuid(9999))]},{zones:[{...zone(),id:123}]},{zones:[{...zone(),floor_id:null}]}];
  for(const override of variants)await fail(()=>save(uuid(30001),visitData({layout:layout(4,override)})),'INVALID_INPUT');
 });
 await t.test('floor and zone objects reject missing fields and hidden extra inputs',async()=>{
  const missing=zone();delete missing.notes;
  for(const override of [{floors:[{...floor(),area:30}]},{floors:[{id:uuid(1001),name:'Floor'}]},{floors:[null]},{zones:[missing]},{zones:[{...zone(),cost:100}]},{zones:[null]}])await fail(()=>save(uuid(30001),visitData({layout:layout(4,override)})),'INVALID_INPUT');
 });
 await t.test('text limits, controls, enum values, exclusion reasons and fixture descriptions enforced',async()=>{
  for(const overrides of [{name:''},{name:'x'.repeat(101)},{name:'Bad\nName'},{reference:'x'.repeat(41)},{material:'x'.repeat(101)},{occupancy:'x'.repeat(201)},{access:'x'.repeat(1001)},{notes:'bad\u0001text'},{kind:'carpet'},{condition:'excellent'},{service_scope:'approved'},{service_scope:'excluded'},{fixture_count:measured(1)}])await fail(()=>save(uuid(30001),visitData({layout:layout(4,{zones:[zone(uuid(1101),uuid(1001),overrides)]})})),'INVALID_INPUT');
  for(const overrides of [{name:''},{level:'x'.repeat(21)},{reference:'x'.repeat(41)},{name:3}])await fail(()=>save(uuid(30001),visitData({layout:layout(4,{floors:[{...floor(),...overrides}]})})),'INVALID_INPUT');
 });
 await t.test('measurement objects require exactly the four typed keys',async()=>{
  for(const value of [null,[],{}, {...measured(1),unit:'m²'}, {state:'answered',value:1,source:'measured'}, {...measured(1),note:null},{...measured(1),source:null},{...measured(1),state:false}])await fail(()=>save(uuid(30001),visitData({layout:layout(4,{gross_floor_area:value})})),'INVALID_INPUT');
 });
 await t.test('negative, nonnumeric, too-large and overprecise measurement values fail',async()=>{
  for(const value of [-1,10000000.01,1.001,'100',null,false,[],{}])await fail(()=>save(uuid(30001),visitData({layout:layout(4,{gross_floor_area:measured(value)})})),'INVALID_INPUT');
  await fail(()=>save(uuid(30001),visitData({layout:layout(4,{zones:[zone(uuid(1101),uuid(1001),{fixture_count:measured(1.5),fixture_type:'Basins'})]})})),'INVALID_INPUT');
 });
 await t.test('all answered measurements require allowed provenance; notes are bounded',async()=>{
  for(const value of [measured(1,''),measured(1,'observed'),measured(1,'ai'),measured(1,'measured','x'.repeat(501)),measured(1,'plan','bad\u0001note')])await fail(()=>save(uuid(30001),visitData({layout:layout(4,{gross_floor_area:value})})),'INVALID_INPUT');
 });
 await t.test('unanswered cannot hide values or notes and unknown/NA require a reason',async()=>{
  for(const value of [{...emptyMeasurement(),value:0},{...emptyMeasurement(),note:'hidden'},{...emptyMeasurement(),source:'plan'},{state:'unknown',value:null,source:'',note:''},{state:'unknown',value:0,source:'',note:'Not measured'},{state:'not_applicable',value:null,source:'plan',note:'No floor'},{state:'invalid',value:null,source:'',note:''}])await fail(()=>save(uuid(30001),visitData({layout:layout(4,{gross_floor_area:value})})),'INVALID_INPUT');
 });
 await t.test('Unicode codepoint bounds and normalization match the web contract',async()=>{
  const data=layout(4,{floors:[{...floor(),name:' Ground floor﻿'}],zones:[zone(uuid(1101),uuid(1001),{material:'🏢'.repeat(100),notes:'A\r\nB\tC',floor_area:measured(0.1,' measured ',' Measured﻿')})]});
  await save(visits[0],visitData({layout:data}),8);const snap=(await get()).revision.layout_snapshot;assert.equal(snap.floors[0].name,'Ground floor');assert.equal(snap.zones[0].floor_area.source,'measured');assert.equal(snap.zones[0].floor_area.note,'Measured');
  await fail(()=>save(uuid(30001),visitData({layout:layout(4,{zones:[zone(uuid(1101),uuid(1001),{material:'🏢'.repeat(101)})]})})),'INVALID_INPUT');
 });
 await t.test('total UTF8 payload bound is enforced before expensive validation or mutation',async()=>{
  const before=await count('visit_revision');await fail(()=>save(uuid(30001),visitData({notes:'x'.repeat(512001)})),'PAYLOAD_TOO_LARGE');
  await fail(()=>save(uuid(30001),visitData({notes:'🏢'.repeat(128001)})),'PAYLOAD_TOO_LARGE');assert.equal(await count('visit_revision'),before);
 });
 await t.test('inventory RPC rejects anon, missing auth, unauthorized roles and unrelated tenants',async()=>{
  await fail(()=>rowsAs(null,'select get_site_inventory($1,$2,$3)',[tenantA,c1,sites[0]],'anon'),undefined,'42501');
  await fail(()=>inventory({actor:null}),'AUTH_REQUIRED');for(const n of [2,3,4,5,6,7,9])await fail(()=>inventory({actor:uuid(n)}),'FORBIDDEN');assert.equal((await inventory({actor:uuid(8)})).version,4);
 });
 await t.test('inventory RPC validates null, wrong-client, foreign and missing ancestry',async()=>{
  await fail(()=>inventory({site:null}),'INVALID_INPUT');await fail(()=>inventory({client:null}),'INVALID_INPUT');for(const scope of [{client:c2},{site:siteOther},{site:uuid(9999)}])await fail(()=>inventory(scope),'RECORD_NOT_FOUND');
 });
 await t.test('RLS only exposes active owner structure and identity rows',async()=>{
  for(const table of ['site_floor','site_zone','site_inventory']){for(const n of [2,3,4,5,6,7,9])assert.deepEqual(await rowsAs(uuid(n),`select * from ${table} where tenant_id=$1`,[tenantA]),[]);assert.ok((await rowsAs(uuid(8),`select * from ${table} where tenant_id=$1`,[tenantA])).length>0);}
 });
 await t.test('anon cannot read and owners cannot directly mutate any new table',async()=>{
  for(const table of ['site_floor','site_zone','site_inventory']){
   await fail(()=>rowsAs(null,`select * from ${table}`,[],'anon'),undefined,'42501');
   const key=table==='site_inventory'?'site_id':'id';for(const sql of [`insert into ${table}(tenant_id,${key})values($1,$2)`,`update ${table} set ${key}=$2 where tenant_id=$1`,`delete from ${table} where tenant_id=$1 and ${key}=$2`])await fail(()=>rowsAs(uuid(1),sql,[tenantA,uuid(1001)]),undefined,'42501');
  }
 });
 await t.test('private validators and identity trigger helpers have no caller grants',async()=>{
  for(const sql of [`select abysta_private.layout_text('"x"',1,0,false)`,"select abysta_private.validate_layout_measurement('{}')","select abysta_private.validate_visit_layout('{}')"] )await fail(()=>rowsAs(uuid(1),sql),undefined,'42501');
 });
 await t.test('privileged ordinary DML cannot rewrite floor/zone identity, snapshots or inventory ancestry',async()=>{
  await fail(()=>db.query('update site_floor set site_id=$1 where id=$2',[sites[1],uuid(1001)]),'IMMUTABLE_LAYOUT_IDENTITY');
  await fail(()=>db.query('update site_zone set floor_id=$1 where id=$2',[uuid(1002),uuid(1101)]),'IMMUTABLE_LAYOUT_IDENTITY');
  await fail(()=>db.query('delete from site_floor where id=$1',[uuid(1001)]),'IMMUTABLE_LAYOUT_IDENTITY');await fail(()=>db.query('delete from site_zone where id=$1',[uuid(1101)]),'IMMUTABLE_LAYOUT_IDENTITY');
  await fail(()=>db.query('update visit_revision set layout_snapshot=null where tenant_id=$1',[tenantA]),'IMMUTABLE_VISIT_HISTORY');
  await fail(()=>db.query('update site_inventory set site_id=$1 where tenant_id=$2 and site_id=$3',[sites[1],tenantA,sites[0]]),'IMMUTABLE_SITE');
  await fail(()=>db.query('update site_inventory set row_version=row_version+1 where tenant_id=$1 and site_id=$2',[tenantA,sites[0]]),'INVALID_INVENTORY_VERSION');
 });
 await t.test('composite FKs prevent cross-client and cross-tenant privileged identity inserts',async()=>{
  await fail(()=>db.query('insert into site_floor(tenant_id,id,client_company_id,site_id,created_by)values($1,$2,$3,$4,$5)',[tenantA,uuid(50000),c2,sites[0],uuid(1)]),undefined,'23503');
  await fail(()=>db.query('insert into site_zone(tenant_id,id,client_company_id,site_id,floor_id,created_by)values($1,$2,$3,$4,$5,$6)',[tenantA,uuid(50000),c1,sites[1],uuid(1001),uuid(1)]),undefined,'23503');
  await fail(()=>db.query('insert into site_inventory(tenant_id,client_company_id,site_id,row_version,structure)values($1,$2,$3,0,$4)',[tenantB,c1,sites[0],{}]),undefined,'23503');
 });
 await t.test('failure after registering identities rolls back inventory, identity, visit and receipt atomically',async()=>{
  await db.exec(`create function abysta_private.fail_layout_test()returns trigger language plpgsql as $$begin if new.title='Forced layout failure' then raise exception 'TEST_LAYOUT_FAILURE';end if;return new;end;$$;create trigger fail_layout_test before insert on visit_revision for each row execute function abysta_private.fail_layout_test();`);
  const key=req(59000),data=visitData({title:'Forced layout failure',layout:layout(0,{floors:[floor(uuid(59001))],zones:[zone(uuid(59002),uuid(59001))]})});
  await fail(()=>save(uuid(59000),data,0,{site:sites[12],key}),'TEST_LAYOUT_FAILURE');assert.equal(await count('site_floor','where id=$1',[uuid(59001)]),0);assert.equal(await count('site_zone','where id=$1',[uuid(59002)]),0);assert.equal(await count('site_inventory','where site_id=$1',[sites[12]]),0);assert.equal(await count('site_visit','where id=$1',[uuid(59000)]),0);assert.equal(await count('abysta_private.site_visit_request','where request_id=$1',[key]),0);
  const before=await inventory(),visit=await get();await fail(()=>save(visits[0],visitData({title:'Forced layout failure',layout:layout(4,{floors:[floor(uuid(59003))],zones:[]})}),9),'TEST_LAYOUT_FAILURE');assert.deepEqual(await inventory(),before);assert.deepEqual(await get(),visit);
  await db.exec('drop trigger fail_layout_test on visit_revision;drop function abysta_private.fail_layout_test();');await save(uuid(59000),data,0,{site:sites[12],key});
 });
 await t.test('archived site allows history/structure reads but blocks all saves and receipt replay',async()=>{
  await dir('site',sites[0],siteData(c1,{name:'Building 1',reference:'B1',status:'archived'}),1);assert.equal((await inventory()).version,4);assert.equal((await get()).visit.row_version,9);
  await fail(()=>save(visits[0],visitData({layout:layout(4)}),9),'PARENT_ARCHIVED');await fail(()=>save(visits[0],visitData({layout:l0}),0,{key:firstKey}),'PARENT_ARCHIVED');
  await dir('site',sites[0],siteData(c1,{name:'Building 1',reference:'B1'}),2);
 });
 await t.test('archived client blocks layout mutation and valid receipt replay',async()=>{
  await dir('client',c1,clientData({status:'archived'}),1);assert.equal((await inventory()).version,4);
  await fail(()=>save(visits[0],visitData({layout:layout(4)}),9),'PARENT_ARCHIVED');await fail(()=>save(visits[0],visitData({layout:l0}),0,{key:firstKey}),'PARENT_ARCHIVED');
  await dir('client',c1,clientData(),2);
 });
 await t.test('revocation, role removal and tenant archive immediately deny read/write/replay',async()=>{
  for(const [change,restore] of [["update membership set status='revoked' where tenant_id=$1 and auth_user_id=$2","update membership set status='active' where tenant_id=$1 and auth_user_id=$2"],["update membership set role_codes=array['admin'] where tenant_id=$1 and auth_user_id=$2","update membership set role_codes=array['owner'] where tenant_id=$1 and auth_user_id=$2"]]){
   await db.query(change,[tenantA,uuid(1)]);await fail(()=>inventory(),'FORBIDDEN');await fail(()=>save(visits[0],visitData({layout:l0}),0,{key:firstKey}),'FORBIDDEN');assert.deepEqual(await rowsAs(uuid(1),'select * from site_inventory where tenant_id=$1',[tenantA]),[]);await db.query(restore,[tenantA,uuid(1)]);
  }
  await db.query("update operator_tenant set status='archived' where id=$1",[tenantA]);await fail(()=>inventory(),'FORBIDDEN');await fail(()=>save(visits[0],visitData({layout:l0}),0,{key:firstKey}),'FORBIDDEN');await db.query("update operator_tenant set status='active' where id=$1",[tenantA]);
 });
 await t.test('function definitions retain safe search paths, auth locks and consistent lock ordering',async()=>{
  const definition=(await db.query("select pg_get_functiondef('public.save_site_visit(uuid,uuid,uuid,uuid,bigint,uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
  assert.doesNotMatch(definition,/40001/);assert.match(definition,/STALE_INVENTORY/);assert.match(definition,/STALE_RECORD/);assert.match(definition,/for share/i);
  const order=['from public.operator_tenant','from public.membership','from public.client_company','from public.site where','into v_receipt','into v_inventory','into v_visit'];let prev=-1;for(const marker of order){const index=definition.indexOf(marker);assert.ok(index>prev,marker);prev=index;}
  const rows=(await db.query("select p.proname,p.prosecdef,p.provolatile,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_site_visit','get_site_inventory')")).rows;
  for(const row of rows){assert.equal(row.prosecdef,true);assert.ok(row.proconfig.some(v=>v.startsWith('search_path=')));if(row.proname==='get_site_inventory')assert.equal(row.provolatile,'s');}
 });
});
