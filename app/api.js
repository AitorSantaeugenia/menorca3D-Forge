// Acceso a las casas guardadas y a la configuración.
//  · Con servidor (servidor.cjs, modo completo o colaborador): usa su API (/api/...).
//  · Sin servidor (versión web publicada en GitHub Pages): las casas se guardan en ESTE navegador (IndexedDB) y la
//    configuración (formulario de envío, código de acceso) se lee de config.json, que crea empaquetar.mjs --web.
let WEB = false;
export const esWeb = () => WEB;

export async function estado() {
  try {
    const r = await fetch('/api/estado', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && j.modo) return j; }
  } catch { /* sin servidor */ }
  WEB = true;
  return { modo: 'web', casas: 'este navegador' };
}

// ---------- IndexedDB (versión web) ----------
let dbP = null;
const db = () => dbP || (dbP = new Promise((ok, ko) => {
  const q = indexedDB.open('menorca3d-forge', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('casas', { keyPath: 'ref' });
  q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error);
}));
const tx = async (modo, fn) => { const d = await db(); return new Promise((ok, ko) => {
  const t = d.transaction('casas', modo), r = fn(t.objectStore('casas'));
  t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error);
}); };

export async function listaCasas() {
  if (!WEB) return fetch('/api/casas').then(r => r.json()).catch(() => []);
  const L = (await tx('readonly', s => s.getAll())) || [];
  return L.map(F => ({ ref: F.ref, n: F.n ?? null, zona: F.zona, actualizado: F.actualizado, objetos: (F.objetos || []).length, notas: F.notas || '' }))
    .sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
}
export async function leerCasa(ref) {
  if (!WEB) return fetch('/api/casas/' + ref).then(r => r.json());
  return tx('readonly', s => s.get(ref));
}
export async function guardarCasa(ref, F) {
  if (!WEB) return fetch('/api/casas/' + ref, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(F) })
    .then(r => r.json()).catch(e => ({ error: e.message }));
  try { await tx('readwrite', s => s.put(F)); return { ok: true, archivo: 'este navegador' }; }
  catch (e) { return { error: 'no se pudo guardar en este navegador (' + e.message + ')' }; }
}
export async function borrarCasa(ref) {
  if (!WEB) return fetch('/api/casas/' + ref, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
  await tx('readwrite', s => s.delete(ref)); return { ok: true };
}
export async function config() {
  const url = WEB ? '../config.json' : '/api/config';
  return fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
}

// ---------- Código de acceso (versión web) ----------
// No es seguridad real (la página es pública): solo frena al curioso. En config.json va el SHA-256 del código, no el código.
export async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
