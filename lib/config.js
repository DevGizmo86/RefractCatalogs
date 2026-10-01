const MAX_LISTS = 30;
function listSlug(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Inserisci un link pubblico Refract valido.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'getrefract.app' || url.port || url.username || url.password) {
    throw new Error('Sono accettati solo link https://getrefract.app/list/...');
  }
  const match = url.pathname.match(/^\/list\/([a-z0-9][a-z0-9-]{0,199})\/?$/);
  if (!match) throw new Error('Il link deve puntare a una lista pubblica Refract.');
  return match[1];
}
function normalizeConfig(input) {
  if (!input || !Array.isArray(input.lists) || !input.lists.length || input.lists.length > MAX_LISTS) {
    throw new Error(`Aggiungi da 1 a ${MAX_LISTS} liste.`);
  }
  const seen = new Set();
  const lists = input.lists.map(row => {
    if (!row || typeof row.url !== 'string') throw new Error('Link lista mancante.');
    const slug = listSlug(row.url);
    if (seen.has(slug)) throw new Error('La stessa lista è già presente.');
    seen.add(slug);
    const mode = row.mode || 'both';
    if (!['both', 'movie', 'series'].includes(mode)) throw new Error('Tipo catalogo non valido.');
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 160) : '';
    return { url: `https://getrefract.app/list/${slug}`, mode, name };
  });
  return { v: 1, lists };
}
function encodeConfig(input) { return Buffer.from(JSON.stringify(normalizeConfig(input))).toString('base64url'); }
function decodeConfig(token) {
  if (typeof token !== 'string' || token.length > 24000 || !/^[\w-]+$/.test(token)) throw new Error('Configurazione non valida.');
  try { return normalizeConfig(JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))); }
  catch (err) { throw new Error(`Configurazione non valida: ${err.message}`); }
}
module.exports = { MAX_LISTS, listSlug, normalizeConfig, encodeConfig, decodeConfig };
