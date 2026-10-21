// Casa editable: piezas (THREE.Mesh) con los mismos atributos que usa menorca3d_v2 (posición, normal, UV en metros,
// color por vértice y datos de fachada aWall/aFac), materiales de v0.7 y el formato de archivo .forge.json.
import * as THREE from 'three';
import { createBuildings } from '../v07/buildings/buildings.js';
import { createFacadeMaterial } from '../v07/buildings/facadeMaterial.js';
import { TEXTURES, tex, texturedMaterial } from '../v07/core/textures.js';

export const FORMATO = 'menorca3d-forge', VERSION = 1;
export const TEXTURAS = Object.keys(TEXTURES);
export const ESTILOS = [   // estilos de fachada de v0.7 (facadeMaterial.js)
  [-1, 'Sin huecos (pared lisa)'], [0, 'Casco: recercado blanco y persianas'], [5, 'Casco: sillarejo de marés'],
  [2, 'Residencial: mallorquinas y alero'], [3, 'Residencial con zócalo de lajas'], [1, 'Ayuntamiento (rojo, esquinas)'], [4, 'Cuartel (rojo, esquinas)'],
];
const ATTRS = { position: 3, normal: 3, uv: 2, color: 3, aWall: 4, aFac: 4 };

// ---------- Materiales (compartidos) ----------
const mats = new Map();
export function material(spec) {
  const side = spec.doble === false ? THREE.FrontSide : THREE.DoubleSide, k = JSON.stringify([spec.kind, side, spec.emissive || '']);
  if (!mats.has(k)) {
    let m;
    if (spec.kind == 'fachada') m = createFacadeMaterial();
    else if (TEXTURES[spec.kind]) m = texturedMaterial(spec.kind, { vertexColors: true, side });
    else m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side, ...(spec.emissive ? { emissive: new THREE.Color(spec.emissive) } : {}) });
    m.side = side; mats.set(k, m);
  }
  return mats.get(k);
}
// Igual que kindOf() de pipeline/exportar_glb.mjs
function kindOf(m) {
  if (m.onBeforeCompile && m.onBeforeCompile.toString().includes('aWall')) return 'fachada';
  for (const n of TEXTURAS) if (m.map && m.map === tex(n).map) return n;
  return 'color';
}

// ---------- Geometría ----------
// Completa una geometría no indexada con todos los atributos (los que falten, a cero / blanco)
export function completar(g) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  for (const [k, w] of Object.entries(ATTRS)) if (!g.attributes[k]) {
    const a = new Float32Array(n * w); if (k == 'color') a.fill(1);
    g.setAttribute(k, new THREE.BufferAttribute(a, w));
  }
  if (!g.attributes.normal || g.attributes.normal.array.every(v => v == 0)) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!ATTRS[k]) g.deleteAttribute(k);
  return g;
}
// Crea la pieza: geometría centrada en su caja y la malla en esa posición
export function crearPieza(geoMundo, datos) {
  const g = completar(geoMundo); g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z);
  const mesh = new THREE.Mesh(g, material(datos.material)); mesh.position.copy(c);
  mesh.userData.pieza = { id: datos.id || crypto.randomUUID().slice(0, 8), nombre: datos.nombre || 'Pieza', origen: datos.origen || 'v0.7',
    material: { kind: 'color', doble: true, ...datos.material }, fachada: datos.fachada || { estilo: -1, semilla: 0, auto: false }, uvAuto: !!datos.uvAuto };
  mesh.name = mesh.userData.pieza.nombre;
  return mesh;
}

const rumbo = (x, z) => ['E', 'SE', 'S', 'SO', 'O', 'NO', 'N', 'NE'][((Math.round(Math.atan2(z, x) / (Math.PI / 4)) % 8) + 8) % 8];   // z = sur

// Divide una malla de v0.7 (fachadas, tejados o azoteas de toda la parcela) en caras planas conectadas: cada pared,
// cada faldón y cada azotea se puede seleccionar por separado.
function separarPlanos(g) {
  const P = g.attributes.position.array, nT = P.length / 9, grupos = new Map(), v = new THREE.Vector3(), w = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let t = 0; t < nT; t++) {
    const o = t * 9; v.set(P[o + 3] - P[o], P[o + 4] - P[o + 1], P[o + 5] - P[o + 2]); w.set(P[o + 6] - P[o], P[o + 7] - P[o + 1], P[o + 8] - P[o + 2]);
    nrm.crossVectors(v, w); if (nrm.lengthSq() < 1e-10) continue; nrm.normalize();
    if (nrm.y < -1e-3 || (Math.abs(nrm.y) < 1e-3 && (nrm.x < -1e-3 || (Math.abs(nrm.x) < 1e-3 && nrm.z < 0)))) nrm.negate();
    const d = nrm.x * P[o] + nrm.y * P[o + 1] + nrm.z * P[o + 2];
    const k = [nrm.x, nrm.y, nrm.z].map(x => Math.round(x * 40)).join() + '|' + Math.round(d * 10);
    (grupos.get(k) || grupos.set(k, { n: nrm.clone(), tris: [] }).get(k)).tris.push(t);
  }
  const out = [];
  for (const { n, tris } of grupos.values()) {   // dentro de cada plano, separa por conectividad (vértices comunes)
    const par = new Map(), find = x => { while (par.get(x) != x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    const key = i => Math.round(P[i * 3] * 100) + ',' + Math.round(P[i * 3 + 1] * 100) + ',' + Math.round(P[i * 3 + 2] * 100);
    for (const t of tris) par.set(t, t);
    const byV = new Map();
    for (const t of tris) for (let k = 0; k < 3; k++) { const kk = key(t * 3 + k); if (byV.has(kk)) { const a = find(byV.get(kk)), b = find(t); if (a != b) par.set(a, b); } else byV.set(kk, t); }
    const comp = new Map(); for (const t of tris) { const r = find(t); (comp.get(r) || comp.set(r, []).get(r)).push(t); }
    for (const ts of comp.values()) out.push({ n, tris: ts });
  }
  return out;
}
function subGeo(g, tris) {
  const out = new THREE.BufferGeometry();
  for (const [k, w] of Object.entries(ATTRS)) {
    const A = g.attributes[k]; if (!A) continue;
    const a = new Float32Array(tris.length * 3 * w);
    tris.forEach((t, i) => a.set(A.array.subarray(t * 3 * w, (t + 1) * 3 * w), i * 3 * w));
    out.setAttribute(k, new THREE.BufferAttribute(a, w));
  }
  return out;
}
// Color del material × color por vértice → todo en el color por vértice (material blanco), como lo combina el exportador
function hornearColor(g, m, instColor) {
  const n = g.attributes.position.count, C = g.attributes.color ? g.attributes.color.array : new Float32Array(n * 3).fill(1);
  const mc = (m.color && kindOf(m) != 'fachada') ? m.color : new THREE.Color(1, 1, 1), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = C[i * 3] * mc.r * (instColor ? instColor.r : 1); out[i * 3 + 1] = C[i * 3 + 1] * mc.g * (instColor ? instColor.g : 1); out[i * 3 + 2] = C[i * 3 + 2] * mc.b * (instColor ? instColor.b : 1);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
}
const specDe = m => {
  const kind = kindOf(m), s = { kind, doble: m.side == THREE.DoubleSide };
  if (kind == 'color' && m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) s.emissive = '#' + m.emissive.getHexString();
  return s;
};

// Genera la casa de una parcela con el código de v0.7 (como exportar_glb.mjs --refs) y la convierte en piezas editables
export function generarCasa(Z, ref, ajustes) {
  const sel = Z.buildings.filter(b => b.ref == ref);
  const built = createBuildings({ ...Z, buildings: sel }, ajustes);
  return piezasDeGrupo(built.mesh);
}
export function piezasDeGrupo(group, origen = 'v0.7') {
  group.updateMatrixWorld(true);
  const piezas = [], sueltas = [], M = new THREE.Matrix4(), col = new THREE.Color(), cuenta = {};
  const nombre = base => { cuenta[base] = (cuenta[base] || 0) + 1; return cuenta[base] > 1 ? `${base} ${cuenta[base]}` : base; };
  group.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.position || !o.geometry.attributes.position.count) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material, spec = specDe(m);
    let base = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (o.isInstancedMesh) {   // farolas, balaustres…: todas las copias en una sola pieza
      const list = [];
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, M); M.premultiply(o.matrixWorld);
        const gi = base.clone().applyMatrix4(M); hornearColor(gi, m, o.instanceColor ? (o.getColorAt(i, col), col.clone()) : null); list.push(completar(gi));
      }
      sueltas.push({ g: unir(list), spec, name: o.name }); return;
    }
    base.applyMatrix4(o.matrixWorld); hornearColor(base, m, null);
    if (base.attributes.aWall && (spec.kind == 'fachada' || spec.kind == 'teja' || spec.kind == 'terraza')) {
      // Mallas compartidas de buildings.js: una pieza por cara plana
      for (const { n, tris } of separarPlanos(base)) {
        const g = subGeo(base, tris), F = g.attributes.aFac.array, AWv = g.attributes.aWall.array, Pv = g.attributes.position.array;
        // estilo y semilla de v0.7; «base»: altura del arranque del muro (puede quedar oculto por la casa vecina)
        let estilo = -1, semilla = 0, baseY = null;
        for (let i = 0; i < F.length; i += 4) if (F[i] > 0) { estilo = Math.round(F[i + 2]); semilla = Math.round(F[i + 3]); baseY = Pv[(i / 4) * 3 + 1] - AWv[i + 1]; break; }
        const vertical = Math.abs(n.y) < .2;
        const nom = spec.kind == 'fachada' ? (vertical ? `Pared ${rumbo(n.x, n.z)}` : 'Cara') : spec.kind == 'teja' ? (n.y > .98 ? 'Cubierta de teja' : `Faldón ${rumbo(n.x, n.z)}`) : 'Azotea';
        const m = crearPieza(g, { nombre: nombre(nom), material: spec, origen, fachada: { estilo, semilla, auto: false } });
        if (baseY != null) m.userData.pieza.fachada.base = +(baseY - m.position.y).toFixed(3);   // en coordenadas de la pieza
        piezas.push(m);
      }
    } else sueltas.push({ g: completar(base), spec, name: o.name });
  });
  // Detalles sueltos de los generadores especiales (cajas de vallas, postes, marcos…): en las casas de v0.7 se agrupan las
  // que se tocan y tienen el mismo material, para que una valla o una verja sea UN objeto. «Separar» las vuelve a dividir.
  const grupos = origen == 'v0.7' ? agrupar(sueltas) : sueltas.map(x => [x]);
  for (const grp of grupos) piezas.push(crearPieza(grp.length == 1 ? grp[0].g : unir(grp.map(x => x.g)), { nombre: nombre(nombrar(grp)), material: grp[0].spec, origen }));
  return piezas;
}
function agrupar(L) {
  const box = L.map(x => { x.g.computeBoundingBox(); return x.g.boundingBox.clone().expandByScalar(.03); }), key = L.map(x => JSON.stringify(x.spec));
  const par = L.map((_, i) => i), find = i => { while (par[i] != i) i = par[i] = par[par[i]]; return i; };
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++)
    if (key[i] == key[j] && !L[i].name && !L[j].name && box[i].intersectsBox(box[j])) par[find(i)] = find(j);
  const out = new Map(); L.forEach((x, i) => { const r = find(i); (out.get(r) || out.set(r, []).get(r)).push(x); });
  return [...out.values()];
}
// Nombre en castellano del color (sRGB) más frecuente de una geometría
export function nombreColor(g) {
  // color que ocupa más superficie (no el que tiene más vértices: una malla grande pesa más que muchos postes)
  const C = g.attributes.color, P = g.attributes.position, cnt = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let best = null, bn = 0;
  for (let i = 0; i < C.count; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    const area = b.sub(a).cross(c.sub(a)).length() / 2;
    const k = C.getX(i).toFixed(2) + ',' + C.getY(i).toFixed(2) + ',' + C.getZ(i).toFixed(2), v = (cnt.get(k) || 0) + area; cnt.set(k, v); if (v > bn) { bn = v; best = i; } }
  if (best == null) return '';
  const hsl = {}; new THREE.Color(C.getX(best), C.getY(best), C.getZ(best)).getHSL(hsl, THREE.SRGBColorSpace);
  const h = hsl.h * 360, { s, l } = hsl;
  if (s < .14 || l > .93) return l > .82 ? 'blanco' : l < .22 ? 'negro' : 'gris';
  if (h < 18 || h >= 340) return l < .35 ? 'granate' : 'rojo';
  if (h < 45) return l < .45 ? 'marrón' : s < .45 ? 'beige' : 'naranja';
  if (h < 70) return s < .45 ? 'crema' : 'amarillo';
  if (h < 170) return 'verde';
  if (h < 260) return 'azul';
  return 'morado';
}
const NOMBRE_KIND = { piedra_seca: 'Pared seca', estuco: 'Estuco', teja: 'Teja', terraza: 'Terraza', baldosa_roja: 'Baldosa roja', acera: 'Acera', adoquin: 'Adoquín',
  losa_plaza: 'Losa', asfalto: 'Asfalto', aplacado: 'Aplacado', sillarejo: 'Sillarejo', sillar: 'Sillería', rotulo_farmacia: 'Rótulo', rotulo_farmacia2: 'Rótulo', rotulo_farmacia3: 'Rótulo' };
function nombrar(grp) {
  if (grp[0].name) return grp[0].name;
  const k = grp[0].spec.kind; if (k != 'color' && k != 'fachada') return NOMBRE_KIND[k] || k;
  const b = new THREE.Box3(); for (const x of grp) b.union(x.g.boundingBox); const sz = b.getSize(new THREE.Vector3());
  const largo = Math.max(sz.x, sz.z), fino = Math.min(sz.x, sz.z), col = nombreColor(grp.length == 1 ? grp[0].g : unir(grp.map(x => x.g)));
  if (sz.y > .5 && sz.y < 2.8 && largo > 2.2 && (fino < .7 || col == 'verde')) return col == 'verde' ? 'Valla de malla' : col == 'gris' || col == 'negro' ? 'Verja' : 'Valla ' + col;
  if (sz.y < .25 && largo > 1) return 'Losa ' + col;
  return (grp.length > 1 ? 'Conjunto ' : 'Detalle ') + col;
}
// Divide una pieza en sus partes sueltas (grupos de triángulos unidos por vértices comunes)
export function separar(mesh) {
  const g = mesh.geometry, P = g.attributes.position.array, nT = P.length / 9, par = new Int32Array(nT).map((_, i) => i);
  const find = i => { while (par[i] != i) i = par[i] = par[par[i]]; return i; }, byV = new Map();
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const i = (t * 3 + k) * 3, key = Math.round(P[i] * 1e3) + ',' + Math.round(P[i + 1] * 1e3) + ',' + Math.round(P[i + 2] * 1e3);
    if (byV.has(key)) { const a = find(byV.get(key)), b = find(t); if (a != b) par[a] = b; } else byV.set(key, t);
  }
  const comp = new Map(); for (let t = 0; t < nT; t++) { const r = find(t); (comp.get(r) || comp.set(r, []).get(r)).push(t); }
  if (comp.size < 2) return null;
  mesh.updateMatrixWorld(true);
  const pz = mesh.userData.pieza;
  return [...comp.values()].map((tris, i) => {
    const sg = subGeo(g, tris); sg.applyMatrix4(mesh.matrixWorld);
    const m = crearPieza(sg, { nombre: `${pz.nombre} · ${i + 1}`, material: pz.material, fachada: { ...pz.fachada }, uvAuto: pz.uvAuto, origen: pz.origen });
    if (pz.fachada.base != null) m.userData.pieza.fachada.base = +(new THREE.Vector3(0, pz.fachada.base, 0).applyMatrix4(mesh.matrixWorld).y - m.position.y).toFixed(3);
    return m;
  });
}
export function unir(list) {
  const n = list.reduce((s, g) => s + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
  for (const [k, w] of Object.entries(ATTRS)) {
    const a = new Float32Array(n * w); let o = 0;
    for (const g of list) { const A = g.attributes[k]; if (A) a.set(A.array, o * w); else if (k == 'color') a.fill(1, o * w, (o + g.attributes.position.count) * w); o += g.attributes.position.count; }
    out.setAttribute(k, new THREE.BufferAttribute(a, w));
  }
  return out;
}

// ---------- Datos derivados: huecos de fachada y UV en metros ----------
// Recalcula, por cada cara plana de la pieza (en coordenadas del mundo), los datos que usa el shader de fachada de v0.7:
// aWall = (vano, altura sobre la base, largo, nº de vanos), aFac = (ancho de vano, alto, estilo, semilla), UV en metros.
// Las caras horizontales quedan sin huecos. Es lo mismo que hace buildings.js con cada lado de la huella.
export function recalcularFachada(mesh) {
  const g = mesh.geometry, P = g.attributes.position, n = P.count, pz = mesh.userData.pieza, f = pz.fachada;
  mesh.updateMatrixWorld(true);
  const W = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z; }
  const AW = g.attributes.aWall.array, AF = g.attributes.aFac.array, UV = g.attributes.uv.array;
  const caras = separarPlanos({ attributes: { position: { array: W } } });
  for (const { n: nr, tris } of caras) {
    const vert = Math.abs(nr.y) < .5, h = new THREE.Vector3(-nr.z, 0, nr.x).normalize();
    const idx = tris.flatMap(t => [t * 3, t * 3 + 1, t * 3 + 2]);
    if (!vert) {   // cara horizontal: UV en planta, sin huecos
      for (const i of idx) { UV[i * 2] = W[i * 3]; UV[i * 2 + 1] = W[i * 3 + 2]; AW.fill(0, i * 4, i * 4 + 4); AF.fill(0, i * 4, i * 4 + 4); }
      continue;
    }
    let u0 = 1e9, u1 = -1e9, y0 = 1e9, y1 = -1e9; const U = new Map();
    for (const i of idx) { const u = W[i * 3] * h.x + W[i * 3 + 2] * h.z; U.set(i, u); u0 = Math.min(u0, u); u1 = Math.max(u1, u); y0 = Math.min(y0, W[i * 3 + 1]); y1 = Math.max(y1, W[i * 3 + 1]); }
    // Las plantas (cada 3 m) se cuentan desde el arranque del muro, aunque esté tapado por la casa vecina
    if (f.base != null) y0 = Math.min(y0, v.set(0, f.base, 0).applyMatrix4(mesh.matrixWorld).y);
    const L = u1 - u0, H = y1 - y0, nb = Math.max(1, Math.round(L / 3.2)), bw = L / nb, huecos = f.estilo >= 0 && L >= 1.6 && H > .5;
    for (const i of idx) {
      const u = U.get(i) - u0, y = W[i * 3 + 1] - y0;
      UV[i * 2] = u; UV[i * 2 + 1] = y;
      if (huecos) { AW.set([u / bw, y, L, nb], i * 4); AF.set([bw, H, f.estilo, f.semilla], i * 4); }
      else { AW.fill(0, i * 4, i * 4 + 4); AF.fill(0, i * 4, i * 4 + 4); }
    }
  }
  g.attributes.aWall.needsUpdate = g.attributes.aFac.needsUpdate = g.attributes.uv.needsUpdate = true;
}
// UV en metros por proyección según el eje dominante de cada triángulo (texturas de v0.7 a su escala real)
export function recalcularUV(mesh) {
  const g = mesh.geometry, P = g.attributes.position, UV = g.attributes.uv.array, n = P.count;
  mesh.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nr = new THREE.Vector3(), W = [a, b, c];
  for (let t = 0; t < n; t += 3) {
    for (let k = 0; k < 3; k++) W[k].fromBufferAttribute(P, t + k).applyMatrix4(mesh.matrixWorld);
    nr.subVectors(b, a).cross(c.clone().sub(a)); const ax = Math.abs(nr.x), ay = Math.abs(nr.y), az = Math.abs(nr.z);
    for (let k = 0; k < 3; k++) { const p = W[k], uv = ay >= ax && ay >= az ? [p.x, p.z] : ax >= az ? [p.z, p.y] : [p.x, p.y]; UV[(t + k) * 2] = uv[0]; UV[(t + k) * 2 + 1] = uv[1]; }
  }
  g.attributes.uv.needsUpdate = true;
}
// Tras mover vértices o escalar: normales planas y, si toca, huecos y UV de nuevo
export function actualizarDerivados(mesh, cambioForma = true) {
  const pz = mesh.userData.pieza;
  if (cambioForma) { mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    if (pz.material.kind == 'fachada') pz.fachada.auto = true; else if (pz.material.kind != 'color') pz.uvAuto = true; }
  if (pz.material.kind == 'fachada' && pz.fachada.auto) recalcularFachada(mesh);
  else if (pz.uvAuto) recalcularUV(mesh);
}
export function pintar(mesh, hex) {   // un solo color para toda la pieza
  const c = new THREE.Color(hex), C = mesh.geometry.attributes.color;
  for (let i = 0; i < C.count; i++) C.setXYZ(i, c.r, c.g, c.b);
  C.needsUpdate = true;
}
export function colorDe(mesh) {   // color más frecuente de la pieza (para el selector)
  const C = mesh.geometry.attributes.color, cnt = new Map(); let best = null, bn = 0;
  for (let i = 0; i < C.count; i += 3) { const k = '#' + new THREE.Color(C.getX(i), C.getY(i), C.getZ(i)).getHexString(); const v = (cnt.get(k) || 0) + 1; cnt.set(k, v); if (v > bn) { bn = v; best = k; } }
  return best || '#ffffff';
}

// ---------- Archivo .forge.json ----------
const R = (a, d) => Array.from(a, x => Math.round(x * d) / d);
export function serializar(piezas, meta) {
  return {
    formato: FORMATO, version: VERSION, ...meta, actualizado: new Date().toISOString(),
    marco: 'Plano local de v0.7: x = este, y = altura (m, ortométrica), z = sur; origen = origin (lon/lat)',
    objetos: piezas.map(m => {
      const pz = m.userData.pieza, A = m.geometry.attributes;
      return { id: pz.id, nombre: pz.nombre, origen: pz.origen, visible: m.visible, material: pz.material, fachada: pz.fachada, uvAuto: pz.uvAuto,
        transform: { p: R(m.position.toArray(), 1e4), q: R(m.quaternion.toArray(), 1e7), s: R(m.scale.toArray(), 1e5) },
        geo: { position: R(A.position.array, 1e4), normal: R(A.normal.array, 1e3), uv: R(A.uv.array, 1e4), color: R(A.color.array, 1e4),
          aWall: R(A.aWall.array, 1e4), aFac: R(A.aFac.array, 1e4) } };
    }),
  };
}
export function deserializar(F) {
  return F.objetos.map(o => {
    const g = new THREE.BufferGeometry();
    for (const [k, w] of Object.entries(ATTRS)) if (o.geo[k]) g.setAttribute(k, new THREE.Float32BufferAttribute(o.geo[k], w));
    const mesh = new THREE.Mesh(completar(g), material(o.material));
    mesh.userData.pieza = { id: o.id, nombre: o.nombre, origen: o.origen, material: o.material, fachada: o.fachada || { estilo: -1, semilla: 0, auto: false }, uvAuto: !!o.uvAuto };
    mesh.name = o.nombre; mesh.visible = o.visible !== false;
    const t = o.transform || {}; if (t.p) mesh.position.fromArray(t.p); if (t.q) mesh.quaternion.fromArray(t.q); if (t.s) mesh.scale.fromArray(t.s);
    return mesh;
  });
}
