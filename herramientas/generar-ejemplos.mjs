#!/usr/bin/env node
/*
  Genera los archivos de ejemplo de docs/ejemplos/ con datos 100% ficticios:
    • respaldo-ejemplo.xlsx              (formato del respaldo semanal)
    • concentrado-proveedor-ejemplo.xlsx (Excel que se envía a un proveedor)
  Usa el MISMO servidor simulado y el MISMO generador de Excel que la página,
  con fecha base fija: con la misma semilla salen los mismos bytes.
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  Uso: node herramientas/generar-ejemplos.mjs
*/
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HOY = '2026-11-16';
const FECHA = new Date('2026-11-16T18:00:00Z');

// Cargo los scripts del navegador en Node (publican sus funciones en globalThis)
function cargar(rel) {
  const modulo = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(path.join(RAIZ, rel), 'utf8'))(modulo, modulo.exports);
  return modulo.exports;
}
const XLSX = cargar('vendor/xlsx-0.18.5.full.min.js');
cargar('js/demo/datos-demo.js'); cargar('js/demo/servidor-demo.js'); cargar('js/excel-respaldo.js');
const { DemoServidor, ExcelRespaldo } = globalThis;

const srv = DemoServidor.crear({ hoy: HOY, latencia: 0 });
const t = (await (await srv.fetch(srv.url + '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: 'admin@demo.local', password: 'demo1234' }) })).json()).access_token;
const leer = async (ruta) => (await srv.fetch(srv.url + '/rest/v1/' + ruta, { headers: { authorization: 'Bearer ' + t } })).json();

const agregados = await leer('v_agregados?select=*&order=id.asc');
const catalogos = {};
for (const c of ['clientes', 'proveedores', 'solicitantes', 'tipos_servicio']) catalogos[c] = await leer(c + '?select=nombre,activo&order=nombre.asc');

const destino = path.join(RAIZ, 'docs/ejemplos');
fs.mkdirSync(destino, { recursive: true });
const escribir = (wb, nombre) => {
  fs.writeFileSync(path.join(destino, nombre), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log('✔ docs/ejemplos/' + nombre);
};
escribir(ExcelRespaldo.libro(XLSX, { agregados, catalogos, generado: FECHA }), 'respaldo-ejemplo.xlsx');
const prov = agregados.find((r) => r.estatus === 'PENDIENTE' && !r.eliminado).proveedor;
const pendientes = agregados.filter((r) => r.proveedor === prov && r.estatus === 'PENDIENTE' && !r.eliminado);
escribir(ExcelRespaldo.concentradoProveedor(XLSX, prov, pendientes, FECHA), 'concentrado-proveedor-ejemplo.xlsx');
