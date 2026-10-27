const axios = require('axios');
const cheerio = require('cheerio');

const BASE_API = 'https://hianime.at';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Desofuscador otaku-embed-v1 (Idéntico a la función de ani-cli)
 * json XOR "otaku-embed-v1" codificado en Base64
 */
function deobfuscateBlob(blob) {
  const bytes = Buffer.from(blob, 'base64');
  const key = Buffer.from('otaku-embed-v1', 'utf8');
  const decrypted = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    decrypted[i] = bytes[i] ^ key[i % key.length];
  }
  return decrypted.toString('utf8');
}

/**
 * Buscar anime en HiAnime (Motor ani-cli)
 */
async function search(query) {
  if (!query || !query.trim()) return [];
  const url = `${BASE_API}/search?keyword=${encodeURIComponent(query.trim())}`;

  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    });

    const $ = cheerio.load(res.data);
    const results = [];

    $('.flw-item').each((i, el) => {
      const link = $(el).find('.film-name a');
      const href = link.attr('href');
      const title = link.attr('title') || link.text().trim();
      const poster = $(el).find('.film-poster-img').attr('data-src') || $(el).find('.film-poster-img').attr('src');
      const type = $(el).find('.fdi-item').first().text().trim() || 'Anime';
      const duration = $(el).find('.fdi-duration').text().trim() || '';
      const subCount = $(el).find('.tick-sub').text().trim() || '';
      const dubCount = $(el).find('.tick-dub').text().trim() || '';

      if (href && title) {
        // href e.g. "/attack-on-titan-112" or "https://hianime.at/attack-on-titan-112"
        const slug = href.replace(/^https?:\/\/[^\/]+\//, '').replace(/^\//, '');
        results.push({
          id: slug,
          slug: slug,
          title: title,
          image: poster || 'https://via.placeholder.com/300x450?text=No+Image',
          type: type,
          duration: duration,
          episodesSub: subCount,
          episodesDub: dubCount,
          source: 'hianime',
          lang: 'Sub/Dub Multi'
        });
      }
    });

    return results;
  } catch (err) {
    console.error('Error buscando en HiAnime:', err.message);
    return [];
  }
}

/**
 * Obtener detalles y episodios de un anime en HiAnime
 */
async function getAnimeInfo(slug) {
  try {
    // El id numérico para la API de episodios es lo que está tras el último guion (como en ani-cli: ${1##*-})
    const animeId = slug.split('-').pop();

    // 1. Obtener información general de la página del anime
    let title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let synopsis = '';
    let image = '';
    let genres = [];

    try {
      const pageRes = await axios.get(`${BASE_API}/${slug}`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 8000
      });
      const $ = cheerio.load(pageRes.data);
      title = $('.film-name.dynamic-name').text().trim() || title;
      synopsis = $('.film-description .text').text().trim();
      image = $('.film-poster-img').attr('src') || $('.film-poster-img').attr('data-src');
      $('.item-list a').each((i, el) => {
        const text = $(el).text().trim();
        if (text && !genres.includes(text)) genres.push(text);
      });
    } catch (e) {
      console.warn('No se pudo cargar detalles HTML de hianime, continuando con API...');
    }

    // 2. Obtener lista de episodios de la API
    const epRes = await axios.get(`${BASE_API}/api/theme/episode/list/${animeId}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    });

    const episodes = [];
    if (epRes.data && epRes.data.html) {
      const $ep = cheerio.load(epRes.data.html);
      $ep('.ep-item').each((i, el) => {
        const epId = $ep(el).attr('data-id');
        const epNo = $ep(el).attr('data-number');
        const epTitle = $ep(el).attr('title') || $ep(el).text().trim() || `Episodio ${epNo}`;
        if (epId && epNo) {
          episodes.push({
            id: epId,
            number: parseInt(epNo, 10) || epNo,
            title: epTitle
          });
        }
      });
    }

    return {
      slug,
      animeId,
      title,
      synopsis,
      image,
      genres,
      episodes,
      totalEpisodes: episodes.length,
      source: 'hianime'
    };
  } catch (err) {
    console.error(`Error en anime ${slug} (HiAnime):`, err.stack);
    return null;
  }
}

/**
 * Obtener todos los servidores de reproducción disponibles (HD-1 Megaplay, ZokoAnime, etc.)
 */
async function getEpisodeStream(epId, mode = 'sub') {
  try {
    const serversRes = await axios.get(`${BASE_API}/api/theme/episode/servers?episodeId=${epId}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    });

    if (!serversRes.data || !serversRes.data.html) {
      throw new Error('No se encontraron servidores para el episodio ' + epId);
    }

    const $ = cheerio.load(serversRes.data.html);
    const rawServers = [];

    $('.server-item').each((i, el) => {
      rawServers.push({
        id: $(el).attr('data-id'),
        serverId: $(el).attr('data-server-id'),
        serverName: $(el).text().trim(),
        type: $(el).attr('data-type') || 'sub',
        hash: $(el).attr('data-hash')
      });
    });

    const playableServers = [];
    let directStream = null;

    // Ordenar para priorizar HD-1 (Megaplay) que tiene servidores y CDN 100% activos
    rawServers.sort((a, b) => {
      if (a.serverName.toLowerCase().includes('hd-1')) return -1;
      if (b.serverName.toLowerCase().includes('hd-1')) return 1;
      return 0;
    });

    for (const s of rawServers) {
      if (!s.hash) continue;
      try {
        const decodedEmbedUrl = Buffer.from(s.hash, 'base64').toString('utf8');
        const isDub = s.type === 'dub';
        const label = `Servidor ${s.serverName} (${isDub ? 'Audio Latino / Dub' : 'Subtitulado'})`;

        playableServers.push({
          name: label,
          embedUrl: decodedEmbedUrl,
          serverName: s.serverName,
          type: 'iframe',
          mode: s.type,
          isDub: isDub
        });

        // Si es ZokoAnime, intentar extraer también el blob por si se puede obtener subtítulos
        if (s.serverName.toLowerCase().includes('zoko') && !directStream) {
          try {
            const embedRes = await axios.get(decodedEmbedUrl, {
              headers: { 'User-Agent': USER_AGENT, 'Referer': BASE_API + '/' },
              timeout: 4000
            });
            const matchBlob = embedRes.data.match(/window\.__P\s*=\s*"([^"]+)"/);
            if (matchBlob) {
              const decryptedJsonStr = deobfuscateBlob(matchBlob[1]);
              const streamData = JSON.parse(decryptedJsonStr);
              if (streamData && streamData.src) {
                directStream = {
                  m3u8: streamData.src,
                  subtitles: (streamData.subtitles || []).map(sub => ({
                    lang: sub.lang || 'en',
                    label: sub.label || 'English',
                    src: sub.src
                  })),
                  referer: decodedEmbedUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] + '/'
                };
              }
            }
          } catch (e) {
            // direct stream opcional
          }
        }
      } catch (err) {
        // Ignorar servidor con hash inválido
      }
    }

    if (playableServers.length === 0) {
      throw new Error('No se encontraron servidores reproducibles para este episodio');
    }

    return {
      success: true,
      servers: playableServers,
      directStream: directStream,
      source: 'hianime'
    };
  } catch (err) {
    console.error(`Error obteniendo servidores epId ${epId}:`, err.message);
    return {
      success: false,
      error: err.message,
      servers: []
    };
  }
}

module.exports = {
  search,
  getAnimeInfo,
  getEpisodeStream
};
