# Automatizaciones (ejemplo)

Scripts que en producción corren con GitHub Actions:

| Archivo | Qué hace | Horario en producción (México) |
|---|---|---|
| `scripts/alerta.mjs` | Correo "Vencidas" (más de 4 días, con Excel adjunto) y correo "Por vencer" | Lunes a viernes, 9:00 |
| `scripts/respaldo.mjs` | Excel completo a Supabase Storage y por correo | Viernes, 17:00 |
| `scripts/comun.mjs` | Conexión con la llave de servicio, envío SMTP y plantilla de correo | — |

Los `.yml` de `workflows-ejemplo/` **no se ejecutan** en este repositorio. Para usarlos, sigue [docs/06](../docs/06-despliegue-y-mantenimiento.md#automatizaciones-opcional).

Necesitan los secretos `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` y la variable `APP_URL`. Nunca escribas sus valores en el código.

En este repositorio no tienen prueba automática: se probaron durante el desarrollo con un servidor de correo de prueba.
