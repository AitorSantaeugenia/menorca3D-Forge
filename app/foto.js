// «Calcar desde foto»: a partir de una foto de la fachada, recrea la pared con las piezas de Forge.
//  1. Esquinas: se marcan las 4 esquinas de la pared en la foto y se endereza (homografía) a la medida real de la pared.
//     La foto enderezada incluye también una franja por encima de la pared, para los remates (frontones, pretiles…).
//  2. Calcar: sobre la foto enderezada se marcan
//     · huecos (ventana, puerta, persiana, balcón…), con recercado opcional, recto o en arco;
//     · detalles: cornisa o moldura, zócalo, letras en relieve y siluetas (remates, placas, escudos…).
//     El color de cada cosa sale de la foto.
//  3. Aplicar: se colocan las piezas en la pared, a escala. Opcional: quitar los huecos automáticos de v0.7, pintar la pared
//     con el color de la foto o usar la foto como textura (esto último se publica: sin personas ni matrículas).
// La foto no sale del navegador salvo que se use como textura.
// TODO (más adelante): detección automática de huecos con un modelo de visión (opción 3). Necesita un servidor intermedio
// para no publicar la clave de la API; propondría los recuadros y el colaborador solo los corregiría.
import * as THREE from 'three';
import { crearPieza, pintar, actualizarDerivados, completar, FOTOS } from './casa.js';
import { HUECOS, hueco, silueta, conColor, caja, unirGeo } from './primitivas.js';
import { FUENTES, geoTexto } from './letras.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const R2 = x => Math.round(x * 100) / 100;
const DETALLES = [['cornisa', 'Cornisa / moldura', '#f4f1e8'], ['zocalo', 'Zócalo', '#b9a27a'], ['texto', 'Letras', '#ff6b6b'], ['silueta', 'Silueta (remate, placa…)', '#ffd43b']];
const HERR = [...HUECOS, ...DETALLES];
const NOMBRE = Object.fromEntries(HERR.map(([k, n]) => [k, n])), COLOR = Object.fromEntries(HERR.map(([k, , c]) => [k, c]));
const ES_HUECO = new Set(HUECOS.map(h => h[0]));
const ACABADOS = [['color', 'Color de la foto'], ['sillar', 'Sillería de marés'], ['sillarejo', 'Sillarejo de marés'], ['aplacado', 'Aplacado de lajas'], ['piedra_seca', 'Piedra seca']];
const EXTRA = 2.5;   // metros de foto por encima de la pared, para remates

// ---------- Geometría de la pared ----------
// Marco de una pieza vertical: normal hacia fuera (la cara que se ve), eje «derecha» al mirarla de frente, medidas y
// pos(u, v, off) → punto del mundo a u m del borde izquierdo, v m sobre la base y off m por fuera de la cara.
export function marcoPared(mesh, nVista, centro) {
  mesh.updateMatrixWorld(true);
  const P = mesh.geometry.attributes.position, pts = [];
  for (let i = 0; i < P.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld));
  let n = nVista ? nVista.clone() : null;
  if (!n) {   // normal media de las caras casi verticales, ponderada por área
    n = new THREE.Vector3(); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t + 2 < pts.length; t += 3) { a.subVectors(pts[t + 1], pts[t]); b.subVectors(pts[t + 2], pts[t]); c.crossVectors(a, b); if (Math.abs(c.y) < .3 * c.length()) n.add(c.x * n.x + c.z * n.z < 0 ? c.negate() : c); }
  }
  n.y = 0; if (n.lengthSq() < 1e-8) return null; n.normalize();
  if (!nVista && centro) {   // sin clic en la pared: hacia fuera de la casa
    const m = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
    if ((m.x - centro.x) * n.x + (m.z - centro.z) * n.z < 0) n.negate();
  }
  const r = new THREE.Vector3(n.z, 0, -n.x), up = new THREE.Vector3(0, 1, 0);
  let u0 = Infinity, u1 = -Infinity, y0 = Infinity, y1 = -Infinity, d0 = Infinity, d1 = -Infinity;
  for (const p of pts) { const u = p.dot(r), d = p.dot(n); u0 = Math.min(u0, u); u1 = Math.max(u1, u); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); d0 = Math.min(d0, d); d1 = Math.max(d1, d); }
  const W = u1 - u0, H = y1 - y0;
  if (W < .5 || H < .5) return null;
  // matriz: coordenadas de la pared (u derecha, v arriba, z hacia fuera) → mundo
  const mat = new THREE.Matrix4().makeBasis(r, up, n).setPosition(new THREE.Vector3().addScaledVector(r, u0).addScaledVector(up, y0).addScaledVector(n, d1));
  return { n, r, W, H, grosor: d1 - d0, u0, y0, d: d1, ang: Math.atan2(n.x, n.z), mat,
    pos: (u, v, off = 0) => new THREE.Vector3().addScaledVector(r, u0 + u).addScaledVector(up, y0 + v).addScaledVector(n, d1 + off) };
}
export const esPared = (mesh, nVista) => { const M = marcoPared(mesh, nVista, null); return !!M && M.grosor < 1.2; };

// ---------- Homografía (4 puntos) ----------
function homografia(src, dst) {   // H tal que H·src[i] ≈ dst[i]
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {   // Gauss con pivote parcial
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 8; r++) if (r != c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  return [...b.map((v, i) => v / A[i][i]), 1];
}
// src: ImageData de la foto; esq: [↖, ↗, ↘, ↙] de la pared en píxeles de la foto. Salida de Wpx × Hpx con la pared
// ocupando desde y = top hasta abajo (lo de encima, hasta y = 0, es la franja para remates).
function enderezar(src, esq, Wpx, Hpx, top) {
  const H = homografia([[0, top], [Wpx, top], [Wpx, Hpx], [0, Hpx]], esq); if (!H) return null;
  const out = new ImageData(Wpx, Hpx), S = src.data, O = out.data, sw = src.width, sh = src.height;
  for (let y = 0; y < Hpx; y++) for (let x = 0; x < Wpx; x++) {
    const X = x + .5, Y = y + .5, w = H[6] * X + H[7] * Y + 1, fx = (H[0] * X + H[1] * Y + H[2]) / w - .5, fy = (H[3] * X + H[4] * Y + H[5]) / w - .5;
    const o = (y * Wpx + x) * 4;
    if (w <= 0 || fx < 0 || fy < 0 || fx > sw - 1 || fy > sh - 1) { O[o] = O[o + 1] = O[o + 2] = 40; O[o + 3] = 255; continue; }
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy, i00 = (iy * sw + ix) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
    for (let k = 0; k < 3; k++) O[o + k] = (S[i00 + k] * (1 - ax) + S[i10 + k] * ax) * (1 - ay) + (S[i01 + k] * (1 - ax) + S[i11 + k] * ax) * ay;
    O[o + 3] = 255;
  }
  return out;
}
// Color mediano de una zona (en píxeles), opcionalmente excluyendo recuadros [x0, y0, x1, y1]
export function mediana(img, x0, y0, x1, y1, fuera = []) {
  const R = [], G = [], B = [], paso = Math.max(1, Math.floor(Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / 4000)));
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, y1); y += paso) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, x1); x += paso) {
    if (fuera.some(f => x >= f[0] && x <= f[2] && y >= f[1] && y <= f[3])) continue;
    const o = (y * img.width + x) * 4; R.push(img.data[o]); G.push(img.data[o + 1]); B.push(img.data[o + 2]);
  }
  if (!R.length) return '#ffffff';
  const m = a => a.sort((p, q) => p - q)[a.length >> 1];
  return '#' + [m(R), m(G), m(B)].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
export function aCanvas(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0); return c; }
export function leerFoto(f) {   // → canvas (máx. 2400 px) e ImageData
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => {
      const s = Math.min(1, 2400 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      ok({ img: c, src: g.getImageData(0, 0, c.width, c.height) });
    };
    im.onerror = () => ko(new Error('No se pudo abrir esa imagen.'));
    im.src = url;
  });
}
const dentroPoli = (u, v, P) => { let d = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > v) != (P[j][1] > v) && u < (P[j][0] - P[i][0]) * (v - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) d = !d; return d; };
// Quita puntos repetidos seguidos (el doble clic añade dos) y el último si coincide con el primero
export const sinRepetidos = P => { const o = P.filter((p, i) => !i || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 1e-3); if (o.length > 2 && Math.hypot(o[0][0] - o.at(-1)[0], o[0][1] - o.at(-1)[1]) < 1e-3) o.pop(); return o; };
const limitesPoli = it => { const us = it.pts.map(p => p[0]), vs = it.pts.map(p => p[1]); it.u0 = Math.min(...us); it.u1 = Math.max(...us); it.v0 = Math.min(...vs); it.v1 = Math.max(...vs); };

// ---------- Ventana del calco ----------
let st = null;   // estado mientras está abierta
export function abrirCalco({ ed, mesh, normal, toast }) {
  const caja3 = new THREE.Box3(); for (const o of ed.piezas()) if (o.visible) caja3.expandByObject(o);
  const M = marcoPared(mesh, normal, caja3.getCenter(new THREE.Vector3()));
  if (!M || M.grosor > 1.2) return toast('Elige una sola pared (una pieza vertical) para calcarla desde una foto.');
  const pz = mesh.userData.pieza;
  st = { ed, mesh, M, toast, normal, paso: 1, img: null, src: null, esq: null, recto: null, k: 1, E: EXTRA, Hv: M.H + EXTRA, items: [], sel: -1, tipo: 'ventana',
    arrastre: null, poli: null, opt: { quitarAuto: pz.material.kind == 'fachada', pintar: true, textura: false } };
  montar('📷 Calcar desde foto', `${esc(pz.nombre)} · ${R2(M.W)} × ${R2(M.H)} m`, 'Haz o elige una foto de esta pared, lo más de frente posible.', { abajo, mover, arriba, dblclick: cerrarPoli },
    teclas, () => st, f => cargarFoto(f), pintarLado, dibujar, () => { st = null; });
}

// Infraestructura de la ventana (compartida con objeto.js)
let montado = null;
export function montar(titulo, info, textoVacio, punteros, fnTeclas, getSt, fnFoto, fnLado, fnDibujar, alCerrar) {
  let el = $('calco');
  if (!el) { el = document.createElement('div'); el.id = 'calco'; document.body.appendChild(el); }
  el.innerHTML = `<div class="cl-cab"><b>${titulo}</b><span class="cl-info">${info}</span><div class="sp"></div><button id="clCerrar">Cerrar</button></div>
    <div class="cl-cuerpo"><div class="cl-lienzo" id="clLienzo"><canvas id="clCanvas"></canvas>
      <div class="cl-vacio" id="clVacio"><p>${textoVacio}<br><small>También puedes arrastrarla aquí.</small></p><button class="prim" id="clElegir">Elegir foto…</button>
      <p class="cl-nota">La foto se queda en tu navegador: solo sirve de guía. Usa fotos tuyas o de amigos (no de Google Street View).</p></div></div>
      <div class="cl-lado" id="clLado"></div></div><input id="clFile" type="file" accept="image/*" hidden>`;
  el.classList.add('open');
  const cerrarYa = () => cerrarVentana();
  $('clCerrar').onclick = cerrarYa; $('clElegir').onclick = () => $('clFile').click();
  $('clFile').onchange = e => { const f = e.target.files[0]; if (f) fnFoto(f); e.target.value = ''; };
  const L = $('clLienzo');
  L.ondragover = e => e.preventDefault(); L.ondrop = e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) fnFoto(f); };
  const cv = $('clCanvas');
  cv.onpointerdown = punteros.abajo; cv.onpointermove = punteros.mover; cv.onpointerup = cv.onpointercancel = punteros.arriba; cv.ondblclick = punteros.dblclick || null;
  const tk = e => { if (!getSt()) return; e.stopImmediatePropagation(); if (e.target.tagName == 'INPUT' || e.target.tagName == 'SELECT' || e.target.tagName == 'TEXTAREA') return; if (e.key == 'Escape' && fnTeclas(e) !== true) cerrarYa(); else if (e.key != 'Escape') fnTeclas(e); };
  const parar = e => { if (getSt()) e.stopImmediatePropagation(); };
  addEventListener('keydown', tk, true); addEventListener('keyup', parar, true); addEventListener('resize', fnDibujar);
  montado = { tk, parar, fnDibujar, alCerrar };
  fnLado(); fnDibujar();
}
export function cerrarVentana() {
  const el = $('calco'); if (el) { el.classList.remove('open'); el.innerHTML = ''; }
  if (montado) { removeEventListener('keydown', montado.tk, true); removeEventListener('keyup', montado.parar, true); removeEventListener('resize', montado.fnDibujar); const f = montado.alCerrar; montado = null; f && f(); }
}
// Lienzo: tamaño, encaje de la imagen y conversión puntero → píxel de imagen
export function prepararLienzo(fuente) {
  const cv = $('clCanvas'), L = $('clLienzo'); if (!cv || !L) return null;
  const dpr = devicePixelRatio || 1, W = L.clientWidth, H = L.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!fuente) return { g };
  const s = Math.min((W - 40) / fuente.width, (H - 40) / fuente.height), ox = (W - fuente.width * s) / 2, oy = (H - fuente.height * s) / 2;
  g.imageSmoothingQuality = 'high'; g.drawImage(fuente, ox, oy, fuente.width * s, fuente.height * s);
  vista = { s, ox, oy };
  return { g, s, ox, oy, P: ([x, y]) => [ox + x * s, oy + y * s] };
}
export function lupa(g, img, q) {
  const R = 70, z = 4, cx = R + 12, cy = R + 12;
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  g.drawImage(img, q[0] - R / z, q[1] - R / z, 2 * R / z, 2 * R / z, cx - R, cy - R, 2 * R, 2 * R);
  g.strokeStyle = '#ffc828'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  g.restore(); g.strokeStyle = '#ffc828'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
}
export let vista = { s: 1, ox: 0, oy: 0 };   // imagen → pantalla
export const enImagen = e => { const b = e.target.getBoundingClientRect(); return [(e.clientX - b.left - vista.ox) / vista.s, (e.clientY - b.top - vista.oy) / vista.s]; };

function teclas(e) {
  if (e.key == 'Escape') {
    if (st.poli) { st.poli = null; dibujar(); return true; }
    if (st.sel >= 0) { st.sel = -1; pintarLado(); dibujar(); return true; }
    return false;
  }
  if (e.key == 'Enter' && st.poli) { cerrarPoli(); return; }
  if ((e.key == 'Delete' || e.key == 'Backspace') && st.paso == 2 && st.sel >= 0) { st.items.splice(st.sel, 1); st.sel = -1; pintarLado(); dibujar(); e.preventDefault(); }
}
async function cargarFoto(f) {
  try {
    const { img, src } = await leerFoto(f);
    st.img = img; st.src = src;
    const w = img.width, h = img.height; st.esq = [[w * .2, h * .3], [w * .8, h * .3], [w * .8, h * .85], [w * .2, h * .85]];
    st.paso = 1; st.recto = null; st.items = []; st.sel = -1; st.poli = null;
    $('clVacio').style.display = 'none'; pintarLado(); dibujar();
  } catch (err) { st.toast(err.message); }
}

// ---------- Panel lateral ----------
function pintarLado() {
  const L = $('clLado'); if (!L || !st) return;
  if (!st.img) { L.innerHTML = `<h3>Cómo funciona</h3><ol class="cl-pasos"><li><b>Esquinas:</b> marcas las 4 esquinas de la pared en la foto y Forge la endereza a su medida real.</li>
    <li><b>Calcar:</b> marcas encima las ventanas, puertas, persianas y balcones (con su recercado), la cornisa, el zócalo, letras y remates.</li><li><b>Aplicar:</b> Forge los coloca en la pared con sus piezas, a escala y con los colores de la foto.</li></ol>`; return; }
  if (st.paso == 1) {
    L.innerHTML = `<h3>1 · Esquinas</h3><p>Arrastra los cuatro puntos a las esquinas de la pared en la foto: <b>↖ arriba izquierda</b>, ↗, ↘ y ↙. Mientras arrastras ves una lupa.</p>
      <p class="cl-nota">Se calca la cara de la pared ${st.normal ? 'en la que hiciste clic' : 'que da hacia fuera de la casa'}. La pared mide ${R2(st.M.W)} × ${R2(st.M.H)} m (Catastro): marca su borde de arriba aunque encima haya un remate o un pretil. Lo que hay por encima (hasta ${R2(st.E)} m) también se podrá calcar.</p>
      <div class="pie"><button id="clOtra">Otra foto</button><button class="prim" id="clEnd">Enderezar →</button></div>`;
    $('clOtra').onclick = () => $('clFile').click();
    $('clEnd').onclick = () => {
      const k = Math.min(120, 1400 / Math.max(st.M.W, st.Hv)), Wp = Math.max(8, Math.round(st.M.W * k)), Hp = Math.max(8, Math.round(st.Hv * k));
      const r = enderezar(st.src, st.esq, Wp, Hp, Math.round(st.E * k)); if (!r) return st.toast('Las esquinas no forman un cuadrilátero válido.');
      st.recto = r; st.k = k; st.paso = 2; st.sel = -1; pintarLado(); dibujar();
    };
    return;
  }
  const cuenta = HERR.map(([t, n]) => [n, st.items.filter(r => r.tipo == t).length]).filter(x => x[1]).map(([n, c]) => `${c} × ${n.toLowerCase()}`).join(' · ');
  const S = st.items[st.sel], hayHuecos = st.items.some(i => ES_HUECO.has(i.tipo));
  const btn = ([t, n, c]) => `<button data-t="${t}" class="${st.tipo == t ? 'on' : ''}"><i style="background:${c}"></i>${n}</button>`;
  L.innerHTML = `<h3>2 · Calcar</h3><p>${st.tipo == 'silueta' ? 'Haz clic punto a punto por el contorno. Para cerrarla, clic en el primer punto, doble clic o <kbd>Intro</kbd>.' : 'Elige qué marcar y arrastra sobre la foto.'} Clic en una marca para elegirla; elegida, se mueve arrastrándola. <kbd>Supr</kbd> la borra.</p>
    <div class="cl-grupo">Huecos</div><div class="cl-tipos">${HUECOS.map(btn).join('')}</div>
    <div class="cl-grupo">Detalles</div><div class="cl-tipos">${DETALLES.map(btn).join('')}</div>
    ${S ? panelSel(S) : ''}
    ${hayHuecos ? '<div class="acc"><button id="clRecTodos" title="Pone recercado a todos los huecos, con el color que haya alrededor en la foto">Recercado en todos los huecos</button></div>' : ''}
    <p class="cl-cuenta">${cuenta || 'Aún no has marcado nada.'}</p>
    <div class="bloque"><h3>La pared</h3>
      ${st.mesh.userData.pieza.material.kind == 'fachada' ? `<label class="chk"><input id="clQuitar" type="checkbox"${st.opt.quitarAuto ? ' checked' : ''}> Quitar las ventanas automáticas de v0.7</label>` : ''}
      <label class="chk"><input id="clPintar" type="checkbox"${st.opt.pintar ? ' checked' : ''}${st.opt.textura ? ' disabled' : ''}> Pintarla del color de la foto <span class="cl-sw" style="background:${colorPared()}"></span></label>
      <label class="chk"><input id="clTex" type="checkbox"${st.opt.textura ? ' checked' : ''}> Usar la foto como textura</label>
      ${st.opt.textura ? '<p class="cl-aviso">La foto se verá en el modelo público de Menorca3D: comprueba que no salgan personas, matrículas ni nada privado.</p>' : ''}</div>
    <div class="pie"><button id="clAtras">← Esquinas</button><button class="prim" id="clAplicar">Aplicar a la pared</button></div>`;
  L.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    const t = b.dataset.t; st.tipo = t; st.poli = null;
    if (S && ES_HUECO.has(S.tipo) && ES_HUECO.has(t)) { S.tipo = t; S.color = colorDe(S); }
    else st.sel = -1;
    pintarLado(); dibujar();
  });
  if (S) conectarSel(S);
  if ($('clRecTodos')) $('clRecTodos').onclick = () => { for (const it of st.items) if (ES_HUECO.has(it.tipo) && it.tipo != 'balcon') { it.rec = it.rec || { ancho: .18, arco: false }; it.rec.on = true; it.rec.color = colorRec(it); } pintarLado(); dibujar(); };
  if ($('clQuitar')) $('clQuitar').onchange = e => { st.opt.quitarAuto = e.target.checked; };
  $('clPintar').onchange = e => { st.opt.pintar = e.target.checked; };
  $('clTex').onchange = e => { st.opt.textura = e.target.checked; pintarLado(); };
  $('clAtras').onclick = () => { st.paso = 1; st.sel = -1; st.poli = null; pintarLado(); dibujar(); };
  $('clAplicar').onclick = aplicar;
}
const opts = (L, v) => L.map(([k, n]) => `<option value="${k}"${k == v ? ' selected' : ''}>${n}</option>`).join('');
function panelSel(S) {
  const medidas = `<div class="sub">${R2(S.u1 - S.u0)} × ${R2(S.v1 - S.v0)} m · a ${R2(S.v0)} m del suelo</div>`;
  let h = '';
  if (ES_HUECO.has(S.tipo)) {
    const rc = S.rec || {};
    h = `<div class="row"><label>Tipo</label><select id="clTipo">${opts(HUECOS, S.tipo)}</select></div>
      <div class="row"><label>Color</label><input id="clCol" type="color" value="${S.color}"></div>
      ${S.tipo == 'balcon' ? '' : `<label class="chk"><input id="clRec" type="checkbox"${rc.on ? ' checked' : ''}> Recercado (marco alrededor)</label>
      ${rc.on ? `<div class="row"><label>Ancho</label><div><input id="clRecA" type="number" min="5" max="60" step="1" value="${Math.round((rc.ancho || .18) * 100)}" style="width:70px"> cm</div></div>
      <div class="row"><label>Color</label><input id="clRecC" type="color" value="${rc.color || '#f4f1e8'}"></div>
      <label class="chk"><input id="clRecArco" type="checkbox"${rc.arco ? ' checked' : ''}> Arriba en arco</label>` : ''}`}`;
  } else if (S.tipo == 'cornisa') {
    h = `<div class="row"><label>Color</label><input id="clCol" type="color" value="${S.color}"></div>
      <div class="row"><label>Vuelo</label><div><input id="clSal" type="number" min="2" max="80" step="1" value="${Math.round(S.saliente * 100)}" style="width:70px"> cm</div></div>`;
  } else if (S.tipo == 'zocalo') {
    h = `<div class="row"><label>Acabado</label><select id="clAcab">${opts(ACABADOS, S.acabado)}</select></div>
      <div class="row"><label>Color</label><input id="clCol" type="color" value="${S.color}"></div>`;
  } else if (S.tipo == 'texto') {
    h = `<div class="row"><label>Texto</label><input id="clTxt" type="text" value="${esc(S.texto)}" placeholder="p. ej. 1933"></div>
      <div class="row"><label>Letra</label><select id="clFuente">${opts(FUENTES, S.fuente)}</select></div>
      <div class="row"><label>Color</label><input id="clCol" type="color" value="${S.color}"></div>
      <div class="row"><label>Relieve</label><div><input id="clRel" type="number" min="1" max="30" step="1" value="${Math.round(S.relieve * 100)}" style="width:70px"> cm</div></div>
      <p class="cl-nota">Las letras ocupan el alto del recuadro (y se encogen si no caben a lo ancho).</p>`;
  } else if (S.tipo == 'silueta') {
    h = `<div class="row"><label>Acabado</label><select id="clAcab">${opts(ACABADOS, S.acabado)}</select></div>
      <div class="row"><label>Color</label><input id="clCol" type="color" value="${S.color}"></div>
      <div class="row"><label>Grosor</label><div><input id="clGro" type="number" min="2" max="100" step="1" value="${Math.round(S.grosor * 100)}" style="width:70px"> cm</div></div>
      <p class="cl-nota">${S.pts.length} puntos. Sirve para remates, frontones, placas, escudos o relieves.</p>`;
  }
  return `<div class="bloque"><h3>${esc(NOMBRE[S.tipo])}</h3>${h}${medidas}<div class="acc"><button id="clBorrar" class="peligro">Borrar</button></div></div>`;
}
function conectarSel(S) {
  const on = (id, ev, f) => { const el = $(id); if (el) el[ev] = e => { f(e.target); dibujar(); }; };
  on('clTipo', 'onchange', t => { S.tipo = t.value; S.color = colorDe(S); pintarLado(); });
  on('clCol', 'onchange', t => { S.color = t.value; });
  on('clRec', 'onchange', t => { S.rec = S.rec || { ancho: .18, arco: false }; S.rec.on = t.checked; if (t.checked) S.rec.color = colorRec(S); pintarLado(); });
  on('clRecA', 'onchange', t => { S.rec.ancho = Math.max(.05, Math.min(.6, (+t.value || 18) / 100)); S.rec.color = colorRec(S); pintarLado(); });
  on('clRecC', 'onchange', t => { S.rec.color = t.value; });
  on('clRecArco', 'onchange', t => { S.rec.arco = t.checked; });
  on('clSal', 'onchange', t => { S.saliente = Math.max(.02, Math.min(.8, (+t.value || 12) / 100)); });
  on('clAcab', 'onchange', t => { S.acabado = t.value; });
  on('clTxt', 'oninput', t => { S.texto = t.value; });
  on('clFuente', 'onchange', t => { S.fuente = t.value; });
  on('clRel', 'onchange', t => { S.relieve = Math.max(.01, Math.min(.3, (+t.value || 4) / 100)); });
  on('clGro', 'onchange', t => { S.grosor = Math.max(.02, Math.min(1, (+t.value || 25) / 100)); });
  $('clBorrar').onclick = () => { st.items.splice(st.sel, 1); st.sel = -1; pintarLado(); dibujar(); };
}

// ---------- Lienzo ----------
function dibujar() {
  if (!st) return;
  const fuente = !st.img ? null : st.paso == 1 ? st.img : (st.cvRecto && st.cvRecto.src === st.recto ? st.cvRecto.c : (st.cvRecto = { src: st.recto, c: aCanvas(st.recto) }).c);
  const D = prepararLienzo(fuente); if (!D || !fuente) return;
  const { g, s, ox, oy, P } = D;
  if (st.paso == 1) {
    g.strokeStyle = '#ffc828'; g.lineWidth = 2; g.fillStyle = '#ffc82822'; g.beginPath();
    st.esq.forEach((q, i) => { const [x, y] = P(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); g.stroke();
    st.esq.forEach((q, i) => {
      const [x, y] = P(q); g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = st.arrastre && st.arrastre.i == i ? '#ffc828' : '#1b2027'; g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = '600 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('↖↗↘↙'[i], x, y - 20);
    });
    if (st.arrastre && st.arrastre.i != null) lupa(g, st.img, st.esq[st.arrastre.i]);
    return;
  }
  // paso 2: rejilla de 1 m, borde de la pared y marcas
  const k = st.k, Hv = st.Hv, Q = (u, v) => P([u * k, (Hv - v) * k]);
  g.strokeStyle = '#ffffff30'; g.lineWidth = 1; g.beginPath();
  for (let u = 1; u < st.M.W; u++) { const [x] = Q(u, 0); g.moveTo(x, oy); g.lineTo(x, oy + fuente.height * s); }
  for (let v = 1; v < Hv; v++) { const [, y] = Q(0, v); g.moveTo(ox, y); g.lineTo(ox + fuente.width * s, y); }
  g.stroke();
  const [, yTop] = Q(0, st.M.H); g.strokeStyle = '#ffc828aa'; g.setLineDash([8, 5]); g.beginPath(); g.moveTo(ox, yTop); g.lineTo(ox + fuente.width * s, yTop); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#ffc828'; g.font = '11px system-ui'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('borde superior de la pared (Catastro)', ox + fuente.width * s - 4, yTop - 3);
  const todos = st.arrastre && st.arrastre.nuevo ? [...st.items, st.arrastre.nuevo] : st.items;
  todos.forEach((r, i) => {
    const c = COLOR[r.tipo], sel = i == st.sel;
    g.strokeStyle = c; g.lineWidth = sel ? 3 : 2; g.setLineDash(sel ? [] : [5, 3]); g.fillStyle = c + '33';
    if (r.tipo == 'silueta') { g.beginPath(); r.pts.forEach((p, j) => { const [x, y] = Q(...p); j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); g.stroke(); }
    else {
      const [x0, y0] = Q(r.u0, r.v1), [x1, y1] = Q(r.u1, r.v0);
      g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (r.rec && r.rec.on) {   // recercado
        const a = r.rec.ancho, [X0, Y0] = Q(r.u0 - a, r.v1 + a), [X1, Y1] = Q(r.u1 + a, r.v0 - (r.tipo == 'puerta' || r.tipo == 'porton' ? 0 : a));
        g.setLineDash([2, 3]); g.strokeStyle = '#ffffffcc'; g.lineWidth = 1.5; g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
        if (r.rec.arco) { const w = r.u1 - r.u0, f = Math.min(.25 * w, .45), [xa, ya] = Q((r.u0 + r.u1) / 2, r.v1 + a + f); g.beginPath(); g.moveTo(X0, Y0); g.quadraticCurveTo(xa, ya - (Y0 - ya), X1, Y0); g.stroke(); }
      }
      if (r.tipo == 'texto' && r.texto) { g.fillStyle = '#fff'; g.font = `600 ${Math.max(10, (y1 - y0) * .7)}px ${r.fuente == 'sans' ? 'sans-serif' : 'serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r.texto, (x0 + x1) / 2, (y0 + y1) / 2); }
    }
    g.setLineDash([]);
    const [lx, ly] = Q(r.u0, r.v1); g.fillStyle = c; g.font = '600 11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    const t = NOMBRE[r.tipo] || r.tipo, tw = g.measureText(t).width + 8; g.fillRect(lx, ly - 16, tw, 16); g.fillStyle = '#111'; g.fillText(t, lx + 4, ly - 2);
  });
  if (st.poli && st.poli.length) {   // silueta a medio dibujar
    g.strokeStyle = COLOR.silueta; g.lineWidth = 2; g.beginPath();
    st.poli.forEach((p, j) => { const [x, y] = Q(...p); j ? g.lineTo(x, y) : g.moveTo(x, y); });
    if (st.cursor) { const [x, y] = Q(...st.cursor); g.lineTo(x, y); }
    g.stroke();
    st.poli.forEach((p, j) => { const [x, y] = Q(...p); g.beginPath(); g.arc(x, y, j ? 3.5 : 6, 0, 7); g.fillStyle = j ? COLOR.silueta : '#fff'; g.fill(); });
  }
}
const aMetros = ([x, y]) => [Math.max(0, Math.min(st.M.W, x / st.k)), Math.max(0, Math.min(st.Hv, st.Hv - y / st.k))];
function nuevoItem(tipo, u0, u1, v0, v1) {
  const it = { tipo, u0, u1, v0, v1 };
  if (tipo == 'cornisa') it.saliente = .12;
  if (tipo == 'zocalo') it.acabado = 'color';
  if (tipo == 'texto') { it.texto = ''; it.fuente = 'serif'; it.relieve = .04; }
  it.color = colorDe(it);
  return it;
}
function abajo(e) {
  if (!st || !st.img) return;
  const p = enImagen(e); e.target.setPointerCapture(e.pointerId);
  if (st.paso == 1) {
    let best = null, bd = 22 / vista.s;
    st.esq.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } });
    st.arrastre = { i: best }; dibujar(); return;
  }
  const [u, v] = aMetros(p);
  if (st.poli) {   // siguiente punto de la silueta (o cerrarla en el primero)
    const [x0, y0] = [st.poli[0][0] * st.k * vista.s, (st.Hv - st.poli[0][1]) * st.k * vista.s], [x1, y1] = [u * st.k * vista.s, (st.Hv - v) * st.k * vista.s];
    if (st.poli.length >= 3 && Math.hypot(x1 - x0, y1 - y0) < 12) return cerrarPoli();
    st.poli.push([u, v]); dibujar(); return;
  }
  // la marca más pequeña bajo el puntero: si ya está elegida, arrastrar la mueve; si no, un clic la elige y arrastrar dibuja otra
  let i = -1, amin = Infinity;
  st.items.forEach((r, j) => { if (r.tipo == 'silueta' ? dentroPoli(u, v, r.pts) : u >= r.u0 && u <= r.u1 && v >= r.v0 && v <= r.v1) { const a = (r.u1 - r.u0) * (r.v1 - r.v0); if (a < amin) { amin = a; i = j; } } });
  if (i >= 0 && i == st.sel) { st.arrastre = { mover: i, u, v, r0: JSON.parse(JSON.stringify(st.items[i])) }; return; }
  if (st.tipo == 'silueta') {   // con «Silueta», un clic empieza el contorno (salvo sobre otra silueta, que la elige)
    if (i >= 0 && st.items[i].tipo == 'silueta') { st.sel = i; pintarLado(); dibujar(); return; }
    st.sel = -1; st.poli = [[u, v]]; pintarLado(); dibujar(); return;
  }
  st.arrastre = { u, v, nuevo: null, candidato: i };
}
function mover(e) {
  if (!st || !st.img) return;
  const p = enImagen(e), A = st.arrastre;
  if (st.paso == 2 && st.poli) { st.cursor = aMetros(p); dibujar(); return; }
  if (!A) return;
  if (st.paso == 1) { if (A.i == null) return; st.esq[A.i] = [Math.max(0, Math.min(st.img.width, p[0])), Math.max(0, Math.min(st.img.height, p[1]))]; dibujar(); return; }
  const [u, v] = aMetros(p);
  if (A.mover != null) {
    const r = st.items[A.mover], w = A.r0.u1 - A.r0.u0, h = A.r0.v1 - A.r0.v0;
    const du = Math.max(-A.r0.u0, Math.min(st.M.W - w - A.r0.u0, u - A.u)), dv = Math.max(-A.r0.v0, Math.min(st.Hv - h - A.r0.v0, v - A.v));
    r.u0 = A.r0.u0 + du; r.u1 = r.u0 + w; r.v0 = A.r0.v0 + dv; r.v1 = r.v0 + h;
    if (r.pts) r.pts = A.r0.pts.map(([a, b]) => [a + du, b + dv]);
    A.movido = true; dibujar(); return;
  }
  A.nuevo = { tipo: st.tipo, u0: Math.min(A.u, u), u1: Math.max(A.u, u), v0: Math.min(A.v, v), v1: Math.max(A.v, v) }; dibujar();
}
function arriba() {
  if (!st || !st.arrastre) return;
  const A = st.arrastre; st.arrastre = null;
  if (st.paso == 2 && A.mover != null && A.movido) { const r = st.items[A.mover]; r.color = colorDe(r); if (r.rec && r.rec.on) r.rec.color = colorRec(r); pintarLado(); }
  if (st.paso == 2 && A.nuevo && A.nuevo.u1 - A.nuevo.u0 > .1 && A.nuevo.v1 - A.nuevo.v0 > .08) {
    const n = A.nuevo; st.items.push(nuevoItem(n.tipo, n.u0, n.u1, n.v0, n.v1)); st.sel = st.items.length - 1; pintarLado();
    if (n.tipo == 'texto') setTimeout(() => $('clTxt') && $('clTxt').focus(), 30);
  } else if (st.paso == 2 && A.mover == null) { st.sel = A.candidato; pintarLado(); }   // clic sin arrastrar: elige (o quita la elección)
  dibujar();
}
function cerrarPoli() {
  if (!st || !st.poli) return;
  const P = sinRepetidos(st.poli); st.poli = null; st.cursor = null;
  if (P.length < 3) { dibujar(); return; }
  const it = { tipo: 'silueta', pts: P, grosor: .25, acabado: 'color' }; limitesPoli(it); it.color = colorDe(it);
  st.items.push(it); st.sel = st.items.length - 1; pintarLado(); dibujar();
}
// Píxeles de la foto enderezada de un rectángulo en metros
const px = (u0, v0, u1, v1) => [u0 * st.k, (st.Hv - v1) * st.k, u1 * st.k, (st.Hv - v0) * st.k];
// Color de una marca: el centro (sin el marco) para persianas, puertas y portones; el de la pared alrededor no cuenta
function colorDe(r) {
  const mx = (r.u1 - r.u0) * .2, my = (r.v1 - r.v0) * .2;
  if (r.tipo == 'ventanaPersianas') {   // las persianas abiertas están a los lados de la ventana: se mira a izquierda y derecha
    const w = (r.u1 - r.u0) / 2, L = r.u0 - w * .8 > 0 ? [r.u0 - w * .8, r.u0 - w * .2] : [r.u1 + w * .2, r.u1 + w * .8];
    return mediana(st.recto, ...px(L[0], r.v0 + my, L[1], r.v1 - my));
  }
  if (r.tipo == 'texto' || r.tipo == 'silueta' || r.tipo == 'cornisa' || r.tipo == 'zocalo') {   // el color dominante de la marca
    if (r.tipo == 'silueta' && r.pts) {   // mediana de puntos dentro del polígono
      const R = [], G = [], B = [], img = st.recto, [x0, y0, x1, y1] = px(r.u0, r.v0, r.u1, r.v1), paso = Math.max(1, Math.floor(Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / 3000)));
      for (let y = Math.floor(y0); y < y1; y += paso) for (let x = Math.floor(x0); x < x1; x += paso) {
        if (!dentroPoli(x / st.k, st.Hv - y / st.k, r.pts) || x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        const o = (y * img.width + x) * 4; R.push(img.data[o]); G.push(img.data[o + 1]); B.push(img.data[o + 2]);
      }
      if (R.length) { const m = a => a.sort((p, q) => p - q)[a.length >> 1]; return '#' + [m(R), m(G), m(B)].map(v => v.toString(16).padStart(2, '0')).join(''); }
    }
    if (r.tipo == 'texto') return letraDe(r);
    return mediana(st.recto, ...px(r.u0, r.v0, r.u1, r.v1));
  }
  return mediana(st.recto, ...px(r.u0 + mx, r.v0 + my, r.u1 - mx, r.v1 - my));
}
// Letras: el color que más se aparta del fondo del recuadro (el fondo es la mediana)
function letraDe(r) {
  const fondo = new THREE.Color(mediana(st.recto, ...px(r.u0, r.v0, r.u1, r.v1))), img = st.recto, [x0, y0, x1, y1] = px(r.u0, r.v0, r.u1, r.v1);
  const L = [];
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, y1); y += 2) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, x1); x += 2) {
    const o = (y * img.width + x) * 4, d = Math.abs(img.data[o] / 255 - fondo.r) + Math.abs(img.data[o + 1] / 255 - fondo.g) + Math.abs(img.data[o + 2] / 255 - fondo.b);
    L.push([d, o]);
  }
  if (!L.length) return '#f4f1e8';
  L.sort((a, b) => b[0] - a[0]); const top = L.slice(0, Math.max(1, Math.floor(L.length * .12)));
  if (top[0][0] < .15) return '#f4f1e8';
  const m = k => { const a = top.map(t => img.data[t[1] + k]).sort((p, q) => p - q); return a[a.length >> 1]; };
  return '#' + [m(0), m(1), m(2)].map(v => v.toString(16).padStart(2, '0')).join('');
}
// Recercado: el color de la franja alrededor del hueco
function colorRec(r) {
  const a = (r.rec && r.rec.ancho) || .18;
  return mediana(st.recto, ...px(r.u0 - a, r.v0 - a, r.u1 + a, r.v1 + a), [px(r.u0, r.v0, r.u1, r.v1)]);
}
function colorPared() {
  if (!st.recto) return '#ffffff';
  const fuera = st.items.map(r => { const a = r.rec && r.rec.on ? r.rec.ancho : 0; return px(r.u0 - a, r.v0 - a, r.u1 + a, r.v1 + a); });
  return mediana(st.recto, ...px(0, 0, st.M.W, st.M.H), fuera);
}

// ---------- Piezas ----------
// Recercado: marco plano alrededor del hueco (sin travesaño abajo en puertas y portones), recto o con arco arriba
function geoRecercado(r) {
  const a = r.rec.ancho, abajo = !(r.tipo == 'puerta' || r.tipo == 'porton'), w = r.u1 - r.u0, f = r.rec.arco ? Math.min(.25 * w, .45) : 0, uc = (r.u0 + r.u1) / 2;
  const arco = (u0, u1, v, fl, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const u = u0 + (u1 - u0) * i / n, t = (u - uc) / ((u1 - u0) / 2); return [u, v + fl * (1 - t * t)]; });
  const ext = [[r.u0 - a, abajo ? r.v0 - a : r.v0], [r.u1 + a, abajo ? r.v0 - a : r.v0], ...arco(r.u1 + a, r.u0 - a, r.v1 + a, f)];
  const int = [[r.u0, r.v0], [r.u1, r.v0], ...arco(r.u1, r.u0, r.v1, f)];
  let s;
  if (abajo) { s = new THREE.Shape(ext.map(p => new THREE.Vector2(...p))); s.holes.push(new THREE.Path(int.slice().reverse().map(p => new THREE.Vector2(...p)))); }
  else {   // forma de U invertida
    const P = [[r.u0 - a, r.v0], [r.u0, r.v0], ...arco(r.u0, r.u1, r.v1, f), [r.u1, r.v0], [r.u1 + a, r.v0], ...arco(r.u1 + a, r.u0 - a, r.v1 + a, f)];
    s = new THREE.Shape(P.map(p => new THREE.Vector2(...p)));
  }
  return conColor(new THREE.ExtrudeGeometry(s, { depth: .05, bevelEnabled: false, curveSegments: 4 }), r.rec.color || '#f4f1e8').translate(0, 0, .005);
}
async function piezasDe(r) {   // → [{ nombre, g (en coordenadas de la pared), material, uvAuto }]
  const mat = (acab, color) => (acab && acab != 'color' ? { kind: acab, doble: false } : { kind: 'color', doble: false });
  if (r.tipo == 'cornisa') {
    const s = r.saliente, g = unirGeo([conColor(caja(r.u1 - r.u0, r.v1 - r.v0, s, (r.u0 + r.u1) / 2, r.v0, s / 2), r.color),
      conColor(caja(r.u1 - r.u0 + .06, Math.min(.08, (r.v1 - r.v0) * .4), s + .05, (r.u0 + r.u1) / 2, r.v1 - Math.min(.08, (r.v1 - r.v0) * .4), (s + .05) / 2), r.color)]);
    return [{ nombre: 'Cornisa', g, material: mat() }];
  }
  if (r.tipo == 'zocalo') {
    const tex = r.acabado != 'color';
    return [{ nombre: 'Zócalo', g: conColor(caja(r.u1 - r.u0, r.v1 - r.v0, .04, (r.u0 + r.u1) / 2, r.v0, .02), tex ? '#ffffff' : r.color), material: mat(r.acabado), uvAuto: tex }];
  }
  if (r.tipo == 'texto') {
    if (!String(r.texto || '').trim()) return [];
    const g = await geoTexto(r.texto, { fuente: r.fuente, alto: r.v1 - r.v0, relieve: r.relieve, ancho: r.u1 - r.u0 });
    if (!g) return [];
    g.translate((r.u0 + r.u1) / 2, r.v0, .005);
    return [{ nombre: `Letras «${String(r.texto).slice(0, 20)}»`, g: conColor(g, r.color), material: mat() }];
  }
  if (r.tipo == 'silueta') {
    const tex = r.acabado != 'color';
    return [{ nombre: 'Silueta', g: silueta(r.pts, r.grosor, tex ? '#ffffff' : r.color), material: mat(r.acabado), uvAuto: tex }];
  }
  return [];
}

// Lo que sobresale de la pared debajo de una marca (remates, cornisas, zócalos), para ponerla por delante y no enterrada
function fondoZ(r) {
  let z = 0;
  for (const o of st.items) {
    if (o === r || !(o.tipo == 'silueta' || o.tipo == 'cornisa' || o.tipo == 'zocalo')) continue;
    if (o.u1 <= r.u0 || o.u0 >= r.u1 || o.v1 <= r.v0 || o.v0 >= r.v1) continue;
    if (o.tipo == 'silueta' && !dentroPoli((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, o.pts)) continue;
    z = Math.max(z, o.tipo == 'silueta' ? o.grosor : o.tipo == 'cornisa' ? o.saliente : .04);
  }
  return z;
}

// ---------- Aplicar ----------
async function aplicar() {
  const { ed, mesh, M, items, opt } = st, pz = mesh.userData.pieza;
  if (!items.length && !opt.textura && !opt.pintar && !opt.quitarAuto) return st.toast('Marca al menos algo o elige qué hacer con la pared.');
  const sinTexto = items.filter(i => i.tipo == 'texto' && !String(i.texto || '').trim()).length;
  $('clAplicar').disabled = true; $('clAplicar').textContent = 'Colocando…';
  const colPared = colorPared();
  // La pared
  if (opt.textura) {
    const top = Math.round(st.E * st.k), alto = st.recto.height - top, s = Math.min(1, 1024 / Math.max(st.recto.width, alto)), c = document.createElement('canvas');
    c.width = Math.round(st.recto.width * s); c.height = Math.round(alto * s);
    c.getContext('2d').drawImage(aCanvas(st.recto), 0, top, st.recto.width, alto, 0, 0, c.width, c.height);   // solo la pared, sin la franja de encima
    const id = 'f' + crypto.randomUUID().replace(/-/g, '').slice(0, 10); FOTOS.set(id, c.toDataURL('image/jpeg', .82));
    ed.setMaterial(mesh, { kind: 'foto', foto: id, doble: pz.material.doble !== false });
    pz.uvAuto = false; pintar(mesh, '#ffffff');
    const P = mesh.geometry.attributes.position, UV = mesh.geometry.attributes.uv, v = new THREE.Vector3();   // UV 0..1 sobre el rectángulo de la pared
    mesh.updateMatrixWorld(true);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); UV.setXY(i, (v.dot(M.r) - M.u0) / M.W, (v.y - M.y0) / M.H); }
    UV.needsUpdate = true;
  } else {
    if (opt.quitarAuto && pz.material.kind == 'fachada') { pz.fachada.estilo = -1; pz.fachada.auto = true; actualizarDerivados(mesh, false); }
    if (opt.pintar) pintar(mesh, colPared);
  }
  const usados = new Set(ed.piezas().map(o => o.userData.pieza.nombre)), nuevas = [];
  const nombre = base => { let nom = base + ' (foto)', i = 2; while (usados.has(nom)) nom = `${base} (foto) ${i++}`; usados.add(nom); return nom; };
  const enPared = (g, datos) => { g.applyMatrix4(M.mat); nuevas.push(crearPieza(completar(g), { origen: 'nueva', fachada: { estilo: -1, semilla: 0, auto: false }, ...datos })); };
  for (const r of items) {
    if (ES_HUECO.has(r.tipo)) {   // huecos: piezas del catálogo a medida
      const partes = hueco(r.tipo, r.u1 - r.u0, r.v1 - r.v0, r.color), bb = new THREE.Box3();
      for (const x of partes) { x.g.computeBoundingBox(); bb.union(x.g.boundingBox); }
      const z0 = fondoZ(r), c = bb.getCenter(new THREE.Vector3()), pos = M.pos((r.u0 + r.u1) / 2, r.tipo == 'balcon' ? r.v0 - .15 : r.v0, .01 + z0);
      for (const x of partes) {
        x.g.translate(-c.x, -bb.min.y, -bb.min.z); x.g.rotateY(M.ang); x.g.translate(pos.x, pos.y, pos.z);
        nuevas.push(crearPieza(x.g, { nombre: nombre(x.nombre), origen: 'nueva', material: x.material, fachada: x.fachada, uvAuto: false }));
      }
      if (r.rec && r.rec.on && r.tipo != 'balcon') enPared(geoRecercado(r).translate(0, 0, z0), { nombre: nombre('Recercado'), material: { kind: 'color', doble: false } });
      continue;
    }
    const z0 = r.tipo == 'texto' ? fondoZ(r) : 0;
    try { for (const x of await piezasDe(r)) enPared(x.g.translate(0, 0, z0), { nombre: nombre(x.nombre), material: x.material, uvAuto: !!x.uvAuto }); }
    catch (err) { console.error(err); st.toast('No se pudo crear «' + esc(NOMBRE[r.tipo]) + '»: ' + esc(err.message), 6000); }
  }
  const n = items.length, toast = st.toast; cerrarVentana();
  if (nuevas.length) ed.añadir(nuevas, 'Calcar desde foto'); else ed.commit('Calcar desde foto');
  ed.seleccionar([mesh, ...nuevas]);
  toast((n ? `Calcada la pared: ${nuevas.length} pieza${nuevas.length != 1 ? 's' : ''} nueva${nuevas.length != 1 ? 's' : ''}. Puedes retocarlas como cualquier pieza (Ctrl+Z deshace).` : 'Pared actualizada desde la foto.')
    + (sinTexto ? ` ${sinTexto} recuadro${sinTexto > 1 ? 's' : ''} de letras sin texto no se ha${sinTexto > 1 ? 'n' : ''} colocado.` : ''), 7000);
}
