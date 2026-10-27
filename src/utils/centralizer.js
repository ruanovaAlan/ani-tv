/**
 * Centralizador de Anime Estilo Netflix
 * Agrupa temporadas, secuelas, partes y películas bajo una única franquicia
 */

function parseSeasonInfo(title) {
  let cleanTitle = (title || '').trim();
  let seasonLabel = 'Temporada 1';
  let seasonOrder = 10;

  // Detectar patrones comunes de temporadas
  const seasonMatch = cleanTitle.match(/(?:Season|Temporada)\s*(\d+)/i);
  const nthSeasonMatch = cleanTitle.match(/(\d+)(?:st|nd|rd|th)\s*Season/i);
  const finalSeasonMatch = cleanTitle.match(/(?:The\s*)?Final\s*Season/i);
  const partMatch = cleanTitle.match(/Part\s*(\d+)/i);
  const courMatch = cleanTitle.match(/Cour\s*(\d+)/i);
  const movieMatch = cleanTitle.match(/(?:Movie|Película|Gekijouban)/i);
  const ovaMatch = cleanTitle.match(/(?:OVA|OAD|Special)/i);

  if (finalSeasonMatch) {
    seasonOrder = 900;
    seasonLabel = 'Temporada Final';
    if (partMatch) {
      seasonOrder += parseInt(partMatch[1], 10) * 10;
      seasonLabel += ` - Parte ${partMatch[1]}`;
    }
  } else if (seasonMatch) {
    const num = parseInt(seasonMatch[1], 10);
    seasonOrder = num * 100;
    seasonLabel = `Temporada ${num}`;
    if (partMatch) {
      seasonOrder += parseInt(partMatch[1], 10) * 10;
      seasonLabel += ` - Parte ${partMatch[1]}`;
    }
  } else if (nthSeasonMatch) {
    const num = parseInt(nthSeasonMatch[1], 10);
    seasonOrder = num * 100;
    seasonLabel = `Temporada ${num}`;
    if (partMatch) {
      seasonOrder += parseInt(partMatch[1], 10) * 10;
      seasonLabel += ` - Parte ${partMatch[1]}`;
    }
  } else if (partMatch) {
    seasonOrder = 100 + parseInt(partMatch[1], 10) * 10;
    seasonLabel = `Parte ${partMatch[1]}`;
  } else if (courMatch) {
    seasonOrder = 100 + parseInt(courMatch[1], 10) * 10;
    seasonLabel = `Cour ${courMatch[1]}`;
  } else if (movieMatch) {
    seasonOrder = 800;
    seasonLabel = 'Película';
  } else if (ovaMatch) {
    seasonOrder = 700;
    seasonLabel = 'OVA / Especial';
  }

  // Extraer el título base de la franquicia eliminando marcadores de temporadas y subtítulos de arco
  let baseTitle = cleanTitle
    .replace(/(?::\s*)?(?:The\s*)?Final\s*Season(?:\s*Part\s*\d+)?(?:\s*-\s*The Final Chapters)?/gi, '')
    .replace(/(?::\s*)?(?:Season|Temporada)\s*\d+(?:\s*:\s*[^\:]+)?(?:\s*Part\s*\d+)?/gi, '')
    .replace(/(?::\s*)?\d+(?:st|nd|rd|th)\s*Season(?:\s*Part\s*\d+)?/gi, '')
    .replace(/(?::\s*)?Part\s*\d+/gi, '')
    .replace(/(?::\s*)?Cour\s*\d+/gi, '')
    .trim()
    .replace(/[:\-–]$/, '')
    .trim();

  return {
    baseTitle: baseTitle || cleanTitle,
    seasonLabel,
    seasonOrder
  };
}

/**
 * Agrupa una lista de animes por franquicia (centralización estilo Netflix)
 */
function centralizeAnimeList(rawList) {
  if (!rawList || !Array.isArray(rawList) || rawList.length === 0) return [];

  // Paso 1: Analizar títulos y extraer información de temporada
  const parsed = rawList.map(item => {
    const info = parseSeasonInfo(item.title);
    return {
      ...item,
      baseTitle: info.baseTitle,
      seasonLabel: info.seasonLabel,
      seasonOrder: info.seasonOrder
    };
  });

  // Paso 2: Agrupar por prefijos de saga (ej: "Bleach: Thousand-Year Blood War" se agrupa bajo "Bleach")
  const knownBases = [...new Set(parsed.map(p => p.baseTitle.toLowerCase()))].sort((a, b) => a.length - b.length);

  parsed.forEach(item => {
    const lower = item.baseTitle.toLowerCase();
    for (const kb of knownBases) {
      if (kb.length >= 4 && lower !== kb) {
        if (lower.startsWith(kb + ':') || lower.startsWith(kb + ' -') || lower.startsWith(kb + ' –')) {
          const subArc = item.baseTitle.substring(kb.length).replace(/^[\s:\-–]+/, '').trim();
          const parentItem = parsed.find(p => p.baseTitle.toLowerCase() === kb);
          item.baseTitle = parentItem ? parentItem.baseTitle : item.baseTitle;
          if (item.seasonLabel === 'Temporada 1') {
            item.seasonLabel = subArc || 'Temporada / Saga';
            item.seasonOrder = 500;
          }
          break;
        }
      }
    }
  });

  // Paso 3: Agrupar en mapa por fuente y título base
  const groups = new Map();
  for (const item of parsed) {
    const key = `${item.source || 'all'}:${item.baseTitle.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: item.id || item.slug,
        slug: item.slug || item.id,
        title: item.baseTitle,
        image: item.image,
        type: item.type,
        duration: item.duration,
        source: item.source,
        lang: item.lang,
        seasons: []
      });
    }
    const group = groups.get(key);
    group.seasons.push({
      id: item.id || item.slug,
      slug: item.slug || item.id,
      title: item.title,
      seasonLabel: item.seasonLabel,
      seasonOrder: item.seasonOrder,
      image: item.image,
      episodesSub: item.episodesSub || '',
      episodesDub: item.episodesDub || '',
      type: item.type
    });
  }

  // Paso 4: Finalizar lista agrupada
  const centralized = [];
  for (const group of groups.values()) {
    // Ordenar temporadas cronológicamente
    group.seasons.sort((a, b) => a.seasonOrder - b.seasonOrder);

    // Si tiene múltiples temporadas, asegurarse de que las etiquetas sean descriptivas
    if (group.seasons.length > 1) {
      group.seasons.forEach((s, idx) => {
        if (!s.seasonLabel || s.seasonLabel === 'Temporada 1') {
          s.seasonLabel = `Temporada ${idx + 1}`;
        }
      });
    }

    group.totalSeasons = group.seasons.length;
    group.image = group.seasons[0].image || group.image;
    group.slug = group.seasons[0].slug;
    group.id = group.seasons[0].id;
    centralized.push(group);
  }

  return centralized;
}

module.exports = {
  parseSeasonInfo,
  centralizeAnimeList
};
