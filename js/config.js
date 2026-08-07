// App-wide configuration. Edit this file to personalize the app.
window.APP_CONFIG = {
  greetingName: "Liv",
  greetingLine: "Hey Love:",

  // Open-Meteo (no API key required). Find coordinates at latlong.net.
  weather: {
    latitude: 43.0125,
    longitude: -87.9805,
    label: "Racine, WI",
    unit: "fahrenheit"
  },

  // bible-api.com (no API key required). Leave verseReference blank for a random-ish daily verse.
  verseOfTheDay: {
    enabled: true,
    reference: "" // e.g. "john 3:16" — blank uses the rotating default list in js/api.js
  },

  dailyMessage: {
    enabled: true
  }
};
