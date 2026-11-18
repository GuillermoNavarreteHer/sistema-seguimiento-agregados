/*
  ============================================================================
  MODO DEMO — Generador de datos ficticios (determinista)
  Autor: Guillermo Navarrete · GitHub @GuillermoNavarreteHer
  ----------------------------------------------------------------------------
  Genero TODOS los datos de la demo a partir de una semilla. Con la misma
  semilla y la misma fecha base salen exactamente los mismos datos (mismos
  bytes al convertirlos a JSON). Ningún nombre, código o cifra es real.

    DatosDemo.generar({ semilla: 2026, hoy: '2026-11-16' })

  `hoy` es la fecha base (AAAA-MM-DD): las fechas de solicitud se calculan
  hacia atrás desde ahí, para que el semáforo (en tiempo / vencidas) tenga
  sentido el día que alguien abre la demo. En las pruebas fijo `hoy`.
  ============================================================================
*/
(function (root) {
  'use strict';

  // Generador pseudoaleatorio mulberry32: pequeño, rápido y reproducible
  function crearAzar(semilla) {
    var a = semilla >>> 0;
    function siguiente() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      num: siguiente,
      entero: function (min, max) { return min + Math.floor(siguiente() * (max - min + 1)); },
      elegir: function (lista) { return lista[Math.floor(siguiente() * lista.length)]; },
      prob: function (p) { return siguiente() < p; }
    };
  }

  function sumarDias(iso, n) {
    var p = iso.split('-');
    var d = new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function relleno(n, largo) { var s = String(n); while (s.length < largo) s = '0' + s; return s; }

  // ---------------- Catálogos ficticios ----------------
  var CLIENTES = ['ASEGURADORA UNO', 'ASEGURADORA DOS', 'FONDO TRES', 'PROGRAMA CUATRO', 'CONVENIO CINCO'];
  var PROVEEDORES = [
    'HOSPITAL EJEMPLO NORTE', 'HOSPITAL EJEMPLO SUR', 'LABORATORIO MODELO CENTRO', 'LABORATORIO MODELO ORIENTE',
    'CLÍNICA DEMOSTRACIÓN PONIENTE', 'CENTRO DE IMAGEN FICTICIO', 'IMAGENOLOGÍA DE PRUEBA SA', 'ÓPTICA MUESTRA',
    'CLÍNICA OFTALMOLÓGICA EJEMPLO', 'AMBULANCIAS SIMULADAS', 'MEDICINA NUCLEAR DEMO', 'LABORATORIO PRUEBA NORESTE',
    'HOSPITAL MODELO GOLFO', 'CENTRO MÉDICO DE MUESTRA', 'DIAGNÓSTICO EJEMPLO PACÍFICO', 'GABINETE FICTICIO BAJÍO'
  ];
  var SOLICITANTES = ['ANA PÉREZ', 'IVÁN OCHOA', 'MARTA RUIZ', 'NOÉ SALAS', 'SOFÍA LARA', 'DIEGO MORA'];
  var TIPOS = ['LABORATORIO', 'IMAGENOLOGIA', 'GABINETE', 'ÓPTICA', 'GABINETE OFTALMOLOGICO', 'MEDICINA NUCLEAR', 'AMBULANCIA'];

  // Procedimientos ficticios: [código, descripción, tipo]
  var PROCEDIMIENTOS = [
    ['DEMO-LAB-001', 'BIOMETRÍA HEMÁTICA COMPLETA', 'LABORATORIO'],
    ['DEMO-LAB-002', 'QUÍMICA SANGUÍNEA DE 6 ELEMENTOS', 'LABORATORIO'],
    ['DEMO-LAB-003', 'PERFIL DE LÍPIDOS', 'LABORATORIO'],
    ['DEMO-LAB-004', 'EXAMEN GENERAL DE ORINA', 'LABORATORIO'],
    ['DEMO-LAB-005', 'PRUEBAS DE COAGULACIÓN TP Y TPT', 'LABORATORIO'],
    ['DEMO-LAB-006', 'HEMOGLOBINA GLUCOSILADA', 'LABORATORIO'],
    ['DEMO-LAB-007', 'PERFIL TIROIDEO', 'LABORATORIO'],
    ['DEMO-LAB-008', 'CULTIVO GENERAL', 'LABORATORIO'],
    ['DEMO-IMG-001', 'RADIOGRAFÍA DE TÓRAX PA Y LATERAL', 'IMAGENOLOGIA'],
    ['DEMO-IMG-002', 'ULTRASONIDO ABDOMINAL', 'IMAGENOLOGIA'],
    ['DEMO-IMG-003', 'TOMOGRAFÍA SIMPLE DE CRÁNEO', 'IMAGENOLOGIA'],
    ['DEMO-IMG-004', 'RESONANCIA MAGNÉTICA DE RODILLA', 'IMAGENOLOGIA'],
    ['DEMO-IMG-005', 'RADIOGRAFÍA DE COLUMNA LUMBAR', 'IMAGENOLOGIA'],
    ['DEMO-IMG-006', 'MASTOGRAFÍA BILATERAL', 'IMAGENOLOGIA'],
    ['DEMO-GAB-001', 'ELECTROCARDIOGRAMA EN REPOSO', 'GABINETE'],
    ['DEMO-GAB-002', 'PRUEBA DE ESFUERZO', 'GABINETE'],
    ['DEMO-GAB-003', 'ESPIROMETRÍA', 'GABINETE'],
    ['DEMO-GAB-004', 'HOLTER DE 24 HORAS', 'GABINETE'],
    ['DEMO-OPT-001', 'LENTES MONOFOCALES', 'ÓPTICA'],
    ['DEMO-OPT-002', 'LENTES BIFOCALES', 'ÓPTICA'],
    ['DEMO-OFT-001', 'CAMPIMETRÍA COMPUTARIZADA', 'GABINETE OFTALMOLOGICO'],
    ['DEMO-OFT-002', 'TOMOGRAFÍA DE COHERENCIA ÓPTICA', 'GABINETE OFTALMOLOGICO'],
    ['DEMO-NUC-001', 'GAMMAGRAMA ÓSEO', 'MEDICINA NUCLEAR'],
    ['DEMO-NUC-002', 'GAMMAGRAMA TIROIDEO', 'MEDICINA NUCLEAR'],
    ['DEMO-AMB-001', 'TRASLADO EN AMBULANCIA LOCAL', 'AMBULANCIA'],
    ['DEMO-AMB-002', 'TRASLADO EN AMBULANCIA FORÁNEO', 'AMBULANCIA']
  ];
  // Casos especiales del catálogo para mostrar cada regla del sistema
  var CATALOGO_EXTRA = [
    // Mismo código con dos opciones distintas → el formulario pide elegir
    ['DEMO-OPT-003', 'ARMAZÓN Y CRISTALES', 'ÓPTICA', 'Habilitado'],
    ['DEMO-OPT-003', 'ARMAZÓN Y CRISTALES DE ACUERDO A PRESTACIÓN', 'GABINETE OFTALMOLOGICO', 'Habilitado'],
    // Tipo que no existe en el catálogo de tipos → el sistema lo da de alta solo
    ['DEMO-ENF-001', 'APLICACIÓN DE MEDICAMENTO A DOMICILIO', 'ENFERMERÍA', 'Habilitado'],
    // Código deshabilitado → no se permite capturarlo
    ['DEMO-LAB-099', 'PRUEBA DESCONTINUADA', 'LABORATORIO', 'Deshabilitado']
  ];

  // Usuarios de la demo (las contraseñas se muestran en la pantalla de inicio: no son secretas)
  var USUARIOS = [
    { id: '00000000-0000-4000-8000-000000000001', email: 'admin@demo.local', password: 'demo1234', rol: 'admin', nombre: 'Administrador demo' },
    { id: '00000000-0000-4000-8000-000000000002', email: 'captura@demo.local', password: 'demo1234', rol: 'normal', nombre: 'Captura demo' },
    { id: '00000000-0000-4000-8000-000000000003', email: 'vista@demo.local', password: 'demo1234', rol: 'vista', nombre: 'Proveedores demo' }
  ];

  function generar(opciones) {
    opciones = opciones || {};
    var semilla = opciones.semilla == null ? 2026 : opciones.semilla;
    var hoy = opciones.hoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy || '')) throw new Error('DatosDemo.generar: falta la fecha base "hoy" (AAAA-MM-DD).');
    var az = crearAzar(semilla);
    var anio = +hoy.slice(0, 4);
    var creado = hoy + 'T08:00:00.000Z';

    var cat = function (lista) { return lista.map(function (n, i) { return { id: i + 1, nombre: n, activo: true, created_at: creado }; }); };
    var clientes = cat(CLIENTES), proveedores = cat(PROVEEDORES), solicitantes = cat(SOLICITANTES), tipos = cat(TIPOS);
    proveedores[proveedores.length - 1].activo = false; // uno desactivado para mostrar la función

    var catalogo = [];
    PROCEDIMIENTOS.forEach(function (p) { catalogo.push({ cpt: p[0], descripcion: p[1], tipo_servicio: p[2], grupo_servicio: 'DEMO', status: 'Habilitado' }); });
    CATALOGO_EXTRA.forEach(function (p) { catalogo.push({ cpt: p[0], descripcion: p[1], tipo_servicio: p[2], grupo_servicio: 'DEMO', status: p[3] }); });
    catalogo.forEach(function (c, i) { c.id = i + 1; });

    var idTipo = {}; tipos.forEach(function (t) { idTipo[t.nombre] = t.id; });
    var agregados = [];
    var N = opciones.registros || 180;
    var contrarrecibo = null, provActual = null, restantesLote = 0;
    for (var i = 0; i < N; i++) {
      // Se capturan en lotes: mismo proveedor y contrarrecibo para varios estudios
      if (restantesLote <= 0) {
        provActual = az.entero(1, proveedores.length - 1);
        contrarrecibo = '90' + relleno(az.entero(10000000, 99999999), 8);
        restantesLote = az.entero(1, 5);
      }
      restantesLote--;
      var proc = PROCEDIMIENTOS[az.entero(0, PROCEDIMIENTOS.length - 1)];
      // Antigüedad: muchos recientes, algunos viejos; 8 de cada 100 del año anterior
      var dias = az.prob(0.08) ? az.entero(320, 420) : Math.floor(Math.pow(az.num(), 1.6) * 200);
      var fs = sumarDias(hoy, -dias);
      var cargado = dias > 4 ? az.prob(0.62) : az.prob(0.15);
      var fc = cargado ? sumarDias(fs, az.entero(0, Math.min(dias, 9))) : null;
      if (fc && fc > hoy) fc = hoy;
      var estatus = cargado ? 'CARGADO' : (az.prob(0.03) ? 'ACLARACIÓN SERVICIO NO BRINDADO' : 'PENDIENTE');
      var solicitado = !cargado && estatus === 'PENDIENTE' && az.prob(0.25);
      agregados.push({
        id: i + 1,
        cliente_id: az.entero(1, clientes.length),
        proveedor_id: provActual,
        contrarrecibo: contrarrecibo,
        nur: '900' + relleno(az.entero(100000000, 999999999), 9),
        cpt: proc[0],
        descripcion: proc[1],
        tipo_servicio_id: idTipo[proc[2]],
        solicitante_id: az.entero(1, solicitantes.length),
        fecha_solicitud: fs,
        fecha_carga: fc,
        estatus: estatus,
        notas: az.prob(0.08) ? az.elegir(['CONFIRMADO CON EL PROVEEDOR', 'SE ENVIÓ RECORDATORIO', 'EN ESPERA DE RESULTADOS']) : null,
        anio_surtido: +fs.slice(0, 4) < anio ? anio - 1 : anio,
        origen: i < 120 ? 'EXCEL_2026' : 'SISTEMA',
        fila_excel: i < 120 ? i + 2 : null,
        requiere_revision: false,
        motivo_revision: null,
        eliminado: false, eliminado_en: null, eliminado_por: null, motivo_baja: null,
        solicitado_proveedor: solicitado,
        solicitado_en: solicitado ? sumarDias(fs, 2) + 'T16:00:00.000Z' : null,
        solicitado_por: solicitado ? 'vista@demo.local' : null,
        created_at: fs + 'T15:00:00.000Z', created_by: i < 120 ? null : 'captura@demo.local',
        updated_at: (fc || fs) + 'T15:00:00.000Z', updated_by: i < 120 ? null : 'captura@demo.local'
      });
    }
    // Casos especiales para mostrar reglas: revisión, bajas y contrarrecibo vacío del "Excel"
    agregados[3].requiere_revision = true; agregados[3].motivo_revision = 'NUR duplicado en el archivo original';
    agregados[11].requiere_revision = true; agregados[11].motivo_revision = 'Estatus CARGADO sin fecha de carga en el archivo original';
    agregados[11].estatus = 'CARGADO'; agregados[11].fecha_carga = null;
    agregados[27].contrarrecibo = null;
    [40, 85].forEach(function (k) {
      var r = agregados[k];
      r.eliminado = true; r.eliminado_en = r.updated_at; r.eliminado_por = 'captura@demo.local'; r.motivo_baja = 'CAPTURADO POR ERROR (EJEMPLO)';
    });

    var destinatarios = [
      { id: 1, nombre: 'OPERACIONES DEMO', email: 'operaciones@ejemplo.com', activo: true, recibe_alerta: true, recibe_respaldo: false, created_at: creado },
      { id: 2, nombre: 'RESPALDOS DEMO', email: 'respaldos@ejemplo.com', activo: true, recibe_alerta: false, recibe_respaldo: true, created_at: creado }
    ];

    return {
      semilla: semilla, hoy: hoy,
      usuarios: USUARIOS.map(function (u) { return { id: u.id, email: u.email, password: u.password, rol: u.rol, nombre: u.nombre }; }),
      clientes: clientes, proveedores: proveedores, solicitantes: solicitantes, tipos_servicio: tipos,
      catalogo_procedimientos: catalogo,
      destinatarios_alerta: destinatarios,
      agregados: agregados
    };
  }

  root.DatosDemo = { generar: generar, crearAzar: crearAzar, USUARIOS: USUARIOS };
  if (typeof module === 'object' && module.exports) module.exports = root.DatosDemo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
