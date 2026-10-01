const { limitConcurrency } = require('./cache');
const run = limitConcurrency(8);
async function request(url, { json = false, headers = {}, timeout = 30000 } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await run(async () => {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RefractCatalogs/0.1.0', Accept: json ? 'application/json' : 'text/html', ...headers },
      signal: AbortSignal.timeout(timeout), redirect: 'error'
    });
    if (!response.ok) {
      const error = new Error(`Il servizio remoto ha risposto HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('Risposta remota troppo grande.'); }
      chunks.push(Buffer.from(value));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return json ? JSON.parse(text) : text;
    }); } catch (error) {
      const transient = ['TimeoutError', 'AbortError'].includes(error.name) || error instanceof TypeError || error.status === 429 || error.status >= 500;
      if (attempt || !transient) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
module.exports = { request };
