#!/usr/bin/env node
/*
  Genera sql/05_datos_demo.sql a partir del MISMO generador que usa la demo
  (js/demo/datos-demo.js), con semilla fija. Las fechas se escriben relativas
  al día en que se corre el SQL, para que el semáforo tenga sentido.
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  Uso: node herramientas/generar-sql-demo.mjs > sql/05_datos_demo.sql
*/
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
require(path.join(RAIZ, 'js/demo/datos-demo.js'));   // publica window/globalThis.DatosDemo
const DatosDemo = globalThis.DatosDemo;

const BASE = '2026-11-16';                      // fecha base fija → salida determinista
const d = DatosDemo.generar({ semilla: 2026, hoy: BASE });
const q = (v) => (v == null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");
const dias = (iso) => Math.round((Date.parse(BASE) - Date.parse(iso)) / 86400000);
const nombre = (lista, id) => lista.find((x) => x.id === id).nombre;
const L = [];
const p = (s) => L.push(s);

p('-- =============================================================================');
p('--  05 · DATOS DE DEMOSTRACIÓN (100% ficticios) — archivo GENERADO, no editar a mano');
p('--  Generado por herramientas/generar-sql-demo.mjs (semilla 2026). Opcional.');
p('--  Repetible: no duplica (ON CONFLICT / WHERE NOT EXISTS). Fechas relativas a hoy.');
p('--  Los usuarios se crean aparte en Supabase → Authentication (ver docs/06).');
p('-- =============================================================================');
p('BEGIN;');
p('');
for (const [tabla, lista] of [['clientes', d.clientes], ['proveedores', d.proveedores], ['solicitantes', d.solicitantes], ['tipos_servicio', d.tipos_servicio]]) {
  p(`INSERT INTO ${tabla} (nombre, activo) VALUES`);
  p(lista.map((x) => `  (${q(x.nombre)}, ${x.activo})`).join(',\n') + '\nON CONFLICT (nombre) DO NOTHING;');
  p('');
}
p('INSERT INTO destinatarios_alerta (nombre, email, recibe_alerta, recibe_respaldo) VALUES');
p(d.destinatarios_alerta.map((x) => `  (${q(x.nombre)}, ${q(x.email)}, ${x.recibe_alerta}, ${x.recibe_respaldo})`).join(',\n') + '\nON CONFLICT (email) DO NOTHING;');
p('');
p("INSERT INTO administradores (email) VALUES ('admin@demo.local') ON CONFLICT DO NOTHING;");
p("INSERT INTO usuarios_vista  (email) VALUES ('vista@demo.local') ON CONFLICT DO NOTHING;");
p('');
p('INSERT INTO catalogo_procedimientos (cpt, descripcion, tipo_servicio, grupo_servicio, status)');
p('SELECT v.cpt, v.descripcion, v.tipo, v.grupo, v.status FROM (VALUES');
p(d.catalogo_procedimientos.map((c) => `  (${q(c.cpt)}, ${q(c.descripcion)}, ${q(c.tipo_servicio)}, ${q(c.grupo_servicio)}, ${q(c.status)})`).join(',\n'));
p(') AS v(cpt, descripcion, tipo, grupo, status)');
p('WHERE NOT EXISTS (SELECT 1 FROM catalogo_procedimientos c WHERE c.cpt = v.cpt AND c.descripcion = v.descripcion);');
p('');
p('-- Agregados: catálogos por NOMBRE (no por id) y fechas = hoy (hora de México) − días');
p('WITH hoy AS (SELECT (now() AT TIME ZONE \'America/Mexico_City\')::date AS d)');
p('INSERT INTO agregados (cliente_id, proveedor_id, contrarrecibo, nur, cpt, descripcion, tipo_servicio_id, solicitante_id,');
p('                       fecha_solicitud, fecha_carga, estatus, notas, anio_surtido, origen, fila_excel,');
p('                       requiere_revision, motivo_revision, eliminado, motivo_baja, solicitado_proveedor, solicitado_en, solicitado_por)');
p('SELECT c.id, pr.id, v.contrarrecibo, v.nur, v.cpt, v.descripcion, t.id, s.id,');
p('       hoy.d - v.dias_sol, CASE WHEN v.dias_carga IS NULL THEN NULL ELSE hoy.d - v.dias_carga END, v.estatus, v.notas,');
p('       EXTRACT(YEAR FROM hoy.d - v.dias_sol)::smallint, v.origen, v.fila_excel, v.revision, v.motivo_revision,');
p('       v.eliminado, v.motivo_baja, v.solicitado, CASE WHEN v.solicitado THEN (hoy.d - v.dias_sol + 2) + time \'10:00\' END,');
p('       CASE WHEN v.solicitado THEN \'vista@demo.local\' END');
p('FROM (VALUES');
p(d.agregados.map((a) => `  (${q(nombre(d.clientes, a.cliente_id))}, ${q(nombre(d.proveedores, a.proveedor_id))}, ${q(a.contrarrecibo)}, ${q(a.nur)}, ${q(a.cpt)}, ${q(a.descripcion)}, ${q(nombre(d.tipos_servicio, a.tipo_servicio_id))}, ${q(nombre(d.solicitantes, a.solicitante_id))}, ${dias(a.fecha_solicitud)}, ${a.fecha_carga ? dias(a.fecha_carga) : 'NULL::int'}, ${q(a.estatus)}, ${q(a.notas)}, ${q(a.origen)}, ${a.fila_excel == null ? 'NULL::int' : a.fila_excel}, ${a.requiere_revision}, ${q(a.motivo_revision)}, ${a.eliminado}, ${q(a.motivo_baja)}, ${a.solicitado_proveedor})`).join(',\n'));
p(') AS v(cliente, proveedor, contrarrecibo, nur, cpt, descripcion, tipo, solicitante, dias_sol, dias_carga, estatus, notas, origen, fila_excel,');
p('       revision, motivo_revision, eliminado, motivo_baja, solicitado)');
p('CROSS JOIN hoy');
p('JOIN clientes c ON c.nombre = v.cliente');
p('JOIN proveedores pr ON pr.nombre = v.proveedor');
p('JOIN tipos_servicio t ON t.nombre = v.tipo');
p('JOIN solicitantes s ON s.nombre = v.solicitante');
p('WHERE NOT EXISTS (SELECT 1 FROM agregados x WHERE x.nur = v.nur);');
p('');
p('COMMIT;');
process.stdout.write(L.join('\n') + '\n');
