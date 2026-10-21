// Vista 3D y herramientas: selección, mover / girar / escalar, edición de vértices, deshacer, contexto (terreno,
// ortofoto y casas vecinas) y día/noche. La escena está en el plano local de v0.7 (x este, y altura, z sur).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { setMaxAnisotropy } from '/v07/core/textures.js';
import { dayNight } from '/v07/core/dayNight.js';
import { createBuildings } from '/v07/buildings/buildings.js';
import { serializar, deserializar, actualizarDerivados, crearPieza, material } from './casa.js';

const DAY = { sky: new THREE.Color(0xbfe3f2), hemi: [new THREE.Color(0xffffff), new THREE.Color(0x8a9a78), 2.4], sun: [new THREE.Color(0xfff2d8), 2.2] };
const NIGHT = { sky: new THREE.Color(0x0b1426), hemi: [new THREE.Color(0x7f95c8), new THREE.Color(0x1c2230), .7], sun: [new THREE.Color(0xa9bdff), .55] };

export function crearEditor(canvas) {
  const ev = new Map(), emit = (k, d) => (ev.get(k) || []).forEach(f => f(d));
  const on = (k, f) => (ev.get(k) || ev.set(k, []).get(k)).push(f);

  // ---------- Escena ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); setMaxAnisotropy(renderer);
  const scene = new THREE.Scene(), sky = new THREE.Color(); scene.background = sky;
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 5000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a9a78, 2.4), sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(300, 400, 150); scene.add(hemi, sun, sun.target);
  dayNight.on(n => {
    sky.copy(DAY.sky).lerp(NIGHT.sky, n);
    hemi.color.copy(DAY.hemi[0]).lerp(NIGHT.hemi[0], n); hemi.groundColor.copy(DAY.hemi[1]).lerp(NIGHT.hemi[1], n); hemi.intensity = DAY.hemi[2] + (NIGHT.hemi[2] - DAY.hemi[2]) * n;
    sun.color.copy(DAY.sun[0]).lerp(NIGHT.sun[0], n); sun.intensity = DAY.sun[1] + (NIGHT.sun[1] - DAY.sun[1]) * n;
  });
  dayNight.set(false);

  const raiz = new THREE.Group(), contexto = new THREE.Group(), marcas = new THREE.Group();
  scene.add(contexto, raiz, marcas);
  const orbit = new OrbitControls(camera, canvas); orbit.enableDamping = true; orbit.dampingFactor = .12; orbit.screenSpacePanning = true;
  orbit.maxPolarAngle = Math.PI * .495;
  const pivot = new THREE.Object3D(); scene.add(pivot);
  const tc = new TransformControls(camera, canvas); tc.size = .85; scene.add(tc.getHelper());
  tc.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });

  const resize = () => { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(canvas.parentElement); resize();
  // ---------- Cámara con el teclado ----------
  // Flechas: avanzar / retroceder / desplazarse · Q / E: girar alrededor del punto central · Re Pág / Av Pág: subir / bajar
  // + / -: acercar / alejar · Mayús: más rápido. Se mueve la cámara y su punto central juntos (como andar por la escena).
  const teclas = new Set(); let tPrev = performance.now();
  const CAM_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', 'pageup', 'pagedown', '+', '-', 'add', 'subtract']);
  addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase(); if (CAM_KEYS.has(k)) { teclas.add(k); if (k.startsWith('arrow') || k.startsWith('page')) e.preventDefault(); }
  });
  addEventListener('keyup', e => teclas.delete(e.key.toLowerCase()));
  addEventListener('blur', () => teclas.clear());
  const fw = new THREE.Vector3(), rt = new THREE.Vector3(), mv = new THREE.Vector3();
  function moverCamara(dt) {
    if (!teclas.size) return;
    const fast = teclas.has('shift') ? 3 : 1, dist = camera.position.distanceTo(orbit.target), v = Math.max(4, dist * .9) * fast * dt;
    fw.subVectors(orbit.target, camera.position).setY(0); if (fw.lengthSq() < 1e-8) fw.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0); fw.normalize();
    rt.crossVectors(fw, camera.up).normalize(); mv.set(0, 0, 0);
    if (teclas.has('arrowup')) mv.add(fw); if (teclas.has('arrowdown')) mv.sub(fw);
    if (teclas.has('arrowright')) mv.add(rt); if (teclas.has('arrowleft')) mv.sub(rt);
    if (teclas.has('pageup')) mv.y += 1; if (teclas.has('pagedown')) mv.y -= 1;
    if (mv.lengthSq()) { mv.normalize().multiplyScalar(v); camera.position.add(mv); orbit.target.add(mv); }
    const giro = (teclas.has('q') ? 1 : 0) - (teclas.has('e') ? 1 : 0);
    if (giro) { const a = giro * 1.4 * fast * dt, off = camera.position.clone().sub(orbit.target).applyAxisAngle(camera.up, a); camera.position.copy(orbit.target).add(off); }
    const zoom = (teclas.has('+') || teclas.has('add') ? 1 : 0) - (teclas.has('-') || teclas.has('subtract') ? 1 : 0);
    if (zoom) { const off = camera.position.clone().sub(orbit.target).multiplyScalar(Math.exp(-zoom * 1.6 * fast * dt)); if (off.length() > .5) camera.position.copy(orbit.target).add(off); }
  }
  addEventListener('keydown', e => { if (e.key == 'Shift') teclas.add('shift'); });
  addEventListener('keyup', e => { if (e.key == 'Shift') teclas.delete('shift'); });
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(.1, (now - tPrev) / 1000); tPrev = now;
    moverCamara(dt);
    orbit.update();
    for (const h of marcas.children) h.update && h.update();
    renderer.render(scene, camera);
    emit('frame');
  });

  // ---------- Estado ----------
  let sel = [], modo = 'translate', espacio = 'world', vtx = null, Z = null, parcela = null;
  const piezas = () => raiz.children;

  // ---------- Selección ----------
  function seleccionar(list, add = false) {
    if (vtx) salirVertices();
    list = list.filter(Boolean);
    if (add) { for (const o of list) sel = sel.includes(o) ? sel.filter(x => x != o) : [...sel, o]; } else sel = list;
    marcas.clear(); for (const o of sel) marcas.add(new THREE.BoxHelper(o, 0xffc828));
    colocarPivote(); emit('seleccion', sel);
  }
  function colocarPivote() {
    if (vtx) return;
    if (!sel.length) { tc.detach(); return; }
    const box = new THREE.Box3(); for (const o of sel) box.expandByObject(o);
    pivot.position.copy(box.getCenter(new THREE.Vector3()));
    pivot.quaternion.copy(sel.length == 1 && espacio == 'local' ? sel[0].quaternion : new THREE.Quaternion()); pivot.scale.set(1, 1, 1);
    pivot.updateMatrixWorld(); tc.setSpace(espacio); tc.setMode(modo); tc.attach(pivot);
  }

  // ---------- Transformaciones con el gizmo (sobre un pivote: vale para una o varias piezas) ----------
  let start = null;
  tc.addEventListener('mouseDown', () => {
    pivot.updateMatrixWorld();
    if (vtx) start = { p: pivot.position.clone(), pts: vtx.sel.map(gi => vtx.grupos[gi].w.clone()) };
    else start = { piv: pivot.matrixWorld.clone(), objs: sel.map(o => (o.updateMatrixWorld(), o.matrixWorld.clone())) };
  });
  tc.addEventListener('objectChange', () => {
    if (!start) return;
    pivot.updateMatrixWorld();
    if (vtx) { moverVertices(pivot.position.clone().sub(start.p)); return; }
    const delta = pivot.matrixWorld.clone().multiply(start.piv.clone().invert());
    sel.forEach((o, i) => delta.clone().multiply(start.objs[i]).decompose(o.position, o.quaternion, o.scale));
    emit('transform', sel);
  });
  tc.addEventListener('mouseUp', () => {
    if (!start) return;
    if (vtx) { actualizarDerivados(vtx.mesh, true); rehacerPuntos(); start = null; commit('Mover vértices'); return; }
    const escala = tc.mode == 'scale';
    for (const o of sel) actualizarDerivados(o, escala);
    start = null; colocarPivote(); commit(escala ? 'Escalar' : tc.mode == 'rotate' ? 'Girar' : 'Mover');
  });
  function setModo(m) { modo = m; if (!vtx) tc.setMode(m); emit('modo', { modo, espacio, vertices: !!vtx }); }
  function setEspacio(e) { espacio = e; colocarPivote(); emit('modo', { modo, espacio, vertices: !!vtx }); }
  function setAjuste(on) {
    tc.setTranslationSnap(on ? .1 : null); tc.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null); tc.setScaleSnap(on ? .05 : null);
  }

  // ---------- Edición de vértices ----------
  // Los vértices que coinciden (mismo punto, varias caras) se mueven juntos.
  const ptsMat = new THREE.PointsMaterial({ size: 10, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true });
  function entrarVertices() {
    if (sel.length != 1) return false;
    const mesh = sel[0], P = mesh.geometry.attributes.position, map = new Map(), grupos = [];
    for (let i = 0; i < P.count; i++) {
      const k = Math.round(P.getX(i) * 1e3) + ',' + Math.round(P.getY(i) * 1e3) + ',' + Math.round(P.getZ(i) * 1e3);
      if (!map.has(k)) { map.set(k, grupos.length); grupos.push({ idx: [], l: new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)), w: new THREE.Vector3() }); }
      grupos[map.get(k)].idx.push(i);
    }
    vtx = { mesh, grupos, sel: [], pts: null };
    rehacerPuntos(); tc.detach(); tc.setMode('translate');
    emit('modo', { modo, espacio, vertices: true }); emit('vertices', vtx);
    return true;
  }
  function rehacerPuntos() {
    if (!vtx) return;
    const { mesh, grupos } = vtx, P = mesh.geometry.attributes.position; mesh.updateMatrixWorld(true);
    for (const g of grupos) { g.l.fromBufferAttribute(P, g.idx[0]); g.w.copy(g.l).applyMatrix4(mesh.matrixWorld); }
    if (vtx.pts) { scene.remove(vtx.pts); vtx.pts.geometry.dispose(); }
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(grupos.length * 3), col = new Float32Array(grupos.length * 3);
    grupos.forEach((g, i) => { g.w.toArray(pos, i * 3); const on = vtx.sel.includes(i); col.set(on ? [1, .25, .2] : [1, .83, .23], i * 3); });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    vtx.pts = new THREE.Points(geo, ptsMat); vtx.pts.renderOrder = 999; scene.add(vtx.pts);
    if (vtx.sel.length) {
      const c = new THREE.Vector3(); for (const i of vtx.sel) c.add(grupos[i].w); pivot.position.copy(c.divideScalar(vtx.sel.length));
      pivot.quaternion.identity(); pivot.updateMatrixWorld(); tc.setSpace('world'); tc.attach(pivot);
    } else tc.detach();
  }
  function moverVertices(d) {
    const { mesh, grupos } = vtx, P = mesh.geometry.attributes.position, inv = mesh.matrixWorld.clone().invert(), v = new THREE.Vector3();
    vtx.sel.forEach((gi, k) => { v.copy(start.pts[k]).add(d).applyMatrix4(inv); for (const i of grupos[gi].idx) P.setXYZ(i, v.x, v.y, v.z); });
    P.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    const pp = vtx.pts.geometry.attributes.position; vtx.sel.forEach((gi, k) => { v.copy(start.pts[k]).add(d); pp.setXYZ(gi, v.x, v.y, v.z); }); pp.needsUpdate = true;
  }
  function salirVertices() {
    if (!vtx) return;
    scene.remove(vtx.pts); vtx.pts.geometry.dispose(); vtx = null; tc.detach();
    emit('modo', { modo, espacio, vertices: false }); colocarPivote();
  }
  function selVertice(i, add) {
    if (add) vtx.sel = vtx.sel.includes(i) ? vtx.sel.filter(x => x != i) : [...vtx.sel, i]; else vtx.sel = i == null ? [] : [i];
    rehacerPuntos(); emit('vertices', vtx);
  }
  // Mover los vértices elegidos una distancia exacta, o igualar su altura (p. ej. nivelar un alero)
  function vertices(op, val) {
    if (!vtx || !vtx.sel.length) return;
    const { mesh, grupos } = vtx, P = mesh.geometry.attributes.position, inv = mesh.matrixWorld.clone().invert(), v = new THREE.Vector3();
    const ys = vtx.sel.map(i => grupos[i].w.y), y = op == 'max' ? Math.max(...ys) : op == 'min' ? Math.min(...ys) : op == 'y' ? val : ys.reduce((a, b) => a + b, 0) / ys.length;
    for (const gi of vtx.sel) {
      v.copy(grupos[gi].w); if (op == 'delta') v.add(val); else v.y = y;
      v.applyMatrix4(inv); for (const i of grupos[gi].idx) P.setXYZ(i, v.x, v.y, v.z);
    }
    P.needsUpdate = true; actualizarDerivados(mesh, true); rehacerPuntos(); commit(op == 'delta' ? 'Mover vértices' : 'Igualar altura');
  }
  function todosVertices() { if (vtx) { vtx.sel = vtx.grupos.map((_, i) => i); rehacerPuntos(); emit('vertices', vtx); } }

  // ---------- Clic: seleccionar pieza o vértice ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, axis: tc.axis }; });
  canvas.addEventListener('pointerup', e => {
    if (!down || e.button != 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || down.axis) { down = null; return; }
    down = null;
    const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (vtx) {
      // el vértice más cercano al rayo, en píxeles de pantalla
      let best = null, bd = 14; const v = new THREE.Vector3();
      vtx.grupos.forEach((g, i) => { v.copy(g.w).project(camera); if (v.z > 1) return; const px = Math.hypot((v.x - ndc.x) * r.width / 2, (v.y - ndc.y) * r.height / 2); if (px < bd) { bd = px; best = i; } });
      if (best != null || !e.shiftKey) selVertice(best, e.shiftKey);
      return;
    }
    const hit = ray.intersectObjects(piezas().filter(o => o.visible), false)[0];
    seleccionar(hit ? [hit.object] : [], e.shiftKey);
    if (hit) {   // normal de la cara vista (las paredes de v0.7 no tienen todas el mismo sentido): siempre hacia la cámara
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
      if (n && n.dot(ray.ray.direction) > 0) n.negate();
      emit('punto', { point: hit.point.clone(), normal: n, object: hit.object });
    }
  });
  canvas.addEventListener('dblclick', () => { if (sel.length == 1 && !vtx) entrarVertices(); });

  // ---------- Historial (deshacer / rehacer) ----------
  let hist = [], hi = -1, guardadoEn = 0;
  const foto = () => serializar(piezas(), {});
  function commit(label) {
    hist = hist.slice(0, hi + 1); hist.push({ label, F: foto(), ids: sel.map(o => o.userData.pieza.id) }); if (hist.length > 80) hist.shift(); hi = hist.length - 1;
    emit('cambio', { label, sucio: hi != guardadoEn });
  }
  function restaurar(h) {
    if (vtx) salirVertices();
    vaciar(); for (const m of deserializar(h.F)) raiz.add(m);
    seleccionar(piezas().filter(o => h.ids.includes(o.userData.pieza.id)));
    emit('cambio', { label: h.label, sucio: hi != guardadoEn });
  }
  const undo = () => { if (hi > 0) { hi--; restaurar(hist[hi]); } };
  const redo = () => { if (hi < hist.length - 1) { hi++; restaurar(hist[hi]); } };
  const marcarGuardado = () => { guardadoEn = hi; emit('cambio', { label: 'Guardado', sucio: false }); };
  function vaciar() { for (const o of [...piezas()]) { o.geometry.dispose(); raiz.remove(o); } }

  // ---------- Operaciones sobre piezas ----------
  function cargar(list, label = 'Abrir', sucio = false) {
    if (vtx) salirVertices(); seleccionar([]); vaciar();
    for (const m of list) raiz.add(m);
    hist = []; hi = -1; commit(label); guardadoEn = sucio ? -1 : hi; emit('cambio', { label, sucio });
  }
  function añadir(meshes, label = 'Añadir') {
    meshes = [].concat(meshes);
    for (const m of meshes) { raiz.add(m); actualizarDerivados(m, false); }
    seleccionar(meshes); commit(label);
  }
  let hover = null;
  function resaltar(o) {
    if (hover) { scene.remove(hover); hover.geometry.dispose(); hover = null; }
    if (o && !sel.includes(o)) { hover = new THREE.BoxHelper(o, 0x4dd0ff); scene.add(hover); }
  }
  function separarSel(fn) {   // fn(mesh) → piezas nuevas o null
    const nuevas = [];
    for (const o of sel) { const L = fn(o); if (!L) continue; raiz.remove(o); o.geometry.dispose(); for (const m of L) { raiz.add(m); nuevas.push(m); } }
    if (!nuevas.length) return false;
    seleccionar(nuevas); commit('Separar'); return true;
  }
  function borrar() {
    if (!sel.length) return; const n = sel.length;
    for (const o of sel) { raiz.remove(o); o.geometry.dispose(); }
    seleccionar([]); commit(n > 1 ? `Borrar ${n} piezas` : 'Borrar');
  }
  function duplicar() {
    if (!sel.length) return;
    const copias = sel.map(o => {
      const c = new THREE.Mesh(o.geometry.clone(), o.material); c.position.copy(o.position).add(new THREE.Vector3(1, 0, 1)); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale);
      c.userData.pieza = JSON.parse(JSON.stringify(o.userData.pieza)); c.userData.pieza.id = crypto.randomUUID().slice(0, 8); c.userData.pieza.nombre += ' (copia)'; c.name = c.userData.pieza.nombre;
      raiz.add(c); return c;
    });
    seleccionar(copias); commit('Duplicar');
  }
  function unirPiezas() {   // varias piezas del mismo material → una
    if (sel.length < 2) return;
    const k = JSON.stringify(sel[0].userData.pieza.material);
    if (sel.some(o => JSON.stringify(o.userData.pieza.material) != k)) return 'Solo se pueden unir piezas con el mismo material.';
    const geos = sel.map(o => { o.updateMatrixWorld(); return o.geometry.clone().applyMatrix4(o.matrixWorld); });
    const n = geos.reduce((s, g) => s + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
    for (const [key, A] of Object.entries(geos[0].attributes)) {
      const a = new Float32Array(n * A.itemSize); let off = 0;
      for (const g of geos) { a.set(g.attributes[key].array, off); off += g.attributes[key].array.length; }
      out.setAttribute(key, new THREE.BufferAttribute(a, A.itemSize));
    }
    const p0 = sel[0].userData.pieza, m = crearPieza(out, { nombre: p0.nombre, material: p0.material, fachada: p0.fachada, uvAuto: p0.uvAuto, origen: p0.origen });
    for (const o of sel) { raiz.remove(o); o.geometry.dispose(); }
    raiz.add(m); seleccionar([m]); commit('Unir piezas');
  }
  function cambiar(fn, label) { if (!sel.length) return; for (const o of sel) fn(o); marcas.children.forEach(h => h.update()); colocarPivote(); commit(label); emit('seleccion', sel); }
  function setMaterial(o, spec) { o.userData.pieza.material = spec; o.material = material(spec); }

  // ---------- Cámara ----------
  function encuadrar(list = sel.length ? sel : piezas()) {
    const box = new THREE.Box3(); for (const o of list) if (o.visible) box.expandByObject(o);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), r = Math.max(4, box.getSize(new THREE.Vector3()).length() * .6);
    const dir = camera.position.clone().sub(orbit.target); if (dir.lengthSq() < 1e-6) dir.set(.6, .55, .9);
    dir.normalize(); orbit.target.copy(c); camera.position.copy(c).addScaledVector(dir, r / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.near = Math.max(.05, r / 200); camera.updateProjectionMatrix();
  }
  function vista(nombre) {
    const t = orbit.target, d = camera.position.distanceTo(t);
    const dirs = { norte: [0, .35, -1], sur: [0, .35, 1], este: [1, .35, 0], oeste: [-1, .35, 0], planta: [0, 1, .001], persp: [.6, .55, .9] };
    camera.position.copy(t).addScaledVector(new THREE.Vector3(...dirs[nombre]).normalize(), d);
  }
  const rumboCamara = () => { const d = orbit.target.clone().sub(camera.position); return Math.atan2(d.x, -d.z); };   // 0 = mirando al norte

  // ---------- Contexto: terreno, ortofoto y casas vecinas ----------
  const ghost = new THREE.MeshLambertMaterial({ color: 0xd3d6db, side: THREE.DoubleSide });
  let terreno = null, vecinos = null, ortoURL = null;
  function setContexto(zona, p, datos, ajustes, { orto = true, conVecinos = true } = {}) {
    Z = zona; parcela = p;
    contexto.traverse(o => { if (o.geometry) o.geometry.dispose(); }); contexto.clear();
    const M = 45, [x0, x1, z0, z1] = [p.box[0] - M, p.box[1] + M, p.box[2] - M, p.box[3] + M], st = 1.5;
    const nx = Math.ceil((x1 - x0) / st), nz = Math.ceil((z1 - z0) / st), pos = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      pos.push(x, Z.Hgt(x, z) - .05, z); uv.push(i / nx, 1 - j / nz);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    terreno = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xbdb69f })); terreno.name = 'terreno'; contexto.add(terreno);
    // Ortofoto PNOA (IGN, CC BY 4.0) del mismo recuadro. La proyección local de v0.7 es lineal en lon/lat: encaja exacta.
    const [lo0, la1] = datos.toLL(x0, z0), [lo1, la0] = datos.toLL(x1, z1);
    ortoURL = 'https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:4326'
      + `&BBOX=${la0},${lo0},${la1},${lo1}&WIDTH=1024&HEIGHT=${Math.round(1024 * (z1 - z0) / (x1 - x0))}&FORMAT=image/jpeg`;
    setOrto(orto);
    // Casas vecinas (generadas por v0.7, en gris, no se pueden seleccionar)
    const near = Z.buildings.filter(b => b.ref != p.ref && b.p.some(q => q[0] > x0 + 10 && q[0] < x1 - 10 && q[1] > z0 + 10 && q[1] < z1 - 10));
    vecinos = near.length ? createBuildings({ ...Z, buildings: near }, ajustes).mesh : new THREE.Group();
    vecinos.traverse(o => { if (o.isMesh) o.material = ghost; if (o.isPoints || o.isSprite) o.visible = false; });
    vecinos.visible = conVecinos; contexto.add(vecinos);
  }
  function setOrto(on) {
    if (!terreno) return;
    const m = terreno.material;
    if (!on) { m.map = null; m.color.set(0xbdb69f); m.needsUpdate = true; return; }
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(ortoURL, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; m.map = t; m.color.set(0xffffff); m.needsUpdate = true; },
      undefined, () => emit('aviso', 'No se pudo cargar la ortofoto del IGN (¿sin internet?). Se usa terreno liso.'));
  }
  const setVecinos = on => { if (vecinos) vecinos.visible = on; };
  const alturaSuelo = (x, z) => (Z ? Z.Hgt(x, z) : 0);

  // ---------- Teclado ----------
  addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k == 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (ctrl && k == 'y') { e.preventDefault(); redo(); }
    else if (ctrl && k == 'd') { e.preventDefault(); duplicar(); }
    else if (ctrl && k == 'a' && vtx) { e.preventDefault(); todosVertices(); }
    else if (ctrl) return;
    else if (k == 'w' || k == 'g') setModo('translate');
    else if ((k == 'r' || k == 's') && vtx) { /* en vértices solo se mueve */ }
    else if (k == 'r') setModo('rotate');
    else if (k == 's') setModo('scale');
    else if (k == 'v' || k == 'tab') { e.preventDefault(); vtx ? salirVertices() : entrarVertices(); }
    else if (k == 'delete' || k == 'supr' || k == 'backspace') { if (!vtx) borrar(); }
    else if (k == 'f') encuadrar();
    else if (k == 'escape') { vtx ? (vtx.sel.length ? selVertice(null) : salirVertices()) : seleccionar([]); }
    else if (k == 'h') { if (e.altKey) cambiarTodos(o => { o.visible = true; }, 'Mostrar todo'); else cambiar(o => { o.visible = !o.visible; }, 'Ocultar'); }
  });
  function cambiarTodos(fn, label) { piezas().forEach(fn); commit(label); emit('seleccion', sel); }

  return {
    on, scene, camera, orbit, renderer, raiz, piezas, get seleccion() { return sel; }, get vertices() { return vtx; },
    seleccionar, setModo, setEspacio, setAjuste, entrarVertices, salirVertices, todosVertices, opVertices: vertices,
    cargar, añadir, separarSel, resaltar, borrar, duplicar, unirPiezas, cambiar, cambiarTodos, setMaterial, commit, undo, redo, marcarGuardado,
    get sucio() { return hi != guardadoEn; }, get historial() { return { n: hist.length, i: hi, label: hist[hi] && hist[hi].label }; },
    encuadrar, vista, rumboCamara, setContexto, setOrto, setVecinos, alturaSuelo,
    noche: on => dayNight.set(on), get esNoche() { return dayNight.night; },
  };
}
