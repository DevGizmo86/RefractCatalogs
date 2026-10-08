const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createApp } = require('../index');
const { decodeConfig } = require('../lib/config');
async function waitFor(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('La UI non ha raggiunto lo stato previsto.');
}
test('editor: aggiunge righe, riordina su/giù, elimina, genera e ripristina dal link', async t => {
  const app = createApp({ refract: { getList: async url => ({ url, slug: url.split('/').pop(), name: url.endsWith('first-abc') ? 'Prima lista' : 'Seconda lista', count: 3, author: 'DevGizmo', items: [] }) } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error));
  const options = { resources: 'usable', runScripts: 'dangerously', virtualConsole, beforeParse(window) {
    window.fetch = (url, init) => fetch(new URL(url, window.location.href), init);
    window.crypto.randomUUID = randomUUID;
  } };
  const dom = await JSDOM.fromURL(`${origin}/configure`, options); t.after(() => dom.window.close());
  await new Promise(resolve => dom.window.addEventListener('load', resolve));
  const document = dom.window.document;
  function add(slug) { document.getElementById('new-url').value = `https://getrefract.app/list/${slug}`; document.getElementById('add-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }
  add('first-abc'); await waitFor(() => document.querySelector('.row-state')?.textContent.includes('3 titoli'));
  add('second-abc'); await waitFor(() => document.querySelectorAll('.row-state')[1]?.textContent.includes('3 titoli'));
  assert.equal(document.querySelectorAll('.list-row').length, 2);
  assert.equal(document.querySelector('.row-actions button').disabled, true);
  const firstMovieShape = document.querySelector('select[id^="shape-movie-"]');
  firstMovieShape.value = 'landscape'; firstMovieShape.dispatchEvent(new dom.window.Event('change'));
  document.querySelector('[aria-label="Sposta giù Prima lista"]').click();
  assert.ok(document.querySelector('.row-heading').textContent.includes('Seconda lista'));
  assert.equal(document.querySelectorAll('select[id^="shape-movie-"]')[1].value, 'landscape');
  document.querySelector('[aria-label="Sposta su Prima lista"]').click();
  assert.ok(document.querySelector('.row-heading').textContent.includes('Prima lista'));
  document.querySelector('[aria-label="Elimina Prima lista"]').click();
  assert.equal(document.querySelectorAll('.list-row').length, 1);
  document.querySelector('select').value = 'movie'; document.querySelector('select').dispatchEvent(new dom.window.Event('change'));
  assert.equal(document.querySelector('select[id^="shape-series-"]'), null);
  const shape = document.querySelector('select[id^="shape-movie-"]');
  shape.value = 'landscape'; shape.dispatchEvent(new dom.window.Event('change'));
  const keyInput = document.getElementById('tmdb-key');
  assert.equal(keyInput.type, 'password');
  keyInput.value = 'a'.repeat(32); keyInput.dispatchEvent(new dom.window.Event('input'));
  document.getElementById('generate-button').click(); await waitFor(() => !document.getElementById('result').hidden);
  const manifest = document.getElementById('manifest-url').value;
  const config = decodeConfig(new URL(manifest).pathname.split('/')[1]);
  assert.equal(config.tmdbKey, 'a'.repeat(32));
  assert.equal(config.lists[0].url, 'https://getrefract.app/list/second-abc'); assert.equal(config.lists[0].mode, 'movie');
  assert.deepEqual(config.lists[0].posterShapes, { movie: 'landscape', series: 'poster' });
  assert.ok(document.getElementById('installLink').href.startsWith('stremio://'));
  const restored = await JSDOM.fromURL(origin + document.getElementById('edit-link').getAttribute('href'), options); t.after(() => restored.window.close());
  await new Promise(resolve => restored.window.addEventListener('load', resolve));
  assert.equal(restored.window.document.querySelectorAll('.list-row').length, 1); assert.equal(restored.window.document.querySelector('select').value, 'movie');
  assert.equal(restored.window.document.getElementById('tmdb-key').value, 'a'.repeat(32));
  assert.equal(restored.window.document.querySelector('select[id^="shape-movie-"]').value, 'landscape');
  keyInput.value = ''; keyInput.dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.getElementById('result').hidden, true);
  document.getElementById('generate-button').click(); await waitFor(() => !document.getElementById('result').hidden);
  assert.equal(decodeConfig(new URL(document.getElementById('manifest-url').value).pathname.split('/')[1]).tmdbKey, undefined);
  add('first-abc'); assert.equal(document.getElementById('result').hidden, true);
  add('first-abc'); assert.equal(document.querySelectorAll('.list-row').length, 2); assert.ok(document.getElementById('add-error').textContent.includes('già presente'));
  await waitFor(() => document.querySelectorAll('.row-state')[1]?.textContent.includes('3 titoli'));
  assert.deepEqual(errors, []);
});
