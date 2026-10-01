const { listSlug } = require('./config');
const { Cache } = require('./cache');
const { version } = require('../package.json');
const PAGE_SIZE = 20;
function createCatalogService(refract, resolver) {
  const cache = new Cache(200);
  async function manifest(config, origin) {
    const catalogs = [];
    // Promise.all preserves configured list order even when network requests finish out of order.
    const lists = await Promise.all(config.lists.map(row => refract.getList(row.url)));
    config.lists.forEach((row, index) => {
      const name = row.name || lists[index].name;
      const types = row.mode === 'both' ? ['movie', 'series'] : [row.mode];
      types.forEach(type => catalogs.push({
        id: `refract-${lists[index].slug}`, type,
        name: row.mode === 'both' ? `${name} · ${type === 'movie' ? 'Film' : 'Serie TV'}` : name,
        extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
      }));
    });
    return baseManifest(origin, catalogs, false);
  }
  async function page(config, type, id, extra = {}) {
    const row = config.lists.find(entry => `refract-${listSlug(entry.url)}` === id);
    if (!row || !['movie', 'series'].includes(type) || (row.mode !== 'both' && row.mode !== type)) return { metas: [], cacheMaxAge: 1800 };
    const skip = extra.skip === undefined ? 0 : Number(extra.skip);
    if (!Number.isSafeInteger(skip) || skip < 0 || skip > 10000) throw new Error('Paginazione non valida.');
    const search = String(extra.search || '').trim().slice(0, 200);
    const list = await refract.getList(row.url);
    const signature = JSON.stringify([list.slug, row.mode, list.items]);
    let state = cache.get(signature);
    if (!state) state = cache.set(signature, { cursor: 0, movie: [], series: [], seen: new Set(), unmatched: 0, queue: Promise.resolve() }, 30 * 60 * 1000);
    // Serialize extension of each list's frontier: movie and series requests share the resolved items.
    const operation = state.queue.catch(() => {}).then(async () => {
      const matches = () => state[type].filter(meta => !search || meta.name.toLowerCase().includes(search.toLowerCase()) || meta.sourceTitle.toLowerCase().includes(search.toLowerCase()));
      while (state.cursor < list.items.length && matches().length < skip + PAGE_SIZE) {
        const batch = list.items.slice(state.cursor, state.cursor + 6);
        const resolved = await Promise.all(batch.map(item => resolver.resolve(row.mode === 'both' ? item : { ...item, typeHint: row.mode })));
        // Commit a batch only after all lookups succeed, so a transient failure can be retried.
        resolved.forEach((meta, index) => {
          if (!meta) { state.unmatched++; return; }
          const key = `${meta.type}:${meta.id}`;
          if (!state.seen.has(key)) {
            state.seen.add(key);
            state[meta.type].push({ ...meta, sourceTitle: batch[index].title });
          }
        });
        state.cursor += batch.length;
      }
      return {
        metas: matches().slice(skip, skip + PAGE_SIZE).map(({ sourceTitle, ...meta }) => meta),
        cacheMaxAge: 1800,
        diagnostics: { scanned: state.cursor, total: list.count, unmatched: state.unmatched }
      };
    });
    state.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
  return { manifest, page };
}
function baseManifest(origin, catalogs = [], unconfigured = true) {
  return {
    id: 'community.devgizmo.refractcatalogs', version, name: 'RefractCatalogs',
    description: 'Le tue liste pubbliche Refract come cataloghi per Stremio e Nuvio.',
    logo: `${origin}/assets/logo.svg`, background: `${origin}/assets/background.svg`,
    resources: ['catalog', { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt'] }],
    types: ['movie', 'series'], catalogs,
    behaviorHints: { configurable: true, configurationRequired: unconfigured }
  };
}
module.exports = { PAGE_SIZE, createCatalogService, baseManifest };
