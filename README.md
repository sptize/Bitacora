# Bitácora Dev

Diario digital para ingenieros de software: registros diarios, bugs, decisiones, ideas y snippets.
PWA en HTML, CSS y JavaScript vanilla. Sin backend, sin login y sin dependencias externas.
Los datos se guardan en **IndexedDB** dentro de tu dispositivo.

## Estructura

```
bitacora-dev/
├── index.html
├── styles.css
├── app.js
├── db.js
├── sw.js
├── manifest.webmanifest
├── README.md
└── icons/
    ├── favicon.ico
    ├── apple-touch-icon.png
    ├── icon-32.png … icon-512.png
    ├── icon-maskable-192.png
    └── icon-maskable-512.png
```

## 1. Abrir en VS Code

1. Descomprime `bitacora-dev.zip` (ya incluye la carpeta `icons/`).
2. En VS Code: **Archivo > Abrir carpeta…** y elige `bitacora-dev`.

## 2. Probar con Live Server

1. Instala la extensión **Live Server** (Ritwick Dey).
2. Clic derecho en `index.html` > **Open with Live Server**.
3. Abre `http://127.0.0.1:5500`. El service worker funciona en `localhost`.

Para ver cambios de archivos ya cacheados: DevTools > Application > Service Workers > **Update** (o sube `CACHE_VERSION` en `sw.js`).

## 3. Subir a GitHub

```bash
git init
git add .
git commit -m "Bitácora Dev"
git branch -M main
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

## 4. Activar GitHub Pages

1. En el repositorio: **Settings > Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `main`, carpeta `/ (root)`. Guarda.
4. Espera un minuto. La app quedará en `https://USUARIO.github.io/REPOSITORIO/`.

GitHub Pages sirve por **HTTPS**, necesario para service workers e instalación. Todas las rutas del proyecto son relativas, así que funciona bajo la subruta del repositorio.

## 5. Instalar en el móvil

- **Android (Chrome):** abre la URL, espera a que cargue una vez y pulsa **Instalar app** (o menú ⋮ > *Instalar aplicación*).
- **iPhone (Safari):** botón Compartir > **Añadir a pantalla de inicio**.

Tras la primera carga funciona sin conexión.

## Copias de seguridad

Los datos viven solo en este dispositivo. Si borras los datos del navegador o desinstalas la app, se pierden.
Usa el menú ⋮ > **Exportar copia (JSON)** con frecuencia y **Importar copia (JSON)** para restaurar.
Al importar, si una entrada ya existe se conserva la más reciente.

## Actualizar la app

En el móvil: menú ⋮ > **Actualizar aplicación**. Descarga la última versión y reinicia la app; tus entradas no se tocan. Requiere conexión.

Como desarrollador, sube el número de `CACHE_VERSION` en `sw.js` (por ejemplo `v2`) cada vez que cambies archivos.

## Íconos

Los íconos se generaron a partir de la imagen de la caja negra. Para reemplazarlos, mantén los mismos nombres y tamaños dentro de `icons/`.
