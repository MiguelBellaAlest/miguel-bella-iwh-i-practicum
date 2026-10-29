const { test } = require('node:test');
const assert = require('node:assert/strict');
const { schema, setEnvValue, ensureSchema, verifyExistingSchema, SCHEMAS_PATH } = require('../scripts/setup-custom-object');

test('setup: creates schema only when absent', async () => {
  const calls = [];
  const result = await ensureSchema({
    get: async route => { assert.equal(route, SCHEMAS_PATH); return { data: { results: [] } }; },
    post: async (route, body) => { calls.push({ route, body }); return { data: { ...body, objectTypeId: '2-123456' } }; }
  });
  assert.equal(result.created, true);
  assert.equal(result.object.objectTypeId, '2-123456');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, schema);
  assert.equal(calls[0].route, '/crm-object-schemas/v3/schemas');
});

test('setup: reuses compatible schema without extra remote writes', async () => {
  const existing = { ...schema, objectTypeId: '2-123456' };
  const result = await ensureSchema({
    get: async () => ({ data: { results: [existing] } }),
    post: async () => { throw new Error('must not write'); }
  });
  assert.equal(result.created, false);
  assert.equal(result.object, existing);
});

test('setup: refuses incompatible existing object', async () => {
  await assert.rejects(() => ensureSchema({
    get: async () => ({ data: { results: [{ ...schema, properties: [] }] } }),
    post: async () => { throw new Error('must not write'); }
  }), /incompatível/);
  assert.throws(() => verifyExistingSchema({ ...schema, primaryDisplayProperty: 'other' }), /display property/);
});

test('setup: refuses unexpected listing response instead of creating blindly', async () => {
  await assert.rejects(() => ensureSchema({
    get: async () => ({ data: {} }),
    post: async () => { throw new Error('must not write'); }
  }), /inesperada/);
});

test('setup: all three display properties are text and required', () => {
  assert.deepEqual(schema.requiredProperties, ['name', 'author', 'genre']);
  assert.equal(schema.primaryDisplayProperty, 'name');
  assert.equal(schema.properties[0].label, 'Name');
  assert.deepEqual(schema.associatedObjects, ['CONTACT']);
  for (const property of schema.properties) {
    assert.equal(property.type, 'string');
    assert.equal(property.fieldType, 'text');
  }
});

test('setup: updates only object ID env line, preserving token and comments', () => {
  const env = '# comment\nHUBSPOT_PRIVATE_APP_TOKEN=fake-test-only\nHUBSPOT_OBJECT_TYPE_ID=\nPORT=3000\n';
  const next = setEnvValue(env, 'HUBSPOT_OBJECT_TYPE_ID', '2-123456');
  assert.match(next, /^HUBSPOT_OBJECT_TYPE_ID=2-123456$/m);
  assert.match(next, /HUBSPOT_PRIVATE_APP_TOKEN=fake-test-only/);
  assert.match(next, /^# comment/m);
  assert.match(setEnvValue('PORT=3000\n', 'HUBSPOT_OBJECT_TYPE_ID', '2-7'), /HUBSPOT_OBJECT_TYPE_ID=2-7\n$/);
});
