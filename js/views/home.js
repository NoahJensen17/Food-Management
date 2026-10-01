window.ViewHome = (function () {
  const el = () => document.getElementById("view-home");

  // The Home DOM is built once and then kept (just hidden/shown by the router), so
  // switching tabs never rebuilds it — no "Loading…" flash, no layout re-settling, and
  // the cat stays exactly where she is. Revisits only refresh stale weather in place.
  let rendered = false;
  let weatherLoadedAt = 0;
  const WEATHER_STALE_MS = 10 * 60 * 1000;

  async function render() {
    if (rendered) {
      if (!document.getElementById("weather-body")) return; // first build still in flight
      if (Date.now() - weatherLoadedAt > WEATHER_STALE_MS) loadWeather(true);
      return;
    }
    rendered = true;
    const cfg = window.APP_CONFIG;

    // Fetch weather + verse BEFORE building the screen, so the first paint already shows
    // the final content instead of "Loading…" placeholders that then jolt the layout.
    // Capped at a few seconds so a slow/offline API can't leave Home blank; anything
    // that misses the cap falls back to a short message (the Refresh button retries).
    const [weather, verse] = await Promise.all([
      withTimeout(window.Api.getWeather(), FIRST_PAINT_TIMEOUT_MS),
      cfg.verseOfTheDay.enabled
        ? withTimeout(window.Api.getVerseOfTheDay(), FIRST_PAINT_TIMEOUT_MS)
        : Promise.resolve(null)
    ]);
    if (weather) weatherLoadedAt = Date.now();

    el().innerHTML = `
      <div class="home-greeting">Welcome, ${cfg.greetingName}</div>

      <div class="home-grid">
        <div class="card" id="weather-card">
          <div class="card-title">Weather &middot; ${cfg.weather.label}</div>
          <div id="weather-body">${weather ? weatherHtml(weather) : "Weather unavailable right now."}</div>
          <button class="refresh-btn" id="refresh-weather">Refresh Weather</button>
        </div>
      </div>

      <div class="card" id="verse-card" style="${cfg.verseOfTheDay.enabled ? "" : "display:none"}">
        <div class="card-title">Verse of the Day</div>
        <div id="verse-body">${verse ? verseHtml(verse) : "Verse unavailable right now."}</div>
      </div>

      <div class="card card--flush" id="cat-card">
        <div id="cat-widget"></div>
      </div>
    `;

    document.getElementById("refresh-weather").addEventListener("click", () => loadWeather());
    window.CatWidget.render(document.getElementById("cat-widget"));
  }

  const FIRST_PAINT_TIMEOUT_MS = 4000;

  // Resolves to the promise's value, or null if it fails or takes longer than ms.
  function withTimeout(promise, ms) {
    return Promise.race([
      promise.catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), ms))
    ]);
  }

  function weatherHtml(w) {
    return `
        <div class="weather-row">
          <div class="weather-temp">${w.temp}${w.unitSymbol}</div>
          <div class="weather-feels">Feels like ${w.feelsLike}${w.unitSymbol}</div>
        </div>
      `;
  }

  function verseHtml(v) {
    return `<div class="verse-text">${v.text}</div><div class="verse-ref">${v.reference}</div>`;
  }

  // silent: keep the current reading on screen while refreshing in the background,
  // and leave it untouched if the refresh fails.
  async function loadWeather(silent) {
    const body = document.getElementById("weather-body");
    if (!silent) body.textContent = "Loading…";
    try {
      const w = await window.Api.getWeather();
      weatherLoadedAt = Date.now();
      body.innerHTML = weatherHtml(w);
    } catch (e) {
      if (!silent) body.textContent = "Weather unavailable right now.";
    }
  }

  return { render };
})();
