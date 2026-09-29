// App-wide configuration. Edit this file to personalize the app.
window.APP_CONFIG = {
  greetingName: "Liv",
  greetingLine: "Hey Love:",

  // Google Sheets ("Meal Plan App Data"). Reads go straight to the Sheets API v4 REST
  // endpoint with this API key. Writes (add/update/delete) go through the Apps Script
  // Web App URL below, which holds no client-exposed credentials.
  sheets: {
    spreadsheetId: "1ine067TCAq1hO7a9Omsl2yu4eGZ53zZJ_QtveUHXie0",
    apiKey: "AIzaSyCT5KVgVMnoMNSCX7BC-OwOLuq7x4S94kY",
    appsScriptUrl: "https://script.google.com/macros/s/AKfycbwn9-gFHERGQXrHmlQw4FfD2b_tXW7KM6tEimOvHE56EGHZUamCoqlswwPh8yLl78gX/exec",
    tabs: {
      recipes: "Recipes",
      instructions: "Instructions",
      shoppingList: "Shopping List",
      messages: "Messages"
    }
  },

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
