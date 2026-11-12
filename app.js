/* ============================================================
   Agenda Cuidarte — Fase 1 · app.js
   ------------------------------------------------------------
   Arquitectura:
   1. CONFIG: constantes editables (URL del CSV, zona horaria)
   2. Estado global (patrón observer simple)
   3. Carga de datos (fetch + parseo con PapaParse)
   4. Lógica de filtrado y búsqueda
   5. Renderizado de vista "Hoy"
   6. Estados: cargando / error / vacío
   7. Interacciones de UI (filtros, refresh)
   8. Inicialización

   Se expone en window.appCuidarte para debugging y para que
   los botones del HTML (ej. "Volver a intentar") puedan llamarlo.
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // 1. CONFIG
  // ============================================================

  /**
   * URL del CSV publicado desde Google Sheets.
   *
   * PARA LA USUARIA: reemplaza esto con la URL que obtienes así:
   *   1. Abre el Sheets con la agenda
   *   2. Archivo → Compartir → Publicar en la web
   *   3. En "Enlace" elige la pestaña "Actividades"
   *   4. Formato: "Valores separados por comas (.csv)"
   *   5. Clic en "Publicar" y copia el link
   *   6. Pega ese link completo aquí abajo
   *
   * El link debe terminar en "pub?output=csv" o parecido.
   * Si no se cambia este placeholder, la app muestra un error
   * claro explicando el paso.
   */
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTlGi47YxhgCjEQmFn1Irw2d4nTDd9ioH_yjUdAYOBWEVznF3yyz2t1J0RxzzKxw2s5JoleGxwm1B4u/pub?gid=613600507&single=true&output=csv';

  /**
   * Zona horaria del proyecto (Cali, Colombia).
   * No cambiar salvo que el proyecto se traslade de país.
   */
  const TZ = 'America/Bogota';

  /**
   * Nombres de los territorios en el orden canónico (como aparecen en Sheets).
   * Este array define qué territorios son "válidos" y el orden de los chips.
   * Si en el futuro se agregan comunas, se añaden aquí y la app los reconoce.
   */
  const TERRITORIOS_VALIDOS = [
    'Buitrera', 'Centro', 'Comuna 1', 'Comuna 6', 'Comuna 15',
    'Comuna 20', 'Comuna 21', 'Golondrinas', 'Hormiguero', 'Saladito'
  ];

  /**
   * Contactos por territorio. Opcional — solo los listados muestran teléfono.
   */
  const CONTACTOS = {
    'Comuna 15':  '(301) 485-7028',
    'Comuna 20':  '(323) 581-7070',
    'Comuna 21':  '(324) 257-2791',
    'Hormiguero': '(324) 257-2791',
    'Saladito':   '(321) 888-6714'
  };

  // ============================================================
  // 2. ESTADO GLOBAL
  // ============================================================

  const state = {
    actividades: [],        // Todas las actividades parseadas (solo desde hoy en adelante)
    filtroComuna: '',       // Territorio seleccionado ('' = todos)
    filtroBusqueda: '',     // Texto de búsqueda
    vistaActiva: 'hoy',     // 'hoy' (otras vistas son fase 2)
    cargando: false,
    error: null,
    ultimaActualizacion: null
  };

  // ============================================================
  // 3. HELPERS DE FECHAS Y FORMATO
  // ============================================================

  /**
   * Parsea una fecha del CSV. Las fechas vienen como "d/m/yyyy" o "yyyy-mm-dd".
   * Devuelve Date en zona local o null si no es válida.
   *
   * Importante: las fechas en Sheets a veces vienen como "1/11/2026"
   * que podría confundirse con enero 11 si usamos new Date() directo.
   * Por eso hacemos parseo manual asumiendo formato colombiano DD/MM/YYYY.
   */
  function parsearFecha(texto) {
    if (!texto || typeof texto !== 'string') return null;
    const t = texto.trim();
    if (!t) return null;

    // Formato ISO: 2026-11-08
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), 12, 0, 0);
    }

    // Formato con slash: puede ser DD/MM/YYYY (Colombia) o MM/DD/YYYY (US).
    // Heurística: si algún campo es mayor a 12, ese es el día.
    // Si ambos son ≤ 12, asumimos DD/MM/YYYY (formato colombiano por defecto).
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const a = parseInt(m[1]);
      const b = parseInt(m[2]);
      const y = parseInt(m[3]);
      if (a > 12) {
        // DD/MM/YYYY confirmado (a=día)
        return new Date(y, b - 1, a, 12, 0, 0);
      } else if (b > 12) {
        // MM/DD/YYYY confirmado (b=día)
        return new Date(y, a - 1, b, 12, 0, 0);
      } else {
        // Ambiguo. Asumir DD/MM/YYYY (formato Colombia).
        return new Date(y, b - 1, a, 12, 0, 0);
      }
    }

    // Formato con guion: 12-11-2026 (DD-MM-YYYY)
    m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) {
      return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), 12, 0, 0);
    }

    // Último recurso: dejar que el navegador lo intente
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d;

    return null;
  }

  /**
   * Devuelve la fecha "hoy" a medianoche en zona local.
   * Útil para comparar actividades sin problemas de hora.
   */
  function hoy() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Devuelve la fecha de una actividad como YYYY-MM-DD para comparar.
   */
  function fechaKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  /**
   * Formatea una fecha a "jueves 12 de noviembre de 2026" en español.
   */
  function formatearFechaLarga(d) {
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
  }

  /**
   * Normaliza una hora a formato "3:30 p. m.". Acepta:
   * - "3:30:00 p.m." → "3:30 p. m."
   * - "15:30"        → "3:30 p. m."
   * - "15:30:00"     → "3:30 p. m."
   * - "9:00 AM"      → "9:00 a. m."
   * Devuelve string vacío si no se puede interpretar.
   */
  function limpiarHora(texto) {
    if (!texto || typeof texto !== 'string') return '';
    let t = texto.trim();
    if (!t) return '';

    // Formato 12h: "3:30 p.m." / "3:30:00 p. m." / "9:00 AM" / etc.
    let m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s*\.?\s*m?\.?/i);
    if (m) {
      const h = parseInt(m[1]);
      const ampm = m[3].toLowerCase() === 'p' ? 'p. m.' : 'a. m.';
      return h + ':' + m[2] + ' ' + ampm;
    }

    // Formato 24h: "14:30" / "14:30:00" / "09:00"
    m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) {
      const h = parseInt(m[1]);
      const min = m[2];
      if (h === 0)  return '12:' + min + ' a. m.';
      if (h < 12)   return h + ':' + min + ' a. m.';
      if (h === 12) return '12:' + min + ' p. m.';
      return (h - 12) + ':' + min + ' p. m.';
    }

    // Si no matchea nada, devolver tal cual (no se rompe, solo se ve raro)
    return t;
  }

  /**
   * Formatea un timestamp relativo: "hace 3 minutos", "hace 2 horas".
   */
  function tiempoRelativo(timestamp) {
    if (!timestamp) return 'nunca';
    const diff = Date.now() - timestamp;
    const seg = Math.floor(diff / 1000);
    const min = Math.floor(seg / 60);
    const hrs = Math.floor(min / 60);

    if (seg < 30) return 'hace un momento';
    if (min < 1) return 'hace ' + seg + ' segundos';
    if (min === 1) return 'hace 1 minuto';
    if (min < 60) return 'hace ' + min + ' minutos';
    if (hrs === 1) return 'hace 1 hora';
    if (hrs < 24) return 'hace ' + hrs + ' horas';
    return 'hace más de un día';
  }

  /**
   * Normaliza un texto para búsqueda tolerante a tildes y mayúsculas.
   */
  function normalizar(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  /**
   * Normaliza el nombre de un territorio para unificar "comuna 15" / "Comuna 15".
   * Si coincide con uno válido, devuelve el canónico; si no, lo devuelve tal cual.
   */
  function normalizarTerritorio(texto) {
    const norm = normalizar(texto);
    const encontrado = TERRITORIOS_VALIDOS.find(t => normalizar(t) === norm);
    return encontrado || String(texto || '').trim();
  }

  /**
   * Normaliza el estado: tolera "Cancelada", "cancelada", "CANCELADO", etc.
   */
  function normalizarEstado(texto) {
    const s = normalizar(texto);
    if (s.indexOf('cancel') === 0) return 'Cancelada';
    if (s.indexOf('ajust') === 0) return 'Ajustada';
    return 'Programada';
  }

  // ============================================================
  // 4. CARGA DE DATOS DESDE CSV
  // ============================================================

  /**
   * Carga el CSV publicado, lo parsea y actualiza el estado.
   * Se expone globalmente para que el botón "Volver a intentar" la llame.
   */
  async function cargarDatos() {
    // Validación: el usuario no cambió el placeholder
    if (CSV_URL.indexOf('REEMPLAZAR') === 0) {
      mostrarError(
        'La URL del CSV no está configurada. ' +
        'Abre app.js y reemplaza CSV_URL con la URL del Sheets publicado. ' +
        'Hay instrucciones paso a paso en README.md.'
      );
      return;
    }

    state.cargando = true;
    state.error = null;
    render();

    // Tolerancia: si alguien pegó la URL de "pubhtml" (vista HTML) en vez
    // de la del CSV, la convertimos automáticamente para que no se rompa.
    let urlBase = CSV_URL;
    if (urlBase.indexOf('pubhtml') >= 0) {
      urlBase = urlBase.replace('/pubhtml', '/pub');
      if (urlBase.indexOf('output=') < 0) {
        urlBase += (urlBase.indexOf('?') >= 0 ? '&' : '?') + 'output=csv';
      }
      console.warn('CSV_URL contenía "pubhtml"; se convirtió automáticamente a CSV.');
    }

    // Agregar timestamp para evitar que el navegador cachee
    const url = urlBase + (urlBase.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();

    try {
      const respuesta = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit'
      });

      if (!respuesta.ok) {
        throw new Error('El servidor respondió con código ' + respuesta.status);
      }

      const texto = await respuesta.text();
      const resultado = Papa.parse(texto, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim()
      });

      if (resultado.errors && resultado.errors.length > 0) {
        console.warn('Errores en el parseo del CSV:', resultado.errors);
      }

      state.actividades = procesarFilas(resultado.data);
      state.cargando = false;
      state.ultimaActualizacion = Date.now();

      anunciar('Agenda actualizada. ' + state.actividades.length + ' actividades cargadas.');
      render();
    } catch (err) {
      console.error('Error al cargar el CSV:', err);
      state.cargando = false;
      state.error = construirMensajeError(err);
      render();
    }
  }

  /**
   * Convierte el mensaje técnico de error en algo útil para el usuario.
   */
  function construirMensajeError(err) {
    const msg = err.message || String(err);

    if (msg.indexOf('Failed to fetch') >= 0 || msg.indexOf('NetworkError') >= 0) {
      return 'No pudimos conectar con el servidor. Revisa tu conexión a internet y vuelve a intentar.';
    }

    if (msg.indexOf('404') >= 0) {
      return 'No encontramos los datos. Puede que el CSV haya sido despublicado desde Google Sheets. Contacta a articulación.';
    }

    if (msg.indexOf('403') >= 0) {
      return 'No tenemos permiso para leer los datos. Verifica que el CSV siga publicado desde Google Sheets.';
    }

    return 'Ocurrió un problema al cargar los datos: ' + msg + '. Intenta de nuevo en unos segundos.';
  }

  /**
   * Procesa las filas del CSV: parsea cada una, filtra las inválidas
   * y las que ya pasaron. Devuelve array de actividades normalizadas.
   */
  function procesarFilas(filas) {
    const hoyDate = hoy();
    const resultado = [];

    for (const fila of filas) {
      // Los nombres de las columnas vienen del header del Sheets.
      // Se mantienen tolerantes por si cambia la mayúscula o un espacio.
      // Lectura TOLERANTE: aceptamos varios nombres por columna para que no se
      // rompa si articulación cambia los encabezados del Sheets. Los primeros
      // valores son los que están en Sheets AHORA (noviembre 2026).
      const fecha = parsearFecha(obtenerCampo(fila, ['Fecha', 'fecha']));
      const territorio = normalizarTerritorio(obtenerCampo(fila, [
        'Comuna', 'comuna', 'Territorio', 'territorio'
      ]));
      const actividad = String(obtenerCampo(fila, ['Actividad', 'actividad']) || '').trim();

      // Skip si falta algo esencial o la fecha ya pasó
      if (!fecha || !territorio || !actividad) continue;
      if (fecha < hoyDate) continue;

      resultado.push({
        fecha: fecha,
        fechaKey: fechaKey(fecha),
        territorio: territorio,
        actividad: actividad,
        horaInicio: limpiarHora(obtenerCampo(fila, [
          'Hora de inicio', 'Hora inicio', 'hora de inicio', 'hora inicio'
        ])),
        horaFin: limpiarHora(obtenerCampo(fila, [
          'Hora de finalización', 'Hora de finalizacion', 'Hora fin',
          'hora de finalización', 'hora fin'
        ])),
        lugar: String(obtenerCampo(fila, ['Lugar', 'lugar']) || '').trim(),
        responsable: String(obtenerCampo(fila, [
          'Responsable (entidad)', 'Responsable entidad', 'Responsable', 'responsable'
        ]) || '').trim(),
        estado: normalizarEstado(obtenerCampo(fila, ['Estado', 'estado'])),
        espejoActividad: String(obtenerCampo(fila, [
          'Actividad espejo', 'actividad espejo'
        ]) || '').trim(),
        espejoHoraInicio: limpiarHora(obtenerCampo(fila, [
          'Hora de inicio espejo', 'Hora inicio espejo', 'hora de inicio espejo'
        ])),
        espejoHoraFin: limpiarHora(obtenerCampo(fila, [
          'Hora de finalización espejo', 'Hora de finalizacion espejo',
          'Hora fin espejo', 'hora de finalización espejo'
        ])),
        espejoLugar: String(obtenerCampo(fila, ['Lugar espejo', 'lugar espejo']) || '').trim(),
        espejoResponsable: String(obtenerCampo(fila, [
          'Responsable (entidad) espejo', 'Responsable entidad espejo',
          'Responsable espejo', 'responsable espejo'
        ]) || '').trim(),
        nota: String(obtenerCampo(fila, [
          'Nota de cambio', 'Nota cambio', 'nota de cambio', 'Nota', 'nota'
        ]) || '').trim()
      });
    }

    // Ordenar por fecha y luego por hora
    resultado.sort((a, b) => {
      if (a.fecha - b.fecha !== 0) return a.fecha - b.fecha;
      return a.horaInicio.localeCompare(b.horaInicio);
    });

    return resultado;
  }

  /**
   * Busca un campo en la fila probando varios nombres posibles
   * (tolera cambios de mayúsculas o acentos en el header del Sheets).
   */
  function obtenerCampo(fila, nombres) {
    for (const nombre of nombres) {
      if (fila[nombre] !== undefined && fila[nombre] !== null) {
        return fila[nombre];
      }
    }
    return '';
  }

  // ============================================================
  // 5. FILTRADO
  // ============================================================

  /**
   * Aplica los filtros al dataset y devuelve las actividades que cumplen.
   */
  function filtrarActividades() {
    let resultado = state.actividades;

    // Vista "Hoy": solo actividades de la fecha de hoy
    if (state.vistaActiva === 'hoy') {
      const hoyKey = fechaKey(hoy());
      resultado = resultado.filter(a => a.fechaKey === hoyKey);
    }

    // Filtro: territorio
    if (state.filtroComuna) {
      resultado = resultado.filter(a => a.territorio === state.filtroComuna);
    }

    // Filtro: búsqueda por texto
    if (state.filtroBusqueda) {
      const q = normalizar(state.filtroBusqueda);
      resultado = resultado.filter(a => {
        return normalizar(a.actividad).indexOf(q) >= 0 ||
               normalizar(a.lugar).indexOf(q) >= 0 ||
               normalizar(a.responsable).indexOf(q) >= 0 ||
               normalizar(a.territorio).indexOf(q) >= 0;
      });
    }

    return resultado;
  }

  /**
   * Agrupa actividades por territorio para pintarlas en secciones.
   */
  function agruparPorTerritorio(actividades) {
    const mapa = {};
    for (const a of actividades) {
      if (!mapa[a.territorio]) mapa[a.territorio] = [];
      mapa[a.territorio].push(a);
    }
    // Orden canónico: según TERRITORIOS_VALIDOS, luego otros al final
    const ordenados = [];
    for (const t of TERRITORIOS_VALIDOS) {
      if (mapa[t]) ordenados.push({ territorio: t, actividades: mapa[t] });
    }
    // Agregar territorios no reconocidos al final (tolerancia)
    for (const t in mapa) {
      if (TERRITORIOS_VALIDOS.indexOf(t) < 0) {
        ordenados.push({ territorio: t, actividades: mapa[t] });
      }
    }
    return ordenados;
  }

  // ============================================================
  // 6. RENDERIZADO
  // ============================================================

  /**
   * Función principal de render: decide qué mostrar según el estado.
   */
  function render() {
    actualizarTimestamp();
    renderOpcionesTerritorios();
    renderFechaActual();
    renderChipsFiltros();

    // Decidir qué estado mostrar
    const $cargando = document.getElementById('estado-cargando');
    const $error = document.getElementById('estado-error');
    const $vacio = document.getElementById('estado-vacio');
    const $lista = document.getElementById('lista-actividades');
    const $resultados = document.getElementById('resultados-info');

    // Resetear visibilidad
    $cargando.hidden = true;
    $error.hidden = true;
    $vacio.hidden = true;
    $lista.hidden = true;
    $resultados.hidden = true;

    if (state.cargando) {
      $cargando.hidden = false;
      return;
    }

    if (state.error) {
      $error.hidden = false;
      document.getElementById('estado-error-mensaje').textContent = state.error;
      return;
    }

    const filtradas = filtrarActividades();

    if (filtradas.length === 0) {
      $vacio.hidden = false;
      document.getElementById('estado-vacio-mensaje').textContent = mensajeVacio();
      return;
    }

    $lista.hidden = false;
    $lista.innerHTML = renderGrupos(agruparPorTerritorio(filtradas));
    conectarInteraccionesTarjetas();

    $resultados.hidden = false;
    document.getElementById('resultados-cantidad').textContent =
      filtradas.length + (filtradas.length === 1 ? ' actividad' : ' actividades') +
      (state.filtroComuna || state.filtroBusqueda ? ' con los filtros aplicados' : '');
  }

  /**
   * Devuelve mensaje contextual cuando no hay resultados.
   * Ayuda al usuario a entender POR QUÉ está vacío (heurística Nielsen).
   */
  function mensajeVacio() {
    if (state.filtroBusqueda) {
      return 'No encontramos actividades con "' + state.filtroBusqueda + '". Prueba con otras palabras o quita algún filtro.';
    }
    if (state.filtroComuna) {
      return 'No hay actividades programadas para hoy en ' + state.filtroComuna + '. Prueba con otro territorio o ve si hay para otro día.';
    }
    return 'No hay actividades programadas para hoy. Vuelve mañana o pide a articulación que suban las de la semana.';
  }

  /**
   * Pinta la fecha actual grande arriba.
   */
  function renderFechaActual() {
    document.getElementById('vista-fecha').textContent = formatearFechaLarga(hoy());
  }

  /**
   * Rellena el select de territorios con los que existen en los datos
   * más los TERRITORIOS_VALIDOS (para que estén disponibles aunque el día
   * no tenga actividades ahí).
   */
  function renderOpcionesTerritorios() {
    const select = document.getElementById('filtro-comuna');
    if (!select) return;

    // Preservar el valor seleccionado al redibujar
    const actual = select.value;

    // Construir lista única: TERRITORIOS_VALIDOS + los que aparezcan en datos
    const enDatos = new Set(state.actividades.map(a => a.territorio));
    const todos = Array.from(new Set([...TERRITORIOS_VALIDOS, ...enDatos])).sort();

    select.innerHTML =
      '<option value="">Todos los territorios</option>' +
      todos.map(t => {
        const sel = t === actual ? ' selected' : '';
        return '<option value="' + escapar(t) + '"' + sel + '>' + escapar(t) + '</option>';
      }).join('');
  }

  /**
   * Pinta los chips de filtros activos (con botón para quitarlos).
   */
  function renderChipsFiltros() {
    const $wrapper = document.getElementById('filtros-activos');
    const chips = [];

    if (state.filtroComuna) {
      chips.push({
        label: state.filtroComuna,
        tipo: 'comuna'
      });
    }
    if (state.filtroBusqueda) {
      chips.push({
        label: '"' + state.filtroBusqueda + '"',
        tipo: 'busqueda'
      });
    }

    if (chips.length === 0) {
      $wrapper.hidden = true;
      return;
    }

    $wrapper.hidden = false;
    $wrapper.innerHTML =
      '<span class="filtros-activos-label">Filtros activos:</span>' +
      chips.map(c =>
        '<button class="filtro-chip" type="button" data-quitar="' + c.tipo + '" ' +
        'aria-label="Quitar filtro ' + escapar(c.label) + '">' +
          escapar(c.label) +
          '<span class="filtro-chip-close" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">' +
              '<line x1="18" y1="6" x2="6" y2="18"></line>' +
              '<line x1="6" y1="6" x2="18" y2="18"></line>' +
            '</svg>' +
          '</span>' +
        '</button>'
      ).join('');

    // Enganchar los botones
    $wrapper.querySelectorAll('[data-quitar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tipo = btn.dataset.quitar;
        if (tipo === 'comuna') {
          state.filtroComuna = '';
          document.getElementById('filtro-comuna').value = '';
        } else if (tipo === 'busqueda') {
          state.filtroBusqueda = '';
          document.getElementById('filtro-busqueda').value = '';
          document.getElementById('btn-limpiar-busqueda').hidden = true;
        }
        render();
        anunciar('Filtro quitado');
      });
    });
  }

  /**
   * Actualiza el texto del botón de refresh con el tiempo relativo.
   */
  function actualizarTimestamp() {
    const $ts = document.getElementById('timestamp-actualizacion');
    const $btn = document.getElementById('btn-actualizar');
    if (state.cargando) {
      $ts.textContent = 'Actualizando...';
      $btn.setAttribute('aria-busy', 'true');
      return;
    }
    $btn.removeAttribute('aria-busy');
    if (!state.ultimaActualizacion) {
      $ts.textContent = 'Nunca';
      return;
    }
    $ts.textContent = tiempoRelativo(state.ultimaActualizacion);
  }

  /**
   * Renderiza los grupos de territorios con sus actividades.
   */
  function renderGrupos(grupos) {
    return grupos.map(g => {
      const tel = CONTACTOS[g.territorio];
      const contactoHtml = tel
        ? '<div class="grupo-territorio-contacto">📞 Contacto: <a href="tel:' + escapar(tel.replace(/[^\d+]/g, '')) + '">' + escapar(tel) + '</a></div>'
        : '';

      return '' +
        '<section class="grupo-territorio" aria-labelledby="terr-' + escapar(slug(g.territorio)) + '">' +
          '<header class="grupo-territorio-header">' +
            '<h3 class="grupo-territorio-nombre" id="terr-' + escapar(slug(g.territorio)) + '">' +
              '<svg class="grupo-territorio-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
                '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>' +
                '<circle cx="12" cy="10" r="3"></circle>' +
              '</svg>' +
              escapar(g.territorio) +
            '</h3>' +
            '<span class="grupo-territorio-contador">' +
              g.actividades.length + (g.actividades.length === 1 ? ' actividad' : ' actividades') +
            '</span>' +
          '</header>' +
          contactoHtml +
          '<div class="actividades-grupo">' +
            g.actividades.map(renderTarjeta).join('') +
          '</div>' +
        '</section>';
    }).join('');
  }

  /**
   * Renderiza una tarjeta individual de actividad.
   */
  function renderTarjeta(a) {
    const clasesEstado = a.estado === 'Cancelada' ? ' actividad--cancelada'
                       : a.estado === 'Ajustada'  ? ' actividad--ajustada' : '';

    const horaTexto = a.horaInicio
      ? (a.horaInicio + (a.horaFin ? ' – ' + a.horaFin : ''))
      : 'Sin hora definida';

    const badgeEstado = a.estado !== 'Programada'
      ? '<div class="actividad-estado actividad-estado--' + (a.estado === 'Cancelada' ? 'cancelada' : 'ajustada') + '">' +
          (a.estado === 'Cancelada' ? '✕ Esta actividad fue cancelada' : 'ℹ Actividad con cambios') +
        '</div>'
      : '';

    // Nota: dropdown destacado si existe
    const notaHtml = a.nota
      ? '<details class="actividad-nota">' +
          '<summary class="actividad-nota-toggle">📝 Ver nota de cambio</summary>' +
          '<div class="actividad-nota-contenido">' + escapar(a.nota) + '</div>' +
        '</details>'
      : '';

    // Espejo: dropdown destacado con TODOS los campos (importante para PDF)
    const espejoHtml = a.espejoActividad
      ? renderEspejo(a)
      : '';

    return '' +
      '<article class="actividad' + clasesEstado + '">' +
        '<div class="actividad-hora">' +
          '<svg class="actividad-hora-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="10"></circle>' +
            '<polyline points="12 6 12 12 16 14"></polyline>' +
          '</svg>' +
          escapar(horaTexto) +
        '</div>' +
        '<h4 class="actividad-titulo">' + escapar(a.actividad) + '</h4>' +
        '<div class="actividad-meta">' +
          (a.lugar ? renderMetaItem('map-pin', a.lugar) : '') +
          (a.responsable ? renderMetaItem('user', a.responsable) : '') +
        '</div>' +
        badgeEstado +
        notaHtml +
        espejoHtml +
      '</article>';
  }

  function renderEspejo(a) {
    const horaEspejo = a.espejoHoraInicio
      ? (a.espejoHoraInicio + (a.espejoHoraFin ? ' – ' + a.espejoHoraFin : ''))
      : '';

    return '' +
      '<details class="actividad-espejo">' +
        '<summary class="actividad-espejo-toggle">' +
          '<span class="actividad-espejo-toggle-label">' +
            '<svg class="actividad-espejo-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
              '<path d="M17 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10z"></path>' +
              '<path d="M12 7v10"></path>' +
            '</svg>' +
            'Actividad espejo (para personas que requieren cuidado)' +
          '</span>' +
          '<svg class="actividad-espejo-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<polyline points="6 9 12 15 18 9"></polyline>' +
          '</svg>' +
        '</summary>' +
        '<div class="actividad-espejo-contenido">' +
          '<div class="actividad-espejo-titulo">' + escapar(a.espejoActividad) + '</div>' +
          (horaEspejo ? '<div>🕐 ' + escapar(horaEspejo) + '</div>' : '') +
          (a.espejoLugar ? '<div>📍 ' + escapar(a.espejoLugar) + '</div>' : '') +
          (a.espejoResponsable ? '<div>👤 ' + escapar(a.espejoResponsable) + '</div>' : '') +
        '</div>' +
      '</details>';
  }

  function renderMetaItem(icono, texto) {
    const iconos = {
      'map-pin': '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
      'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>'
    };
    return '<div class="actividad-meta-item">' +
      '<svg class="actividad-meta-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
        iconos[icono] +
      '</svg>' +
      '<span>' + escapar(texto) + '</span>' +
    '</div>';
  }

  /**
   * Convierte texto a slug seguro para IDs.
   */
  function slug(s) {
    return normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Escapa HTML para prevenir XSS. Los datos vienen de un Sheets que
   * articulación edita manualmente; este es un safeguard por si algún
   * día alguien pega algo con HTML por accidente.
   */
  function escapar(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Anuncia un mensaje al lector de pantalla (accesibilidad).
   */
  function anunciar(mensaje) {
    const el = document.getElementById('anuncio-sr');
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = mensaje; }, 50);
  }

  /**
   * Muestra un error explícitamente.
   */
  function mostrarError(mensaje) {
    state.cargando = false;
    state.error = mensaje;
    render();
  }

  /**
   * Conecta interacciones específicas de las tarjetas una vez renderizadas.
   * (Los <details> funcionan solos; esto es por si en el futuro agregamos más.)
   */
  function conectarInteraccionesTarjetas() {
    // Hook de futuro: aquí se añaden listeners específicos de tarjeta
  }

  // ============================================================
  // 7. INTERACCIONES DE UI
  // ============================================================

  function conectarEventos() {
    // Botón de actualizar
    const $btnRefresh = document.getElementById('btn-actualizar');
    $btnRefresh.addEventListener('click', () => {
      cargarDatos();
    });

    // Filtro: territorio
    const $comuna = document.getElementById('filtro-comuna');
    $comuna.addEventListener('change', (e) => {
      state.filtroComuna = e.target.value;
      render();
      anunciar(state.filtroComuna
        ? 'Filtro por territorio: ' + state.filtroComuna
        : 'Mostrando todos los territorios');
    });

    // Toggle del buscador: la lupa lo abre, limpiar lo cierra
    const $toggleBusqueda = document.getElementById('btn-toggle-busqueda');
    const $wrapperBusqueda = document.getElementById('filtro-busqueda-wrapper');
    const $busqueda = document.getElementById('filtro-busqueda');
    const $limpiar = document.getElementById('btn-limpiar-busqueda');

    $toggleBusqueda.addEventListener('click', () => {
      const abierto = !$wrapperBusqueda.hidden;
      if (abierto) {
        // Cerrar y limpiar cualquier búsqueda activa
        $wrapperBusqueda.hidden = true;
        $toggleBusqueda.setAttribute('aria-expanded', 'false');
        $toggleBusqueda.setAttribute('aria-label', 'Abrir buscador de actividades');
        if (state.filtroBusqueda) {
          state.filtroBusqueda = '';
          $busqueda.value = '';
          $limpiar.hidden = true;
          render();
        }
      } else {
        $wrapperBusqueda.hidden = false;
        $toggleBusqueda.setAttribute('aria-expanded', 'true');
        $toggleBusqueda.setAttribute('aria-label', 'Cerrar buscador');
        // Foco automático al abrir (mejor UX)
        setTimeout(() => $busqueda.focus(), 50);
      }
    });

    // Filtro: búsqueda (debounced para no saturar)
    let timeoutBusqueda;
    $busqueda.addEventListener('input', (e) => {
      const valor = e.target.value;
      $limpiar.hidden = valor.length === 0;
      clearTimeout(timeoutBusqueda);
      timeoutBusqueda = setTimeout(() => {
        state.filtroBusqueda = valor;
        render();
      }, 200);
    });

    $limpiar.addEventListener('click', () => {
      $busqueda.value = '';
      state.filtroBusqueda = '';
      $limpiar.hidden = true;
      // Cerrar también el buscador al limpiar
      $wrapperBusqueda.hidden = true;
      $toggleBusqueda.setAttribute('aria-expanded', 'false');
      $toggleBusqueda.setAttribute('aria-label', 'Abrir buscador de actividades');
      $toggleBusqueda.focus();
      render();
    });

    // Tabs de vista (Fase 1: solo "hoy" funciona)
    document.querySelectorAll('.vista-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.disabled) return;
        const vista = tab.dataset.vista;
        state.vistaActiva = vista;
        document.querySelectorAll('.vista-tab').forEach(t => {
          t.classList.toggle('vista-tab--activa', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        render();
      });
    });

    // Actualizar timestamp cada minuto
    setInterval(actualizarTimestamp, 60000);
  }

  // ============================================================
  // 8. INICIALIZACIÓN
  // ============================================================

  function init() {
    conectarEventos();
    cargarDatos();
  }

  // Exponer para debugging y botones inline
  window.appCuidarte = {
    cargarDatos: cargarDatos,
    state: state,
    render: render
  };

  // Arrancar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
