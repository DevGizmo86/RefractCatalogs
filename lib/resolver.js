const { createHash } = require('node:crypto');
const { Cache } = require('./cache');
const { request } = require('./http');
const CINEMETA = 'https://v3-cinemeta.strem.io';
const TMDB = 'https://api.themoviedb.org/3';
function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function posterFile(value) { try { return new URL(value).pathname.split('/').pop(); } catch { return null; } }
function pickMatch(item, candidates) {
  const ranked = candidates.filter(candidate => ['movie', 'series'].includes(candidate.type)).map(candidate => {
    const year = Number(String(candidate.releaseInfo || '').match(/\d{4}/)?.[0]) || null;
    const sameTitle = [candidate.name, candidate.originalName].some(name => normalize(name) === normalize(item.title));
    const samePoster = item.poster && posterFile(item.poster) === posterFile(candidate.poster);
    const sameYear = item.year && year === item.year;
    const typeOk = !item.typeHint || item.typeHint === candidate.type;
    const score = !typeOk ? 0 : samePoster ? 100 : sameTitle && sameYear ? 80 : sameTitle && !item.year ? 50 : 0;
    return { candidate, score };
  }).filter(match => match.score > 0).sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const winners = ranked.filter(match => match.score === ranked[0].score);
  const identities = new Set(winners.map(match => `${match.candidate.type}:${match.candidate.id}`));
  return identities.size === 1 ? winners[0].candidate : null;
}
function createResolver({ getJson = url => request(url, { json: true }), tmdbKey = process.env.TMDB_API_KEY } = {}) {
  const cache = new Cache(10000);
  const pending = new Map();
  async function imdb(item) {
    const response = await getJson(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(item.title)}.json?includeVideos=0`);
    const types = { movie: 'movie', tvMovie: 'movie', short: 'movie', tvSpecial: 'movie', video: 'movie', tvSeries: 'series', tvMiniSeries: 'series' };
    const candidates = (response.d || []).filter(row => /^tt\d+$/.test(row.id) && types[row.qid]).map(row => ({
      id: row.id, type: types[row.qid], name: row.l, releaseInfo: row.yr || String(row.y || ''), poster: row.i?.imageUrl
    }));
    return pickMatch(item, candidates);
  }
  async function cinemeta(item) {
    const types = item.typeHint ? [item.typeHint] : ['movie', 'series'];
    let responses;
    try { responses = await Promise.all(types.map(type => getJson(`${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(item.title)}.json`))); }
    catch (error) { throw new Error(`Ricerca metadati per “${item.title}” non riuscita: ${error.message}`); }
    const match = pickMatch(item, responses.flatMap(response => response.metas || []));
    return match && /^tt\d+$/.test(match.id) ? match : null;
  }
  async function tmdb(item, apiKey) {
    const query = new URLSearchParams({ api_key: apiKey, query: item.title, language: 'it-IT', include_adult: 'false' });
    const response = await getJson(`${TMDB}/search/multi?${query}`);
    const candidates = (response.results || []).filter(row => ['movie', 'tv'].includes(row.media_type)).map(row => ({
      id: row.id, type: row.media_type === 'movie' ? 'movie' : 'series', name: row.title || row.name,
      originalName: row.original_title || row.original_name,
      releaseInfo: row.release_date || row.first_air_date,
      poster: row.poster_path ? `https://image.tmdb.org/t/p/w500${row.poster_path}` : undefined,
      description: row.overview
    }));
    const match = pickMatch(item, candidates);
    if (!match) return null;
    const path = match.type === 'movie' ? 'movie' : 'tv';
    const ids = await getJson(`${TMDB}/${path}/${match.id}/external_ids?${new URLSearchParams({ api_key: apiKey })}`);
    return /^tt\d+$/.test(ids.imdb_id || '') ? { ...match, id: ids.imdb_id } : null;
  }
  const effectiveKey = personalKey => personalKey || tmdbKey || '';
  const cacheScope = personalKey => createHash('sha256').update(effectiveKey(personalKey)).digest('hex');
  return {
    cacheScope,
    async resolve(item, { tmdbKey: personalKey } = {}) {
      const apiKey = effectiveKey(personalKey);
      const key = JSON.stringify([cacheScope(personalKey), item.title, item.year, item.poster, item.typeHint]);
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      if (pending.has(key)) return pending.get(key);
      const work = (async () => {
        let match = null;
        if (apiKey) {
          try { match = await tmdb(item, apiKey); } catch { /* Cinemeta remains available without a TMDB key. */ }
        }
        if (!match) {
          try { match = await imdb(item); } catch { /* A failed autocomplete request falls back to Cinemeta. */ }
        }
        if (!match) match = await cinemeta(item);
        const value = match ? {
          id: match.id, type: match.type, name: match.name || item.title,
          poster: item.poster || match.poster, posterShape: 'poster',
          releaseInfo: match.releaseInfo, description: match.description
        } : null;
        cache.set(key, value, match ? 7 * 24 * 60 * 60 * 1000 : 30 * 60 * 1000);
        return value;
      })();
      pending.set(key, work);
      try { return await work; } finally { pending.delete(key); }
    },
    async getMeta(type, id) {
      if (!['movie', 'series'].includes(type) || !/^tt\d+$/.test(id)) throw new Error('Identificativo non valido.');
      return cache.remember(`meta:${type}:${id}`, 60 * 60 * 1000, async () => {
        const data = await getJson(`${CINEMETA}/meta/${type}/${id}.json`);
        if (!data.meta || data.meta.id !== id || data.meta.type !== type) throw new Error('Scheda non disponibile.');
        return data.meta;
      });
    }
  };
}
module.exports = { normalize, pickMatch, createResolver };
