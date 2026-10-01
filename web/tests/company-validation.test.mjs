import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCompanyForm } from "../lib/company/validation.ts";

function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    name: "Northline Facilities",
    currency: "GBP",
    timezone: "Europe/London",
    requestId: "153985f5-68f7-4a1c-84d8-7608e182e809",
    ...overrides,
  })) data.append(key, value);
  return data;
}

test("supports UK and international company names without altering internal spacing", () => {
  const result = validateCompanyForm(form({ name: "\u00a0Kraken  Gebäudereinigung\u00a0", currency: "CHF", timezone: "Europe/Zurich" }));
  assert.equal(result.ok, true);
  assert.equal(result.values.name, "Kraken  Gebäudereinigung");
});

test("rejects empty, oversized and multiline company names", () => {
  for (const name of ["   ", "A", "a".repeat(121), "Acme\nFacilities", "Acme\tFacilities", "Acme\u0000Ltd"]) {
    const result = validateCompanyForm(form({ name }));
    assert.equal(result.ok, false);
    assert.ok(result.state.fieldErrors.name);
  }
});

test("counts non-BMP characters as characters rather than UTF-16 units", () => {
  assert.equal(validateCompanyForm(form({ name: "🌊".repeat(120) })).ok, true);
  assert.equal(validateCompanyForm(form({ name: "🌊".repeat(121) })).ok, false);
});

test("rejects unrecognised currency and time zone before database mutation", () => {
  for (const currency of ["", "gbp", "XYZ", "GBP;DROP TABLE membership"]) {
    assert.equal(validateCompanyForm(form({ currency })).ok, false);
  }
  for (const timezone of ["", "Europe/NotAPlace", "x".repeat(129)]) {
    assert.equal(validateCompanyForm(form({ timezone })).ok, false);
  }
});

test("rejects missing, malformed and duplicate request tokens", () => {
  assert.equal(validateCompanyForm(form({ requestId: "" })).ok, false);
  assert.equal(validateCompanyForm(form({ requestId: "not-a-uuid" })).ok, false);
  const duplicate = form();
  duplicate.append("requestId", "153985f5-68f7-4a1c-84d8-7608e182e809");
  assert.equal(validateCompanyForm(duplicate).ok, false);
});

test("never accepts actor, tenant or role supplied by the browser", () => {
  const result = validateCompanyForm(form({ auth_user_id: "attacker", tenant_id: "victim", role_codes: "owner" }));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.values).sort(), ["currency", "name", "requestId", "timezone"]);
});

test("retains request token and entered values when a field fails", () => {
  const result = validateCompanyForm(form({ currency: "XYZ" }));
  assert.equal(result.ok, false);
  assert.equal(result.state.values.name, "Northline Facilities");
  assert.equal(result.state.values.requestId, "153985f5-68f7-4a1c-84d8-7608e182e809");
});
