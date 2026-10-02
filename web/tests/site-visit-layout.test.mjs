import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyLayout,emptyZone,emptyMeasurement,reconcileLayout,validateLayout,summarizeLayout,MAX_VISIT_PAYLOAD_BYTES} from '../lib/site-visits/layout.ts';
import {validateVisitPayload,validateSiteVisitForm} from '../lib/site-visits/validation.ts';
import {emptyAnswers} from '../lib/site-visits/questionnaire.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const measured=(value,source='measured')=>({state:'answered',value,source,note:''});
function layout(){return {...emptyLayout(),floors:[{id:id(1),name:'Ground floor',reference:'G',level:'0'}],zones:[emptyZone(id(2),id(1),'Reception'),emptyZone(id(3),id(1),'Office'),emptyZone(id(4),id(1),'Kitchen')]};}
function visit(l){return {title:'Initial visit',reference:'',visit_date:'',lead_name:'',contact_name:'',contact_role:'',contact_email:'',contact_phone:'',notes:'',status:'draft',template_key:'office-cleaning-v1',answers:emptyAnswers(),...(l?{layout:l}:{})};}
function form(p){const f=new FormData();for(const[k,v]of Object.entries({tenant_id:id(11),client_id:id(12),site_id:id(13),id:id(14),request_id:id(15),expected_version:'0',payload:JSON.stringify(p)}))f.append(k,v);return f;}
function invalid(fn){const l=layout();fn(l);assert.equal(validateLayout(l).ok,false);}

test('100 + 50 + unknown yields 150 known floor m² and one pending; glass and reference area remain separate',()=>{
 const l=layout();l.zones[0].floor_area=measured(100);l.zones[1].floor_area=measured(50);l.zones[2].floor_area={state:'unknown',value:null,source:'',note:'Return when area is available'};l.zones[0].glass_area=measured(20);l.gross_floor_area=measured(200,'plan');
 const s=summarizeLayout(l);assert.equal(s.knownFloorArea,150);assert.equal(s.pendingFloorZones,1);assert.equal(s.glassArea,20);assert.equal(validateLayout(l).ok,true);
});
test('included, excluded and undecided floor areas are disjoint',()=>{
 const l=layout();l.zones.forEach((z,i)=>{z.floor_area=measured([100,50,20][i]);z.service_scope=['included','excluded','undecided'][i];});l.zones[1].exclusion_reason='Tenant maintains own office';
 const s=summarizeLayout(l);assert.deepEqual([s.knownFloorArea,s.includedFloorArea,s.excludedFloorArea,s.undecidedFloorArea,s.pendingScopeZones],[170,100,50,20,1]);assert.equal(validateLayout(l).ok,true);
});
test('zero, unrecorded, unknown and not-applicable remain distinct',()=>{
 const l=layout();l.zones[0].floor_area=measured(0);l.zones[1].floor_area={state:'not_applicable',value:null,source:'',note:'Vertical feature only'};
 const r=validateLayout(l);assert.equal(r.ok,true);assert.equal(r.data.zones[0].floor_area.value,0);assert.equal(r.data.zones[2].floor_area.value,null);const s=summarizeLayout(l);assert.equal(s.knownFloorArea,0);assert.equal(s.pendingFloorZones,1);assert.equal(s.naFloorZones,1);
});
test('decimal aggregation is exact and estimates stay visible',()=>{
 const l=layout();l.zones[0].floor_area=measured(0.1);l.zones[1].floor_area=measured(0.2,'estimated');assert.equal(summarizeLayout(l).knownFloorArea,0.3);assert.equal(summarizeLayout(l).estimatedFloorZones,1);
});
test('quantities enforce provenance, bounds, precision and integer fixture counts',()=>{
 for(const value of [-1,10000000.01,NaN,Infinity,'12',null,1.001])invalid(l=>l.zones[0].floor_area=measured(value));
 for(const source of ['', 'observed','AI'])invalid(l=>l.zones[0].floor_area=measured(2,source));
 invalid(l=>{l.zones[0].fixture_count=measured(1.5);l.zones[0].fixture_type='Washbasins';});invalid(l=>l.zones[0].fixture_count=measured(0));
 const l=layout();l.zones[0].fixture_count=measured(0);l.zones[0].fixture_type='Washbasins';assert.equal(validateLayout(l).ok,true);for(const value of [0,1.01,10000000]){l.zones[0].floor_area=measured(value);assert.equal(validateLayout(l).ok,true);}
});
test('measurement states cannot hide old values or lack reasons',()=>{
 for(const state of ['unknown','not_applicable'])for(const patch of [{note:''},{value:0},{source:'client'}])invalid(l=>l.zones[0].glass_area={state,value:null,source:'',note:'Check on return',...patch});
 for(const patch of [{value:0},{source:'plan'},{note:'Old note'}])invalid(l=>l.zones[0].floor_area={...emptyMeasurement(),...patch});
});
test('new visits reuse structural identities and labels with no observations or confirmations',()=>{
 const inventory={version:5,structure:{floors:[{id:id(1),name:'Ground floor',reference:'G',level:'0'}],zones:[{id:id(2),floor_id:id(1),name:'Reception',reference:'R',kind:'reception'}]}};
 const l=emptyLayout(inventory);assert.equal(l.inventory_version,5);assert.equal(l.zones[0].id,id(2));assert.equal(l.zones[0].reference,'R');assert.equal(l.zones[0].service_scope,'undecided');assert.equal(l.zones[0].condition,'unknown');assert.deepEqual(l.zones[0].floor_area,emptyMeasurement());l.floors[0].name='Changed';assert.equal(inventory.structure.floors[0].name,'Ground floor');
});
test('explicit reconciliation preserves retained observations, adopts labels and resets new zones',()=>{
 const l=layout();l.zones[0].floor_area=measured(100);l.zones[0].notes='Keep me';l.gross_floor_area=measured(180,'plan');
 const inventory={version:4,structure:{floors:[{...l.floors[0],name:'Ground'}],zones:[{id:id(2),floor_id:id(1),name:'Main reception',reference:'R',kind:'reception'},{id:id(5),floor_id:id(1),name:'Lobby',reference:'L',kind:'corridor'}]}};
 const r=reconcileLayout(l,inventory);assert.equal(r.inventory_version,4);assert.equal(r.zones.length,2);assert.equal(r.zones[0].name,'Main reception');assert.equal(r.zones[0].floor_area.value,100);assert.equal(r.zones[0].notes,'Keep me');assert.equal(r.zones[1].floor_area.value,null);assert.equal(r.gross_floor_area.value,180);r.zones[0].floor_area.value=99;assert.equal(l.zones[0].floor_area.value,100);assert.equal(l.zones.length,3);
});
test('duplicating zone structure clears measurements, scope and contextual notes',()=>{
 const original=layout().zones[0];original.floor_area=measured(12);original.material='Carpet';original.service_scope='included';original.notes='Private note';
 const copy=emptyZone(id(100),original.floor_id,`${original.name} copy`,original.kind);assert.notEqual(copy.id,original.id);assert.equal(copy.name,'Reception copy');assert.equal(copy.floor_area.value,null);assert.equal(copy.material,'');assert.equal(copy.service_scope,'undecided');assert.equal(copy.notes,'');
});
test('validation rejects orphaned zones, duplicate identities, cross-type collisions and injected fields',()=>{
 for(const fn of [l=>l.zones[0].floor_id=id(90),l=>l.zones[1].id=l.zones[0].id,l=>l.zones[0].id=l.floors[0].id,l=>l.floors[0].id='bad',l=>l.tenant_id=id(20),l=>l.zones[0].approved=true,l=>l.floors[0].area=200,l=>l.zones[0].floor_area.unit='ft2',l=>delete l.zones[0].material])invalid(fn);
});
test('Unicode normalization, name bounds, codes and exclusion reasons are validated',()=>{
 const l=layout();l.floors[0].name='\u00a0Ground floor\ufeff';l.zones[0].name='😀'.repeat(100);l.zones[0].access='Ring bell\n\tAsk reception';const r=validateLayout(l);assert.equal(r.ok,true);assert.equal(r.data.floors[0].name,'Ground floor');
 for(const fn of [l=>l.floors[0].name=' ',l=>l.zones[0].name='😀'.repeat(101),l=>l.zones[0].name='Bad\nName',l=>l.zones[0].notes='Bad\u0000Note',l=>l.zones[0].condition='excellent',l=>l.zones[0].service_scope='excluded',l=>l.zones[0].kind='invented'])invalid(fn);
});
test('per-building bounds and version ranges are enforced; empty structures remain drafts',()=>{
 assert.equal(validateLayout(emptyLayout()).ok,true);assert.equal(summarizeLayout(emptyLayout()).zoneCount,0);invalid(l=>l.floors=Array.from({length:51},(_,i)=>({id:id(100+i),name:'Floor',reference:'',level:''})));invalid(l=>l.zones=Array.from({length:301},(_,i)=>emptyZone(id(100+i),id(1),'Office')));
 for(const v of [-1,1.1,Number.MAX_SAFE_INTEGER,'1',null])invalid(l=>l.inventory_version=v);const l=layout();l.floors.push({id:id(6),name:'First floor',reference:'',level:'1'});assert.equal(summarizeLayout(l).emptyFloorCount,1);
});
test('legacy payloads and layouts coexist; absent is not null and unknown schemas are rejected',()=>{
 assert.equal(validateVisitPayload(visit()).ok,true);assert.equal('layout' in validateVisitPayload(visit()).data,false);assert.equal(validateVisitPayload(visit(layout())).ok,true);assert.equal(validateSiteVisitForm(form(visit(layout()))).ok,true);for(const v of [null,{},[],{...layout(),schema_version:2}])assert.equal(validateVisitPayload({...visit(),layout:v}).ok,false);
});
test('UTF-8 payload bounds reject large multibyte and ASCII drafts with useful feedback',()=>{
 for(const notes of ['😀'.repeat(130000),'x'.repeat(MAX_VISIT_PAYLOAD_BYTES)]){const p=visit(layout());p.notes=notes;assert.ok(new TextEncoder().encode(JSON.stringify(p)).length>MAX_VISIT_PAYLOAD_BYTES);const r=validateSiteVisitForm(form(p));assert.equal(r.ok,false);assert.match(r.state.error,/large|512|Shorten/i);assert.equal(validateVisitPayload(p).ok,false);}
});
test('invalid live numeric entries are not turned into believable partial totals',()=>{
 for(const value of [-1,NaN,Infinity,1.001,10000001,null]){const l=layout();l.zones[0].floor_area=measured(value);assert.equal(summarizeLayout(l).knownFloorArea,0);assert.equal(summarizeLayout(l).pendingFloorZones,3);}
});
