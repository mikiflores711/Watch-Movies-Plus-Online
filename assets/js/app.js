
    /* ============================================================
       CATÁLOGO
       Catálogo de películas y series. Las series pueden incluir temporadas y episodios MP4 directos.
       ============================================================ */
    const MOVIES = window.CINEPLAY_CATALOG || [];;

    const state = {
      currentMovie: null,
      currentSource: 0,
      currentSeason: 0,
      currentEpisode: 0,
      favorites: new Set(JSON.parse(localStorage.getItem("cineplay_favorites") || "[]")),
      query: "",
      category: "all",
      controlsTimer: null
    };

    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];

    const catalogView = $("#catalogView");
    const detailView = $("#detailView");
    const videoElement = $("#directVideo");
    const serverOverlay = $("#serverOverlay");
    const videoPlayer = null; // Vidstack Web Component usa el proveedor HTML5 nativo para MP4.
    let hlsInstance = null;

    // Vidstack administra la carga internamente. En el fallback <video>, load() sigue disponible.
    function safeMediaLoad(media = videoElement) {
      try {
        if (media && typeof media.load === "function") media.load();
      } catch (error) {
        console.warn("CinePlay: no fue posible reiniciar la carga del medio", error);
      }
    }

    function setMediaSource(media, source) {
      if (!media) return;
      // Vidstack acepta un objeto tipado; <video> requiere una URL de texto.
      if (media.tagName?.toLowerCase() === "media-player") {
        media.src = { src: source.url, type: mediaMimeType(source) };
      } else {
        media.src = source.url;
      }
    }

    /* ============================================================
       REPRODUCTOR CINEPLAY V4
       Carga estable en Safari/iPhone, reintentos y errores reales.
       ============================================================ */
    const playerV4 = {
      token: 0,
      retryCount: 0,
      maxRetries: 2,
      loadTimer: null,
      lastProgressSave: 0,
      sourceUrl: "",
      userRequestedPlay: false,
      failedSources: new Set(),
      autoSwitching: false
    };

    if (videoElement) {
      videoElement.setAttribute("playsinline", "");
      videoElement.setAttribute("webkit-playsinline", "");
      videoElement.setAttribute("preload", "metadata");
      videoElement.setAttribute("controlslist", "nodownload noremoteplayback");
      videoElement.setAttribute("disablepictureinpicture", "");
      videoElement.autoplay = false;
    }

    function escapeXml(text) {
      return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
    }

    function makePoster(movie, wide = false) {
      if (wide && movie.backdrop) return movie.backdrop;
      if (movie.poster) return movie.poster;
      const [c1, c2, c3] = movie.colors;
      const w = wide ? 1280 : 600;
      const h = wide ? 720 : 900;
      const fontSize = wide ? 72 : 48;
      const maxChars = wide ? 27 : 18;
      const words = movie.title.split(" ");
      const lines = [];
      let line = "";
      words.forEach(word => {
        const test = `${line} ${word}`.trim();
        if (test.length > maxChars && line) { lines.push(line); line = word; }
        else line = test;
      });
      if (line) lines.push(line);
      const startY = h / 2 - ((lines.length - 1) * fontSize * .62);
      const tspans = lines.slice(0, 4).map((l, i) =>
        `<tspan x="50%" y="${startY + i * fontSize * 1.05}">${escapeXml(l)}</tspan>`
      ).join("");

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="${c1}"/>
              <stop offset="0.55" stop-color="${c2}"/>
              <stop offset="1" stop-color="${c3}"/>
            </linearGradient>
            <radialGradient id="r"><stop stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)"/>
          <circle cx="78%" cy="22%" r="${wide ? 260 : 190}" fill="url(#r)"/>
          <path d="M0 ${h*.73} Q${w*.28} ${h*.47} ${w*.56} ${h*.72} T${w} ${h*.62} V${h} H0Z" fill="#000" opacity=".34"/>
          <path d="M0 ${h*.85} Q${w*.35} ${h*.65} ${w} ${h*.78} V${h} H0Z" fill="#000" opacity=".5"/>
          <text text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-1">${tspans}</text>
          <text x="50%" y="${h*.92}" text-anchor="middle" fill="#fff" opacity=".74" font-family="Arial, sans-serif" font-size="${wide ? 23 : 21}" font-weight="700">CINEPLAY</text>
        </svg>`;
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function movieCard(movie) {
      const article = document.createElement("article");
      article.className = "movie-card";
      article.dataset.id = movie.id;
      const meta = movie.type === "series"
        ? `${movie.year} · ${movie.seasons.length} temporadas`
        : `${movie.year} · ${movie.genre.split(" · ")[0]}`;
      article.innerHTML = `
        <div class="poster">
          <img src="${makePoster(movie)}" alt="Portada de ${movie.title}" loading="lazy">
          ${movie.score ? `<span class="rating">★ ${movie.score}</span>` : ""}
          <button class="favorite-dot ${state.favorites.has(movie.id) ? "active" : ""}" aria-label="Favorito" data-favorite="${movie.id}">
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"></path></svg>
          </button>
        </div>
        <h3 class="card-title">${movie.title}</h3>
        <p class="card-meta">${meta}</p>`;

      article.addEventListener("click", (event) => {
        const fav = event.target.closest("[data-favorite]");
        if (fav) {
          event.stopPropagation();
          toggleFavorite(movie.id);
          return;
        }
        openMovie(movie.id);
      });
      return article;
    }

    function setRail(element, movies) {
      element.innerHTML = "";
      movies.forEach(movie => element.appendChild(movieCard(movie)));
      element.parentElement.style.display = movies.length ? "block" : "none";
    }

    function renderCatalog() {
      const q = state.query.trim().toLowerCase();
      const filtered = MOVIES.filter(movie => {
        const matchesQuery = !q || `${movie.title} ${movie.genre} ${movie.year}`.toLowerCase().includes(q);
        const matchesCategory = state.category === "all" ||
          (state.category === "favorites" ? state.favorites.has(movie.id) : movie.category.includes(state.category));
        return matchesQuery && matchesCategory;
      });

      const premieres = filtered.filter(m => m.category.includes("premieres"));
      const movies = filtered.filter(m => m.category.includes("movies"));
      const series = filtered.filter(m => m.category.includes("series"));
      const favorites = filtered.filter(m => state.favorites.has(m.id));
      setRail($("#premiereRail"), premieres);
      setRail($("#allRail"), movies);
      setRail($("#seriesRail"), series);
      setRail($("#favoritesRail"), favorites);
      $("#emptyState").style.display = filtered.length ? "none" : "block";

      $$(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.category === state.category));
    }

    function setupHero() {
      const featured =
        MOVIES.find(item => item.id === "he-man-1983") ||
        MOVIES[2] ||
        MOVIES[0];

      if (!featured) {
        const hero = $("#hero");
        if (hero) hero.style.display = "none";
        return;
      }

      $("#heroTitle").textContent = featured.title || "";
      $("#heroDescription").textContent = featured.description || "";
      $("#heroArt").style.backgroundImage = `url("${makePoster(featured, true)}")`;
      $("#hero").onclick = () => openMovie(featured.id);
      $("#hero").onkeydown = event => {
        if (event.key === "Enter") openMovie(featured.id);
      };
    }

    function filterCategory(category) {
      state.category = category;
      renderCatalog();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.filterCategory = filterCategory;

    function saveFavorites() {
      localStorage.setItem("cineplay_favorites", JSON.stringify([...state.favorites]));
    }

    function toggleFavorite(movieId) {
      if (state.favorites.has(movieId)) {
        state.favorites.delete(movieId);
        showToast("Eliminada de favoritas");
      } else {
        state.favorites.add(movieId);
        showToast("Agregada a favoritas");
      }
      saveFavorites();
      renderCatalog();
      if (state.currentMovie?.id === movieId) {
        $("#detailFavorite").classList.toggle("active", state.favorites.has(movieId));
      }
    }

    function currentSource() {
      if (!state.currentMovie) return null;
      if (state.currentMovie.type === "series") {
        return state.currentMovie.seasons[state.currentSeason]?.episodes[state.currentEpisode] || null;
      }
      return state.currentMovie.sources[state.currentSource] || null;
    }

    function resetMedia() {
      clearTimeout(state.controlsTimer);
      if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.reset();
        videoPlayer.autoplay(false);
      } else if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute("src");
        safeMediaLoad(videoElement);
      }
    }

    function openMovie(movieId, updateHash = true) {
      const movie = MOVIES.find(m => m.id === movieId);
      if (!movie) return;
      if (!window.CINEPLAY_PAGE_ID && movie.page) {
        window.location.href = movie.page;
        return;
      }
      state.currentMovie = movie;
      state.currentSource = 0;
      state.currentSeason = 0;
      state.currentEpisode = 0;
      playerV4.failedSources.clear();
      playerV4.autoSwitching = false;
      resetMedia();

      $("#detailTitle").innerHTML = movie.score ? `${movie.title} <span class="score">${movie.score}</span>` : movie.title;
      $("#detailMeta").textContent = `${movie.country || "País no especificado"}  |  ${movie.year}  |  ${movie.genre}`;
      $("#detailDescription").textContent = movie.description;
      $("#detailDirector").textContent = movie.director || "Información no disponible";
      $("#detailActors").textContent = movie.actors || "Información no disponible";
      $("#detailCreatorLabel").textContent = movie.type === "series" ? "Creador:" : "Director:";
      $("#detailCastLabel").textContent = movie.type === "series" ? "Reparto:" : "Actores:";
      setPlayerPoster(movie);
      $("#detailFavorite").classList.toggle("active", state.favorites.has(movie.id));
      $("#descriptionWrap").classList.remove("expanded");
      $("#descriptionToggle").textContent = "ver más";
      $("#seriesEpisodes").classList.toggle("hidden", movie.type !== "series");
      $("#nowPlaying").classList.toggle("hidden", movie.type !== "series");

      if (movie.type === "series") {
        renderSeasonTabs();
        renderEpisodes();
        updateEpisodeText();
        stageEpisode(0, 0, false);
      } else {
        renderServers();
        stageSource(0);
      }

      catalogView.classList.add("hidden");
      detailView.classList.add("visible");
      document.body.classList.add("movie-open");
      window.scrollTo(0, 0);
      document.title = `${movie.title} | CinePlay`;
      localStorage.setItem("cineplay_last_movie", movie.id);
      if (updateHash) history.pushState({ movieId }, "", `#pelicula=${movie.id}`);

    }

    function closeMovie(updateHistory = true) {
      if (window.CINEPLAY_PAGE_ID) {
        window.location.href = "index.html";
        return;
      }
      resetMedia();
      serverOverlay.classList.remove("visible");
      serverOverlay.setAttribute("aria-hidden", "true");
      detailView.classList.remove("visible");
      catalogView.classList.remove("hidden");
      document.body.classList.remove("movie-open");
      state.currentMovie = null;
      document.title = "CinePlay";
      if (updateHistory) history.pushState({}, "", location.pathname + location.search);
      renderCatalog();
    }

    function renderServers() {
      const list = $("#serverList");
      list.innerHTML = "";
      if (!state.currentMovie || state.currentMovie.type === "series") return;
      state.currentMovie.sources.forEach((source, index) => {
        const button = document.createElement("button");
        button.className = `server-option ${index === state.currentSource ? "active" : ""}`;
        button.innerHTML = `<span><strong>${source.name}</strong><br><small>Reproducción MP4 directa</small></span><span class="server-status">${index === state.currentSource ? "Seleccionado" : "Usar"}</span>`;
        button.onclick = () => {
          stageSource(index);
          closeServerSheet();
          showToast(`${source.name} seleccionado`);
        };
        list.appendChild(button);
      });
    }

    function stageSource(index) {
      if (!state.currentMovie?.sources?.[index]) return;
      state.currentSource = index;
      playerV4.failedSources.clear();
      playerV4.autoSwitching = false;
      resetMedia();
      setPlayerPoster(state.currentMovie);
      setPlayerSource(currentSource());
      renderServers();
    }

    function renderSeasonTabs() {
      const select = $("#seasonTabs");
      if (!select || state.currentMovie?.type !== "series") return;

      select.innerHTML = "";
      state.currentMovie.seasons.forEach((season, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = season.title || `Temporada ${season.number}`;
        option.selected = index === state.currentSeason;
        select.appendChild(option);
      });

      select.value = String(state.currentSeason);
      select.onchange = () => {
        const index = Number(select.value);
        const season = state.currentMovie.seasons[index];
        stageEpisode(index, 0, false);
        showToast(`${season.title || `Temporada ${season.number}`} seleccionada`);
      };

      const season = state.currentMovie.seasons[state.currentSeason];
      const lastEpisode = Math.max(0, ...season.episodes.map(episode => Number(episode.episode) || 0));
      $("#seriesUpdate").textContent = `Actualizada hasta el episodio ${lastEpisode || 65}`;
    }

    function renderEpisodes() {
      const list = $("#episodeList");
      list.innerHTML = "";
      const season = state.currentMovie.seasons[state.currentSeason];

      season.episodes.forEach((episode, index) => {
        const isActive = index === state.currentEpisode;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `episode-card ${isActive ? "active" : ""}`;
        button.setAttribute("aria-label", `${isActive ? "Reproduciendo" : "Reproducir"} episodio ${episode.episode}: ${episode.title}`);
        button.setAttribute("aria-pressed", String(isActive));
        button.title = `Episodio ${episode.episode}: ${episode.title}`;
        button.innerHTML = isActive
          ? `<svg class="episode-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>`
          : `<span class="episode-number">${episode.episode}</span>`;
        button.onclick = () => {
          stageEpisode(state.currentSeason, index);
          window.scrollTo({ top: 0, behavior: "smooth" });
        };
        list.appendChild(button);
      });
    }

    function updateEpisodeText() {
      if (state.currentMovie?.type !== "series") return;
      const season = state.currentMovie.seasons[state.currentSeason];
      const episode = season.episodes[state.currentEpisode];
      $("#nowPlaying").textContent = `Seleccionado: T${season.number} · E${episode.episode} — ${episode.title}`;
    }

    function stageEpisode(seasonIndex, episodeIndex) {
      if (state.currentMovie?.type !== "series") return;
      state.currentSeason = seasonIndex;
      state.currentEpisode = episodeIndex;
      resetMedia();
      setPlayerPoster(state.currentMovie);
      setPlayerSource(currentSource());
      updateEpisodeText();
      renderSeasonTabs();
      renderEpisodes();
    }

    function isDirectVideo(source) {
      return source?.type === "mp4" || /\.(mp4|webm|ogg)(?:$|\?)/i.test(source?.url || "");
    }

    function mediaMimeType(source) {
      const url = source?.url || "";
      if (/\.webm(?:$|\?)/i.test(url)) return "video/webm";
      if (/\.ogg(?:$|\?)/i.test(url)) return "video/ogg";
      return "video/mp4";
    }

    function setPlayerPoster(movie = state.currentMovie) {
      if (!movie) return;
      const poster = makePoster(movie, true);
      const playerRatio = $("#playerRatio");
      if (playerRatio) playerRatio.style.setProperty("--cineplay-player-poster", `url("${poster}")`);
      if (videoPlayer) {
        videoPlayer.poster(poster);
      } else if (videoElement) {
        videoElement.poster = poster;
        videoElement.setAttribute("poster", poster);
      }
    }

    async function resolveAdminOverride(source) {
      const endpoint = String(window.CINEPLAY_REPORT_URL || "").trim();
      if (!endpoint || !source?.url || !state.currentMovie) return source;
      const isSeries = state.currentMovie.type === "series";
      try {
        const result = await sendReportJsonp(endpoint, {
          action: "resolve",
          contentId: state.currentMovie.id || "",
          season: isSeries ? state.currentSeason + 1 : "",
          episode: isSeries ? state.currentEpisode + 1 : "",
          server: source.name || source.title || ""
        });
        if (result?.ok && result?.found && /^https?:\/\//i.test(result.url || "")) {
          return { ...source, url: result.url, originalUrl: source.url, overridden: true };
        }
      } catch (error) { console.warn("CinePlay: no se pudo consultar el enlace administrado", error); }
      return source;
    }

    async function setPlayerSource(source) {
      source = await resolveAdminOverride(source);
      if (!source?.url || !isDirectVideo(source)) return;
      const playerSource = { src: source.url, type: mediaMimeType(source) };
      if (videoPlayer) {
        videoPlayer.autoplay(false);
        videoPlayer.src(playerSource);
        videoPlayer.load();
      } else if (videoElement) {
        setMediaSource(videoElement, source);
        safeMediaLoad(videoElement);
      }
    }

    function openServerSheet() {
      if (!state.currentMovie) return;
      if (state.currentMovie.type === "series") {
        $("#seriesEpisodes").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      renderServers();
      serverOverlay.classList.add("visible");
      serverOverlay.setAttribute("aria-hidden", "false");
    }

    function closeServerSheet() {
      serverOverlay.classList.remove("visible");
      serverOverlay.setAttribute("aria-hidden", "true");
    }


    function handlePlaybackEnded() {
      if (state.currentMovie?.type === "series") {
        const season = state.currentMovie.seasons[state.currentSeason];
        if (state.currentEpisode + 1 < season.episodes.length) {
          showToast("Episodio terminado. Selecciona el siguiente episodio");
        }
      }
    }

    if (videoPlayer) {
      videoPlayer.on("ended", handlePlaybackEnded);
      videoPlayer.on("error", () => {
        const error = videoPlayer.error();
        if (error) showToast("No se pudo reproducir este MP4");
      });
    } else if (videoElement) {
      videoElement.addEventListener("ended", handlePlaybackEnded);
      videoElement.addEventListener("error", () => showToast("No se pudo reproducir este MP4"));
    }

    $("#backButton").onclick = () => history.back();
    $("#helpButton").onclick = () => showToast(
      state.currentMovie?.type === "series"
        ? "Selecciona una temporada y un episodio; después toca el botón central de Video.js"
        : "Toca el botón central para reproducir. Vidstack usa el motor HTML5 del navegador con los controles de CinePlay"
    );
    $("#serverMenuButton").onclick = openServerSheet;
    $("#closeServerSheet").onclick = closeServerSheet;
    const openExternalServerButton = $("#openExternalServer");
    if (openExternalServerButton) openExternalServerButton.remove();
    serverOverlay.addEventListener("click", event => {
      if (event.target === serverOverlay) closeServerSheet();
    });
    $("#descriptionToggle").onclick = () => {
      const wrap = $("#descriptionWrap");
      const expanded = wrap.classList.toggle("expanded");
      $("#descriptionToggle").textContent = expanded ? "ver menos" : "ver más";
    };

    $("#detailFavorite").onclick = () => state.currentMovie && toggleFavorite(state.currentMovie.id);

    $("#shareButton").onclick = async () => {
      if (!state.currentMovie) return;
      const data = { title: state.currentMovie.title, text: `Ver ${state.currentMovie.title}`, url: location.href };
      try {
        if (navigator.share) await navigator.share(data);
        else {
          await navigator.clipboard.writeText(location.href);
          showToast("Enlace copiado");
        }
      } catch { /* El usuario canceló */ }
    };

    $("#searchToggle").onclick = () => {
      $("#searchWrap").classList.toggle("visible");
      if ($("#searchWrap").classList.contains("visible")) $("#searchInput").focus();
    };

    $("#searchInput").addEventListener("input", event => {
      state.query = event.target.value;
      renderCatalog();
    });

    $$(".tab").forEach(tab => tab.onclick = () => filterCategory(tab.dataset.category));

    $$(".nav-item").forEach(button => {
      button.onclick = () => {
        $$(".nav-item").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        const nav = button.dataset.nav;
        if (nav === "home") {
          if (state.currentMovie) closeMovie();
          filterCategory("all");
        } else if (nav === "favorites") {
          if (state.currentMovie) closeMovie();
          filterCategory("favorites");
        } else {
          showToast("Sección de perfil lista para personalizar");
        }
      };
    });

    let toastTimer;
    function showToast(message) {
      const toast = $("#toast");
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
    }
    window.showToast = showToast;

    window.addEventListener("popstate", () => {
      const match = location.hash.match(/pelicula=([^&]+)/);
      if (match) openMovie(decodeURIComponent(match[1]), false);
      else if (state.currentMovie) closeMovie(false);
    });


    /* Controlador del reproductor nativo CinePlay */
    const playerUi = $("#playerUi");
    const playerProgress = $("#playerProgress");
    const loadingUi = { classList: { add(){}, remove(){} } };
    const episodeDrawer = $("#episodeDrawer");
    const trackPanel = $("#trackPanel");
    let playerIdleTimer = null;
    let unlockIdleTimer = null;
    let isSeeking = false;

    function formatPlayerTime(value) {
      if (!Number.isFinite(value)) return "00:00";
      const hours = Math.floor(value / 3600);
      const mins = Math.floor((value % 3600) / 60);
      const secs = Math.floor(value % 60);
      return hours ? `${hours}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}` : `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    }
    function revealPlayerControls() {
      if (playerUi.classList.contains("locked")) {
        const unlock = $("#unlockPlayerButton");
        unlock.classList.remove("hidden");
        clearTimeout(unlockIdleTimer);
        unlockIdleTimer = setTimeout(() => unlock.classList.add("hidden"), 3000);
        return;
      }
      playerUi.classList.remove("idle");
      clearTimeout(playerIdleTimer);
      if (!videoElement.paused) playerIdleTimer = setTimeout(() => playerUi.classList.add("idle"), 3000);
    }
    function syncPlayerUi() {
      playerUi.classList.toggle("is-paused", videoElement.paused);
      $("#currentTimeLabel").textContent = formatPlayerTime(videoElement.currentTime);
      $("#durationLabel").textContent = formatPlayerTime(videoElement.duration);
      if (!isSeeking && Number.isFinite(videoElement.duration) && videoElement.duration > 0) playerProgress.value = Math.round(videoElement.currentTime / videoElement.duration * 1000);
    }
    async function toggleNativePlayback() {
      if (playerUi.classList.contains("locked")) { revealPlayerControls(); return; }
      if (!videoElement.src && !hlsInstance) { const source = currentSource(); if (source) setPlayerSource(source); }
      try {
        if (videoElement.paused) {
          playerV4.userRequestedPlay = true;
          playerUi.classList.remove("initial-state");
          playerStatus(videoElement.readyState < 2 ? "Cargando video…" : "", "loading");
          await videoElement.play();
          playerStatus("", "ready");
          ensureExternalFallback().style.display = "none";
        } else {
          playerV4.userRequestedPlay = false;
          videoElement.pause();
          savePlaybackProgress(true);
        }
      } catch (error) {
        playerV4.userRequestedPlay = false;
        if (error?.name === "NotAllowedError") playerStatus("Safari bloqueó este intento. Toca otra vez el botón de reproducir.", "error");
        else if (error?.name === "NotSupportedError") { playerStatus("El navegador no admite el formato o códec de este archivo.", "error"); ensureExternalFallback().style.display = "block"; }
        else { playerStatus("No se pudo iniciar. Espera unos segundos y toca reproducir otra vez.", "error"); if (playerV4.retryCount < playerV4.maxRetries) retryCurrentSource(); else ensureExternalFallback().style.display = "block"; }
        console.warn("CinePlay playback error:", error);
      }
    }
    function closePlayerPanels() {
      episodeDrawer.classList.remove("open"); episodeDrawer.setAttribute("aria-hidden","true");
      trackPanel.classList.remove("open"); trackPanel.setAttribute("aria-hidden","true");
    }
    function renderPlayerEpisodeDrawer() {
      if (state.currentMovie?.type !== "series") return;
      $("#drawerSeriesTitle").textContent = state.currentMovie.title;
      const seasons = $("#drawerSeasons"); const episodes = $("#drawerEpisodes");
      seasons.innerHTML = ""; episodes.innerHTML = "";
      state.currentMovie.seasons.forEach((season,index)=>{ const b=document.createElement("button"); b.textContent=season.number || index+1; b.className=index===state.currentSeason?"active":""; b.onclick=()=>{stageEpisode(index,0);renderPlayerEpisodeDrawer();}; seasons.appendChild(b); });
      state.currentMovie.seasons[state.currentSeason].episodes.forEach((episode,index)=>{ const b=document.createElement("button"); b.textContent=index===state.currentEpisode?"▶":episode.episode; b.className=index===state.currentEpisode?"active":""; b.title=episode.title; b.onclick=()=>{stageEpisode(state.currentSeason,index);renderPlayerEpisodeDrawer();closePlayerPanels();playerStatus("Episodio preparado. Toca reproducir.","ready");}; episodes.appendChild(b); });
    }
    function renderTrackPanel() {
      const audioBox=$("#audioOptions"), subtitleBox=$("#subtitleOptions"); audioBox.innerHTML=""; subtitleBox.innerHTML="";
      const audioTracks=videoElement.audioTracks ? [...videoElement.audioTracks] : [];
      if (!audioTracks.length) audioBox.innerHTML='<button class="active">Audio original</button>';
      audioTracks.forEach((track,index)=>{const b=document.createElement("button");b.textContent=track.label||track.language||`Audio ${index+1}`;b.className=track.enabled?"active":"";b.onclick=()=>{audioTracks.forEach((t,i)=>t.enabled=i===index);renderTrackPanel();};audioBox.appendChild(b);});
      const off=document.createElement("button");off.textContent="Sin subtítulos";off.className=[...videoElement.textTracks].every(t=>t.mode!=="showing")?"active":"";off.onclick=()=>{[...videoElement.textTracks].forEach(t=>t.mode="disabled");renderTrackPanel();};subtitleBox.appendChild(off);
      [...videoElement.textTracks].forEach((track,index)=>{const b=document.createElement("button");b.textContent=track.label||track.language||`Subtítulos ${index+1}`;b.className=track.mode==="showing"?"active":"";b.onclick=()=>{[...videoElement.textTracks].forEach((t,i)=>t.mode=i===index?"showing":"disabled");renderTrackPanel();};subtitleBox.appendChild(b);});
      if (videoElement.textTracks.length===0) { const n=document.createElement("button");n.textContent="No disponibles";n.disabled=true;subtitleBox.appendChild(n); }
      const sizeBox=$("#subtitleSizeOptions"); sizeBox.innerHTML=""; [["Pequeño","subtitle-small"],["Normal",""],["Grande","subtitle-large"]].forEach(([label,cls])=>{const b=document.createElement("button");b.textContent=label;b.className=(cls?document.body.classList.contains(cls):!document.body.classList.contains("subtitle-small")&&!document.body.classList.contains("subtitle-large"))?"active":"";b.onclick=()=>{document.body.classList.remove("subtitle-small","subtitle-large");if(cls)document.body.classList.add(cls);renderTrackPanel();};sizeBox.appendChild(b);});
      const styleBox=$("#subtitleStyleOptions");styleBox.innerHTML="";[["Aa",""],["Aa","subtitle-yellow"],["Aa","subtitle-box"]].forEach(([label,cls])=>{const b=document.createElement("button");b.textContent=label;b.className=(cls?document.body.classList.contains(cls):!document.body.classList.contains("subtitle-yellow")&&!document.body.classList.contains("subtitle-box"))?"active":"";b.onclick=()=>{document.body.classList.remove("subtitle-yellow","subtitle-box");if(cls)document.body.classList.add(cls);renderTrackPanel();};styleBox.appendChild(b);});
    }
    function openTrackPanel(){ closePlayerPanels(); renderTrackPanel(); trackPanel.classList.add("open");trackPanel.setAttribute("aria-hidden","false");revealPlayerControls(); }

    // Fuente nativa MP4/WebM/HLS con respaldo especial para Safari/iPhone.
    function playerStatus(message, kind="loading") {
      let box = $("#playerV4Status");
      if (!box) {
        box = document.createElement("div");
        box.id = "playerV4Status";
        box.setAttribute("role", "status");
        box.style.cssText = "position:absolute;left:50%;bottom:84px;transform:translateX(-50%);z-index:40;max-width:calc(100% - 28px);padding:10px 14px;border-radius:12px;background:rgba(8,10,16,.88);color:#fff;font:700 13px/1.35 system-ui,sans-serif;text-align:center;backdrop-filter:blur(10px);display:none;pointer-events:none";
        $("#playerRatio")?.appendChild(box);
      }
      box.textContent = message || "";
      box.dataset.kind = kind;
      box.style.display = message ? "block" : "none";
    }

    function ensureExternalFallback() {
      // CinePlay V5 mantiene la reproducción dentro del sitio.
      // Se conserva un objeto neutro para no alterar la lógica de reintentos.
      return { style: { display: "none" } };
    }

    function playerErrorMessage(error = videoElement?.error) {
      if (!error) return "No se pudo iniciar el video.";
      switch (error.code) {
        case 1: return "La carga del video fue cancelada.";
        case 2: return "El servidor no respondió correctamente. Puede estar saturado.";
        case 3: return "El archivo llegó dañado o Safari no pudo decodificarlo.";
        case 4: return "El formato o códec de este video no es compatible.";
        default: return "No se pudo cargar el video.";
      }
    }

    function progressKey() {
      const movie = state.currentMovie;
      if (!movie) return "";
      if (movie.type === "series") {
        const season = movie.seasons?.[state.currentSeason];
        const episode = season?.episodes?.[state.currentEpisode];
        return `cineplay_progress_${movie.id}_s${season?.number ?? state.currentSeason}_e${episode?.episode ?? state.currentEpisode}`;
      }
      return `cineplay_progress_${movie.id}_${state.currentSource}`;
    }

    function savePlaybackProgress(force=false) {
      if (!videoElement || !Number.isFinite(videoElement.currentTime) || videoElement.currentTime < 5) return;
      const now = Date.now();
      if (!force && now - playerV4.lastProgressSave < 5000) return;
      playerV4.lastProgressSave = now;
      const key = progressKey();
      if (!key) return;
      if (Number.isFinite(videoElement.duration) && videoElement.duration - videoElement.currentTime < 20) localStorage.removeItem(key);
      else localStorage.setItem(key, String(videoElement.currentTime));
    }

    function restorePlaybackProgress() {
      const key = progressKey();
      if (!key || !Number.isFinite(videoElement.duration)) return;
      const saved = Number(localStorage.getItem(key));
      if (Number.isFinite(saved) && saved > 5 && saved < videoElement.duration - 20) {
        try { videoElement.currentTime = saved; } catch (_) {}
      }
    }

    function clearPlayerLoadTimer() { clearTimeout(playerV4.loadTimer); playerV4.loadTimer = null; }
    function armPlayerLoadTimer(token) {
      clearPlayerLoadTimer();
      playerV4.loadTimer = setTimeout(() => {
        if (token !== playerV4.token || videoElement.readyState >= 1) return;
        if (playerV4.retryCount < playerV4.maxRetries) retryCurrentSource("El servidor está tardando. Reintentando…");
        else { playerStatus("El servidor tardó demasiado. Intenta nuevamente en unos segundos.", "error"); ensureExternalFallback().style.display = "block"; }
      }, 15000);
    }

    function availableMovieSourceIndex() {
      if (state.currentMovie?.type === "series") return -1;
      const sources = state.currentMovie?.sources || [];
      if (sources.length < 2) return -1;

      for (let offset = 1; offset <= sources.length; offset++) {
        const index = (state.currentSource + offset) % sources.length;
        if (!playerV4.failedSources.has(index)) return index;
      }
      return -1;
    }

    function switchToNextServer(reason="El servidor actual no respondió.") {
      if (playerV4.autoSwitching || state.currentMovie?.type === "series") return false;

      const nextIndex = availableMovieSourceIndex();
      if (nextIndex < 0) return false;

      playerV4.autoSwitching = true;
      playerV4.failedSources.add(state.currentSource);
      const next = state.currentMovie.sources[nextIndex];
      playerStatus(`${reason} Probando ${next.name || `Servidor ${nextIndex + 1}`}…`, "loading");

      setTimeout(() => {
        state.currentSource = nextIndex;
        playerV4.retryCount = 0;
        setPlayerPoster(state.currentMovie);
        setPlayerSource(next);
        renderServers();
        playerV4.autoSwitching = false;
      }, 650);

      return true;
    }

    function retryCurrentSource(message="Reintentando la conexión…") {
      const source = currentSource();
      if (!source?.url) return;
      playerV4.retryCount += 1;
      playerStatus(`${message} (${playerV4.retryCount}/${playerV4.maxRetries})`, "loading");
      setTimeout(() => { setPlayerSource(source, { retry:true, preserveRetry:true }); playerStatus("Listo. Toca reproducir nuevamente.", "ready"); }, 700);
    }

    function setPlayerSource(source, options={}) {
      if (!source?.url || !videoElement) return;
      const token = ++playerV4.token;
      clearPlayerLoadTimer();
      if (!options.preserveRetry) playerV4.retryCount = 0;
      playerV4.sourceUrl = source.url;
      playerV4.userRequestedPlay = false;
      ensureExternalFallback().style.display = "none";
      playerStatus(options.retry ? "Reconectando con el servidor…" : "Preparando video…", "loading");
      if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
      try { videoElement.pause(); if (typeof videoElement.querySelectorAll === "function") [...videoElement.querySelectorAll("track")].forEach(track => track.remove()); videoElement.removeAttribute("src"); safeMediaLoad(videoElement); } catch (_) {}
      const url = source.url;
      const isHls = /\.m3u8(?:$|\?)/i.test(url) || source.type === "hls";
      const nativeHls = isHls && Boolean(typeof videoElement.canPlayType === "function" && videoElement.canPlayType("application/vnd.apple.mpegurl"));
      if (nativeHls) { setMediaSource(videoElement, { url, type: isHls ? "hls" : "mp4" }); safeMediaLoad(videoElement); }
      else if (isHls && window.Hls?.isSupported()) {
        hlsInstance = new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:30,manifestLoadingMaxRetry:2,levelLoadingMaxRetry:2,fragLoadingMaxRetry:2});
        hlsInstance.on(Hls.Events.ERROR, (_, data) => {
          if (token !== playerV4.token || !data?.fatal) return;
          if (playerV4.retryCount < playerV4.maxRetries) retryCurrentSource("Falló la transmisión. Reintentando…");
          else { playerStatus("No se pudo cargar la transmisión.", "error"); ensureExternalFallback().style.display = "block"; }
        });
        hlsInstance.loadSource(url); hlsInstance.attachMedia(videoElement);
      } else { setMediaSource(videoElement, { url, type: isHls ? "hls" : "mp4" }); safeMediaLoad(videoElement); }
      (source.subtitles || []).forEach((sub, index) => { const track=document.createElement("track"); track.kind="subtitles"; track.label=sub.label||sub.language||`Subtítulos ${index+1}`; track.srclang=sub.language||"es"; track.src=sub.url; if (videoElement.tagName?.toLowerCase() !== "media-player") videoElement.appendChild(track); });
      playerUi.classList.add("initial-state", "is-paused"); syncPlayerUi(); armPlayerLoadTimer(token);
    }

    $("#centerPlayButton").onclick=e=>{e.stopPropagation();if(playerUi.classList.contains("locked")){revealPlayerControls();return;}toggleNativePlayback();revealPlayerControls();};
    $("#rewindButton").onclick=e=>{e.stopPropagation();if(playerUi.classList.contains("locked")){revealPlayerControls();return;}videoElement.currentTime=Math.max(0,videoElement.currentTime-10);revealPlayerControls();};
    $("#forwardButton").onclick=e=>{e.stopPropagation();if(playerUi.classList.contains("locked")){revealPlayerControls();return;}videoElement.currentTime=Math.min(videoElement.duration||Infinity,videoElement.currentTime+10);revealPlayerControls();};
    playerProgress.oninput=()=>{isSeeking=true;if(Number.isFinite(videoElement.duration)) $("#currentTimeLabel").textContent=formatPlayerTime(videoElement.duration*playerProgress.value/1000);};
    playerProgress.onchange=()=>{if(Number.isFinite(videoElement.duration))videoElement.currentTime=videoElement.duration*playerProgress.value/1000;isSeeking=false;};
    function setPseudoFullscreen(active){
      const shell=$("#playerRatio");
      shell.classList.toggle("pseudo-fullscreen",active);
      document.documentElement.classList.toggle("player-pseudo-fullscreen",active);
      document.body.style.overflow=active?"hidden":"";
      document.body.classList.toggle("player-fullscreen",active);
      playerUi.classList.remove("initial-state");
      revealPlayerControls();
      try { if(active && screen.orientation?.lock) screen.orientation.lock("landscape").catch(()=>{}); else if(!active && screen.orientation?.unlock) screen.orientation.unlock(); } catch(_){}
    }
    $("#fullscreenButton").onclick=async e=>{
      e.stopPropagation();
      if(playerUi.classList.contains("locked")){revealPlayerControls();return;}
      const shell=$("#playerRatio");
      const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
      if(shell.classList.contains("pseudo-fullscreen")){setPseudoFullscreen(false);return;}
      if(isIOS){setPseudoFullscreen(true);return;}
      try {
        const fullscreenElement=document.fullscreenElement||document.webkitFullscreenElement;
        if(fullscreenElement){
          if(document.exitFullscreen) await document.exitFullscreen();
          else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else if(shell.requestFullscreen){
          await shell.requestFullscreen({navigationUI:"hide"});
        } else if(shell.webkitRequestFullscreen){
          shell.webkitRequestFullscreen();
        } else setPseudoFullscreen(true);
      } catch { setPseudoFullscreen(true); }
      playerUi.classList.remove("initial-state");
      revealPlayerControls();
    };
    $("#episodesPlayerButton").onclick=e=>{e.stopPropagation();renderPlayerEpisodeDrawer();episodeDrawer.classList.toggle("open");episodeDrawer.setAttribute("aria-hidden",String(!episodeDrawer.classList.contains("open")));};
    $("#closeEpisodeDrawer").onclick=closePlayerPanels; $("#closeTrackPanel").onclick=closePlayerPanels;
    $("#captionsPlayerButton").onclick=openTrackPanel; $("#serverMenuButton").onclick=openTrackPanel;
    $("#lockPlayerButton").onclick=e=>{e.stopPropagation();playerUi.classList.add("locked");closePlayerPanels();revealPlayerControls();};
    $("#unlockPlayerButton").onclick=e=>{e.stopPropagation();clearTimeout(unlockIdleTimer);playerUi.classList.remove("locked");$("#unlockPlayerButton").classList.add("hidden");revealPlayerControls();};
    playerUi.addEventListener("click",e=>{
      if(playerUi.classList.contains("locked")){e.preventDefault();e.stopPropagation();revealPlayerControls();return;}
      if(e.target===playerUi){playerUi.classList.contains("idle")?revealPlayerControls():toggleNativePlayback();}
    });
    ["mousemove","touchstart","keydown"].forEach(evt=>playerUi.addEventListener(evt,revealPlayerControls,{passive:true}));
    ["timeupdate","durationchange","play","pause","ended"].forEach(evt=>videoElement.addEventListener(evt,()=>{if(evt==="play")playerUi.classList.remove("initial-state");syncPlayerUi();if(evt==="play")revealPlayerControls();}));
    videoElement.addEventListener("dblclick",()=>{if(!playerUi.classList.contains("locked"))$("#fullscreenButton").click();else revealPlayerControls();});
    videoElement.addEventListener("loadstart", () => playerStatus("Conectando con el servidor…", "loading"));
    videoElement.addEventListener("loadedmetadata", () => { clearPlayerLoadTimer(); restorePlaybackProgress(); playerStatus("Video listo. Toca reproducir.", "ready"); setTimeout(() => { const box=$("#playerV4Status"); if(box?.dataset.kind==="ready") box.style.display="none"; },1800); });
    videoElement.addEventListener("canplay", () => { clearPlayerLoadTimer(); if(playerV4.userRequestedPlay) playerStatus("", "ready"); });
    videoElement.addEventListener("waiting", () => { if(!videoElement.paused) playerStatus("Cargando más video…", "loading"); });
    videoElement.addEventListener("playing", () => {
      clearPlayerLoadTimer();
      playerV4.failedSources.delete(state.currentSource);
      playerStatus("", "ready");
      ensureExternalFallback().style.display = "none";
    });
    videoElement.addEventListener("timeupdate", () => savePlaybackProgress(false));
    videoElement.addEventListener("pause", () => savePlaybackProgress(true));
    videoElement.addEventListener("ended", () => savePlaybackProgress(true));
    videoElement.addEventListener("error", () => {
      clearPlayerLoadTimer();
      const message = playerErrorMessage();
      const networkError = videoElement.error?.code === 2;

      if (networkError && playerV4.retryCount < playerV4.maxRetries) {
        retryCurrentSource(message + " Reintentando…");
        return;
      }

      if (switchToNextServer(message)) return;

      playerStatus(message + " No quedan más servidores disponibles.", "error");
      ensureExternalFallback().style.display = "block";
    });
    window.addEventListener("pagehide", () => savePlaybackProgress(true));
    const handleFullscreenChange=()=>{const active=!!(document.fullscreenElement||document.webkitFullscreenElement);document.body.classList.toggle("player-fullscreen",active);playerUi.classList.remove("initial-state");revealPlayerControls();}; document.addEventListener("fullscreenchange",handleFullscreenChange);document.addEventListener("webkitfullscreenchange",handleFullscreenChange);
    const brightnessControl=$("#brightnessControl"), volumeControl=$("#volumeControl");
    brightnessControl.oninput=()=>{videoElement.style.filter=`brightness(${brightnessControl.value}%)`;revealPlayerControls();};
    volumeControl.value=Math.round(videoElement.volume*100);
    volumeControl.oninput=()=>{videoElement.volume=Number(volumeControl.value)/100;videoElement.muted=false;revealPlayerControls();};
    videoElement.addEventListener("volumechange",()=>{if(!videoElement.muted)volumeControl.value=Math.round(videoElement.volume*100);});
    const originalBackClick=$("#backButton").onclick;
    $("#backButton").onclick=e=>{const shell=$("#playerRatio");if(shell.classList.contains("pseudo-fullscreen")){e.preventDefault();e.stopPropagation();setPseudoFullscreen(false);return;}if(document.fullscreenElement||document.webkitFullscreenElement){e.preventDefault();e.stopPropagation();if(document.exitFullscreen)document.exitFullscreen();else if(document.webkitExitFullscreen)document.webkitExitFullscreen();return;}if(originalBackClick)originalBackClick.call($("#backButton"),e);};
    window.addEventListener("popstate",()=>{if($("#playerRatio").classList.contains("pseudo-fullscreen"))setPseudoFullscreen(false);});

    const reportOverlay=$("#reportOverlay");
    const reportOverlayHome=reportOverlay.parentElement;

    // Campo opcional creado por JavaScript para no obligar a regenerar
    // todas las plantillas HTML existentes.
    let reportComment = $("#reportComment");
    if (!reportComment && reportOverlay) {
      reportComment = document.createElement("textarea");
      reportComment.id = "reportComment";
      reportComment.maxLength = 500;
      reportComment.placeholder = "Comentario opcional: explica qué ocurre…";
      reportComment.setAttribute("aria-label", "Comentario adicional del reporte");
      reportComment.style.cssText =
        "width:100%;min-height:82px;margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#171a24;color:#fff;font:inherit;resize:vertical;box-sizing:border-box";

      const options = reportOverlay.querySelector(".report-options");
      if (options) options.insertAdjacentElement("afterend", reportComment);
    }
    function playerIsFullscreen(){
      const shell=$("#playerRatio");
      return shell.classList.contains("pseudo-fullscreen") || document.fullscreenElement===shell || document.webkitFullscreenElement===shell;
    }
    function openReportOverlay(event){
      event?.preventDefault();
      event?.stopPropagation();
      // En pantalla completa, el navegador solo renderiza los descendientes
      // del elemento fullscreen. Movemos temporalmente el diálogo al reproductor.
      if(playerIsFullscreen()) $("#playerRatio").appendChild(reportOverlay);
      else if(reportOverlay.parentElement!==reportOverlayHome) reportOverlayHome.appendChild(reportOverlay);
      reportOverlay.classList.add("visible");
      reportOverlay.setAttribute("aria-hidden","false");
      clearTimeout(playerIdleTimer);
      playerUi.classList.remove("idle");
    }
    function closeReportOverlay(event){
      event?.preventDefault();
      event?.stopPropagation();
      reportOverlay.classList.remove("visible");
      reportOverlay.setAttribute("aria-hidden","true");
      if(reportOverlay.parentElement!==reportOverlayHome) reportOverlayHome.appendChild(reportOverlay);
      revealPlayerControls();
    }
    $("#helpButton").onclick=openReportOverlay;
    $("#closeReportOverlay").onclick=closeReportOverlay;
    reportOverlay.addEventListener("click",e=>{e.stopPropagation();if(e.target===reportOverlay)closeReportOverlay(e);});
    function sendReportJsonp(endpoint, payload) {
      return new Promise((resolve, reject) => {
        const callbackName =
          "__cineplayReport_" + Date.now() + "_" + Math.random().toString(36).slice(2);

        const script = document.createElement("script");
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("El receptor tardó demasiado en responder."));
        }, 15000);

        function cleanup() {
          clearTimeout(timeout);
          script.remove();
          try { delete window[callbackName]; }
          catch (_) { window[callbackName] = undefined; }
        }

        window[callbackName] = response => {
          cleanup();
          resolve(response);
        };

        script.onerror = () => {
          cleanup();
          reject(new Error("No se pudo conectar con el receptor."));
        };

        const params = new URLSearchParams({
          action: "report",
          callback: callbackName,
          data: JSON.stringify(payload),
          cache: String(Date.now())
        });

        script.src = endpoint + (endpoint.includes("?") ? "&" : "?") + params.toString();
        script.async = true;
        document.head.appendChild(script);
      });
    }

    async function sendContentReport(problem, button) {
      const endpoint = String(window.CINEPLAY_REPORT_URL || "").trim();
      const movie = state.currentMovie || {};
      const source = currentSource() || {};
      const isSeries = movie.type === "series";
      const season = isSeries ? (state.currentSeason + 1) : "";
      const episode = isSeries ? (state.currentEpisode + 1) : "";

      const payload = {
        app: "CinePlay",
        version: String(window.CINEPLAY_VERSION || "4.0"),
        problem,
        contentId: movie.id || "",
        title: movie.title || "Contenido desconocido",
        contentType: isSeries ? "serie" : "película",
        year: movie.year || "",
        season,
        episode,
        serverName: source.name || "",
        mediaUrl: source.url || "",
        pageUrl: location.href,
        userAgent: navigator.userAgent,
        reportedAt: new Date().toISOString(),
        comment: String(reportComment?.value || "").trim().slice(0, 500),
        reportKey: [movie.id || "", isSeries ? "serie" : "película", season, episode, source.name || source.title || "", problem].join("|")
      };

      if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
        showToast("El administrador aún no configuró el receptor de reportes.");
        return;
      }

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Enviando…";

      try {
        const result = await sendReportJsonp(endpoint, payload);

        if (!result?.ok) {
          throw new Error(result?.error || "El receptor no confirmó el guardado.");
        }

        showToast("Reporte guardado correctamente.");
        if (reportComment) reportComment.value = "";
        closeReportOverlay();
      } catch (error) {
        console.error("No se pudo enviar el reporte:", error);
        showToast("No se pudo guardar el reporte. Inténtalo nuevamente.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    }

    $$('[data-report]').forEach(button => {
      button.onclick = () => sendContentReport(button.dataset.report, button);
    });

    const originalOpenMovie = openMovie;
    openMovie = function(movieId, updateHash=true){ originalOpenMovie(movieId,updateHash); const isSeries=state.currentMovie?.type==="series";$("#episodesPlayerButton").classList.toggle("hidden",!isSeries);$("#fullscreenTitle").textContent=isSeries?`${state.currentMovie.title} · T${state.currentSeason+1} E${state.currentEpisode+1}`:state.currentMovie?.title||"";closePlayerPanels();clearTimeout(playerIdleTimer);clearTimeout(unlockIdleTimer);playerUi.classList.remove("locked","idle");playerUi.classList.add("initial-state","is-paused");$("#unlockPlayerButton").classList.add("hidden"); };

    const originalStageEpisode = stageEpisode;
    stageEpisode = function(seasonIndex,episodeIndex){originalStageEpisode(seasonIndex,episodeIndex);if(state.currentMovie)$("#fullscreenTitle").textContent=`${state.currentMovie.title} · T${state.currentSeason+1} E${state.currentEpisode+1}`;renderPlayerEpisodeDrawer();};

    const originalResetMedia = resetMedia;
    resetMedia = function(){
      clearPlayerLoadTimer();
      playerV4.token += 1;
      playerV4.retryCount = 0;
      playerV4.userRequestedPlay = false;
      playerV4.autoSwitching = false;
      if(hlsInstance){hlsInstance.destroy();hlsInstance=null;}
      savePlaybackProgress(true); originalResetMedia(); playerStatus("", "ready");
      const external=ensureExternalFallback(); if(external) external.style.display="none"; closePlayerPanels();
    };

    function init() {
      setupHero();
      renderCatalog();

      const directMovieId = String(window.CINEPLAY_PAGE_ID || "").trim();
      const match = location.hash.match(/pelicula=([^&]+)/);
      const movieId = directMovieId || (match ? decodeURIComponent(match[1]) : "");

      if (movieId) {
        // Las páginas individuales deben entrar directamente al reproductor,
        // sin mostrar antes el catálogo/hero de la película.
        openMovie(movieId, false);
        history.replaceState({ movieId }, "", `${location.pathname}#pelicula=${encodeURIComponent(movieId)}`);
      }
    }

    init();
  