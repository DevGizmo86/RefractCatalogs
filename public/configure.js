'use strict';
const $ = id => document.getElementById(id);
const initial = JSON.parse($('initial-config').textContent);
let rows = []; let revision = 0; let generating = false;
function invalidate() {
  revision++;
  $('result').hidden = true;
  $('status').textContent = '';
  $('generate-button').disabled = !rows.length || generating;
}
function button(text, label, action, disabled = false, className = '') {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = text; element.setAttribute('aria-label', label);
  element.disabled = disabled || generating; element.className = className; element.addEventListener('click', action);
  return element;
}
function render() {
  $('tmdb-key').disabled = generating;
  $('lists').replaceChildren();
  $('list-count').textContent = `${rows.length} / 30`;
  $('empty-message').hidden = !!rows.length;
  $('add-button').disabled = rows.length >= 30 || generating;
  $('generate-button').disabled = !rows.length || generating;
  rows.forEach((row, index) => {
    const article = document.createElement('article'); article.className = 'list-row';
    const top = document.createElement('div'); top.className = 'row-top';
    const heading = document.createElement('div'); heading.className = 'row-heading';
    const number = document.createElement('span'); number.className = 'row-number'; number.textContent = `${index + 1}.`;
    const title = document.createElement('span'); title.textContent = row.remoteName || 'Lista Refract';
    heading.append(number, title);
    const actions = document.createElement('div'); actions.className = 'row-actions';
    function move(offset) { [rows[index], rows[index + offset]] = [rows[index + offset], rows[index]]; invalidate(); render(); }
    actions.append(button('↑', `Sposta su ${row.remoteName || 'lista'}`, () => move(-1), index === 0), button('↓', `Sposta giù ${row.remoteName || 'lista'}`, () => move(1), index === rows.length - 1), button('×', `Elimina ${row.remoteName || 'lista'}`, () => { rows.splice(index, 1); invalidate(); render(); }, false, 'delete'));
    top.append(heading, actions);
    const details = document.createElement('div'); details.className = 'row-details';
    const nameBox = document.createElement('div');
    const nameLabel = document.createElement('label'); nameLabel.textContent = 'Nome catalogo'; nameLabel.htmlFor = `name-${row.id}`;
    const name = document.createElement('input'); name.id = nameLabel.htmlFor; name.value = row.name; name.maxLength = 160; name.placeholder = row.remoteName || 'Nome originale'; name.disabled = generating;
    name.addEventListener('input', () => { row.name = name.value; invalidate(); }); nameBox.append(nameLabel, name);
    const typeBox = document.createElement('div');
    const typeLabel = document.createElement('label'); typeLabel.textContent = 'Contenuti'; typeLabel.htmlFor = `type-${row.id}`;
    const type = document.createElement('select'); type.id = typeLabel.htmlFor; type.disabled = generating;
    [['both', 'Film e serie TV'], ['movie', 'Solo film'], ['series', 'Solo serie TV']].forEach(([value, text]) => { const option = new Option(text, value); type.append(option); });
    type.value = row.mode; type.addEventListener('change', () => { row.mode = type.value; invalidate(); render(); }); typeBox.append(typeLabel, type);
    details.append(nameBox, typeBox);
    const shapes = document.createElement('div'); shapes.className = 'row-shapes';
    for (const catalogType of ['movie', 'series']) {
      if (row.mode !== 'both' && row.mode !== catalogType) continue;
      const box = document.createElement('div');
      const label = document.createElement('label'); label.textContent = `Miniature ${catalogType === 'movie' ? 'film' : 'serie TV'}`; label.htmlFor = `shape-${catalogType}-${row.id}`;
      const select = document.createElement('select'); select.id = label.htmlFor; select.disabled = generating;
      [['poster', 'Verticali (locandine)'], ['landscape', 'Orizzontali (16:9)']].forEach(([value, text]) => select.append(new Option(text, value)));
      select.value = row.posterShapes[catalogType];
      select.addEventListener('change', () => { row.posterShapes[catalogType] = select.value; invalidate(); });
      box.append(label, select); shapes.append(box);
    }
    const url = document.createElement('span'); url.className = 'row-url'; url.textContent = row.url;
    const state = document.createElement('p'); state.className = `row-state${row.error ? ' error' : ''}`;
    state.textContent = row.error || (row.count === undefined ? 'Verifica della lista in corso…' : `${row.count} titoli · ${row.author}`);
    article.append(top, details, shapes, url, state);
    if (row.error) article.append(button('Riprova', `Riprova ${row.remoteName || 'lista'}`, () => inspect(row)));
    $('lists').append(article);
  });
}
async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Richiesta non riuscita.');
  return result;
}
async function inspect(row) {
  row.error = ''; row.count = undefined; render();
  try {
    const data = await post('/api/inspect', { url: row.url });
    Object.assign(row, { url: data.url, remoteName: data.name, count: data.count, author: data.author });
  } catch (error) { row.error = error.message; }
  if (rows.includes(row)) render();
}
function addRow(url, mode = 'both', name = '', posterShapes = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'getrefract.app' || parsed.port || parsed.username || parsed.password || !/^\/list\/[a-z0-9][a-z0-9-]{0,199}\/?$/.test(parsed.pathname)) throw new Error('Inserisci un link https://getrefract.app/list/...');
  const canonical = `https://getrefract.app${parsed.pathname.replace(/\/$/, '')}`;
  if (rows.some(row => row.url === canonical)) throw new Error('Questa lista è già presente.');
  if (rows.length >= 30) throw new Error('Puoi aggiungere al massimo 30 liste.');
  const row = { id: crypto.randomUUID(), url: canonical, name, mode, posterShapes: { movie: posterShapes.movie || 'poster', series: posterShapes.series || 'poster' }, remoteName: name };
  rows.push(row); invalidate(); render(); inspect(row);
}
$('add-form').addEventListener('submit', event => {
  event.preventDefault(); if (generating) return;
  $('add-error').textContent = '';
  try { addRow($('new-url').value.trim()); $('new-url').value = ''; $('new-url').focus(); }
  catch (error) { $('add-error').textContent = error.message; }
});
$('generate-button').addEventListener('click', async () => {
  if (!rows.length || generating) return;
  generating = true; const current = revision; render();
  $('status').className = ''; $('status').textContent = 'Verifico le liste e preparo i cataloghi…'; $('result').hidden = true;
  try {
    const result = await post('/api/configure', { lists: rows.map(({ url, mode, name, posterShapes }) => ({ url, mode, name, posterShapes })), tmdbKey: $('tmdb-key').value.trim() });
    if (current !== revision) return;
    const manifest = new URL(result.manifestPath, location.origin).href;
    $('manifest-url').value = manifest;
    $('installLink').href = manifest.replace(/^https?:\/\//, 'stremio://');
    $('edit-link').href = result.configurePath;
    $('catalog-summary').textContent = `${rows.length} liste · ${result.manifest.catalogs.length} cataloghi pronti`;
    $('status').textContent = 'Configurazione pronta.'; $('result').hidden = false;
  } catch (error) { $('status').className = 'error'; $('status').textContent = error.message; }
  finally { generating = false; render(); }
});
$('copyManifestBtn').addEventListener('click', async () => {
  const value = $('manifest-url').value;
  try { await navigator.clipboard.writeText(value); $('copyManifestBtn').textContent = 'Link copiato!'; }
  catch { $('manifest-url').focus(); $('manifest-url').select(); $('status').textContent = 'Seleziona e copia il link del manifest.'; }
  setTimeout(() => { $('copyManifestBtn').textContent = 'Copia link manifest per Nuvio'; }, 2000);
});
$('tmdb-key').value = initial?.tmdbKey || '';
$('tmdb-key').addEventListener('input', invalidate);
if (initial) initial.lists.forEach(row => addRow(row.url, row.mode, row.name, row.posterShapes));
render();
