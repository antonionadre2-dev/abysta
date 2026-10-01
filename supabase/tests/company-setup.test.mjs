/**
 * SQL acceptance tests against the actual migration in disposable PostgreSQL
 * (PGlite). No Supabase URL, key, network connection, or production data is used.
 * Run from web: node --test ../supabase/tests/company-setup.test.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const request = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('Company setup migration: security and transactional acceptance', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Minimal Supabase Auth shim; the application migration itself is unmodified.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(await readFile(new URL('../migrations/20261002000100_company_setup.sql', import.meta.url), 'utf8'));
  for (let n = 1; n <= 12; n += 1) {
    await db.query('insert into auth.users values ($1, $2)', [uid(n), n === 6 ? null : '2026-10-01T00:00:00Z']);
  }

  async function asActor(actor, callback, role = 'authenticated') {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [actor ?? '']);
      const value = await callback();
      await db.exec('commit');
      return value;
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }
  const create = (actor, name, currency = 'GBP', timezone = 'Europe/London', key = request(1)) =>
    asActor(actor, async () => (await db.query(
      'select public.create_operator_tenant($1,$2,$3,$4) as id', [name, currency, timezone, key],
    )).rows[0].id);
  const rowsAs = (actor, sql, params = [], role = 'authenticated') =>
    asActor(actor, async () => (await db.query(sql, params)).rows, role);
  const fails = (action, code, message) => assert.rejects(action, (error) => {
    assert.equal(error.code, code);
    if (message) assert.equal(error.message, message);
    return true;
  });

  await t.test('anonymous callers cannot execute onboarding', async () => {
    await fails(() => rowsAs(null, 'select public.create_operator_tenant($1,$2,$3,$4)', ['Anonymous Co', 'GBP', 'UTC', request(1)], 'anon'), '42501');
  });
  await t.test('authenticated role without a user cannot create a company', async () => {
    await fails(() => create(null, 'No Actor'), '28000', 'AUTH_REQUIRED');
  });
  await t.test('a signed-in but unverified user cannot create a company', async () => {
    await fails(() => create(uid(6), 'Unverified Co'), '28000', 'EMAIL_NOT_VERIFIED');
  });
  await t.test('a non-existent auth user cannot create a company', async () => {
    await fails(() => create(uid(99), 'Absent User Co'), '28000', 'EMAIL_NOT_VERIFIED');
  });
  await t.test('empty, whitespace, too-short, overlong and control-character names fail', async () => {
    for (const name of [null, '', '  ', '\u00a0\u2003\ufeff', 'A', 'a'.repeat(121), 'A\nB', 'A\tB', 'A\u007fB']) {
      await fails(() => create(uid(11), name), '22023', 'INVALID_COMPANY_NAME');
    }
  });
  await t.test('currency input must be an explicitly supported uppercase code', async () => {
    for (const currency of [null, '', 'gbp', ' GBP', 'ABC']) {
      await fails(() => create(uid(11), 'Valid Name', currency), '22023', 'INVALID_CURRENCY');
    }
  });
  await t.test('an unknown or empty time zone is rejected by the database', async () => {
    for (const timezone of [null, '', 'Europe/Fake', 'Europe/London ']) {
      await fails(() => create(uid(11), 'Valid Name', 'GBP', timezone), '22023', 'INVALID_TIMEZONE');
    }
  });
  await t.test('missing and malformed request identifiers cannot create rows', async () => {
    await fails(() => create(uid(11), 'Valid Name', 'GBP', 'UTC', null), '22023', 'INVALID_REQUEST_ID');
    await fails(() => create(uid(11), 'Valid Name', 'GBP', 'UTC', 'not-a-uuid'), '22P02');
    assert.equal((await db.query('select count(*)::int as n from public.operator_tenant')).rows[0].n, 0);
  });

  let aliceId;
  let bobId;
  await t.test('confirmed user atomically receives a company and an active owner membership', async () => {
    aliceId = await create(uid(1), '\u00a0\u2003Abysta Demo\ufeff ', 'GBP', 'Europe/London', request(1));
    const companies = await rowsAs(uid(1), 'select * from public.operator_tenant');
    assert.equal(companies.length, 1);
    assert.equal(companies[0].name, 'Abysta Demo');
    assert.equal(companies[0].created_by, uid(1));
    assert.equal(companies[0].currency, 'GBP');
    assert.equal(companies[0].timezone, 'Europe/London');
    assert.equal(companies[0].status, 'active');
    assert.equal(Number(companies[0].row_version), 1);
    const memberships = await rowsAs(uid(1), 'select * from public.membership');
    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].tenant_id, aliceId);
    assert.equal(memberships[0].auth_user_id, uid(1));
    assert.equal(memberships[0].member_type, 'internal');
    assert.equal(memberships[0].status, 'active');
    assert.deepEqual(memberships[0].role_codes, ['owner']);
  });
  await t.test('retrying the same normalized request returns the same company without duplicates', async () => {
    assert.equal(await create(uid(1), 'Abysta Demo'), aliceId);
    assert.equal(await create(uid(1), '  Abysta Demo\n'), aliceId);
    assert.equal((await db.query('select count(*)::int as n from public.operator_tenant where created_by=$1', [uid(1)])).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from public.membership where auth_user_id=$1', [uid(1)])).rows[0].n, 1);
  });
  await t.test('the same request key cannot silently change any field', async () => {
    await fails(() => create(uid(1), 'Another Name'), '22023', 'REQUEST_KEY_REUSED');
    await fails(() => create(uid(1), 'Abysta Demo', 'CHF'), '22023', 'REQUEST_KEY_REUSED');
    await fails(() => create(uid(1), 'Abysta Demo', 'GBP', 'Europe/Zurich'), '22023', 'REQUEST_KEY_REUSED');
  });
  await t.test('a second onboarding key cannot duplicate an existing active workspace', async () => {
    await fails(() => create(uid(1), 'Second Company', 'GBP', 'UTC', request(2)), '42501', 'ABYSTA_ALREADY_HAS_WORKSPACE');
  });
  await t.test('the same request key is independent for another authenticated user', async () => {
    bobId = await create(uid(2), 'Other Operator', 'CHF', 'Europe/Zurich', request(1));
    assert.notEqual(bobId, aliceId);
  });
  await t.test('separate companies cannot read one another, even when the UUID is known', async () => {
    assert.deepEqual(await rowsAs(uid(1), 'select id from public.operator_tenant where id=$1', [bobId]), []);
    assert.deepEqual(await rowsAs(uid(2), 'select id from public.operator_tenant where id=$1', [aliceId]), []);
    assert.deepEqual(await rowsAs(uid(2), 'select id from public.membership where tenant_id=$1', [aliceId]), []);
    assert.deepEqual((await rowsAs(uid(1), 'select id from public.operator_tenant')).map((r) => r.id), [aliceId]);
  });
  await t.test('a user with no membership receives no companies or membership rows', async () => {
    assert.deepEqual(await rowsAs(uid(11), 'select id from public.operator_tenant'), []);
    assert.deepEqual(await rowsAs(uid(11), 'select id from public.membership'), []);
  });
  await t.test('anonymous callers cannot read either public table', async () => {
    await fails(() => rowsAs(null, 'select * from public.operator_tenant', [], 'anon'), '42501');
    await fails(() => rowsAs(null, 'select * from public.membership', [], 'anon'), '42501');
  });
  await t.test('a caller cannot directly create a company or choose its creator', async () => {
    await fails(() => rowsAs(uid(2), 'insert into public.operator_tenant(name,currency,timezone,created_by) values ($1,$2,$3,$4)', ['Injection Co', 'GBP', 'UTC', uid(1)]), '42501');
  });
  await t.test('a caller cannot insert themselves into another company', async () => {
    await fails(() => rowsAs(uid(2), "insert into public.membership(tenant_id,auth_user_id,member_type,role_codes) values ($1,$2,'internal',array['owner'])", [aliceId, uid(2)]), '42501');
  });
  await t.test('even an owner cannot directly update or delete company or membership rows', async () => {
    for (const sql of [
      "update public.operator_tenant set name='Changed' where id=$1",
      'delete from public.operator_tenant where id=$1',
      "update public.membership set role_codes=array['admin'] where tenant_id=$1",
      'delete from public.membership where tenant_id=$1',
    ]) await fails(() => rowsAs(uid(1), sql, [aliceId]), '42501');
  });
  await t.test('idempotency receipts cannot be read or changed by a company owner', async () => {
    await fails(() => rowsAs(uid(1), 'select * from abysta_private.company_setup_request'), '42501');
    await fails(() => rowsAs(uid(1), 'delete from abysta_private.company_setup_request'), '42501');
  });

  // Privileged fixture creation represents a future, separately authorised
  // invitation workflow. This is not an invitation API shipped by this change.
  for (const [n, type, status, roles] of [
    [3, 'internal', 'active', ['surveyor']],
    [4, 'internal', 'active', ['surveyor', 'admin']],
    [5, 'client', 'active', ['owner']],
    [7, 'internal', 'suspended', ['admin']],
    [8, 'internal', 'revoked', ['owner']],
    [10, 'internal', 'active', ['surveyor']],
  ]) {
    await db.query('insert into public.membership(tenant_id,auth_user_id,member_type,status,role_codes) values ($1,$2,$3,$4,$5)', [aliceId, uid(n), type, status, roles]);
  }
  await t.test('a basic active internal member reads company metadata and only their own membership', async () => {
    assert.equal((await rowsAs(uid(3), 'select id from public.operator_tenant')).length, 1);
    const memberships = await rowsAs(uid(3), 'select auth_user_id from public.membership');
    assert.deepEqual(memberships, [{ auth_user_id: uid(3) }]);
  });
  await t.test('a basic member cannot promote themselves to admin', async () => {
    await fails(() => rowsAs(uid(3), "update public.membership set role_codes=array['admin'] where auth_user_id=$1", [uid(3)]), '42501');
  });
  await t.test('active owner and multi-role admin may read their company roster', async () => {
    assert.equal((await rowsAs(uid(1), 'select id from public.membership')).length, 7);
    assert.equal((await rowsAs(uid(4), 'select id from public.membership')).length, 7);
    assert.deepEqual(await rowsAs(uid(4), 'select id from public.membership where tenant_id=$1', [bobId]), []);
  });
  await t.test('client membership cannot grant internal access even if its role says owner', async () => {
    assert.deepEqual(await rowsAs(uid(5), 'select id from public.operator_tenant'), []);
    assert.deepEqual(await rowsAs(uid(5), 'select id from public.membership'), []);
  });
  await t.test('suspended and revoked membership cannot read workspace data', async () => {
    for (const n of [7, 8]) {
      assert.deepEqual(await rowsAs(uid(n), 'select id from public.operator_tenant'), []);
      assert.deepEqual(await rowsAs(uid(n), 'select id from public.membership'), []);
    }
  });
  await t.test('an invited member cannot use first-onboarding to create another workspace', async () => {
    await fails(() => create(uid(10), 'Invited Person Co'), '42501', 'ABYSTA_ALREADY_HAS_WORKSPACE');
  });
  await t.test('the model supports membership in two separate companies', async () => {
    await db.query("insert into public.membership(tenant_id,auth_user_id,member_type,status,role_codes) values ($1,$2,'internal','active',array['surveyor'])", [bobId, uid(3)]);
    assert.equal((await rowsAs(uid(3), 'select id from public.operator_tenant')).length, 2);
    assert.equal((await rowsAs(uid(3), 'select id from public.membership')).length, 2);
  });
  await t.test('revocation takes effect on the next query without changing the same user identity', async () => {
    await db.query("update public.membership set status='revoked' where tenant_id=$1 and auth_user_id=$2", [aliceId, uid(1)]);
    assert.deepEqual(await rowsAs(uid(1), 'select id from public.operator_tenant'), []);
    assert.deepEqual(await rowsAs(uid(1), 'select id from public.membership'), []);
    await fails(() => create(uid(1), 'Abysta Demo'), '42501', 'COMPANY_ACCESS_REVOKED');
    await db.query("update public.membership set status='active' where tenant_id=$1 and auth_user_id=$2", [aliceId, uid(1)]);
  });
  await t.test('archiving a company hides its metadata and roster and blocks old request replay', async () => {
    await db.query("update public.operator_tenant set status='archived' where id=$1", [aliceId]);
    assert.deepEqual(await rowsAs(uid(1), 'select id from public.operator_tenant'), []);
    assert.deepEqual(await rowsAs(uid(4), 'select id from public.membership'), []);
    await fails(() => create(uid(1), 'Abysta Demo'), '42501', 'COMPANY_ACCESS_REVOKED');
    await db.query("update public.operator_tenant set status='active' where id=$1", [aliceId]);
  });
  await t.test('user deletion cannot silently orphan a company or membership', async () => {
    await fails(() => db.query('delete from auth.users where id=$1', [uid(1)]), '23001');
    await fails(() => db.query('delete from auth.users where id=$1', [uid(3)]), '23001');
  });
  await t.test('Unicode names are accepted and all JavaScript trim spaces are removed', async () => {
    const tenantId = await create(uid(9), '\u000b\u00a0\u2003\u{1F4BC}\u{1F3E2}\ufeff\u000b', 'EUR', 'Europe/Paris', request(9));
    const rows = await rowsAs(uid(9), 'select name from public.operator_tenant where id=$1', [tenantId]);
    assert.equal(rows[0].name, '\u{1F4BC}\u{1F3E2}');
  });
  await t.test('trimming must preserve initial and final lowercase v characters', async () => {
    for (const [n, name] of [[13, 'Av'], [14, 'vivid'], [15, 'v']]) {
      await db.query('insert into auth.users values ($1, $2)', [uid(n), '2026-10-01T00:00:00Z']);
      if (name === 'v') {
        await fails(() => create(uid(n), `\u000b ${name} \u000b`), '22023', 'INVALID_COMPANY_NAME');
      } else {
        const tenantId = await create(uid(n), `\u000b ${name} \u000b`);
        assert.equal((await rowsAs(uid(n), 'select name from public.operator_tenant where id=$1', [tenantId]))[0].name, name);
      }
    }
  });
  await t.test('failed owner creation rolls back both company and request receipt', async () => {
    await db.exec(`
      create function abysta_private.test_reject_owner() returns trigger language plpgsql as $$
      begin
        if new.auth_user_id = '${uid(12)}'::uuid then raise exception 'TEST_OWNER_FAILURE'; end if;
        return new;
      end;
      $$;
      create trigger test_reject_owner before insert on public.membership
      for each row execute function abysta_private.test_reject_owner();
    `);
    await fails(() => create(uid(12), 'Rollback Co'), 'P0001', 'TEST_OWNER_FAILURE');
    assert.equal((await db.query('select count(*)::int as n from public.operator_tenant where created_by=$1', [uid(12)])).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from abysta_private.company_setup_request where auth_user_id=$1', [uid(12)])).rows[0].n, 0);
    await db.exec('drop trigger test_reject_owner on public.membership; drop function abysta_private.test_reject_owner();');
    assert.ok(await create(uid(12), 'Rollback Co'));
  });
  await t.test('row version advances when a privileged maintenance change occurs', async () => {
    const before = (await db.query('select row_version from public.operator_tenant where id=$1', [bobId])).rows[0];
    await db.query("update public.operator_tenant set name='Updated Operator' where id=$1", [bobId]);
    const after = (await db.query('select row_version,updated_at,created_at from public.operator_tenant where id=$1', [bobId])).rows[0];
    assert.equal(Number(after.row_version), Number(before.row_version) + 1);
    assert.ok(new Date(after.updated_at) >= new Date(after.created_at));
  });
  await t.test('a private helper reports only the caller’s current authority', async () => {
    assert.equal((await rowsAs(uid(2), 'select abysta_private.is_active_company_admin($1) as allowed', [aliceId]))[0].allowed, false);
    assert.equal((await rowsAs(uid(3), 'select abysta_private.is_active_company_admin($1) as allowed', [aliceId]))[0].allowed, false);
    assert.equal((await rowsAs(uid(4), 'select abysta_private.is_active_company_admin($1) as allowed', [aliceId]))[0].allowed, true);
  });
});
