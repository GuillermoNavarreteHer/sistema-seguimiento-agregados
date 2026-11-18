#!/usr/bin/env node
/*
  ============================================================================
  CONSTRUIR LA VERSIÓN DE PORTAFOLIO A PARTIR DE LA DE PRODUCCIÓN
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  ----------------------------------------------------------------------------
  Uso:
    node herramientas/construir-portafolio.mjs \
      --produccion <carpeta de producción> --fuente <carpeta del portafolio> \
      --salida <carpeta destino> --usuario <usuario de GitHub>
    node herramientas/construir-portafolio.mjs --revisar <carpeta>   (solo revisa)

  Qué hace:
    1. Copia el código de producción (index.html, css, js, vendor, scripts).
    2. Aplica SOLO los cambios necesarios: quita datos de la empresa de los
       encabezados, activa el modo demo, cambia config.js por config.local.js
       y mueve los workflows a una carpeta de ejemplo que no se ejecuta.
       Si algún cambio no encuentra su texto exacto, FALLA (así sé que la
       producción cambió y hay que revisar).
    3. Agrega los archivos propios del portafolio (README, docs, sql, demo…).
    4. Revisa TODO el resultado y FALLA si aparece:
       • una palabra de herramientas/prohibidos.local.txt (palabra completa,
         sin distinguir mayúsculas). Ese archivo NO se sube: git lo ignora.
       • llaves con forma real (JWT, sb_secret_, tokens de GitHub),
         URLs de proyectos reales de Supabase o correos fuera de la lista
         permitida.
  ============================================================================
*/
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? acc.concat([[v.slice(2), a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true]]) : acc), []));
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const errores = [];
function fallar(msg) { console.error('✖ ' + msg); process.exitCode = 1; }

// ----------------------------------------------------------------------------
// Revisión de seguridad (se usa al construir y con --revisar)
// ----------------------------------------------------------------------------
const CORREOS_PERMITIDOS = ['demo.local', 'ejemplo.com', 'example.com', 'users.noreply.github.com'];
const PATRONES = [
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'llave JWT con forma real'],
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/g, 'llave de Supabase'],
  [/\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, 'token de GitHub'],
  [/https?:\/\/[a-z0-9]{20}\.supabase\.co/g, 'URL de un proyecto real de Supabase'],
  [/postgres(ql)?:\/\/[^\s'"]+:[^\s'"]+@/g, 'cadena de conexión con contraseña']
];
function leerProhibidos(obligatoria) {
  const archivo = args.lista ? path.resolve(args.lista) : path.join(AQUI, 'prohibidos.local.txt');
  if (!fs.existsSync(archivo)) {
    if (obligatoria) fallar('Falta herramientas/prohibidos.local.txt (lista privada de nombres prohibidos). Copia prohibidos.local.EJEMPLO.txt y llénala.');
    else console.warn('⚠ Revisión PARCIAL: sin lista privada de nombres prohibidos (solo llaves, URLs y correos). Usa --lista <ruta> para la revisión completa.');
    return [];
  }
  return fs.readFileSync(archivo, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}
function escaparRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function listarArchivos(dir) {
  const out = [];
  (function rec(d) {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      if (n.name === 'node_modules' || n.name === '.git') continue; // nunca entro ahí (ni si es un enlace)
      const p = path.join(d, n.name);
      const esCarpeta = n.isDirectory() || (n.isSymbolicLink() && fs.statSync(p).isDirectory());
      if (esCarpeta) rec(p); else out.push(p);
    }
  })(dir);
  return out;
}
function esBinario(p) { return /\.(png|jpe?g|gif|webp|ico|xlsx|pdf|zip|woff2?|ttf)$/i.test(p); }

// Un .xlsx es un ZIP con XML: extraigo su texto para revisarlo igual que el código
function textoDeZip(buf) {
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) return '';
  let pos = buf.readUInt32LE(fin + 16), texto = '';
  const total = buf.readUInt16LE(fin + 10);
  for (let n = 0; n < total && buf.readUInt32LE(pos) === 0x02014b50; n++) {
    const metodo = buf.readUInt16LE(pos + 10), tam = buf.readUInt32LE(pos + 20);
    const largoNombre = buf.readUInt16LE(pos + 28), largoExtra = buf.readUInt16LE(pos + 30), largoComent = buf.readUInt16LE(pos + 32);
    const local = buf.readUInt32LE(pos + 42), nombre = buf.toString('utf8', pos + 46, pos + 46 + largoNombre);
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(ini, ini + tam);
    if (/\.(xml|rels)$/.test(nombre)) texto += '\n' + (metodo === 8 ? zlib.inflateRawSync(datos) : datos).toString('utf8');
    pos += 46 + largoNombre + largoExtra + largoComent;
  }
  return texto.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function revisar(dir, prohibidos) {
  const hallazgos = [];
  const reglas = prohibidos.map((w) => ({ w, re: new RegExp('(?<![\\p{L}\\p{N}_])' + escaparRe(w) + '(?![\\p{L}\\p{N}_])', 'giu'), numerica: /^[\d\s-]+$/.test(w) }));
  for (const archivo of listarArchivos(dir)) {
    const rel = path.relative(dir, archivo);
    if (/\.local\.txt$/.test(rel)) { hallazgos.push([rel, 'archivo privado (*.local.txt) NO debe estar en la salida']); continue; }
    if (/(^|\/)config\.local\.js$/.test(rel)) { hallazgos.push([rel, 'config.local.js (configuración propia) NO debe estar en la salida']); continue; }
    let texto;
    if (/\.xlsx$/i.test(archivo)) texto = textoDeZip(fs.readFileSync(archivo));
    else if (esBinario(archivo)) continue;
    else texto = fs.readFileSync(archivo, 'utf8');
    const terceros = rel.startsWith('vendor' + path.sep) || rel.endsWith('fonts.css');
    for (const r of reglas) {
      if (terceros && r.numerica) continue; // números cortos chocan con código minificado de terceros
      const m = texto.match(r.re);
      if (m) hallazgos.push([rel, `palabra prohibida "${r.w}" (${m.length})`]);
    }
    if (terceros) continue;
    for (const [re, desc] of PATRONES) { const m = texto.match(re); if (m) hallazgos.push([rel, `${desc}: ${m[0].slice(0, 24)}…`]); }
    for (const m of texto.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
      const dominio = m[1].toLowerCase();
      if (!CORREOS_PERMITIDOS.some((d) => dominio === d || dominio.endsWith('.' + d))) hallazgos.push([rel, `correo no permitido: ${m[0]}`]);
    }
  }
  return hallazgos;
}

// ----------------------------------------------------------------------------
// Construcción
// ----------------------------------------------------------------------------
function copiar(origen, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (fs.statSync(origen).isDirectory()) fs.cpSync(origen, destino, { recursive: true });
  else fs.copyFileSync(origen, destino);
}
function reemplazar(archivo, cambios) {
  let t = fs.readFileSync(archivo, 'utf8');
  for (const [buscar, poner, todas] of cambios) {
    const antes = t;
    t = buscar instanceof RegExp ? t.replace(buscar, poner) : (todas ? t.split(buscar).join(poner) : t.replace(buscar, poner));
    if (t === antes) errores.push(`${path.basename(archivo)}: no encontré «${String(buscar).slice(0, 70)}»`);
  }
  fs.writeFileSync(archivo, t);
}

function construir() {
  const PROD = path.resolve(args.produccion), FUENTE = path.resolve(args.fuente), SAL = path.resolve(args.salida);
  const USUARIO = String(args.usuario || '').trim();
  if (!USUARIO || !/^[A-Za-z0-9-]+$/.test(USUARIO)) { fallar('Indica --usuario con tu usuario de GitHub.'); return; }
  fs.rmSync(SAL, { recursive: true, force: true });
  fs.mkdirSync(SAL, { recursive: true });

  // 1. Código de producción
  for (const p of ['index.html', 'css', 'vendor', 'js/app.js', 'js/excel-respaldo.js']) copiar(path.join(PROD, p), path.join(SAL, p));
  for (const p of ['comun.mjs', 'alerta.mjs', 'respaldo.mjs', 'package.json']) copiar(path.join(PROD, 'scripts', p), path.join(SAL, 'automatizaciones/scripts', p));
  for (const p of ['alerta-vencidos.yml', 'respaldo-semanal.yml']) copiar(path.join(PROD, '.github/workflows', p), path.join(SAL, 'automatizaciones/workflows-ejemplo', p));

  // 2. Cambios mínimos
  const autor = [/Autor:\s*Guillermo Navarrete \([^)]*\)/g, `Autor: Guillermo Navarrete · GitHub @${USUARIO}`];
  for (const f of ['index.html', 'css/styles.css', 'js/app.js', 'js/excel-respaldo.js', 'automatizaciones/scripts/comun.mjs', 'automatizaciones/scripts/alerta.mjs', 'automatizaciones/scripts/respaldo.mjs', 'automatizaciones/workflows-ejemplo/alerta-vencidos.yml', 'automatizaciones/workflows-ejemplo/respaldo-semanal.yml']) {
    reemplazar(path.join(SAL, f), [autor]);
  }
  // Automatizaciones: en el portafolio viven en automatizaciones/ (en producción, en scripts/ y .github/)
  reemplazar(path.join(SAL, 'automatizaciones/scripts/comun.mjs'), [["require('../js/excel-respaldo.js')", "require('../../js/excel-respaldo.js')"]]);
  for (const f of ['alerta-vencidos.yml', 'respaldo-semanal.yml']) {
    reemplazar(path.join(SAL, 'automatizaciones/workflows-ejemplo', f), [
      ['working-directory: scripts', 'working-directory: automatizaciones/scripts'],
      [/^/, '# EJEMPLO: este archivo NO se ejecuta aquí. Para usarlo, cópialo a .github/workflows/ y crea los secretos (ver docs/06).\n']
    ]);
  }
  reemplazar(path.join(SAL, 'index.html'), [
    [/\n\s*Página: https:\/\/[^\n]*/, ''],
    ['config.js               → URL y llave pública de Supabase (lo llenas tú)', 'config.local.js         → TU conexión a Supabase (no se sube; ver config.local.EJEMPLO.js)\n    js/demo/                → modo demo: datos ficticios y servidor simulado'],
    ['  <script src="config.js"></script>', '  <!-- Configuración propia (opcional). Si no existe, la página arranca en modo demo. -->\n  <script src="config.local.js"></script>\n  <script src="js/demo/datos-demo.js"></script>\n  <script src="js/demo/servidor-demo.js"></script>'],
    ['  <script src="js/app.js"></script>', '  <script src="js/app.js"></script>\n  <script src="js/demo/modo-demo.js"></script>']
  ]);
  reemplazar(path.join(SAL, 'js/app.js'), [
    [/  Base de datos: Supabase \(proyecto[^\n]*\n\s*La conexión la tomo de config\.js \(URL y llave pública anon\)\./, '  Base de datos: Supabase (PostgreSQL). La conexión la tomo de config.local.js;\n                si no existe (o la URL trae ?demo) uso el servidor simulado del modo demo.'],
    [/  Publicación:\s*GitHub Pages — https:\/\/[^\n]*/, '  Publicación:  GitHub Pages (modo demo con datos ficticios)'],
    [`    if (!configurado()) { mostrar('setup'); return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'agr-auth' }
    });`,
    `    // MODO DEMO: sin config.local.js, o con ?demo en la dirección, la MISMA aplicación
    // habla con un servidor simulado dentro del navegador (js/demo/servidor-demo.js).
    var DEMO = !!window.DemoServidor && window.supabase && (/[?&]demo(=|&|$)/.test(location.search) || !configurado());
    if (!DEMO && !configurado()) { mostrar('setup'); return; }
    var opcionesSb = { auth: { persistSession: true, autoRefreshToken: true, storageKey: DEMO ? 'agr-demo-auth' : 'agr-auth' } };
    if (DEMO) { window.MODO_DEMO = window.DemoServidor.iniciar(); opcionesSb.global = { fetch: window.MODO_DEMO.fetch }; }
    sb = window.supabase.createClient(DEMO ? window.MODO_DEMO.url : CFG.SUPABASE_URL, DEMO ? window.MODO_DEMO.llave : CFG.SUPABASE_ANON_KEY, opcionesSb);`]
  ]);

  // 2b. Reemplazos privados (herramientas/reemplazos.local.txt, ignorado por git):
  //     líneas «texto exacto ==> reemplazo» para neutralizar textos reales que
  //     aparezcan en el código de producción (por ejemplo, un comentario con un
  //     nombre real). Así este script nunca contiene esos textos.
  const archivoRemp = path.join(AQUI, 'reemplazos.local.txt');
  if (fs.existsSync(archivoRemp)) {
    const reglas = fs.readFileSync(archivoRemp, 'utf8').split(/\r?\n/).filter((l) => l.includes('==>') && !l.startsWith('#')).map((l) => l.split('==>').map((x) => x.trim()));
    const usados = new Set();
    for (const archivo of listarArchivos(SAL)) {
      if (esBinario(archivo) || archivo.includes(path.sep + 'vendor' + path.sep)) continue;
      let t = fs.readFileSync(archivo, 'utf8'), antes = t;
      reglas.forEach(([b, p], i) => { if (t.includes(b)) { t = t.split(b).join(p); usados.add(i); } });
      if (t !== antes) fs.writeFileSync(archivo, t);
    }
    reglas.forEach((r, i) => { if (!usados.has(i)) console.warn('⚠ reemplazo privado sin usar (¿cambió producción?): regla #' + (i + 1)); });
  }

  // 3. Archivos propios del portafolio
  for (const archivo of listarArchivos(FUENTE)) {
    const rel = path.relative(FUENTE, archivo);
    if (/\.local\.(txt|js|json)$/.test(rel)) continue;
    const destino = path.join(SAL, rel);
    copiar(archivo, destino);
    if (!esBinario(destino)) {
      const t = fs.readFileSync(destino, 'utf8');
      // El marcador se arma por partes para que este mismo script no se modifique al copiarse
      const MARCA = '{' + '{USUARIO_GITHUB';
      if (t.includes(MARCA)) fs.writeFileSync(destino, t.split(MARCA + '_MINUS}}').join(USUARIO.toLowerCase()).split(MARCA + '}}').join(USUARIO));
    }
  }
  if (errores.length) { errores.forEach(fallar); return; }
  console.log('✔ Construido en ' + SAL);
  return SAL;
}

// ----------------------------------------------------------------------------
// Solo se ejecuta si se llama directamente (las pruebas importan revisar()).
const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
const objetivo = !esPrincipal ? null : args.revisar ? path.resolve(args.revisar) : construir();
if (objetivo && !process.exitCode) {
  const hallazgos = revisar(objetivo, leerProhibidos(!args.revisar));
  if (hallazgos.length) {
    hallazgos.forEach(([f, m]) => fallar(`${f}: ${m}`));
    console.error(`\n✖ Revisión de seguridad: ${hallazgos.length} hallazgo(s). No publiques esta carpeta.`);
  } else if (!process.exitCode) {
    console.log('✔ Revisión de seguridad: sin nombres prohibidos, llaves ni correos no permitidos.');
  }
}
