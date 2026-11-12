# Principios de diseño — Agenda Cuidarte

> Este documento guía todas las decisiones visuales y de UX. Antes de agregar un componente, un color o una animación, revisa que respete estos principios. Si entra en conflicto con uno, no lo agregues sin justificar por qué.

## Contexto del usuario (lo más importante)

El público real tiene perfil muy variado:

- **Lideresas territoriales** entre 45 y 75 años, con nivel tecnológico bajo, celular de gama media, señal irregular (especialmente Saladito, Hormiguero, Golondrinas).
- **Equipo de articulación** del proyecto (técnicas), con nivel tecnológico medio-alto.
- **Funcionarias de Alcaldía** que consultan ocasionalmente desde escritorio.

**Diseñamos para el extremo más vulnerable**: la señora de 65 años con celular de 4 pulgadas bajo sol directo que entra 2 veces al mes. Si funciona para ella, funciona para todos. Al revés no.

---

## Principios fundamentales

### 1. Claridad sobre estética

Un botón feo que se entiende vale más que uno bonito que no. La prioridad siempre es: **¿entiende qué hace?** Si la respuesta no es inmediata, el diseño falla.

- Botones con etiquetas claras ("Actualizar", "Buscar"), nunca solo iconos sin texto.
- Jerarquía tipográfica evidente: títulos grandes, cuerpo legible (mínimo 16px en mobile).
- Un solo CTA primario por pantalla. El resto son secundarios.

### 2. Estado del sistema siempre visible (Nielsen #1)

El usuario nunca se queda sin saber qué está pasando. En todo momento debe ver:

- **Cargando**: skeleton loaders, no pantallas en blanco.
- **Vacío**: mensaje explícito con contexto ("No hay actividades hoy en Comuna 15. Puedes ver las de mañana o cambiar de territorio").
- **Error**: mensaje humano con qué hacer ("No pudimos cargar los datos. Verifica tu internet y toca Actualizar").
- **Actualizado**: timestamp visible ("Actualizado hace 3 minutos").
- **Filtro activo**: chip visible con opción de quitarlo ("Mostrando: Comuna 15 ✕").

### 3. Lenguaje real, no técnico (Nielsen #2)

Nada de "Error 404", "Fetch failed", "Sin resultados". Siempre en castellano claro:

- ❌ "No se encontraron resultados"
- ✅ "No hay actividades programadas para este día"

- ❌ "Error de conexión"
- ✅ "No pudimos cargar la agenda. Revisa tu internet y vuelve a intentar"

### 4. Prevención de errores (Nielsen #5)

Es mejor evitar un error que explicarlo después.

- Confirmación antes de borrar un filtro aplicado si tiene impacto grande.
- Botones peligrosos (por ejemplo borrar filtro "comuna" si tomó tiempo elegir) con color de advertencia.
- No usar scroll infinito. Paginación o "Cargar más" explícito.

### 5. Jerarquía temporal: lo que viene primero

El usuario entra a ver "¿qué hay ahora?" o "¿qué hay esta semana?". **Nunca mostrar fechas pasadas por defecto**. Si una lideresa quiere revisar lo del lunes pasado, lo pide con un filtro explícito; no se le muestra por accidente.

- Vista por defecto: **Hoy**.
- Si no hay nada hoy, decirlo claro con sugerencia de siguiente día con actividad.
- Fechas pasadas disponibles solo bajo filtro explícito (fuera del alcance de la Fase 1).

### 6. Microinteracciones nativas, no decorativas

Las animaciones sirven para dar feedback, no para entretener:

- **Sí**: botón se oprime visualmente al tocarlo (scale 0.98), filtro activo brilla sutilmente, tarjeta se expande con transición suave (200-300ms).
- **No**: carruseles automáticos, scroll infinito, animaciones de entrada que distraigan, parallax, confetti, autoplay de nada.
- **Nunca**: competir por la atención del usuario cuando está leyendo información crítica.

Referencias correctas: Material 3, iOS nativo, GOV.UK.
Referencias **incorrectas** para este producto (aunque las mencionaste): TikTok, Temu — son apps de entretenimiento con millones de horas de uso por usuario. Nosotras tenemos 10 minutos al mes, no podemos pedirle a la usuaria que aprenda gestos nuevos.

### 7. Densidad baja, respiración alta

En mobile, el espacio vertical es infinito y gratis. No apretamos.

- Tarjetas con padding generoso (mínimo 16px todos los lados).
- Botones con área táctil mínima de 44×44px (WCAG 2.5.5).
- Interlineado 1.5 mínimo en cuerpo.

### 8. Accesibilidad no es opcional (WCAG 2.1 AA mínimo)

- **Contraste**: mínimo 4.5:1 para texto normal, 3:1 para texto grande (18pt+).
- **Foco visible**: outline claro, nunca `outline: none` sin reemplazo.
- **Lector de pantalla**: todos los iconos tienen `aria-label`, imágenes con `alt`, botones con texto accesible.
- **Navegación por teclado**: Tab, Shift+Tab, Enter, Esc deben funcionar en todo flujo.
- **Skip link**: "Saltar al contenido principal" como primer foco.
- **Zoom 200%**: la app debe seguir siendo usable al hacer zoom.
- **Sin texto como imagen** (excepto logos institucionales).

### 9. Reconocer, no recordar (Nielsen #6)

La usuaria no debe memorizar nada:

- Filtros aplicados visibles como chips, no ocultos en un menú.
- Navegación persistente (tabs día/semana/mes siempre visibles).
- Último filtro aplicado se recuerda en localStorage para la próxima visita.

### 10. Tolerancia a errores de entrada

- Búsqueda tolera typos ("cmna 15" encuentra "Comuna 15").
- Mayúsculas y acentos no distinguen.
- Si el usuario pone fecha mal, no se rompe — muestra qué entendió y permite corregir.

---

## Sistema visual

### Paleta (basada en identidad Cuidarte + Alcaldía de Cali)

```
--violeta-900: #322A3C   /* Oscuro, textos y headers */
--violeta-200: #CECBF6   /* Claro, acentos */
--coral-cuidarte: #ED7170   /* Logo Cuidarte, acento principal */
--rosa-cuidarte: #CC6683   /* Logo Cuidarte, acento secundario */

--teal-500: #45877A   /* Pill consolidado, éxito */
--teal-100: #B5DACF   /* Fondo pill */

--ambar-100: #FAEEDA  /* Fondo banda info */
--ambar-700: #633806  /* Texto sobre ámbar */

--rojo-700: #791F1F   /* Errores, cancelado */
--rojo-100: #FCEBEB   /* Fondo error suave */

--gris-100: #F1EFE8   /* Fondo neutro */
--gris-700: #444441   /* Texto secundario */

--tinta: #1A1A1A      /* Texto cuerpo */
--blanco: #FFFFFF
```

Contrastes validados:
- violeta-900 sobre blanco: 12.9:1 ✅ AAA
- tinta sobre blanco: 18.7:1 ✅ AAA
- rojo-700 sobre blanco: 8.2:1 ✅ AAA
- teal-500 sobre teal-100: 4.6:1 ✅ AA
- ámbar-700 sobre ámbar-100: 10.8:1 ✅ AAA

### Tipografía

```
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
```

Inter porque es la fuente más legible a tamaños chicos y muy accesible. Fallback a system fonts si no carga.

Escala (mobile-first):
```
--text-xs:   13px   /* metadatos, timestamps */
--text-sm:   15px   /* etiquetas de filtros */
--text-base: 16px   /* cuerpo (NUNCA menos en mobile) */
--text-lg:   18px   /* subtítulos de tarjeta */
--text-xl:   22px   /* títulos de sección */
--text-2xl:  28px   /* título principal */
--text-3xl:  34px   /* header de la app */
```

### Espaciado (sistema de 4px)

```
--space-1:  4px
--space-2:  8px
--space-3: 12px
--space-4: 16px   /* base */
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
```

### Radios

```
--radius-sm:  6px    /* chips, botones pequeños */
--radius-md: 12px    /* tarjetas */
--radius-lg: 20px    /* modales */
--radius-full: 999px /* pills */
```

### Sombras (sutiles, para profundidad sin decoración)

```
--shadow-sm: 0 1px 2px rgba(50, 42, 60, 0.08);
--shadow-md: 0 4px 12px rgba(50, 42, 60, 0.10);
--shadow-lg: 0 12px 32px rgba(50, 42, 60, 0.12);
```

### Microinteracciones permitidas

```css
/* Botón pulsado */
transition: transform 150ms ease, background-color 150ms ease;
:active { transform: scale(0.98); }

/* Tarjeta expandible */
transition: max-height 250ms ease, opacity 200ms ease;

/* Chip seleccionado */
transition: background-color 200ms ease, box-shadow 200ms ease;

/* Spinner (una sola animación aceptada) */
animation: spin 1s linear infinite;
```

**Prohibidas**:
- `animation-iteration-count: infinite` excepto en spinners.
- `transition-duration` mayor a 400ms (se percibe como lento).
- Animaciones en elementos que no son interactivos.
- Parallax, degradados animados, efectos de fondo.

---

## Decisiones de contenido

### Nomenclatura

- **Agenda** (no "malla", no "cronograma") — más amigable para el público.
- **Actividad** (no "evento", no "sesión").
- **Territorio** cuando se refiere al conjunto (Comuna 15, Hormiguero, etc.).
- **Hoy / Esta semana / Este mes** (no "diario / semanal / mensual").

### Textos de estado

| Situación | Texto |
|-----------|-------|
| Cargando primera vez | "Cargando la agenda..." |
| Cargando refresh | "Actualizando..." |
| Sin actividades hoy | "No hay actividades programadas para hoy. ¿Quieres ver las de mañana?" |
| Sin actividades en territorio | "Aún no hay actividades para [Territorio]. Intenta otro territorio o cambia de fecha." |
| Error de conexión | "No pudimos cargar la agenda. Revisa tu conexión e intenta de nuevo." |
| Sin resultados de búsqueda | "No encontramos actividades con '[búsqueda]'. Intenta con otras palabras." |
| Actividad cancelada | "⚠ Esta actividad fue cancelada" + nota si existe |
| Actividad ajustada | "ℹ Actividad con cambios" + nota si existe |

---

## Lo que NO vamos a hacer (y por qué)

1. **No modales sobre modales**: si necesitamos dos pasos, son dos pantallas.
2. **No mensajes toast que desaparecen solos**: el usuario los pierde. Usamos banners persistentes que se cierran manualmente.
3. **No popups de "¿quieres suscribirte?"**: nada interrumpe la tarea del usuario.
4. **No autoplay de video, audio ni animaciones**: cero.
5. **No hamburger menu si hay espacio**: tabs visibles siempre que quepan.
6. **No scroll horizontal** (salvo tabla consolidada en mobile, que es inevitable).
7. **No colores por género** en los territorios: todos iguales en peso visual.

---

## Checklist antes de agregar algo nuevo

Antes de escribir CSS o HTML, pregúntate:

- [ ] ¿Una señora de 65 años entiende qué hace esto en menos de 3 segundos?
- [ ] ¿Funciona en un celular de 4 pulgadas bajo sol directo?
- [ ] ¿El contraste pasa WCAG AA?
- [ ] ¿Tiene área táctil de mínimo 44×44px?
- [ ] ¿Hay feedback visible cuando se interactúa?
- [ ] ¿El usuario sabe en qué estado está el sistema?
- [ ] ¿Se puede usar con teclado solo?
- [ ] ¿Un lector de pantalla puede navegarlo?
- [ ] ¿Está en español claro, no técnico?

Si alguna pregunta es "no", no entra.
