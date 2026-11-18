/*
  ============================================================================
  MODO DEMO — Servidor simulado de Supabase (corre dentro del navegador)
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  ----------------------------------------------------------------------------
  La aplicación es LA MISMA que en producción. Lo único que cambia en modo
  demo es la función `fetch` que le paso a la librería de Supabase: en lugar
  de salir a internet, cada petición llega aquí y la respondo con datos
  ficticios guardados en memoria.

  Emulo solo lo que la aplicación usa:
    • Auth:  POST /auth/v1/token (password y refresh_token), GET /auth/v1/user,
             POST /auth/v1/logout
    • REST:  GET/HEAD con filtros eq, neq, gt, gte, lt, lte, ilike, like, in, is,
             or=(…), order=col.asc|desc.nullsfirst|nullslast, offset, limit,
             Prefer: count=exact, respuesta de un objeto (single)
             POST (alta), PATCH (cambio), DELETE (baja), POST /rpc/<función>
  Y repito las reglas de la base real (ver sql/):
    • Roles: admin, normal y vista (equivalen a las tablas administradores
      y usuarios_vista y a las políticas RLS).
    • Trigger: con fecha de carga el estatus pasa a CARGADO; limpieza de
      espacios; historial de cada alta, cambio y baja.
    • Restricciones: fecha de carga ≥ solicitud, sin blancos en registros
      nuevos, baja con motivo, nombres únicos en catálogos, sin DELETE.
  Los datos viven en memoria: al recargar la página la demo vuelve a empezar.
  ============================================================================
*/
(function (root) {
  'use strict';

  var TZ = 'America/Mexico_City';
  var URL_DEMO = 'https://demo.invalid';
  var LLAVE_DEMO = 'llave-publica-de-demo';

  function hoyMexico() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function diasEntre(a, b) {
    var x = a.split('-'), y = b.split('-');
    return Math.round((Date.UTC(+y[0], y[1] - 1, +y[2]) - Date.UTC(+x[0], x[1] - 1, +x[2])) / 86400000);
  }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function limpiar(s) { return String(s == null ? '' : s).replace(/[\s\u00A0]+/g, ' ').trim(); }
  function b64url(obj) {
    var json = JSON.stringify(obj), bytes = new TextEncoder().encode(json), bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function desdeB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ---------------------------------------------------------------------------
  function crear(opciones) {
    opciones = opciones || {};
    var reloj = opciones.hoy ? function () { return opciones.hoy; } : hoyMexico;
    var datos = root.DatosDemo.generar({ semilla: opciones.semilla, hoy: reloj(), registros: opciones.registros });
    var db = {
      clientes: datos.clientes, proveedores: datos.proveedores, solicitantes: datos.solicitantes,
      tipos_servicio: datos.tipos_servicio, destinatarios_alerta: datos.destinatarios_alerta,
      agregados: datos.agregados, catalogo_procedimientos: datos.catalogo_procedimientos,
      agregados_historial: []
    };
    var usuarios = datos.usuarios;
    var secuencias = {};
    Object.keys(db).forEach(function (t) { secuencias[t] = db[t].reduce(function (m, r) { return Math.max(m, r.id || 0); }, 0); });
    var peticiones = []; // registro de lo que pidió la aplicación (lo usan las pruebas)

    // ------------------------- utilidades HTTP -------------------------
    function respuesta(estado, cuerpo, encabezados) {
      var h = Object.assign({ 'content-type': 'application/json; charset=utf-8' }, encabezados || {});
      var texto = cuerpo == null ? null : JSON.stringify(cuerpo);
      if (estado === 204) texto = null;
      return new Response(texto, { status: estado, headers: h });
    }
    function error(estado, code, message) { return respuesta(estado, { code: code, details: null, hint: null, message: message }); }

    // ------------------------------ Auth ------------------------------
    function sesion(u) {
      var exp = Math.floor(Date.now() / 1000) + 3600;
      var token = b64url({ alg: 'none', typ: 'JWT' }) + '.' + b64url({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: exp, demo: true }) + '.demo';
      return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'demo-refresh-' + u.id, user: usuarioPublico(u) };
    }
    function usuarioPublico(u) {
      return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email' }, user_metadata: { nombre: u.nombre }, created_at: '2026-01-01T00:00:00Z' };
    }
    function quienEs(init) {
      var h = new Headers(init.headers || {});
      var a = (h.get('authorization') || '').replace(/^Bearer\s+/i, '');
      var partes = a.split('.');
      if (partes.length < 2) return null;
      try {
        var p = desdeB64url(partes[1]);
        if (!p.demo || p.exp * 1000 < Date.now()) return null;
        return usuarios.filter(function (u) { return u.id === p.sub; })[0] || null;
      } catch (e) { return null; }
    }
    function auth(ruta, query, init, cuerpo) {
      if (ruta === '/auth/v1/token') {
        var tipo = query.get('grant_type');
        if (tipo === 'password') {
          var u = usuarios.filter(function (x) { return x.email === String(cuerpo.email || '').toLowerCase() && x.password === cuerpo.password; })[0];
          if (!u) return respuesta(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 400, msg: 'Invalid login credentials' });
          return respuesta(200, sesion(u));
        }
        if (tipo === 'refresh_token') {
          var u2 = usuarios.filter(function (x) { return 'demo-refresh-' + x.id === cuerpo.refresh_token; })[0];
          if (!u2) return respuesta(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token', msg: 'Invalid Refresh Token' });
          return respuesta(200, sesion(u2));
        }
      }
      if (ruta === '/auth/v1/user') {
        var yo = quienEs(init);
        return yo ? respuesta(200, usuarioPublico(yo)) : respuesta(401, { code: 401, msg: 'invalid JWT' });
      }
      if (ruta === '/auth/v1/logout') return respuesta(204, null);
      return error(404, 'DEMO404', 'Ruta de autenticación no simulada: ' + ruta);
    }

    // --------------------------- Vistas ---------------------------
    function nombre(tabla, id) { var x = db[tabla].filter(function (r) { return r.id === id; })[0]; return x ? x.nombre : null; }
    function filaVista(a) {
      var hoy = reloj(), dias = diasEntre(a.fecha_solicitud, hoy);
      var ops = a.estatus === 'CARGADO' ? 'COMPLETADO' : (dias <= 4 ? 'EN TIEMPO' : 'CAMBIO DE ESTATUS OPERACIONES');
      return {
        id: a.id, anio_surtido: a.anio_surtido,
        cliente: nombre('clientes', a.cliente_id), proveedor: nombre('proveedores', a.proveedor_id),
        contrarrecibo: a.contrarrecibo, nur: a.nur, cpt: a.cpt, descripcion: a.descripcion,
        tipo_servicio: nombre('tipos_servicio', a.tipo_servicio_id), solicitante: nombre('solicitantes', a.solicitante_id),
        fecha_solicitud: a.fecha_solicitud, fecha_carga: a.fecha_carga, estatus: a.estatus,
        estatus_operaciones: ops, dias_transcurridos: dias, notas: a.notas,
        cliente_id: a.cliente_id, proveedor_id: a.proveedor_id, tipo_servicio_id: a.tipo_servicio_id, solicitante_id: a.solicitante_id,
        origen: a.origen, fila_excel: a.fila_excel, requiere_revision: a.requiere_revision, motivo_revision: a.motivo_revision,
        eliminado: a.eliminado, eliminado_en: a.eliminado_en, eliminado_por: a.eliminado_por, motivo_baja: a.motivo_baja,
        created_at: a.created_at, created_by: a.created_by, updated_at: a.updated_at, updated_by: a.updated_by,
        solicitado_proveedor: a.solicitado_proveedor, solicitado_en: a.solicitado_en, solicitado_por: a.solicitado_por
      };
    }
    function vista(nombreVista) {
      if (nombreVista === 'v_agregados') return db.agregados.map(filaVista);
      if (nombreVista === 'v_pendientes_vencidos') {
        return db.agregados.map(filaVista).filter(function (r) { return !r.eliminado && r.estatus !== 'CARGADO' && r.dias_transcurridos > 4; })
          .sort(function (a, b) { return a.fecha_solicitud < b.fecha_solicitud ? -1 : a.fecha_solicitud > b.fecha_solicitud ? 1 : 0; });
      }
      if (nombreVista === 'v_pendientes_por_proveedor') {
        var g = {};
        db.agregados.map(filaVista).forEach(function (r) {
          if (r.eliminado || r.estatus !== 'PENDIENTE') return;
          var x = g[r.proveedor_id] || (g[r.proveedor_id] = { proveedor_id: r.proveedor_id, proveedor: r.proveedor, pendientes: 0, vencidos: 0, solicitados: 0, mas_antigua: r.fecha_solicitud });
          x.pendientes++;
          if (r.estatus_operaciones === 'CAMBIO DE ESTATUS OPERACIONES') x.vencidos++;
          if (r.solicitado_proveedor) x.solicitados++;
          if (r.fecha_solicitud < x.mas_antigua) x.mas_antigua = r.fecha_solicitud;
        });
        return Object.keys(g).map(function (k) { return g[k]; });
      }
      if (nombreVista === 'v_anios_surtido') {
        var anios = {}; db.agregados.forEach(function (r) { anios[r.anio_surtido] = 1; });
        anios[+reloj().slice(0, 4)] = 1;
        return Object.keys(anios).map(Number).sort(function (a, b) { return b - a; }).map(function (a) { return { anio: a }; });
      }
      return null;
    }

    // ------------------------ Lectura (permisos) ------------------------
    var VISTAS = ['v_agregados', 'v_pendientes_vencidos', 'v_pendientes_por_proveedor', 'v_anios_surtido'];
    var TABLAS = ['clientes', 'proveedores', 'solicitantes', 'tipos_servicio', 'destinatarios_alerta', 'agregados', 'agregados_historial', 'catalogo_procedimientos'];
    function filasLegibles(tabla, yo) {
      if (VISTAS.indexOf(tabla) >= 0) return vista(tabla);
      if (TABLAS.indexOf(tabla) < 0) return null;
      if (tabla === 'destinatarios_alerta' && yo.rol !== 'admin') return []; // RLS: solo administradores
      return copia(db[tabla]);
    }

    // ------------------------- Filtros PostgREST -------------------------
    function convertir(valorFila, texto) {
      if (texto === 'null') return null;
      if (typeof valorFila === 'number') return Number(texto);
      if (typeof valorFila === 'boolean') return texto === 'true';
      return texto;
    }
    function patron(texto) {
      var re = '', i = 0;
      for (; i < texto.length; i++) {
        var c = texto[i];
        if (c === '\\' && i + 1 < texto.length) { re += texto[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
        if (c === '%' || c === '*') re += '.*';
        else if (c === '_') re += '.';
        else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      return re;
    }
    function cumple(fila, col, op, valor) {
      var v = fila[col];
      switch (op) {
        case 'eq': return v === convertir(v, valor) || (v != null && String(v) === valor);
        case 'neq': return !(v === convertir(v, valor) || (v != null && String(v) === valor));
        case 'gt': return v != null && v > convertir(v, valor);
        case 'gte': return v != null && v >= convertir(v, valor);
        case 'lt': return v != null && v < convertir(v, valor);
        case 'lte': return v != null && v <= convertir(v, valor);
        case 'like': return v != null && new RegExp('^' + patron(valor) + '$').test(String(v));
        case 'ilike': return v != null && new RegExp('^' + patron(valor) + '$', 'i').test(String(v));
        case 'in': return valor.replace(/^\(|\)$/g, '').split(',').some(function (x) { return String(v) === x.replace(/^"|"$/g, ''); });
        case 'is': return valor === 'null' ? v == null : valor === 'true' ? v === true : valor === 'false' ? v === false : false;
        default: throw new Error('Operador no simulado: ' + op);
      }
    }
    function separarNivelSuperior(s) {
      var partes = [], nivel = 0, actual = '';
      for (var i = 0; i < s.length; i++) {
        var c = s[i];
        if (c === '(') nivel++; else if (c === ')') nivel--;
        if (c === ',' && nivel === 0) { partes.push(actual); actual = ''; } else actual += c;
      }
      if (actual) partes.push(actual);
      return partes;
    }
    function filtrar(filas, query) {
      var reservados = ['select', 'order', 'offset', 'limit', 'columns', 'on_conflict'];
      query.forEach(function (valor, clave) {
        if (reservados.indexOf(clave) >= 0) return;
        if (clave === 'or') {
          var condiciones = separarNivelSuperior(valor.replace(/^\(|\)$/g, '')).map(function (c) {
            var m = c.match(/^([^.]+)\.([a-z]+)\.(.*)$/);
            if (!m) throw new Error('Condición or no simulada: ' + c);
            return m;
          });
          filas = filas.filter(function (f) { return condiciones.some(function (m) { return cumple(f, m[1], m[2], m[3]); }); });
          return;
        }
        var neg = false, m2 = valor.match(/^(not\.)?([a-z]+)\.(.*)$/);
        if (!m2) throw new Error('Filtro no simulado: ' + clave + '=' + valor);
        neg = !!m2[1];
        filas = filas.filter(function (f) { var r = cumple(f, clave, m2[2], m2[3]); return neg ? !r : r; });
      });
      return filas;
    }
    function ordenar(filas, orden) {
      if (!orden) return filas;
      var reglas = orden.split(',').map(function (o) {
        var p = o.split('.');
        return { col: p[0], desc: p.indexOf('desc') > 0, nullsFirst: p.indexOf('nullsfirst') > 0 ? true : p.indexOf('nullslast') > 0 ? false : p.indexOf('desc') > 0 };
      });
      return filas.slice().sort(function (a, b) {
        for (var i = 0; i < reglas.length; i++) {
          var r = reglas[i], x = a[r.col], y = b[r.col];
          if (x == null && y == null) continue;
          if (x == null) return r.nullsFirst ? -1 : 1;
          if (y == null) return r.nullsFirst ? 1 : -1;
          var c = typeof x === 'string' ? x.localeCompare(y, 'es') : (x < y ? -1 : x > y ? 1 : 0);
          if (c) return r.desc ? -c : c;
        }
        return 0;
      });
    }
    function proyectar(filas, select) {
      if (!select || select === '*') return filas;
      var cols = select.split(',').map(function (c) { return c.trim(); });
      return filas.map(function (f) { var o = {}; cols.forEach(function (c) { o[c] = f[c] === undefined ? null : f[c]; }); return o; });
    }

    // ---------------------- Escritura y reglas de negocio ----------------------
    var CATALOGOS = ['clientes', 'proveedores', 'solicitantes', 'tipos_servicio'];
    function ahora() { return new Date().toISOString(); }
    function historial(id, operacion, antes, despues, yo) {
      db.agregados_historial.push({ id: ++secuencias.agregados_historial, agregado_id: id, operacion: operacion, datos_antes: antes ? copia(antes) : null, datos_despues: despues ? copia(despues) : null, usuario: yo.email, fecha: ahora() });
    }
    // Equivale a fn_agregados_before_write + las restricciones CHECK de la tabla
    function antesDeEscribir(nuevo, viejo, yo) {
      nuevo.contrarrecibo = limpiar(nuevo.contrarrecibo) || null;
      nuevo.nur = String(nuevo.nur == null ? '' : nuevo.nur).replace(/[\s\u00A0]+/g, '');
      nuevo.cpt = limpiar(nuevo.cpt); nuevo.descripcion = limpiar(nuevo.descripcion);
      nuevo.notas = limpiar(nuevo.notas) || null;
      if (nuevo.fecha_carga) nuevo.estatus = 'CARGADO';
      else if (viejo && viejo.fecha_carga && !nuevo.fecha_carga && nuevo.estatus === 'CARGADO') nuevo.estatus = 'PENDIENTE';
      if (nuevo.eliminado && !nuevo.eliminado_en) { nuevo.eliminado_en = ahora(); nuevo.eliminado_por = nuevo.eliminado_por || yo.email; }
      if (viejo) {
        nuevo.updated_at = ahora(); nuevo.updated_by = yo.email;
        nuevo.origen = viejo.origen; nuevo.fila_excel = viejo.fila_excel; nuevo.created_at = viejo.created_at; nuevo.created_by = viejo.created_by;
      }
      if (['PENDIENTE', 'CARGADO', 'ACLARACIÓN SERVICIO NO BRINDADO'].indexOf(nuevo.estatus) < 0) return 'new row for relation "agregados" violates check constraint "agregados_estatus_check"';
      if (nuevo.fecha_carga && nuevo.fecha_carga < nuevo.fecha_solicitud) return 'new row for relation "agregados" violates check constraint "chk_fecha_carga_posterior"';
      if (nuevo.origen !== 'EXCEL_2026' && (!nuevo.contrarrecibo || !nuevo.nur || !nuevo.cpt || !nuevo.descripcion)) return 'new row for relation "agregados" violates check constraint "chk_sin_blancos_registros_nuevos"';
      if (nuevo.eliminado && !limpiar(nuevo.motivo_baja)) return 'new row for relation "agregados" violates check constraint "chk_baja_completa"';
      var requeridos = ['cliente_id', 'proveedor_id', 'tipo_servicio_id', 'solicitante_id', 'fecha_solicitud'];
      for (var i = 0; i < requeridos.length; i++) if (nuevo[requeridos[i]] == null) return 'null value in column "' + requeridos[i] + '" violates not-null constraint';
      return null;
    }
    function puedeEscribir(tabla, yo) {
      if (tabla === 'destinatarios_alerta') return yo.rol === 'admin';
      if (tabla === 'agregados' || CATALOGOS.indexOf(tabla) >= 0) return yo.rol !== 'vista';
      return false;
    }

    function insertar(tabla, cuerpo, yo) {
      if (!puedeEscribir(tabla, yo)) return { err: [403, '42501', 'new row violates row-level security policy for table "' + tabla + '"'] };
      var lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo], creadas = [];
      for (var i = 0; i < lista.length; i++) {
        var f = copia(lista[i]);
        if (CATALOGOS.indexOf(tabla) >= 0) {
          f.nombre = limpiar(f.nombre);
          if (!f.nombre) return { err: [400, '23514', 'violates check constraint "' + tabla + '_nombre_check"'] };
          if (db[tabla].some(function (x) { return x.nombre === f.nombre; })) return { err: [409, '23505', 'duplicate key value violates unique constraint "' + tabla + '_nombre_key"'] };
          f = Object.assign({ activo: true, created_at: ahora() }, f);
        } else if (tabla === 'destinatarios_alerta') {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(f.email || '')) return { err: [400, '23514', 'violates check constraint "destinatarios_alerta_email_check"'] };
          if (db[tabla].some(function (x) { return x.email === f.email; })) return { err: [409, '23505', 'duplicate key value violates unique constraint "destinatarios_alerta_email_key"'] };
          f = Object.assign({ activo: true, recibe_alerta: true, recibe_respaldo: true, created_at: ahora() }, f);
        } else if (tabla === 'agregados') {
          f = Object.assign({
            contrarrecibo: null, fecha_carga: null, estatus: 'PENDIENTE', notas: null, anio_surtido: +reloj().slice(0, 4),
            origen: 'SISTEMA', fila_excel: null, requiere_revision: false, motivo_revision: null,
            eliminado: false, eliminado_en: null, eliminado_por: null, motivo_baja: null,
            solicitado_proveedor: false, solicitado_en: null, solicitado_por: null,
            created_at: ahora(), created_by: yo.email, updated_at: ahora(), updated_by: yo.email
          }, f);
          if (f.origen !== 'SISTEMA') return { err: [403, '42501', 'new row violates row-level security policy for table "agregados"'] };
          var e = antesDeEscribir(f, null, yo);
          if (e) return { err: [400, '23514', e] };
        }
        f.id = ++secuencias[tabla];
        db[tabla].push(f); creadas.push(f);
        if (tabla === 'agregados') historial(f.id, 'INSERT', null, f, yo);
      }
      return { filas: copia(creadas) };
    }

    function actualizar(tabla, query, cambios, yo) {
      var objetivo = filtrar(db[tabla].slice(), query);
      if (!puedeEscribir(tabla, yo)) return { filas: [] }; // como RLS: USING falso → 0 filas
      var hechas = [];
      for (var i = 0; i < objetivo.length; i++) {
        var viejo = objetivo[i], nuevo = Object.assign(copia(viejo), copia(cambios));
        if (CATALOGOS.indexOf(tabla) >= 0 && cambios.nombre != null) {
          nuevo.nombre = limpiar(nuevo.nombre);
          if (db[tabla].some(function (x) { return x.id !== viejo.id && x.nombre === nuevo.nombre; })) return { err: [409, '23505', 'duplicate key value violates unique constraint "' + tabla + '_nombre_key"'] };
        }
        if (tabla === 'agregados') {
          var e = antesDeEscribir(nuevo, viejo, yo);
          if (e) return { err: [400, '23514', e] };
          historial(viejo.id, nuevo.eliminado && !viejo.eliminado ? 'BAJA' : 'UPDATE', viejo, nuevo, yo);
        }
        var pos = db[tabla].indexOf(viejo);
        db[tabla][pos] = nuevo; hechas.push(nuevo);
      }
      return { filas: copia(hechas) };
    }

    function borrar(tabla, query, yo) {
      if (tabla === 'agregados') return { err: [400, 'P0001', 'No se permite borrar registros de agregados. Use baja lógica (eliminado = true).'] };
      if (tabla !== 'destinatarios_alerta' || yo.rol !== 'admin') return { filas: [] };
      var objetivo = filtrar(db[tabla].slice(), query);
      db[tabla] = db[tabla].filter(function (r) { return objetivo.indexOf(r) < 0; });
      return { filas: copia(objetivo) };
    }

    function rpc(nombreFn, args, yo) {
      if (nombreFn === 'es_admin') return { valor: yo.rol === 'admin' };
      if (nombreFn === 'es_vista') return { valor: yo.rol === 'vista' };
      if (nombreFn === 'marcar_solicitado') {
        var ids = args.p_ids || [], valor = !!args.p_valor, n = 0;
        if (ids.length > 5000) return { err: [400, 'P0001', 'Demasiados registros a la vez.'] };
        db.agregados.forEach(function (r, i) {
          if (ids.indexOf(r.id) < 0 || r.eliminado || r.solicitado_proveedor === valor) return;
          var nuevo = Object.assign(copia(r), { solicitado_proveedor: valor, solicitado_en: valor ? ahora() : null, solicitado_por: valor ? yo.email : null, updated_at: ahora(), updated_by: yo.email });
          historial(r.id, 'UPDATE', r, nuevo, yo);
          db.agregados[i] = nuevo; n++;
        });
        return { valor: n };
      }
      return { err: [404, 'PGRST202', 'Could not find the function public.' + nombreFn + ' in the schema cache'] };
    }

    // ------------------------------- Ruteo -------------------------------
    function rest(metodo, ruta, query, init, cuerpo) {
      var yo = quienEs(init);
      if (!yo) return error(401, '42501', 'permission denied: inicia sesión');
      var partes = ruta.replace('/rest/v1/', '').split('/');
      var h = new Headers(init.headers || {});
      var prefer = h.get('prefer') || '', unObjeto = /vnd\.pgrst\.object/.test(h.get('accept') || '');

      if (partes[0] === 'rpc') {
        var r = rpc(partes[1], cuerpo || {}, yo);
        return r.err ? error(r.err[0], r.err[1], r.err[2]) : respuesta(200, r.valor);
      }
      var tabla = partes[0];
      function entregar(filas, total) {
        filas = proyectar(filas, query.get('select'));
        var enc = {};
        if (/count=exact/.test(prefer)) {
          var ini = +(query.get('offset') || 0);
          enc['content-range'] = (filas.length ? ini + '-' + (ini + filas.length - 1) : '*') + '/' + (total == null ? filas.length : total);
        }
        if (unObjeto) {
          if (filas.length !== 1) return error(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
          return respuesta(200, filas[0], enc);
        }
        if (metodo === 'HEAD') return new Response(null, { status: 200, headers: Object.assign({ 'content-type': 'application/json' }, enc) });
        return respuesta(200, filas, enc);
      }

      if (metodo === 'GET' || metodo === 'HEAD') {
        var base = filasLegibles(tabla, yo);
        if (base == null) return error(404, '42P01', 'relation "public.' + tabla + '" does not exist');
        var filas = ordenar(filtrar(base, query), query.get('order'));
        var total = filas.length, off = +(query.get('offset') || 0), lim = query.get('limit');
        filas = filas.slice(off, lim == null ? undefined : off + +lim);
        return entregar(filas, total);
      }
      if (TABLAS.indexOf(tabla) < 0) return error(405, '42809', 'No se puede escribir en ' + tabla);
      var res = metodo === 'POST' ? insertar(tabla, cuerpo, yo) : metodo === 'PATCH' ? actualizar(tabla, query, cuerpo || {}, yo) : metodo === 'DELETE' ? borrar(tabla, query, yo) : { err: [405, 'DEMO405', 'Método no simulado'] };
      if (res.err) return error(res.err[0], res.err[1], res.err[2]);
      if (!/return=representation/.test(prefer)) return respuesta(metodo === 'POST' ? 201 : 204, null);
      return entregar(res.filas, null);
    }

    function fetchDemo(entrada, init) {
      init = init || {};
      var url = new URL(typeof entrada === 'string' ? entrada : entrada.url);
      var metodo = (init.method || 'GET').toUpperCase();
      peticiones.push({ metodo: metodo, url: url.pathname + url.search, origen: url.origin });
      var espera = opciones.latencia == null ? 60 : opciones.latencia;
      return new Promise(function (resolver) {
        setTimeout(function () {
          try {
            if (url.origin !== URL_DEMO) { resolver(error(400, 'DEMO400', 'El modo demo solo responde a ' + URL_DEMO)); return; }
            var cuerpo = init.body ? JSON.parse(init.body) : null;
            if (url.pathname.indexOf('/auth/v1/') === 0) resolver(auth(url.pathname, url.searchParams, init, cuerpo || {}));
            else if (url.pathname.indexOf('/rest/v1/') === 0) resolver(rest(metodo, url.pathname, url.searchParams, init, cuerpo));
            else resolver(error(404, 'DEMO404', 'Ruta no simulada: ' + url.pathname));
          } catch (e) {
            resolver(error(500, 'DEMO500', 'Error del servidor demo: ' + e.message));
          }
        }, espera);
      });
    }

    return { fetch: fetchDemo, url: URL_DEMO, llave: LLAVE_DEMO, db: db, usuarios: usuarios, peticiones: peticiones, hoy: reloj };
  }

  root.DemoServidor = {
    crear: crear,
    // Lo llama app.js al arrancar en modo demo
    iniciar: function (opciones) { return crear(opciones); }
  };
  if (typeof module === 'object' && module.exports) module.exports = root.DemoServidor;
})(typeof globalThis !== 'undefined' ? globalThis : this);
