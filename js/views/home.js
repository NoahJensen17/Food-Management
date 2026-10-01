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
      if (Date.now() - weatherLoadedAt > WEATHER_STALE_MS) loadWeather(true);
      return;
    }
    rendered = true;
    const cfg = window.APP_CONFIG;

    el().innerHTML = `
      <div class="home-greeting">Welcome, ${cfg.greetingName}</div>

      <div class="home-grid">
        <div class="card" id="weather-card">
          <div class="card-title">Weather &middot; ${cfg.weather.label}</div>
          <div id="weather-body">Loading&hellip;</div>
          <button class="refresh-btn" id="refresh-weather">Refresh Weather</button>
        </div>
      </div>

      <div class="card" id="verse-card" style="${cfg.verseOfTheDay.enabled ? "" : "display:none"}">
        <div class="card-title">Verse of the Day</div>
        <div id="verse-body">Loading&hellip;</div>
      </div>

      <div class="card card--flush" id="cat-card">
        <div id="cat-widget"></div>
      </div>
    `;

    document.getElementById("refresh-weather").addEventListener("click", () => loadWeather());
    loadWeather();
    loadVerse();
    window.CatWidget.render(document.getElementById("cat-widget"));
  }

  // silent: keep the current reading on screen while refreshing in the background,
  // and leave it untouched if the refresh fails.
  async function loadWeather(silent) {
    const body = document.getElementById("weather-body");
    if (!silent) body.textContent = "Loading…";
    try {
      const w = await window.Api.getWeather();
      weatherLoadedAt = Date.now();
      body.innerHTML = `
        <div class="weather-row">
          <div class="weather-temp">${w.temp}${w.unitSymbol}</div>
          <div class="weather-feels">Feels like ${w.feelsLike}${w.unitSymbol}</div>
        </div>
      `;
    } catch (e) {
      if (!silent) body.textContent = "Weather unavailable right now.";
    }
  }

  async function loadVerse() {
    if (!window.APP_CONFIG.verseOfTheDay.enabled) return;
    const body = document.getElementById("verse-body");
    try {
      const v = await window.Api.getVerseOfTheDay();
      body.innerHTML = `<div class="verse-text">${v.text}</div><div class="verse-ref">${v.reference}</div>`;
    } catch (e) {
      body.textContent = "Verse unavailable right now.";
    }
  }

  return { render };
})();
