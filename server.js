const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const jkanime = require('./src/scrapers/jkanime');
const hianime = require('./src/scrapers/hianime');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache en memoria para respuestas frecuentes (10 minutos)
const cache = new Map();
function getCached(key, ttlMs = 10 * 60 * 1000) {
  const item = cache.get(key);
  if (item && Date.now() - item.time < ttlMs) {
    return item.data;
  }
  return null;
}
function setCache(key, data) {
  cache.set(key, { time: Date.now(), data });
}

// 1. Búsqueda de animes
app.get('/api/search', async (req, res) => {
  const q = req.query.q || '';
  const source = req.query.source || 'all'; // jkanime, hianime, all

  if (!q.trim()) {
    return res.json({ success: true, results: [] });
  }

  const cacheKey = `search:${source}:${q.toLowerCase().trim()}`;
  const cached = getCached(cacheKey, 5 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    let results = [];
    if (source === 'jkanime' || source === 'all') {
      const jkResults = await jkanime.search(q);
      results = results.concat(jkResults);
    }
    if (source === 'hianime' || (source === 'all' && results.length < 5)) {
      const hiResults = await hianime.search(q);
      results = results.concat(hiResults);
    }

    const response = { success: true, count: results.length, results };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, results: [] });
  }
});

// 2. Últimos episodios estrenados
app.get('/api/latest', async (req, res) => {
  const cacheKey = 'latest:episodes';
  const cached = getCached(cacheKey, 5 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    const episodes = await jkanime.getLatest();
    const response = { success: true, count: episodes.length, episodes };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, episodes: [] });
  }
});

// 3. Animes destacados y tendencias (usando motor ani-cli para calidades 1080p y subtítulos en inglés/español)
app.get('/api/trending', async (req, res) => {
  const cacheKey = 'trending:anime:v2';
  const cached = getCached(cacheKey, 30 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    const popularQueries = ['Solo Leveling', 'One Piece', 'Dandadan', 'Chainsaw Man', 'Jujutsu Kaisen', 'Bleach'];
    const searchPromises = popularQueries.map(q => hianime.search(q));
    const searchResults = await Promise.all(searchPromises);

    const trending = [];
    searchResults.forEach((list) => {
      if (list && list.length > 0) {
        trending.push(list[0]);
      }
    });

    const response = { success: true, trending };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, trending: [] });
  }
});

// 4. Detalles de un anime y lista completa de episodios
app.get('/api/anime/:source/:slug', async (req, res) => {
  const { source, slug } = req.params;
  const cacheKey = `anime:${source}:${slug}`;
  const cached = getCached(cacheKey, 15 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    let data = null;
    if (source === 'jkanime') {
      data = await jkanime.getAnimeInfo(slug);
    } else if (source === 'hianime') {
      data = await hianime.getAnimeInfo(slug);
    }

    if (!data) {
      return res.status(404).json({ success: false, message: 'Anime no encontrado' });
    }

    const response = { success: true, anime: data };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cache de subtítulos traducidos en memoria
const vttCache = new Map();

/**
 * Traduce contenido WEBVTT dividiendo los cues en lotes respetando el límite de 350 caracteres
 */
async function translateVttContent(vttContent, fromLang = 'en', toLang = 'es') {
  const lines = vttContent.split('\n');
  const cues = [];
  let currentCue = null;
  const headerLines = [];
  let readingHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('-->')) {
      readingHeader = false;
      currentCue = { time: line, text: [] };
      cues.push(currentCue);
    } else if (readingHeader) {
      headerLines.push(line);
    } else if (currentCue) {
      if (line.trim().length > 0) {
        currentCue.text.push(line);
      }
    }
  }

  if (cues.length === 0) return vttContent;

  // Agrupar en lotes con longitud total menor a 350 caracteres para evitar errores de API
  const batches = [];
  let currentBatch = [];
  let currentLength = 0;

  for (const cue of cues) {
    const cleanText = cue.text.join(' ').replace(/<[^>]+>/g, '').trim();
    if (currentLength + cleanText.length + 5 > 350 && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLength = 0;
    }
    currentBatch.push(cue);
    currentLength += cleanText.length + 5;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  // Traducir los lotes en paralelo con concurrencia controlada (5 a la vez)
  const concurrency = 6;
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (batch) => {
        const textJoined = batch.map(c => c.text.join(' ').replace(/<[^>]+>/g, '')).join(' ||| ');
        try {
          const transRes = await axios.get(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textJoined)}&langpair=${fromLang}|${toLang}`,
            { timeout: 3500 }
          );
          const translatedRaw = transRes.data?.responseData?.translatedText;
          if (translatedRaw && !translatedRaw.includes('LIMIT EXCEEDED')) {
            const parts = translatedRaw.split('|||');
            batch.forEach((cue, bIdx) => {
              if (parts[bIdx]) {
                cue.translatedText = parts[bIdx].trim();
              }
            });
          }
        } catch (e) {
          // Si un lote falla o hay timeout, se mantiene el texto original
        }
      })
    );
  }

  // Reconstruir archivo VTT
  let output = 'WEBVTT\n\n';
  cues.forEach(cue => {
    output += `${cue.time}\n`;
    output += `${cue.translatedText || cue.text.join('\n')}\n\n`;
  });

  return output;
}

// 5. Servidores de reproducción para un episodio
app.get('/api/servers/:source/:slug/:epNo', async (req, res) => {
  const { source, slug, epNo } = req.params;
  const epId = req.query.epId; // Para hianime

  try {
    if (source === 'jkanime') {
      const data = await jkanime.getEpisodeServers(slug, epNo);
      return res.json({ success: true, ...data });
    } else if (source === 'hianime') {
      if (!epId) {
        return res.status(400).json({ success: false, error: 'epId es requerido para hianime' });
      }
      const stream = await hianime.getEpisodeStream(epId, req.query.mode || 'sub');
      if (!stream.success) {
        return res.json({ success: false, error: stream.error });
      }

      // Preparar lista de subtítulos con opciones explícitas en Inglés y Español
      const processedSubtitles = [];

      // 1. Encontrar subtítulo en inglés
      const enSub = (stream.subtitles || []).find(s => s.lang === 'en' || s.label?.toLowerCase().includes('english'));
      if (enSub) {
        // Opción 1: Subtítulos en Inglés originales
        processedSubtitles.push({
          lang: 'en',
          label: 'English (Inglés)',
          src: `/api/proxy/vtt?url=${encodeURIComponent(enSub.src)}&ref=${encodeURIComponent(stream.referer || '')}`,
          default: false
        });

        // Opción 2: Subtítulos en Español traducidos
        processedSubtitles.push({
          lang: 'es',
          label: 'Español (Spanish)',
          src: `/api/proxy/vtt/translate?url=${encodeURIComponent(enSub.src)}&ref=${encodeURIComponent(stream.referer || '')}&target=es`,
          default: true
        });
      }

      // 2. Agregar cualquier otro idioma nativo disponible en el stream
      (stream.subtitles || []).forEach(s => {
        if (s.lang !== 'en' && !s.label?.toLowerCase().includes('english')) {
          processedSubtitles.push({
            lang: s.lang || 'other',
            label: s.label || s.lang,
            src: `/api/proxy/vtt?url=${encodeURIComponent(s.src)}&ref=${encodeURIComponent(stream.referer || '')}`,
            default: s.lang === 'es'
          });
        }
      });

      return res.json({
        success: true,
        slug,
        episode: epNo,
        m3u8: stream.m3u8,
        referer: stream.referer,
        server: stream.server,
        type: stream.type,
        subtitles: processedSubtitles,
        skip: stream.skip
      });
    }

    res.status(400).json({ success: false, message: 'Fuente no reconocida' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Proxy para archivos VTT (subtítulos) sin problemas de CORS
app.get('/api/proxy/vtt', async (req, res) => {
  const vttUrl = req.query.url;
  const ref = req.query.ref || 'https://zokoanime.video/';

  if (!vttUrl) return res.status(400).send('URL requerida');

  try {
    const response = await axios.get(vttUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': ref
      },
      responseType: 'text',
      timeout: 8000
    });

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (err) {
    res.status(502).send('Error obteniendo subtítulos: ' + err.message);
  }
});

// 6.1. Endpoint de traducción para subtítulos VTT en tiempo real
app.get('/api/proxy/vtt/translate', async (req, res) => {
  const vttUrl = req.query.url;
  const ref = req.query.ref || 'https://zokoanime.video/';
  const target = req.query.target || 'es';

  if (!vttUrl) return res.status(400).send('URL requerida');

  const cacheKey = `${target}:${vttUrl}`;
  if (vttCache.has(cacheKey)) {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(vttCache.get(cacheKey));
  }

  try {
    const rawRes = await axios.get(vttUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': ref
      },
      responseType: 'text',
      timeout: 8000
    });

    const translatedVtt = await translateVttContent(rawRes.data, 'en', target);
    vttCache.set(cacheKey, translatedVtt);

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(translatedVtt);
  } catch (err) {
    console.warn('Fallback a VTT original por error en traducción:', err.message);
    try {
      const origRes = await axios.get(vttUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': ref },
        responseType: 'text'
      });
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(origRes.data);
    } catch (e2) {
      res.status(502).send('Error al obtener subtítulos');
    }
  }
});

// 7. Ruta de respaldo para SPA PWA (compatible con Express 5)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🎬 AniTV PWA Web Server activo en: http://localhost:${PORT}`);
  console.log(`📡 Fuentes disponibles:`);
  console.log(`   - 🇪🇸 JKanime (Español Nativo con Subtítulos)`);
  console.log(`   - 🌐 HiAnime (ani-cli v5.1.6 Engine)`);
  console.log(`===============================================`);
});
