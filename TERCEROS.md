# Software de terceros

| Componente | Versión | Licencia | Dónde | Uso |
|---|---|---|---|---|
| [supabase-js](https://github.com/supabase/supabase-js) | 2.45.4 | MIT | `vendor/supabase-2.45.4.js` | Cliente de Supabase (sesión y API REST) |
| [SheetJS Community Edition](https://sheetjs.com/) | 0.18.5 | Apache-2.0 | `vendor/xlsx-0.18.5.full.min.js` | Generar archivos Excel |
| [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) | Variable | SIL Open Font License 1.1 | `css/fonts.css` | Tipografía |
| [Playwright](https://playwright.dev/) | 1.63.0 | Apache-2.0 | `devDependencies` | Pruebas de extremo a extremo y capturas |
| [Mermaid](https://mermaid.js.org/) | 11.4.1 | MIT | `devDependencies` | Validar los diagramas de la documentación |
| [nodemailer](https://nodemailer.com/) | 6.9.16 | MIT-0 | `automatizaciones/scripts` | Envío de correo de las automatizaciones |

Nota de seguridad: SheetJS 0.18.5 tiene vulnerabilidades conocidas **al leer** archivos. Este sistema solo **escribe** Excel; nunca abre archivos del usuario. Ver la deuda técnica en `docs/01-manual-tecnico.md`.
