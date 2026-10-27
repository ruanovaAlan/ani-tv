// PWA Controller
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[PWA] Service Worker registrado con éxito:', reg.scope);
      })
      .catch(err => {
        console.warn('[PWA] Error registrando Service Worker:', err);
      });
  });
}

// Capturar evento de instalación de PWA
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  const installBtn = document.getElementById('btnInstallApp');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] Resultado de instalación:', outcome);
      if (outcome === 'accepted') {
        installBtn.style.display = 'none';
      }
      deferredPrompt = null;
    });
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] AniTV instalada como aplicación!');
  const installBtn = document.getElementById('btnInstallApp');
  if (installBtn) installBtn.style.display = 'none';
  if (window.showToast) window.showToast('¡AniTV se ha instalado en tu dispositivo!');
});

// Detección de conectividad online/offline
window.addEventListener('offline', () => {
  const banner = document.getElementById('offlineBanner');
  if (banner) banner.style.display = 'flex';
  if (window.showToast) window.showToast('Estás sin conexión. Modo offline activo.');
});

window.addEventListener('online', () => {
  const banner = document.getElementById('offlineBanner');
  if (banner) banner.style.display = 'none';
  if (window.showToast) window.showToast('¡Conexión restablecida!');
});
