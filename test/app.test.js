const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createClient, validateConfig, formData } = require('../index');

async function serve(t, overrides = {}) {
  const calls = [];
  const logs = [];
  const client = {};
  for (const method of ['get', 'post', 'patch']) {
    client[method] = async (...args) => {
      calls.push({ method, args });
      if (overrides[method]) return overrides[method](...args);
      if (method === 'get') return { data: { results: [] } };
      return { data: { id: '42' } };
    };
  }
  const app = createApp({ client, objectType: '2-123456', logger: { error: (...args) => logs.push(args) } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, logs };
}
function submit(url, fields, headers = {}) {
  return fetch(`${url}/update-cobj`, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams(fields), headers
  });
}
const book = { name: 'Dom Casmurro', author: 'Machado de Assis', genre: 'Romance' };

test('homepage: empty state and add link', async t => {
  const { url, calls } = await serve(t);
  const res = await fetch(url);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Nenhum livro cadastrado/);
  assert.match(html, /Add to this table/);
  assert.match(html, /Custom Objects \| Integrating With HubSpot I Practicum/);
  assert.equal(calls[0].args[0], '/crm/v3/objects/2-123456');
  assert.equal(calls[0].args[1].params.properties, 'name,author,genre');
});

test('homepage: shows all columns, record edit link and escaped HTML', async t => {
  const { url } = await serve(t, { get: async () => ({ data: { results: [{ id: '42', properties: { ...book, name: '<script>alert(1)</script>' } }] } }) });
  const html = await (await fetch(url)).text();
  assert.match(html, /Machado de Assis/);
  assert.match(html, /Romance/);
  assert.match(html, /update-cobj\?id=42/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('homepage: forwards pagination cursor and offers next page', async t => {
  const { url, calls } = await serve(t, { get: async () => ({ data: { results: [], paging: { next: { after: '200' } } } }) });
  const html = await (await fetch(`${url}/?after=100`)).text();
  assert.equal(calls[0].args[1].params.after, '100');
  assert.match(html, /\/?after=200|after=200/);
});

test('homepage: invalid cursor rejected before API', async t => {
  const { url, calls } = await serve(t);
  assert.equal((await fetch(`${url}/?after=not-a-cursor`)).status, 400);
  assert.equal(calls.length, 0);
});

test('form: correct title, POST action, labels and three required fields', async t => {
  const { url, calls } = await serve(t);
  const html = await (await fetch(`${url}/update-cobj`)).text();
  assert.match(html, /Update Custom Object Form \| Integrating With HubSpot I Practicum/);
  assert.match(html, /method="POST" action="\/update-cobj"/);
  for (const field of ['name', 'author', 'genre']) assert.match(html, new RegExp(`name="${field}"`));
  assert.equal((html.match(/ required/g) || []).length, 3);
  assert.match(html, /Return to the homepage/);
  assert.equal(calls.length, 0);
});

test('create: trims values, ignores unrelated fields and redirects home', async t => {
  const { url, calls } = await serve(t);
  const res = await submit(url, { ...book, name: '  Dom Casmurro  ', unexpected: 'ignore' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/');
  assert.deepEqual(calls, [{ method: 'post', args: ['/crm/v3/objects/2-123456', { properties: book }] }]);
});

test('edit: preloads a record by numeric ID', async t => {
  const { url, calls } = await serve(t, { get: async () => ({ data: { id: '42', properties: book } }) });
  const html = await (await fetch(`${url}/update-cobj?id=42`)).text();
  assert.match(html, /Editar livro/);
  assert.match(html, /value="Dom Casmurro"/);
  assert.match(html, /name="recordId" value="42"/);
  assert.equal(calls[0].args[0], '/crm/v3/objects/2-123456/42');
});

test('edit: PATCH updates without POST duplicate', async t => {
  const { url, calls } = await serve(t);
  const res = await submit(url, { ...book, recordId: '42' });
  assert.equal(res.status, 303);
  assert.deepEqual(calls, [{ method: 'patch', args: ['/crm/v3/objects/2-123456/42', { properties: book }] }]);
});

test('validation: missing fields preserve valid input and do not call API', async t => {
  const { url, calls } = await serve(t);
  const res = await submit(url, { name: book.name, author: ' ' });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /Autor é obrigatório/);
  assert.match(html, /Gênero é obrigatório/);
  assert.match(html, /value="Dom Casmurro"/);
  assert.equal(calls.length, 0);
});

test('validation: duplicate field arrays are rejected', async t => {
  const { url, calls } = await serve(t);
  const res = await submit(url, [['name', 'A'], ['name', 'B'], ['author', 'C'], ['genre', 'D']]);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('validation: oversized individual field rejected', async t => {
  const { url, calls } = await serve(t);
  const res = await submit(url, { ...book, genre: 'x'.repeat(121) });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /120 caracteres/);
  assert.equal(calls.length, 0);
});

test('validation: malicious record IDs rejected on GET and POST', async t => {
  const { url, calls } = await serve(t);
  assert.equal((await fetch(`${url}/update-cobj?id=..%2F..%2Fcontacts`)).status, 400);
  assert.equal((await submit(url, { ...book, recordId: '../contacts' })).status, 400);
  assert.equal(calls.length, 0);
});

test('security: cross-origin form blocked', async t => {
  const { url, calls } = await serve(t);
  assert.equal((await submit(url, book, { origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal(calls.length, 0);
});

test('security: same-origin form accepted', async t => {
  const { url } = await serve(t);
  assert.equal((await submit(url, book, { origin: url })).status, 303);
});

test('security: 10KB request limit', async t => {
  const { url, calls } = await serve(t);
  const res = await submit(url, { ...book, name: 'x'.repeat(11000) });
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test('security: upstream error does not expose token or raw response', async t => {
  const secret = 'not-a-real-token-only-a-sentinel';
  const { url, logs } = await serve(t, { get: async () => {
    const error = new Error(secret);
    error.response = { status: 401, data: { message: secret } };
    error.config = { headers: { Authorization: `Bearer ${secret}` } };
    throw error;
  } });
  const res = await fetch(url);
  assert.equal(res.status, 502);
  const html = await res.text();
  assert.match(html, /Token inválido/);
  assert.doesNotMatch(html, new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(logs), new RegExp(secret));
});

for (const [code, expected, text] of [[403, 502, /Acesso negado/], [404, 502, /não encontrado/], [429, 503, /Limite temporário/]]) {
  test(`API error: ${code} is handled`, async t => {
    const { url } = await serve(t, { get: async () => { throw { response: { status: code } }; } });
    const res = await fetch(url);
    assert.equal(res.status, expected);
    assert.match(await res.text(), text);
  });
}

test('API error: timeout does not hang the request', async t => {
  const { url } = await serve(t, { get: async () => { throw new Error('timeout'); } });
  const res = await fetch(url);
  assert.equal(res.status, 502);
  assert.match(await res.text(), /Não foi possível comunicar/);
});

test('API error: failed write does not redirect as success', async t => {
  const { url } = await serve(t, { post: async () => { throw { response: { status: 403 } }; } });
  const res = await submit(url, book);
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('location'), null);
});

test('response: security headers and unknown route', async t => {
  const { url } = await serve(t);
  const res = await fetch(`${url}/unknown`);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('referrer-policy'), 'same-origin');
  assert.match(res.headers.get('content-security-policy'), /form-action 'self'/);
});

test('config: missing secrets, test confirmation and malformed ID fail closed', () => {
  const base = { HUBSPOT_TEST_ACCOUNT_CONFIRMED: 'true', HUBSPOT_PRIVATE_APP_TOKEN: 'fake-test-only', HUBSPOT_OBJECT_TYPE_ID: '2-123456' };
  assert.throws(() => validateConfig({ ...base, HUBSPOT_TEST_ACCOUNT_CONFIRMED: 'false' }), /TEST account/);
  assert.throws(() => validateConfig({ ...base, HUBSPOT_PRIVATE_APP_TOKEN: '' }), /TOKEN/);
  assert.throws(() => validateConfig({ ...base, HUBSPOT_OBJECT_TYPE_ID: 'contacts' }), /OBJECT_TYPE_ID/);
  assert.throws(() => validateConfig({ ...base, PORT: 'bad' }), /PORT/);
  assert.equal(validateConfig(base).port, 3000);
});

test('client: fixed HubSpot base URL, authorization header and timeout', () => {
  const client = createClient('fake-test-only');
  assert.equal(client.defaults.baseURL, 'https://api.hubapi.com');
  assert.equal(client.defaults.headers.Authorization, 'Bearer fake-test-only');
  assert.equal(client.defaults.timeout, 15000);
});

test('formData: handles undefined and retains trimmed text', () => {
  assert.equal(formData(undefined).errors.length, 3);
  assert.deepEqual(formData(book).values, book);
});
