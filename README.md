# 🎬 AniTV - Versión Web & PWA para ver Anime con Subtítulos en Español

Plataforma Web interactiva y **PWA (Progressive Web App)** inspirada en [ani-cli](https://github.com/pystardust/ani-cli), diseñada para ver anime con **subtítulos en español**, catálogo completo de episodios, barra de búsqueda en tiempo real y compatibilidad multiplataforma (Móvil, Tablet y Escritorio).

---

## ✨ Características Principales

1. **📱 Progressive Web App (PWA) Completa**:
   - **Instalable** en Android, Windows, Mac, Linux e iOS (mediante botón de instalación o *Añadir a pantalla de inicio*).
   - Modo de pantalla completa y experiencia como aplicación nativa.
   - **Service Worker (`sw.js`)** con caché inteligente y soporte offline para tus favoritos e historial.

2. **🔍 Barra Buscadora Inteligente**:
   - Búsqueda en tiempo real con debounce integrado (sin saturar la red).
   - Acceso rápido a animes populares (*One Piece*, *Solo Leveling*, *Naruto*, *Dandadan*, *Jujutsu Kaisen*, *Bleach*).
   - Limpieza instantánea y filtrado por capítulos.

3. **🇪🇸 Catálogo con Subtítulos en Español Nativo**:
   - Fuente principal optimizada con **JKanime**, garantizando subtítulos oficiales en español y estrenos al día.
   - Centralización automática estilo Netflix para agrupar todas las temporadas, películas y sagas bajo una sola ficha.

4. **📺 Reproductor Avanzado con Streaming Directo**:
   - Extracción de flujo HLS (.m3u8) nativo para reproducción fluida sin publicidad invasiva.
   - Múltiples servidores de respaldo disponibles con un solo clic.
   - Navegación fluida entre **Episodio Anterior** y **Episodio Siguiente**.
   - Modo pantalla completa y atajos de teclado (`Espacio` para pausa/play, `Flechas` para adelantar/retroceder, `F` para fullscreen, `N` para siguiente capítulo, `P` para capítulo anterior).

5. **💾 Continuar Viendo y Biblioteca Personal**:
   - Historial persistente en `localStorage`.
   - Marcador de episodios ya vistos con icono de verificación (`✓`).
   - Sistema de favoritos (Añadir a lista personal).

---

## 🚀 Cómo Iniciar la Aplicación

### 1. Iniciar el Servidor Web

En la carpeta del proyecto, ejecuta:

```bash
npm start
```

O directamente:

```bash
node server.js
```

### 2. Abrir en tu Navegador

Visita:
```
http://localhost:3000
```

---

## 📲 Cómo Instalar la PWA

- **En PC / Chrome / Edge**: Verás un botón **"Instalar App"** en la barra superior o el ícono de instalación en la barra de direcciones del navegador.
- **En Android (Chrome)**: Pulsa el botón **"Instalar App"** o el menú de tres puntos > *"Instalar aplicación"*.
- **En iPhone / iPad (Safari)**: Pulsa el botón *"Compartir"* > *"Añadir a la pantalla de inicio"*.

---

## 🛠️ Estructura del Proyecto

```
ani-tv/
├── package.json               # Dependencias (express, cheerio, axios, cors)
├── server.js                  # Servidor Express, API REST y proxies de streaming
├── src/
│   ├── scrapers/
│   │   └── jkanime.js         # Scraper de anime en español
│   └── utils/
│       └── centralizer.js     # Agrupador de temporadas estilo Netflix
├── public/
│   ├── index.html             # Shell de la PWA
│   ├── manifest.json          # Manifiesto de la PWA
│   ├── sw.js                  # Service Worker para caché y modo offline
│   ├── css/
│   │   └── style.css          # Diseño moderno estilo streaming oscuro
│   ├── js/
│   │   ├── app.js             # Lógica de búsqueda, vistas y favoritos
│   │   ├── player.js          # Controlador de video (Hls.js e iframes)
│   │   └── pwa.js             # Registro del Service Worker e instalación
│   └── icons/                 # Íconos de la PWA (192x192, 512x512 y maskable)
└── README.md
```
