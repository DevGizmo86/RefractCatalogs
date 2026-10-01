const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeConfig, encodeConfig, decodeConfig } = require('./lib/config');
const { createRefractService } = require('./lib/refract');
const { createResolver } = require('./lib/resolver');
const { createCatalogService, baseManifest } = require('./lib/catalog');
function createApp({ refract = createRefractService(), resolver = createResolver(), publicUrl = process.env.PUBLIC_URL } = {}) {
  const app = express();
  const catalog = createCatalogService(refract, resolver);
  const template = fs.readFileSync(path.join(__dirname, 'public/configure.html'), 'utf8');
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/assets', express.static(path.join(__dirname, 'public')));
  const origin = req => publicUrl ? publicUrl.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  function sendConfig(req, res, config = null) {
    const bootstrap = JSON.stringify(config).replace(/</g, '\\u003c');
    res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://image.tmdb.org https://cdn.getrefract.app; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
    res.type('html').send(template.replace('__CONFIG_JSON__', bootstrap));
  }
  app.get('/', (_req, res) => res.redirect('/configure'));
  app.get('/configure', (req, res) => sendConfig(req, res));
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: require('./package.json').version }));
  app.get('/manifest.json', (req, res) => res.json(baseManifest(origin(req))));
  app.post('/api/inspect', asyncRoute(async (req, res) => {
    // Validating here restricts all external requests to public Refract list URLs.
    const config = normalizeConfig({ lists: [{ url: req.body?.url }] });
    const list = await refract.getList(config.lists[0].url);
    res.json({ url: list.url, slug: list.slug, name: list.name, description: list.description, count: list.count, author: list.author });
  }));
  app.post('/api/configure', asyncRoute(async (req, res) => {
    const config = normalizeConfig(req.body);
    const lists = await Promise.all(config.lists.map(row => refract.getList(row.url)));
    config.lists.forEach((row, index) => { if (!row.name) row.name = lists[index].name; });
    const token = encodeConfig(config);
    const manifest = await catalog.manifest(config, origin(req));
    res.set('Cache-Control', 'no-store').json({ config, manifest, manifestPath: `/${token}/manifest.json`, configurePath: `/${token}/configure` });
  }));
  app.get('/:config/configure', (req, res, next) => { try { sendConfig(req, res, decodeConfig(req.params.config)); } catch (err) { next(err); } });
  app.get('/:config/manifest.json', asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=1800').json(await catalog.manifest(decodeConfig(req.params.config), origin(req)));
  }));
  app.get(['/:config/catalog/:type/:id.json', '/:config/catalog/:type/:id/:extra.json'], asyncRoute(async (req, res) => {
    const params = Object.fromEntries(new URLSearchParams(req.params.extra || ''));
    const result = await catalog.page(decodeConfig(req.params.config), req.params.type, req.params.id, params);
    if (result.diagnostics?.unmatched) console.warn(`RefractCatalogs: ${result.diagnostics.unmatched} titoli senza corrispondenza (${req.params.id}).`);
    res.set('Cache-Control', 'public, max-age=1800').json({ metas: result.metas, cacheMaxAge: result.cacheMaxAge });
  }));
  app.get('/:config/meta/:type/:id.json', asyncRoute(async (req, res) => {
    decodeConfig(req.params.config);
    res.set('Cache-Control', 'public, max-age=3600').json({ meta: await resolver.getMeta(req.params.type, req.params.id), cacheMaxAge: 3600 });
  }));
  app.use((_req, res) => res.status(404).json({ error: 'Risorsa non trovata.' }));
  app.use((err, _req, res, _next) => {
    const invalid = /configurazione|chiave TMDB|link|lista mancante|tipo catalogo|stessa lista|aggiungi da|paginazione|identificativo/i.test(err.message);
    const status = err.type === 'entity.too.large' ? 413 : err instanceof SyntaxError || invalid ? 400 : 502;
    res.set('Cache-Control', 'no-store').status(status).json({ error: status === 413 ? 'Configurazione troppo grande.' : err.message || 'Servizio temporaneamente non disponibile.' });
  });
  return app;
}
if (require.main === module) {
  const port = Number(process.env.PORT || 7000);
  createApp().listen(port, '0.0.0.0', () => console.log(`RefractCatalogs: http://localhost:${port}/configure`));
}
module.exports = { createApp };
