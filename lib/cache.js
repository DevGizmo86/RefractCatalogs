class Cache {
  constructor(max = 10000) { this.max = max; this.values = new Map(); this.pending = new Map(); }
  get(key) {
    const item = this.values.get(key);
    if (!item || item.expires <= Date.now()) { this.values.delete(key); return undefined; }
    this.values.delete(key); this.values.set(key, item);
    return item.value;
  }
  set(key, value, ttl) {
    this.values.delete(key);
    this.values.set(key, { value, expires: Date.now() + ttl });
    while (this.values.size > this.max) this.values.delete(this.values.keys().next().value);
    return value;
  }
  async remember(key, ttl, work) {
    const value = this.get(key);
    if (value !== undefined) return value;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = Promise.resolve().then(work).then(result => this.set(key, result, ttl));
    this.pending.set(key, promise);
    try { return await promise; } finally { this.pending.delete(key); }
  }
}
function limitConcurrency(max) {
  let active = 0;
  const queue = [];
  return async function run(work) {
    if (active >= max) await new Promise(resolve => queue.push(resolve));
    active++;
    try { return await work(); } finally { active--; queue.shift()?.(); }
  };
}
module.exports = { Cache, limitConcurrency };
