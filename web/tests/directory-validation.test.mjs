import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDirectoryForm } from '../lib/directory/validation.ts';

const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
function form(kind='client', overrides={}) {
  const data = {
    kind, tenant_id: ids[0], id: ids[1], request_id: ids[2], expected_version: '0',
    reference: '', notes: '', status: 'active',
    ...(kind==='client' ? {legal_name:'Rivermere Estates'} : {name:'Alder House',client_company_id:ids[2]}),
    ...(kind!=='portfolio' ? {address:'12 Example Road, London',contact_name:'',contact_email:'',contact_phone:'',contact_role:''} : {}),
    ...(kind==='site' ? {timezone:'Europe/London',building_type:'office'} : {}),
    ...overrides,
  };
  const f = new FormData();
  for (const [key,value] of Object.entries(data)) f.append(key,value);
  return f;
}

test('client normalizes Unicode whitespace and preserves multiline notes', () => {
  const result = validateDirectoryForm(form('client',{legal_name:'\u00a0Rivermere Estates\ufeff',notes:'Floor 1\nFloor 2\tAccess'}));
  assert.equal(result.ok,true);
  assert.equal(result.value.data.legal_name,'Rivermere Estates');
  assert.equal(result.value.data.notes,'Floor 1\nFloor 2\tAccess');
});
test('rejects invalid, missing and duplicate identity/version fields', () => {
  for (const [key,value] of [['tenant_id','wrong'],['id',''],['request_id','no'],['expected_version','-1'],['expected_version','1.2'],['expected_version','9007199254740992'],['kind','membership']]) {
    assert.equal(validateDirectoryForm(form('client',{[key]:value})).ok,false);
  }
  const duplicate = form(); duplicate.append('id',ids[2]);
  assert.equal(validateDirectoryForm(duplicate).ok,false);
  const missing = form(); missing.delete('request_id');
  assert.equal(validateDirectoryForm(missing).ok,false);
});
test('enforces codepoint lengths and single/multiline control boundaries', () => {
  assert.equal(validateDirectoryForm(form('client',{legal_name:'😀'.repeat(160)})).ok,true);
  for (const legal_name of ['A','😀'.repeat(161),'A\nB','A\u007fB']) assert.equal(validateDirectoryForm(form('client',{legal_name})).ok,false);
  assert.equal(validateDirectoryForm(form('client',{notes:'A\u0000B'})).ok,false);
  assert.equal(validateDirectoryForm(form('client',{address:'A\u000bB'})).ok,false);
});
test('requires contact name when contact details are supplied and validates email', () => {
  assert.equal(validateDirectoryForm(form('client',{contact_email:'person@example.com'})).ok,false);
  assert.equal(validateDirectoryForm(form('client',{contact_name:'A Person',contact_email:'wrong'})).ok,false);
  assert.equal(validateDirectoryForm(form('client',{contact_name:'A Person',contact_email:'person@example.com',contact_phone:'+44 (0)20 0000 0000'})).ok,true);
});
test('validates required building address, client, type and time zone', () => {
  assert.equal(validateDirectoryForm(form('site')).ok,true);
  for (const overrides of [{address:''},{client_company_id:'other'},{building_type:'unknown'},{timezone:'Europe/Fake'},{status:'deleted'}]) {
    assert.equal(validateDirectoryForm(form('site',overrides)).ok,false);
  }
});
test('portfolio accepts more than fifteen selected buildings and an empty selection', () => {
  const f = form('portfolio');
  assert.equal(validateDirectoryForm(f).ok,true);
  for (let n=1;n<=25;n++) f.append('site_ids',`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
  const result = validateDirectoryForm(f);
  assert.equal(result.ok,true);
  assert.equal(result.value.data.site_ids.length,25);
});
test('rejects duplicate, malformed and overlarge portfolio selections', () => {
  const duplicate = form('portfolio'); duplicate.append('site_ids',ids[0]); duplicate.append('site_ids',ids[0]);
  assert.equal(validateDirectoryForm(duplicate).ok,false);
  const invalid = form('portfolio'); invalid.append('site_ids','wrong');
  assert.equal(validateDirectoryForm(invalid).ok,false);
  const large = form('portfolio');
  for (let n=0;n<5001;n++) large.append('site_ids',`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
  assert.equal(validateDirectoryForm(large).ok,false);
});
test('never forwards injected ownership/role fields or image pointers', () => {
  const result=validateDirectoryForm(form('client',{created_by:ids[2],role_codes:'owner',image_asset_id:ids[2]}));
  assert.equal(result.ok,true);
  assert.equal('created_by' in result.value.data,false);
  assert.equal('role_codes' in result.value.data,false);
  assert.equal('image_asset_id' in result.value.data,false);
});
test('duplicate business fields and file values cannot bypass validation', () => {
  const duplicate=form(); duplicate.append('legal_name','Other Company');
  assert.equal(validateDirectoryForm(duplicate).ok,false);
  const binary=form(); binary.set('contact_name',new Blob(['contact']),'name.txt');
  assert.equal(validateDirectoryForm(binary).ok,false);
});

test('UUID case canonicalization keeps response IDs and duplicate selections consistent', () => {
  const upper='AAAAAAAA-0000-4000-8000-000000000001';
  const result=validateDirectoryForm(form('site',{id:upper,client_company_id:upper}));
  assert.equal(result.ok,true);
  assert.equal(result.value.id,upper.toLowerCase());
  assert.equal(result.value.data.client_company_id,upper.toLowerCase());
  const duplicate=form('portfolio'); duplicate.append('site_ids',upper); duplicate.append('site_ids',upper.toLowerCase());
  assert.equal(validateDirectoryForm(duplicate).ok,false);
});
