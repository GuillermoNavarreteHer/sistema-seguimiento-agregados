# 06 · Despliegue y mantenimiento

Autor: Guillermo Navarrete · [@GuillermoNavarreteHer](https://github.com/GuillermoNavarreteHer)

## Opción A: solo la demo (GitHub Pages)

No necesita base de datos ni llaves.

1. Sube el repositorio a GitHub.
2. **Settings → Pages → Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Abre la dirección que te da GitHub: arranca sola en modo demo.

## Opción B: con tu propio Supabase

1. Crea un proyecto en Supabase.
2. En el **SQL Editor**, corre en orden `sql/01_esquema.sql`, `02`, `03` y `04`. Si quieres datos de ejemplo, corre también `05_datos_demo.sql`.
3. Crea los usuarios en **Authentication → Users → Add user** (con *Auto Confirm User*) y desactiva el registro público (*Allow new users to sign up*).
4. Asigna roles en el SQL Editor (correos en minúsculas, iguales a los de Authentication):
   ```sql
   INSERT INTO administradores (email) VALUES ('admin@ejemplo.com');
   INSERT INTO usuarios_vista  (email) VALUES ('vista@ejemplo.com');
   ```
   Quien no esté en ninguna de las dos tablas es usuario normal.
5. Copia `config.local.EJEMPLO.js` como **`config.local.js`** y pega tu Project URL y tu llave **anon**. Ese archivo está en `.gitignore`: **no lo subas**. Para publicarlo en un servidor propio, súbelo solo a ese servidor.
6. Abre la página: si `config.local.js` es válido, usa tu Supabase. Agrega `?demo` a la dirección para forzar el modo demo.

## Automatizaciones (opcional)

Están en [`automatizaciones/`](../automatizaciones). Los workflows de ejemplo **no se ejecutan** en este repositorio, porque no están en `.github/workflows`. Para usarlos en tu copia:

1. Crea la carpeta `.github/workflows/` y copia ahí los `.yml` de `automatizaciones/workflows-ejemplo/`. Ya apuntan a `automatizaciones/scripts`.
2. En **Settings → Secrets and variables → Actions**, crea los secretos `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`, y la variable `APP_URL`.
3. La llave **service_role** salta la seguridad RLS: va **solo** en los secretos, nunca en el código.

## Versionado

Se usa [versionado semántico](https://semver.org/lang/es/) y el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Ver [CHANGELOG.md](../CHANGELOG.md).

- **MAYOR:** cambia la base de datos de forma incompatible.
- **MENOR:** función nueva.
- **PARCHE:** corrección.

Cada versión publicada lleva su etiqueta (por ejemplo `v1.6.1`) y su *release* en GitHub.

## Construcción del portafolio

Este repositorio se **deriva** del código de producción con `herramientas/construir-portafolio.mjs`. Ese script:

- Copia el código de producción.
- Aplica solo los cambios necesarios: modo demo, `config.local.js` y encabezados.
- **Falla** si reaparece una palabra de la lista privada `herramientas/prohibidos.local.txt`, una llave, una URL real de Supabase o un correo fuera de la lista permitida. Revisa también dentro de los Excel.

Las listas `*.local.txt` nunca se suben (`.gitignore`). Para revisar cualquier carpeta: `node herramientas/construir-portafolio.mjs --revisar <carpeta> --lista <ruta de tu lista privada>`. Sin `--lista` hace una revisión parcial (llaves, URLs y correos).

## Mantenimiento

| Situación | Qué hacer |
|---|---|
| Cambio de año | Nada: "Año surtido" toma el año nuevo y conserva los anteriores |
| GitHub pausa las tareas programadas (60 días sin cambios) | Actions → la tarea → **Enable workflow** |
| Supabase pausa el proyecto (plan gratuito) | Panel de Supabase → **Restore** |
| Cambia la contraseña del correo que envía | Actualizar el secreto `SMTP_PASS` |
| Se filtró la llave service_role | Regenerarla en Supabase y actualizar el secreto |
| Regenerar datos y ejemplos de la demo | `node herramientas/generar-sql-demo.mjs > sql/05_datos_demo.sql` y `node herramientas/generar-ejemplos.mjs` |

## Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| 404 "There isn't a GitHub Pages site here" | Pages inactivo o publicando | Settings → Pages; esperar la palomita verde en Actions |
| La página abre sin estilos | Caché del navegador | Ctrl + Shift + R |
| Siempre entra en modo demo | Falta `config.local.js` o trae los valores de ejemplo | Revisar el paso 5 de la opción B |
| "Correo o contraseña incorrectos" | Usuario no creado o no confirmado | Authentication → Users |
| "Tu usuario no tiene permiso" | Rol vista intentando editar | Comportamiento esperado |
| En la consola: 404 de `config.local.js` | En la demo no existe | Esperado; no afecta |
| Actions: "Falta la variable X" | Secreto no creado | Crearlo con ese nombre exacto |
| Actions: "535 Authentication unsuccessful" | La cuenta SMTP no permite enviar | Revisar la contraseña; en Microsoft 365, activar SMTP AUTH |
