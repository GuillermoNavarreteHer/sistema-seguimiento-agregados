# Changelog

Todos los cambios importantes de este proyecto. Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · [Versionado semántico](https://semver.org/lang/es/).
Las versiones 1.0.0 a 1.6.0 se desarrollaron en producción; solo se registró el mes de publicación.

## [Sin publicar]

## [1.6.1] - 2026-11
### Corregido
- Nuevo agregado: con un CPT con error y el cursor dentro, al dar clic en un botón de abajo (por ejemplo "Copiar tabla para correo") se volvía a buscar el mismo código. La pantalla se movía y el clic se perdía. Ahora no se repite la búsqueda de un código que no cambió.
### Agregado (versión de portafolio)
- Modo demo con datos ficticios: la misma aplicación contra un servidor simulado dentro del navegador. Se activa sin `config.local.js` o con `?demo`.
- Generador determinista de datos ficticios, `sql/` genérico y repetible, y archivos de ejemplo.
- Pruebas: unitarias (11), extremo a extremo (20 pasos) y SQL en PostgreSQL local (21 comprobaciones).
- Script de construcción con revisión de seguridad (palabras prohibidas, llaves y correos, también dentro de los Excel).
- Documentación en `docs/` y capturas.
### Cambiado (versión de portafolio)
- La conexión se lee de `config.local.js` (ignorado por git) en lugar de `config.js`.
- Los workflows pasan a `automatizaciones/workflows-ejemplo/` y no se ejecutan en este repositorio.

## [1.6.0] - 2026-11
### Cambiado
- Proyecto entregado a la cuenta del área usuaria; nueva dirección de publicación.

## [1.5.0] - 2026-11
### Agregado
- CPT automático: tipo de servicio y descripción se llenan desde el catálogo de procedimientos y quedan bloqueados.

## [1.4.0] - 2026-11
### Agregado
- Rol de vista, pantalla "Por proveedor", Excel concentrado y estatus "Solicitado al proveedor".

## [1.3.0] - 2026-11
### Cambiado
- "Correos y respaldo" solo para administradores (protegido también en la base).

## [1.2.0] - 2026-11
### Agregado
- Correo diario "Por vencer", además del de vencidas.

## [1.1.0] - 2026-11
### Agregado
- Copiar para correo: por renglón, por selección y lista de capturados en la sesión.

## [1.0.0] - 2026-10
### Agregado
- Migración de la hoja original a Supabase con 0 diferencias verificadas.
- Consulta con semáforo, alta validada, edición, bajas reversibles, catálogos, historial, alerta diaria y respaldo semanal.
