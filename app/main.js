// Menorca3D Forge · interfaz: elegir casa, panel de piezas, propiedades, guardar y enviar a Menorca3D.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cargarDatos } from './datos.js';
import { crearEditor } from './editor.js';
import { generarCasa, piezasDeGrupo, separar, serializar, deserializar, crearPieza, pintar, colorDe, actualizarDerivados, ESTILOS, TEXTURAS, FORMATO } from './casa.js';
import { PRIMITIVAS, partesDe } from './primitivas.js';
import { tex } from '../v07/core/textures.js';
import * as api from './api.js';

// v0.7 pide las texturas a /assets/…: se resuelven junto a la app para que también funcione publicada en una subcarpeta (GitHub Pages)
const RAIZ = new URL('../', import.meta.url).href;
THREE.DefaultLoadingManager.setURLModifier(u => (u.startsWith('/assets/') ? RAIZ + u.slice(1) : u));

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (msg, ms = 3200) => { const t = $('toast'); t.innerHTML = msg; t.classList.add('open'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('open'), ms); };
const NOMBRE_TEX = { estuco: 'Estuco', teja: 'Teja', terraza: 'Terraza (baldosa)', piedra_seca: 'Piedra seca', aplacado: 'Aplacado de lajas', sillarejo: 'Sillarejo de marés',
  sillar: 'Sillería de marés', acera: 'Acera', asfalto: 'Asfalto', losa_plaza: 'Losa de plaza', baldosa_roja: 'Baldosa roja', adoquin: 'Adoquín',
  rotulo_farmacia: 'Rótulo farmacia 1', rotulo_farmacia2: 'Rótulo farmacia 2', rotulo_farmacia3: 'Rótulo farmacia 3' };
const nombreKind = k => k == 'fachada' ? 'Fachada de v0.7 (huecos)' : k == 'color' ? 'Color liso' : NOMBRE_TEX[k] || k;
const swatch = k => k == 'fachada' ? '#d8cdb5' : k == 'color' ? '#7c8794' : k == 'teja' ? '#b0573a' : k == 'terraza' ? '#c9c2b2' : '#8c8170';

let D = null, ed = null, casa = null, guardadas = new Map(), ultimoPunto = null, modo = 'completo';

// =====================================================================================================================
// Arranque
// =====================================================================================================================
(async function init() {
  const st = await api.estado();
  modo = st.modo || 'completo';
  if (modo == 'web') {
    const cfg = await api.config();
    if (cfg.accesoHash) await pedirCodigo(cfg.accesoHash);
    $('cargaMsg').textContent = 'Cargando la isla…';
  }
  try {
    D = await cargarDatos();
  } catch (err) { $('cargaMsg').innerHTML = `<span class="bad">${esc(err.message)}</span>`; return; }
  ed = crearEditor($('c'));
  window.forge = { THREE, editor: ed, datos: D, get casa() { return casa; } };   // para la consola del navegador (F12)
  conectarEditor();
  construirCatalogo();
  await refrescarGuardadas();
  $('carga').classList.add('oculto');
  initMapa();
  $('iniNota').innerHTML = `${D.parcelas.size.toLocaleString('es')} parcelas del Catastro en Es Castell`
    + (modo == 'completo' ? ` · datos de <code>${esc(st.v2)}</code>` : modo == 'web' ? ' · <b>versión web</b>: tus cambios se envían como propuesta' : ' · <b>modo colaborador</b>: tus cambios se envían como propuesta')
    + (modo == 'web' ? '<br>Las casas editadas se guardan <b>en este navegador</b> (si borras los datos del navegador, se pierden: envíalas como propuesta)'
      : `<br>Las casas editadas se guardan en <code>${esc(st.casas)}</code>`);
  if (modo != 'completo') {
    $('btnEnviar').textContent = 'Enviar propuesta'; $('btnEnviar').title = 'Guarda la casa y prepara el archivo para enviarlo';
    $('btnGuardar').title = modo == 'web' ? 'Guardar en este navegador (Ctrl+S)' : $('btnGuardar').title;
  }
  const h = decodeURIComponent(location.hash.slice(1)); if (h) abrir(h); else mostrarInicio(true);
})();

// Versión web: un código de acceso sencillo (config.json solo guarda su SHA-256). Se recuerda en este navegador.
const LS_ACCESO = 'forge-acceso';
function pedirCodigo(hash) {
  try { if (localStorage.getItem(LS_ACCESO) == hash) return Promise.resolve(); } catch { /* */ }
  return new Promise(ok => {
    $('cargaMsg').innerHTML = `<form id="fAcceso" class="acceso"><p>Esta versión de Forge es solo para colaboradores.<br>Escribe el código de acceso que te han dado.</p>
      <input id="aCod" type="password" autocomplete="off" placeholder="Código de acceso"> <button class="prim">Entrar</button><p id="aMal" class="bad"></p></form>`;
    $('aCod').focus();
    $('fAcceso').onsubmit = async e => {
      e.preventDefault();
      if ((await api.sha256($('aCod').value.trim())) != hash) { $('aMal').textContent = 'Código incorrecto.'; $('aCod').select(); return; }
      try { localStorage.setItem(LS_ACCESO, hash); } catch { /* */ }
      ok();
    };
  });
}

async function refrescarGuardadas() {
  const L = await api.listaCasas().catch(() => []);
  guardadas = new Map(L.filter(c => c.ref).map(c => [c.ref, c]));
  const el = $('editadas');
  el.innerHTML = L.length ? L.map(c => `<div class="ed" data-ref="${esc(c.ref)}"><div><b>${c.n ? 'Nº ' + c.n : esc(c.ref)}</b> <span class="r">${esc(c.ref)}</span><br><small>${c.objetos ?? '?'} piezas · ${c.zona == 'municipio' ? 'resto del municipio' : 'zona detallada'}</small></div><small class="r">${c.actualizado ? new Date(c.actualizado).toLocaleString('es') : esc(c.error || '')}</small></div>`).join('')
    : '<em>Todavía no has editado ninguna. Busca una casa por número o referencia, o haz clic en el mapa.</em>';
  el.querySelectorAll('.ed').forEach(d => d.onclick = () => abrir(d.dataset.ref));
  dibujarMapa && dibujarMapa();
}
function mostrarInicio(on) { $('inicio').classList.toggle('oculto', !on); if (on) { setTimeout(() => $('q2').focus(), 50); dibujarMapa(); } }

// =====================================================================================================================
// Abrir / guardar / enviar
// =====================================================================================================================
async function abrir(q) {
  const p = D.buscar(q);
  if (!p) return toast(`No encuentro <b>${esc(q)}</b>. Prueba con el número del mapa de edificios o con la referencia catastral (14 caracteres).`);
  if (casa && ed.sucio && !confirm('Hay cambios sin guardar en la casa abierta. ¿Abrir otra y perderlos?')) return;
  const Z = D.zonaDe(p);
  $('carga').classList.remove('oculto'); $('cargaMsg').textContent = `Preparando el edificio nº ${p.n} (${p.ref})…`;
  await new Promise(r => setTimeout(r, 30));
  try {
    let piezas, editada = false;
    if (guardadas.has(p.ref)) {
      const F = await api.leerCasa(p.ref);
      if (!F) throw new Error('No encuentro la versión guardada');
      if (F.formato != FORMATO) throw new Error('El archivo guardado no tiene el formato de Forge');
      piezas = deserializar(F); editada = true; casa = { p, Z, notas: F.notas || '' };
    } else { piezas = generarCasa(Z, p.ref, D.ajustes); casa = { p, Z, notas: '' }; }
    casa.editada = editada; casa.revision = null; pintarRevision();
    ed.setContexto(Z, p, D, D.ajustes, { orto: $('chkOrto').checked, conVecinos: $('chkVecinos').checked });
    ed.cargar(piezas, editada ? 'Abrir versión editada' : 'Generada por v0.7');
    ed.vista('persp'); ed.encuadrar(ed.piezas());
    ultimoPunto = null; history.replaceState(null, '', '#' + p.ref);
    mostrarInicio(false); pintarCabecera(); pintarLista(); pintarProps();
    toast(editada ? `Abierta tu versión editada del nº ${p.n}.` : `Nº ${p.n}: casa generada por v0.7 (${piezas.length} piezas). Haz clic en una pieza para editarla.`);
  } catch (err) { console.error(err); toast('No se pudo abrir: ' + esc(err.message), 6000); }
  $('carga').classList.add('oculto');
}
const meta = () => ({ ref: casa.p.ref, n: casa.p.n, zona: casa.p.zona, origin: D.origin, notas: casa.notas || '', piezasCatastro: casa.p.piezas,
  fuente: 'Menorca3D Forge: geometría de v0.7 (Catastro + reglas PROCEDURALES) retocada a mano' });
async function guardar() {
  if (!casa) return false;
  const F = serializar(ed.piezas(), meta());
  F.actualizado = F.actualizado || new Date().toISOString();
  const r = await api.guardarCasa(casa.p.ref, F);
  if (r.error) { toast('No se pudo guardar: ' + esc(r.error), 6000); return false; }
  ed.marcarGuardado(); casa.editada = true; await refrescarGuardadas(); pintarCabecera();
  toast(modo == 'web' ? `Guardado en este navegador (<b>${casa.p.ref}</b>)` : `Guardado <b>${casa.p.ref}.forge.json</b>`); return true;
}
async function enviar() {
  if (!casa) return;
  if (modo != 'completo') return exportarPropuesta();
  if (ed.sucio || !casa.editada) { if (!(await guardar())) return; }
  const zona = casa.p.zona;
  const r = await fetch('/api/publicar', { method: 'POST', body: JSON.stringify({ zona }) }).then(r => r.json());
  modal('Enviar a Menorca3D', `<p>Regenerando los modelos de <b>${zona == 'municipio' ? 'resto del municipio (municipio_*.glb)' : 'la zona detallada (zona_*.glb)'}</b> con tus casas editadas. Tarda unos segundos…</p><pre id="log"></pre><p id="pubFin"></p>`);
  if (r.error && !/ya se está/.test(r.error)) { $('log').textContent = r.error; return; }
  const poll = async () => {
    const s = await fetch('/api/publicar').then(r => r.json()).catch(() => null); if (!s) return;
    const L = $('log'); if (!L) return; L.textContent = s.log; L.scrollTop = L.scrollHeight;
    if (s.running) return setTimeout(poll, 700);
    $('pubFin').innerHTML = s.code === 0
      ? '<span class="ok">✔ Hecho.</span> Abre (o recarga) el visor de menorca3d_v2: <code>python pipeline/servidor.py</code> y <code>http://localhost:8080</code>. Los modelos nuevos llevan otra huella (<code>?v=…</code>), así que el navegador no usará los viejos.'
      : '<span class="bad">✖ El exportador terminó con error.</span> Mira el registro. Si dice que falta three, ejecuta <code>npm install</code> dentro de <code>menorca3d_v2\\v0.7</code>.';
  };
  poll();
}
// =====================================================================================================================
// Propuestas: un colaborador envía su versión de una casa (.forge.json) y aquí se revisa y se acepta o descarta
// =====================================================================================================================
const LS_AUTOR = 'forge-autor';
const leerLS = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const fechaArchivo = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, (c) => (c == 'T' ? '_' : c == ':' ? '' : '-'));
function descargar(nombre, texto) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function exportarPropuesta() {
  if (!casa) return toast('Abre primero una casa.');
  modal('Enviar propuesta', `<p>Se guarda tu versión del <b>nº ${casa.p.n}</b> (${casa.p.ref}) y se descarga un archivo para enviarlo.</p>
    <div class="form"><label>Tu nombre <input id="pAutor" type="text" value="${esc(leerLS(LS_AUTOR))}" placeholder="Para saber de quién es"></label>
    <label>Qué has cambiado <textarea id="pCom" rows="3" placeholder="Ej.: tejado a dos aguas, balcón en la fachada sur, portón del garaje">${esc(casa.notas || '')}</textarea></label></div>
    <div class="pie"><button id="pOk" class="prim">Guardar y descargar la propuesta</button></div><p id="pFin"></p>`);
  $('pOk').onclick = async () => {
    const autor = $('pAutor').value.trim(), comentario = $('pCom').value.trim();
    if (!autor) return $('pAutor').focus();
    try { localStorage.setItem(LS_AUTOR, autor); } catch { /* */ }
    casa.notas = comentario || casa.notas;
    if (!(await guardar())) return;
    const F = serializar(ed.piezas(), meta()); F.propuesta = { autor, comentario, fecha: new Date().toISOString(), herramienta: 'Menorca3D Forge' };
    const nombre = `propuesta_n${casa.p.n}_${casa.p.ref}_${fechaArchivo()}.forge.json`;
    descargar(nombre, JSON.stringify(F));
    const cfg = await api.config();
    const url = enlaceFormulario(cfg.formulario, { AUTOR: autor, NUMERO: String(casa.p.n), REF: casa.p.ref, COMENTARIO: comentario, ARCHIVO: nombre });
    $('pFin').innerHTML = `<span class="ok">✔ Guardado y descargado <b>${esc(nombre)}</b></span> (carpeta Descargas).`
      + (url ? `<ol class="pasos"><li>Abre el formulario (ya lleva tu nombre, el edificio y el comentario).</li><li>En «Archivo de la propuesta», pulsa «Añadir archivo» y elige <b>${esc(nombre)}</b> de Descargas.</li><li>Pulsa «Enviar».</li></ol>
          <div class="pie"><a href="${esc(url)}" target="_blank" rel="noopener"><button class="prim">Abrir el formulario de envío ↗</button></a></div>`
        : '<br>Envíalo a quien lleva Menorca3D. Él lo abrirá en Forge con «⋯ → Importar propuesta».');
  };
}
// Enlace «rellenado previamente» de Google Forms: los valores AUTOR, NUMERO, REF, COMENTARIO y ARCHIVO se sustituyen
function enlaceFormulario(base, vals) {
  if (!base || !/^https:\/\/docs\.google\.com\/forms\//.test(base)) return null;
  return base.replace(/=(AUTOR|NUMERO|REF|COMENTARIO|ARCHIVO)(?=&|$)/g, (m, k) => '=' + encodeURIComponent(vals[k] || ''));
}
function importarPropuesta(file) {
  const rd = new FileReader();
  rd.onload = async () => {
    let F; try { F = JSON.parse(rd.result); } catch { return toast('El archivo no es un .forge.json válido.'); }
    if (F.formato != FORMATO || !F.ref || !Array.isArray(F.objetos)) return toast('El archivo no es una casa de Forge.');
    if (Math.abs(F.origin.lon - D.origin.lon) > 1e-9 || Math.abs(F.origin.lat - D.origin.lat) > 1e-9) return toast('La propuesta usa otro origen de coordenadas: no se puede abrir aquí.');
    const p = D.parcelas.get(F.ref); if (!p) return toast(`No encuentro la parcela ${esc(F.ref)} en los datos.`);
    if (!casa || casa.p.ref != F.ref) { await abrir(F.ref); if (!casa || casa.p.ref != F.ref) return; }
    else if (ed.sucio && !confirm('Hay cambios sin guardar en esta casa. ¿Abrir la propuesta y perderlos?')) return;
    const actual = serializar(ed.piezas(), {});
    casa.revision = { F, actual, viendo: 'propuesta' };
    ed.cargar(deserializar(F), 'Propuesta de ' + ((F.propuesta && F.propuesta.autor) || 'colaborador'), true);
    pintarCabecera(); pintarRevision();
  };
  rd.readAsText(file);
}
function pintarRevision() {
  const el = $('revision'), R = casa && casa.revision;
  if (!R) { el.classList.remove('open'); el.innerHTML = ''; return; }
  const P = R.F.propuesta || {}, f = P.fecha ? new Date(P.fecha).toLocaleString('es') : '';
  el.innerHTML = `<div><b>Propuesta de ${esc(P.autor || 'colaborador')}</b> para el nº ${casa.p.n}${f ? ' · ' + f : ''}${P.comentario ? `<br><small>«${esc(P.comentario)}»</small>` : ''}</div>
    <div class="seg"><button data-r="actual" class="${R.viendo == 'actual' ? 'on' : ''}">Ver actual</button><button data-r="propuesta" class="${R.viendo == 'propuesta' ? 'on' : ''}">Ver propuesta</button></div>
    <button id="rOk" class="prim">Aceptar y guardar</button><button id="rNo" class="peligro">Descartar</button>`;
  el.classList.add('open');
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    if (R.viendo == b.dataset.r) return; R.viendo = b.dataset.r;
    ed.cargar(deserializar(R.viendo == 'actual' ? R.actual : R.F), R.viendo == 'actual' ? 'Versión actual' : 'Propuesta', true); pintarRevision();
  });
  $('rOk').onclick = async () => {
    if (R.viendo != 'propuesta') ed.cargar(deserializar(R.F), 'Propuesta', true);
    casa.notas = [casa.notas, R.F.propuesta && `Propuesta de ${R.F.propuesta.autor}: ${R.F.propuesta.comentario || ''}`].filter(Boolean).join(' · ');
    casa.revision = null; pintarRevision();
    if (await guardar()) toast('Propuesta aceptada y guardada. Pulsa «Enviar a Menorca3D» para publicarla.', 6000);
  };
  $('rNo').onclick = () => { casa.revision = null; pintarRevision(); abrir(casa.p.ref); toast('Propuesta descartada. No se ha cambiado nada.'); };
}

function modal(tit, html) { $('mTit').textContent = tit; $('mCuerpo').innerHTML = html; $('modal').classList.add('open'); }
$('mCerrar').onclick = () => $('modal').classList.remove('open');

// =====================================================================================================================
// Cabecera, lista de piezas, catálogo
// =====================================================================================================================
function pintarCabecera() {
  if (!casa) { $('casaInfo').innerHTML = ''; return; }
  const p = casa.p;
  $('casaInfo').innerHTML = `<span class="n">Nº ${p.n}</span><span class="ref">${p.ref}</span>`
    + `<span class="badge">${p.zona == 'municipio' ? 'resto del municipio' : 'zona detallada'} · ${p.piezas} ${p.piezas == 1 ? 'pieza' : 'piezas'} Catastro</span>`
    + (ed.sucio ? '<span class="badge sucio">sin guardar</span>' : casa.editada ? '<span class="badge ed">editada</span>' : '<span class="badge">generada por v0.7</span>');
  const h = ed.historial; $('btnUndo').disabled = h.i <= 0; $('btnRedo').disabled = h.i >= h.n - 1;
  document.title = (ed.sucio ? '• ' : '') + `Nº ${p.n} · Menorca3D Forge`;
}
// Categoría de cada pieza en la lista
const CATS = [['paredes', 'Paredes'], ['cubiertas', 'Cubiertas y azoteas'], ['vallas', 'Vallas y exterior'], ['detalles', 'Detalles'], ['nueva', 'Añadidas'], ['importado', 'Importadas']];
function categoria(o) {
  const pz = o.userData.pieza, k = pz.material.kind, n = pz.nombre;
  if (pz.origen == 'nueva' || pz.origen == 'importado') return pz.origen;
  if (/^(Valla|Verja|Pared seca|Malla|Seto|Tapia|Puerta de jardín)/.test(n)) return 'vallas';
  if (k == 'fachada' && /^Pared/.test(n)) return 'paredes';
  if (k == 'teja' || k == 'terraza' || /^(Faldón|Cubierta|Azotea)/.test(n)) return 'cubiertas';
  return 'detalles';
}
const texURL = k => `${RAIZ}assets/textures/${k}_albedo.png`;
function muestra(o) {   // cuadradito de la lista: textura real o color de la pieza
  const k = o.userData.pieza.material.kind;
  return k != 'color' && k != 'fachada' ? `background:url(${texURL(k)}) center/300%` : `background:${colorDe(o)}`;
}
const plegados = new Set(['paredes']);
let filtro = '';
function pintarLista() {
  const L = ed.piezas(), sel = new Set(ed.seleccion), f = filtro.trim().toLowerCase();
  $('nPiezas').textContent = L.length ? `(${L.length})` : '';
  let html = '';
  for (const [c, tit] of CATS) {
    const items = L.filter(o => categoria(o) == c && (!f || o.userData.pieza.nombre.toLowerCase().includes(f) || nombreKind(o.userData.pieza.material.kind).toLowerCase().includes(f)));
    if (!items.length) continue;
    const abierto = f || !plegados.has(c) || items.some(o => sel.has(o)), nSel = items.filter(o => sel.has(o)).length;
    html += `<div class="cat${abierto ? ' abierta' : ''}" data-cat="${c}"><span class="fl">${abierto ? '▾' : '▸'}</span><span class="ct">${tit}</span><span class="cn">${nSel ? nSel + '/' : ''}${items.length}</span>`
      + `<span class="cb" data-todo="1" title="Elegir todas">⬚</span><span class="cb" data-ojo="1" title="Ocultar / mostrar todas">${items.every(o => !o.visible) ? '–' : '👁'}</span></div>`;
    if (abierto) html += items.map(o => { const pz = o.userData.pieza;
      return `<div class="it${sel.has(o) ? ' sel' : ''}${o.visible ? '' : ' oc'}" data-id="${pz.id}"><span class="sw" style="${muestra(o)}"></span><span class="nm" title="${esc(nombreKind(pz.material.kind))}">${esc(pz.nombre)}</span><span class="ojo" data-ojo="1" title="Ocultar / mostrar (H)">${o.visible ? '👁' : '–'}</span></div>`; }).join('');
  }
  $('lista').innerHTML = html || `<em style="color:var(--mut)">${f ? 'Nada coincide con «' + esc(filtro) + '»' : 'Sin piezas'}</em>`;
  const byId = id => L.find(x => x.userData.pieza.id == id);
  $('lista').querySelectorAll('.cat').forEach(d => d.onclick = e => {
    const c = d.dataset.cat, items = L.filter(o => categoria(o) == c);
    if (e.target.dataset.todo) return ed.seleccionar(items, e.shiftKey);
    if (e.target.dataset.ojo) { const v = items.every(o => !o.visible); items.forEach(o => { o.visible = v; }); ed.commit(v ? 'Mostrar' : 'Ocultar'); return pintarLista(); }
    plegados.has(c) ? plegados.delete(c) : plegados.add(c); pintarLista();
  });
  $('lista').querySelectorAll('.it').forEach(d => {
    d.onclick = e => { const o = byId(d.dataset.id); if (!o) return;
      if (e.target.dataset.ojo) { o.visible = !o.visible; ed.commit(o.visible ? 'Mostrar' : 'Ocultar'); pintarLista(); return; }
      ed.seleccionar([o], e.shiftKey || e.ctrlKey); };
    d.ondblclick = () => { const o = byId(d.dataset.id); if (o) { ed.seleccionar([o]); ed.encuadrar([o]); } };
    d.onmouseenter = () => ed.resaltar(byId(d.dataset.id)); d.onmouseleave = () => ed.resaltar(null);
  });
  const it = $('lista').querySelector('.it.sel'); if (it) it.scrollIntoView({ block: 'nearest' });
}
function construirCatalogo() {
  const grupos = [...new Set(PRIMITIVAS.map(p => p.grupo))];
  $('catalogo').innerHTML = grupos.map(g => `<div class="grp">${g}</div><div class="btns">${PRIMITIVAS.filter(p => p.grupo == g).map(p => `<button data-p="${p.id}">${p.nombre}</button>`).join('')}</div>`).join('');
  $('catalogo').querySelectorAll('button').forEach(b => b.onclick = () => añadirPrimitiva(PRIMITIVAS.find(p => p.id == b.dataset.p)));
}
// Coloca la pieza nueva donde se hizo el último clic: los huecos (ventanas, puertas…) se pegan a la pared mirando hacia fuera
function añadirPrimitiva(P) {
  if (!casa) return toast('Abre primero una casa.');
  const partes = partesDe(P), bb = new THREE.Box3();
  for (const x of partes) { x.g.computeBoundingBox(); bb.union(x.g.boundingBox); }
  const c = bb.getCenter(new THREE.Vector3());
  let pos, ang = 0, off;
  const pt = ultimoPunto, enPared = pt && pt.normal && Math.abs(pt.normal.y) < .5;
  if (P.pegado && enPared) {   // pegado a la pared, mirando hacia fuera
    ang = Math.atan2(pt.normal.x, pt.normal.z); off = [-c.x, -c.y, -bb.min.z]; pos = pt.point.clone().addScaledVector(pt.normal, .01);
  } else {
    let x, z, y;
    if (pt) { x = pt.point.x; z = pt.point.z; y = pt.normal && pt.normal.y > .5 ? pt.point.y : ed.alturaSuelo(x, z); }
    else { x = ed.orbit.target.x; z = ed.orbit.target.z; y = ed.alturaSuelo(x, z); }
    if (enPared && (P.id == 'pared' || P.grupo == 'Vallas')) ang = Math.atan2(pt.normal.x, pt.normal.z);   // paralela a la pared
    off = [-c.x, -bb.min.y, -c.z]; pos = new THREE.Vector3(x, y, z);
  }
  const usados = new Set(ed.piezas().map(o => o.userData.pieza.nombre));
  const meshes = partes.map(x => {
    x.g.translate(...off); x.g.rotateY(ang); x.g.translate(pos.x, pos.y, pos.z);
    let nom = x.nombre, i = 2; while (usados.has(nom)) nom = `${x.nombre} ${i++}`; usados.add(nom);
    return crearPieza(x.g, { nombre: nom, origen: 'nueva', material: x.material, fachada: x.fachada, uvAuto: x.uvAuto });
  });
  ed.añadir(meshes, 'Añadir ' + P.nombre.toLowerCase());
  ed.setModo('translate');
}

// =====================================================================================================================
// Propiedades de la selección
// =====================================================================================================================
const R2 = x => Math.round(x * 100) / 100, deg = r => Math.round(THREE.MathUtils.radToDeg(r) * 10) / 10;
// Selector de material: fachada de v0.7, color liso y las texturas de v0.7 (miniaturas reales)
const MATS = [['fachada', 'Fachada'], ['color', 'Color'], ...TEXTURAS.filter(t => !/^rotulo/.test(t)).map(t => [t, NOMBRE_TEX[t] || t]), ...TEXTURAS.filter(t => /^rotulo/.test(t)).map(t => [t, NOMBRE_TEX[t] || t])];
const fondoMat = k => k == 'fachada' ? `background:url(${texURL('estuco')}) center/200%;box-shadow:inset 0 0 0 9px #ece9e2cc,inset 13px -6px 0 2px #2e6355`
  : k == 'color' ? 'background:linear-gradient(135deg,#ece9e2 0 33%,#c9b07f 33% 66%,#2e6355 66%)' : `background:url(${texURL(k)}) center/180%`;
// Paleta: colores medidos en las fotos de Es Castell (v0.7/src/buildings/buildings.js) y carpinterías habituales
const PALETA = [['Blanco cal', '#f3f1ea'], ['Blanco roto', '#ece9e2'], ['Crema', '#e3d5b5'], ['Ocre', '#c9b07f'], ['Arena', '#cdbfa5'], ['Coral', '#d39a82'],
  ['Melocotón', '#e2b394'], ['Magenta', '#8f5a6e'], ['Granate', '#7a2233'], ['Rojo Ayuntamiento', '#912033'], ['Rojo cuartel', '#82233f'], ['Marés', '#9d8a6c'],
  ['Gris claro', '#e9ebe8'], ['Topo', '#b9a091'], ['Salvia', '#9aa59e'], ['Verde persiana', '#2e6355'], ['Verde oscuro', '#1f5a46'], ['Azul persiana', '#2d5f73'],
  ['Madera', '#5a3d2b'], ['Hierro', '#2b2b2b'], ['Gris metal', '#7d8186'], ['Teja', '#b0573a']];
function opcionesMaterial(k) {
  return [['fachada', nombreKind('fachada')], ['color', 'Color liso'], ...TEXTURAS.map(t => [t, NOMBRE_TEX[t] || t])]
    .map(([v, t]) => `<option value="${v}"${v == k ? ' selected' : ''}>${t}</option>`).join('');
}
function pintarProps() {
  const S = ed.seleccion, el = $('props');
  if (!casa) { el.innerHTML = '<div class="ayuda">Abre una casa para empezar.</div>'; return; }
  const V = ed.vertices;
  if (V) {
    el.innerHTML = `<div class="tit">Vértices · ${esc(V.mesh.userData.pieza.nombre)}</div><div class="sub">${V.sel.length} de ${V.grupos.length} elegidos</div>
      <div class="ayuda">Clic en un punto para elegirlo · <kbd>Mayús</kbd>+clic para añadir · <kbd>Ctrl</kbd>+<kbd>A</kbd> todos · arrastra las flechas para moverlos · <kbd>Esc</kbd> o <kbd>V</kbd> para salir.</div>
      <div class="bloque"><h3>Mover exacto (m)</h3><div class="row"><label>Δ x y z</label><div class="xyz"><input id="dx" type="number" step=".05" value="0"><input id="dy" type="number" step=".05" value="0"><input id="dz" type="number" step=".05" value="0"></div></div>
      <div class="acc"><button id="vMover" ${V.sel.length ? '' : 'disabled'}>Mover</button></div></div>
      <div class="bloque"><h3>Altura</h3><div class="row"><label>Fijar Y</label><input id="vY" type="number" step=".05" value="${V.sel.length ? R2(V.grupos[V.sel[0]].w.y) : ''}"></div>
      <div class="acc"><button id="vYset" ${V.sel.length ? '' : 'disabled'}>Fijar</button><button id="vMax" ${V.sel.length > 1 ? '' : 'disabled'}>Igualar a la más alta</button><button id="vMin" ${V.sel.length > 1 ? '' : 'disabled'}>A la más baja</button><button id="vMed" ${V.sel.length > 1 ? '' : 'disabled'}>A la media</button></div></div>
      <div class="acc"><button id="vSalir">Terminar</button></div>`;
    $('vMover').onclick = () => ed.opVertices('delta', new THREE.Vector3(+$('dx').value || 0, +$('dy').value || 0, +$('dz').value || 0));
    $('vYset').onclick = () => ed.opVertices('y', +$('vY').value);
    $('vMax').onclick = () => ed.opVertices('max'); $('vMin').onclick = () => ed.opVertices('min'); $('vMed').onclick = () => ed.opVertices('media');
    $('vSalir').onclick = () => ed.salirVertices();
    return;
  }
  if (!S.length) {
    const tris = ed.piezas().reduce((s, o) => s + o.geometry.attributes.position.count / 3, 0);
    el.innerHTML = `<div class="tit">Edificio nº ${casa.p.n}</div><div class="sub">${casa.p.ref} · ${Math.round(casa.p.A)} m² de huella · hasta ${casa.p.plantas} plantas</div>
      <div class="row"><label>Notas</label><input id="notas" type="text" value="${esc(casa.notas || '')}" placeholder="Qué has corregido…"></div>
      <div class="acc"><a href="https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?rc1=${casa.p.ref.slice(0, 7)}&rc2=${casa.p.ref.slice(7, 14)}" target="_blank" rel="noopener"><button>Ficha en la Sede del Catastro ↗</button></a></div>
      <div class="bloque ayuda">${ed.piezas().length} piezas · ${Math.round(tris).toLocaleString('es')} triángulos<br><br>
      <b>Cómo se trabaja</b><br>Clic en una pieza para elegirla (<kbd>Mayús</kbd> para varias). Mueve, gira o escala con el gizmo (<kbd>W</kbd> <kbd>R</kbd> <kbd>S</kbd>). La cámara se mueve con las flechas, <kbd>Q</kbd>/<kbd>E</kbd> para girar y <kbd>+</kbd>/<kbd>−</kbd> para el zoom.
      Doble clic o <kbd>V</kbd>: mover vértices sueltos (subir un alero, estirar una pared). Las paredes con «Fachada de v0.7» redibujan solas ventanas y persianas al cambiar de tamaño.<br><br>
      Para añadir algo, haz clic en la superficie donde va y pulsa un botón de «Añadir». <kbd>Ctrl</kbd>+<kbd>S</kbd> guarda; ${modo == 'completo' ? '«Enviar a Menorca3D» lo mete en el modelo de la isla' : '«Enviar propuesta» la manda a quien lleva Menorca3D para que la revise'}.</div>`;
    $('notas').onchange = e => { casa.notas = e.target.value; ed.commit('Notas'); };
    return;
  }
  const o = S[0], pz = o.userData.pieza, uno = S.length == 1, k = pz.material.kind, kinds = new Set(S.map(x => x.userData.pieza.material.kind));
  const box = new THREE.Box3(); S.forEach(x => box.expandByObject(x)); const sz = box.getSize(new THREE.Vector3());
  const rot = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ');
  el.innerHTML = (uno ? `<div class="row"><label>Nombre</label><input id="pNom" type="text" value="${esc(pz.nombre)}"></div>` : `<div class="tit">${S.length} piezas</div>`)
    + `<div class="sub">Tamaño: <span class="dim">${R2(sz.x)} × ${R2(sz.y)} × ${R2(sz.z)} m</span> (este × alto × sur)</div>`
    + (uno ? `<div class="row"><label>Posición</label><div class="xyz"><input id="px" type="number" step=".1" value="${R2(o.position.x)}"><input id="py" type="number" step=".1" value="${R2(o.position.y)}"><input id="pz" type="number" step=".1" value="${R2(o.position.z)}"></div></div>
      <div class="row"><label>Giro (°)</label><div class="xyz"><input id="rx" type="number" step="1" value="${deg(rot.x)}"><input id="ry" type="number" step="1" value="${deg(rot.y)}"><input id="rz" type="number" step="1" value="${deg(rot.z)}"></div></div>
      <div class="row"><label>Escala</label><div class="xyz"><input id="sx" type="number" step=".05" value="${R2(o.scale.x)}"><input id="sy" type="number" step=".05" value="${R2(o.scale.y)}"><input id="sz" type="number" step=".05" value="${R2(o.scale.z)}"></div></div>` : '')
    + `<div class="bloque"><h3>Material ${kinds.size > 1 ? '<small>(varios)</small>' : '<small>' + esc(nombreKind(k)) + '</small>'}</h3>
      <div class="mats">${MATS.map(([v, t]) => `<button class="mat${kinds.size == 1 && v == k ? ' on' : ''}" data-k="${v}" title="${esc(t)}"><span style="${fondoMat(v)}"></span><i>${esc(t)}</i></button>`).join('')}</div>
      <div class="row"><label>Color</label><div class="colrow"><input id="mCol" type="color" value="${colorDe(o)}"><small>${k == 'color' ? '' : 'tiñe la textura'}</small></div></div>
      <div class="paleta">${PALETA.map(([t, c]) => `<button class="chip" data-c="${c}" title="${t} ${c}" style="background:${c}"></button>`).join('')}</div>`
    + (kinds.size == 1 && k == 'fachada' ? `<div class="row"><label>Huecos</label><select id="fEst">${ESTILOS.map(([v, t]) => `<option value="${v}"${v == pz.fachada.estilo ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="row"><label>Variación</label><div style="display:flex;gap:4px"><input id="fSem" type="number" step="16" value="${pz.fachada.semilla}" style="width:90px"><button id="fAzar" title="Otra combinación de puertas, persianas y balcones">🎲</button></div></div>` : '')
    + (kinds.size == 1 && k == 'color' ? `<div class="row"><label>Luz propia</label><div><input id="mEmiOn" type="checkbox"${pz.material.emissive ? ' checked' : ''}> <input id="mEmi" type="color" value="${pz.material.emissive || '#ffcc66'}"></div></div>` : '')
    + `<div class="row"><label>Dos caras</label><input id="mDoble" type="checkbox"${pz.material.doble !== false ? ' checked' : ''}></div></div>
    <div class="acc">
      ${uno ? '<button id="aVert" title="V o doble clic">◇ Vértices</button>' : '<button id="aUnir" title="Une varias piezas del mismo material en una">Unir</button>'}
      <button id="aSep" title="Divide la pieza en sus partes sueltas (p. ej. una valla en malla y postes)">Separar</button>
      <button id="aIg" title="Elige todas las piezas con este mismo material y color">Elegir iguales</button>
      <button id="aSuelo" title="Baja (o sube) la pieza hasta el terreno">Apoyar en el suelo</button>
      <button id="aDup" title="Ctrl+D">Duplicar</button><button id="aOc" title="H">${S.every(x => !x.visible) ? 'Mostrar' : 'Ocultar'}</button>
      <button id="aTex" title="Recalcula huecos de fachada y texturas a su tamaño real">Recalcular texturas</button>
      <button id="aBorrar" class="peligro" title="Supr">Borrar</button>
    </div>`;
  const num = id => +$(id).value || 0;
  if (uno) {
    $('pNom').onchange = e => { pz.nombre = e.target.value || pz.nombre; o.name = pz.nombre; ed.commit('Renombrar'); pintarLista(); };
    for (const id of ['px', 'py', 'pz']) $(id).onchange = () => ed.cambiar(x => { x.position.set(num('px'), num('py'), num('pz')); actualizarDerivados(x, false); }, 'Mover');
    for (const id of ['rx', 'ry', 'rz']) $(id).onchange = () => ed.cambiar(x => { x.quaternion.setFromEuler(new THREE.Euler(...['rx', 'ry', 'rz'].map(i => THREE.MathUtils.degToRad(num(i))), 'YXZ')); actualizarDerivados(x, false); }, 'Girar');
    for (const id of ['sx', 'sy', 'sz']) $(id).onchange = () => ed.cambiar(x => { x.scale.set(num('sx') || 1, num('sy') || 1, num('sz') || 1); actualizarDerivados(x, true); }, 'Escalar');
    $('aVert').onclick = () => ed.entrarVertices();
  } else $('aUnir').onclick = () => { const e = ed.unirPiezas(); if (e) toast(e); };
  document.querySelectorAll('#props .mat').forEach(b => b.onclick = () => aplicarMaterial(b.dataset.k));
  document.querySelectorAll('#props .chip').forEach(b => b.onclick = () => ed.cambiar(x => pintar(x, b.dataset.c), 'Color'));
  $('aSep').onclick = () => { if (!ed.separarSel(separar)) toast('Esta pieza no tiene partes sueltas que separar.'); };
  $('aIg').onclick = () => { const key = x => x.userData.pieza.material.kind + colorDe(x), ks = new Set(S.map(key)); ed.seleccionar(ed.piezas().filter(x => x.visible && ks.has(key(x)))); };
  const aplicarMaterial = v => {
    ed.cambiar(x => { const p = x.userData.pieza; ed.setMaterial(x, { ...p.material, kind: v, ...(v == 'color' ? {} : { emissive: undefined }) });
      if (v == 'fachada') { if (p.fachada.estilo == null) p.fachada.estilo = -1; p.fachada.auto = true; } else if (v != 'color') p.uvAuto = true;
      actualizarDerivados(x, false); }, 'Material'); };
  $('mCol').onchange = e => ed.cambiar(x => pintar(x, e.target.value), 'Color');
  if ($('fEst')) {
    $('fEst').onchange = e => ed.cambiar(x => { const f = x.userData.pieza.fachada; f.estilo = +e.target.value; f.auto = true; actualizarDerivados(x, false); }, 'Huecos de fachada');
    $('fSem').onchange = e => ed.cambiar(x => { const f = x.userData.pieza.fachada; f.semilla = Math.max(0, Math.round(+e.target.value) || 0); f.auto = true; actualizarDerivados(x, false); }, 'Variación');
    $('fAzar').onclick = () => ed.cambiar(x => { const f = x.userData.pieza.fachada; f.semilla = Math.floor(Math.random() * 997) * 16; f.auto = true; actualizarDerivados(x, false); }, 'Variación');
  }
  if ($('mEmiOn')) { const f = () => ed.cambiar(x => ed.setMaterial(x, { ...x.userData.pieza.material, emissive: $('mEmiOn').checked ? $('mEmi').value : undefined }), 'Luz propia'); $('mEmiOn').onchange = f; $('mEmi').onchange = f; }
  $('mDoble').onchange = e => ed.cambiar(x => ed.setMaterial(x, { ...x.userData.pieza.material, doble: e.target.checked }), 'Dos caras');
  $('aSuelo').onclick = () => ed.cambiar(x => { const b = new THREE.Box3().setFromObject(x), c = b.getCenter(new THREE.Vector3()); x.position.y += ed.alturaSuelo(c.x, c.z) - b.min.y; actualizarDerivados(x, false); }, 'Apoyar en el suelo');
  $('aDup').onclick = () => ed.duplicar();
  $('aOc').onclick = () => { const v = S.every(x => !x.visible); ed.cambiar(x => { x.visible = v; }, v ? 'Mostrar' : 'Ocultar'); pintarLista(); };
  $('aTex').onclick = () => ed.cambiar(x => { const p = x.userData.pieza; if (p.material.kind == 'fachada') p.fachada.auto = true; else if (p.material.kind != 'color') p.uvAuto = true; actualizarDerivados(x, false); }, 'Recalcular texturas');
  $('aBorrar').onclick = () => ed.borrar();
}
function refrescarNumeros() {   // durante el arrastre del gizmo, solo los números
  const S = ed.seleccion; if (S.length != 1 || !$('px')) return;
  const o = S[0], rot = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ');
  [['px', o.position.x], ['py', o.position.y], ['pz', o.position.z], ['sx', o.scale.x], ['sy', o.scale.y], ['sz', o.scale.z]].forEach(([i, v]) => { $(i).value = R2(v); });
  [['rx', rot.x], ['ry', rot.y], ['rz', rot.z]].forEach(([i, v]) => { $(i).value = deg(v); });
}

// =====================================================================================================================
// Conexión con el editor, barra de herramientas y teclado
// =====================================================================================================================
function conectarEditor() {
  ed.on('seleccion', () => { pintarLista(); pintarProps(); });
  ed.on('transform', refrescarNumeros);
  ed.on('vertices', pintarProps);
  ed.on('cambio', e => { pintarCabecera(); pintarLista(); if (!/^(Mover|Girar|Escalar)$/.test(e.label)) pintarProps(); else refrescarNumeros(); estado(); });
  ed.on('modo', m => {
    document.querySelectorAll('#segModo button').forEach(b => b.classList.toggle('on', b.dataset.m == m.modo));
    $('btnEspacio').textContent = m.espacio == 'local' ? 'Local' : 'Global'; $('btnVert').classList.toggle('on', m.vertices); pintarProps(); estado();
  });
  ed.on('punto', p => { ultimoPunto = p; });
  ed.on('aviso', m => toast(m, 5000));
  ed.on('frame', () => { $('brujula').querySelector('span').style.transform = `translate(-50%,-50%) rotate(${-ed.rumboCamara()}rad) translateY(-12px) rotate(${ed.rumboCamara()}rad)`; });
  document.querySelectorAll('#segModo button').forEach(b => b.onclick = () => ed.setModo(b.dataset.m));
  $('btnEspacio').onclick = () => ed.setEspacio($('btnEspacio').textContent == 'Global' ? 'local' : 'world');
  $('btnAjuste').onclick = () => { const on = !$('btnAjuste').classList.contains('on'); $('btnAjuste').classList.toggle('on', on); ed.setAjuste(on); };
  $('btnVert').onclick = () => { if (ed.vertices) ed.salirVertices(); else if (!ed.entrarVertices()) toast('Elige una sola pieza para editar sus vértices.'); };
  document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => (b.dataset.v == 'encuadrar' ? ed.encuadrar() : ed.vista(b.dataset.v)));
  $('chkOrto').onchange = e => ed.setOrto(e.target.checked);
  $('chkVecinos').onchange = e => ed.setVecinos(e.target.checked);
  $('chkNoche').onchange = e => ed.noche(e.target.checked);
  $('btnUndo').onclick = () => ed.undo(); $('btnRedo').onclick = () => ed.redo();
  $('btnGuardar').onclick = guardar; $('btnEnviar').onclick = enviar;
  $('btnCasas').onclick = () => mostrarInicio(true);
  $('filtro').oninput = e => { filtro = e.target.value; pintarLista(); };
  $('fBuscar').onsubmit = e => { e.preventDefault(); abrir($('q').value); $('q').blur(); };
  $('fBuscar2').onsubmit = e => { e.preventDefault(); abrir($('q2').value); };
  $('btnMas').onclick = e => { e.stopPropagation(); $('menuMas').classList.toggle('open'); };
  addEventListener('click', () => $('menuMas').classList.remove('open'));
  $('menuMas').querySelectorAll('button').forEach(b => b.onclick = () => accion(b.dataset.a));
  $('fileProp').onchange = e => { const f = e.target.files[0]; if (f) importarPropuesta(f); e.target.value = ''; };
  // Arrastrar un .forge.json a la ventana también lo abre como propuesta
  addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind == 'file')) e.preventDefault(); });
  addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(x => /\.json$/i.test(x.name)); if (f) { e.preventDefault(); importarPropuesta(f); } });
  $('fileGLB').onchange = e => { const f = e.target.files[0]; if (f) importarGLB(f); e.target.value = ''; };
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() == 's') { e.preventDefault(); guardar(); }
    if (e.key == 'Escape') $('modal').classList.remove('open');
  });
  addEventListener('beforeunload', e => { if (casa && ed.sucio) { e.preventDefault(); e.returnValue = ''; } });
  ed.setModo('translate');
}
function estado() {
  if (!casa) return;
  const h = ed.historial, V = ed.vertices;
  $('estado').textContent = (V ? 'Vértices: clic para elegir · Mayús+clic añade · flechas para mover · Esc sale'
    : 'Clic: elegir · Mayús+clic: varias · W/R/S: mover/girar/escalar · V: vértices · Supr: borrar · Ctrl+D: duplicar · F: encuadrar · H: ocultar')
    + `   ·   Último cambio: ${h.label || '—'}`;
}
async function accion(a) {
  if (a == 'ayuda') return modal('Atajos de teclado', `<table>${[['Clic / Mayús+clic', 'Elegir pieza / añadir a la selección'], ['W · R · S', 'Gizmo: mover · girar · escalar'],
    ['Flechas', 'Cámara: avanzar, retroceder y desplazarse'], ['Q · E', 'Cámara: girar alrededor'], ['Re Pág · Av Pág', 'Cámara: subir · bajar'], ['+ · −', 'Cámara: acercar · alejar'], ['Mayús', 'Cámara más rápida'], ['V o doble clic', 'Editar vértices de la pieza'],
    ['Ctrl+A (en vértices)', 'Elegir todos los vértices'], ['Supr', 'Borrar'], ['Ctrl+D', 'Duplicar'], ['H · Alt+H', 'Ocultar · mostrar todo'], ['F', 'Encuadrar la selección'],
    ['Ctrl+Z · Ctrl+Y', 'Deshacer · rehacer'], ['Ctrl+S', 'Guardar'], ['Esc', 'Quitar selección / salir de vértices'], ['Rueda · arrastrar · botón derecho', 'Zoom · orbitar · desplazar']]
    .map(([k, t]) => `<tr><td><kbd>${k}</kbd></td><td>${t}</td></tr>`).join('')}</table>`);
  if (a == 'importarProp') return $('fileProp').click();
  if (!casa) return toast('Abre primero una casa.');
  if (a == 'exportar') return exportarGLB();
  if (a == 'importar') return $('fileGLB').click();
  if (a == 'propuesta') return exportarPropuesta();
  if (a == 'regenerar') {
    if (!confirm('Se vuelve a generar la casa con el código de v0.7 y se pierden los cambios de esta sesión. (Lo guardado no se toca hasta que guardes.)')) return;
    ed.cargar(generarCasa(casa.Z, casa.p.ref, D.ajustes), 'Regenerada desde v0.7', true); ed.encuadrar(ed.piezas()); return;
  }
  if (a == 'descartar') {
    if (!guardadas.has(casa.p.ref)) return toast('Esta casa no tiene versión editada guardada.');
    if (!confirm(modo == 'completo' ? 'Se quita la versión editada (queda una copia en casas/historial) y Menorca3D volverá a usar la de v0.7 la próxima vez que envíes. ¿Seguir?' : 'Se borra tu versión editada de esta casa y vuelve a la de v0.7. ¿Seguir?')) return;
    await api.borrarCasa(casa.p.ref); await refrescarGuardadas(); casa.editada = false;
    ed.cargar(generarCasa(casa.Z, casa.p.ref, D.ajustes), 'Descartada la versión editada'); pintarCabecera();
    toast(modo == 'completo' ? 'Versión editada descartada. Pulsa «Enviar a Menorca3D» para quitarla también del modelo de la isla.' : 'Versión editada descartada.', 6000);
  }
}

// ---------- GLB: ida y vuelta con Blender u otros programas ----------
function exportarGLB() {
  const root = new THREE.Group(), box = new THREE.Box3(); ed.piezas().forEach(o => o.visible && box.expandByObject(o));
  const c = box.getCenter(new THREE.Vector3()); c.y = box.min.y;
  root.userData.forge = { ref: casa.p.ref, n: casa.p.n, offset: c.toArray(), nota: 'Marco local de v0.7 menos offset (x este, y arriba, z sur)' };
  for (const o of ed.piezas()) {
    if (!o.visible) continue;
    const pz = o.userData.pieza, g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color']) g.setAttribute(k, o.geometry.attributes[k].clone());
    const k = pz.material.kind, map = k != 'color' ? tex(k == 'fachada' ? 'estuco' : k).map : null;
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map, side: pz.material.doble === false ? THREE.FrontSide : THREE.DoubleSide,
      ...(pz.material.emissive ? { emissive: new THREE.Color(pz.material.emissive) } : {}) }));
    m.name = pz.nombre; m.position.copy(o.position).sub(c); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale); root.add(m);
  }
  new GLTFExporter().parse(root, buf => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    a.download = `${casa.p.ref}_n${casa.p.n}.glb`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('GLB exportado. Si lo retocas en Blender, vuelve a traerlo con «Importar GLB»: se coloca solo en su sitio.', 6000);
  }, err => toast('No se pudo exportar: ' + esc(err.message)), { binary: true });
}
function importarGLB(file) {
  const rd = new FileReader();
  rd.onload = () => new GLTFLoader().parse(rd.result, '', gltf => {
    let off = null; gltf.scene.traverse(o => { if (!off && o.userData && o.userData.forge && o.userData.forge.offset) off = o.userData.forge.offset; });
    const g = gltf.scene;
    if (off) g.position.add(new THREE.Vector3(...off));
    else { const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()), t = ultimoPunto ? ultimoPunto.point : ed.orbit.target;
      g.position.set(t.x - c.x, ed.alturaSuelo(t.x, t.z) - b.min.y, t.z - c.z); }
    const nuevas = piezasDeGrupo(g, 'importado');
    if (!nuevas.length) return toast('El archivo no tiene mallas.');
    const quitar = off && confirm(`El GLB viene de Forge (nº ${(gltf.scene.children[0] && gltf.scene.children[0].userData.forge || {}).n ?? '?'}). ¿Sustituir todas las piezas actuales por las del archivo?\n\nAceptar: sustituir · Cancelar: añadirlas a las actuales`);
    if (quitar) ed.cargar(nuevas, 'Importar GLB (sustituir)', true);
    else { nuevas.forEach(m => ed.raiz.add(m)); ed.seleccionar(nuevas); ed.commit('Importar GLB'); }
    toast(`${nuevas.length} piezas importadas de ${esc(file.name)}. Las texturas propias del archivo se cambian por su color; puedes ponerles las de v0.7.`, 6500);
  }, err => toast('No se pudo leer el GLB: ' + esc(err.message || err)));
  rd.readAsArrayBuffer(file);
}

// =====================================================================================================================
// Mapa de parcelas de la pantalla de inicio
// =====================================================================================================================
let dibujarMapa = () => {};
function initMapa() {
  const cv = $('mapa'), g = cv.getContext('2d'), tip = $('mapaTip');
  const L = [...D.parcelas.values()];
  for (const p of L) { p.path = new Path2D(); for (const r of p.rings) { r.forEach((q, i) => (i ? p.path.lineTo(q[0], q[1]) : p.path.moveTo(q[0], q[1]))); p.path.closePath(); } }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of L) { x0 = Math.min(x0, p.box[0]); x1 = Math.max(x1, p.box[1]); z0 = Math.min(z0, p.box[2]); z1 = Math.max(z1, p.box[3]); }
  let s = 1, ox = 0, oz = 0, hover = null, W = 0, H = 0;
  const fit = () => { const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio;
    if (s == 1 && !ox) { s = Math.min(W / (x1 - x0), H / (z1 - z0)) * .95; ox = (x0 + x1) / 2; oz = (z0 + z1) / 2; } };
  const toW = (px, py) => [(px - W / 2) / s + ox, (py - H / 2) / s + oz];
  dibujarMapa = () => {
    if ($('inicio').classList.contains('oculto')) return;
    fit(); g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); g.clearRect(0, 0, W, H);
    g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-ox, -oz); g.lineWidth = 1 / s;
    for (const p of L) { const e = guardadas.has(p.ref); g.fillStyle = p == hover ? '#f0c27a' : e ? '#e2a33e' : p.zona == 'zona' ? '#6f7a87' : '#4d5662'; g.fill(p.path, 'evenodd'); }
    if (s > 2.2) { g.fillStyle = '#0e1115'; g.font = `${11 / s}px Segoe UI`; g.textAlign = 'center';
      for (const p of L) if (p.n && (p.box[1] - p.box[0]) * s > 22) g.fillText(p.n, (p.box[0] + p.box[1]) / 2, (p.box[2] + p.box[3]) / 2 + 4 / s); }
  };
  const at = (px, py) => { const [x, z] = toW(px, py); g.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of L) if (x >= p.box[0] && x <= p.box[1] && z >= p.box[2] && z <= p.box[3] && g.isPointInPath(p.path, x, z, 'evenodd')) return p; return null; };
  let drag = null;
  cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, ox, oz, moved: false }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => {
    const r = cv.getBoundingClientRect();
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true; ox = drag.ox - dx / s; oz = drag.oz - dy / s; dibujarMapa(); return; }
    const p = at(e.clientX - r.left, e.clientY - r.top);
    if (p != hover) { hover = p; dibujarMapa(); }
    if (p) { tip.style.display = 'block'; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 10) + 'px';
      tip.innerHTML = `<b>Nº ${p.n}</b> · ${p.ref}${p.provisional ? ' (nº provisional)' : ''}<br>${p.piezas} piezas · ${Math.round(p.A)} m²${guardadas.has(p.ref) ? ' · <span style="color:#f0c27a">editada</span>' : ''}`; }
    else tip.style.display = 'none';
  };
  cv.onpointerup = e => { const r = cv.getBoundingClientRect(); if (drag && !drag.moved) { const p = at(e.clientX - r.left, e.clientY - r.top); if (p) abrir(p.ref); } drag = null; };
  cv.onpointerleave = () => { tip.style.display = 'none'; hover = null; dibujarMapa(); };
  cv.onwheel = e => { e.preventDefault(); const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, [wx, wz] = toW(px, py);
    s *= e.deltaY < 0 ? 1.2 : 1 / 1.2; ox = wx - (px - W / 2) / s; oz = wz - (py - H / 2) / s; dibujarMapa(); };
  addEventListener('resize', dibujarMapa);
  dibujarMapa();
}
