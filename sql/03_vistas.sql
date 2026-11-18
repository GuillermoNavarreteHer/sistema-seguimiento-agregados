-- =============================================================================
--  03 · VISTAS (lo que consulta la página)
--  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
--  -----------------------------------------------------------------------------
--  security_invoker = true: cada vista respeta los permisos (RLS) de quien
--  consulta. Repetible: CREATE OR REPLACE VIEW.
--  Estatus operaciones (misma fórmula que la hoja original):
--    CARGADO → COMPLETADO · ≤ 4 días naturales → EN TIEMPO · si no → CAMBIO DE
--    ESTATUS OPERACIONES. Días en hora de México.
-- =============================================================================
BEGIN;

CREATE OR REPLACE VIEW v_agregados WITH (security_invoker = true) AS
SELECT
  a.id, a.anio_surtido,
  c.nombre AS cliente, p.nombre AS proveedor,
  a.contrarrecibo, a.nur, a.cpt, a.descripcion,
  t.nombre AS tipo_servicio, s.nombre AS solicitante,
  a.fecha_solicitud, a.fecha_carga, a.estatus,
  CASE
    WHEN a.estatus = 'CARGADO' THEN 'COMPLETADO'
    WHEN ((now() AT TIME ZONE 'America/Mexico_City')::date - a.fecha_solicitud) <= 4 THEN 'EN TIEMPO'
    ELSE 'CAMBIO DE ESTATUS OPERACIONES'
  END AS estatus_operaciones,
  ((now() AT TIME ZONE 'America/Mexico_City')::date - a.fecha_solicitud) AS dias_transcurridos,
  a.notas,
  a.cliente_id, a.proveedor_id, a.tipo_servicio_id, a.solicitante_id,
  a.origen, a.fila_excel, a.requiere_revision, a.motivo_revision,
  a.eliminado, a.eliminado_en, a.eliminado_por, a.motivo_baja,
  a.created_at, a.created_by, a.updated_at, a.updated_by,
  a.solicitado_proveedor, a.solicitado_en, a.solicitado_por
FROM agregados a
JOIN clientes       c ON c.id = a.cliente_id
JOIN proveedores    p ON p.id = a.proveedor_id
JOIN tipos_servicio t ON t.id = a.tipo_servicio_id
JOIN solicitantes   s ON s.id = a.solicitante_id;

-- No cargados con más de 4 días (alimenta la alerta diaria)
CREATE OR REPLACE VIEW v_pendientes_vencidos WITH (security_invoker = true) AS
SELECT * FROM v_agregados
WHERE eliminado = false AND estatus <> 'CARGADO' AND dias_transcurridos > 4
ORDER BY fecha_solicitud;

-- Conteo de PENDIENTES por proveedor (pantalla "Por proveedor")
CREATE OR REPLACE VIEW v_pendientes_por_proveedor WITH (security_invoker = true) AS
SELECT proveedor_id, proveedor,
       count(*)                                                                     AS pendientes,
       count(*) FILTER (WHERE estatus_operaciones = 'CAMBIO DE ESTATUS OPERACIONES') AS vencidos,
       count(*) FILTER (WHERE solicitado_proveedor)                                 AS solicitados,
       min(fecha_solicitud)                                                         AS mas_antigua
FROM v_agregados
WHERE eliminado = false AND estatus = 'PENDIENTE'
GROUP BY proveedor_id, proveedor;

-- Años para el desplegable "Año surtido" (siempre incluye el año en curso)
CREATE OR REPLACE VIEW v_anios_surtido WITH (security_invoker = true) AS
SELECT DISTINCT anio FROM (
  SELECT anio_surtido AS anio FROM agregados
  UNION
  SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Mexico_City'))::smallint
) x
ORDER BY anio DESC;

COMMIT;
