// AniTV Player Controller
let hlsInstance = null;
let currentAnime = null;
let currentEpisodeNo = 1;
let currentSource = 'jkanime';
let currentServers = [];
let activeServerIdx = 0;

/**
 * Abrir reproductor para un episodio
 */
async function openPlayer(source, slug, epNo, animeTitle, epId = null) {
  currentSource = source;
  currentAnime = { slug, title: animeTitle, epId };
  currentEpisodeNo = parseInt(epNo, 10);

  const playerModal = document.getElementById('playerModal');
  const playerTitle = document.getElementById('playerAnimeTitle');
  const playerEpNum = document.getElementById('playerEpisodeNumber');
  const serverTabs = document.getElementById('serverTabs');
  const iframeContainer = document.getElementById('iframeContainer');
  const hlsContainer = document.getElementById('hlsContainer');
  const hlsVideo = document.getElementById('hlsVideo');
  const playerLoader = document.getElementById('playerLoader');
  const playerError = document.getElementById('playerError');

  playerModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  playerTitle.textContent = animeTitle || slug;
  playerEpNum.textContent = `Episodio ${epNo}`;
  serverTabs.innerHTML = '';
  playerLoader.classList.remove('hidden');
  playerError.classList.add('hidden');
  iframeContainer.classList.add('hidden');
  hlsContainer.classList.add('hidden');

  // Limpiar reproductor HLS previo
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  if (hlsVideo) {
    hlsVideo.pause();
    hlsVideo.removeAttribute('src');
    hlsVideo.load();
    // Remover tracks previos
    while (hlsVideo.firstChild) {
      hlsVideo.removeChild(hlsVideo.firstChild);
    }
  }

  // Guardar en historial de reproducción
  saveToHistory({
    slug,
    title: animeTitle,
    episode: currentEpisodeNo,
    source,
    timestamp: Date.now()
  });

  try {
    let url = `/api/servers/${source}/${slug}/${epNo}`;
    if (epId) url += `?epId=${epId}`;

    const res = await fetch(url);
    const data = await res.json();

    playerLoader.classList.add('hidden');

    if (!data.success) {
      throw new Error(data.error || 'No se pudieron obtener servidores');
    }

    if (source === 'jkanime') {
      // Modo Iframe (Servidores en español de JKanime)
      currentServers = data.servers || [];
      if (currentServers.length === 0) {
        throw new Error('No se encontraron servidores para este capítulo');
      }

      const jkanimeNotice = document.getElementById('jkanimeNotice');
      if (jkanimeNotice) {
        jkanimeNotice.classList.remove('hidden');
        const btnSwitch = document.getElementById('btnSwitchToAniCli');
        if (btnSwitch) {
          btnSwitch.onclick = () => {
            closePlayer();
            const sourceSelect = document.getElementById('sourceFilter');
            const searchInput = document.getElementById('searchInput');
            if (sourceSelect) sourceSelect.value = 'hianime';
            if (window.state) window.state.currentSource = 'hianime';
            if (searchInput) {
              searchInput.value = animeTitle;
              if (window.performSearch) window.performSearch(animeTitle);
            }
          };
        }
      }

      renderServerTabs(currentServers);
      selectIframeServer(0);
    } else if (source === 'hianime') {
      // Modo HLS Nativo (Motor ani-cli con subtítulos en inglés/español y calidades)
      const jkanimeNotice = document.getElementById('jkanimeNotice');
      if (jkanimeNotice) jkanimeNotice.classList.add('hidden');

      if (!data.m3u8) {
        throw new Error('Stream HLS no disponible');
      }

      setupHlsPlayer(data);
    }

    // Actualizar botones de navegación de episodios
    updateNavigationButtons();
  } catch (err) {
    playerLoader.classList.add('hidden');
    playerError.classList.remove('hidden');
    document.getElementById('playerErrorText').textContent = err.message;
  }
}

/**
 * Renderizar pestañas de servidores para JKanime
 */
function renderServerTabs(servers) {
  const serverTabs = document.getElementById('serverTabs');
  serverTabs.innerHTML = '';

  servers.forEach((s, idx) => {
    const btn = document.createElement('button');
    btn.className = `server-tab-btn ${idx === 0 ? 'active' : ''}`;
    btn.textContent = s.name.replace('Servidor ', 'Opción ');
    btn.onclick = () => selectIframeServer(idx);
    serverTabs.appendChild(btn);
  });
}

/**
 * Seleccionar servidor iframe
 */
function selectIframeServer(idx) {
  activeServerIdx = idx;
  const server = currentServers[idx];
  if (!server) return;

  const buttons = document.querySelectorAll('.server-tab-btn');
  buttons.forEach((b, i) => b.classList.toggle('active', i === idx));

  const iframeContainer = document.getElementById('iframeContainer');
  const hlsContainer = document.getElementById('hlsContainer');
  hlsContainer.classList.add('hidden');
  iframeContainer.classList.remove('hidden');

  let iframe = document.getElementById('playerIframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'playerIframe';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframeContainer.appendChild(iframe);
  }
  iframe.src = server.embedUrl;
}

// Estado de subtítulos personalizados
let currentCues = [];
let subtitlesEnabled = true;

function parseVttTimestamp(str) {
  if (!str) return 0;
  const parts = str.trim().split(':');
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
}

function parseVttContent(text) {
  const cues = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const parts = line.split('-->');
      const start = parseVttTimestamp(parts[0]);
      const end = parseVttTimestamp(parts[1].split(' ')[0]);
      let txt = '';
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        const clean = lines[i].trim().replace(/<[^>]+>/g, '');
        if (clean) txt += (txt ? '\n' : '') + clean;
        i++;
      }
      if (txt) cues.push({ start, end, text: txt });
    } else {
      i++;
    }
  }
  return cues;
}

async function loadSubtitlesFromUrl(url) {
  const subtitleOverlay = document.getElementById('subtitleOverlay');
  const subtitleText = document.getElementById('subtitleText');

  if (!url || url === 'off') {
    subtitlesEnabled = false;
    currentCues = [];
    if (subtitleOverlay) subtitleOverlay.style.display = 'none';
    if (subtitleText) subtitleText.textContent = '';
    return;
  }

  subtitlesEnabled = true;
  try {
    const res = await fetch(url);
    const vttData = await res.text();
    currentCues = parseVttContent(vttData);
    console.log(`[Subtítulos] Cargados ${currentCues.length} subtítulos`);
  } catch (err) {
    console.error('Error cargando subtítulos:', err);
  }
}

/**
 * Configurar reproductor Hls.js nativo (HiAnime / ani-cli)
 */
function setupHlsPlayer(streamData) {
  const iframeContainer = document.getElementById('iframeContainer');
  const hlsContainer = document.getElementById('hlsContainer');
  const hlsVideo = document.getElementById('hlsVideo');
  const qualitySelect = document.getElementById('qualitySelect');
  const subtitleSelect = document.getElementById('subtitleSelect');
  const speedSelect = document.getElementById('speedSelect');
  const activeQualityBadge = document.getElementById('activeQualityBadge');
  const subtitleOverlay = document.getElementById('subtitleOverlay');
  const subtitleText = document.getElementById('subtitleText');

  iframeContainer.classList.add('hidden');
  hlsContainer.classList.remove('hidden');

  // Control de velocidad
  if (speedSelect) {
    speedSelect.value = '1';
    speedSelect.onchange = (e) => {
      const spd = parseFloat(e.target.value);
      hlsVideo.playbackRate = spd;
      if (window.showToast) window.showToast(`Velocidad de reproducción: ${spd}x`);
    };
  }

  // Limpiar pistas y cues anteriores
  currentCues = [];
  if (subtitleOverlay) subtitleOverlay.style.display = 'none';
  if (subtitleText) subtitleText.textContent = '';

  // Configurar renderizador de subtítulos en tiempo real sobre el video
  hlsVideo.ontimeupdate = () => {
    if (!subtitlesEnabled || currentCues.length === 0) {
      if (subtitleOverlay) subtitleOverlay.style.display = 'none';
      return;
    }

    const ct = hlsVideo.currentTime;
    const activeCue = currentCues.find(c => ct >= c.start && ct <= c.end);
    if (activeCue) {
      subtitleText.textContent = activeCue.text;
      subtitleOverlay.style.display = 'flex';
    } else {
      subtitleOverlay.style.display = 'none';
    }
  };

  // Poblar selector de subtítulos
  subtitleSelect.innerHTML = '';
  const subsList = streamData.subtitles || [];

  subsList.forEach((sub) => {
    const opt = document.createElement('option');
    opt.value = sub.src;
    opt.textContent = sub.label || (sub.lang === 'en' ? '🇬🇧 English (Inglés)' : '🇪🇸 Español (Spanish)');
    subtitleSelect.appendChild(opt);
  });

  // Opción para desactivar subtítulos
  const offOpt = document.createElement('option');
  offOpt.value = 'off';
  offOpt.textContent = '🚫 Sin subtítulos';
  subtitleSelect.appendChild(offOpt);

  // Por defecto seleccionar English (o el primero disponible)
  let chosenSubUrl = subtitleSelect.options[0]?.value;
  // Si hay opción en inglés, preferirla
  for (let i = 0; i < subtitleSelect.options.length; i++) {
    if (subtitleSelect.options[i].text.toLowerCase().includes('english') || subtitleSelect.options[i].text.toLowerCase().includes('inglés')) {
      subtitleSelect.selectedIndex = i;
      chosenSubUrl = subtitleSelect.options[i].value;
      break;
    }
  }

  // Cargar inmediatamente la pista seleccionada
  if (chosenSubUrl) {
    loadSubtitlesFromUrl(chosenSubUrl);
  }

  // Manejador de cambio de subtítulos
  subtitleSelect.onchange = (e) => {
    const val = e.target.value;
    loadSubtitlesFromUrl(val);
    const chosenName = subtitleSelect.options[subtitleSelect.selectedIndex]?.text || '';
    if (window.showToast) window.showToast(`Subtítulos: ${chosenName}`);
  };

  // Inicializar selector de calidad
  qualitySelect.innerHTML = '<option value="-1">Auto (Adaptativo)</option>';
  if (activeQualityBadge) {
    activeQualityBadge.textContent = 'Auto';
    activeQualityBadge.className = 'badge quality-badge';
  }

  // Soporte Hls.js
  if (window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls({
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      },
      capLevelToPlayerSize: false,
      startLevel: -1
    });

    hlsInstance.loadSource(streamData.m3u8);
    hlsInstance.attachMedia(hlsVideo);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      // Poblar opciones de resolución dinámicas
      if (data.levels && data.levels.length > 0) {
        qualitySelect.innerHTML = '<option value="-1">Auto (Adaptativo)</option>';
        data.levels.forEach((lvl, lIdx) => {
          const opt = document.createElement('option');
          opt.value = lIdx;
          const h = lvl.height || 720;
          let label = `${h}p`;
          if (h >= 1080) label = `${h}p (Full HD)`;
          else if (h >= 720) label = `${h}p (HD)`;
          else if (h >= 480) label = `${h}p (SD)`;
          else label = `${h}p (Móvil)`;

          opt.textContent = label;
          qualitySelect.appendChild(opt);
        });
      }
      hlsVideo.play().catch(e => console.log('Autoplay bloqueado:', e));
    });

    // Detectar cuando cambia la resolución activa
    hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      const curLvl = hlsInstance.levels[data.level];
      if (curLvl && activeQualityBadge) {
        activeQualityBadge.textContent = `${curLvl.height}p`;
        activeQualityBadge.className = 'badge quality-badge' + (curLvl.height >= 720 ? ' hd-badge' : '');
      }
    });

    // Cambio manual de calidad
    qualitySelect.onchange = (e) => {
      const val = parseInt(e.target.value, 10);
      if (hlsInstance) {
        hlsInstance.currentLevel = val;
        if (val === -1) {
          if (activeQualityBadge) activeQualityBadge.textContent = 'Auto';
          if (window.showToast) window.showToast('Calidad ajustada a: Automática (Adaptativa)');
        } else {
          const lvl = hlsInstance.levels[val];
          const h = lvl ? lvl.height : 'HD';
          if (activeQualityBadge) {
            activeQualityBadge.textContent = `${h}p`;
            activeQualityBadge.className = 'badge quality-badge' + (h >= 720 ? ' hd-badge' : '');
          }
          if (window.showToast) window.showToast(`Calidad cambiada a: ${h}p`);
        }
      }
    };
  } else if (hlsVideo.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari / iOS nativo
    hlsVideo.src = streamData.m3u8;
    hlsVideo.play().catch(e => console.log('Autoplay bloqueado:', e));
  }

  // Botón Ani-Skip (+85s)
  const skipBtn = document.getElementById('btnSkipIntro');
  if (skipBtn) {
    skipBtn.onclick = () => {
      hlsVideo.currentTime += 85;
      if (window.showToast) window.showToast('Intro saltada (+85s)');
    };
  }
}

/**
 * Actualizar botones de navegación (anterior y siguiente episodio)
 */
function updateNavigationButtons() {
  const btnPrev = document.getElementById('btnPrevEpisode');
  const btnNext = document.getElementById('btnNextEpisode');

  if (btnPrev) {
    btnPrev.disabled = currentEpisodeNo <= 1;
    btnPrev.onclick = () => navigateEpisode(-1);
  }
  if (btnNext) {
    btnNext.onclick = () => navigateEpisode(1);
  }
}

/**
 * Navegar al episodio anterior o siguiente
 */
function navigateEpisode(offset) {
  const newEp = currentEpisodeNo + offset;
  if (newEp < 1) return;

  if (currentAnime) {
    openPlayer(currentSource, currentAnime.slug, newEp, currentAnime.title, null);
  }
}

/**
 * Cerrar reproductor
 */
function closePlayer() {
  const playerModal = document.getElementById('playerModal');
  playerModal.classList.add('hidden');
  document.body.style.overflow = '';

  currentCues = [];
  subtitlesEnabled = true;
  const subtitleOverlay = document.getElementById('subtitleOverlay');
  if (subtitleOverlay) subtitleOverlay.style.display = 'none';
  const subtitleText = document.getElementById('subtitleText');
  if (subtitleText) subtitleText.textContent = '';
  const jkanimeNotice = document.getElementById('jkanimeNotice');
  if (jkanimeNotice) jkanimeNotice.classList.add('hidden');

  const iframe = document.getElementById('playerIframe');
  if (iframe) iframe.src = 'about:blank';

  const hlsVideo = document.getElementById('hlsVideo');
  if (hlsVideo) {
    hlsVideo.pause();
    hlsVideo.removeAttribute('src');
    hlsVideo.ontimeupdate = null;
  }

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

/**
 * Atajos de teclado en el reproductor
 */
window.addEventListener('keydown', (e) => {
  const playerModal = document.getElementById('playerModal');
  if (playerModal.classList.contains('hidden')) return;

  const hlsVideo = document.getElementById('hlsVideo');
  if (e.key === 'Escape') {
    closePlayer();
  } else if (e.key === ' ' && hlsVideo && !document.getElementById('hlsContainer').classList.contains('hidden')) {
    e.preventDefault();
    if (hlsVideo.paused) hlsVideo.play();
    else hlsVideo.pause();
  } else if (e.key === 'ArrowRight' && hlsVideo) {
    hlsVideo.currentTime += 10;
  } else if (e.key === 'ArrowLeft' && hlsVideo) {
    hlsVideo.currentTime -= 10;
  } else if (e.key.toLowerCase() === 'f') {
    toggleFullscreen();
  } else if (e.key.toLowerCase() === 'n') {
    navigateEpisode(1);
  }
});

function toggleFullscreen() {
  const playerWrapper = document.getElementById('playerMediaWrapper');
  if (!document.fullscreenElement) {
    playerWrapper.requestFullscreen().catch(err => console.log(err));
  } else {
    document.exitFullscreen().catch(err => console.log(err));
  }
}
