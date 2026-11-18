/*
  ============================================================================
  PRUEBA DE EXTREMO A EXTREMO DEL MODO DEMO (navegador real)
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  ----------------------------------------------------------------------------
  Correr:   npm run test:e2e            (o: node pruebas/e2e/demo-completa.mjs)
  Capturas: node pruebas/e2e/demo-completa.mjs --capturas   → docs/img/*.png
  Requiere: npm install  y  npx playwright install chromium

  Recorre la aplicación REAL contra el servidor simulado con los tres roles
  y verifica las reglas importantes. Falla si cualquier petición sale de la
  propia página (aislamiento de red: ninguna llamada real).
  ============================================================================
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CAPTURAS = process.argv.includes('--capturas');
const DIR_IMG = path.join(RAIZ, 'docs/img');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const resultados = [];

// Servidor estático mínimo (igual que GitHub Pages: solo archivos)
function servir() {
  return new Promise((resolver) => {
    const srv = http.createServer((req, res) => {
      const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const archivo = path.join(RAIZ, ruta === '/' ? 'index.html' : ruta);
      if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('no existe'); return; }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      fs.createReadStream(archivo).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolver(srv));
  });
}

async function paso(nombre, fn) {
  try { await fn(); resultados.push(['✔', nombre]); }
  catch (e) { resultados.push(['✖', nombre + ' → ' + e.message.replace(/\s*\n\s*/g, ' ⏎ ').slice(0, 400)]); }
}

const srv = await servir();
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const navegador = await chromium.launch();
const externas = [], erroresPagina = [];

async function nuevaPagina(opciones) {
  const ctx = await navegador.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }, opciones || {}));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') });
  const pg = await ctx.newPage();
  pg.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) externas.push(r.url()); });
  pg.on('pageerror', (e) => erroresPagina.push(e.message));
  return pg;
}
async function entrar(pg, email, ruta) {
  await pg.goto(BASE + (ruta || ''));
  await pg.waitForSelector('#login:not([hidden])');
  await pg.click(`[data-demo-email="${email}"]`);
  await pg.waitForSelector('#app:not([hidden])');
  await pg.waitForTimeout(700);
}
async function captura(pg, nombre) { if (CAPTURAS) { fs.mkdirSync(DIR_IMG, { recursive: true }); await pg.screenshot({ path: path.join(DIR_IMG, nombre) }); } }
async function elegir(pg, campo, texto) {
  await pg.click(`#form-nuevo [data-f="${campo}"] .combo-btn`);
  await pg.keyboard.type(texto); await pg.keyboard.press('Enter');
}
const visibles = (pg) => pg.locator('.nav .tab:not([hidden])').evaluateAll((ts) => ts.map((t) => t.dataset.view));

try {
  // ------------------------------------------------------------------ ADMIN
  const pg = await nuevaPagina();
  await paso('arranca sola en modo demo (sin config.local.js) y muestra los 3 accesos', async () => {
    await pg.goto(BASE); await pg.waitForSelector('#login:not([hidden])');
    assert.equal(await pg.locator('[data-demo-email]').count(), 3);
    await captura(pg, '01-inicio-sesion-oscuro.png');
  });
  await paso('administrador: ve todas las pestañas y los indicadores cuadran', async () => {
    await pg.click('[data-demo-email="admin@demo.local"]'); await pg.waitForSelector('#app:not([hidden])');
    await pg.waitForFunction(() => document.querySelectorAll('#grid-body tr[data-i]').length > 0);
    await pg.waitForTimeout(500);
    assert.deepEqual(await visibles(pg), ['consulta', 'nuevo', 'proveedores', 'catalogos', 'correos']);
    const n = await Promise.all(['#k-total', '#k-ok', '#k-warn', '#k-bad'].map((s) => pg.innerText(s).then((t) => +t.replace(/\D/g, ''))));
    assert.ok(n[0] > 0); assert.equal(n[1] + n[2] + n[3], n[0], 'total = completados + en tiempo + por actualizar');
    await captura(pg, '02-consulta-oscuro.png');
  });
  await paso('consulta: búsqueda y filtro por semáforo', async () => {
    await pg.fill('#f-q', 'DEMO-IMG');
    // Espero a que TODA la tabla muestre el resultado (no una espera fija)
    await pg.waitForFunction(() => { const c = [...document.querySelectorAll('#grid-body tr[data-i] td:nth-child(7)')].map((t) => t.innerText); return c.length > 0 && c.every((x) => x.startsWith('DEMO-IMG')); }, null, { timeout: 5000 });
    const conBusqueda = await pg.innerText('#pager-info');
    await pg.fill('#f-q', '');
    await pg.waitForFunction((t) => document.querySelector('#pager-info').innerText !== t, conBusqueda, { timeout: 5000 });
    await pg.click('.kpi.bad');
    try {
      await pg.waitForFunction(() => { const b = [...document.querySelectorAll('#grid-body tr[data-i] td:nth-child(14) > .badge')].map((t) => t.innerText); return b.length > 0 && b.every((x) => /Cambio de estatus/.test(x)); }, null, { timeout: 5000 });
    } finally {
      await pg.click('.kpi.bad'); // quito el filtro aunque falle, para no arrastrar el error a los pasos siguientes
      await pg.waitForTimeout(400);
    }
  });

  let nurNuevo = '900123450001';
  await paso('nuevo agregado: el CPT llena tipo y descripción (bloqueados) y se guarda', async () => {
    await pg.goto(BASE + '#nuevo'); await pg.waitForTimeout(500);
    await elegir(pg, 'cliente_id', 'uno'); await elegir(pg, 'proveedor_id', 'norte'); await elegir(pg, 'solicitante_id', 'ana');
    await pg.fill('#form-nuevo [data-f="contrarrecibo"]', '9012345678');
    await pg.fill('#form-nuevo [data-f="nur"]', nurNuevo);
    const cpt = pg.locator('#form-nuevo [data-f="cpt"]');
    await cpt.pressSequentially('demo-lab-001', { delay: 15 }); await cpt.press('Tab'); await pg.waitForTimeout(900);
    assert.equal(await pg.inputValue('#form-nuevo [data-f="tipo_servicio"]'), 'LABORATORIO');
    assert.match(await pg.inputValue('#form-nuevo [data-f="descripcion"]'), /BIOMETRÍA/);
    assert.equal(await pg.locator('#form-nuevo [data-f="descripcion"]').evaluate((e) => e.readOnly), true);
    await captura(pg, '03-nuevo-agregado-cpt-automatico.png');
    await pg.click('#form-nuevo button[type=submit]'); await pg.waitForTimeout(1500);
    assert.match(await pg.innerText('#toasts'), /Agregado guardado/);
    assert.match(await pg.innerText('#sesion'), /Capturados en esta sesión: 1/);
  });
  await paso('CPT con dos opciones pide elegir; tipo inexistente se da de alta solo', async () => {
    const cpt = pg.locator('#form-nuevo [data-f="cpt"]');
    await cpt.fill(''); await cpt.pressSequentially('DEMO-OPT-003', { delay: 10 }); await cpt.press('Tab'); await pg.waitForTimeout(900);
    assert.equal(await pg.locator('[data-opciones-cpt] [data-opcion]').count(), 2);
    await pg.click('[data-opcion="0"]'); await pg.waitForTimeout(500);
    assert.ok((await pg.inputValue('#form-nuevo [data-f="tipo_servicio"]')).length > 0);
    await cpt.fill(''); await cpt.pressSequentially('DEMO-ENF-001', { delay: 10 }); await cpt.press('Tab'); await pg.waitForTimeout(1200);
    assert.equal(await pg.inputValue('#form-nuevo [data-f="tipo_servicio"]'), 'ENFERMERÍA');
  });
  await paso('CPT deshabilitado o inexistente bloquea el guardado', async () => {
    const cpt = pg.locator('#form-nuevo [data-f="cpt"]');
    await cpt.fill(''); await cpt.pressSequentially('DEMO-LAB-099', { delay: 10 }); await cpt.press('Tab'); await pg.waitForTimeout(900);
    assert.match(await pg.innerText('#form-nuevo [data-wrap="cpt"]'), /deshabilitado/);
    await cpt.fill(''); await cpt.pressSequentially('NO-EXISTE-1', { delay: 10 }); await cpt.press('Tab'); await pg.waitForTimeout(900);
    await pg.fill('#form-nuevo [data-f="nur"]', '900123450009');
    await pg.click('#form-nuevo button[type=submit]'); await pg.waitForTimeout(800);
    assert.match(await pg.innerText('#form-nuevo [data-form-error]'), /Faltan/);
  });
  await paso('fechas: acepta 5/3/26 escrito y rechaza fechas futuras', async () => {
    const f = pg.locator('#form-nuevo [data-f="fecha_solicitud"] input');
    await f.fill(''); await f.pressSequentially('5/3/26'); await f.press('Tab');
    assert.equal(await f.inputValue(), '05/03/2026');
    await f.fill(''); await f.pressSequentially('01/01/2099'); await f.press('Tab');
    await pg.click('#form-nuevo button[type=submit]'); await pg.waitForTimeout(500);
    assert.match(await pg.innerText('#form-nuevo [data-wrap="fecha_solicitud"]'), /futura/);
  });
  // Caso real: el CPT quedó con error y con el cursor; el usuario da clic en "Copiar tabla para correo".
  // Reproduce el clic perdido por el corrimiento de "Buscando en el catálogo…" (ver CHANGELOG).
  await paso('copiar para correo: la tabla llega al portapapeles con encabezados', async () => {
    await pg.locator('#form-nuevo [data-f="cpt"]').focus();
    await pg.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
    await pg.click('#sesion [data-copiar-sesion]');
    await pg.waitForFunction(() => /copiad/i.test(document.getElementById('toasts').innerText), null, { timeout: 3000 }).catch(() => {});
    const texto = await pg.evaluate(() => navigator.clipboard.readText());
    const aviso = await pg.innerText('#toasts');
    assert.ok(/copiad/i.test(aviso), 'la página no mostró el aviso de copiado (aviso: "' + aviso.replace(/\n/g, ' ') + '", foco en: ' + (await pg.evaluate(() => document.activeElement && (document.activeElement.dataset.f || document.activeElement.tagName))) + ')');
    assert.match(texto, /^CONTRARRECIBO\tNUR\tCPT\tDESCRIPCION\tTIPO DE SERVICIO\n9012345678\t900123450001\tDEMO-LAB-001/);
  });
  await paso('consulta: fecha de carga → CARGADO, historial, baja con motivo y reactivar', async () => {
    await pg.goto(BASE + '#consulta'); await pg.waitForTimeout(600);
    await pg.fill('#f-q', nurNuevo);
    await pg.waitForFunction(() => /de 1$/.test(document.querySelector('#pager-info').innerText), null, { timeout: 5000 });
    await pg.click('#grid-body tr[data-i="0"] button[data-a="carga"]'); await pg.waitForSelector('#dlg-carga[open]');
    await pg.click('#carga-save'); await pg.waitForTimeout(900);
    assert.match(await pg.innerText('#grid-body tr[data-i="0"]'), /Cargado/);
    await pg.click('#grid-body tr[data-i="0"] button[data-a="hist"]'); await pg.waitForSelector('#dlg-hist[open]'); await pg.waitForTimeout(600);
    const hist = await pg.innerText('#hist-list');
    assert.match(hist, /Alta/); assert.match(hist, /Cambio/); assert.match(hist, /admin@demo\.local/);
    await pg.keyboard.press('Escape');
    await pg.click('#grid-body tr[data-i="0"] button[data-a="baja"]'); await pg.waitForSelector('#dlg-baja[open]');
    await pg.click('#baja-save'); assert.ok(await pg.isVisible('#baja-error'), 'pide motivo');
    await pg.fill('#baja-motivo', 'PRUEBA AUTOMÁTICA'); await pg.click('#baja-save'); await pg.waitForTimeout(900);
    assert.match(await pg.innerText('#pager-info'), /Sin registros/);
    await pg.check('#f-bajas'); await pg.waitForTimeout(800);
    await pg.click('#grid-body tr[data-i="0"] button[data-a="reactivar"]'); await pg.click('#dlg-confirm-yes'); await pg.waitForTimeout(900);
    assert.equal(await pg.getAttribute('#grid-body tr[data-i="0"]', 'class'), '');
    await pg.uncheck('#f-bajas'); await pg.fill('#f-q', ''); await pg.waitForTimeout(600);
  });
  await paso('exportar a Excel descarga un archivo', async () => {
    const [d] = await Promise.all([pg.waitForEvent('download'), pg.click('#btn-export')]);
    assert.match(d.suggestedFilename(), /^CONSULTA_AGREGADOS_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
  await paso('correos y respaldo (solo admin): agregar destinatario', async () => {
    await pg.goto(BASE + '#correos'); await pg.waitForTimeout(700);
    await pg.fill('#mail-name', 'Prueba'); await pg.fill('#mail-email', 'prueba@ejemplo.com'); await pg.click('#mail-add button[type=submit]'); await pg.waitForTimeout(700);
    assert.equal(await pg.locator('.mail-row').count(), 3);
  });
  await paso('correos y respaldo: "Descargar respaldo ahora" baja el Excel', async () => {
    const [d] = await Promise.all([pg.waitForEvent('download'), pg.click('#btn-backup')]);
    assert.match(d.suggestedFilename(), /^RESPALDO_AGREGADOS_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
  await paso('catálogos: avisa de nombre parecido y da de alta uno nuevo', async () => {
    await pg.goto(BASE + '#catalogos'); await pg.waitForTimeout(600);
    await pg.click('#cat-side button[data-cat="proveedores"]');
    await pg.fill('#cat-new', 'hospital ejemplo nortee'); await pg.waitForTimeout(200);
    assert.match(await pg.innerText('#cat-dup'), /HOSPITAL EJEMPLO NORTE/);
    await pg.fill('#cat-new', 'LABORATORIO NUEVO DE PRUEBA'); await pg.click('#cat-add button[type=submit]'); await pg.waitForTimeout(800);
    assert.equal(await pg.locator('#cat-rows li', { hasText: 'LABORATORIO NUEVO DE PRUEBA' }).count(), 1);
  });
  await paso('modo claro: el tema cambia y se ve la consulta', async () => {
    await pg.goto(BASE + '#consulta'); await pg.waitForTimeout(600);
    await pg.click('#theme-toggle');
    assert.equal(await pg.getAttribute('html', 'data-theme'), 'light');
    await pg.evaluate(() => { document.getElementById('toasts').innerHTML = ''; }); // sin avisos de pasos anteriores en la captura
    await pg.waitForTimeout(500); await captura(pg, '04-consulta-claro.png');
    await pg.click('#theme-toggle');
  });

  // ---------------------------------------------------------------- CAPTURA
  const pc = await nuevaPagina();
  await paso('usuario de captura: sin pestaña de Correos (y #correos lo regresa)', async () => {
    await entrar(pc, 'captura@demo.local');
    assert.deepEqual(await visibles(pc), ['consulta', 'nuevo', 'proveedores', 'catalogos']);
    await pc.goto(BASE + '#correos'); await pc.waitForTimeout(500);
    assert.ok(pc.url().endsWith('#consulta'));
  });

  // ------------------------------------------------------------------ VISTA
  const pv = await nuevaPagina();
  await paso('usuario de vista: solo Por proveedor; Excel concentrado y marca "Solicitado"', async () => {
    await entrar(pv, 'vista@demo.local', '?demo');
    assert.deepEqual(await visibles(pv), ['proveedores']);
    await pv.goto(BASE + '?demo#nuevo'); await pv.waitForTimeout(500);
    assert.ok(pv.url().endsWith('#proveedores'));
    await pv.click('#pv-list li[data-id]'); await pv.waitForTimeout(900);
    const antes = await pv.innerText('#pv-main .card-hint');
    await captura(pv, '05-por-proveedor-vista.png');
    const [d] = await Promise.all([pv.waitForEvent('download'), pv.click('[data-pv-a="excel"]')]);
    assert.match(d.suggestedFilename(), /^PENDIENTES_.+\.xlsx$/);
    await pv.waitForSelector('#dlg-confirm[open]'); await pv.click('#dlg-confirm-yes'); await pv.waitForTimeout(1200);
    const despues = await pv.innerText('#pv-main .card-hint');
    const sol = (t) => +(t.match(/(\d+) solicitados/) || [0, 0])[1];
    const pend = (t) => +(t.match(/(\d+) pendientes/) || [0, 0])[1];
    assert.equal(sol(despues), pend(despues), 'todos quedan solicitados');
    assert.ok(sol(despues) >= sol(antes));
  });

  // ------------------------------------------------------------------ MÓVIL
  const pm = await nuevaPagina({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await paso('móvil: la página no se desborda a lo ancho', async () => {
    await entrar(pm, 'captura@demo.local');
    await pm.waitForFunction(() => document.querySelectorAll('#grid-body tr[data-i]').length > 0);
    assert.ok(await pm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await captura(pm, '06-movil-consulta.png');
  });

  await paso('demo: al recargar, los cambios se pierden y vuelven los datos ficticios', async () => {
    await pg.goto(BASE + '#consulta'); await pg.reload(); await pg.waitForSelector('#app:not([hidden])'); await pg.waitForTimeout(800);
    await pg.fill('#f-q', '900123450001'); await pg.waitForTimeout(1200);
    assert.match(await pg.innerText('#pager-info'), /Sin registros/);
  });
  await paso('aislamiento de red: ninguna petición salió de la página', async () => {
    assert.deepEqual(externas, []);
    const origenes = await pg.evaluate(() => [...new Set(window.MODO_DEMO.peticiones.map((p) => p.origen))]);
    assert.deepEqual(origenes, ['https://demo.invalid']);
  });
  await paso('sin errores de JavaScript en la página', async () => { assert.deepEqual(erroresPagina, []); });
} finally {
  await navegador.close(); srv.close();
}

resultados.forEach(([s, n]) => console.log(`${s} ${n}`));
const fallas = resultados.filter((r) => r[0] === '✖').length;
console.log(`\n${resultados.length - fallas} de ${resultados.length} pasos correctos${CAPTURAS ? ' · capturas en docs/img/' : ''}`);
process.exit(fallas ? 1 : 0);
