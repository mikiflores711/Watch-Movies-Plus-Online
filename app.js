(() => {
  const movies = window.WMP_MOVIES || [];
  const series = window.WMP_SERIES || [];
  const allItems = [...movies, ...series];
  const FAVORITES_KEY = 'wmp_favorites';
  const getFavorites = () => new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
  const saveFavorites = set => localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
  const itemKey = item => `${item.type}:${item.href}`;

  const makeCard = item => {
    const wrap = document.createElement('article');
    wrap.className = 'card';
    const key = itemKey(item);
    const active = getFavorites().has(key);
    wrap.innerHTML = `<a class="card-link" href="${item.href}"><div class="poster"><img src="${item.poster}" alt="${item.title}" loading="lazy"></div><h3>${item.title}</h3><p>${item.year} · ${item.genre||''}</p></a><button class="card-favorite ${active?'active':''}" type="button" aria-label="${active?'Quitar de':'Agregar a'} favoritos" title="Favoritos"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"></path></svg></button>`;
    wrap.querySelector('.card-favorite').onclick = () => {
      const favs=getFavorites(); favs.has(key)?favs.delete(key):favs.add(key); saveFavorites(favs);
      document.querySelectorAll('.card-favorite').forEach(btn=>{});
      renderCurrent();
    };
    return wrap;
  };

  const movieRail=document.querySelector('#movieRail');
  const seriesRail=document.querySelector('#seriesRail');
  const grid=document.querySelector('#catalogGrid');
  let currentQuery='';
  function renderCurrent(){
    if(movieRail){ movieRail.innerHTML=''; movies.forEach(m=>movieRail.appendChild(makeCard(m))); }
    if(seriesRail){ seriesRail.innerHTML=''; series.forEach(m=>seriesRail.appendChild(makeCard(m))); if(!series.length) seriesRail.closest('.section')?.remove(); }
    if(grid){
      const source=document.body.dataset.catalog==='tv'?series:movies;
      grid.innerHTML=''; const filtered=source.filter(x=>`${x.title} ${x.year} ${x.genre||''}`.toLowerCase().includes(currentQuery.toLowerCase()));
      filtered.forEach(x=>grid.appendChild(makeCard(x))); document.querySelector('#empty')?.classList.toggle('hidden',filtered.length>0);
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
  function renderFavorites(){
    const favs=getFavorites(), selected=allItems.filter(x=>favs.has(itemKey(x)));
    openDialog(`<h2>Favoritos</h2><p class="dialog-intro">Tus películas y series guardadas.</p><div id="favoriteDialogGrid" class="favorite-dialog-grid"></div>${selected.length?'':'<div class="dialog-empty">Todavía no agregaste contenido a favoritos.</div>'}`);
    const holder=document.querySelector('#favoriteDialogGrid'); selected.forEach(x=>holder.appendChild(makeCard(x)));
  }
  function renderSettings(){
    openDialog(`<h2>Ajustes</h2><div class="settings-menu"><button data-info="about">Quiénes somos</button><button data-info="legal">Aviso legal</button><button data-info="terms">Términos y condiciones</button></div><div id="settingsText" class="settings-text"><p>Selecciona una opción para consultar la información.</p></div>`);
    const texts={
      about:'<h3>Quiénes somos</h3><p>Watch Movies Plus es un catálogo web independiente diseñado para organizar contenido disponible mediante enlaces externos. No somos una plataforma oficial de Netflix, Disney, TMDB ni Internet Archive.</p>',
      legal:'<h3>Aviso legal</h3><p>Este sitio no aloja archivos de video en sus propios servidores. El contenido se reproduce desde servicios externos. Los derechos de nombres, imágenes y obras pertenecen a sus respectivos titulares.</p>',
      terms:'<h3>Términos y condiciones</h3><p>Al utilizar este sitio aceptas hacerlo conforme a las leyes aplicables. Los enlaces pueden cambiar o dejar de estar disponibles. El sitio puede retirar contenido reportado o modificar sus funciones sin previo aviso.</p>'
    };
    document.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>document.querySelector('#settingsText').innerHTML=texts[b.dataset.info]);
  }
  document.querySelectorAll('[data-nav-action]').forEach(btn=>btn.onclick=()=>btn.dataset.navAction==='favorites'?renderFavorites():renderSettings());
  document.querySelectorAll('.nav-home').forEach(a=>a.classList.toggle('active',location.pathname.endsWith('/')||location.pathname.endsWith('/index.html')));
})();