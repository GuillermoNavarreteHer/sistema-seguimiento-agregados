# CLAUDE.md — contexto para asistentes de IA y colaboradores

Sistema web de seguimiento de servicios agregados. Autor: Guillermo Navarrete (@GuillermoNavarreteHer). Español de México en código, comentarios, interfaz y documentación.

## Stack

- HTML, CSS y JavaScript **sin frameworks ni compilación**. Se publica arrastrando archivos a GitHub Pages.
- Supabase (PostgreSQL, RLS, triggers, vistas) mediante `vendor/supabase-2.45.4.js`. SheetJS 0.18.5 para Excel.
- Modo demo: `js/demo/` (generador determinista + servidor simulado que recibe el `fetch` de supabase-js).
- Pruebas: `node --test`, Playwright 1.63.0, PostgreSQL local con `psql`.

## Reglas que no deben romperse

1. **Ninguna llave, contraseña, URL real ni dato real en el código.** La conexión va en `config.local.js` (ignorado por git). La llave `service_role` va solo en los secretos de GitHub Actions.
2. **Toda regla de negocio existe en tres lugares:** SQL (`sql/`), `js/app.js` y `js/demo/servidor-demo.js`. Si cambias una, cambia las tres y corre las pruebas.
3. **Nada se borra:** las bajas son `eliminado = true` con motivo. El trigger `fn_bloquear_delete` lo garantiza.
4. **Fecha de carga ⇒ CARGADO.** Lo hace el trigger; la página solo lo refleja.
5. **Folios (NUR, contrarrecibo) siempre como texto**, también en Excel.
6. **Plazo: 4 días naturales, hora de México** (`America/Mexico_City`).
7. **Los datos de la demo deben ser deterministas.** Si cambias `datos-demo.js`, actualiza la huella en `pruebas/unitarias/demo.test.mjs` y regenera `sql/05_datos_demo.sql` y `docs/ejemplos/`.
8. **Antes de publicar:** `npm test`, `npm run test:e2e`, `npm run revisar` y `npm run revisar:docs` sin errores.

## Trampas conocidas

- **Clics perdidos por corrimientos de pantalla.** Si al perder el foco un campo agrega o quita un texto (validación, "Buscando…"), lo que está debajo se mueve. El clic se suelta fuera del botón y se pierde. Ya se corrigió tres veces (nota del contrarrecibo vacío, rojo de campos vacíos al pasar y búsqueda repetida del CPT). No agregues mensajes que aparezcan al hacer *blur*.
- **`supabase-js` arma las consultas con `URLSearchParams`.** El servidor demo debe leer `url.searchParams`, no la cadena cruda: el `%` de los `ilike` va codificado.
- **La paginación usa `offset` y `limit`** (no el encabezado `Range`), y el conteo usa `Prefer: count=exact` → `content-range`.
- **`"type": "module"` en `package.json`:** en Node, los archivos de `js/` y `js/demo/` publican sus funciones en `globalThis` (`DatosDemo`, `DemoServidor`, `ExcelRespaldo`). Cárgalos y léelos de ahí, no por `require`.
- **`psql` no sustituye variables dentro de `DO $$…$$`.** Guarda los valores en una tabla temporal.
- **Las funciones SECURITY DEFINER usan `SET search_path FROM CURRENT`**, para fijar la ruta y a la vez poder probarse en otro esquema.
- **GitHub, al subir arrastrando, puede ignorar carpetas que empiezan con punto** (como `.github`). En este repositorio los workflows están a propósito en `automatizaciones/workflows-ejemplo/`.
- **SheetJS no guarda la fecha del día** en el archivo: con los mismos datos salen los mismos bytes.
- **La demo pide `config.local.js` y recibe 404:** es lo esperado, así sabe que debe arrancar en modo demo.
- **Las listas privadas `herramientas/*.local.txt` nunca se suben.** Si el escáner marca una palabra genérica como prohibida, quítala de la lista; no desactives el escáner.
