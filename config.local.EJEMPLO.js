/*
  Configuración propia (conexión a TU proyecto de Supabase)
  ---------------------------------------------------------
  1. Copia este archivo como "config.local.js" en la misma carpeta.
     Ese nombre está en .gitignore: NUNCA se sube al repositorio.
  2. Pega los datos de Supabase → Project Settings → API:
       • Project URL (sin /rest/v1/ al final)
       • Llave anon / publishable (pública por diseño; la seguridad la dan
         el inicio de sesión y las reglas RLS de sql/)
  3. NUNCA pongas aquí la llave service_role / secret.
  Si config.local.js no existe, la página arranca sola en MODO DEMO.
*/
window.APP_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'PEGA_AQUI_LA_ANON_KEY'
};
