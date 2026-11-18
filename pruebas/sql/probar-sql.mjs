#!/usr/bin/env node
/*
  ============================================================================
  PRUEBA DE LOS SCRIPTS SQL EN UNA BASE POSTGRESQL LOCAL
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  ----------------------------------------------------------------------------
  Uso:  node pruebas/sql/probar-sql.mjs "postgres://usuario@localhost/base"
        (necesita el comando psql). NO usar contra la base de producción.

  Qué hace (todo dentro de UNA transacción que al final se DESHACE):
    1. Crea roles y un esquema "auth" mínimos que imitan a Supabase (si faltan).
    2. Crea el esquema aparte prueba_portafolio y corre sql/01…05 DOS veces
       (comprueba que se pueden repetir sin duplicar).
    3. Verifica reglas, triggers, permisos por rol (anon, normal, vista,
       administrador) y que nada se creó en el esquema public.
    4. ROLLBACK: la base queda exactamente como estaba.
  Lo que NO puede probar una base local: la API de Supabase (PostgREST), el
  inicio de sesión real ni Storage. Eso lo cubre la prueba e2e de la demo.
  ============================================================================
*/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const conexion = process.argv[2];
if (!conexion) { console.error('Indica la conexión: node pruebas/sql/probar-sql.mjs "postgres://usuario@localhost/base"'); process.exit(2); }

// Los scripts traen su propio BEGIN/COMMIT; aquí los quito para meter TODO en una sola transacción
const leer = (f) => fs.readFileSync(path.join(RAIZ, 'sql', f), 'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gim, '-- ($1 quitado para la prueba)');
const scripts = ['01_esquema.sql', '02_funciones_y_triggers.sql', '03_vistas.sql', '04_seguridad.sql', '05_datos_demo.sql'].map(leer).join('\n');
const como = (email) => `SELECT set_config('request.jwt.claims', '{"email":"${email}","role":"authenticated"}', true);`;
const esperar = (cond, msg) => `DO $$ BEGIN IF NOT (${cond}) THEN RAISE EXCEPTION 'FALLÓ: ${msg.replace(/'/g, "''")}'; END IF; RAISE NOTICE 'OK: ${msg.replace(/'/g, "''")}'; END $$;`;
const debeFallar = (sentencia, msg) => `DO $$ BEGIN ${sentencia}; RAISE EXCEPTION 'FALLÓ (debía rechazarse): ${msg.replace(/'/g, "''")}'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FALLÓ%' THEN RAISE; END IF; RAISE NOTICE 'OK (rechazado): ${msg.replace(/'/g, "''")}'; END $$;`;

const prueba = `
\\set ON_ERROR_STOP on
\\set QUIET on
BEGIN;
-- 1. Imitación mínima de Supabase (solo si no existe)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $f$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated;
CREATE TEMP TABLE conteos AS SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS tablas_public_antes, 0::bigint AS n1, 0::bigint AS c1;

-- 2. Esquema aparte y scripts (dos veces)
CREATE SCHEMA prueba_portafolio;
GRANT USAGE ON SCHEMA prueba_portafolio TO anon, authenticated;
SET LOCAL search_path = prueba_portafolio;
${scripts}
UPDATE conteos SET n1 = (SELECT count(*) FROM agregados), c1 = (SELECT count(*) FROM catalogo_procedimientos);
${scripts}
${esperar("(SELECT count(*) FROM agregados) = (SELECT n1 FROM conteos) AND (SELECT count(*) FROM catalogo_procedimientos) = (SELECT c1 FROM conteos)", 'los scripts se pueden repetir sin duplicar')}
${esperar("(SELECT count(*) FROM agregados) = 180", '180 agregados ficticios cargados')}
${esperar("(SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') = (SELECT tablas_public_antes FROM conteos)", 'nada se creó en el esquema public (aislamiento)')}
${esperar("NOT EXISTS (SELECT 1 FROM agregados WHERE fecha_carga IS NOT NULL AND estatus <> 'CARGADO')", 'trigger: toda fecha de carga dejó el estatus CARGADO')}
${esperar("(SELECT count(*) FROM pg_tables WHERE schemaname = 'prueba_portafolio' AND NOT rowsecurity) = 0", 'RLS activa en todas las tablas')}
${esperar("(SELECT sum(n) FROM (SELECT count(*) n FROM v_agregados WHERE NOT eliminado GROUP BY estatus_operaciones) x) = (SELECT count(*) FROM agregados WHERE NOT eliminado)", 'el semáforo suma el total de activos')}

-- 3. Permisos por rol
SET LOCAL ROLE anon;
${debeFallar('PERFORM 1 FROM agregados LIMIT 1', 'sin sesión no se puede leer')}
RESET ROLE; SET LOCAL ROLE authenticated;
${como('captura@demo.local')}
${esperar('NOT es_admin() AND NOT es_vista()', 'captura: usuario normal')}
INSERT INTO agregados (cliente_id, proveedor_id, solicitante_id, tipo_servicio_id, contrarrecibo, nur, cpt, descripcion, fecha_solicitud)
  SELECT (SELECT min(id) FROM clientes), (SELECT min(id) FROM proveedores), (SELECT min(id) FROM solicitantes), (SELECT min(id) FROM tipos_servicio),
         '9000000001', '900000000001', 'DEMO-LAB-001', 'BIOMETRÍA HEMÁTICA COMPLETA', (now() AT TIME ZONE 'America/Mexico_City')::date - 2;
UPDATE agregados SET fecha_carga = fecha_solicitud + 1 WHERE nur = '900000000001';
${esperar("(SELECT estatus FROM agregados WHERE nur = '900000000001') = 'CARGADO'", 'captura: alta y fecha de carga → CARGADO')}
${esperar("(SELECT count(*) FROM agregados_historial h JOIN agregados a ON a.id = h.agregado_id WHERE a.nur = '900000000001') = 2", 'historial con alta y cambio')}
${debeFallar("UPDATE agregados SET fecha_carga = fecha_solicitud - 1 WHERE nur = '900000000001'", 'fecha de carga anterior a la solicitud')}
${debeFallar("INSERT INTO agregados (cliente_id, proveedor_id, solicitante_id, tipo_servicio_id, contrarrecibo, nur, cpt, descripcion, fecha_solicitud) SELECT 1,1,1,1,'','900000000002','X','Y',current_date", 'registro nuevo con contrarrecibo en blanco')}
${debeFallar("UPDATE agregados SET eliminado = true WHERE nur = '900000000001'", 'baja sin motivo')}
${debeFallar("DELETE FROM agregados WHERE nur = '900000000001'", 'borrar un agregado')}
${esperar('(SELECT count(*) FROM destinatarios_alerta) = 0', 'captura no ve destinatarios')}
${como('vista@demo.local')}
${esperar('es_vista()', 'vista: rol detectado')}
${debeFallar("INSERT INTO proveedores (nombre) VALUES ('PROVEEDOR NUEVO')", 'vista no puede dar de alta catálogos')}
UPDATE agregados SET notas = 'NO' WHERE nur = '900000000001';
${esperar("(SELECT notas FROM agregados WHERE nur = '900000000001') IS NULL", 'vista no puede editar (0 filas)')}
${esperar("marcar_solicitado(ARRAY(SELECT id FROM agregados WHERE estatus = 'PENDIENTE' AND NOT eliminado AND NOT solicitado_proveedor ORDER BY id LIMIT 3), true) = 3", 'vista: marcar_solicitado marca 3')}
${como('admin@demo.local')}
${esperar('es_admin() AND (SELECT count(*) FROM destinatarios_alerta) = 2', 'administrador ve destinatarios')}
RESET ROLE;

ROLLBACK;
-- 4. Después del ROLLBACK no debe quedar nada
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'prueba_portafolio') THEN 'FALLÓ: quedó el esquema de prueba' ELSE 'OK: transacción deshecha, la base quedó igual' END AS resultado;
`;

const r = spawnSync('psql', [conexion, '-X', '-v', 'ON_ERROR_STOP=1'], { input: prueba, encoding: 'utf8' });
const lineas = (r.stderr + r.stdout).split('\n').filter((l) => /OK|FALLÓ|ERROR/.test(l)).map((l) => l.replace(/^.*?(NOTICE|ERROR):\s*/, (m, t) => (t === 'ERROR' ? 'ERROR: ' : '')).trim());
lineas.forEach((l) => console.log((/^OK/.test(l) ? '✔ ' : '✖ ') + l));
const fallo = r.status !== 0 || lineas.some((l) => /FALLÓ|ERROR/.test(l));
console.log(fallo ? '\n✖ La prueba de SQL falló.' : `\n✔ Prueba de SQL completa (${lineas.filter((l) => /^OK/.test(l)).length} comprobaciones).`);
process.exit(fallo ? 1 : 0);
