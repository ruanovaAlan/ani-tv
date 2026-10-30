const express = require('express');
const cors = require('cors');
const path = require('path');
const jkanime = require('./src/scrapers/jkanime');
const { centralizeAnimeList, parseSeasonInfo } = require('./src/utils/centralizer');

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

// 1. Búsqueda de animes (Exclusivamente JKanime con Subtítulos en Español)
app.get('/api/search', async (req, res) => {
  const q = req.query.q || '';

  if (!q.trim()) {
    return res.json({ success: true, results: [] });
  }

  const cacheKey = `search:jkanime:${q.toLowerCase().trim()}`;
  const cached = getCached(cacheKey, 5 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    const rawResults = await jkanime.search(q);

    // Centralizar por franquicia (Netflix Style)
    const centralizedResults = centralizeAnimeList(rawResults);

    const response = { success: true, count: centralizedResults.length, results: centralizedResults };
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

// 3. Animes destacados y tendencias (Subtitulados al Español)
app.get('/api/trending', async (req, res) => {
  const cacheKey = 'trending:anime:es:v1';
  const cached = getCached(cacheKey, 30 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    const popularQueries = ['One Piece', 'Solo Leveling', 'Dandadan', 'Jujutsu Kaisen', 'Chainsaw Man', 'Kimetsu no Yaiba', 'Bleach'];
    const searchPromises = popularQueries.map(q => jkanime.search(q));
    const searchResults = await Promise.all(searchPromises);

    let rawTrending = [];
    searchResults.forEach((list) => {
      if (list && list.length > 0) {
        rawTrending = rawTrending.concat(list.slice(0, 3));
      }
    });

    const trending = centralizeAnimeList(rawTrending);

    const response = { success: true, trending };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, trending: [] });
  }
});

// 4. Detalles de un anime y lista completa de episodios (Soporta /api/anime/:slug y /api/anime/:source/:slug)
const getAnimeDetailsHandler = async (req, res) => {
  const slug = req.params.slug || req.params.source;
  const cacheKey = `anime:jkanime:${slug}`;
  const cached = getCached(cacheKey, 15 * 60 * 1000);
  if (cached) return res.json(cached);

  try {
    const data = await jkanime.getAnimeInfo(slug);

    if (!data) {
      return res.status(404).json({ success: false, message: 'Anime no encontrado' });
    }

    // Buscar temporadas de la misma franquicia para el selector estilo Netflix
    try {
      const { baseTitle } = parseSeasonInfo(data.title);
      const relatedResults = await jkanime.search(baseTitle);
      const centralized = centralizeAnimeList(relatedResults);
      const matchingFranchise = centralized.find(c => c.title.toLowerCase() === baseTitle.toLowerCase()) || centralized[0];
      if (matchingFranchise && matchingFranchise.seasons && matchingFranchise.seasons.length > 0) {
        data.seasons = matchingFranchise.seasons;
      } else {
        data.seasons = [{
          slug: data.slug,
          title: data.title,
          seasonLabel: 'Temporada 1',
          image: data.image
        }];
      }
    } catch (e) {
      data.seasons = [{
        slug: data.slug,
        title: data.title,
        seasonLabel: 'Temporada 1',
        image: data.image
      }];
    }

    const response = { success: true, anime: data };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/anime/:source/:slug', getAnimeDetailsHandler);
app.get('/api/anime/:slug', getAnimeDetailsHandler);

// 5. Servidores de reproducción para un episodio (Soporta /api/servers/:slug/:epNo y /api/servers/:source/:slug/:epNo)
const getServersHandler = async (req, res) => {
  const slug = req.params.slug;
  const epNo = req.params.epNo;

  try {
    const data = await jkanime.getEpisodeServers(slug, epNo);
    return res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.get('/api/servers/:source/:slug/:epNo', getServersHandler);
app.get('/api/servers/:slug/:epNo', getServersHandler);

// 6. Ruta de respaldo para SPA PWA (compatible con Express 5)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🎬 AniTV PWA Web Server activo en: http://localhost:${PORT}`);
  console.log(`📡 Fuente activa:`);
  console.log(`   - 🇪🇸 JKanime (Español Nativo con Subtítulos)`);
  console.log(`===============================================`);
});
