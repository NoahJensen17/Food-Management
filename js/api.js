// Free, no-API-key external data for the Home dashboard.
window.Api = (function () {
  async function getWeather() {
    const { latitude, longitude, unit } = window.APP_CONFIG.weather;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature&temperature_unit=${unit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather request failed");
    const data = await res.json();
    return {
      temp: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      unitSymbol: data.current_units.temperature_2m
    };
  }

  const FALLBACK_REFERENCES = [
    "philippians 4:13", "psalm 23:1", "proverbs 3:5-6", "joshua 1:9",
    "isaiah 41:10", "romans 8:28", "psalm 46:1", "matthew 6:34",
    "jeremiah 29:11", "psalm 118:24"
  ];

  async function getVerseOfTheDay() {
    const configured = window.APP_CONFIG.verseOfTheDay.reference;
    const dayIndex = new Date().getDate() % FALLBACK_REFERENCES.length;
    const reference = configured || FALLBACK_REFERENCES[dayIndex];
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}`);
    if (!res.ok) throw new Error("Verse request failed");
    const data = await res.json();
    return { text: data.text.trim(), reference: data.reference };
  }

  return { getWeather, getVerseOfTheDay };
})();
