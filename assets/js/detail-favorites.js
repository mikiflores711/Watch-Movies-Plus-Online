(() => {
  const button=document.querySelector('[data-detail-favorite]');
  if(!button)return;
  const key=button.dataset.detailFavorite;
  const storageKey='wmp_favorites';
  const read=()=>{try{return new Set(JSON.parse(localStorage.getItem(storageKey)||'[]'))}catch(_){return new Set()}};
  const paint=()=>{const active=read().has(key);button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.querySelector('span').textContent=active?'En favoritos':'Mi lista'};
  button.addEventListener('click',()=>{const set=read();set.has(key)?set.delete(key):set.add(key);localStorage.setItem(storageKey,JSON.stringify([...set]));paint()});
  paint();
})();
