/*
  ============================================================================
  MODO DEMO — Avisos y accesos rápidos en pantalla
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  ----------------------------------------------------------------------------
  Solo se activa si app.js arrancó en modo demo (window.MODO_DEMO).
  Agrega: un aviso de "datos ficticios" en el inicio de sesión con botones
  para entrar con cada rol, una etiqueta DEMO en la barra superior y un
  recordatorio de que los cambios se pierden al recargar.
  No modifica ninguna regla de la aplicación.
  ============================================================================
*/
(function () {
  'use strict';
  if (!window.MODO_DEMO) return;

  var ROLES = [
    { email: 'admin@demo.local', titulo: 'Administrador', detalle: 'todo, incluido Correos y respaldo' },
    { email: 'captura@demo.local', titulo: 'Captura', detalle: 'consulta, alta, edición y bajas' },
    { email: 'vista@demo.local', titulo: 'Proveedores (vista)', detalle: 'solo pendientes por proveedor' }
  ];

  var st = document.createElement('style');
  st.textContent =
    '.demo-aviso{margin:-6px 0 18px;padding:12px 14px;border-radius:12px;background:var(--accent-soft);color:var(--accent-ink);font-size:13px}' +
    '.demo-aviso b{display:block;margin-bottom:2px}' +
    '.demo-roles{display:grid;gap:8px;margin-top:10px}' +
    '.demo-roles button{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:9px 12px;border-radius:10px;border:1px solid var(--accent-hi);background:var(--field-bg);color:var(--page-fg);text-align:left;font-size:13px;font-weight:650}' +
    '.demo-roles button span{font-size:11.5px;font-weight:500;color:var(--muted)}' +
    '.demo-roles button:hover{background:var(--accent);color:#fff}.demo-roles button:hover span{color:#ede9fe}' +
    '.demo-etiqueta{display:inline-block;margin-left:8px;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.06em;background:#f59e0b;color:#111827;vertical-align:2px}' +
    '.demo-pie{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:90;padding:6px 10px;border-radius:99px;font-size:11.5px;font-weight:600;background:var(--card-solid);border:1px solid var(--line-strong);color:var(--muted);box-shadow:var(--card-shadow)}';
  document.head.appendChild(st);

  function entrarComo(email) {
    var f = document.getElementById('login-form');
    document.getElementById('login-email').value = email;
    document.getElementById('login-pass').value = 'demo1234';
    if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  var form = document.getElementById('login-form');
  if (form) {
    var aviso = document.createElement('div');
    aviso.className = 'demo-aviso';
    aviso.setAttribute('role', 'note');
    aviso.innerHTML = '<b>Demo con datos ficticios</b>Ningún nombre, código ni cifra es real. Entra con un rol (contraseña de todos: demo1234):' +
      '<div class="demo-roles">' + ROLES.map(function (r) {
        return '<button type="button" data-demo-email="' + r.email + '">Entrar como ' + r.titulo + '<span>' + r.email + ' · ' + r.detalle + '</span></button>';
      }).join('') + '</div>';
    form.parentNode.insertBefore(aviso, form);
    aviso.addEventListener('click', function (e) {
      var b = e.target.closest('[data-demo-email]');
      if (b) entrarComo(b.getAttribute('data-demo-email'));
    });
  }

  var marca = document.querySelector('#app .brand-title');
  if (marca) marca.insertAdjacentHTML('beforeend', '<span class="demo-etiqueta" title="Datos ficticios">DEMO</span>');

  var pie = document.createElement('div');
  pie.className = 'demo-pie';
  pie.textContent = 'Modo demo · datos ficticios · los cambios se pierden al recargar';
  document.body.appendChild(pie);
})();
