const test = require('node:test');
const assert = require('node:assert/strict');
const { parseList, createRefractService } = require('../lib/refract');
const { encodeConfig, decodeConfig, normalizeConfig, listSlug } = require('../lib/config');
const { createResolver, pickMatch } = require('../lib/resolver');
const { createCatalogService } = require('../lib/catalog');
const { Cache } = require('../lib/cache');
function fixture(items, count = items.length) {
  return `<span class="badge">Public List</span><h1>Film &amp; serie 🎥</h1><p class="desc">Una lista mista</p><div class="meta"><span>by DevGizmo</span><span>${count} titles</span></div><div class="grid">${items.map(item => `<div class="item"><div class="poster-wrap"><img src="https://image.tmdb.org/t/p/w500/${item.title}.jpg"></div><div class="item-title">${item.title}</div><div class="item-year">${item.year}</div></div>`).join('')}</div>`;
}
const url = 'https://getrefract.app/list/mixed-abc';
test('configurazione Unicode: ordine, modalità e nomi sopravvivono al round trip', () => {
  const config = normalizeConfig({ lists: [{ url, mode: 'both', name: 'Film 🎥 & Serie' }, { url: 'https://getrefract.app/list/second-abc?share=1', mode: 'series' }] });
  assert.deepEqual(decodeConfig(encodeConfig(config)), config);
  assert.equal(config.lists[1].url, 'https://getrefract.app/list/second-abc');
});
test('rifiuta SSRF, URL non-lista, duplicati e configurazioni malformate', () => {
  for (const bad of ['http://getrefract.app/list/a', 'https://getrefract.app.evil/list/a', 'https://user:pass@getrefract.app/list/a', 'https://getrefract.app:444/list/a', 'https://127.0.0.1/list/a', 'https://getrefract.app/u/devgizmo', 'https://getrefract.app/list/../../api']) assert.throws(() => listSlug(bad));
  assert.throws(() => normalizeConfig({ lists: [{ url }, { url: `${url}/` }] }));
  assert.throws(() => decodeConfig('bad'));
  assert.throws(() => normalizeConfig({ lists: [] }));
});
test('parser legge liste miste e tutti i 250 elementi, controllando il conteggio', () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ title: `Title ${i}`, year: 2000 + i % 20 }));
  const list = parseList(fixture(items), 'mixed-abc');
  assert.equal(list.count, 250); assert.equal(list.name, 'Film & serie 🎥'); assert.equal(list.items[249].title, 'Title 249');
  assert.throws(() => parseList(fixture(items.slice(0, 20), 250), 'mixed-abc'), /20 elementi su 250/);
  assert.throws(() => parseList('<h1>Private</h1>', 'mixed-abc'), /pubblica/);
});
test('cache condivide richieste simultanee e riprova gli errori senza memorizzarli', async () => {
  const cache = new Cache(2); let calls = 0;
  const work = async () => { calls++; return 4; };
  assert.deepEqual(await Promise.all([cache.remember('a', 1000, work), cache.remember('a', 1000, work)]), [4, 4]);
  assert.equal(calls, 1);
  await assert.rejects(cache.remember('bad', 1000, () => { throw new Error('offline'); }));
  assert.equal(await cache.remember('bad', 1000, () => 5), 5);
});
test('matching distingue omonimi per anno, esclude persone e rifiuta ambiguità', () => {
  const movie = { id: 'tt1', type: 'movie', name: 'Halloween', releaseInfo: '1978' };
  const remake = { ...movie, id: 'tt2', releaseInfo: '2018' };
  assert.equal(pickMatch({ title: 'Halloween', year: 1978 }, [remake, movie]).id, 'tt1');
  assert.equal(pickMatch({ title: 'Halloween', year: 2001 }, [remake, movie]), null);
  assert.equal(pickMatch({ title: 'Halloween', year: 1978 }, [movie, { ...movie, id: 'tt3', type: 'series' }]), null);
  assert.equal(pickMatch({ title: 'Halloween', year: 1978 }, [{ ...movie, type: 'person' }]), null);
});
test('resolver risolve film e serie senza chiave e mantiene gli ID IMDb', async () => {
  const resolver = createResolver({ tmdbKey: '', getJson: async path => ({ metas: path.includes('/series/') ? [{ id: 'tt0903747', type: 'series', name: 'Breaking Bad', releaseInfo: '2008-2013' }] : [{ id: 'tt1457767', type: 'movie', name: 'The Conjuring', releaseInfo: '2013' }] }) });
  assert.equal((await resolver.resolve({ title: 'Breaking Bad', year: 2008 })).type, 'series');
  assert.equal((await resolver.resolve({ title: 'The Conjuring', year: 2013 })).id, 'tt1457767');
});
test('TMDB usa la locandina per risolvere titoli tradotti e converte in IMDb', async () => {
  const resolver = createResolver({ tmdbKey: 'test', getJson: async path => path.includes('/search/multi') ? { results: [{ id: 1396, media_type: 'tv', name: 'Titolo localizzato', original_name: 'Original title', first_air_date: '2008-01-01', poster_path: '/poster.jpg' }] } : { imdb_id: 'tt0903747' } });
  const value = await resolver.resolve({ title: 'Altro titolo', year: 2008, poster: 'https://image.tmdb.org/t/p/w500/poster.jpg' });
  assert.equal(value.id, 'tt0903747'); assert.equal(value.type, 'series');
});
test('IMDb distingue film e serie, ignorando persone ed episodi', async () => {
  const resolver = createResolver({ tmdbKey: '', getJson: async () => ({ d: [
    { id: 'nm123', l: 'Breaking Bad', y: 2008 },
    { id: 'tt999', l: 'Breaking Bad', y: 2008, qid: 'tvEpisode' },
    { id: 'tt0903747', l: 'Breaking Bad', y: 2008, yr: '2008-2013', qid: 'tvSeries' },
    { id: 'tt1457767', l: 'The Conjuring', y: 2013, qid: 'movie' }
  ] }) });
  assert.equal((await resolver.resolve({ title: 'Breaking Bad', year: 2008 })).type, 'series');
  assert.equal((await resolver.resolve({ title: 'The Conjuring', year: 2013 })).type, 'movie');
});
test('lista mista: separazione, ordine, paginazione, ricerca, deduplica ed esclusione dei non risolti', async () => {
  const items = Array.from({ length: 51 }, (_, i) => ({ title: `Title ${i}`, year: 2000, n: i }));
  items.push({ title: 'Duplicate', n: 2 }, { title: 'Missing', n: -1 });
  const refract = { getList: async () => ({ slug: 'mixed-abc', name: 'Mixed', count: items.length, items }) };
  let calls = 0;
  const resolver = { resolve: async item => { calls++; return item.n < 0 ? null : { id: `tt${item.n}`, type: item.n % 2 ? 'series' : 'movie', name: `Title ${item.n}`, poster: 'poster' }; } };
  const catalogs = createCatalogService(refract, resolver);
  const config = normalizeConfig({ lists: [{ url, mode: 'both' }, { url: 'https://getrefract.app/list/second-abc', mode: 'movie', name: 'Second' }] });
  const manifest = await catalogs.manifest(config, 'https://example.org');
  assert.deepEqual(manifest.catalogs.map(catalog => [catalog.name, catalog.type]), [['Mixed · Film', 'movie'], ['Mixed · Serie TV', 'series'], ['Second', 'movie']]);
  const [movies, series] = await Promise.all([catalogs.page(config, 'movie', 'refract-mixed-abc'), catalogs.page(config, 'series', 'refract-mixed-abc')]);
  assert.equal(movies.metas.length, 20); assert.equal(series.metas.length, 20);
  assert.equal(movies.metas[1].id, 'tt2'); assert.equal(series.metas[0].id, 'tt1');
  const next = await catalogs.page(config, 'movie', 'refract-mixed-abc', { skip: 20 });
  assert.equal(next.metas.length, 6); assert.equal(next.metas[0].id, 'tt40'); assert.equal(next.diagnostics.unmatched, 1);
  const oldCalls = calls;
  assert.equal((await catalogs.page(config, 'series', 'refract-mixed-abc', { search: 'Title 49' })).metas[0].id, 'tt49');
  assert.equal(calls, oldCalls);
  assert.equal((await catalogs.page(config, 'series', 'missing')).metas.length, 0);
  await assert.rejects(catalogs.page(config, 'movie', 'refract-mixed-abc', { skip: -1 }));
});
test('catalogo non perde elementi dopo un errore temporaneo in un batch', async () => {
  let fail = true;
  const service = createCatalogService({ getList: async () => ({ slug: 'mixed-abc', count: 2, items: [{ title: 'A' }, { title: 'B' }] }) }, { resolve: async item => { if (fail && item.title === 'B') throw new Error('offline'); return { id: `tt${item.title}`, type: 'movie', name: item.title }; } });
  const config = normalizeConfig({ lists: [{ url, mode: 'movie' }] });
  await assert.rejects(service.page(config, 'movie', 'refract-mixed-abc'), /offline/);
  fail = false;
  assert.equal((await service.page(config, 'movie', 'refract-mixed-abc')).metas.length, 2);
});
test('servizio Refract condivide il download della stessa lista', async () => {
  let calls = 0;
  const service = createRefractService(async () => { calls++; return fixture([{ title: 'Film', year: 2000 }]); });
  await Promise.all([service.getList(url), service.getList(url)]);
  assert.equal(calls, 1);
});
