import assert from 'node:assert/strict';
import test from 'node:test';
import {validateSiteVisitForm,validateVisitPayload} from '../lib/site-visits/validation.ts';
import {emptyAnswers,visitTemplate,visitProgress} from '../lib/site-visits/questionnaire.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function payload(overrides={}) {return {title:'Initial site visit',reference:'',visit_date:'',lead_name:'',contact_name:'',contact_role:'',contact_email:'',contact_phone:'',notes:'',status:'draft',template_key:'office-cleaning-v1',answers:emptyAnswers(),...overrides};}
function form(data=payload(),overrides={}) {const f=new FormData();for(const[k,v]of Object.entries({tenant_id:id(1),client_id:id(2),site_id:id(3),id:id(4),request_id:id(5),expected_version:'0',payload:JSON.stringify(data),...overrides}))f.append(k,v);return f;}
const answered=(value,source='observed')=>({state:'answered',value,source,note:''});
const withAnswer=(question,answer)=>{const p=payload();p.answers[question]=answer;return p;};

test('a partial draft can be saved without fabricating answers or a visit date',()=>{
 const r=validateSiteVisitForm(form());assert.equal(r.ok,true);assert.equal(r.value.data.visit_date,'');assert.equal(r.value.data.answers.typical_occupancy.value,null);assert.equal(visitProgress(r.value.data.answers).complete,0);
});
test('false and measured zero remain answers while unknown remains null',()=>{
 const p=payload();p.answers.water_available=answered(false);p.answers.typical_occupancy=answered(0,'measured');p.answers.power_available={state:'unknown',value:null,source:'',note:'Confirm on return visit'};
 const r=validateVisitPayload(p);assert.equal(r.ok,true);assert.equal(r.data.answers.water_available.value,false);assert.equal(r.data.answers.typical_occupancy.value,0);assert.equal(r.data.answers.power_available.value,null);assert.equal(visitProgress(r.data.answers).pending.some(q=>q.id==='power_available'),true);
});
test('unknown and not applicable require context and never retain a hidden value',()=>{
 for(const answer of [{state:'unknown',value:null,source:'',note:''},{state:'unknown',value:0,source:'',note:'Confirm'},{state:'unknown',value:null,source:'observed',note:'Confirm'},{state:'not_applicable',value:null,source:'',note:''}])assert.equal(validateVisitPayload(withAnswer('unvisited_areas',answer)).ok,false);
 assert.equal(validateVisitPayload(withAnswer('unvisited_areas',{state:'not_applicable',value:null,source:'',note:'All areas inspected'})).ok,true);
 assert.equal(validateVisitPayload(withAnswer('client_objectives',{state:'not_applicable',value:null,source:'',note:'No reason'})).ok,false);
});
test('unanswered state cannot hide stale text or a source',()=>{
 for(const patch of [{value:'Old data'},{source:'client'},{note:'Old note'}])assert.equal(validateVisitPayload(withAnswer('current_issues',{state:'unanswered',value:null,source:'',note:'',...patch})).ok,false);
});
test('typed numbers, Boolean values, enum choices and source codes are validated',()=>{
 for(const value of ['3',1.5,-1,8,null])assert.equal(validateVisitPayload(withAnswer('service_days',answered(value))).ok,false);
 for(const value of ['false',0,null])assert.equal(validateVisitPayload(withAnswer('water_available',answered(value))).ok,false);
 assert.equal(validateVisitPayload(withAnswer('service_type',answered('hourly'))).ok,false);
 assert.equal(validateVisitPayload(withAnswer('client_objectives',answered('Improve consistency','AI'))).ok,false);
 assert.equal(validateVisitPayload(withAnswer('service_days',answered(7,'client'))).ok,true);
});
test('JSON shape and key allowlists prevent ownership, snapshot and template injection',()=>{
 for(const p of [null,[],payload({created_by:id(99)}),payload({site_snapshot:{name:'Fake'}}),payload({template_key:'custom'}),payload({answers:{}})])assert.equal(validateVisitPayload(p).ok,false);
 const p=payload();p.answers.invented=answered('bad');assert.equal(validateVisitPayload(p).ok,false);
 const p2=payload();p2.answers.current_issues={...answered('poor cleaning'),approved:true};assert.equal(validateVisitPayload(p2).ok,false);
 const p3=payload();delete p3.notes;assert.equal(validateVisitPayload(p3).ok,false);
});
test('dates reject impossible calendar values and accept leap dates and unset drafts',()=>{
 for(const visit_date of ['2026-02-29','2026-04-31','2026-13-01','1899-12-31','2101-01-01','02/10/2026'])assert.equal(validateVisitPayload(payload({visit_date})).ok,false);
 for(const visit_date of ['2024-02-29','2026-10-02',''])assert.equal(validateVisitPayload(payload({visit_date})).ok,true);
});
test('text normalization is Unicode aware and preserves valid multiline observations',()=>{
 const p=payload({title:'\u00a0 Visit A \ufeff',notes:'First floor\n\tNo access',lead_name:'😀'.repeat(160)});p.answers.current_issues=answered('  Line A\nLine B  ');
 const r=validateVisitPayload(p);assert.equal(r.ok,true);assert.equal(r.data.title,'Visit A');assert.equal(r.data.answers.current_issues.value,'Line A\nLine B');
 for(const patch of [{lead_name:'😀'.repeat(161)},{title:'A\nB'},{notes:'text\u0000'},{notes:'x'.repeat(4001)}])assert.equal(validateVisitPayload(payload(patch)).ok,false);
});
test('contact validation requires a named contact and a valid email when provided',()=>{
 assert.equal(validateVisitPayload(payload({contact_phone:'0123'})).ok,false);assert.equal(validateVisitPayload(payload({contact_name:'Alex',contact_email:'not-mail'})).ok,false);assert.equal(validateVisitPayload(payload({contact_name:'Alex',contact_email:'alex@example.test'})).ok,true);
});
test('duplicate/missing/file identity fields, unsafe versions and invalid payloads fail before RPC',()=>{
 for(const override of [{site_id:'not-uuid'},{expected_version:'-1'},{expected_version:'01'},{expected_version:'1.5'},{expected_version:'9007199254740991'},{expected_version:'9007199254740992'},{payload:'{bad'},{payload:'x'.repeat(131073)}])assert.equal(validateSiteVisitForm(form(payload(),override)).ok,false);
 const duplicate=form();duplicate.append('request_id',id(6));assert.equal(validateSiteVisitForm(duplicate).ok,false);
 const missing=form();missing.delete('payload');assert.equal(validateSiteVisitForm(missing).ok,false);
 const binary=form();binary.set('payload',new Blob(['data']));assert.equal(validateSiteVisitForm(binary).ok,false);
});
test('request identity is canonicalized and unexpected outer fields never reach the payload',()=>{
 const f=form(payload(),{tenant_id:'AAAAAAAA-0000-4000-8000-000000000001',role:'owner',actor:id(99)});const r=validateSiteVisitForm(f);assert.equal(r.ok,true);assert.equal(r.value.tenantId,'aaaaaaaa-0000-4000-8000-000000000001');assert.equal('actor' in r.value.data,false);
});
test('progress never marks a blank answered field or invalid NA as complete',()=>{
 const p=payload();p.answers.client_objectives=answered('');p.answers.water_available=answered(null);p.answers.access_arrangements={state:'not_applicable',value:null,source:'',note:'No'};
 assert.equal(visitProgress(p.answers).complete,0);
 p.answers.client_objectives=answered('A consistent service');p.answers.water_available=answered(false);assert.equal(visitProgress(p.answers).complete,2);
});
test('all questionnaire sections and IDs are stable and referenced consistently',()=>{
 assert.equal(visitTemplate.questions.length,16);assert.equal(new Set(visitTemplate.questions.map(q=>q.id)).size,16);assert.ok(visitTemplate.questions.every(q=>visitTemplate.sections.some(s=>s.id===q.section)));
});

test('paginated lists restart after concurrent edits instead of omitting or duplicating visits',async()=>{
 const {collectVisitPages}=await import('../lib/site-visits/pagination.ts');let calls=0;
 const result=await collectVisitPages(async(offset)=>{
  calls++;
  if(calls===1)return {records:[{id:'old-first'}],total:2,snapshot_token:'2:2'};
  if(calls===2)return {records:[{id:'old-first'}],total:2,snapshot_token:'2:3'};
  return offset===0?{records:[{id:'edited-first'}],total:2,snapshot_token:'2:3'}:{records:[{id:'old-first'}],total:2,snapshot_token:'2:3'};
 });
 assert.deepEqual(result.map(r=>r.id),['edited-first','old-first']);assert.equal(calls,4);
});
test('pagination refuses persistently changing or inconsistent responses with a bounded retry',async()=>{
 const {collectVisitPages}=await import('../lib/site-visits/pagination.ts');let calls=0;
 await assert.rejects(()=>collectVisitPages(async()=>({records:[{id:'same'}],total:2,snapshot_token:`2:${++calls}`})),/changed while loading/);assert.equal(calls,6);
 await assert.rejects(()=>collectVisitPages(async()=>({records:[],total:1,snapshot_token:'1:1'})),/changed while loading/);
});
