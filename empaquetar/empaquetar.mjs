// Crea la versión portátil de Menorca3D Forge para colaboradores: una carpeta con MenorcaForge.exe y «recursos»
// (editor, three.js y SOLO los datos de menorca3d_v2 que hacen falta para editar, ~15 MB). Opcionalmente, un .zip.
//
// Uso (desde la carpeta de Forge, con Node 20 o superior y menorca3d_v2 al lado):
//   node empaquetar/empaquetar.mjs [--v2 ../menorca3d_v2] [--salida dist] [--sin-exe] [--sin-zip]
//
// El .exe es un «Single Executable Application» de Node: el propio node.exe con servidor.cjs dentro. Para inyectarlo
// se usa postject (npx lo descarga la primera vez: necesita internet). Windows avisará con SmartScreen porque no va
// firmado: «Más información → Ejecutar de todas formas».
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FORGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const has = k => process.argv.includes('--' + k);
const V2 = path.resolve(FORGE, arg('v2') || '../menorca3d_v2');
const OUT = path.resolve(FORGE, arg('salida') || 'dist');
const DIR = path.join(OUT, 'MenorcaForge'), REC = path.join(DIR, 'recursos');
const WIN = process.platform == 'win32', EXE = path.join(DIR, WIN ? 'MenorcaForge.exe' : 'MenorcaForge');
const log = m => console.log('  ' + m);
const fail = m => { console.error('\n  ✖ ' + m + '\n'); process.exit(1); };

if (!fs.existsSync(path.join(V2, 'v0.7/src/buildings/buildings.js'))) fail(`No encuentro menorca3d_v2 en ${V2} (usa --v2 ruta)`);
const THREE = [path.join(FORGE, 'node_modules/three'), path.join(V2, 'v0.7/node_modules/three')].find(d => fs.existsSync(path.join(d, 'build/three.module.js')));
if (!THREE) fail('Falta three.js: ejecuta  npm install  en la carpeta de Forge.');

const copy = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.cpSync(src, dst, { recursive: true }); };
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(REC, { recursive: true });
console.log(`\n  Empaquetando Menorca3D Forge → ${DIR}\n`);

// 1) Editor y servidor
copy(path.join(FORGE, 'app'), path.join(REC, 'app'));
copy(path.join(FORGE, 'servidor.cjs'), path.join(DIR, 'servidor.cjs'));
for (const f of ['LICENSE', 'README.md']) if (fs.existsSync(path.join(FORGE, f))) copy(path.join(FORGE, f), path.join(REC, f));
// Formulario de Google para enviar propuestas: forge.config.json o --formulario <enlace rellenado previamente>
const formulario = arg('formulario') || process.env.FORGE_FORMULARIO;
if (formulario) fs.writeFileSync(path.join(DIR, 'forge.config.json'), JSON.stringify({ formulario }, null, 2));
else if (fs.existsSync(path.join(FORGE, 'forge.config.json'))) copy(path.join(FORGE, 'forge.config.json'), path.join(DIR, 'forge.config.json'));
log(fs.existsSync(path.join(DIR, 'forge.config.json')) ? 'formulario de envío: configurado' : 'AVISO: sin formulario de envío (forge.config.json); la propuesta solo se descarga');

// 2) three.js: el módulo principal y solo los complementos que usa el editor (con sus dependencias relativas)
copy(path.join(THREE, 'build/three.module.js'), path.join(REC, 'three/build/three.module.js'));
for (const f of ['LICENSE', 'package.json']) copy(path.join(THREE, f), path.join(REC, 'three', f));
const pend = ['controls/OrbitControls.js', 'controls/TransformControls.js', 'exporters/GLTFExporter.js', 'loaders/GLTFLoader.js'], hechos = new Set();
while (pend.length) {
  const rel = pend.pop(); if (hechos.has(rel)) continue; hechos.add(rel);
  const src = path.join(THREE, 'examples/jsm', rel); copy(src, path.join(REC, 'three/examples/jsm', rel));
  for (const m of fs.readFileSync(src, 'utf8').matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g))
    pend.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
}
log(`three.js: módulo principal + ${hechos.size} complementos`);

// 3) Datos de menorca3d_v2 (solo lectura; sin pipeline, modelos, fotos ni datos en bruto)
const V2OUT = path.join(REC, 'menorca3d_v2'), SA = 'v0.7/public/data/menorca/es-castell/santa-anna';
const DATOS = ['v0.7/src', 'v0.7/public/assets/textures', `${SA}/zone.json`, `${SA}/edificios.json`, `${SA}/ajustes_edificios.json`,
  'data/extension/zona_municipio.json', 'cesium/data/es-castell.js', 'LICENSE', 'ATRIBUCIONES.md'];
for (const d of DATOS) { const src = path.join(V2, d); if (fs.existsSync(src)) copy(src, path.join(V2OUT, d)); else if (!/LICENSE|ATRIBUCIONES/.test(d)) fail('Falta ' + src); }
log('datos de menorca3d_v2 copiados');

// 4) Instrucciones para el colaborador
fs.writeFileSync(path.join(DIR, 'LEEME.txt'), [
  'MENORCA3D FORGE · versión para colaboradores', '',
  '1. Doble clic en MenorcaForge.exe. Se abre una ventana negra (déjala abierta) y el navegador con el editor.',
  '   Si Windows avisa («Windows protegió su PC»): Más información → Ejecutar de todas formas.',
  '2. Busca la casa por número de edificio o referencia catastral y modifícala.',
  '3. Pulsa «Enviar propuesta»: se guarda en la carpeta mis_casas y se descarga un archivo',
  '   propuesta_n<número>_<referencia>_<fecha>.forge.json. Después pulsa «Abrir el formulario de envío»,',
  '   adjunta ese archivo y envía (hace falta iniciar sesión con una cuenta de Google).',
  '4. Para cerrar Forge, cierra la ventana negra.', '',
  'Datos: Catastro, IGN, IDE Menorca (CC BY 4.0) y OpenStreetMap (ODbL). Ver recursos/menorca3d_v2/ATRIBUCIONES.md.',
  'Reconstrucción aproximada con fines divulgativos; no tiene validez oficial.', ''].join('\r\n'));

// 5) Ejecutable (Node SEA)
if (!has('sin-exe')) {
  const tmp = path.join(OUT, '.sea'); fs.mkdirSync(tmp, { recursive: true });
  const cfg = path.join(tmp, 'sea-config.json'), blob = path.join(tmp, 'sea-prep.blob');
  fs.writeFileSync(cfg, JSON.stringify({ main: path.join(FORGE, 'servidor.cjs'), output: blob, disableExperimentalSEAWarning: true, useCodeCache: false }));
  execFileSync(process.execPath, ['--experimental-sea-config', cfg], { stdio: 'inherit' });
  fs.copyFileSync(process.execPath, EXE);
  const npx = WIN ? 'npx.cmd' : 'npx';
  const pj = [EXE, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', ...(process.platform == 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : [])];
  try { execFileSync(npx, ['--yes', 'postject', ...pj], { stdio: 'inherit', shell: WIN }); }
  catch { fail('No se pudo crear el .exe con postject (¿sin internet?). La carpeta funciona igual con: node servidor.cjs'); }
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`ejecutable: ${path.basename(EXE)} (${(fs.statSync(EXE).size / 1e6).toFixed(0)} MB)`);
}

// 6) Zip para enviar
if (!has('sin-zip')) {
  const zip = path.join(OUT, 'MenorcaForge.zip'); fs.rmSync(zip, { force: true });
  try {
    if (WIN) execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path "${DIR}" -DestinationPath "${zip}"`], { stdio: 'inherit' });
    else execFileSync('zip', ['-qr', zip, 'MenorcaForge'], { cwd: OUT, stdio: 'inherit' });
    log(`zip: ${zip} (${(fs.statSync(zip).size / 1e6).toFixed(0)} MB)`);
  } catch { log('no se pudo crear el zip; comprime la carpeta a mano'); }
}
const peso = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? peso(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`\n  ✔ Listo: ${DIR} (${(peso(DIR) / 1e6).toFixed(0)} MB)\n`);
