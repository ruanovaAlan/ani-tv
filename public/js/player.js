// AniTV Player Controller - Reproductor Optimizado y Detección Automática
let hlsInstance = null;
let currentAnime = null;
let currentEpisodeNo = 1;
let currentSource = 'jkanime';
let currentServers = [];
let activeServerIdx = 0;
let serverTimeoutTimer = null;
let currentStreamData = null;

/**
 * Abrir reproductor para un episodio con detección automática de servidor
 */
async function openPlayer(source, slug, epNo, animeTitle, epId = null) {
  currentSource = source || 'jkanime';
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
  const activeQualityBadge = document.getElementById('activeQualityBadge');

  playerModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  playerTitle.textContent = animeTitle || slug;
  playerEpNum.textContent = `Episodio ${epNo}`;
  serverTabs.innerHTML = '';
  playerLoader.classList.remove('hidden');
  playerError.classList.add('hidden');
  iframeContainer.classList.add('hidden');
  hlsContainer.classList.add('hidden');

  if (activeQualityBadge) {
    activeQualityBadge.textContent = 'HD';
    activeQualityBadge.className = 'badge quality-badge';
  }

  // Limpiar reproductor previo y timeouts
  clearTimeout(serverTimeoutTimer);
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  if (hlsVideo) {
    hlsVideo.pause();
    hlsVideo.removeAttribute('src');
    hlsVideo.load();
  }
  const oldIframe = document.getElementById('playerIframe');
  if (oldIframe) {
    oldIframe.src = 'about:blank';
  }

  // Guardar en historial de reproducción
  saveToHistory({
    slug,
    title: animeTitle,
    episode: currentEpisodeNo,
    source: currentSource,
    timestamp: Date.now()
  });

  try {
    let url = `/api/servers/${currentSource}/${slug}/${epNo}`;
    if (epId) url += `?epId=${epId}`;

    const res = await fetch(url);
    const data = await res.json();
    currentStreamData = data;

    playerLoader.classList.add('hidden');

    if (!data.success) {
      throw new Error(data.error || 'No se pudieron obtener servidores para este episodio');
    }

    currentServers = data.servers || [];

    // Prioridad 1: Detección automática de stream HLS nativo (.m3u8)
    if (data.m3u8) {
      renderServerTabs(currentServers, true);
      setupHlsPlayer(data);
    } else if (currentServers.length > 0) {
      // Prioridad 2: Servidores Iframe con protección Sandbox anti pop-ups
      renderServerTabs(currentServers, false);
      selectIframeServer(0);
    } else {
      throw new Error('No se encontraron servidores reproducibles disponibles para este capítulo');
    }

    // Actualizar botones de navegación (anterior / siguiente)
    updateNavigationButtons();
  } catch (err) {
    clearTimeout(serverTimeoutTimer);
    playerLoader.classList.add('hidden');
    playerError.classList.remove('hidden');
    const errText = document.getElementById('playerErrorText');
    if (errText) errText.textContent = err.message || 'Error al conectar con los servidores';
  }
}

/**
 * Renderizar pestañas de servidores
 */
function renderServerTabs(servers, hasHlsStream = false) {
  const serverTabs = document.getElementById('serverTabs');
  serverTabs.innerHTML = '';

  // Si existe stream nativo directo, agregar botón de Servidor Rápido Automático
  if (hasHlsStream) {
    const directBtn = document.createElement('button');
    directBtn.className = 'server-tab-btn active';
    directBtn.id = 'tabServerDirectHls';
    directBtn.innerHTML = '⚡ Servidor Rápido (Sin Anuncios)';
    directBtn.onclick = () => {
      document.querySelectorAll('.server-tab-btn').forEach(b => b.classList.remove('active'));
      directBtn.classList.add('active');
      if (currentStreamData && currentStreamData.m3u8) {
        setupHlsPlayer(currentStreamData);
      }
    };
    serverTabs.appendChild(directBtn);
  }

  servers.forEach((s, idx) => {
    const btn = document.createElement('button');
    // Si no hay HLS, el primer iframe es el activo por defecto
    btn.className = `server-tab-btn ${!hasHlsStream && idx === 0 ? 'active' : ''}`;
    let label = s.name.replace(/^Servidor\s+/i, '');
    if (label.toLowerCase().includes('principal') || label.toLowerCase().includes('desu')) {
      label = `⚡ Servidor Alternativo ${idx + 1}`;
    } else {
      label = `Servidor ${idx + 1}`;
    }
    btn.textContent = label;
    btn.onclick = () => {
      const hlsBtn = document.getElementById('tabServerDirectHls');
      if (hlsBtn) hlsBtn.classList.remove('active');
      selectIframeServer(idx);
    };
    serverTabs.appendChild(btn);
  });
}

/**
 * Seleccionar servidor iframe con Sandbox anti pop-ups y detección de fallos
 */
function selectIframeServer(idx) {
  activeServerIdx = idx;
  const server = currentServers[idx];
  if (!server) return;

  // Pausar HLS si estaba sonando
  const hlsVideo = document.getElementById('hlsVideo');
  if (hlsVideo) hlsVideo.pause();

  const buttons = document.querySelectorAll('.server-tab-btn');
  buttons.forEach((b, i) => {
    // Si existe pestaña de HLS directo, compensar índice
    const hasHls = document.getElementById('tabServerDirectHls');
    const targetIdx = hasHls ? i - 1 : i;
    b.classList.toggle('active', targetIdx === idx);
  });

  const iframeContainer = document.getElementById('iframeContainer');
  const hlsContainer = document.getElementById('hlsContainer');
  const playerLoader = document.getElementById('playerLoader');
  const activeQualityBadge = document.getElementById('activeQualityBadge');

  if (activeQualityBadge) {
    activeQualityBadge.textContent = 'HD';
    activeQualityBadge.className = 'badge quality-badge';
  }

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

  // PROTECCIÓN CLAVE ANTI POP-UPS:
  // Al NO incluir allow-popups ni allow-top-navigation, el navegador bloquea
  // de forma estricta cualquier intento de abrir pestañas o ventanas publicitarias.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');

  // Detección automática de lentitud / falla de servidor
  clearTimeout(serverTimeoutTimer);
  serverTimeoutTimer = setTimeout(() => {
    if (activeServerIdx + 1 < currentServers.length) {
      if (window.showToast) {
        window.showToast(`El servidor actual está demorando. Cambiando automáticamente al Servidor ${activeServerIdx + 2}...`);
      }
      selectIframeServer(activeServerIdx + 1);
    }
  }, 9000);

  iframe.onload = () => {
    clearTimeout(serverTimeoutTimer);
    if (playerLoader) playerLoader.classList.add('hidden');
  };

  iframe.onerror = () => {
    clearTimeout(serverTimeoutTimer);
    if (activeServerIdx + 1 < currentServers.length) {
      if (window.showToast) {
        window.showToast(`Error de conexión. Cambiando al siguiente servidor...`);
      }
      selectIframeServer(activeServerIdx + 1);
    }
  };

  iframe.src = server.embedUrl;
}

/**
 * Configurar reproductor Hls.js nativo (Rápido, sin anuncios y directo)
 */
function setupHlsPlayer(streamData) {
  clearTimeout(serverTimeoutTimer);
  const iframeContainer = document.getElementById('iframeContainer');
  const hlsContainer = document.getElementById('hlsContainer');
  const hlsVideo = document.getElementById('hlsVideo');
  const activeQualityBadge = document.getElementById('activeQualityBadge');
  const oldIframe = document.getElementById('playerIframe');

  if (oldIframe) oldIframe.src = 'about:blank';
  iframeContainer.classList.add('hidden');
  hlsContainer.classList.remove('hidden');

  if (activeQualityBadge) {
    activeQualityBadge.textContent = 'Auto HD';
    activeQualityBadge.className = 'badge quality-badge hd-badge';
  }

  // Soporte Hls.js
  if (window.Hls && Hls.isSupported()) {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

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

    // Detección de errores fatales con cambio automático a servidor alternativo
    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn('Error fatal en HLS nativo:', data.type, data.details);
        if (currentServers && currentServers.length > 0) {
          if (window.showToast) {
            window.showToast('Conectando automáticamente con servidor de respaldo...');
          }
          selectIframeServer(0);
        }
      }
    });
  } else if (hlsVideo.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari / iOS nativo
    hlsVideo.src = streamData.m3u8;
    hlsVideo.play().catch(e => console.log('Autoplay bloqueado:', e));
  } else if (currentServers.length > 0) {
    selectIframeServer(0);
  }

  // Botón Saltar Intro (+85s)
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
 * Cerrar reproductor y liberar memoria
 */
function closePlayer() {
  clearTimeout(serverTimeoutTimer);
  const playerModal = document.getElementById('playerModal');
  playerModal.classList.add('hidden');
  document.body.style.overflow = '';

  const iframe = document.getElementById('playerIframe');
  if (iframe) iframe.src = 'about:blank';

  const hlsVideo = document.getElementById('hlsVideo');
  if (hlsVideo) {
    hlsVideo.pause();
    hlsVideo.removeAttribute('src');
    hlsVideo.load();
  }

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

/**
 * Atajos de teclado intuitivos para el reproductor
 */
window.addEventListener('keydown', (e) => {
  const playerModal = document.getElementById('playerModal');
  if (playerModal.classList.contains('hidden')) return;

  const hlsVideo = document.getElementById('hlsVideo');
  const isHlsActive = !document.getElementById('hlsContainer').classList.contains('hidden');

  if (e.key === 'Escape') {
    closePlayer();
  } else if ((e.key === ' ' || e.key.toLowerCase() === 'k') && isHlsActive && hlsVideo) {
    e.preventDefault();
    if (hlsVideo.paused) hlsVideo.play();
    else hlsVideo.pause();
  } else if (e.key === 'ArrowRight' && isHlsActive && hlsVideo) {
    e.preventDefault();
    hlsVideo.currentTime += 10;
  } else if (e.key === 'ArrowLeft' && isHlsActive && hlsVideo) {
    e.preventDefault();
    hlsVideo.currentTime -= 10;
  } else if (e.key === 'ArrowUp' && isHlsActive && hlsVideo) {
    e.preventDefault();
    hlsVideo.volume = Math.min(1, Math.round((hlsVideo.volume + 0.1) * 10) / 10);
    if (window.showToast) window.showToast(`Volumen: ${Math.round(hlsVideo.volume * 100)}%`);
  } else if (e.key === 'ArrowDown' && isHlsActive && hlsVideo) {
    e.preventDefault();
    hlsVideo.volume = Math.max(0, Math.round((hlsVideo.volume - 0.1) * 10) / 10);
    if (window.showToast) window.showToast(`Volumen: ${Math.round(hlsVideo.volume * 100)}%`);
  } else if (e.key.toLowerCase() === 'm' && isHlsActive && hlsVideo) {
    e.preventDefault();
    hlsVideo.muted = !hlsVideo.muted;
    if (window.showToast) window.showToast(hlsVideo.muted ? 'Silenciado 🔇' : 'Sonido activado 🔊');
  } else if (e.key.toLowerCase() === 'f') {
    toggleFullscreen();
  } else if (e.key.toLowerCase() === 'n') {
    navigateEpisode(1);
  } else if (e.key.toLowerCase() === 'p') {
    navigateEpisode(-1);
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
