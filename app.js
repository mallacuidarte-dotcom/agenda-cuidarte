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
    actividades: [],        // Todas las actividades parseadas (incluye pasadas para vista semanal)
    filtroComuna: '',       // Territorio seleccionado ('' = todos)
    filtroBusqueda: '',     // Texto de búsqueda
    vistaActiva: 'hoy',     // 'hoy' | 'semana'
    semanaOffset: 0,        // 0 = esta semana, -1 = anterior, 1 = siguiente, etc.
    cargando: false,
    error: null,
    ultimaActualizacion: null
  };

  // Clave de localStorage para recordar si el usuario cerró la guía de filtro
  const GUIA_CERRADA_KEY = 'agenda-cuidarte:guia-filtro-cerrada';

  // URLs de las librerías para generar PDF. Se cargan solo cuando el usuario
  // hace clic en "Descargar PDF" (lazy load) para no inflar la carga inicial.
  const PDF_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const PDF_TABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
  let _pdfLibsCargadas = false;

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
   * Devuelve la semana lunes-domingo correspondiente a hoy + offset semanas.
   *
   * @param {number} offset - 0 = esta semana, -1 = anterior, 1 = siguiente.
   * @return {{inicio: Date, fin: Date, dias: Date[]}}
   */
  function obtenerSemana(offset) {
    offset = offset || 0;
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    base.setDate(base.getDate() + (offset * 7));

    // dow: 0=domingo, 1=lunes, ..., 6=sábado
    // Para una semana lunes-domingo, calcular cuántos días hay que retroceder.
    const dow = base.getDay();
    const diasAlLunes = dow === 0 ? -6 : 1 - dow;

    const inicio = new Date(base);
    inicio.setDate(base.getDate() + diasAlLunes);
    inicio.setHours(0, 0, 0, 0);

    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    fin.setHours(23, 59, 59, 999);

    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      d.setHours(12, 0, 0, 0);
      dias.push(d);
    }

    return { inicio, fin, dias };
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

  // Arrays reusables de nombres en español
  const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /**
   * Devuelve el nombre del día en español. abrev=true devuelve "lun", "mar", etc.
   */
  function diaEs_(d, abrev) {
    const idx = d.getDay();
    return abrev ? DIAS_CORTOS[idx] : DIAS_LARGOS[idx];
  }

  /**
   * Devuelve el nombre del mes en español (ignora tz: usamos la fecha local).
   */
  function mesEs_(d) {
    return MESES_LARGOS[d.getMonth()];
  }

  /**
   * Capitaliza la primera letra de un string: "hola" → "Hola".
   */
  function cap_(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * Formatea una fecha a "jueves 12 de noviembre de 2026" en español.
   */
  function formatearFechaLarga(d) {
    return diaEs_(d, false) + ' ' + d.getDate() + ' de ' + mesEs_(d) + ' de ' + d.getFullYear();
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
   * Convierte una hora formateada a minutos desde medianoche.
   * Usado para ORDENAR actividades por hora correctamente.
   *
   * Ejemplos:
   *   "9:00 a. m."  → 540  (9 * 60)
   *   "12:00 p. m." → 720  (mediodía)
   *   "3:30 p. m."  → 930
   *   "12:00 a. m." → 0    (medianoche)
   *   ""            → 999999 (sin hora: al final del grupo)
   *
   * Por qué: comparar "10:00" con "9:00" como texto da "10:00" < "9:00"
   * porque alfabéticamente "1" < "9". Convertir a minutos arregla eso.
   */
  function horaAMinutos(texto) {
    if (!texto) return 999999; // Sin hora: al final
    const m = texto.match(/^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m?\.?/i);
    if (!m) return 999999;

    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const esPM = m[3].toLowerCase() === 'p';

    // Manejar el caso especial de las 12:
    // 12 a.m. = medianoche (hora 0)
    // 12 p.m. = mediodía (hora 12)
    if (h === 12) {
      h = esPM ? 12 : 0;
    } else if (esPM) {
      h += 12;
    }

    return h * 60 + min;
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
    const resultado = [];

    for (const fila of filas) {
      // Lectura TOLERANTE: aceptamos varios nombres por columna para que no se
      // rompa si articulación cambia los encabezados del Sheets. Los primeros
      // valores son los que están en Sheets AHORA (noviembre 2026).
      const fecha = parsearFecha(obtenerCampo(fila, ['Fecha', 'fecha']));
      const territorio = normalizarTerritorio(obtenerCampo(fila, [
        'Comuna', 'comuna', 'Territorio', 'territorio'
      ]));
      const actividad = String(obtenerCampo(fila, ['Actividad', 'actividad']) || '').trim();

      // Skip si falta algo esencial. Las fechas pasadas NO se descartan aquí
      // porque la vista semanal permite navegar hacia atrás por decisión del usuario.
      // La vista "Hoy" las filtra por su cuenta en filtrarActividades().
      if (!fecha || !territorio || !actividad) continue;

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

    // Ordenar por fecha y luego por hora de inicio.
    // Convierte cada hora a minutos desde medianoche para comparar números,
    // no texto. Así "9:00 a. m." viene antes que "10:00 a. m." correctamente.
    resultado.sort((a, b) => {
      if (a.fecha - b.fecha !== 0) return a.fecha - b.fecha;
      return horaAMinutos(a.horaInicio) - horaAMinutos(b.horaInicio);
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

    // Vista "Semana": actividades en el rango de la semana (con offset)
    if (state.vistaActiva === 'semana') {
      const semana = obtenerSemana(state.semanaOffset);
      resultado = resultado.filter(a => a.fecha >= semana.inicio && a.fecha <= semana.fin);
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
    renderEncabezadoVista();
    renderChipsFiltros();
    renderGuiaFiltro();

    const $cargando = document.getElementById('estado-cargando');
    const $error = document.getElementById('estado-error');
    const $vacio = document.getElementById('estado-vacio');
    const $lista = document.getElementById('lista-actividades');
    const $resultados = document.getElementById('resultados-info');
    const $pdfBtn = document.getElementById('pdf-acciones');

    // Resetear visibilidad
    $cargando.hidden = true;
    $error.hidden = true;
    $vacio.hidden = true;
    $lista.hidden = true;
    $resultados.hidden = true;
    $pdfBtn.hidden = true;

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

    // En vista SEMANA siempre mostramos los 7 días (aunque vacíos), no el
    // estado de "sin resultados". El usuario eligió esa semana.
    if (state.vistaActiva === 'semana') {
      $lista.hidden = false;
      $lista.innerHTML = renderVistaSemana(filtradas);
      $resultados.hidden = false;
      document.getElementById('resultados-cantidad').textContent =
        filtradas.length + (filtradas.length === 1 ? ' actividad en esta semana' : ' actividades en esta semana') +
        (state.filtroComuna || state.filtroBusqueda ? ' con los filtros aplicados' : '');
      // Mostrar PDF solo si hay al menos una actividad (sino no tiene sentido descargar)
      if (filtradas.length > 0) $pdfBtn.hidden = false;
      return;
    }

    // Vista HOY: si no hay nada, estado vacío con mensaje contextual
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

    $pdfBtn.hidden = false;
  }

  /**
   * Muestra el encabezado correcto según la vista activa y actualiza su contenido.
   */
  function renderEncabezadoVista() {
    const $hoy = document.getElementById('encabezado-hoy');
    const $semana = document.getElementById('encabezado-semana');

    if (state.vistaActiva === 'semana') {
      $hoy.hidden = true;
      $semana.hidden = false;
      renderNavSemana();
    } else {
      $hoy.hidden = false;
      $semana.hidden = true;
      renderFechaActual();
    }
  }

  /**
   * Pinta la nav de semana: rango de fechas + botón "Volver a esta semana" si offset != 0.
   */
  function renderNavSemana() {
    const semana = obtenerSemana(state.semanaOffset);
    const $titulo = document.getElementById('semana-titulo');
    const $btnVolver = document.getElementById('btn-volver-hoy');

    const inicioDia = semana.inicio.getDate();
    const finDia = semana.fin.getDate();
    const inicioMes = mesEs_(semana.inicio);
    const finMes = mesEs_(semana.fin);
    const anio = semana.fin.getFullYear();

    // Si la semana cruza dos meses, mostrarlos ambos
    let titulo;
    if (inicioMes === finMes) {
      titulo = inicioDia + ' al ' + finDia + ' de ' + finMes + ' de ' + anio;
    } else {
      titulo = inicioDia + ' de ' + inicioMes + ' al ' + finDia + ' de ' + finMes + ' de ' + anio;
    }

    $titulo.textContent = cap_(titulo);
    $btnVolver.hidden = (state.semanaOffset === 0);
  }

  /**
   * Chip discreto de guía. Visible solo si:
   * - La vista es semana
   * - No hay filtro de territorio activo
   * - El usuario no lo cerró antes (localStorage)
   */
  function renderGuiaFiltro() {
    const $chip = document.getElementById('guia-filtro');
    let cerrada = false;
    try {
      cerrada = localStorage.getItem(GUIA_CERRADA_KEY) === 'true';
    } catch (e) {
      // En modo incógnito algunos navegadores lanzan excepción; ignorar.
    }
    const mostrar = (state.vistaActiva === 'semana') && !state.filtroComuna && !cerrada;
    $chip.hidden = !mostrar;
  }

  /**
   * Renderiza la vista semanal: 7 secciones (una por día) con sus actividades.
   * Días sin actividades: header + mensaje "Sin actividades programadas".
   * Día de hoy: resaltado. Días pasados: grises con badge "Ya pasó".
   */
  function renderVistaSemana(filtradas) {
    const semana = obtenerSemana(state.semanaOffset);
    const hoyKey = fechaKey(hoy());
    const hoyDate = hoy();

    return '<div class="dias-semana">' + semana.dias.map(dia => {
      const diaKey = fechaKey(dia);
      const esHoy = diaKey === hoyKey;
      const esPasado = dia < hoyDate && !esHoy;

      const actsDia = filtradas.filter(a => a.fechaKey === diaKey);

      let clase = 'dia-semana';
      if (esHoy)    clase += ' dia-semana--hoy';
      if (esPasado) clase += ' dia-semana--pasado';

      const nombreDia = diaEs_(dia, false);
      const numero = dia.getDate();
      const mes = mesEs_(dia);

      let badge = '';
      if (esHoy)    badge = '<span class="dia-semana-badge dia-semana-badge--hoy">HOY</span>';
      if (esPasado) badge = '<span class="dia-semana-badge dia-semana-badge--pasado">Ya pasó</span>';

      const header =
        '<header class="dia-semana-header">' +
          '<div class="dia-semana-nombre">' +
            '<span class="dia-semana-nombre-dia">' + escapar(nombreDia) + '</span>' +
            '<span class="dia-semana-nombre-fecha">' + numero + ' de ' + escapar(mes) + '</span>' +
            badge +
          '</div>' +
          '<span class="dia-semana-contador">' +
            (actsDia.length === 0 ? 'Sin actividades' :
             actsDia.length === 1 ? '1 actividad' :
             actsDia.length + ' actividades') +
          '</span>' +
        '</header>';

      let contenido;
      if (actsDia.length === 0) {
        contenido = '<p class="dia-semana-vacio">Sin actividades programadas para este día</p>';
      } else {
        // Las actividades ya vienen ordenadas por hora desde procesarFilas.
        // Dentro del día, las muestro directamente (no reagrupo por territorio);
        // cada tarjeta lleva un chip con el territorio.
        contenido = '<div class="dia-semana-actividades">' +
          actsDia.map(a => renderTarjetaConChip(a)).join('') +
        '</div>';
      }

      return '<section class="' + clase + '">' + header + contenido + '</section>';
    }).join('') + '</div>';
  }

  /**
   * Renderiza una tarjeta igual a la de vista "Hoy" pero con un chip de
   * territorio arriba. Útil en vista semanal donde las actividades no están
   * agrupadas por territorio, así que necesitan la etiqueta.
   */
  function renderTarjetaConChip(a) {
    // Reusar renderTarjeta y meter el chip al principio con una pequeña modificación:
    // inyectamos el chip después de la apertura del <article>.
    const base = renderTarjeta(a);
    const chip = '<span class="actividad-chip-territorio">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>' +
        '<circle cx="12" cy="10" r="3"></circle>' +
      '</svg>' +
      escapar(a.territorio) +
    '</span>';
    return base.replace(/^(<article class="actividad[^"]*">)/, '$1' + chip);
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

    // Tabs de vista
    document.querySelectorAll('.vista-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.disabled) return;
        const vista = tab.dataset.vista;
        state.vistaActiva = vista;
        // Al cambiar de vista, resetear offset de semana (más predecible)
        if (vista === 'semana') state.semanaOffset = 0;
        document.querySelectorAll('.vista-tab').forEach(t => {
          t.classList.toggle('vista-tab--activa', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        anunciar('Vista: ' + tab.textContent.trim());
        render();
      });
    });

    // Navegación de semana: anterior, siguiente, volver a hoy
    document.getElementById('btn-semana-anterior').addEventListener('click', () => {
      state.semanaOffset -= 1;
      render();
      anunciar('Semana anterior');
    });

    document.getElementById('btn-semana-siguiente').addEventListener('click', () => {
      state.semanaOffset += 1;
      render();
      anunciar('Semana siguiente');
    });

    document.getElementById('btn-volver-hoy').addEventListener('click', () => {
      state.semanaOffset = 0;
      render();
      anunciar('Volviendo a esta semana');
    });

    // Botón de descarga PDF
    document.getElementById('btn-descargar-pdf').addEventListener('click', () => {
      generarPdf();
    });

    // Chip de guía: cerrarlo guarda la decisión en localStorage para que no vuelva
    document.getElementById('btn-cerrar-guia').addEventListener('click', () => {
      try {
        localStorage.setItem(GUIA_CERRADA_KEY, 'true');
      } catch (e) {
        // Ignorar; si no hay localStorage, se cierra solo esta sesión
      }
      document.getElementById('guia-filtro').hidden = true;
    });

    // Actualizar timestamp cada minuto
    setInterval(actualizarTimestamp, 60000);
  }

  // ============================================================
  // 9. GENERACIÓN DE PDF (lazy load de jsPDF + autoTable)
  // ============================================================

  /**
   * Carga un script externo. Se usa para cargar jsPDF y autoTable solo cuando
   * el usuario toca "Descargar PDF" (lazy load — ahorra ~130KB en la carga inicial).
   */
  function cargarScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar: ' + url));
      document.head.appendChild(s);
    });
  }

  /**
   * Carga las librerías de PDF una sola vez por sesión.
   */
  async function cargarLibreriasPdf() {
    if (_pdfLibsCargadas) return;
    await cargarScript(PDF_LIB_URL);
    await cargarScript(PDF_TABLE_URL);
    _pdfLibsCargadas = true;
  }

  /**
   * Nombre del archivo PDF basado en vista y filtros.
   * Ejemplo: "agenda-cuidarte-hoy-12-nov-2026.pdf"
   */
  function nombrePdf() {
    const d = new Date();
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                   'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    let base = 'agenda-cuidarte';
    if (state.vistaActiva === 'hoy') {
      base += '-hoy-' + d.getDate() + '-' + meses[d.getMonth()] + '-' + d.getFullYear();
    } else if (state.vistaActiva === 'semana') {
      const sem = obtenerSemana(state.semanaOffset);
      base += '-semana-' + sem.inicio.getDate() + '-al-' + sem.fin.getDate() +
              '-' + meses[sem.fin.getMonth()] + '-' + sem.fin.getFullYear();
    }
    if (state.filtroComuna) {
      base += '-' + state.filtroComuna.toLowerCase().replace(/\s+/g, '-');
    }
    return base + '.pdf';
  }

  /**
   * Convierte un color hex "#322A3C" al array [R, G, B] que usa jsPDF.
   */
  function hex2rgb(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substr(0, 2), 16),
      parseInt(h.substr(2, 2), 16),
      parseInt(h.substr(4, 2), 16)
    ];
  }

  /**
   * Devuelve el contexto que identifica el PDF: título principal + rango.
   */
  function contextoPdf() {
    if (state.vistaActiva === 'hoy') {
      return {
        titulo: 'Agenda de hoy',
        subtitulo: cap_(formatearFechaLarga(hoy()))
      };
    }
    const sem = obtenerSemana(state.semanaOffset);
    const titulo = 'Agenda semanal';
    let sub;
    if (sem.inicio.getMonth() === sem.fin.getMonth()) {
      sub = sem.inicio.getDate() + ' al ' + sem.fin.getDate() + ' de ' + mesEs_(sem.fin) + ' de ' + sem.fin.getFullYear();
    } else {
      sub = sem.inicio.getDate() + ' de ' + mesEs_(sem.inicio) + ' al ' +
            sem.fin.getDate() + ' de ' + mesEs_(sem.fin) + ' de ' + sem.fin.getFullYear();
    }
    return { titulo: titulo, subtitulo: cap_(sub) };
  }

  /**
   * Agrupa las actividades filtradas por día. Para vista "hoy" solo hay un día;
   * para vista "semana" hay 7 (incluyendo los vacíos).
   */
  function agruparPorDiaParaPdf(filtradas) {
    if (state.vistaActiva === 'semana') {
      const sem = obtenerSemana(state.semanaOffset);
      return sem.dias.map(d => ({
        fecha: d,
        actividades: filtradas.filter(a => a.fechaKey === fechaKey(d))
      }));
    }
    // Vista hoy: un solo grupo con la fecha de hoy
    const h = hoy();
    return [{ fecha: h, actividades: filtradas }];
  }

  /**
   * Genera el PDF a partir del filtro activo y lo descarga.
   * Formato: header institucional + una sección por día + tabla de actividades.
   *
   * Detalle importante: en el PDF se muestran TODOS los datos de cada actividad
   * (espejo, nota, etc.), no en dropdowns. El PDF no es interactivo.
   */
  async function generarPdf() {
    const $btn = document.getElementById('btn-descargar-pdf');
    $btn.setAttribute('aria-busy', 'true');
    anunciar('Generando PDF, espera un momento');

    try {
      await cargarLibreriasPdf();

      const filtradas = filtrarActividades();
      if (filtradas.length === 0) {
        throw new Error('No hay actividades para descargar con los filtros actuales.');
      }

      // jsPDF se expone en window.jspdf.jsPDF (versión UMD)
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

      // Colores de la paleta institucional
      const COLOR_VIOLETA = hex2rgb('#322A3C');
      const COLOR_VIOLETA_CLARO = hex2rgb('#CECBF6');
      const COLOR_ROSA = hex2rgb('#CC6683');
      const COLOR_CORAL = hex2rgb('#ED7170');
      const COLOR_AMBAR_BG = hex2rgb('#FAEEDA');
      const COLOR_AMBAR_TX = hex2rgb('#633806');
      const COLOR_ROJO = hex2rgb('#791F1F');
      const COLOR_GRIS_BG = hex2rgb('#F1EFE8');
      const COLOR_GRIS_TX = hex2rgb('#444441');
      const COLOR_TINTA = hex2rgb('#1A1A1A');

      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 40; // Margen

      // ===== HEADER =====
      doc.setFillColor.apply(doc, COLOR_VIOLETA);
      doc.rect(0, 0, W, 90, 'F');

      const ctx = contextoPdf();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text(ctx.titulo, M, 40);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor.apply(doc, COLOR_VIOLETA_CLARO);
      doc.text(ctx.subtitulo, M, 60);

      doc.setFontSize(10);
      doc.text('Proyecto Cuidarte · Subsecretaría de Equidad de Género · Alcaldía de Cali', M, 78);

      // Chips de filtros aplicados debajo del header
      let yFiltros = 110;
      if (state.filtroComuna || state.filtroBusqueda) {
        doc.setFillColor.apply(doc, COLOR_AMBAR_BG);
        doc.rect(0, 90, W, 30, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor.apply(doc, COLOR_AMBAR_TX);
        let texto = 'Filtros activos: ';
        if (state.filtroComuna) texto += state.filtroComuna;
        if (state.filtroComuna && state.filtroBusqueda) texto += ' · ';
        if (state.filtroBusqueda) texto += 'búsqueda "' + state.filtroBusqueda + '"';
        doc.text(texto, M, 108);
        yFiltros = 140;
      }

      // ===== CONTENIDO: una sección por día =====
      const grupos = agruparPorDiaParaPdf(filtradas);
      let y = yFiltros + 10;

      grupos.forEach((grupo, idxGrupo) => {
        // Si no hay espacio para el header del día + al menos una actividad, salto de página
        if (y > H - 120) {
          doc.addPage();
          y = M + 10;
        }

        // Encabezado del día
        doc.setFillColor.apply(doc, COLOR_VIOLETA);
        doc.rect(M, y, W - 2 * M, 28, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        const nombreDia = cap_(diaEs_(grupo.fecha, false)) + ' ' + grupo.fecha.getDate() +
                          ' de ' + mesEs_(grupo.fecha);
        doc.text(nombreDia, M + 10, y + 18);

        // Contador a la derecha
        const contador = grupo.actividades.length === 0 ? 'Sin actividades' :
                        grupo.actividades.length === 1 ? '1 actividad' :
                        grupo.actividades.length + ' actividades';
        const contW = doc.getStringUnitWidth(contador) * 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(contador, W - M - 10 - contW, y + 18);

        y += 36;

        // Actividades del día (si hay)
        if (grupo.actividades.length === 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(10);
          doc.setTextColor.apply(doc, COLOR_GRIS_TX);
          doc.text('Sin actividades programadas para este día', M + 10, y + 5);
          y += 24;
        } else {
          grupo.actividades.forEach(a => {
            y = pintarActividadPdf(doc, a, y, W, H, M, {
              violeta: COLOR_VIOLETA,
              rosa: COLOR_ROSA,
              coral: COLOR_CORAL,
              ambarBg: COLOR_AMBAR_BG,
              ambarTx: COLOR_AMBAR_TX,
              rojo: COLOR_ROJO,
              grisBg: COLOR_GRIS_BG,
              grisTx: COLOR_GRIS_TX,
              tinta: COLOR_TINTA
            });
            y += 8;
          });
        }

        y += 12;
      });

      // ===== FOOTER en cada página =====
      const totalPaginas = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPaginas; i++) {
        doc.setPage(i);
        doc.setFillColor.apply(doc, COLOR_GRIS_BG);
        doc.rect(0, H - 30, W, 30, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, COLOR_GRIS_TX);
        const gen = 'Generado el ' + formatearFechaLarga(new Date()) + ' a las ' +
                    new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        doc.text(gen, M, H - 12);
        const pagTxt = 'Página ' + i + ' de ' + totalPaginas;
        const pagW = doc.getStringUnitWidth(pagTxt) * 8;
        doc.text(pagTxt, W - M - pagW, H - 12);
      }

      doc.save(nombrePdf());
      anunciar('PDF descargado correctamente');
    } catch (err) {
      console.error('Error al generar PDF:', err);
      alert('No pudimos generar el PDF: ' + err.message + '\n\nSi el problema persiste, revisa tu conexión a internet (la librería se descarga la primera vez).');
      anunciar('Error al generar PDF: ' + err.message);
    } finally {
      $btn.removeAttribute('aria-busy');
    }
  }

  /**
   * Pinta una actividad individual en el PDF. Devuelve la nueva Y.
   */
  function pintarActividadPdf(doc, a, y, W, H, M, colores) {
    // Salto de página si no cabe
    if (y > H - 100) {
      doc.addPage();
      y = M + 10;
    }

    const anchoTotal = W - 2 * M;
    const alturaBase = 60; // altura mínima estimada

    // Chip de territorio (siempre visible en PDF para dar contexto)
    doc.setFillColor(230, 226, 240);
    doc.roundedRect(M + 4, y, 100, 14, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, colores.violeta);
    doc.text(a.territorio, M + 10, y + 10);

    y += 20;

    // Hora
    const hora = a.horaInicio + (a.horaFin ? ' – ' + a.horaFin : '');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, colores.violeta);
    doc.text(hora || 'Sin hora', M + 4, y + 2);

    y += 14;

    // Título de la actividad
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    if (a.estado === 'Cancelada') {
      doc.setTextColor.apply(doc, colores.rojo);
    } else {
      doc.setTextColor.apply(doc, colores.tinta);
    }
    const tituloLineas = doc.splitTextToSize(a.actividad, anchoTotal - 10);
    doc.text(tituloLineas, M + 4, y + 2);
    y += tituloLineas.length * 14;

    // Metadata: lugar y responsable
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, colores.grisTx);
    if (a.lugar) {
      const l = doc.splitTextToSize('Lugar: ' + a.lugar, anchoTotal - 10);
      doc.text(l, M + 4, y + 10);
      y += l.length * 12;
    }
    if (a.responsable) {
      const r = doc.splitTextToSize('Responsable: ' + a.responsable, anchoTotal - 10);
      doc.text(r, M + 4, y + 10);
      y += r.length * 12;
    }

    // Badge de estado (si no es Programada)
    if (a.estado === 'Cancelada') {
      doc.setFillColor.apply(doc, colores.rojo);
      doc.roundedRect(M + 4, y + 6, 100, 16, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('CANCELADA', M + 12, y + 17);
      y += 24;
    } else if (a.estado === 'Ajustada') {
      doc.setFillColor.apply(doc, colores.ambarBg);
      doc.roundedRect(M + 4, y + 6, 120, 16, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, colores.ambarTx);
      doc.text('CON AJUSTES', M + 12, y + 17);
      y += 24;
    }

    // Nota de cambio: expandida (no colapsada como en la web)
    if (a.nota) {
      doc.setFillColor.apply(doc, colores.ambarBg);
      const notaLineas = doc.splitTextToSize('Nota: ' + a.nota, anchoTotal - 20);
      const altoNota = notaLineas.length * 12 + 10;
      doc.rect(M + 4, y + 6, anchoTotal - 8, altoNota, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, colores.ambarTx);
      doc.text(notaLineas, M + 10, y + 16);
      y += altoNota + 4;
    }

    // Actividad espejo: expandida (no colapsada como en la web)
    if (a.espejoActividad) {
      doc.setDrawColor.apply(doc, colores.coral);
      doc.setLineWidth(1.5);
      doc.line(M + 4, y + 10, M + anchoTotal, y + 10);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, colores.coral);
      doc.text('ACTIVIDAD ESPEJO · Para personas que requieren cuidado', M + 4, y + 22);
      y += 28;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor.apply(doc, colores.tinta);
      const esT = doc.splitTextToSize(a.espejoActividad, anchoTotal - 10);
      doc.text(esT, M + 4, y + 6);
      y += esT.length * 12 + 2;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, colores.grisTx);
      if (a.espejoHoraInicio) {
        doc.text('Hora: ' + a.espejoHoraInicio + (a.espejoHoraFin ? ' – ' + a.espejoHoraFin : ''), M + 4, y + 6);
        y += 12;
      }
      if (a.espejoLugar) {
        const l = doc.splitTextToSize('Lugar: ' + a.espejoLugar, anchoTotal - 10);
        doc.text(l, M + 4, y + 6);
        y += l.length * 12;
      }
      if (a.espejoResponsable) {
        const r = doc.splitTextToSize('Responsable: ' + a.espejoResponsable, anchoTotal - 10);
        doc.text(r, M + 4, y + 6);
        y += r.length * 12;
      }
    }

    // Línea separadora al final
    doc.setDrawColor(220, 218, 210);
    doc.setLineWidth(0.5);
    doc.line(M + 4, y + 10, M + anchoTotal, y + 10);
    y += 14;

    return y;
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
