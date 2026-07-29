(() => {
  const overlay = document.querySelector('#playerOverlay');
  const player = document.querySelector('#sharedPlayer');
  const close = document.querySelector('#closePlayer');
  const title = document.querySelector('#playerTitle');
  if (!overlay || !player) return;

  let hideTimer = null;
  const showChrome = () => {
    close?.classList.remove('controls-hidden');
    title?.classList.remove('controls-hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!player.paused) {
        close?.classList.add('controls-hidden');
        title?.classList.add('controls-hidden');
      }
    }, 2600);
  };

  const closePlayer = async () => {
    clearTimeout(hideTimer);
    try { player.pause(); } catch (_) {}
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('player-open');
    close?.classList.remove('controls-hidden');
    title?.classList.remove('controls-hidden');
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (_) {}
  };

  window.openWmpPlayer = async ({src, poster = '', title: mediaTitle = ''}) => {
    if (!src) return;
    title.textContent = mediaTitle;
    player.setAttribute('title', mediaTitle);
    player.setAttribute('src', src);
    if (poster) player.setAttribute('poster', poster); else player.removeAttribute('poster');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('player-open');
    showChrome();
    try {
      if (overlay.requestFullscreen && !document.fullscreenElement) await overlay.requestFullscreen();
    } catch (_) {}
    try { await player.play(); } catch (_) {}
  };

  close?.addEventListener('click', closePlayer);
  ['pointermove','pointerdown','touchstart','mousemove'].forEach(evt => overlay.addEventListener(evt, showChrome, {passive:true}));
  player.addEventListener('play', showChrome);
  player.addEventListener('pause', () => { close?.classList.remove('controls-hidden'); title?.classList.remove('controls-hidden'); clearTimeout(hideTimer); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlay.classList.contains('open')) closePlayer();
    else if (overlay.classList.contains('open')) showChrome();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && overlay.classList.contains('open')) closePlayer();
  });
})();
