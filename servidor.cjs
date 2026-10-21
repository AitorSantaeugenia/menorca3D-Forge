// Menorca3D Forge · servidor local (Node, sin dependencias; CommonJS para poder empaquetarlo como .exe)
//
// Dos modos, según lo que encuentre:
//  · COMPLETO (tu equipo): menorca3d_v2 está al lado (o se indica con --v2). Usa su código y datos sin copiarlos,
//    guarda las casas en menorca3d_v2/casas y «Enviar a Menorca3D» lanza su exportador.
//  · COLABORADOR (MenorcaForge.exe): los datos van en la carpeta «recursos» junto al .exe. Las casas se guardan en
//    «mis_casas» y se envían como propuesta; no se exporta nada.
//
// Uso:  node servidor.cjs [--v2 ruta\a\menorca3d_v2] [--puerto 5180] [--casas carpeta] [--sin-navegador]
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, exec } = require('node:child_process');

let isSea = false; try { isSea = require('node:sea').isSea(); } catch { /* Node sin SEA */ }
const BASE = isSea ? path.dirname(process.execPath) : __dirname;
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const has = k => process.argv.includes('--' + k);
const existe = (...p) => fs.existsSync(path.join(...p));
const fail = msg => { console.error('\n  ✖ ' + msg + '\n'); if (isSea) { console.error('  Pulsa Ctrl+C para cerrar.'); setInterval(() => {}, 1e9); } else process.exit(1); };

// ---------- Rutas ----------
const APP = [path.join(BASE, 'app'), path.join(BASE, 'recursos', 'app')].find(d => existe(d, 'index.html'));
const V2 = [arg('v2'), process.env.MENORCA3D_V2, path.join(BASE, '..', 'menorca3d_v2'), path.join(BASE, 'recursos', 'menorca3d_v2')]
  .filter(Boolean).map(p => path.resolve(p)).find(p => existe(p, 'v0.7/src/buildings/buildings.js'));
if (!APP) fail('No encuentro la carpeta app/ del editor.');
if (!V2) fail(`No encuentro los datos de menorca3d_v2.\n    Ponlo junto a esta carpeta o indícalo con: --v2 "C:\\ruta\\a\\menorca3d_v2"`);
const V07 = path.join(V2, 'v0.7');
const COMPLETO = existe(V2, 'pipeline/exportar_glb.mjs');
const THREE_DIR = [path.join(BASE, 'node_modules/three'), path.join(BASE, 'recursos/three'), path.join(V07, 'node_modules/three')]
  .find(d => existe(d, 'build/three.module.js'));
if (!THREE_DIR) fail('Falta three.js: ejecuta  npm install  en esta carpeta (necesita internet una vez).');
const PORT = +(arg('puerto') || process.env.PORT || 5180);
// Casas: en modo completo, dentro de menorca3d_v2 (van a su repositorio y las lee el exportador); si no, «mis_casas»
const CASAS = path.resolve(arg('casas') || (COMPLETO ? path.join(V2, 'casas') : path.join(BASE, 'mis_casas')));
const HIST = path.join(CASAS, 'historial');
fs.mkdirSync(HIST, { recursive: true });

// Las casas que se guardaban antes en menorca3d_v2_forge/casas pasan a menorca3d_v2/casas (se copian; el original queda)
function migrarCasasAntiguas() {
  const viejo = path.join(BASE, 'casas'); if (!COMPLETO || path.resolve(viejo) == CASAS || !fs.existsSync(viejo)) return [];
  const hechas = [];
  for (const f of fs.readdirSync(viejo)) if (f.endsWith('.forge.json') && !fs.existsSync(path.join(CASAS, f))) { fs.copyFileSync(path.join(viejo, f), path.join(CASAS, f)); hechas.push(f); }
  const hv = path.join(viejo, 'historial');
  if (fs.existsSync(hv)) for (const ref of fs.readdirSync(hv)) {
    const src = path.join(hv, ref), dst = path.join(HIST, ref); if (!fs.statSync(src).isDirectory()) continue;
    fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) if (!fs.existsSync(path.join(dst, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
  return hechas;
}

// Datos de solo lectura
const DATOS = {
  'zona.json': path.join(V07, 'public/data/menorca/es-castell/santa-anna/zone.json'),
  'municipio.json': path.join(V2, 'data/extension/zona_municipio.json'),
  'edificios.json': path.join(V07, 'public/data/menorca/es-castell/santa-anna/edificios.json'),
  'ajustes.json': path.join(V07, 'public/data/menorca/es-castell/santa-anna/ajustes_edificios.json'),
  'es-castell.js': path.join(V2, 'cesium/data/es-castell.js'),
};
const ESTATICOS = [['/app/', APP], ['/three/', THREE_DIR], ['/v07/', path.join(V07, 'src')], ['/assets/', path.join(V07, 'public/assets')]];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const REF_OK = /^[0-9A-Z]{7,20}$/;

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-cache' });
  res.end(typeof body == 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const sendFile = (res, file) => fs.stat(file, (err, st) => {
  if (err || !st.isFile()) return send(res, 404, { error: 'no existe' });
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
const inside = (base, rel) => { const p = path.resolve(base, '.' + path.sep + rel); return p.startsWith(path.resolve(base) + path.sep) ? p : null; };
const readBody = (req, max = 200e6) => new Promise((ok, ko) => {
  const parts = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > max) { ko(new Error('demasiado grande')); req.destroy(); } else parts.push(c); });
  req.on('end', () => ok(Buffer.concat(parts))); req.on('error', ko);
});
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---------- Configuración (forge.config.json): enlace del formulario de Google para enviar propuestas ----------
// Se lee en cada petición: no hace falta reiniciar Forge al cambiarla.
function leerConfig() {
  for (const f of [path.join(BASE, 'forge.config.json'), path.join(BASE, 'recursos', 'forge.config.json')]) {
    try { if (fs.existsSync(f)) return { ...JSON.parse(fs.readFileSync(f, 'utf8')), archivo: f }; } catch (e) { return { error: `forge.config.json no es válido: ${e.message}` }; }
  }
  return {};
}

// ---------- Casas guardadas ----------
const casaFile = ref => path.join(CASAS, ref + '.forge.json');
function listaCasas() {
  return fs.readdirSync(CASAS).filter(f => f.endsWith('.forge.json')).map(f => {
    try {
      const F = JSON.parse(fs.readFileSync(path.join(CASAS, f), 'utf8'));
      return { ref: F.ref, n: F.n ?? null, zona: F.zona, actualizado: F.actualizado, objetos: (F.objetos || []).length, notas: F.notas || '' };
    } catch { return { ref: f.replace('.forge.json', ''), error: 'archivo dañado' }; }
  }).sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
}
function aHistorial(ref, sufijo = '') {
  const src = casaFile(ref); if (!fs.existsSync(src)) return;
  const dir = path.join(HIST, ref); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, stamp() + sufijo + '.forge.json'));
  const old = fs.readdirSync(dir).sort(); while (old.length > 30) fs.unlinkSync(path.join(dir, old.shift()));   // se guardan las 30 últimas
}

// ---------- Enviar a Menorca3D (solo modo completo): exportador de menorca3d_v2 ----------
let pub = { running: false, code: null, log: '', zona: null, inicio: null, fin: null };
// El exportador busca three en menorca3d_v2/v0.7/node_modules. Si three solo está aquí, se enlaza allí
// (enlace de tipo «junction»: en Windows no necesita permisos de administrador). No se copia ni se descarga nada.
function asegurarThreeEnV07() {
  if (!COMPLETO) return null;
  const dst = path.join(V07, 'node_modules', 'three');
  if (fs.existsSync(path.join(dst, 'build/three.module.js'))) return null;
  try {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try { fs.rmSync(dst, { recursive: false, force: true }); } catch { /* enlace roto o inexistente */ }
    fs.symlinkSync(THREE_DIR, dst, 'junction');
    return `three enlazado en ${dst} → ${THREE_DIR}\n`;
  } catch (e) { return `No se pudo enlazar three en v0.7 (${e.message}). Ejecuta  npm install  dentro de menorca3d_v2\\v0.7\n`; }
}
function publicar(zona) {
  const nota = asegurarThreeEnV07();
  const script = path.join(V2, 'pipeline/exportar_glb.mjs');
  const args = zona == 'municipio'
    ? [script, '--zonefile', 'data/extension/zona_municipio.json', '--name', 'municipio', '--sin-calle', '--forge', CASAS]
    : [script, '--zona', '--sin-calle', '--forge', CASAS];
  pub = { running: true, code: null, log: (nota || '') + `> node pipeline/exportar_glb.mjs ${args.slice(1).join(' ')}\n`, zona, inicio: Date.now(), fin: null };
  const p = spawn(isSea ? 'node' : process.execPath, args, { cwd: V2, shell: isSea && process.platform == 'win32' });
  const add = d => { pub.log += d.toString(); if (pub.log.length > 300e3) pub.log = pub.log.slice(-300e3); };
  p.stdout.on('data', add); p.stderr.on('data', add);
  p.on('error', e => { add('\n' + e.message); pub.running = false; pub.code = -1; pub.fin = Date.now(); });
  p.on('close', code => { pub.running = false; pub.code = code; pub.fin = Date.now(); add(`\n[terminado con código ${code}]\n`); });
}

// ---------- Servidor ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
    if (p == '/' || p == '/index.html') { res.writeHead(302, { location: '/app/index.html' }); return res.end(); }
    if (p.startsWith('/datos/')) { const f = DATOS[p.slice(7)]; return f ? sendFile(res, f) : send(res, 404, { error: 'no existe' }); }
    for (const [pre, dir] of ESTATICOS) if (p.startsWith(pre)) {
      if (req.method != 'GET' && req.method != 'HEAD') return send(res, 405, { error: 'solo lectura' });
      const f = inside(dir, p.slice(pre.length)); return f ? sendFile(res, f) : send(res, 403, { error: 'ruta no permitida' });
    }
    if (p == '/api/estado') return send(res, 200, { modo: COMPLETO ? 'completo' : 'colaborador', v2: COMPLETO ? V2 : null, casas: CASAS, publicando: pub.running });
    if (p == '/api/casas' && req.method == 'GET') return send(res, 200, listaCasas());
    const m = p.match(/^\/api\/casas\/([^/]+)$/);
    if (m) {
      const ref = m[1].toUpperCase(); if (!REF_OK.test(ref)) return send(res, 400, { error: 'referencia no válida' });
      if (req.method == 'GET') return sendFile(res, casaFile(ref));
      if (req.method == 'PUT') {
        const F = JSON.parse((await readBody(req)).toString('utf8'));
        if (F.formato != 'menorca3d-forge' || F.ref != ref || !Array.isArray(F.objetos)) return send(res, 400, { error: 'formato no válido' });
        aHistorial(ref);
        fs.writeFileSync(casaFile(ref) + '.tmp', JSON.stringify(F)); fs.renameSync(casaFile(ref) + '.tmp', casaFile(ref));
        return send(res, 200, { ok: true, archivo: casaFile(ref) });
      }
      if (req.method == 'DELETE') {   // no se borra: pasa al historial como «-descartada»
        if (!fs.existsSync(casaFile(ref))) return send(res, 404, { error: 'no existe' });
        aHistorial(ref, '-descartada'); fs.unlinkSync(casaFile(ref)); return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: 'método no permitido' });
    }
    if (p == '/api/config') return send(res, 200, leerConfig());
    if (p == '/api/carpeta' && req.method == 'POST') {   // abre la carpeta de casas en el Explorador de Windows
      if (process.platform == 'win32') exec(`explorer "${CASAS}"`); return send(res, 200, { ok: true, carpeta: CASAS });
    }
    if (p == '/api/publicar') {
      if (!COMPLETO) return send(res, 403, { error: 'En modo colaborador no se exporta: envía la propuesta.' });
      if (req.method == 'GET') return send(res, 200, pub);
      if (req.method == 'POST') {
        if (pub.running) return send(res, 409, { error: 'ya se está exportando' });
        const { zona } = JSON.parse((await readBody(req, 1e4)).toString('utf8') || '{}');
        publicar(zona == 'municipio' ? 'municipio' : 'zona'); return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'no existe' });
  } catch (err) { send(res, 500, { error: err.message }); }
});
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Menorca3D Forge  →  ${url}   (modo ${COMPLETO ? 'completo' : 'colaborador'})\n`);
  if (COMPLETO) console.log(`  menorca3d_v2: ${V2}`);
  console.log(`  casas:        ${CASAS}\n`);
  const mig = migrarCasasAntiguas(); if (mig.length) console.log(`  ${mig.length} casa(s) copiadas de menorca3d_v2_forge\\casas a ${CASAS}\n`);
  const n3 = asegurarThreeEnV07(); if (n3) console.log('  ' + n3);
  console.log('  Deja esta ventana abierta mientras uses Forge. Ctrl + C para cerrar.\n');
  if (isSea && !has('sin-navegador') && process.platform == 'win32') exec(`start "" ${url}`);
});
server.on('error', e => fail(e.code == 'EADDRINUSE' ? `El puerto ${PORT} está ocupado (¿Forge ya está abierto?). Ciérralo o usa --puerto 5181` : e.message));
