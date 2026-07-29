(() => {
  const movies = window.WMP_MOVIES || [];
  const series = window.WMP_SERIES || [];
  const makeCard = item => {
    const a=document.createElement('a'); a.className='card'; a.href=item.href;
    a.innerHTML=`<div class="poster"><img src="${item.poster}" alt="${item.title}" loading="lazy"></div><h3>${item.title}</h3><p>${item.year} · ${item.genre||''}</p>`;
    return a;
  };
  const movieRail=document.querySelector('#movieRail');
  if(movieRail) movies.forEach(m=>movieRail.appendChild(makeCard(m)));
  const seriesRail=document.querySelector('#seriesRail');
  if(seriesRail){ series.forEach(m=>seriesRail.appendChild(makeCard(m))); if(!series.length) seriesRail.closest('.section')?.remove(); }
  const featured=movies[0];
  if(featured){
    document.querySelector('.hero-bg')?.style.setProperty('background-image',`url("${featured.backdrop}")`);
    const t=document.querySelector('#heroTitle'); if(t)t.textContent=featured.title;
    const d=document.querySelector('#heroDesc'); if(d)d.textContent=featured.description;
    const p=document.querySelector('#heroPlay'); if(p)p.href=featured.href;
    const i=document.querySelector('#heroInfo'); if(i)i.href=featured.href;
  }
  const grid=document.querySelector('#catalogGrid');
  if(grid){
    const kind=document.body.dataset.catalog;
    const source=kind==='tv'?series:movies;
    const render=q=>{ grid.innerHTML=''; const filtered=source.filter(x=>`${x.title} ${x.year} ${x.genre||''}`.toLowerCase().includes(q.toLowerCase())); filtered.forEach(x=>grid.appendChild(makeCard(x))); document.querySelector('#empty')?.classList.toggle('hidden',filtered.length>0); };
    render('');
    document.querySelector('#catalogSearch')?.addEventListener('input',e=>render(e.target.value));
  }
  document.querySelector('[data-back]')?.addEventListener('click',()=>history.length>1?history.back():location.assign('index.html'));
})();
