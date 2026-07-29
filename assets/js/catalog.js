(() => {
  const items = window.WMP_CATALOG || [];
  const img = item => item.poster || '';
  const makeCard = item => `<a class="card" href="${item.page}"><img src="${img(item)}" alt="${item.title}" loading="lazy"><h3>${item.title}</h3><p>${item.type==='tv'?'Serie':'Película'} · ${item.year}</p></a>`;
  const movies = items.filter(x=>x.type==='movie'), series=items.filter(x=>x.type==='tv');
  const movieGrid=document.querySelector('#movieGrid'), seriesGrid=document.querySelector('#seriesGrid');
  if(movieGrid) movieGrid.innerHTML=movies.map(makeCard).join('');
  if(seriesGrid) seriesGrid.innerHTML=series.map(makeCard).join('');
  const hero=items[0];
  if(hero && document.querySelector('.hero-bg')){
    document.querySelector('.hero-bg').style.backgroundImage=`url('${hero.backdrop}')`;
    document.querySelector('#heroTitle').textContent=hero.title;
    document.querySelector('#heroPlay').href=hero.page;
  }
})();
