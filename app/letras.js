// Letras en relieve (rótulos, fechas como el «1933» de un remate, números de casa…).
// Tipografías Droid Serif / Droid Sans (Apache 2.0, ver fuentes/LEEME.txt), con todas las letras del castellano y el catalán.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export const FUENTES = [['serif', 'Clásica (con remates)', 'droid_serif_bold'], ['sans', 'Moderna (de palo)', 'droid_sans_bold']];
const cache = new Map();
export function cargarFuente(id = 'serif') {
  const f = FUENTES.find(x => x[0] == id) || FUENTES[0];
  if (!cache.has(f[0])) cache.set(f[0], new FontLoader().loadAsync(new URL(`./fuentes/${f[2]}.typeface.json`, import.meta.url).href));
  return cache.get(f[0]);
}
// Geometría del texto: alto = altura de las mayúsculas (m), relieve = grosor (m). Base en y = 0, centrado en x, de z = 0 a z = relieve.
// Con ancho, se encoge si hace falta para no pasar de ese ancho.
export async function geoTexto(texto, { fuente = 'serif', alto = .3, relieve = .04, ancho = null } = {}) {
  const font = await cargarFuente(fuente), lineas = String(texto || '').split('\n').filter(l => l.trim());
  if (!lineas.length) return null;
  const gs = [];
  lineas.forEach((l, i) => {
    const g = new TextGeometry(l, { font, size: 1, depth: 1, curveSegments: 5, bevelEnabled: false });
    g.computeBoundingBox(); const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2, -i * 1.35, 0); gs.push(g);
  });
  const g = gs.length == 1 ? gs[0] : unirSimple(gs);
  g.computeBoundingBox(); const b = g.boundingBox, h = b.max.y - b.min.y, w = b.max.x - b.min.x;
  let s = alto / (gs.length == 1 ? Math.max(h, .7) : h); if (ancho && w * s > ancho) s = ancho / w;
  g.translate(0, -b.min.y, -b.min.z); g.scale(s, s, relieve / Math.max(1e-6, b.max.z - b.min.z));
  return g;
}
function unirSimple(gs) {
  const out = new THREE.BufferGeometry(), nonIdx = gs.map(g => (g.index ? g.toNonIndexed() : g));
  for (const k of ['position', 'normal', 'uv']) {
    const arr = nonIdx.map(g => g.attributes[k] && g.attributes[k].array); if (arr.some(a => !a)) continue;
    const n = arr.reduce((s, a) => s + a.length, 0), A = new Float32Array(n); let o = 0; for (const a of arr) { A.set(a, o); o += a.length; }
    out.setAttribute(k, new THREE.BufferAttribute(A, nonIdx[0].attributes[k].itemSize));
  }
  return out;
}
