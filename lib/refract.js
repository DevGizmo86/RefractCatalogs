const cheerio = require('cheerio');
const { Cache } = require('./cache');
const { listSlug } = require('./config');
const { request } = require('./http');
function safePoster(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['image.tmdb.org', 'cdn.getrefract.app'].includes(url.hostname) ? url.href : undefined;
  } catch { return undefined; }
}
function parseList(html, slug) {
  const $ = cheerio.load(html);
  if (!$('.badge').text().toLowerCase().includes('public list') || !$('h1').text().trim()) {
    throw new Error('La pagina non contiene una lista pubblica Refract leggibile.');
  }
  const countText = $('.meta').text().match(/(\d+)\s+titles?/i);
  const items = $('.grid .item').toArray().map(element => {
    const node = $(element);
    const yearText = node.find('.item-year').text().trim();
    const hint = node.attr('data-type') || node.attr('data-media-type');
    return {
      title: node.find('.item-title').text().trim(),
      year: Number(yearText.match(/\d{4}/)?.[0]) || null,
      poster: safePoster(node.find('img').attr('src')),
      typeHint: hint === 'tv' ? 'series' : ['movie', 'series'].includes(hint) ? hint : null
    };
  }).filter(item => item.title);
  const declaredCount = countText ? Number(countText[1]) : items.length;
  if (declaredCount !== items.length) {
    throw new Error(`Refract mostra ${items.length} elementi su ${declaredCount}: impossibile leggere la lista completa.`);
  }
  return {
    slug, url: `https://getrefract.app/list/${slug}`,
    name: $('h1').text().trim(), description: $('.desc').text().trim(),
    author: $('.meta span').first().text().replace(/^by\s+/i, '').trim(),
    count: items.length, items
  };
}
function createRefractService(fetchHtml = url => request(url)) {
  const cache = new Cache(200);
  return {
    async getList(url) {
      const slug = listSlug(url);
      return cache.remember(slug, 30 * 60 * 1000, async () => parseList(await fetchHtml(`https://getrefract.app/list/${slug}`), slug));
    }
  };
}
module.exports = { parseList, createRefractService };
