/*
  Pruebas unitarias del modo demo y de la revisión de seguridad.
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  Correr:  node --test pruebas/unitarias
  No necesitan internet ni navegador: el servidor demo corre igual en Node.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
// Los archivos de la demo publican sus funciones en el objeto global (igual que en el navegador)
require(path.join(RAIZ, 'js/demo/datos-demo.js'));
require(path.join(RAIZ, 'js/demo/servidor-demo.js'));
const { DatosDemo, DemoServidor } = globalThis;
const HOY = '2026-11-16';
const huella = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');

// ------------------------------- Generador -------------------------------
test('generador: misma semilla y fecha → mismos bytes (huella fija)', () => {
  const a = DatosDemo.generar({ semilla: 2026, hoy: HOY });
  const b = DatosDemo.generar({ semilla: 2026, hoy: HOY });
  assert.equal(huella(a), huella(b));
  assert.equal(huella(a), '1a9c48113b1bd3921eaaae0f13bf6ca4856d79e52f04b3b829314e8f680b7409');
  assert.notEqual(huella(a), huella(DatosDemo.generar({ semilla: 7, hoy: HOY })));
});

test('generador: datos con forma ficticia y casos especiales', () => {
  const d = DatosDemo.generar({ semilla: 2026, hoy: HOY });
  assert.ok(d.agregados.every((r) => /^900\d{9}$/.test(r.nur)), 'NUR ficticio empieza con 900');
  assert.ok(d.agregados.every((r) => r.contrarrecibo == null || /^90\d{8}$/.test(r.contrarrecibo)));
  assert.ok(d.catalogo_procedimientos.every((c) => c.cpt.startsWith('DEMO-')));
  assert.ok(d.agregados.every((r) => !r.fecha_carga || r.fecha_carga >= r.fecha_solicitud), 'fecha de carga ≥ solicitud');
  assert.equal(d.catalogo_procedimientos.filter((c) => c.cpt === 'DEMO-OPT-003').length, 2, 'CPT con dos opciones');
  assert.ok(d.agregados.some((r) => r.requiere_revision) && d.agregados.some((r) => r.eliminado));
  assert.throws(() => DatosDemo.generar({ semilla: 1 }), /hoy/);
});

// ---------------------------- Servidor simulado ----------------------------
async function sesion(srv, email) {
  const r = await srv.fetch(srv.url + '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: 'demo1234' }) });
  assert.equal(r.status, 200, 'inicio de sesión ' + email);
  return (await r.json()).access_token;
}
function pedir(srv, token, metodo, ruta, cuerpo, extra) {
  const headers = Object.assign({ authorization: 'Bearer ' + token, 'content-type': 'application/json' }, extra || {});
  return srv.fetch(srv.url + '/rest/v1/' + ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
}
const nuevo = { cliente_id: 1, proveedor_id: 1, solicitante_id: 1, tipo_servicio_id: 1, contrarrecibo: '9000000001', nur: '900000000001', cpt: 'DEMO-LAB-001', descripcion: 'BIOMETRÍA HEMÁTICA COMPLETA', fecha_solicitud: '2026-11-10' };
const representar = { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' };

test('servidor: contraseña incorrecta y sin sesión son rechazadas', async () => {
  const srv = DemoServidor.crear({ hoy: HOY, latencia: 0 });
  const r = await srv.fetch(srv.url + '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: 'admin@demo.local', password: 'x' }) });
  assert.equal(r.status, 400);
  const sin = await srv.fetch(srv.url + '/rest/v1/agregados?select=id', {});
  assert.equal(sin.status, 401);
});

test('servidor: consulta con filtros, or/ilike, orden, paginación y conteo', async () => {
  const srv = DemoServidor.crear({ hoy: HOY, latencia: 0 });
  const t = await sesion(srv, 'captura@demo.local');
  const r = await pedir(srv, t, 'GET', 'v_agregados?select=*&eliminado=eq.false&or=(cpt.ilike.%25lab-00%25,nur.ilike.%25zz%25)&order=fecha_solicitud.desc.nullslast,id.desc&offset=0&limit=5', null, { prefer: 'count=exact' });
  const filas = await r.json(), total = +r.headers.get('content-range').split('/')[1];
  assert.equal(filas.length, 5);
  assert.ok(total > 5 && filas.every((f) => /LAB-00/.test(f.cpt) && !f.eliminado));
  assert.ok(filas[0].fecha_solicitud >= filas[4].fecha_solicitud);
  const h = await pedir(srv, t, 'HEAD', 'v_agregados?select=id&estatus_operaciones=eq.COMPLETADO', null, { prefer: 'count=exact' });
  assert.match(h.headers.get('content-range'), /\/\d+$/);
});

test('servidor: fecha de carga → CARGADO; quitarla → PENDIENTE; historial', async () => {
  const srv = DemoServidor.crear({ hoy: HOY, latencia: 0 });
  const t = await sesion(srv, 'captura@demo.local');
  const alta = await (await pedir(srv, t, 'POST', 'agregados?select=*', nuevo, representar)).json();
  assert.equal(alta.estatus, 'PENDIENTE'); assert.equal(alta.origen, 'SISTEMA'); assert.equal(alta.created_by, 'captura@demo.local');
  const c1 = await (await pedir(srv, t, 'PATCH', 'agregados?id=eq.' + alta.id + '&select=*', { fecha_carga: '2026-11-12' }, representar)).json();
  assert.equal(c1.estatus, 'CARGADO');
  const c2 = await (await pedir(srv, t, 'PATCH', 'agregados?id=eq.' + alta.id + '&select=*', { fecha_carga: null }, representar)).json();
  assert.equal(c2.estatus, 'PENDIENTE');
  const hist = await (await pedir(srv, t, 'GET', 'agregados_historial?select=*&agregado_id=eq.' + alta.id)).json();
  assert.deepEqual(hist.map((h) => h.operacion), ['INSERT', 'UPDATE', 'UPDATE']);
});

test('servidor: restricciones de la base (fechas, blancos, baja con motivo, sin borrar)', async () => {
  const srv = DemoServidor.crear({ hoy: HOY, latencia: 0 });
  const t = await sesion(srv, 'captura@demo.local');
  const malFecha = await pedir(srv, t, 'POST', 'agregados?select=id', Object.assign({}, nuevo, { fecha_carga: '2026-11-01' }), representar);
  assert.equal(malFecha.status, 400); assert.match((await malFecha.json()).message, /chk_fecha_carga_posterior/);
  const blanco = await pedir(srv, t, 'POST', 'agregados?select=id', Object.assign({}, nuevo, { contrarrecibo: '  ' }), representar);
  assert.match((await blanco.json()).message, /chk_sin_blancos/);
  const sinMotivo = await pedir(srv, t, 'PATCH', 'agregados?id=eq.1&select=id', { eliminado: true }, representar);
  assert.match((await sinMotivo.json()).message, /chk_baja_completa/);
  const borrar = await pedir(srv, t, 'DELETE', 'agregados?id=eq.1&select=id', null, { prefer: 'return=representation' });
  assert.equal(borrar.status, 400); assert.match((await borrar.json()).message, /No se permite borrar/);
});

test('servidor: roles (vista no escribe; destinatarios solo admin; marcar solicitado)', async () => {
  const srv = DemoServidor.crear({ hoy: HOY, latencia: 0 });
  const tv = await sesion(srv, 'vista@demo.local'), tc = await sesion(srv, 'captura@demo.local'), ta = await sesion(srv, 'admin@demo.local');
  assert.equal((await pedir(srv, tv, 'POST', 'agregados', nuevo)).status, 403);
  assert.equal((await pedir(srv, tv, 'POST', 'proveedores', { nombre: 'X' })).status, 403);
  const editar = await (await pedir(srv, tv, 'PATCH', 'agregados?id=eq.1&select=id', { notas: 'NO' }, { prefer: 'return=representation' })).json();
  assert.equal(editar.length, 0, 'vista: 0 filas modificadas');
  assert.equal((await (await pedir(srv, tc, 'GET', 'destinatarios_alerta?select=*')).json()).length, 0);
  assert.equal((await (await pedir(srv, ta, 'GET', 'destinatarios_alerta?select=*')).json()).length, 2);
  for (const [t, esperado] of [[ta, [true, false]], [tc, [false, false]], [tv, [false, true]]]) {
    const a = await (await pedir(srv, t, 'POST', 'rpc/es_admin', {})).json();
    const v = await (await pedir(srv, t, 'POST', 'rpc/es_vista', {})).json();
    assert.deepEqual([a, v], esperado);
  }
  const pend = srv.db.agregados.filter((r) => r.estatus === 'PENDIENTE' && !r.eliminado && !r.solicitado_proveedor).slice(0, 3).map((r) => r.id);
  assert.equal(await (await pedir(srv, tv, 'POST', 'rpc/marcar_solicitado', { p_ids: pend, p_valor: true })).json(), 3);
  assert.ok(pend.every((id) => srv.db.agregados.find((r) => r.id === id).solicitado_por === 'vista@demo.local'));
});

test('servidor: catálogos sin duplicados y respuesta de un objeto', async () => {
  const srv = DemoServidor.crear({ hoy: HOY, latencia: 0 });
  const t = await sesion(srv, 'captura@demo.local');
  const dup = await pedir(srv, t, 'POST', 'clientes', { nombre: srv.db.clientes[0].nombre });
  assert.equal(dup.status, 409); assert.equal((await dup.json()).code, '23505');
  const varios = await pedir(srv, t, 'GET', 'clientes?select=id', null, { accept: 'application/vnd.pgrst.object+json' });
  assert.equal(varios.status, 406);
});

test('servidor: solo responde a su dirección simulada (no sale a internet)', async () => {
  const srv = DemoServidor.crear({ hoy: HOY, latencia: 0 });
  const r = await srv.fetch('https://ejemplo.com/rest/v1/agregados', {});
  assert.equal(r.status, 400);
  assert.ok(srv.peticiones.every((p) => p.origen === srv.url || p.origen === 'https://ejemplo.com'));
});

// --------------------------- Revisión de seguridad ---------------------------
test('revisión de seguridad: detecta palabras prohibidas, llaves y correos; respeta palabra completa', async () => {
  const { revisar } = await import(path.join(RAIZ, 'herramientas/construir-portafolio.mjs') + '?solo-funciones');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revision-'));
  fs.writeFileSync(path.join(dir, 'limpio.js'), '// PALABRAPROHIBIDAX dentro de otra palabra no cuenta\nconst correo = "admin@demo.local";');
  assert.deepEqual(revisar(dir, ['PROHIBIDA']), []);
  // Armo la llave y el correo falsos por partes para que este archivo no los contenga literalmente
  const jwtFalso = ['ey' + 'JhbGciOiJIUzI1NiJ9', 'ey' + 'Jyb2xlIjoiYW5vbiJ9', 'AbCdEfGhIjKlMnOpQr'].join('.');
  const correoFalso = ['alguien', 'empresa-real.mx'].join('@');
  fs.writeFileSync(path.join(dir, 'sucio.js'), 'const proveedor = "Prohibida SA"; // contacto: ' + correoFalso + '\nconst k = "' + jwtFalso + '";');
  const h = revisar(dir, ['PROHIBIDA']).map((x) => x[1]).join(' | ');
  assert.match(h, /palabra prohibida "PROHIBIDA"/);
  assert.match(h, /correo no permitido/);
  assert.match(h, /llave JWT/);
  fs.writeFileSync(path.join(dir, 'config.local.js'), '');
  assert.ok(revisar(dir, []).some((x) => /config\.local\.js/.test(x[1])));
});

test('revisión de seguridad: también revisa el contenido de los Excel (.xlsx)', async () => {
  const { revisar } = await import(path.join(RAIZ, 'herramientas/construir-portafolio.mjs') + '?solo-funciones');
  const modulo = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(path.join(RAIZ, 'vendor/xlsx-0.18.5.full.min.js'), 'utf8'))(modulo, modulo.exports);
  const XLSX = modulo.exports, wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['PROVEEDOR', 'NOMBREPLANTADO SA']]), 'H');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revision-xlsx-'));
  fs.writeFileSync(path.join(dir, 'x.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  assert.match(revisar(dir, ['NOMBREPLANTADO']).map((x) => x[1]).join(), /NOMBREPLANTADO/);
  assert.deepEqual(revisar(path.join(RAIZ, 'docs/ejemplos'), ['NOMBREPLANTADO']), [], 'los ejemplos publicados están limpios');
});
