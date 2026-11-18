# 05 · Pruebas

Autor: Guillermo Navarrete · [@GuillermoNavarreteHer](https://github.com/GuillermoNavarreteHer)

## Resumen

| Suite | Comando | Comprobaciones | Resultado de la última corrida |
|---|---|---|---|
| Unitarias (generador, servidor demo, revisión de seguridad) | `npm test` | 11 | 11 de 11 ✅ |
| Extremo a extremo (navegador real, 3 roles, móvil) | `npm run test:e2e` | 20 pasos | 20 de 20 ✅ |
| Base de datos (PostgreSQL local) | `node pruebas/sql/probar-sql.mjs "<conexión>"` | 21 | 21 de 21 ✅ |
| Revisión de seguridad de la carpeta | `npm run revisar` | Todo el repositorio, incluidos los Excel | Sin hallazgos ✅ |
| Documentación (enlaces, imágenes, tablas, Mermaid) | `npm run revisar:docs` | Todos los `.md` | Sin errores ✅ |

Requisitos: Node.js 20 o superior, `npm install`, `npx playwright install chromium` y, para la prueba de SQL, `psql`.

## Pruebas automáticas

### Unitarias (`pruebas/unitarias/demo.test.mjs`)

- **Generador:** misma semilla y fecha → mismos bytes (huella SHA-256 fija); datos con forma ficticia (folios `900…`, códigos `DEMO-…`); casos especiales presentes.
- **Servidor demo:** rechazo sin sesión y con contraseña incorrecta; filtros, `or`/`ilike`, orden, paginación y conteo; trigger de fecha de carga ⇒ CARGADO; historial; restricciones (fechas, blancos, baja con motivo, sin borrar); roles (vista no escribe, destinatarios solo para administrador, `marcar_solicitado`); catálogos sin duplicados; respuesta de un objeto; solo responde a su dirección simulada.
- **Revisión de seguridad:** detecta palabras prohibidas por palabra completa, llaves con forma de JWT y correos no permitidos, **también dentro de archivos Excel**; y rechaza `config.local.js`.

### Extremo a extremo (`pruebas/e2e/demo-completa.mjs`)

Abre la aplicación real en Chromium contra el servidor simulado. Los 20 pasos están en la tabla de contraste de abajo. Dos de ellos son de control:

- **Aislamiento de red:** registra **todas** las peticiones del navegador y falla si alguna sale de la propia página. Además verifica que la librería de Supabase solo habló con la dirección simulada.
- **Sin errores de JavaScript** en toda la corrida.

El único aviso esperado en la consola es el 404 de `config.local.js`: la página lo busca y, al no encontrarlo, arranca en modo demo.

### Base de datos (`pruebas/sql/probar-sql.mjs`)

Todo ocurre dentro de **una transacción que al final se deshace**, en un **esquema aparte** (`prueba_portafolio`). La prueba imita lo mínimo de Supabase (roles `anon` y `authenticated`, y `auth.jwt()`), corre `sql/01` a `05` **dos veces** y verifica:

- Que se pueden repetir sin duplicar.
- Que nada se crea en `public` y que la base queda igual después del `ROLLBACK`.
- Los triggers.
- RLS en todas las tablas y los permisos de los cuatro perfiles (sin sesión, normal, vista y administrador).
- Las restricciones.
- La función `marcar_solicitado`.

**Lo que una base local no puede probar:** la API REST real de Supabase (PostgREST), su inicio de sesión, Storage y los correos. La API la cubre el servidor simulado, que replica las mismas reglas. El resto se revisa con los casos manuales.

## Lo que se probó durante el desarrollo (fuera de este repositorio)

En el proyecto original se hicieron estas pruebas con scripts temporales que **no forman parte de este repositorio**:

- Migración de la hoja original con **0 diferencias** fila por fila contra el Excel.
- Pruebas de permisos contra PostgREST local.
- Envío de alertas y respaldos a un servidor de correo de prueba.
- Recorridos en navegador de cada función entregada.

Las suites de arriba se escribieron para este portafolio y sí se pueden repetir.

**Error encontrado y corregido al escribirlas (v1.6.1):** en "Nuevo agregado", si el CPT tenía un error y conservaba el cursor, al dar clic en un botón de abajo se volvía a buscar el mismo código. Eso movía la pantalla y el clic se perdía. La prueba "copiar para correo" lo reproduce y ahora pasa.

## Contraste: manual de usuario ↔ demo

Cada afirmación del [manual de usuario](04-manual-de-usuario.md) contra lo que la demo hace en realidad.

| M# | Afirmación del manual | Cómo se verificó | Resultado |
|---|---|---|---|
| M1 | Tres botones de acceso; contraseña `demo1234` | e2e: "arranca sola en modo demo…" | ✅ |
| M2 | En un sistema real se entra con correo y contraseña | No se puede en la demo (no hay Supabase real) | Caso manual C1 |
| M3 | Una pestaña sin permiso regresa a la propia | e2e: "usuario de captura… #correos lo regresa" y "usuario de vista… #nuevo" | ✅ |
| M4 | Semáforo: total = completados + en tiempo + por actualizar | e2e: "administrador… los indicadores cuadran" | ✅ |
| M5 | Clic en un indicador filtra; otro clic quita el filtro | e2e: filtra y lo quita (el quitar no se verifica) | ✅ / C2 |
| M6 | Busca por folio, código, descripción, contrarrecibo, proveedor o notas | e2e: código y folio; resto en caso manual | ✅ / C3 |
| M7 | Más filtros y orden por columna | Caso manual | C4 |
| M8 | Fecha de carga propone hoy y deja Cargado / Completado | e2e: "fecha de carga → CARGADO…" | ✅ |
| M9 | Historial con alta, cambios y correo | e2e: mismo paso | ✅ |
| M10 | Baja con motivo obligatorio; Mostrar bajas; reactivar | e2e: mismo paso | ✅ |
| M11 | Copiar para correo como tabla | e2e: "copiar para correo…" (texto en el portapapeles); pegado en Outlook: caso manual | ✅ / C5 |
| M12 | Exportar descarga lo filtrado | e2e: "exportar a Excel…" (archivo); contenido filtrado: caso manual | ✅ / C6 |
| M13 | Listas con buscador y Enter | e2e: "nuevo agregado…" | ✅ |
| M14 | El CPT llena tipo y descripción bloqueados | e2e: mismo paso | ✅ |
| M15 | Dos opciones → elegir | e2e: "CPT con dos opciones…" | ✅ |
| M16 | Tipo inexistente se da de alta solo | e2e: mismo paso | ✅ |
| M17 | Código deshabilitado o inexistente no deja guardar | e2e: "CPT deshabilitado o inexistente…" | ✅ |
| M18 | Aviso "Agregado guardado" y "Capturados en esta sesión" | e2e: "nuevo agregado…" | ✅ |
| M19 | Fecha escrita (5/3/26) o calendario; no acepta futuras | e2e: "fechas…" (calendario: caso manual) | ✅ / C7 |
| M20 | Lista de proveedores con pendientes, rojos y azules | e2e: usa la lista; colores en caso manual | ✅ / C8 |
| M21 | Excel concentrado | e2e: "usuario de vista…" | ✅ |
| M22 | Al descargar ofrece marcar todos como solicitados | e2e: mismo paso (todos quedan solicitados) | ✅ |
| M23 | El rol vista solo tiene esa pantalla | e2e: mismo paso | ✅ |
| M24 | Catálogos: alta, aviso de parecidos; renombrar y desactivar | e2e: "catálogos…" (alta y aviso); renombrar y desactivar: caso manual | ✅ / C9 |
| M25 | Correos y respaldo: destinatarios y "Descargar respaldo ahora" | e2e: dos pasos de correos y respaldo | ✅ |
| M26 | Modo claro / oscuro | e2e: "modo claro…" | ✅ |
| M27 | Celular sin desborde | e2e: "móvil…" | ✅ |
| M28 | En la demo los cambios se pierden al recargar | e2e: "demo: al recargar…" | ✅ |

## Casos manuales

Marca el resultado al probar.

| # | Caso | Pasos | Resultado esperado | Resultado |
|---|---|---|---|---|
| C1 | Inicio de sesión real | Con `config.local.js` y un usuario creado en Supabase, entrar | Entra y ve las pestañas de su rol | ☐ Pasó ☐ Falló |
| C2 | Quitar filtro del semáforo | Clic en "Requieren actualización" y otra vez | La tabla vuelve a mostrar todo | ☐ Pasó ☐ Falló |
| C3 | Búsqueda por otros campos | Buscar una palabra de la descripción, un contrarrecibo y un proveedor | Aparecen los registros que la contienen | ☐ Pasó ☐ Falló |
| C4 | Más filtros y orden | Abrir Más filtros, elegir solicitante; clic en el título "NUR" | Filtra; ordena ↑ y luego ↓ | ☐ Pasó ☐ Falló |
| C5 | Pegar en Outlook y Excel | Copiar 3 renglones; pegar en un correo y en Excel | Tabla con bordes; en Excel, cada dato en su celda y el folio como texto | ☐ Pasó ☐ Falló |
| C6 | Exportar lo filtrado | Filtrar por un proveedor y exportar | El Excel trae solo ese proveedor | ☐ Pasó ☐ Falló |
| C7 | Calendario | Abrir el calendario y elegir un día | La fecha aparece en dd/mm/aaaa; los días futuros no se pueden elegir | ☐ Pasó ☐ Falló |
| C8 | Colores en Por proveedor | Ver la lista | Rojo = más de 4 días; azul = solicitados | ☐ Pasó ☐ Falló |
| C9 | Renombrar y desactivar en catálogos | Lápiz → nuevo nombre; apagar el interruptor | El nombre cambia en los registros; deja de aparecer en las listas | ☐ Pasó ☐ Falló |
| C10 | Folio repetido | Capturar un NUR que ya existe | Avisa y pide confirmar (no bloquea) | ☐ Pasó ☐ Falló |
| C11 | Alerta diaria real | Con secretos configurados: Actions → Run workflow | Llegan "Vencidas" y "Por vencer" a quienes tienen Alerta | ☐ Pasó ☐ Falló |
| C12 | Respaldo real | Actions → Respaldo → Run workflow | Llega el Excel y queda en Storage | ☐ Pasó ☐ Falló |
