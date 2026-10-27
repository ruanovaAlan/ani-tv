const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://jkanime.net';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
};

/**
 * Buscar animes en JKanime (Español)
 */
async function search(query) {
  if (!query || !query.trim()) return [];
  const cleanQuery = query.trim().replace(/\s+/g, '_');
  const url = `${BASE_URL}/buscar/${encodeURIComponent(cleanQuery)}/`;
  
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const results = [];

    $('.anime__item').each((i, el) => {
      const linkEl = $(el).find('h5 a, a').first();
      const href = linkEl.attr('href') || $(el).attr('href');
      const title = $(el).find('h5 a, .anime__item__text h5, h5').first().text().trim() || linkEl.text().trim();
      let image = $(el).find('.anime__item__pic').attr('data-setbg') || $(el).find('img').attr('src');
      const type = $(el).find('.anime__item__text ul li, .ep').first().text().trim() || 'Anime';
      const desc = $(el).find('.synopsis, p').text().trim();

      if (href && title) {
        // Extraer slug del enlace (e.g. https://jkanime.net/naruto/ -> naruto)
        const match = href.match(/jkanime\.net\/([^\/]+)\/?$/);
        const slug = match ? match[1] : href.replace(/https?:\/\/jkanime\.net\/?/, '').replace(/\/$/, '');
        
        // Evitar slugs irrelevantes
        if (slug && !['buscar', 'directorio', 'horario', 'top'].includes(slug)) {
          results.push({
            id: slug,
            slug: slug,
            title: title,
            image: image || 'https://via.placeholder.com/300x450?text=No+Image',
            type: type,
            synopsis: desc,
            source: 'jkanime',
            lang: 'Español'
          });
        }
      }
    });

    return results;
  } catch (err) {
    console.error('Error buscando en JKanime:', err.message);
    return [];
  }
}

/**
 * Obtener últimos capítulos estrenados en JKanime
 */
async function getLatest() {
  try {
    const res = await axios.get(`${BASE_URL}/`, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const episodes = [];

    $('a[href*="jkanime.net/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      // Debe terminar en /{slug}/{numero}/
      const match = href.match(/jkanime\.net\/([^\/]+)\/(\d+)\/?$/);
      if (match) {
        const slug = match[1];
        const epNo = match[2];
        let title = $(el).find('h5, h6, .anime__item__text h5, .title').text().trim();
        if (!title || title.toLowerCase().includes('ver ahora') || title.length < 3) {
          title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        let image = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
        if (!image) {
          const style = $(el).find('.anime__item__pic, div[style*="background-image"]').attr('style') || '';
          const bgMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (bgMatch) image = bgMatch[1];
        }

        // Evitar duplicados
        if (!episodes.some(e => e.slug === slug && e.episode === epNo)) {
          episodes.push({
            slug: slug,
            title: title,
            episode: epNo,
            image: image || `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`,
            url: href,
            source: 'jkanime',
            lang: 'Español'
          });
        }
      }
    });

    return episodes.slice(0, 24);
  } catch (err) {
    console.error('Error obteniendo últimos episodios JKanime:', err.message);
    return [];
  }
}

/**
 * Obtener detalles y lista completa de episodios de un anime
 */
async function getAnimeInfo(slug) {
  try {
    const url = `${BASE_URL}/${slug}/`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data);

    const title = $('h1, .anime__details__title h3').first().text().trim() || 
                  slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const synopsis = $('.sinopsis, .anime__details__text p, p.sinopsis').first().text().trim() ||
                     $('.anime__details__text').text().trim();
    let image = $('.anime__details__pic').attr('data-setbg') || 
                $('.anime__details__pic img').attr('src') ||
                $('.anime_pic img').attr('src') ||
                `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;

    const genres = [];
    $('.anime__details__widget ul li a, .generos a').each((i, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const status = $('.anime__details__widget li:contains("Estado") span, .status').first().text().trim() || 'En emisión';

    // Obtener episodios mediante la llamada AJAX oficial de JKanime
    const token = $('meta[name="csrf-token"]').attr('content') || res.data.match(/var\s+token\s*=\s*'([^']+)'/)?.[1];
    const animeIdMatch = res.data.match(/\/ajax\/episodes\/(\d+)\//);
    const animeId = animeIdMatch ? animeIdMatch[1] : null;

    let episodes = [];
    if (token && animeId) {
      const cookies = res.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ');
      try {
        let page = 1;
        let total = 0;
        // Obtenemos la primera página (suele traer un lote o todos)
        const ajaxRes = await axios.post(
          `${BASE_URL}/ajax/episodes/${animeId}/${page}`,
          new URLSearchParams({ _token: token }).toString(),
          {
            headers: {
              ...HEADERS,
              'Referer': url,
              'X-Requested-With': 'XMLHttpRequest',
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'Cookie': cookies || ''
            },
            timeout: 7000
          }
        );

        total = ajaxRes.data.total || 0;
        const rawEps = ajaxRes.data.data || [];

        // Si hay episodios devueltos
        rawEps.forEach(item => {
          episodes.push({
            number: item.number,
            title: item.title || `Capítulo ${item.number}`,
            id: item.id,
            image: item.image ? (item.image.startsWith('http') ? item.image : `https://cdn.jkdesa.com/assets/images/animes/video/image_thumb/${item.image}`) : image
          });
        });

        // Si el total es mayor que los que vinieron, podemos cargar las páginas siguientes o sintetizar del 1 al total
        if (total > episodes.length) {
          // Generamos el listado del 1 al total para que el usuario tenga acceso a todos los episodios
          const existingNums = new Set(episodes.map(e => e.number));
          for (let n = 1; n <= total; n++) {
            if (!existingNums.has(n)) {
              episodes.push({
                number: n,
                title: `Capítulo ${n}`,
                id: n,
                image: image
              });
            }
          }
        }
      } catch (ajaxErr) {
        console.warn('Error en ajax de episodios JKanime:', ajaxErr.message);
      }
    }

    // Ordenar episodios ascendentemente
    episodes.sort((a, b) => a.number - b.number);

    // Fallback: si por alguna razón episodes está vacío, al menos dar capítulo 1
    if (episodes.length === 0) {
      episodes = [{ number: 1, title: 'Capítulo 1', id: 1, image: image }];
    }

    return {
      slug,
      title,
      synopsis,
      image,
      genres,
      status,
      episodes,
      totalEpisodes: episodes.length,
      source: 'jkanime',
      lang: 'Español'
    };
  } catch (err) {
    console.error(`Error obteniendo anime ${slug} en JKanime:`, err.message);
    return null;
  }
}

/**
 * Obtener servidores de un episodio específico
 */
async function getEpisodeServers(slug, epNo) {
  try {
    const url = `${BASE_URL}/${slug}/${epNo}/`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const matches = res.data.match(/video\[\d+\]\s*=\s*'([^']+)'/g) || [];

    const servers = [];
    const serverLabels = [
      'Servidor Desu (Recomendado)',
      'Servidor Um',
      'Servidor Umv',
      'Servidor JK Media',
      'Servidor Alternativo'
    ];

    matches.forEach((m, idx) => {
      const srcMatch = m.match(/src="([^"]+)"/);
      if (srcMatch) {
        let embedUrl = srcMatch[1];
        if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
        servers.push({
          name: serverLabels[idx] || `Servidor ${idx + 1}`,
          embedUrl: embedUrl,
          type: 'iframe',
          lang: 'Español'
        });
      }
    });

    return {
      slug,
      episode: epNo,
      servers,
      source: 'jkanime'
    };
  } catch (err) {
    console.error(`Error obteniendo servidores para ${slug} ep ${epNo}:`, err.message);
    return { slug, episode: epNo, servers: [], source: 'jkanime', error: err.message };
  }
}

module.exports = {
  search,
  getLatest,
  getAnimeInfo,
  getEpisodeServers
};
