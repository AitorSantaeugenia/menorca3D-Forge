// «Árbol u objeto desde foto»: piezas sueltas (no pegadas a una pared) a partir de una foto.
//  1. Recorta: un recuadro alrededor del objeto y su altura real (o la de algo conocido: una puerta mide unos 2,1 m).
//  2. Cómo se hace:
//     · Árbol: especie (pino, olivo, palmera, ciprés o genérico); alto, ancho de copa y colores salen de la foto.
//     · De torno: se marca medio contorno (el lado derecho) y se hace girar: jarrones, pedestales, columnas, fuentes…
//     · Silueta: el contorno entero con grosor: esculturas o figuras vistas de frente, carteles…
//  3. Se coloca donde hiciste el último clic (o en el centro de la vista), mirando a la cámara.
import * as THREE from 'three';
import { crearPieza, completar } from './casa.js';
import { ESPECIES, arbol, torno, silueta } from './primitivas.js';
import { montar, cerrarVentana, prepararLienzo, enImagen, vista, mediana, leerFoto, sinRepetidos } from './foto.js';

const $ = id => document.getElementById(id);
const R2 = x => Math.round(x * 100) / 100;
const MODOS = [['arbol', '🌳 Árbol'], ['torno', '🏺 De torno (redondo)'], ['silueta', '🗿 Silueta con grosor']];
let st = null;

export function abrirObjeto({ ed, toast, punto }) {
  st = { ed, toast, punto, img: null, src: null, paso: 1, rect: null, alto: 3, modo: 'arbol', especie: 'pino', perfil: [], poli: [], cerrada: false, grosor: .3, arrastre: null };
  montar('📷 Árbol u objeto desde foto', 'Se coloca donde hiciste el último clic', 'Haz o elige una foto del árbol u objeto, de frente y entero.',
    { abajo, mover, arriba, dblclick: () => { if (st && st.modo == 'silueta' && st.poli.length >= 3) { st.poli = sinRepetidos(st.poli); st.cerrada = true; lado(); dibujar(); } } },
    teclas, () => st, cargar, lado, dibujar, () => { st = null; });
}
function teclas(e) {
  if (e.key == 'Escape') { if (st.paso == 2 && (st.poli.length || st.perfil.length)) { st.poli = []; st.perfil = []; st.cerrada = false; lado(); dibujar(); return true; } return false; }
  if (e.key == 'Enter' && st.modo == 'silueta' && st.poli.length >= 3) { st.poli = sinRepetidos(st.poli); st.cerrada = true; lado(); dibujar(); }
  if ((e.key == 'Backspace' || e.key == 'Delete') && st.paso == 2) { (st.modo == 'torno' ? st.perfil : st.poli).pop(); st.cerrada = false; lado(); dibujar(); e.preventDefault(); }
}
async function cargar(f) {
  try { const { img, src } = await leerFoto(f); Object.assign(st, { img, src, paso: 1, rect: null, perfil: [], poli: [], cerrada: false }); $('clVacio').style.display = 'none'; lado(); dibujar(); }
  catch (err) { st.toast(err.message); }
}
const mpp = () => st.alto / Math.max(1, st.rect[3] - st.rect[1]);   // metros por píxel
function autoArbol() {
  const [x0, y0, x1, y1] = st.rect, w = x1 - x0, h = y1 - y0;
  st.copa = mediana(st.src, x0 + w * .15, y0 + h * .05, x1 - w * .15, y0 + h * .55);
  st.tronco = mediana(st.src, x0 + w * .45, y1 - h * .2, x1 - w * .45, y1 - h * .02);
  st.anchoCopa = R2(w * mpp());
}

function lado() {
  const L = $('clLado'); if (!L || !st) return;
  if (!st.img) { L.innerHTML = `<h3>Cómo funciona</h3><ol class="cl-pasos"><li><b>Recorta</b> el objeto con un recuadro y escribe su altura real.</li>
    <li><b>Elige cómo hacerlo:</b> árbol (por especie), de torno (jarrones, pedestales, fuentes…) o silueta con grosor (esculturas, figuras).</li>
    <li><b>Colocar:</b> aparece donde hiciste el último clic en la escena, mirando a la cámara.</li></ol>`; return; }
  if (st.paso == 1) {
    L.innerHTML = `<h3>1 · Recorta</h3><p>Arrastra un recuadro que encierre el objeto entero, del suelo a lo más alto.</p>
      <div class="row"><label>Altura real</label><div><input id="obAlto" type="number" min=".2" max="60" step=".1" value="${st.alto}" style="width:80px"> m</div></div>
      <p class="cl-nota">Si no la sabes, compárala con algo conocido de la foto: una puerta mide unos 2,1 m y una planta de casa, unos 3 m.</p>
      <div class="pie"><button id="obOtra">Otra foto</button><button class="prim" id="obSig"${st.rect ? '' : ' disabled'}>Siguiente →</button></div>`;
    $('obAlto').onchange = e => { st.alto = Math.max(.2, +e.target.value || 3); };
    $('obOtra').onclick = () => $('clFile').click();
    $('obSig').onclick = () => { st.alto = Math.max(.2, +$('obAlto').value || 3); st.paso = 2; autoArbol(); st.color = mediana(st.src, ...centro(.25)); lado(); dibujar(); };
    return;
  }
  const m = st.modo;
  L.innerHTML = `<h3>2 · Cómo se hace</h3><div class="cl-tipos cl-modos">${MODOS.map(([k, n]) => `<button data-m="${k}" class="${m == k ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${m == 'arbol' ? `<div class="row"><label>Especie</label><select id="obEsp">${ESPECIES.map(([k, n]) => `<option value="${k}"${k == st.especie ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="row"><label>Alto</label><div><input id="obH" type="number" step=".1" value="${st.alto}" style="width:80px"> m</div></div>
      <div class="row"><label>Copa</label><div><input id="obC" type="number" step=".1" value="${st.anchoCopa}" style="width:80px"> m de ancho</div></div>
      <div class="row"><label>Colores</label><div><input id="obCc" type="color" value="${st.copa}" title="Copa"> <input id="obCt" type="color" value="${st.tronco}" title="Tronco"></div></div>`
    : m == 'torno' ? `<p>Haz clic por el <b>contorno derecho</b> del objeto, de abajo arriba. La línea discontinua es el eje: el perfil gira alrededor de ella.</p>
      <p class="cl-cuenta">${st.perfil.length} puntos${st.perfil.length < 2 ? ' (mínimo 2)' : ''} · <kbd>Supr</kbd> quita el último</p>
      <div class="row"><label>Color</label><input id="obCol" type="color" value="${st.color}"></div>`
    : `<p>Haz clic punto a punto por el contorno. Para cerrarlo: doble clic, <kbd>Intro</kbd> o clic en el primer punto.</p>
      <p class="cl-cuenta">${st.poli.length} puntos${st.cerrada ? ' · cerrada' : ''} · <kbd>Supr</kbd> quita el último</p>
      <div class="row"><label>Grosor</label><div><input id="obG" type="number" min="2" max="300" step="1" value="${Math.round(st.grosor * 100)}" style="width:80px"> cm</div></div>
      <div class="row"><label>Color</label><input id="obCol" type="color" value="${st.color}"></div>
      <p class="cl-nota">Se ve bien de frente; de lado es una plancha. Para figuras redondas usa «De torno».</p>`}
    <div class="pie"><button id="obAtras">← Recorte</button><button class="prim" id="obOk"${listo() ? '' : ' disabled'}>Colocar en la casa</button></div>`;
  L.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { st.modo = b.dataset.m; lado(); dibujar(); });
  const on = (id, f) => { const el = $(id); if (el) el.onchange = e => f(e.target.value); };
  on('obEsp', v => { st.especie = v; }); on('obH', v => { st.alto = Math.max(.5, +v || st.alto); }); on('obC', v => { st.anchoCopa = Math.max(.3, +v || st.anchoCopa); });
  on('obCc', v => { st.copa = v; }); on('obCt', v => { st.tronco = v; }); on('obCol', v => { st.color = v; }); on('obG', v => { st.grosor = Math.max(.02, Math.min(3, (+v || 30) / 100)); });
  $('obAtras').onclick = () => { st.paso = 1; lado(); dibujar(); };
  $('obOk').onclick = colocar;
}
const listo = () => st.modo == 'arbol' || (st.modo == 'torno' && st.perfil.length >= 2) || (st.modo == 'silueta' && st.cerrada && st.poli.length >= 3);
const centro = f => { const [x0, y0, x1, y1] = st.rect, w = x1 - x0, h = y1 - y0; return [x0 + w * f, y0 + h * f, x1 - w * f, y1 - h * f]; };

function dibujar() {
  if (!st) return;
  const D = prepararLienzo(st.img); if (!D || !st.img) return;
  const { g, P } = D;
  const R = st.arrastre && st.arrastre.nuevo || st.rect;
  if (R) {
    const [x0, y0] = P([R[0], R[1]]), [x1, y1] = P([R[2], R[3]]);
    g.fillStyle = '#00000066'; const W = g.canvas.width, H = g.canvas.height;   // oscurece fuera del recorte
    g.fillRect(0, 0, W, y0); g.fillRect(0, y1, W, H); g.fillRect(0, y0, x0, y1 - y0); g.fillRect(x1, y0, W, y1 - y0);
    g.strokeStyle = '#ffc828'; g.lineWidth = 2; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#ffc828'; g.font = '600 12px system-ui'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(`${st.alto} m`, x1 + 6, (y0 + y1) / 2);
    if (st.paso == 2 && st.modo == 'torno') { const xc = (x0 + x1) / 2; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(xc, y0 - 10); g.lineTo(xc, y1 + 10); g.stroke(); g.setLineDash([]); }
  }
  if (st.paso != 2) return;
  const linea = (L, cerrar, c) => { if (!L.length) return; g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); L.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (cerrar) g.closePath(); g.stroke();
    L.forEach((p, i) => { const [x, y] = P(p); g.beginPath(); g.arc(x, y, i ? 3.5 : 5.5, 0, 7); g.fillStyle = i ? c : '#fff'; g.fill(); }); };
  if (st.modo == 'torno') {   // perfil y su reflejo
    linea(st.perfil, false, '#3fb27f');
    const xc = (st.rect[0] + st.rect[2]) / 2; g.globalAlpha = .45; linea(st.perfil.map(([x, y]) => [2 * xc - x, y]), false, '#3fb27f'); g.globalAlpha = 1;
  }
  if (st.modo == 'silueta') linea(st.poli, st.cerrada, '#ffd43b');
}
function abajo(e) {
  if (!st || !st.img) return;
  const p = enImagen(e); e.target.setPointerCapture(e.pointerId);
  if (st.paso == 1) { st.arrastre = { p0: p, nuevo: null }; return; }
  if (st.modo == 'torno') { st.perfil.push(p); lado(); dibujar(); return; }
  if (st.modo == 'silueta' && !st.cerrada) {
    const q = st.poli[0];
    if (st.poli.length >= 3 && Math.hypot((p[0] - q[0]) * vista.s, (p[1] - q[1]) * vista.s) < 12) { st.poli = sinRepetidos(st.poli); st.cerrada = true; }
    else st.poli.push(p);
    lado(); dibujar();
  }
}
function mover(e) {
  if (!st || !st.arrastre) return;
  const p = enImagen(e), a = st.arrastre.p0;
  st.arrastre.nuevo = [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[0], p[0]), Math.max(a[1], p[1])].map((v, i) => Math.max(0, Math.min(i % 2 ? st.img.height : st.img.width, v)));
  dibujar();
}
function arriba() {
  if (!st || !st.arrastre) return;
  const n = st.arrastre.nuevo; st.arrastre = null;
  if (n && n[2] - n[0] > 8 && n[3] - n[1] > 8) { st.rect = n; st.perfil = []; st.poli = []; st.cerrada = false; }
  lado(); dibujar();
}

function colocar() {
  const { ed } = st, [x0, , x1, y1] = st.rect, m = mpp(), xc = (x0 + x1) / 2;
  let g, nombre;
  if (st.modo == 'arbol') { g = arbol(st.especie, st.alto, st.anchoCopa, st.copa, st.tronco); nombre = (ESPECIES.find(e => e[0] == st.especie) || [, 'Árbol'])[1]; }
  else if (st.modo == 'torno') {
    const perfil = st.perfil.map(([x, y]) => [Math.abs(x - xc) * m, (y1 - y) * m]).sort((a, b) => a[1] - b[1]);
    g = torno(perfil, st.color); nombre = 'Objeto de torno';
  } else {
    const pts = st.poli.map(([x, y]) => [(x - xc) * m, (y1 - y) * m]);
    g = silueta(pts, st.grosor, st.color).translate(0, 0, -st.grosor / 2); nombre = 'Silueta';
  }
  g = completar(g); g.computeBoundingBox();
  const b = g.boundingBox; g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  // posición: último clic (en el suelo o sobre una superficie horizontal) o el centro de la vista
  const pt = st.punto, pos = pt ? pt.point.clone() : ed.orbit.target.clone();
  if (!pt || !pt.normal || pt.normal.y < .5) pos.y = ed.alturaSuelo(pos.x, pos.z);
  const d = ed.camera.position.clone().sub(pos); g.rotateY(Math.atan2(d.x, d.z)); g.translate(pos.x, pos.y, pos.z);
  const usados = new Set(ed.piezas().map(o => o.userData.pieza.nombre)); let nom = nombre + ' (foto)', i = 2; while (usados.has(nom)) nom = `${nombre} (foto) ${i++}`;
  const mesh = crearPieza(g, { nombre: nom, origen: 'nueva', material: { kind: 'color', doble: st.modo == 'arbol' }, uvAuto: false });
  const toast = st.toast; cerrarVentana();
  ed.añadir([mesh], 'Objeto desde foto'); ed.setModo('translate');
  toast(`Colocado «${nom}» (${R2(new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).y)} m de alto). Muévelo o gíralo con el gizmo.`, 6000);
}
