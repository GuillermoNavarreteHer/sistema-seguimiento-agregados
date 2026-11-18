-- =============================================================================
--  99 · VERIFICACIÓN (solo lectura; se puede correr cuando quieras)
--  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
-- =============================================================================
-- 1. Conteos generales
SELECT (SELECT count(*) FROM agregados) AS agregados,
       (SELECT count(*) FROM agregados WHERE eliminado) AS bajas,
       (SELECT count(*) FROM clientes) AS clientes,
       (SELECT count(*) FROM proveedores) AS proveedores,
       (SELECT count(*) FROM catalogo_procedimientos) AS procedimientos;

-- 2. Semáforo (debe sumar el total de activos)
SELECT estatus_operaciones, count(*) FROM v_agregados WHERE NOT eliminado GROUP BY 1 ORDER BY 1;

-- 3. Seguridad: todas las tablas con RLS activa (rowsecurity = true)
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = current_schema() ORDER BY 1;

-- 4. Reglas que nunca deben romperse (cada consulta debe dar 0)
SELECT count(*) AS carga_antes_de_solicitud FROM agregados WHERE fecha_carga < fecha_solicitud;
SELECT count(*) AS con_fecha_sin_cargado   FROM agregados WHERE fecha_carga IS NOT NULL AND estatus <> 'CARGADO';
SELECT count(*) AS bajas_sin_motivo        FROM agregados WHERE eliminado AND btrim(coalesce(motivo_baja,'')) = '';
