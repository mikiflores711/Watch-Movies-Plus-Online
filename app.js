(() => {
  const movies = window.WMP_MOVIES || [];
  const series = window.WMP_SERIES || [];
  const FAVORITES_KEY = 'wmp_favorites';
  const getFavorites = () => {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')); }
    catch (_) { return new Set(); }
  };
  const saveFavorites = set => localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
  const itemKey = item => `${item.type}:${item.href}`;

  const makeCard = item => {
    const wrap = document.createElement('article');
    wrap.className = 'card';
    const key = itemKey(item);
    const active = getFavorites().has(key);
    wrap.innerHTML = `<a class="card-link" href="${item.href}"><div class="poster"><img src="${item.poster}" alt="${item.title}" loading="lazy"></div><h3>${item.title}</h3><p>${item.year} · ${item.genre||''}</p></a><button class="card-favorite ${active?'active':''}" type="button" aria-label="${active?'Quitar de':'Agregar a'} favoritos" title="Favoritos"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"></path></svg></button>`;
    wrap.querySelector('.card-favorite').onclick = event => {
      event.preventDefault(); event.stopPropagation();
      const favs=getFavorites(); favs.has(key)?favs.delete(key):favs.add(key); saveFavorites(favs);
      renderCurrent();
    };
    return wrap;
  };

  const movieRail=document.querySelector('#movieRail');
  const seriesRail=document.querySelector('#seriesRail');
  const grid=document.querySelector('#catalogGrid');
  const favoritesGrid=document.querySelector('#favoritesGrid');
  let currentQuery='';
  function renderCurrent(){
    if(movieRail){ movieRail.innerHTML=''; movies.forEach(m=>movieRail.appendChild(makeCard(m))); }
    if(seriesRail){ seriesRail.innerHTML=''; series.forEach(m=>seriesRail.appendChild(makeCard(m))); if(!series.length) seriesRail.closest('.section')?.remove(); }
    if(grid){
      const source=document.body.dataset.catalog==='tv'?series:movies;
      grid.innerHTML=''; const filtered=source.filter(x=>`${x.title} ${x.year} ${x.genre||''}`.toLowerCase().includes(currentQuery.toLowerCase()));
      filtered.forEach(x=>grid.appendChild(makeCard(x))); document.querySelector('#empty')?.classList.toggle('hidden',filtered.length>0);
    }
    if(favoritesGrid){
      const favs=getFavorites(); const selected=[...movies,...series].filter(x=>favs.has(itemKey(x)));
      favoritesGrid.innerHTML=''; selected.forEach(x=>favoritesGrid.appendChild(makeCard(x)));
      document.querySelector('#favoritesEmpty')?.classList.toggle('hidden',selected.length>0);
    }
  }
  renderCurrent();

  const featured=movies[0];
  if(featured){
    document.querySelector('.hero-bg')?.style.setProperty('background-image',`url("${featured.backdrop}")`);
    const t=document.querySelector('#heroTitle'); if(t)t.textContent=featured.title;
    const d=document.querySelector('#heroDesc'); if(d)d.textContent=featured.description;
    const p=document.querySelector('#heroPlay'); if(p)p.href=featured.href;
    const i=document.querySelector('#heroInfo'); if(i)i.href=featured.href;
  }
  document.querySelector('#catalogSearch')?.addEventListener('input',e=>{currentQuery=e.target.value;renderCurrent()});
  document.querySelector('[data-back]')?.addEventListener('click',()=>history.length>1?history.back():location.assign('index.html'));

  function ensureDialog(){
    let overlay=document.querySelector('#appDialog'); if(overlay)return overlay;
    overlay=document.createElement('div'); overlay.id='appDialog'; overlay.className='app-dialog'; overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<section class="app-dialog-card" role="dialog" aria-modal="true"><button class="dialog-close" aria-label="Cerrar">×</button><div id="dialogBody"></div></section>';
    document.body.appendChild(overlay);
    const close=()=>{overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true')};
    overlay.querySelector('.dialog-close').onclick=close; overlay.onclick=e=>{if(e.target===overlay)close()};
    return overlay;
  }
  function openDialog(html){const o=ensureDialog();o.querySelector('#dialogBody').innerHTML=html;o.classList.add('open');o.setAttribute('aria-hidden','false')}
  function renderSettings(){
    openDialog(`<h2>Ajustes</h2><div class="settings-menu"><button data-info="about">Quiénes somos</button><button data-info="legal">Aviso legal</button><button data-info="terms">Términos y condiciones</button></div><div id="settingsText" class="settings-text hidden"></div>`);
    const texts={
      about:'<h3>Quiénes somos</h3><p>Watch Movies Plus es un sitio de entretenimiento creado para reunir películas y series en una interfaz sencilla, rápida y adaptable a diferentes dispositivos.</p><p>Nuestro objetivo es facilitar la navegación, la organización de favoritos y el acceso a la información de cada título disponible.</p>',
      legal:'<h3>Aviso legal</h3><p>Los nombres, imágenes, personajes y obras mostrados pertenecen a sus respectivos titulares. Este sitio funciona como un catálogo informativo y reproductor web.</p><p>Si eres titular de derechos y consideras que algún contenido debe revisarse, utiliza el botón de reporte disponible dentro del reproductor.</p>',
      terms:'<h3>Términos y condiciones</h3><p>Al utilizar este sitio aceptas hacerlo de forma responsable y conforme a las leyes aplicables en tu ubicación.</p><p>La disponibilidad del contenido puede cambiar sin previo aviso. También pueden realizarse mejoras, correcciones o ajustes de funcionamiento cuando sea necesario.</p>'
    };
    document.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>{const box=document.querySelector('#settingsText');box.innerHTML=texts[b.dataset.info];box.classList.remove('hidden');document.querySelectorAll('[data-info]').forEach(x=>x.classList.toggle('active',x===b));});
  }
  document.querySelectorAll('[data-nav-action]').forEach(btn=>btn.onclick=()=>{
    if(btn.dataset.navAction==='favorites') location.assign('favoritos.html');
    else renderSettings();
  });
  document.querySelectorAll('.nav-home').forEach(a=>a.classList.toggle('active',location.pathname.endsWith('/')||location.pathname.endsWith('/index.html')));
})();
