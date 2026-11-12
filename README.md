# Agenda Cuidarte

Agenda interactiva pública del Proyecto Cuidarte · Subsecretaría de Equidad de Género · Alcaldía de Cali.

Esta es la **Fase 1** (piloto). Lee los datos directamente de la hoja de cálculo de articulación en Google Sheets y los muestra en una web pública que funciona en celular y escritorio.

---

## 📋 Qué hace este sitio (hoy, Fase 1)

- ✅ Lee automáticamente el CSV publicado desde Google Sheets.
- ✅ Muestra las actividades de **hoy**, agrupadas por territorio.
- ✅ Filtro por territorio y búsqueda por texto.
- ✅ Botón de **actualizar** manual con estado "última actualización".
- ✅ Accesible: WCAG 2.1 AA, lector de pantalla, teclado, alto contraste.
- ✅ Responsive: funciona en celular, tablet y escritorio.
- ✅ Nunca muestra fechas pasadas.

## 🚧 Qué viene en Fase 2 (no está todavía)

- Vista semanal y mensual estilo calendario.
- Descarga de PDF con el filtro activo.
- Service Worker para que funcione con mala señal.
- URLs pre-filtradas para compartir por WhatsApp (ej. `/comuna-15/hoy`).
- Analíticas con GoatCounter.

---

## 🚀 Puesta en marcha (para quien instala el sitio por primera vez)

Son **4 pasos**. No necesitas saber programación.

### Paso 1 · Publicar el CSV desde Google Sheets

1. Abre la hoja de cálculo de la agenda en Google Sheets.
2. Clic en **Archivo → Compartir → Publicar en la web**.
3. En el panel que aparece:
   - **Pestaña**: elige "Actividades" (la pestaña con los datos).
   - **Formato**: elige "Valores separados por comas (.csv)".
4. Clic en **Publicar**. Te va a preguntar si estás segura; dile que sí.
5. Copia el link que te da. Debe terminar en algo como `pub?gid=0&single=true&output=csv`.

> 🔒 **Esto hace público el contenido de esa pestaña.** El link es "accesible con enlace" — solo quien lo tenga puede verlo, pero técnicamente es público. Como ya acordamos que los datos de la agenda son públicos, no hay problema.

### Paso 2 · Pegar la URL del CSV en el código

1. Abre el archivo `app.js` (está en la raíz del proyecto).
2. En la línea 29 (aproximadamente) vas a ver:
   ```javascript
   const CSV_URL = 'REEMPLAZAR_CON_URL_DEL_CSV_PUBLICADO';
   ```
3. Reemplaza `REEMPLAZAR_CON_URL_DEL_CSV_PUBLICADO` con la URL que copiaste del Sheets. Debe quedar así:
   ```javascript
   const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/XXXX.../pub?gid=0&single=true&output=csv';
   ```
4. Guarda el archivo.

### Paso 3 · Subir a GitHub

Si ya tienes el repositorio `agenda-cuidarte` creado en tu cuenta de GitHub (`mallacuidarte-dotcom`):

1. Entra al repositorio desde el navegador.
2. Arrastra todos los archivos de esta carpeta al navegador (o usa "Add file → Upload files").
3. Escribe un mensaje de commit (por ejemplo "Primera versión de la agenda").
4. Clic en "Commit changes".

Si todavía NO tienes el repositorio creado:

1. En GitHub, clic en el botón **+** arriba a la derecha → **New repository**.
2. **Repository name**: `agenda-cuidarte`.
3. Elige **Public** (necesario para GitHub Pages gratis).
4. **NO** marques "Add a README file" (ya tenemos uno).
5. Clic en **Create repository**.
6. En la pantalla que sigue, elige "uploading an existing file" y arrastra toda la carpeta.

### Paso 4 · Activar GitHub Pages

1. En tu repositorio, ve a **Settings** (arriba a la derecha).
2. En el menú lateral, clic en **Pages**.
3. En "Source", elige:
   - Branch: `main`
   - Folder: `/ (root)`
4. Clic en **Save**.
5. Espera 1-2 minutos. Vuelve a cargar esa página y arriba va a aparecer un mensaje verde:

   > Your site is live at `https://mallacuidarte-dotcom.github.io/agenda-cuidarte/`

6. Comparte esa URL. Esa es tu agenda pública.

---

## 🔄 Cómo actualizar los datos (uso cotidiano)

El sitio se refresca automáticamente cada vez que alguien entra, pero Google cachea el CSV entre **5 y 15 minutos**. Esto significa:

- Articulación edita Sheets → en 5-15 minutos el sitio ve los cambios.
- Si alguien quiere ver el cambio YA, puede tocar el botón **🔄 Actualizar** arriba a la derecha.

**No necesitas subir nada a GitHub cada vez que se edite la agenda.** El sitio lee en vivo desde Sheets.

---

## 🛠 Cómo cambiar el diseño o funcionalidad

- **`index.html`** — estructura de la página (qué elementos hay).
- **`styles.css`** — colores, tamaños, espaciado, animaciones.
- **`app.js`** — lógica (cómo se cargan los datos, filtros, qué se muestra).
- **`principios-diseno.md`** — directrices que debe respetar cualquier cambio visual.

### Para cambiar colores

Todo el sistema de colores está en `styles.css` al inicio, en la sección `:root`. Si cambias un color ahí, se actualiza en toda la app.

Ejemplo:
```css
:root {
  --violeta-900: #322A3C;   /* cambia aquí para cambiar el color principal */
}
```

### Para añadir territorios nuevos

Abre `app.js` y busca `TERRITORIOS_VALIDOS`. Agrega el nombre nuevo al array:

```javascript
const TERRITORIOS_VALIDOS = [
  'Buitrera', 'Centro', 'Comuna 1', 'Comuna 6', 'Comuna 15',
  'Comuna 20', 'Comuna 21', 'Golondrinas', 'Hormiguero', 'Saladito',
  'Comuna Nueva'  // <-- aquí
];
```

Si el nuevo territorio tiene contacto, agrégalo también en `CONTACTOS`.

---

## 🌐 Cuando quieras usar un dominio propio

En el futuro, si la Alcaldía te cede un subdominio tipo `cuidarte.cali.gov.co`:

1. Crea un archivo llamado `CNAME` (sin extensión) en la raíz del repo.
2. Pon adentro solo esto: `cuidarte.cali.gov.co`.
3. Pide a IT de la Alcaldía que configuren un registro DNS tipo `CNAME` que apunte a `mallacuidarte-dotcom.github.io`.
4. En **Settings → Pages**, pon ese dominio en "Custom domain" y marca "Enforce HTTPS".

Mientras no lo necesites, el dominio `mallacuidarte-dotcom.github.io/agenda-cuidarte/` funciona perfecto.

---

## ❓ Problemas comunes

### "No pudimos cargar la agenda"

- Verifica que el CSV siga publicado desde Sheets (Archivo → Compartir → Publicar en la web → debe seguir activo).
- Revisa que la URL en `app.js` esté correcta.
- Prueba el link del CSV directamente en el navegador — debería descargar un archivo.

### El sitio muestra datos viejos

- Toca el botón **🔄 Actualizar** arriba a la derecha.
- Si sigue viejo después de 15 minutos, confirma que articulación guardó los cambios en Sheets.

### Alguien despublicó el CSV por error

- Vuelve a Sheets → Archivo → Compartir → Publicar en la web → Publicar.
- La URL puede cambiar; actualízala en `app.js` y sube el cambio.

---

## 📂 Estructura de archivos

```
agenda-cuidarte/
├── index.html              Estructura de la página
├── styles.css              Diseño visual
├── app.js                  Lógica de la aplicación
├── README.md               Este documento
├── principios-diseno.md    Directrices de diseño y UX
├── .nojekyll               (técnico) Evita que GitHub procese con Jekyll
└── assets/
    └── logos/
        ├── cuidarte-color.svg
        ├── cuidarte-blanco.svg
        ├── alcaldia-color.svg
        └── alcaldia-blanco.svg
```

---

## 🧪 Cómo probar localmente antes de subir

Si quieres ver cómo se ve en tu computadora antes de publicar los cambios:

1. Abre una terminal en la carpeta del proyecto.
2. Si tienes Python instalado:
   ```bash
   python3 -m http.server 8000
   ```
3. Abre en el navegador: `http://localhost:8000`

No se puede simplemente abrir `index.html` con doble clic — el navegador bloquea el fetch del CSV por seguridad (CORS). Necesita servirse desde un servidor, aunque sea local.

---

## 📞 Soporte

- Para cambios de diseño o funcionalidad, abre una conversación con tu desarrollador de referencia.
- Antes de cualquier cambio visual importante, revisa `principios-diseno.md`.
