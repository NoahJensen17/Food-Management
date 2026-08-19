window.ViewHome = (function () {
  const el = () => document.getElementById("view-home");

  async function render() {
    const cfg = window.APP_CONFIG;
    const prompts = await window.Store.getPrompts();
    const message = prompts[Math.floor(Math.random() * prompts.length)];

    el().innerHTML = `
      <div class="home-greeting">Welcome, ${cfg.greetingName}</div>
      <div class="home-sub">${cfg.greetingLine}</div>

      <div class="home-grid two-col">
        <div class="card">
          <div class="card-title">Message of the Day</div>
          <div class="verse-text">${message}</div>
        </div>

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
    `;

    document.getElementById("refresh-weather").addEventListener("click", loadWeather);
    loadWeather();
    loadVerse();
  }

  async function loadWeather() {
    const body = document.getElementById("weather-body");
    body.textContent = "Loading…";
    try {
      const w = await window.Api.getWeather();
      body.innerHTML = `
        <div class="weather-row">
          <div class="weather-temp">${w.temp}${w.unitSymbol}</div>
          <div class="weather-feels">Feels like ${w.feelsLike}${w.unitSymbol}</div>
        </div>
      `;
    } catch (e) {
      body.textContent = "Weather unavailable right now.";
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
