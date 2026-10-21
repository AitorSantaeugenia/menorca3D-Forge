# Menorca3D Forge

Editor para retocar a mano, una a una, las casas de Menorca3D y devolverlas al modelo de la isla (`menorca3d_v2`).

> [!IMPORTANT]
> Forge va ligado a **Menorca3D**, el modelo 3D de la isla: repositorio **[AitorSantaeugenia/menorca3D](https://github.com/AitorSantaeugenia/menorca3D)** · [ver Menorca3D online](https://aitorsantaeugenia.github.io/menorca3D/cesium/)
> - **Probar Forge online** (pide código de acceso): https://aitorsantaeugenia.github.io/menorca3D-Forge/app/
> - **Descargar para Windows:** [MenorcaForge.zip](https://github.com/AitorSantaeugenia/menorca3D-Forge/releases/latest/download/MenorcaForge.zip) (todas las versiones en [Releases](https://github.com/AitorSantaeugenia/menorca3D-Forge/releases))

Buscas una casa por **número de edificio** (el del mapa de edificios del visor) o por **referencia catastral**. Forge la genera con el mismo código de v0.7 que usa el visor, la muestra en 3D con su terreno, la ortofoto y las casas vecinas, y te deja modificarla. Al pulsar **«Enviar a Menorca3D»**, esa casa sustituye a la generada en los modelos del visor Cesium.

## Tres formas de usarlo
| | **Modo completo** (quien lleva Menorca3D) | **Modo colaborador** (`MenorcaForge.exe`) | **Versión web** (GitHub Pages) |
|---|---|---|---|
| Qué necesita | Esta carpeta junto a `menorca3d_v2` y Node.js | Nada: descomprimir `MenorcaForge.zip` y doble clic en el .exe | Un navegador y el código de acceso |
| Datos | Los de `menorca3d_v2`, sin copiarlos | Una copia de solo lectura dentro de `recursos/` (unos 17 MB) | Una copia publicada junto a la web (unos 17 MB, se descargan al entrar) |
| Dónde guarda | `menorca3d_v2\casas\<REF>.forge.json` | `mis_casas\` junto al .exe | En ese navegador (IndexedDB). Si se borran los datos del navegador, se pierden |
| Botón principal | **Enviar a Menorca3D**: regenera los modelos del visor | **Enviar propuesta**: guarda y descarga `propuesta_n<nº>_<REF>_<fecha>.forge.json` para enviarlo | **Enviar propuesta**, igual que el .exe |
| Propuestas | «⋯ → Importar propuesta», o arrastrar el archivo a la ventana | — | — |

Forge detecta el modo solo: si encuentra `menorca3d_v2` con su `pipeline/`, usa el modo completo; si no hay servidor (la web publicada), usa la versión web.

### Arrancar en modo completo
1. Doble clic en **`iniciar.bat`**.
   - La primera vez instala three.js, con internet una sola vez, y lo enlaza en `menorca3d_v2\v0.7` para el exportador.
   - Después abre el navegador en http://localhost:5180.
2. Necesita **Node.js** (LTS) y que esta carpeta esté junto a `menorca3d_v2`.

   Si `menorca3d_v2` está en otra ruta: `node servidor.cjs --v2 "D:\ruta\menorca3d_v2"`.

Las casas guardadas antes en `menorca3d_v2_forge\casas` se copian solas a `menorca3d_v2\casas` al arrancar. Los originales se quedan donde estaban.

### Crear el .exe para un colaborador
Desde esta carpeta, con Node 20 o superior, `menorca3d_v2` al lado e internet la primera vez (para `postject`):
```
npm install
node empaquetar/empaquetar.mjs
```
Resultado:
- `dist\MenorcaForge\`, con `MenorcaForge.exe`, `recursos\` y `LEEME.txt`;
- `dist\MenorcaForge.zip`, para enviarlo (unos 45 MB comprimido, con el .exe).

Opciones: `--sin-exe` deja solo la carpeta (se arranca con `node servidor.cjs`), y `--sin-zip` no crea el zip.

También lo puede crear GitHub: el *workflow* `.github/workflows/construir-exe.yml` lo genera en un servidor Windows y deja el zip para descargar en la pestaña «Actions» (y, al crear una versión con etiqueta `v…`, adjunto a la versión). Para que funcione, define la variable `REPO_V2` del repositorio con el repositorio de menorca3d_v2 (por ejemplo `usuario/menorca3d_v2`).

**El primer arranque en Windows:** el .exe no va firmado, así que Windows muestra «Windows protegió su PC». Hay que pulsar «Más información → Ejecutar de todas formas».

### Versión web (GitHub Pages, con código de acceso)
La misma app, publicada como página estática: no hay servidor, así que las casas se guardan en el navegador de cada colaborador y se envían como propuesta con el formulario.

**Publicarla (una vez):**
1. Mueve `flujos_github/publicar-web.yml` a `.github/workflows/` y súbelo.
2. En el repositorio de Forge, **Settings → Pages → Source: «GitHub Actions»**.
3. En **Settings → Secrets and variables → Actions**:
   - Variables: `REPO_V2` (por ejemplo `usuario/menorca3d_v2`) y `FORMULARIO_URL` (el enlace rellenado previamente). Son las mismas que usa el .exe.
   - Secrets: **`FORGE_CODIGO`**, el código que darás a los colaboradores.
4. Se publica sola en cada push a `main`, o a mano: **Actions → «Publicar web» → Run workflow**. Queda en `https://<usuario>.github.io/<repositorio>/`.

**Si entra sin pedir código:** la web se publicó sin el secret. Comprueba que `FORGE_CODIGO` está en la pestaña **Secrets** (no en Variables) y vuelve a lanzar «Publicar web». Desde ahora, si falta, «Publicar web» se para con un aviso en vez de publicar sin código.

**Para cambiar el código:** cambia el secret `FORGE_CODIGO` y vuelve a lanzar «Publicar web». Quien ya había entrado tendrá que escribir el nuevo.

**Sobre el código de acceso:** la web pública solo guarda el SHA-256 del código (`config.json`), nunca el código. Frena a quien llegue por casualidad, pero **no es seguridad real**: los archivos de la web se pueden descargar sin el código. No hay nada privado en ellos (son los mismos datos públicos que el visor) y lo único que se puede hacer es enviar propuestas, que revisas tú.

**Probarla en tu PC:** `node empaquetar/empaquetar.mjs --web --codigo prueba` crea `dist\web\`. Sírvela con cualquier servidor estático (por ejemplo `npx serve dist/web`); abierta con doble clic no funciona, porque el navegador bloquea los módulos en `file://`.

### Propuestas (colaborar sin GitHub)
1. **El colaborador** edita la casa y pulsa **Enviar propuesta**. Escribe su nombre y qué ha cambiado, y se descarga el archivo `propuesta_….forge.json`.
2. **El colaborador** pulsa «Abrir el formulario de envío»: el formulario sale ya relleno con su nombre, el edificio, el comentario y el nombre del archivo, y solo tiene que adjuntarlo y enviar (ver «Formulario de envío»).
3. **Tú** abres Forge en modo completo y usas «⋯ → Importar propuesta», o arrastras el archivo a la ventana.
   - Forge detecta el edificio por su referencia catastral, lo abre y muestra una barra para elegir:
     - **Ver actual** / **Ver propuesta**, para comparar;
     - **Aceptar y guardar**: la propuesta pasa a ser la versión de la casa, y la anterior queda en el historial;
     - **Descartar**: no se cambia nada.
   - Después, «Enviar a Menorca3D» la publica.

### Formulario de envío (Google Forms)
Las propuestas llegan por un formulario de Google con subida de archivo. Queda registrado quién envía y cuándo, y los archivos se guardan en tu Google Drive. Quien envía necesita iniciar sesión con una cuenta de Google, porque Google lo exige para subir archivos.

**Crear el formulario (una vez, en forms.google.com):**
1. Formulario nuevo, por ejemplo «Menorca3D · Propuestas de casas», con estas preguntas, con estos nombres y en este orden:

   | Pregunta | Tipo | Obligatoria |
   |---|---|---|
   | Tu nombre | Respuesta corta | Sí |
   | Nº de edificio | Respuesta corta | Sí |
   | Referencia catastral | Respuesta corta | Sí |
   | Qué has cambiado | Párrafo | No |
   | Nombre del archivo | Respuesta corta | No |
   | Archivo de la propuesta | Subir archivos: 1 archivo, tamaño máximo 10 MB, **sin** «Permitir solo tipos específicos» (el `.json` no está en ninguna categoría) | Sí |
2. En «Configuración → Respuestas», activa «Recopilar direcciones de correo electrónico» y elige «Verificadas». Así queda el correo de quien envía.
3. Crea el enlace rellenado previamente: «⋮ → Obtener enlace rellenado previamente». Escribe literalmente `AUTOR`, `NUMERO`, `REF`, `COMENTARIO` y `ARCHIVO` en las cinco primeras preguntas, pulsa «Obtener enlace» y cópialo.
4. Copia `forge.config.ejemplo.json` como **`forge.config.json`** y pega ese enlace en `"formulario"`.

**Cómo llega a cada sitio:**
- **Al .exe:** `empaquetar.mjs` incluye `forge.config.json` en `dist\MenorcaForge\`. También acepta `--formulario "<enlace>"`. En GitHub Actions, se pone en la variable `FORMULARIO_URL`.
- **A tu Forge (modo completo):** no hace falta configurarlo, porque tú importas las propuestas y no las envías.
- **Al repositorio:** `forge.config.json` no se sube (`.gitignore`), para que el enlace del formulario no quede público.

**Al recibir una propuesta:** te llega a «Respuestas» y el archivo queda en una carpeta de tu Drive, la que crea Forms. Descárgalo e impórtalo en Forge, o arrástralo a la ventana. Si usas Google Drive para escritorio, esa carpeta aparece directamente en tu PC.

## Cómo se trabaja
| Acción | Cómo |
|---|---|
| Abrir una casa | Escribe `1061`, `0748109FE1104N` o los 7 primeros caracteres de la referencia; o haz clic en el mapa de la pantalla de inicio |
| Elegir piezas | Clic (con **Mayús**, varias), o desde la lista: está agrupada por categorías (paredes, cubiertas, vallas, detalles, añadidas), tiene buscador y botones para elegir u ocultar una categoría entera. Cada pared, faldón y azotea de v0.7 es una pieza; los detalles que se tocan y comparten material (una valla, una verja) forman un solo objeto. «Separar» los divide y «Unir» los junta |
| Cámara | Ratón (arrastrar, rueda, botón derecho) o teclado: **flechas** para moverse, **Q**/**E** para girar, **Re Pág**/**Av Pág** para subir o bajar, **+**/**−** para el zoom y **Mayús** para ir más rápido |
| Mover, girar y escalar | Gizmo y teclas **W**, **R** y **S**. **Ajuste**: pasos de 10 cm, 15° y 5 %. Valores exactos en el panel derecho |
| Vértices | Doble clic o **V**. Clic para elegir un punto, **Mayús**+clic para añadir más y flechas para moverlos. Sirve para subir un alero, estirar una pared o hacer un hastial |
| Nivelar | En vértices: «Igualar a la más alta / baja / media» o «Fijar Y» |
| Materiales | Selector con miniaturas y paleta de colores medidos en Es Castell. Fachada de v0.7, con ventanas, persianas, zócalos y cornisas dibujados por el shader y 6 estilos; texturas de v0.7 (teja, terraza, piedra seca, marés, aplacado…); o color liso, con luz propia opcional |
| Vallas | Valla de pared seca con malla verde (como la del nº 1061), malla con postes, verja metálica, puerta de jardín, tapia con albardilla y seto. Junto a una pared, se colocan paralelas a ella |
| Añadir | Haz clic en la superficie y pulsa un botón de «Añadir». Las ventanas, puertas, persianas, balcones y toldos se pegan a la pared mirando hacia fuera |
| Deshacer | **Ctrl+Z** / **Ctrl+Y** (80 pasos) |
| Guardar | **Ctrl+S** → `<REF>.forge.json` en la carpeta de casas del modo. Las 30 versiones anteriores quedan en `historial\` |
| Enviar a Menorca3D | Guarda y regenera los modelos de su zona en `menorca3d_v2\cesium\models` |
| Blender | «⋯ → Exportar GLB». Al volver con «Importar GLB», se coloca solo en su sitio |

Las paredes con material «Fachada de v0.7» **recalculan sus huecos** al cambiar de tamaño: una pared más larga tiene más vanos, y las plantas se siguen contando desde el arranque del muro.

## Tecnologías
- **Three.js 0.169**, la misma versión que v0.7, sin bundler. El navegador carga los módulos ES con un *import map*.
- **El código de v0.7 se usa tal cual, sin copiarlo.** El servidor sirve `menorca3d_v2/v0.7/src`, así que `createBuildings`, el shader de fachadas y las texturas son exactamente los del visor. Si mejoras v0.7, Forge lo ve al momento.
- **Servidor en Node sin dependencias** (`servidor.cjs`, en CommonJS para poder empaquetarlo). Sirve el editor y los datos (solo lectura), guarda las casas y, en modo completo, lanza el exportador de v2.
- **El .exe** es una *Single Executable Application* de Node: el propio `node.exe` con `servidor.cjs` dentro, creado con `postject`. No usa Electron, así que abre el editor en el navegador.
- **Ortofoto PNOA** del IGN (WMS, CC BY 4.0), pedida para el recuadro de la casa. La proyección local de v0.7 es lineal en lon/lat, así que la ortofoto encaja sin reproyectar.

## Cómo llega la casa a Menorca3D
`menorca3d_v2/pipeline/exportar_glb.mjs` tiene un bloque nuevo, «Menorca3D Forge»:
1. Lee `menorca3d_v2/casas/*.forge.json`. Si esa carpeta no existe, lee `../menorca3d_v2_forge/casas`, donde se guardaban antes.
2. Para cada referencia editada, **no genera** la parcela de v0.7.
3. En su lugar, añade la geometría guardada con los mismos materiales, de modo que el `kindOf` del exportador la reconoce como fachada, textura o color.
4. Todo acaba en los mismos bloques de 300 m (`zona_*.glb` o `municipio_*.glb`), con la misma cuantización y el mismo shader en Cesium.

Más detalles:
- **El detalle de calle** (aceras, árboles, etc.) sigue esquivando la huella del Catastro de las casas editadas.
- **Opciones del exportador:** `--sin-forge` exporta como antes, sin las casas editadas; `--forge <carpeta>` usa otra carpeta.
- **«Enviar a Menorca3D»** ejecuta `node pipeline/exportar_glb.mjs --zona --sin-calle` o, para el resto del municipio, `--zonefile data/extension/zona_municipio.json --name municipio --sin-calle`. No regenera el detalle de calle, que es lo más lento. Si cambias mucho la planta de una casa, regenera también la calle con la orden completa del README de v2.

## Formato `.forge.json`
Un JSON por casa con estos campos:
- **Cabecera:** `formato: "menorca3d-forge"`, `version`, `ref`, `n`, `zona` (`zona` o `municipio`) y `origin` (lon/lat del origen de v0.7).
- **`objetos`:** cada pieza lleva
  - `nombre` y `material` (`kind`: `fachada`, el nombre de una textura de v0.7 o `color`; `doble`; `emissive`);
  - `fachada` (`estilo`, `semilla` y `base`);
  - `transform` (`p`, `q`, `s`);
  - `geo`, con los arrays `position`, `normal`, `uv` (en metros), `color`, `aWall` y `aFac`.

Marco: plano local de v0.7, en metros (x = este, y = altura ortométrica, z = sur).

## Limitaciones
- **Texturas de un GLB importado:** se cambian por su color, porque el visor solo conoce las texturas de v0.7. Después puedes ponerles cualquiera de las de v0.7.
- **Carrer Fontanilles:** un mismo generador de v0.7 dibuja los detalles de las casas nº 35, 59 y 84 (galerías, franjas, farmacia). Si editas una, edita también las otras dos, porque el generador sigue dibujando esos detalles mientras alguna quede sin editar.
- **Luces de noche:** las luces especiales (focos del campo de fútbol, cruces de farmacia) salen de los generadores. En una casa editada se pierden; usa «Luz propia» en la pieza.
- **Ortofoto:** necesita internet. Sin conexión, el terreno se ve liso.

## Privacidad y licencia
- **Sin datos privados:** no hay claves, tokens ni datos personales en el código (revisado el 21-10-2026). El nombre que escribe el colaborador al enviar una propuesta solo va dentro del archivo de propuesta.
- **Licencia:** el código es MIT (`LICENSE`). three.js es MIT. Los datos que lleva el .exe son de Catastro, IGN, IDE Menorca y OpenStreetMap, con sus atribuciones en `menorca3d_v2/ATRIBUCIONES.md`, que se incluye en `recursos/`.
- **Qué no se sube al repositorio** (`.gitignore`): `node_modules/`, `dist/`, `casas/` (las casas van al repositorio de menorca3d_v2), `mis_casas/`, `integracion/` y `forge.config.json`.
- **Datos del colaborador:** su nombre y su correo (verificado por Google) llegan a tus respuestas del formulario. No se publican en ningún repositorio; en la casa aceptada solo queda la nota «Propuesta de <nombre>». Si prefieres que no quede ni eso, bórrala de las notas antes de guardar.

## Archivos
| Archivo | Qué es |
|---|---|
| `iniciar.bat` | Arranque con doble clic (modo completo) |
| `forge.config.ejemplo.json` | Plantilla de `forge.config.json`, con el enlace del formulario de envío |
| `servidor.cjs` | Servidor local y API: `/api/casas`, `/api/publicar` y `/api/estado` (modo) |
| `servidor.mjs` | Se mantiene por compatibilidad; carga `servidor.cjs` |
| `empaquetar/empaquetar.mjs` | Crea `MenorcaForge.exe` y el zip para colaboradores; con `--web`, la versión web en `dist\web\` |
| `.github/workflows/construir-exe.yml` | Crea el zip del .exe en GitHub Actions |
| `flujos_github/publicar-web.yml` | Publica la versión web en GitHub Pages. **Muévelo a `.github/workflows/` antes de subir** |
| `app/api.js` | Guardar y leer casas: con el servidor (`/api/…`) o, en la versión web, en el navegador (IndexedDB) |
| `app/datos.js` | Zonas de v0.7, parcelas, números de edificio (como `cesium/js/maps.js`) y búsqueda |
| `app/casa.js` | Generar con v0.7 → piezas editables, huecos de fachada, UV, agrupar y separar, y formato `.forge.json` |
| `app/editor.js` | Vista 3D, selección, gizmo, vértices, cámara con teclado, deshacer y contexto (terreno, ortofoto, vecinos) |
| `app/primitivas.js` | Catálogo de piezas nuevas, incluidas las vallas |
| `app/main.js` | Interfaz, propuestas e importación y exportación |
