// Piezas nuevas para añadir a la casa. Medidas en metros; la base queda en y = 0 (luego se apoya en el terreno).
import * as THREE from 'three';
import { completar, unir } from './casa.js';

const conColor = (g, hex) => {
  g = completar(g); const c = new THREE.Color(hex), C = g.attributes.color;
  for (let i = 0; i < C.count; i++) C.setXYZ(i, c.r, c.g, c.b);
  return g;
};
const caja = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const varias = list => unir(list.map(([g, hex]) => conColor(g, hex)));

// Tejado a dos aguas: caballete a lo largo de x
function dosAguas(w, d, h) {
  const x = w / 2, z = d / 2, p = [
    [-x, 0, -z], [x, 0, -z], [x, h, 0], [-x, 0, -z], [x, h, 0], [-x, h, 0],     // faldón norte
    [-x, 0, z], [-x, h, 0], [x, h, 0], [-x, 0, z], [x, h, 0], [x, 0, z],         // faldón sur
    [-x, 0, -z], [-x, h, 0], [-x, 0, z], [x, 0, -z], [x, 0, z], [x, h, 0],       // hastiales
  ];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3)); g.computeVertexNormals();
  return g;
}
function escalera(n, ancho, huella, tabica) {
  const list = [];
  for (let i = 0; i < n; i++) list.push([caja(ancho, tabica * (i + 1), huella, 0, 0, -i * huella), '#d9d4c8']);
  return varias(list);
}
function barandilla(L, h) {
  const list = [[caja(L, .05, .06, 0, h - .05, 0), '#2b2b2b']], n = Math.max(2, Math.round(L / .12));
  for (let i = 0; i <= n; i++) list.push([caja(.025, h - .05, .025, -L / 2 + i * L / n, 0, 0), '#2b2b2b']);
  return varias(list);
}
function ventana(w, h, marco = '#f2f0ea', vidrio = '#28323a') {
  const f = .08, d = .1;
  return varias([
    [caja(w, f, d, 0, 0, 0), marco], [caja(w, f, d, 0, h - f, 0), marco],
    [caja(f, h - 2 * f, d, -w / 2 + f / 2, f, 0), marco], [caja(f, h - 2 * f, d, w / 2 - f / 2, f, 0), marco],
    [caja(.03, h - 2 * f, .06, 0, f, 0), marco], [caja(w - 2 * f, h - 2 * f, .02, 0, f, 0), vidrio],
  ]);
}
function persiana(w, h, colorHex = '#2e6355') {   // mallorquina cerrada: lamas
  const list = [], n = Math.round(h / .07);
  for (let i = 0; i < n; i++) list.push([new THREE.BoxGeometry(w - .08, .045, .03).rotateX(-.35).translate(0, (i + .5) * h / n, 0), colorHex]);
  list.push([caja(.04, h, .05, -w / 2, 0, 0), colorHex], [caja(.04, h, .05, w / 2, 0, 0), colorHex], [caja(.03, h, .05, 0, 0, 0), colorHex]);
  return varias(list);
}
function puerta(w, h, hoja = '#5a3d2b', marco = '#f2f0ea') {
  const f = .08;
  return varias([[caja(w, f, .12, 0, h - f, 0), marco], [caja(f, h - f, .12, -w / 2 + f / 2, 0, 0), marco], [caja(f, h - f, .12, w / 2 - f / 2, 0, 0), marco],
    [caja(w - 2 * f, h - f, .05, 0, 0, 0), hoja], [caja(.04, .04, .1, w / 2 - .25, 1.0, 0), '#c9a54a']]);
}
function toldo(w, salida, colorHex = '#2f6b4f') {
  const g = new THREE.PlaneGeometry(w, Math.hypot(salida, .5)).rotateX(-Math.PI / 2 + Math.atan2(.5, salida)).translate(0, -.25, salida / 2);
  return varias([[g, colorHex], [caja(w, .06, .06, 0, -.53, salida), colorHex]]);
}

// Vallas como la del jardín del conjunto nº 1061 (v0.7/src/buildings/casa1061.js): pared seca baja (0,6 m) con malla
// verde encima hasta 1,5 m y postes cada ~2,5 m; verja metálica entre pilares; puerta blanca de jardín.
function mallaPostes(L, y0 = .6, alto = .9, malla = '#2f7d4f', poste = '#5b5f63') {
  const list = [[caja(L, alto, .04, 0, y0, 0), malla]], n = Math.max(1, Math.round(L / 2.5));
  for (let i = 0; i <= n; i++) list.push([caja(.05, alto + .05, .05, -L / 2 + i * L / n, y0, 0), poste]);
  return varias(list);
}
function verja(L = 3.2, h = 1.9, metal = '#7d8186', pilar = '#e9e3d6') {
  const inner = L - .9, list = [[caja(.45, h, .45, -L / 2 + .225, 0, 0), pilar], [caja(.45, h, .45, L / 2 - .225, 0, 0), pilar],
    [caja(inner, .06, .05, 0, h - .2, 0), metal], [caja(inner, .06, .05, 0, .18, 0), metal], [caja(inner, .05, .05, 0, h * .5, 0), metal]];
  const n = Math.round(inner / .14);
  for (let i = 0; i <= n; i++) list.push([caja(.03, h - .25, .03, -inner / 2 + i * inner / n, .16, 0), metal]);
  return varias(list);
}
function puertaJardin(w = 1, h = 1.85, hoja = '#f7f7f4', pilar = '#f3f1ea') {
  return varias([[caja(w, h, .08, 0, 0, 0), hoja], [caja(.3, h + .1, .32, -w / 2 - .15, 0, 0), pilar], [caja(.3, h + .1, .32, w / 2 + .15, 0, 0), pilar],
    [caja(.12, .03, .04, w / 2 - .15, 1, .05), '#3b3b3b']]);
}

// Catálogo: nombre, material y geometría por defecto. «partes»: objetos de varias piezas (cada una con su material).
export const VALLAS = ['vallamalla', 'malla', 'verja', 'puertajardin', 'tapia', 'seto'];
export const PRIMITIVAS = [
  { id: 'pared', nombre: 'Pared', grupo: 'Estructura', material: { kind: 'fachada', doble: true }, fachada: { estilo: 0, semilla: 0, auto: true }, color: '#ece9e2', geo: () => caja(4, 3, .25) },
  { id: 'caja', nombre: 'Volumen', grupo: 'Estructura', material: { kind: 'fachada', doble: true }, fachada: { estilo: -1, semilla: 0, auto: true }, color: '#ece9e2', geo: () => caja(4, 3, 4) },
  { id: 'losa', nombre: 'Losa / forjado', grupo: 'Estructura', material: { kind: 'terraza', doble: true }, color: '#ffffff', uvAuto: true, geo: () => caja(4, .2, 4) },
  { id: 'pretil', nombre: 'Pretil', grupo: 'Estructura', material: { kind: 'fachada', doble: true }, fachada: { estilo: -1, semilla: 0, auto: true }, color: '#ece9e2', geo: () => caja(4, .7, .2) },
  { id: 'pilar', nombre: 'Pilar', grupo: 'Estructura', material: { kind: 'color', doble: false }, color: '#ece9e2', geo: () => caja(.35, 2.7, .35) },
  { id: 'columna', nombre: 'Columna', grupo: 'Estructura', material: { kind: 'color', doble: false }, color: '#ece9e2', geo: () => new THREE.CylinderGeometry(.18, .18, 2.7, 16).translate(0, 1.35, 0) },
  { id: 'dosaguas', nombre: 'Tejado a dos aguas', grupo: 'Cubiertas', material: { kind: 'teja', doble: true }, color: '#ffffff', uvAuto: true, geo: () => dosAguas(6, 5, 1.3) },
  { id: 'cuatroaguas', nombre: 'Tejado a cuatro aguas', grupo: 'Cubiertas', material: { kind: 'teja', doble: true }, color: '#ffffff', uvAuto: true,
    geo: () => new THREE.ConeGeometry(Math.SQRT1_2 * 6, 1.4, 4, 1, true).rotateY(Math.PI / 4).translate(0, .7, 0) },
  { id: 'faldon', nombre: 'Faldón (plano)', grupo: 'Cubiertas', material: { kind: 'teja', doble: true }, color: '#ffffff', uvAuto: true, geo: () => new THREE.PlaneGeometry(4, 3).rotateX(-Math.PI / 2 + .47) },
  { id: 'cupula', nombre: 'Cúpula', grupo: 'Cubiertas', material: { kind: 'color', doble: true }, color: '#ece9e2', geo: () => new THREE.SphereGeometry(2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2) },
  { id: 'ventana', pegado: true, nombre: 'Ventana', grupo: 'Huecos', material: { kind: 'color', doble: false }, geo: () => ventana(1, 1.4) },
  { id: 'persiana', pegado: true, nombre: 'Persiana mallorquina', grupo: 'Huecos', material: { kind: 'color', doble: true }, geo: () => persiana(1, 1.4) },
  { id: 'puerta', pegado: true, nombre: 'Puerta', grupo: 'Huecos', material: { kind: 'color', doble: false }, geo: () => puerta(1, 2.2) },
  { id: 'porton', pegado: true, nombre: 'Portón de garaje', grupo: 'Huecos', material: { kind: 'color', doble: false }, geo: () => puerta(2.6, 2.4, '#e8e6df') },
  { id: 'balcon', pegado: true, nombre: 'Balcón con barandilla', grupo: 'Detalles', material: { kind: 'color', doble: false },
    geo: () => unir([conColor(caja(2, .15, .9, 0, 0, .45), '#ece9e2'), conColor(barandilla(2, 1).translate(0, .15, .88), '#2b2b2b')]) },
  { id: 'barandilla', nombre: 'Barandilla', grupo: 'Detalles', material: { kind: 'color', doble: false }, geo: () => barandilla(3, 1) },
  { id: 'escalera', nombre: 'Escalera', grupo: 'Detalles', material: { kind: 'color', doble: false }, geo: () => escalera(6, 1.2, .3, .17) },
  { id: 'toldo', pegado: true, nombre: 'Toldo', grupo: 'Detalles', material: { kind: 'color', doble: true }, geo: () => toldo(3, 1.2).translate(0, 2.6, 0) },
  { id: 'chimenea', nombre: 'Chimenea', grupo: 'Detalles', material: { kind: 'color', doble: false },
    geo: () => unir([conColor(caja(.6, 1.2, .6), '#ece9e2'), conColor(caja(.8, .08, .8, 0, 1.2, 0), '#ece9e2'), conColor(caja(.25, .25, .25, 0, 1.28, 0), '#8a3f2c')]) },
  { id: 'vallamalla', nombre: 'Valla: pared seca + malla', grupo: 'Vallas', partes: (L = 4) => [
      { nombre: 'Pared seca baja', material: { kind: 'piedra_seca', doble: true }, uvAuto: true, color: '#ffffff', geo: caja(L, .6, .4) },
      { nombre: 'Malla verde', material: { kind: 'color', doble: true }, geo: mallaPostes(L) }] },
  { id: 'malla', nombre: 'Malla con postes', grupo: 'Vallas', material: { kind: 'color', doble: true }, geo: () => mallaPostes(4, 0, 1.5) },
  { id: 'verja', nombre: 'Verja metálica', grupo: 'Vallas', pegado: false, material: { kind: 'color', doble: false }, geo: () => verja() },
  { id: 'puertajardin', nombre: 'Puerta de jardín', grupo: 'Vallas', material: { kind: 'color', doble: false }, geo: () => puertaJardin() },
  { id: 'tapia', nombre: 'Tapia con albardilla', grupo: 'Vallas', material: { kind: 'fachada', doble: true }, fachada: { estilo: -1, semilla: 0, auto: true },
    geo: () => unir([conColor(caja(4, 1.5, .25), '#ece9e2'), conColor(caja(4.05, .08, .35, 0, 1.5, 0), '#cfc8ba')]) },
  { id: 'seto', nombre: 'Seto', grupo: 'Vallas', material: { kind: 'color', doble: false }, color: '#3f6b35', geo: () => caja(4, 1.3, .7) },
  { id: 'paret', nombre: 'Pared seca', grupo: 'Exterior', material: { kind: 'piedra_seca', doble: false }, color: '#ffffff', uvAuto: true, geo: () => caja(4, 1, .6) },
  { id: 'piscina', nombre: 'Piscina', grupo: 'Exterior', material: { kind: 'color', doble: false },
    geo: () => unir([conColor(caja(6, .05, 3.2, 0, 0, 0), '#e9e6dc'), conColor(caja(5.2, .02, 2.4, 0, .05, 0), '#3fa7c9')]) },
  { id: 'arbol', nombre: 'Árbol', grupo: 'Exterior', material: { kind: 'color', doble: false },
    geo: () => unir([conColor(new THREE.CylinderGeometry(.12, .16, 2.2, 8).translate(0, 1.1, 0), '#6b5038'), conColor(new THREE.IcosahedronGeometry(1.5, 1).translate(0, 3.2, 0), '#4f7a3a')]) },
  { id: 'cilindro', nombre: 'Cilindro', grupo: 'Formas', material: { kind: 'color', doble: false }, color: '#ece9e2', geo: () => new THREE.CylinderGeometry(1, 1, 3, 24).translate(0, 1.5, 0) },
  { id: 'cono', nombre: 'Cono', grupo: 'Formas', material: { kind: 'color', doble: false }, color: '#ece9e2', geo: () => new THREE.ConeGeometry(1, 2, 24).translate(0, 1, 0) },
  { id: 'plano', nombre: 'Plano', grupo: 'Formas', material: { kind: 'color', doble: true }, color: '#ece9e2', geo: () => new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2) },
];
export function geometriaDe(P) {
  let g = completar(P.geo());
  if (P.color) g = conColor(g, P.color);
  return g;
}
// Piezas de un elemento del catálogo: [{ nombre, material, fachada, uvAuto, g }]
export function partesDe(P) {
  const L = P.partes ? P.partes() : [{ ...P, geo: P.geo() }];
  return L.map(x => {
    let g = completar(x.geo); if (x.color) g = conColor(g, x.color);
    return { nombre: P.partes ? x.nombre : P.nombre, material: { ...x.material }, uvAuto: !!x.uvAuto, g,
      fachada: x.fachada ? { ...x.fachada, semilla: Math.floor(Math.random() * 997) * 16 } : { estilo: -1, semilla: 0, auto: false } };
  });
}

// Huecos a medida para «Calcar desde foto»: w × h en metros, base en y = 0, centrados en x, mirando hacia +z.
// color: el de la foto (persiana, hoja de la puerta o del portón).
export const HUECOS = [
  ['ventana', 'Ventana', '#4dd0ff'], ['ventanaPersianas', 'Ventana con persianas abiertas', '#3fb27f'], ['persiana', 'Persiana cerrada', '#2e9e6a'],
  ['puerta', 'Puerta', '#e2a33e'], ['porton', 'Portón de garaje', '#d07a3a'], ['balcon', 'Balcón', '#c77dff'],
];
export function hueco(tipo, w, h, color) {
  const pz = (nombre, g) => ({ nombre, material: { kind: 'color', doble: tipo == 'persiana' || tipo == 'ventanaPersianas' }, uvAuto: false, g: completar(g), fachada: { estilo: -1, semilla: 0, auto: false } });
  w = Math.max(.3, w); h = Math.max(.3, h);
  if (tipo == 'ventana') return [pz('Ventana', ventana(w, h))];
  if (tipo == 'persiana') return [pz('Persiana', persiana(w, h, color || '#2e6355'))];
  if (tipo == 'ventanaPersianas') {
    const c = color || '#2e6355', hoja = w / 2;
    return [pz('Ventana', ventana(w, h)), pz('Persianas', unir([persiana(hoja, h, c).translate(-w / 2 - hoja / 2 - .02, 0, .04), persiana(hoja, h, c).translate(w / 2 + hoja / 2 + .02, 0, .04)]))];
  }
  if (tipo == 'puerta') return [pz('Puerta', puerta(w, h, color || '#5a3d2b'))];
  if (tipo == 'porton') return [pz('Portón', puerta(w, h, color || '#e8e6df'))];
  if (tipo == 'balcon') return [pz('Balcón', unir([conColor(caja(w, .15, .9, 0, 0, .45), '#ece9e2'), conColor(barandilla(w, Math.min(1.1, Math.max(.8, h))).translate(0, .15, .88), '#2b2b2b')]))];
  return [];
}

// Árboles a medida («Árbol u objeto desde foto»): alto total H, ancho de copa C (m), colores de copa y tronco.
export const ESPECIES = [['generico', 'Árbol (genérico)'], ['pino', 'Pino'], ['olivo', 'Olivo / acebuche'], ['palmera', 'Palmera'], ['cipres', 'Ciprés']];
export function arbol(especie, H = 5, C = 4, copa = '#4f7a3a', tronco = '#6b5038') {
  H = Math.max(.8, H); C = Math.max(.4, C);
  const L = [], esfera = (r, x, y, z, sy = 1, det = 1) => new THREE.IcosahedronGeometry(r, det).scale(1, sy, 1).translate(x, y, z);
  if (especie == 'palmera') {
    const ht = H * .85; L.push([new THREE.CylinderGeometry(H * .018 + .08, H * .025 + .12, ht, 8, 4).translate(0, ht / 2, 0), tronco]);
    for (let i = 0; i < 12; i++) {   // hojas: láminas inclinadas que cuelgan
      const a = i / 12 * Math.PI * 2, len = C / 2;
      const g = new THREE.PlaneGeometry(len, len * .22).translate(len / 2, 0, 0).rotateZ(-.35 - (i % 2) * .3).rotateY(a).translate(0, ht, 0);
      L.push([g, copa]);
    }
    L.push([esfera(.35 + H * .02, 0, ht, 0, 1.2, 0), copa]);
  } else if (especie == 'cipres') {
    const ht = H * .12; L.push([new THREE.CylinderGeometry(.06 + H * .008, .09 + H * .01, ht + .2, 6).translate(0, (ht + .2) / 2, 0), tronco]);
    L.push([esfera(C / 2, 0, ht + (H - ht) / 2, 0, (H - ht) / C, 1), copa]);
  } else if (especie == 'pino') {   // pino piñonero: tronco alto y copa ancha y aplanada
    const ht = H * .62; L.push([new THREE.CylinderGeometry(.1 + H * .012, .14 + H * .018, ht + .3, 8).translate(0, (ht + .3) / 2, 0), tronco]);
    const hc = Math.max(.6, H - ht); L.push([esfera(C / 2, 0, ht + hc / 2, 0, hc / C, 2), copa]);
    L.push([esfera(C * .3, C * .18, ht + hc * .55, C * .1, hc / (C * .6), 1), copa]);
  } else if (especie == 'olivo') {   // tronco corto y retorcido, copa irregular
    const ht = H * .32; L.push([new THREE.CylinderGeometry(.12 + H * .02, .22 + H * .03, ht + .3, 7).rotateZ(.12).translate(.05, (ht + .3) / 2, 0), tronco]);
    const hc = H - ht, r = C / 2;
    L.push([esfera(r * .75, 0, ht + hc * .5, 0, hc / C * 1.2, 1), copa], [esfera(r * .55, r * .45, ht + hc * .42, r * .2, 1, 1), copa],
      [esfera(r * .55, -r * .45, ht + hc * .48, -r * .15, 1, 1), copa], [esfera(r * .45, 0, ht + hc * .7, r * .3, 1, 1), copa]);
  } else {
    const ht = H * .4; L.push([new THREE.CylinderGeometry(.08 + H * .012, .12 + H * .016, ht + .3, 8).translate(0, (ht + .3) / 2, 0), tronco]);
    const hc = H - ht; L.push([esfera(C / 2, 0, ht + hc / 2, 0, hc / C, 1), copa]);
  }
  return varias(L);
}
// Objeto «de torno» (jarrón, pedestal, columna, fuente…): perfil [[radio, altura], …] en metros, de abajo arriba
export function torno(perfil, color = '#ece9e2') {
  const P = perfil.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  if (P[0].x > 0) P.unshift(new THREE.Vector2(0, P[0].y));
  if (P[P.length - 1].x > 0) P.push(new THREE.Vector2(0, P[P.length - 1].y));
  return conColor(new THREE.LatheGeometry(P, 28), color);
}
// Silueta con grosor: puntos [[x, y], …] en metros (y hacia arriba), extruida de z = 0 a z = grosor
export function silueta(puntos, grosor = .25, color = '#ece9e2') {
  const s = new THREE.Shape(puntos.map(([x, y]) => new THREE.Vector2(x, y)));
  return conColor(new THREE.ExtrudeGeometry(s, { depth: grosor, bevelEnabled: false, curveSegments: 4 }), color);
}
export { conColor, caja, unir as unirGeo };
