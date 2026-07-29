(() => {
  const cfg = window.WMP_CONFIG || {};
  const API = 'https://api.themoviedb.org/3';
  const key = cfg.tmdbApiKey || '';
  const language = cfg.language || 'es-MX';
  async function get(path, params = {}) {
    const url = new URL(API + path);
    url.searchParams.set('api_key', key);
    url.searchParams.set('language', language);
    Object.entries(params).forEach(([k,v]) => v !== '' && v != null && url.searchParams.set(k, v));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB ${response.status}`);
    return response.json();
  }
  window.TMDB = {
    get,
    image(path, size = 'original') { return path ? `${cfg.imageBase || 'https://image.tmdb.org/t/p/'}${size}${path}` : ''; },
    async movie(id) { return Promise.all([get(`/movie/${id}`), get(`/movie/${id}/credits`)]).then(([details,credits]) => ({details,credits})); },
    async tv(id) { return Promise.all([get(`/tv/${id}`), get(`/tv/${id}/credits`)]).then(([details,credits]) => ({details,credits})); },
    season(id, number) { return get(`/tv/${id}/season/${number}`); }
  };
})();
