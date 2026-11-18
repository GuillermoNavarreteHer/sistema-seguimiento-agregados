-- =============================================================================
--  04 · SEGURIDAD (Row Level Security, permisos y roles)
--  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
--  -----------------------------------------------------------------------------
--  • Sin sesión (rol anon) no se ve NADA.
--  • Con sesión (authenticated): usuario normal.
--  • Administrador: correo en "administradores" → ve y edita destinatarios.
--  • Vista: correo en "usuarios_vista" → solo lectura + marcar_solicitado().
--  Repetible: DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- =============================================================================
BEGIN;

ALTER TABLE clientes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitantes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_servicio          ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinatarios_alerta    ENABLE ROW LEVEL SECURITY;
ALTER TABLE administradores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_vista          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agregados               ENABLE ROW LEVEL SECURITY;
ALTER TABLE agregados_historial     ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_procedimientos ENABLE ROW LEVEL SECURITY;

-- Catálogos: todos leen; escriben solo quienes NO son de vista (no hay DELETE: se desactivan)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','proveedores','solicitantes','tipos_servicio'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_leer', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_alta', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_cambio', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_leer', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (NOT es_vista())', t || '_alta', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (NOT es_vista()) WITH CHECK (NOT es_vista())', t || '_cambio', t);
  END LOOP;
END $$;

-- Agregados: todos leen; capturan y editan solo quienes NO son de vista
DROP POLICY IF EXISTS agregados_leer   ON agregados;
DROP POLICY IF EXISTS agregados_alta   ON agregados;
DROP POLICY IF EXISTS agregados_cambio ON agregados;
CREATE POLICY agregados_leer   ON agregados FOR SELECT TO authenticated USING (true);
CREATE POLICY agregados_alta   ON agregados FOR INSERT TO authenticated WITH CHECK (origen = 'SISTEMA' AND NOT es_vista());
CREATE POLICY agregados_cambio ON agregados FOR UPDATE TO authenticated USING (NOT es_vista()) WITH CHECK (NOT es_vista());

-- Historial y catálogo de procedimientos: solo lectura
DROP POLICY IF EXISTS historial_leer ON agregados_historial;
CREATE POLICY historial_leer ON agregados_historial FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS catalogo_leer ON catalogo_procedimientos;
CREATE POLICY catalogo_leer ON catalogo_procedimientos FOR SELECT TO authenticated USING (true);

-- Destinatarios: solo administradores (ver, agregar, cambiar, quitar)
DROP POLICY IF EXISTS destinatarios_leer   ON destinatarios_alerta;
DROP POLICY IF EXISTS destinatarios_alta   ON destinatarios_alerta;
DROP POLICY IF EXISTS destinatarios_cambio ON destinatarios_alerta;
DROP POLICY IF EXISTS destinatarios_quitar ON destinatarios_alerta;
CREATE POLICY destinatarios_leer   ON destinatarios_alerta FOR SELECT TO authenticated USING (es_admin());
CREATE POLICY destinatarios_alta   ON destinatarios_alerta FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY destinatarios_cambio ON destinatarios_alerta FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY destinatarios_quitar ON destinatarios_alerta FOR DELETE TO authenticated USING (es_admin());

-- Permisos de tabla (la RLS decide fila por fila)
REVOKE ALL ON clientes, proveedores, solicitantes, tipos_servicio, destinatarios_alerta, administradores,
              usuarios_vista, agregados, agregados_historial, catalogo_procedimientos FROM anon;
REVOKE ALL ON administradores, usuarios_vista FROM authenticated;   -- solo se leen con es_admin()/es_vista()
GRANT SELECT, INSERT, UPDATE ON clientes, proveedores, solicitantes, tipos_servicio, agregados TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON destinatarios_alerta TO authenticated;
GRANT SELECT ON agregados_historial, catalogo_procedimientos TO authenticated;
REVOKE DELETE ON agregados, agregados_historial FROM authenticated;
REVOKE ALL ON v_agregados, v_pendientes_vencidos, v_pendientes_por_proveedor, v_anios_surtido FROM anon;
GRANT SELECT ON v_agregados, v_pendientes_vencidos, v_pendientes_por_proveedor, v_anios_surtido TO authenticated;

-- Funciones: solo con sesión
REVOKE ALL ON FUNCTION es_admin(), es_vista(), marcar_solicitado(bigint[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION es_admin(), es_vista(), marcar_solicitado(bigint[], boolean) TO authenticated;

COMMIT;

-- Que la API de Supabase reconozca los cambios de inmediato
NOTIFY pgrst, 'reload schema';
