const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../index');
const { decodeConfig } = require('../lib/config');
test('server: configurazione, riapertura, manifest catalog-only e catalogo', async t => {
  const key = 'a'.repeat(32);
  let usedKey;
  const app = createApp({
    refract: { getList: async url => { const slug = url.split('/').pop(); return { url, slug, name: slug, count: 1, author: 'DevGizmo', items: [{ title: 'Film', year: 2000 }] }; } },
    resolver: { resolve: async (_item, options) => { usedKey = options.tmdbKey; return { id: 'tt1234567', type: 'movie', name: 'Film' }; }, getMeta: async () => ({ id: 'tt1234567', type: 'movie', name: 'Film' }) }
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const configResponse = await fetch(`${origin}/api/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbKey: key, lists: [{ url: 'https://getrefract.app/list/first-abc', mode: 'movie' }, { url: 'https://getrefract.app/list/second-abc', mode: 'both', name: '</script><img src=x onerror=alert(1)>' }] }) });
  assert.equal(configResponse.status, 200);
  const result = await configResponse.json();
  const token = result.manifestPath.split('/')[1];
  assert.equal(decodeConfig(token).lists.length, 2);
  const manifestResponse = await fetch(origin + result.manifestPath); const manifest = await manifestResponse.json();
  assert.equal(manifestResponse.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(manifest.resources, ['catalog']);
  assert.equal(manifest.idPrefixes, undefined);
  assert.equal(manifest.catalogs.length, 3); assert.equal(manifest.catalogs[0].name, 'first-abc');
  const html = await (await fetch(origin + result.configurePath)).text();
  assert.ok(html.includes('\\u003c/script>')); assert.ok(!html.includes('<img src=x'));
  const catalog = await (await fetch(`${origin}/${token}/catalog/movie/refract-first-abc/skip=0.json`)).json();
  assert.equal(catalog.metas[0].id, 'tt1234567');
  assert.equal(usedKey, key);
  assert.ok(!JSON.stringify(catalog).includes(key));
  const badKey = await fetch(`${origin}/api/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbKey: 'bad', lists: [{ url: 'https://getrefract.app/list/first-abc' }] }) });
  assert.equal(badKey.status, 400);
  assert.ok(!(await badKey.text()).includes('bad'));
  assert.equal((await fetch(`${origin}/${token}/meta/movie/tt1234567.json`)).status, 404);
  assert.equal((await fetch(`${origin}/meta/movie/tt1234567.json`)).status, 404);
  const unknown = await fetch(`${origin}/${token}/catalog/movie/unknown.json`); assert.equal(unknown.status, 200); assert.deepEqual((await unknown.json()).metas, []);
  const bad = await fetch(`${origin}/api/inspect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://localhost/private' }) }); assert.equal(bad.status, 400);
  assert.equal((await fetch(`${origin}/invalid/manifest.json`)).status, 400);
  const base = await (await fetch(`${origin}/manifest.json`)).json(); assert.equal(base.behaviorHints.configurationRequired, true);
  assert.deepEqual(base.resources, ['catalog']);
  assert.equal(base.idPrefixes, undefined);
});
