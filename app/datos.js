// Datos de la isla (solo lectura, de menorca3d_v2): zonas de v0.7 con relieve, edificios por referencia catastral,
// números de edificio (los mismos que el mapa del visor Cesium) y ajustes manuales.
import { ring, pip } from '/v07/core/geo.js';

const getJSON = f => fetch('/datos/' + f).then(r => (r.ok ? r.json() : null)).catch(() => null);
const loadScript = src => new Promise(ok => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ok; document.head.appendChild(s); });

// Prepara una zona igual que pipeline/exportar_glb.mjs (y v0.7/src/data/loader.js): relieve, tierra y Cales Fonts.
function prepZona(D, nombre) {
  if (!D) return null;
  const T = D.terrain;
  if (!D.zones.some(z => z.n == 'Cales Fonts')) D.zones.push({ n: 'Cales Fonts', x: 170, z: -370, r: 140, casco: true });
  const HH = new Int16Array(Uint8Array.from(atob(T.h), c => c.charCodeAt(0)).buffer);
  const h = (a, b) => HH[b * T.cols + a] / 10;
  const Hgt = (x, z) => {
    const u = Math.max(0, Math.min(T.cols - 1.001, (x - T.x0) / T.step)), v = Math.max(0, Math.min(T.rows - 1.001, (z - T.z0) / T.step));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    return (h(i, j) * (1 - fu) + h(i + 1, j) * fu) * (1 - fv) + (h(i, j + 1) * (1 - fu) + h(i + 1, j + 1) * fu) * fv;
  };
  const landP = ring(D.land), isl = D.islands.map(ring);
  const Z = { ...D, nombre, Hgt, inLand: (x, z) => pip(x, z, landP) || isl.some(q => pip(x, z, q)), byRef: new Map() };
  for (const b of D.buildings) if (b.ref) (Z.byRef.get(b.ref) || Z.byRef.set(b.ref, []).get(b.ref)).push(b);
  return Z;
}

export async function cargarDatos() {
  const [zona, municipio, edif, ajus] = await Promise.all(['zona.json', 'municipio.json', 'edificios.json', 'ajustes.json'].map(getJSON));
  if (!zona) throw new Error('No se pudo leer la zona de v0.7 (zone.json). ¿Está bien la ruta de menorca3d_v2?');
  await loadScript('/datos/es-castell.js');   // window.MENORCA_DATA: todas las piezas del Catastro (para los números)
  const zonas = [prepZona(zona, 'zona'), prepZona(municipio, 'municipio')].filter(Boolean);
  const origin = zona.origin, KX = 111320 * Math.cos(origin.lat * Math.PI / 180), KZ = 110540;

  // Parcelas (referencia catastral) de las dos zonas
  const parcelas = new Map();
  for (const Z of zonas) for (const [ref, piezas] of Z.byRef) {
    if (parcelas.has(ref)) continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, A = 0;
    const rings = piezas.map(b => ring(b.p));
    for (const r of rings) { for (const q of r) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
      let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } A += Math.abs(a / 2); }
    parcelas.set(ref, { ref, n: null, provisional: false, zona: Z.nombre, piezas: piezas.length, rings, box: [x0, x1, z0, z1], A,
      plantas: Math.max(...piezas.map(b => Math.round(b.h / 3) || 1)) });
  }

  // Números de edificio, como cesium/js/maps.js: los estables de v0.7 y, fuera de esa zona, provisionales por orden de referencia
  const MD = window.MENORCA_DATA;
  if (MD && MD.buildings) {
    const nOf = new Map();
    for (const b of MD.buildings) { if (!nOf.has(b.r)) nOf.set(b.r, null); if (b.n) nOf.set(b.r, b.n); }
    let maxN = 0; for (const n of nOf.values()) if (n) maxN = Math.max(maxN, n);
    const orden = [...nOf.entries()].sort((a, b) => (a[1] || 1e9) - (b[1] || 1e9) || (a[0] < b[0] ? -1 : 1));
    for (const [ref, n0] of orden) { const n = n0 || ++maxN, p = parcelas.get(ref); if (p) { p.n = n; p.provisional = !n0; } }
  } else if (edif) for (const e of edif.edificios) { const p = parcelas.get(e.ref); if (p) p.n = e.n; }
  const byN = new Map(); for (const p of parcelas.values()) if (p.n) byN.set(p.n, p);

  // Ajustes manuales (nº de edificio → referencia), como el exportador
  const ajustes = {};
  if (ajus && edif) { const refOfN = new Map(edif.edificios.map(e => [String(e.n), e.ref]));
    for (const [n, a] of Object.entries(ajus.edificios || {})) if (refOfN.has(n)) ajustes[refOfN.get(n)] = a; }

  const buscar = q => {
    q = String(q || '').trim().toUpperCase().replace(/^N[ºO°]?\s*/, '');
    if (!q) return null;
    if (/^\d+$/.test(q) && byN.has(+q)) return byN.get(+q);
    if (parcelas.has(q)) return parcelas.get(q);
    if (q.length >= 7) for (const p of parcelas.values()) if (p.ref.startsWith(q)) return p;
    return null;
  };
  const zonaDe = p => zonas.find(Z => Z.nombre == p.zona);
  // local v0.7 (x este, z sur) ↔ lon/lat: la misma proyección lineal de v0.7
  const toLL = (x, z) => [origin.lon + x / KX, origin.lat - z / KZ];
  return { zonas, parcelas, byN, buscar, zonaDe, ajustes, origin, toLL };
}
