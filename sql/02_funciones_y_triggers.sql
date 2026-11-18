-- =============================================================================
--  02 · FUNCIONES Y TRIGGERS (reglas de negocio que viven en la base)
--  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
--  -----------------------------------------------------------------------------
--  Repetible: CREATE OR REPLACE y DROP TRIGGER IF EXISTS.
--  Las funciones SECURITY DEFINER fijan su ruta con "SET search_path FROM
--  CURRENT": toman el esquema activo al crearse (public en Supabase). Así nadie
--  puede engañarlas con otra ruta, y el script se puede probar en otro esquema.
-- =============================================================================
BEGIN;

-- 1. Antes de guardar un agregado: limpieza y regla "fecha de carga ⇒ CARGADO"
CREATE OR REPLACE FUNCTION fn_agregados_before_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.contrarrecibo := nullif(btrim(regexp_replace(coalesce(NEW.contrarrecibo,''), '[\s\u00A0]+', ' ', 'g')), '');
  NEW.nur           := regexp_replace(NEW.nur, '[\s\u00A0]+', '', 'g');
  NEW.cpt           := btrim(regexp_replace(NEW.cpt, '[\s\u00A0]+', ' ', 'g'));
  NEW.descripcion   := btrim(regexp_replace(NEW.descripcion, '[\s\u00A0]+', ' ', 'g'));
  NEW.notas         := nullif(btrim(coalesce(NEW.notas,'')), '');

  IF NEW.fecha_carga IS NOT NULL THEN
    NEW.estatus := 'CARGADO';
  ELSIF TG_OP = 'UPDATE' AND OLD.fecha_carga IS NOT NULL AND NEW.estatus = 'CARGADO' THEN
    NEW.estatus := 'PENDIENTE';               -- se borró la fecha de carga
  END IF;

  IF NEW.eliminado AND NEW.eliminado_en IS NULL THEN
    NEW.eliminado_en  := now();
    NEW.eliminado_por := coalesce(NEW.eliminado_por, auth.jwt() ->> 'email');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    NEW.updated_by := coalesce(auth.jwt() ->> 'email', NEW.updated_by);
    NEW.origen := OLD.origen; NEW.fila_excel := OLD.fila_excel;     -- datos de origen inmutables
    NEW.created_at := OLD.created_at; NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agregados_before_write ON agregados;
CREATE TRIGGER trg_agregados_before_write
  BEFORE INSERT OR UPDATE ON agregados
  FOR EACH ROW EXECUTE FUNCTION fn_agregados_before_write();

-- 2. Historial de cada alta, cambio y baja
CREATE OR REPLACE FUNCTION fn_agregados_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  INSERT INTO agregados_historial (agregado_id, operacion, datos_antes, datos_despues)
  VALUES (
    coalesce(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' AND NEW.eliminado AND NOT OLD.eliminado THEN 'BAJA' ELSE TG_OP END,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN coalesce(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_agregados_auditoria ON agregados;
CREATE TRIGGER trg_agregados_auditoria
  AFTER INSERT OR UPDATE OR DELETE ON agregados
  FOR EACH ROW EXECUTE FUNCTION fn_agregados_auditoria();

-- 3. Prohibido borrar: las bajas son lógicas
CREATE OR REPLACE FUNCTION fn_bloquear_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No se permite borrar registros de %. Use baja lógica (eliminado = true).', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS trg_agregados_no_delete ON agregados;
CREATE TRIGGER trg_agregados_no_delete
  BEFORE DELETE ON agregados
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_delete();

-- 4. Roles: ¿el usuario con sesión es administrador / de vista?
CREATE OR REPLACE FUNCTION es_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT EXISTS (SELECT 1 FROM administradores WHERE email = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))));
$$;
CREATE OR REPLACE FUNCTION es_vista()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios_vista WHERE email = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))));
$$;

-- 5. Marcar / quitar "Solicitado al proveedor" (única escritura de los usuarios de vista)
CREATE OR REPLACE FUNCTION marcar_solicitado(p_ids bigint[], p_valor boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE n integer;
BEGIN
  IF auth.jwt() IS NULL OR coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' THEN
    RAISE EXCEPTION 'Inicia sesión para continuar.';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF array_length(p_ids, 1) > 5000 THEN RAISE EXCEPTION 'Demasiados registros a la vez.'; END IF;
  UPDATE agregados
     SET solicitado_proveedor = p_valor,
         solicitado_en  = CASE WHEN p_valor THEN now() END,
         solicitado_por = CASE WHEN p_valor THEN auth.jwt() ->> 'email' END
   WHERE id = ANY (p_ids) AND eliminado = false AND solicitado_proveedor IS DISTINCT FROM p_valor;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

COMMIT;
