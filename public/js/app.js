// AniTV Main Application Logic
const state = {
  currentTab: 'home',
  currentSource: 'hianime', // 'hianime' (ani-cli: subtítulos inglés y español + 1080p), 'jkanime', 'all'
  searchQuery: '',
  trending: [],
  latestEpisodes: [],
  favorites: JSON.parse(localStorage.getItem('anitv_favorites') || '[]'),
  history: JSON.parse(localStorage.getItem('anitv_history') || '[]'),
  currentAnimeDetails: null
};

// Elementos del DOM
const searchInput = document.getElementById('searchInput');
const btnClearSearch = document.getElementById('btnClearSearch');
const sourceFilter = document.getElementById('sourceFilter');
const searchChips = document.getElementById('searchChips');
const heroSection = document.getElementById('heroSection');
const continueWatchingSection = document.getElementById('continueWatchingSection');
const continueWatchingList = document.getElementById('continueWatchingList');
const searchResultsSection = document.getElementById('searchResultsSection');
const searchResultsGrid = document.getElementById('searchResultsGrid');
const searchResultsTitle = document.getElementById('searchResultsTitle');
const latestSection = document.getElementById('latestSection');
const latestGrid = document.getElementById('latestGrid');
const favoritesSection = document.getElementById('favoritesSection');
const favoritesGrid = document.getElementById('favoritesGrid');
const historySection = document.getElementById('historySection');
const historyGrid = document.getElementById('historyGrid');
const animeModal = document.getElementById('animeModal');
const toast = document.getElementById('toast');

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadTrending();
  loadLatest();
  renderContinueWatching();
  checkUrlParams();
});

function setupEventListeners() {
  // Barra de búsqueda con debounce
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    btnClearSearch.style.display = query ? 'block' : 'none';

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (query.length >= 2) {
        performSearch(query);
      } else if (query.length === 0) {
        showTab('home');
      }
    }, 350);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) performSearch(query);
    }
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.style.display = 'none';
    showTab('home');
  });

  // Selector de fuente (Español vs ani-cli)
  sourceFilter.addEventListener('change', (e) => {
    state.currentSource = e.target.value;
    if (searchInput.value.trim().length >= 2) {
      performSearch(searchInput.value.trim());
    }
  });

  // Chips de búsqueda rápida
  searchChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      searchInput.value = q;
      btnClearSearch.style.display = 'block';
      performSearch(q);
    });
  });

  // Pestañas de navegación
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      showTab(target);
    });
  });
}

/**
 * Cambiar entre pestañas
 */
function showTab(tabName) {
  state.currentTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
  });

  // Ocultar todas las secciones
  heroSection.style.display = 'none';
  continueWatchingSection.style.display = 'none';
  searchResultsSection.style.display = 'none';
  latestSection.style.display = 'none';
  favoritesSection.style.display = 'none';
  historySection.style.display = 'none';

  if (tabName === 'home') {
    heroSection.style.display = 'block';
    if (state.history.length > 0) continueWatchingSection.style.display = 'block';
    latestSection.style.display = 'block';
  } else if (tabName === 'latest') {
    latestSection.style.display = 'block';
  } else if (tabName === 'search') {
    searchResultsSection.style.display = 'block';
  } else if (tabName === 'favorites') {
    favoritesSection.style.display = 'block';
    renderFavorites();
  } else if (tabName === 'history') {
    historySection.style.display = 'block';
    renderHistory();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Cargar animes en tendencia para el Hero Banner
 */
async function loadTrending() {
  try {
    const res = await fetch('/api/trending');
    const data = await res.json();
    if (data.success && data.trending && data.trending.length > 0) {
      state.trending = data.trending;
      renderHero(data.trending[0]);
    }
  } catch (err) {
    console.error('Error cargando tendencias:', err);
  }
}

/**
 * Renderizar Hero Spotlight
 */
function renderHero(anime) {
  if (!anime) return;
  const heroBackdrop = document.getElementById('heroBackdrop');
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc = document.getElementById('heroDesc');
  const heroTag = document.getElementById('heroTag');
  const btnHeroPlay = document.getElementById('btnHeroPlay');
  const btnHeroInfo = document.getElementById('btnHeroInfo');

  heroBackdrop.style.backgroundImage = `url("${anime.image}")`;
  heroTitle.textContent = anime.title;
  heroDesc.textContent = anime.synopsis || 'Disfruta de este anime con la mejor calidad y subtítulos en español en AniTV.';
  heroTag.textContent = anime.lang || 'Español';

  btnHeroPlay.onclick = () => {
    const slug = anime.slug || (anime.seasons && anime.seasons[0]?.slug) || anime.id;
    openPlayer(anime.source || 'hianime', slug, 1, anime.title);
  };

  btnHeroInfo.onclick = () => {
    const slug = anime.slug || (anime.seasons && anime.seasons[0]?.slug) || anime.id;
    openAnimeDetails(anime.source || 'hianime', slug, anime.seasons);
  };
}

/**
 * Cargar últimos capítulos estrenados
 */
async function loadLatest() {
  const latestLoader = document.getElementById('latestLoader');
  latestLoader.classList.remove('hidden');

  try {
    const res = await fetch('/api/latest');
    const data = await res.json();
    latestLoader.classList.add('hidden');

    if (data.success && data.episodes) {
      state.latestEpisodes = data.episodes;
      renderLatestGrid(data.episodes);
    }
  } catch (err) {
    latestLoader.classList.add('hidden');
    console.error('Error cargando últimos capítulos:', err);
  }
}

/**
 * Renderizar cuadrícula de últimos episodios
 */
function renderLatestGrid(episodes) {
  latestGrid.innerHTML = '';
  if (episodes.length === 0) {
    latestGrid.innerHTML = '<p class="empty-state">No hay episodios recientes disponibles.</p>';
    return;
  }

  episodes.forEach(ep => {
    const card = document.createElement('div');
    card.className = 'anime-card episode-card';
    card.innerHTML = `
      <div class="card-poster">
        <img src="${ep.image}" alt="${ep.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450?text=Anime'">
        <span class="badge ep-badge">Ep ${ep.episode}</span>
        <span class="badge lang-badge">${ep.lang || 'Español'}</span>
        <div class="play-overlay">
          <svg class="play-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      </div>
      <div class="card-info">
        <h4 class="card-title" title="${ep.title}">${ep.title}</h4>
        <span class="card-sub">Capítulo ${ep.episode}</span>
      </div>
    `;

    card.onclick = () => {
      openPlayer(ep.source || 'jkanime', ep.slug, ep.episode, ep.title);
    };

    latestGrid.appendChild(card);
  });
}

/**
 * Ejecutar búsqueda en el backend
 */
async function performSearch(query) {
  showTab('search');
  searchResultsTitle.textContent = `Buscando "${query}"...`;
  searchResultsGrid.innerHTML = '<div class="loader-spinner"></div>';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&source=${state.currentSource}`);
    const data = await res.json();

    if (data.success && data.results && data.results.length > 0) {
      searchResultsTitle.textContent = `Resultados para "${query}" (${data.results.length})`;
      renderSearchResults(data.results);
    } else {
      searchResultsTitle.textContent = `Sin resultados para "${query}"`;
      searchResultsGrid.innerHTML = `
        <div class="empty-state">
          <p>No se encontraron animes con ese término.</p>
          <small>Prueba buscando con palabras clave en español o el nombre en japonés/inglés.</small>
        </div>
      `;
    }
  } catch (err) {
    searchResultsTitle.textContent = 'Error al realizar la búsqueda';
    searchResultsGrid.innerHTML = `<p class="empty-state">Error: ${err.message}</p>`;
  }
}

/**
 * Renderizar resultados de búsqueda
 */
function renderSearchResults(results) {
  searchResultsGrid.innerHTML = '';
  results.forEach(anime => {
    const card = document.createElement('div');
    card.className = 'anime-card';
    const sourceBadge = anime.source === 'jkanime' ? '🇪🇸 Español' : '🌐 ani-cli';
    const seasonBadge = anime.totalSeasons > 1 
      ? `<span class="badge season-badge">🍿 ${anime.totalSeasons} Temporadas</span>` 
      : '';

    card.innerHTML = `
      <div class="card-poster">
        <img src="${anime.image}" alt="${anime.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450?text=Anime'">
        ${seasonBadge || `<span class="badge source-badge">${sourceBadge}</span>`}
        ${anime.type ? `<span class="badge type-badge">${anime.type}</span>` : ''}
        <div class="play-overlay">
          <svg class="play-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      </div>
      <div class="card-info">
        <h4 class="card-title" title="${anime.title}">${anime.title}</h4>
        <span class="card-sub">${anime.totalSeasons > 1 ? `🍿 ${anime.totalSeasons} Temporadas agrupadas` : (anime.lang || 'Subtitulado')}</span>
      </div>
    `;

    card.onclick = () => {
      openAnimeDetails(anime.source, anime.slug || anime.id, anime.seasons);
    };

    searchResultsGrid.appendChild(card);
  });
}

/**
 * Abrir modal de detalles y lista de episodios
 */
async function openAnimeDetails(source, slug, preloadedSeasons = null) {
  const modal = document.getElementById('animeModal');
  const modalLoader = document.getElementById('modalLoader');
  const modalContent = document.getElementById('modalContent');

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  modalLoader.classList.remove('hidden');
  modalContent.classList.add('hidden');

  try {
    const res = await fetch(`/api/anime/${source}/${slug}`);
    const data = await res.json();

    if (!data.success || !data.anime) {
      throw new Error(data.message || 'Error cargando datos del anime');
    }

    if (preloadedSeasons && (!data.anime.seasons || data.anime.seasons.length <= 1)) {
      data.anime.seasons = preloadedSeasons;
    }

    state.currentAnimeDetails = data.anime;
    renderAnimeDetails(data.anime);

    modalLoader.classList.add('hidden');
    modalContent.classList.remove('hidden');
  } catch (err) {
    modalLoader.classList.add('hidden');
    showToast(`Error: ${err.message}`);
    closeAnimeModal();
  }
}

/**
 * Renderizar información detallada y episodios en el modal
 */
function renderAnimeDetails(anime) {
  const modalPoster = document.getElementById('modalPoster');
  const modalTitle = document.getElementById('modalTitle');
  const modalGenres = document.getElementById('modalGenres');
  const modalStatus = document.getElementById('modalStatus');
  const modalTotalEps = document.getElementById('modalTotalEps');
  const modalSynopsis = document.getElementById('modalSynopsis');
  const episodesGrid = document.getElementById('episodesGrid');
  const btnFavorite = document.getElementById('btnFavorite');
  const epFilterInput = document.getElementById('epFilterInput');
  const seasonSelectorContainer = document.getElementById('seasonSelectorContainer');
  const netflixSeasonSelect = document.getElementById('netflixSeasonSelect');

  modalPoster.src = anime.image;
  modalTitle.textContent = anime.title;
  modalStatus.textContent = anime.status || 'En emisión';
  modalTotalEps.textContent = `${anime.totalEpisodes || anime.episodes.length} episodios`;
  modalSynopsis.textContent = anime.synopsis || 'Sin sinopsis disponible.';

  // Selector estilo Netflix para cambiar de temporada dentro de la misma serie
  if (seasonSelectorContainer && netflixSeasonSelect) {
    if (anime.seasons && anime.seasons.length > 1) {
      seasonSelectorContainer.classList.remove('hidden');
      netflixSeasonSelect.innerHTML = '';

      anime.seasons.forEach((season, sIdx) => {
        const opt = document.createElement('option');
        opt.value = season.slug;
        const countText = season.episodesSub ? ` (${season.episodesSub} eps)` : '';
        opt.textContent = `${season.seasonLabel || `Temporada ${sIdx + 1}`} - ${season.title}${countText}`;
        if (season.slug === anime.slug) {
          opt.selected = true;
        }
        netflixSeasonSelect.appendChild(opt);
      });

      netflixSeasonSelect.onchange = async (e) => {
        const targetSlug = e.target.value;
        if (!targetSlug || targetSlug === anime.slug) return;
        episodesGrid.innerHTML = '<div class="loader-spinner" style="margin: 20px auto;"></div>';

        try {
          const res = await fetch(`/api/anime/${anime.source}/${targetSlug}`);
          const sData = await res.json();
          if (sData.success && sData.anime) {
            anime.slug = sData.anime.slug;
            anime.episodes = sData.anime.episodes || [];
            anime.totalEpisodes = sData.anime.totalEpisodes || anime.episodes.length;
            if (sData.anime.image) {
              modalPoster.src = sData.anime.image;
            }
            modalTotalEps.textContent = `${anime.totalEpisodes} episodios`;
            renderEpisodesList(anime.episodes, anime);
          }
        } catch (err) {
          showToast(`Error al cargar temporada: ${err.message}`);
          renderEpisodesList(anime.episodes, anime);
        }
      };
    } else {
      seasonSelectorContainer.classList.add('hidden');
    }
  }

  // Géneros
  modalGenres.innerHTML = '';
  (anime.genres || []).forEach(g => {
    const span = document.createElement('span');
    span.className = 'genre-tag';
    span.textContent = g;
    modalGenres.appendChild(span);
  });

  // Estado del botón de favorito
  const isFav = state.favorites.some(f => f.slug === anime.slug);
  updateFavoriteBtn(btnFavorite, isFav);

  btnFavorite.onclick = () => {
    toggleFavorite(anime);
    updateFavoriteBtn(btnFavorite, state.favorites.some(f => f.slug === anime.slug));
  };

  // Renderizar episodios
  renderEpisodesList(anime.episodes, anime);

  // Filtrado de episodios
  epFilterInput.value = '';
  epFilterInput.oninput = (e) => {
    const filterVal = e.target.value.trim().toLowerCase();
    const filtered = anime.episodes.filter(ep => 
      ep.number.toString().includes(filterVal) || 
      (ep.title && ep.title.toLowerCase().includes(filterVal))
    );
    renderEpisodesList(filtered, anime);
  };
}

/**
 * Renderizar lista de episodios en el modal
 */
function renderEpisodesList(episodes, anime) {
  const episodesGrid = document.getElementById('episodesGrid');
  episodesGrid.innerHTML = '';

  if (episodes.length === 0) {
    episodesGrid.innerHTML = '<p class="empty-state">No se encontraron episodios.</p>';
    return;
  }

  // Verificar historial para marcar vistos
  const watchedEps = new Set(
    state.history
      .filter(h => h.slug === anime.slug)
      .map(h => h.episode)
  );

  episodes.forEach(ep => {
    const isWatched = watchedEps.has(ep.number);
    const item = document.createElement('div');
    item.className = `ep-card ${isWatched ? 'watched' : ''}`;
    item.innerHTML = `
      <div class="ep-thumbnail">
        <img src="${ep.image || anime.image}" alt="Ep ${ep.number}" loading="lazy" onerror="this.src='https://via.placeholder.com/160x90?text=Ep+${ep.number}'">
        ${isWatched ? '<span class="watched-check" title="Visto">✓</span>' : ''}
      </div>
      <div class="ep-details">
        <span class="ep-num">Capítulo ${ep.number}</span>
        <span class="ep-name">${ep.title || `Episodio ${ep.number}`}</span>
      </div>
    `;

    item.onclick = () => {
      openPlayer(anime.source, anime.slug, ep.number, anime.title, ep.id);
    };

    episodesGrid.appendChild(item);
  });
}

function closeAnimeModal() {
  document.getElementById('animeModal').classList.add('hidden');
  document.body.style.overflow = '';
}

/**
 * Gestión de Favoritos
 */
function toggleFavorite(anime) {
  const idx = state.favorites.findIndex(f => f.slug === anime.slug);
  if (idx > -1) {
    state.favorites.splice(idx, 1);
    showToast(`Eliminado de tus favoritos`);
  } else {
    state.favorites.unshift({
      slug: anime.slug,
      title: anime.title,
      image: anime.image,
      source: anime.source,
      lang: anime.lang || 'Español'
    });
    showToast(`Añadido a tus favoritos`);
  }
  localStorage.setItem('anitv_favorites', JSON.stringify(state.favorites));
}

function updateFavoriteBtn(btn, isFav) {
  if (isFav) {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> En Favoritos`;
    btn.classList.add('active');
  } else {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> Añadir a Favoritos`;
    btn.classList.remove('active');
  }
}

function renderFavorites() {
  favoritesGrid.innerHTML = '';
  if (state.favorites.length === 0) {
    favoritesGrid.innerHTML = `
      <div class="empty-state">
        <p>Aún no tienes animes en favoritos.</p>
        <small>Haz clic en "Añadir a Favoritos" en cualquier anime para guardarlo aquí.</small>
      </div>
    `;
    return;
  }

  state.favorites.forEach(anime => {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.innerHTML = `
      <div class="card-poster">
        <img src="${anime.image}" alt="${anime.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450?text=Anime'">
        <span class="badge lang-badge">${anime.lang || 'Español'}</span>
        <div class="play-overlay">
          <svg class="play-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      </div>
      <div class="card-info">
        <h4 class="card-title" title="${anime.title}">${anime.title}</h4>
      </div>
    `;
    card.onclick = () => openAnimeDetails(anime.source || 'jkanime', anime.slug);
    favoritesGrid.appendChild(card);
  });
}

/**
 * Gestión del Historial y Continuar Viendo
 */
function saveToHistory(item) {
  // Evitar duplicados consecutivos y mantener máximo 30 items
  state.history = state.history.filter(h => !(h.slug === item.slug && h.episode === item.episode));
  state.history.unshift(item);
  if (state.history.length > 30) state.history.pop();
  localStorage.setItem('anitv_history', JSON.stringify(state.history));
  renderContinueWatching();
}

function renderContinueWatching() {
  if (state.history.length === 0) {
    continueWatchingSection.style.display = 'none';
    return;
  }

  continueWatchingSection.style.display = 'block';
  continueWatchingList.innerHTML = '';

  state.history.slice(0, 10).forEach(item => {
    const card = document.createElement('div');
    card.className = 'continue-card';
    card.innerHTML = `
      <div class="continue-header">
        <h5 class="continue-title" title="${item.title}">${item.title}</h5>
        <span class="badge ep-badge">Ep ${item.episode}</span>
      </div>
      <div class="continue-footer">
        <button class="btn-continue-play">Reanudar</button>
      </div>
    `;

    card.onclick = () => {
      openPlayer(item.source, item.slug, item.episode, item.title);
    };

    continueWatchingList.appendChild(card);
  });
}

function renderHistory() {
  historyGrid.innerHTML = '';
  if (state.history.length === 0) {
    historyGrid.innerHTML = '<p class="empty-state">No hay historial de reproducción aún.</p>';
    return;
  }

  state.history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'anime-card episode-card';
    const dateStr = new Date(item.timestamp).toLocaleDateString();
    card.innerHTML = `
      <div class="card-info">
        <h4 class="card-title" title="${item.title}">${item.title}</h4>
        <span class="card-sub">Capítulo ${item.episode} • ${dateStr}</span>
      </div>
    `;
    card.onclick = () => openPlayer(item.source, item.slug, item.episode, item.title);
    historyGrid.appendChild(card);
  });
}

/**
 * Toast notifications
 */
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
window.showToast = showToast;

/**
 * Parámetros en URL (e.g. ?tab=search o ?tab=latest)
 */
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab && ['home', 'latest', 'search', 'favorites', 'history'].includes(tab)) {
    showTab(tab);
  }
}
