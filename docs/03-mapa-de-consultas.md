# 03 · Mapa de consultas (API)

Autor: Guillermo Navarrete · [@GuillermoNavarreteHer](https://github.com/GuillermoNavarreteHer)

La página usa la API REST de Supabase (PostgREST) a través de `supabase-js`. Toda consulta va con la sesión del usuario, y la base aplica RLS. En modo demo, las mismas peticiones las responde `js/demo/servidor-demo.js`.

## Sesión

| Momento | Petición | Notas |
|---|---|---|
| Iniciar sesión | `POST /auth/v1/token?grant_type=password` | Correo y contraseña de Supabase Auth |
| Renovar sesión | `POST /auth/v1/token?grant_type=refresh_token` | Automático |
| Cerrar sesión | `POST /auth/v1/logout` | |
| Saber el rol | `POST /rest/v1/rpc/es_admin` y `rpc/es_vista` | Define qué pestañas se muestran |
| ¿Hay catálogo de CPT? | `HEAD /rest/v1/catalogo_procedimientos` (con conteo) | Activa el CPT automático |

## Consulta

| Acción | Petición | Parámetros |
|---|---|---|
| Tabla | `GET v_agregados?select=*` | `eliminado=eq.false` (salvo "Mostrar bajas"), `anio_surtido`, `cliente_id`, `proveedor_id`, `tipo_servicio_id`, `solicitante_id`, `estatus`, `estatus_operaciones`, `fecha_solicitud=gte/lte`, `requiere_revision=eq.true`; búsqueda: `or=(nur.ilike,cpt.ilike,descripcion.ilike,contrarrecibo.ilike,proveedor.ilike,notas.ilike)`; orden `col.asc/desc.nullslast,id.desc`; `offset` y `limit` (25, 50 o 100); `Prefer: count=exact` |
| Semáforo | 4 × `HEAD v_agregados` con conteo | Total, `COMPLETADO`, `EN TIEMPO`, `CAMBIO DE ESTATUS OPERACIONES` del año elegido |
| Número rojo de la pestaña | `HEAD v_pendientes_vencidos` con conteo | Todos los años |
| Exportar | `GET v_agregados` con los mismos filtros, en bloques de 1,000 | Genera el Excel en el navegador |

## Acciones por registro

| Acción | Petición | Regla |
|---|---|---|
| Fecha de carga | `PATCH agregados?id=eq.N` `{fecha_carga}` | No futura y ≥ solicitud; la base pone CARGADO |
| Editar | `GET v_agregados?id=eq.N` y luego `PATCH agregados?id=eq.N` | Mismo formulario que el alta |
| Dar de baja | `PATCH agregados?id=eq.N` `{eliminado:true, motivo_baja}` | Motivo obligatorio |
| Reactivar | `PATCH agregados?id=eq.N` `{eliminado:false, …null}` | |
| Historial | `GET agregados_historial?agregado_id=eq.N&order=fecha.desc` | Diferencias campo por campo |
| Borrar | — | No existe: la base lo prohíbe |

## Nuevo agregado

| Paso | Petición | Regla |
|---|---|---|
| Listas | `GET clientes`, `proveedores`, `solicitantes`, `tipos_servicio`, `v_anios_surtido` | Solo activos en el formulario |
| CPT | `GET catalogo_procedimientos?cpt=ilike.<código>&limit=20` | Solo `Habilitado`; si no existe, `GET agregados?cpt=eq.<código>` (registro anterior) |
| Tipo nuevo del catálogo | `POST tipos_servicio` | Alta automática |
| Folio repetido | `GET v_agregados?nur=eq.<folio>&eliminado=eq.false` | Avisa y pide confirmar (no bloquea) |
| Guardar | `POST agregados` | `origen=SISTEMA`; sin blancos; fechas válidas |
| Alta de catálogo desde la lista | `POST <catálogo>` `{nombre}` | Avisa si hay nombres parecidos; único por nombre |

## Por proveedor

| Acción | Petición |
|---|---|
| Lista | `GET v_pendientes_por_proveedor?order=pendientes.desc` |
| Detalle | `GET v_agregados?proveedor_id=eq.N&eliminado=eq.false&estatus=eq.PENDIENTE&order=fecha_solicitud.asc` |
| Marcar / quitar | `POST rpc/marcar_solicitado` `{p_ids, p_valor}` |
| Excel concentrado | Sin petición: se arma en el navegador con los datos del detalle |

## Catálogos y correos

| Acción | Petición | Quién |
|---|---|---|
| Alta / renombrar / activar | `POST` / `PATCH <catálogo>` | Normal y administrador |
| Destinatarios | `GET`, `POST`, `PATCH`, `DELETE destinatarios_alerta` | Solo administrador |
| Respaldo ahora | `GET v_agregados` (todo, en bloques) + catálogos | Solo administrador (la pestaña) |

## Automatizaciones (GitHub Actions)

| Script | Lee | Envía |
|---|---|---|
| `alerta.mjs` | `v_pendientes_vencidos`; `v_agregados` (EN TIEMPO, sin cargar); destinatarios con `recibe_alerta` | Correo "Vencidas" con Excel y correo "Por vencer" |
| `respaldo.mjs` | `v_agregados` (todo), catálogos y conteo de `agregados` | Excel a Storage (`respaldos/<año>/`) y por correo a quienes tienen `recibe_respaldo` |

## Reglas de negocio, en un solo lugar

| Regla | Valor |
|---|---|
| Plazo para cargar | 4 días **naturales** desde la solicitud |
| Estatus operaciones | COMPLETADO (cargado) · EN TIEMPO (≤ 4 días) · CAMBIO DE ESTATUS OPERACIONES (> 4) |
| Zona horaria | America/Mexico_City |
| Registros por consulta | Máximo 1,000 por petición (se piden en bloques) |
| Folios | Siempre texto |
