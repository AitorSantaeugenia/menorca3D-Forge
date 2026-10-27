// «Calcar desde foto»: a partir de una foto de la fachada, recrea la pared con las piezas de Forge.
//  1. Esquinas: se marcan las 4 esquinas de la pared en la foto y se endereza (homografía) a la medida real de la pared.
//  2. Calcar: sobre la foto enderezada se dibujan recuadros (ventana, puerta, persiana, balcón…). El color sale de la foto.
//  3. Aplicar: se colocan las piezas en la pared, a escala. Opcional: quitar los huecos automáticos de v0.7, pintar la pared
//     con el color de la foto o usar la foto como textura (esto último se publica: sin personas ni matrículas).
// La foto no sale del navegador salvo que se use como textura.
// TODO (más adelante): detección automática de huecos con un modelo de visión (opción 3). Necesita un servidor intermedio
// para no publicar la clave de la API; propondría los recuadros y el colaborador solo los corregiría.
import * as THREE from 'three';
import { crearPieza, pintar, actualizarDerivados, FOTOS } from './casa.js';
import { HUECOS, hueco } from './primitivas.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const R2 = x => Math.round(x * 100) / 100;
const NOMBRE = Object.fromEntries(HUECOS.map(([k, n]) => [k, n])), COLOR = Object.fromEntries(HUECOS.map(([k, , c]) => [k, c]));

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
  return { n, r, W, H, grosor: d1 - d0, u0, y0, d: d1, ang: Math.atan2(n.x, n.z),
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
function enderezar(src, esq, Wpx, Hpx) {   // src: ImageData de la foto; esq: [↖, ↗, ↘, ↙] en píxeles de la foto
  const H = homografia([[0, 0], [Wpx, 0], [Wpx, Hpx], [0, Hpx]], esq); if (!H) return null;
  const out = new ImageData(Wpx, Hpx), S = src.data, O = out.data, sw = src.width, sh = src.height;
  for (let y = 0; y < Hpx; y++) for (let x = 0; x < Wpx; x++) {
    const X = x + .5, Y = y + .5, w = H[6] * X + H[7] * Y + 1, fx = (H[0] * X + H[1] * Y + H[2]) / w - .5, fy = (H[3] * X + H[4] * Y + H[5]) / w - .5;
    const o = (y * Wpx + x) * 4;
    if (fx < 0 || fy < 0 || fx > sw - 1 || fy > sh - 1) { O[o] = O[o + 1] = O[o + 2] = 40; O[o + 3] = 255; continue; }
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy, i00 = (iy * sw + ix) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
    for (let k = 0; k < 3; k++) O[o + k] = (S[i00 + k] * (1 - ax) + S[i10 + k] * ax) * (1 - ay) + (S[i01 + k] * (1 - ax) + S[i11 + k] * ax) * ay;
    O[o + 3] = 255;
  }
  return out;
}
// Color mediano de una zona (en píxeles), opcionalmente excluyendo recuadros
function mediana(img, x0, y0, x1, y1, fuera = []) {
  const R = [], G = [], B = [], paso = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, y1); y += paso) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, x1); x += paso) {
    if (fuera.some(f => x >= f[0] && x <= f[2] && y >= f[1] && y <= f[3])) continue;
    const o = (y * img.width + x) * 4; R.push(img.data[o]); G.push(img.data[o + 1]); B.push(img.data[o + 2]);
  }
  if (!R.length) return '#ffffff';
  const m = a => a.sort((p, q) => p - q)[a.length >> 1];
  return '#' + [m(R), m(G), m(B)].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// ---------- Ventana del calco ----------
let st = null;   // estado mientras está abierta
export function abrirCalco({ ed, mesh, normal, toast }) {
  const caja = new THREE.Box3(); for (const o of ed.piezas()) if (o.visible) caja.expandByObject(o);
  const M = marcoPared(mesh, normal, caja.getCenter(new THREE.Vector3()));
  if (!M || M.grosor > 1.2) return toast('Elige una sola pared (una pieza vertical) para calcarla desde una foto.');
  const pz = mesh.userData.pieza;
  st = { ed, mesh, M, toast, normal, paso: 1, img: null, src: null, esq: null, recto: null, k: 1, rects: [], selR: -1, tipo: 'ventana', arrastre: null,
    opt: { quitarAuto: pz.material.kind == 'fachada', pintar: true, textura: false } };
  let el = $('calco');
  if (!el) { el = document.createElement('div'); el.id = 'calco'; document.body.appendChild(el); }
  el.innerHTML = `<div class="cl-cab"><b>📷 Calcar desde foto</b><span class="cl-info">${esc(pz.nombre)} · ${R2(M.W)} × ${R2(M.H)} m</span><div class="sp"></div><button id="clCerrar">Cerrar</button></div>
    <div class="cl-cuerpo"><div class="cl-lienzo" id="clLienzo"><canvas id="clCanvas"></canvas>
      <div class="cl-vacio" id="clVacio"><p>Haz o elige una foto de esta pared, lo más de frente posible.<br><small>También puedes arrastrarla aquí.</small></p><button class="prim" id="clElegir">Elegir foto…</button>
      <p class="cl-nota">La foto se queda en tu navegador: solo sirve de guía. Usa fotos tuyas (no de Google Street View).</p></div></div>
      <div class="cl-lado" id="clLado"></div></div><input id="clFile" type="file" accept="image/*" hidden>`;
  el.classList.add('open');
  $('clCerrar').onclick = cerrar; $('clElegir').onclick = () => $('clFile').click();
  $('clFile').onchange = e => { const f = e.target.files[0]; if (f) cargarFoto(f); e.target.value = ''; };
  const L = $('clLienzo');
  L.ondragover = e => { e.preventDefault(); }; L.ondrop = e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) cargarFoto(f); };
  const cv = $('clCanvas');
  cv.onpointerdown = abajo; cv.onpointermove = mover; cv.onpointerup = cv.onpointercancel = arriba;
  addEventListener('keydown', teclas, true); addEventListener('keyup', parar, true); addEventListener('resize', dibujar);
  pintarLado(); dibujar();
}
function cerrar() {
  const el = $('calco'); if (el) { el.classList.remove('open'); el.innerHTML = ''; }
  removeEventListener('keydown', teclas, true); removeEventListener('keyup', parar, true); removeEventListener('resize', dibujar); st = null;
}
const parar = e => { if (st) e.stopImmediatePropagation(); };
function teclas(e) {   // mientras el calco está abierto, el teclado no llega al editor 3D
  if (!st) return; e.stopImmediatePropagation();
  if (e.target.tagName == 'INPUT' || e.target.tagName == 'SELECT') return;
  if (e.key == 'Escape') { if (st.selR >= 0) { st.selR = -1; pintarLado(); dibujar(); } else cerrar(); }
  if ((e.key == 'Delete' || e.key == 'Backspace') && st.paso == 2 && st.selR >= 0) { st.rects.splice(st.selR, 1); st.selR = -1; pintarLado(); dibujar(); e.preventDefault(); }
}
function cargarFoto(f) {
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    const s = Math.min(1, 2400 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    st.img = c; st.src = g.getImageData(0, 0, c.width, c.height);
    const w = c.width, h = c.height; st.esq = [[w * .2, h * .2], [w * .8, h * .2], [w * .8, h * .8], [w * .2, h * .8]];
    st.paso = 1; st.recto = null; st.rects = []; st.selR = -1;
    $('clVacio').style.display = 'none'; pintarLado(); dibujar();
  };
  im.onerror = () => st.toast('No se pudo abrir esa imagen.');
  im.src = url;
}

// ---------- Panel lateral ----------
function pintarLado() {
  const L = $('clLado'); if (!L || !st) return;
  if (!st.img) { L.innerHTML = `<h3>Cómo funciona</h3><ol class="cl-pasos"><li><b>Esquinas:</b> marcas las 4 esquinas de la pared en la foto y Forge la endereza a su medida real.</li>
    <li><b>Calcar:</b> dibujas encima un recuadro por cada ventana, puerta, persiana o balcón.</li><li><b>Aplicar:</b> Forge los coloca en la pared con sus piezas, a escala y con los colores de la foto.</li></ol>`; return; }
  if (st.paso == 1) {
    L.innerHTML = `<h3>1 · Esquinas</h3><p>Arrastra los cuatro puntos a las esquinas de la pared en la foto: <b>↖ arriba izquierda</b>, ↗, ↘ y ↙. Mientras arrastras ves una lupa.</p>
      <p class="cl-nota">Se calca la cara de la pared ${st.normal ? 'en la que hiciste clic' : 'que da hacia fuera de la casa'}. La pared mide ${R2(st.M.W)} × ${R2(st.M.H)} m (Catastro). Si tiene frontón o un trozo más alto, marca el rectángulo que la contiene.</p>
      <div class="pie"><button id="clOtra">Otra foto</button><button class="prim" id="clEnd">Enderezar →</button></div>`;
    $('clOtra').onclick = () => $('clFile').click();
    $('clEnd').onclick = () => {
      const k = Math.min(120, 1400 / Math.max(st.M.W, st.M.H)), Wp = Math.max(8, Math.round(st.M.W * k)), Hp = Math.max(8, Math.round(st.M.H * k));
      const r = enderezar(st.src, st.esq, Wp, Hp); if (!r) return st.toast('Las esquinas no forman un cuadrilátero válido.');
      st.recto = r; st.k = k; st.paso = 2; st.selR = -1;
      st.colorPared = mediana(r, 0, 0, Wp, Hp); pintarLado(); dibujar();
    };
    return;
  }
  const cuenta = HUECOS.map(([t, n]) => [n, st.rects.filter(r => r.tipo == t).length]).filter(x => x[1]).map(([n, c]) => `${c} × ${n.toLowerCase()}`).join(' · ');
  const S = st.rects[st.selR];
  L.innerHTML = `<h3>2 · Calcar</h3><p>Elige el tipo y arrastra sobre la foto para marcar cada hueco. Clic en un recuadro para elegirlo y moverlo; <kbd>Supr</kbd> lo borra.</p>
    <div class="cl-tipos">${HUECOS.map(([t, n, c]) => `<button data-t="${t}" class="${st.tipo == t ? 'on' : ''}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>
    ${S ? `<div class="bloque"><h3>Recuadro elegido</h3><div class="row"><label>Tipo</label><select id="clTipo">${HUECOS.map(([t, n]) => `<option value="${t}"${t == S.tipo ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="row"><label>Color</label><input id="clCol" type="color" value="${S.color}"></div>
      <div class="sub">${R2(S.u1 - S.u0)} × ${R2(S.v1 - S.v0)} m · a ${R2(S.v0)} m del suelo</div><div class="acc"><button id="clBorrar" class="peligro">Borrar</button></div></div>` : ''}
    <p class="cl-cuenta">${cuenta || 'Aún no has marcado nada.'}</p>
    <div class="bloque"><h3>La pared</h3>
      ${st.mesh.userData.pieza.material.kind == 'fachada' ? `<label class="chk"><input id="clQuitar" type="checkbox"${st.opt.quitarAuto ? ' checked' : ''}> Quitar las ventanas automáticas de v0.7</label>` : ''}
      <label class="chk"><input id="clPintar" type="checkbox"${st.opt.pintar ? ' checked' : ''}${st.opt.textura ? ' disabled' : ''}> Pintarla del color de la foto <span class="cl-sw" style="background:${st.colorPared}"></span></label>
      <label class="chk"><input id="clTex" type="checkbox"${st.opt.textura ? ' checked' : ''}> Usar la foto como textura</label>
      ${st.opt.textura ? '<p class="cl-aviso">La foto se verá en el modelo público de Menorca3D: comprueba que no salgan personas, matrículas ni nada privado.</p>' : ''}</div>
    <div class="pie"><button id="clAtras">← Esquinas</button><button class="prim" id="clAplicar">Aplicar a la pared</button></div>`;
  L.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st.tipo = b.dataset.t; if (S) { S.tipo = st.tipo; } pintarLado(); dibujar(); });
  if (S) {
    $('clTipo').onchange = e => { S.tipo = e.target.value; pintarLado(); dibujar(); };
    $('clCol').onchange = e => { S.color = e.target.value; dibujar(); };
    $('clBorrar').onclick = () => { st.rects.splice(st.selR, 1); st.selR = -1; pintarLado(); dibujar(); };
  }
  if ($('clQuitar')) $('clQuitar').onchange = e => { st.opt.quitarAuto = e.target.checked; };
  $('clPintar').onchange = e => { st.opt.pintar = e.target.checked; };
  $('clTex').onchange = e => { st.opt.textura = e.target.checked; pintarLado(); };
  $('clAtras').onclick = () => { st.paso = 1; st.selR = -1; pintarLado(); dibujar(); };
  $('clAplicar').onclick = aplicar;
}

// ---------- Lienzo ----------
let vista = { s: 1, ox: 0, oy: 0 };   // imagen → pantalla
function dibujar() {
  if (!st) return;
  const cv = $('clCanvas'), L = $('clLienzo'); if (!cv || !L) return;
  const dpr = devicePixelRatio || 1, W = L.clientWidth, H = L.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!st.img) return;
  const fuente = st.paso == 1 ? st.img : (st.cvRecto && st.cvRecto.src === st.recto ? st.cvRecto.c : (st.cvRecto = { src: st.recto, c: aCanvas(st.recto) }).c);
  const s = Math.min((W - 40) / fuente.width, (H - 40) / fuente.height), ox = (W - fuente.width * s) / 2, oy = (H - fuente.height * s) / 2;
  vista = { s, ox, oy };
  g.imageSmoothingQuality = 'high'; g.drawImage(fuente, ox, oy, fuente.width * s, fuente.height * s);
  const P = ([x, y]) => [ox + x * s, oy + y * s];
  if (st.paso == 1) {
    g.strokeStyle = '#ffc828'; g.lineWidth = 2; g.fillStyle = '#ffc82822'; g.beginPath();
    st.esq.forEach((q, i) => { const [x, y] = P(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); g.stroke();
    st.esq.forEach((q, i) => {
      const [x, y] = P(q); g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = st.arrastre && st.arrastre.i == i ? '#ffc828' : '#1b2027'; g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = '600 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('↖↗↘↙'[i], x, y - 20);
    });
    if (st.arrastre && st.arrastre.i != null) {   // lupa
      const q = st.esq[st.arrastre.i], R = 70, z = 4, cx = R + 12, cy = R + 12;
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
      g.drawImage(st.img, q[0] - R / z, q[1] - R / z, 2 * R / z, 2 * R / z, cx - R, cy - R, 2 * R, 2 * R);
      g.strokeStyle = '#ffc828'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
      g.restore(); g.strokeStyle = '#ffc828'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    }
    return;
  }
  // paso 2: rejilla de 1 m y recuadros
  const k = st.k, Hm = st.M.H;
  g.strokeStyle = '#ffffff30'; g.lineWidth = 1; g.beginPath();
  for (let u = 1; u < st.M.W; u++) { const [x] = P([u * k, 0]); g.moveTo(x, oy); g.lineTo(x, oy + fuente.height * s); }
  for (let v = 1; v < Hm; v++) { const [, y] = P([0, (Hm - v) * k]); g.moveTo(ox, y); g.lineTo(ox + fuente.width * s, y); }
  g.stroke();
  const todos = st.arrastre && st.arrastre.nuevo ? [...st.rects, st.arrastre.nuevo] : st.rects;
  todos.forEach((r, i) => {
    const [x0, y0] = P([r.u0 * k, (Hm - r.v1) * k]), [x1, y1] = P([r.u1 * k, (Hm - r.v0) * k]), c = COLOR[r.tipo];
    g.fillStyle = c + '33'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = c; g.lineWidth = i == st.selR ? 3 : 2; g.setLineDash(i == st.selR ? [] : [5, 3]); g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
    g.fillStyle = c; g.font = '600 11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    const t = NOMBRE[r.tipo] || r.tipo, tw = g.measureText(t).width + 8; g.fillRect(x0, y0 - 16, tw, 16); g.fillStyle = '#111'; g.fillText(t, x0 + 4, y0 - 2);
    if (r.color) { g.fillStyle = r.color; g.fillRect(x1 - 12, y0 + 2, 10, 10); g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x1 - 12, y0 + 2, 10, 10); }
  });
}
function aCanvas(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0); return c; }
const enImagen = e => { const b = e.target.getBoundingClientRect(); return [(e.clientX - b.left - vista.ox) / vista.s, (e.clientY - b.top - vista.oy) / vista.s]; };
const aMetros = ([x, y]) => [Math.max(0, Math.min(st.M.W, x / st.k)), Math.max(0, Math.min(st.M.H, st.M.H - y / st.k))];
function abajo(e) {
  if (!st || !st.img) return;
  const p = enImagen(e); e.target.setPointerCapture(e.pointerId);
  if (st.paso == 1) {
    let best = null, bd = 22 / vista.s;
    st.esq.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } });
    st.arrastre = { i: best }; dibujar(); return;
  }
  const [u, v] = aMetros(p), i = st.rects.findIndex(r => u >= r.u0 && u <= r.u1 && v >= r.v0 && v <= r.v1);
  if (i >= 0) { st.selR = i; st.arrastre = { mover: i, u, v, r0: { ...st.rects[i] } }; pintarLado(); dibujar(); return; }
  st.selR = -1; st.arrastre = { u, v, nuevo: null }; pintarLado();
}
function mover(e) {
  if (!st || !st.arrastre) return;
  const p = enImagen(e), A = st.arrastre;
  if (st.paso == 1) { if (A.i == null) return; st.esq[A.i] = [Math.max(0, Math.min(st.img.width, p[0])), Math.max(0, Math.min(st.img.height, p[1]))]; dibujar(); return; }
  const [u, v] = aMetros(p);
  if (A.mover != null) {
    const r = st.rects[A.mover], w = A.r0.u1 - A.r0.u0, h = A.r0.v1 - A.r0.v0;
    r.u0 = Math.max(0, Math.min(st.M.W - w, A.r0.u0 + u - A.u)); r.u1 = r.u0 + w; r.v0 = Math.max(0, Math.min(st.M.H - h, A.r0.v0 + v - A.v)); r.v1 = r.v0 + h;
    A.movido = true; dibujar(); return;
  }
  A.nuevo = { tipo: st.tipo, u0: Math.min(A.u, u), u1: Math.max(A.u, u), v0: Math.min(A.v, v), v1: Math.max(A.v, v) }; dibujar();
}
function arriba() {
  if (!st || !st.arrastre) return;
  const A = st.arrastre; st.arrastre = null;
  if (st.paso == 2 && A.mover != null && A.movido) { const r = st.rects[A.mover]; r.color = colorDe(r); pintarLado(); }
  if (st.paso == 2 && A.nuevo && A.nuevo.u1 - A.nuevo.u0 > .2 && A.nuevo.v1 - A.nuevo.v0 > .2) {
    A.nuevo.color = colorDe(A.nuevo); st.rects.push(A.nuevo); st.selR = st.rects.length - 1; pintarLado();
  }
  dibujar();
}
// Color de un recuadro: el centro (sin el marco) para persianas, puertas y portones; el de la pared alrededor no cuenta
function colorDe(r) {
  const k = st.k, H = st.M.H, mx = (r.u1 - r.u0) * .2, my = (r.v1 - r.v0) * .2;
  if (r.tipo == 'ventanaPersianas') {   // las persianas abiertas están a los lados de la ventana: se mira a izquierda y derecha
    const w = (r.u1 - r.u0) / 2, y0 = (H - r.v1 + my) * k, y1 = (H - r.v0 - my) * k;
    const L = r.u0 - w * .8 > 0 ? [(r.u0 - w * .8) * k, (r.u0 - w * .2) * k] : [(r.u1 + w * .2) * k, (r.u1 + w * .8) * k];
    return mediana(st.recto, L[0], y0, L[1], y1);
  }
  return mediana(st.recto, (r.u0 + mx) * k, (H - r.v1 + my) * k, (r.u1 - mx) * k, (H - r.v0 - my) * k);
}

// ---------- Aplicar ----------
function aplicar() {
  const { ed, mesh, M, rects, opt } = st, pz = mesh.userData.pieza;
  if (!rects.length && !opt.textura && !opt.pintar && !opt.quitarAuto) return st.toast('Marca al menos un hueco o elige qué hacer con la pared.');
  // La pared
  if (opt.textura) {
    const s = Math.min(1, 1024 / Math.max(st.recto.width, st.recto.height)), c = document.createElement('canvas');
    c.width = Math.round(st.recto.width * s); c.height = Math.round(st.recto.height * s);
    c.getContext('2d').drawImage(aCanvas(st.recto), 0, 0, c.width, c.height);
    const id = 'f' + crypto.randomUUID().replace(/-/g, '').slice(0, 10); FOTOS.set(id, c.toDataURL('image/jpeg', .82));
    ed.setMaterial(mesh, { kind: 'foto', foto: id, doble: pz.material.doble !== false });
    pz.uvAuto = false; pintar(mesh, '#ffffff');
    const P = mesh.geometry.attributes.position, UV = mesh.geometry.attributes.uv, v = new THREE.Vector3();   // UV 0..1 sobre el rectángulo de la pared
    mesh.updateMatrixWorld(true);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); UV.setXY(i, (v.dot(M.r) - M.u0) / M.W, (v.y - M.y0) / M.H); }
    UV.needsUpdate = true;
  } else {
    if (opt.quitarAuto && pz.material.kind == 'fachada') { pz.fachada.estilo = -1; pz.fachada.auto = true; actualizarDerivados(mesh, false); }
    if (opt.pintar) pintar(mesh, st.colorPared);
  }
  // Los huecos
  const usados = new Set(ed.piezas().map(o => o.userData.pieza.nombre)), nuevas = [];
  for (const r of rects) {
    const partes = hueco(r.tipo, r.u1 - r.u0, r.v1 - r.v0, r.color), bb = new THREE.Box3();
    for (const x of partes) { x.g.computeBoundingBox(); bb.union(x.g.boundingBox); }
    const c = bb.getCenter(new THREE.Vector3()), pos = M.pos((r.u0 + r.u1) / 2, r.tipo == 'balcon' ? r.v0 - .15 : r.v0, .01);
    for (const x of partes) {
      x.g.translate(-c.x, -bb.min.y, -bb.min.z); x.g.rotateY(M.ang); x.g.translate(pos.x, pos.y, pos.z);
      let nom = x.nombre + ' (foto)', i = 2; while (usados.has(nom)) nom = `${x.nombre} (foto) ${i++}`; usados.add(nom);
      nuevas.push(crearPieza(x.g, { nombre: nom, origen: 'nueva', material: x.material, fachada: x.fachada, uvAuto: false }));
    }
  }
  const n = rects.length, toast = st.toast; cerrar();
  if (nuevas.length) ed.añadir(nuevas, 'Calcar desde foto'); else ed.commit('Calcar desde foto');
  ed.seleccionar([mesh, ...nuevas]);
  toast(n ? `Calcada la pared: ${n} hueco${n > 1 ? 's' : ''} colocado${n > 1 ? 's' : ''}. Puedes retocarlos como cualquier pieza (Ctrl+Z deshace).` : 'Pared actualizada desde la foto.', 6000);
}
