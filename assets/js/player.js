(() => {
  const overlay = document.querySelector('#playerOverlay');
  const player = document.querySelector('#sharedPlayer');
  const close = document.querySelector('#closePlayer');
  const title = document.querySelector('#playerTitle');
  if (!overlay || !player) return;

  const closePlayer = async () => {
    try { player.pause(); } catch (_) {}
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('player-open');
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
    try {
      if (overlay.requestFullscreen && !document.fullscreenElement) await overlay.requestFullscreen();
    } catch (_) {}
    try { await player.play(); } catch (_) {}
  };

  close?.addEventListener('click', closePlayer);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay.classList.contains('open')) closePlayer(); });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && overlay.classList.contains('open')) closePlayer();
  });
})();
