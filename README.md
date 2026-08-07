# Home

A personal home dashboard — recipes, shopping list, and a to-do list — rebuilt from a Power Apps canvas app (a mobile-only app, canvas 640×1300) as a static, zero-build web app. The layout is locked to a phone-width column (`--phone-width` in `css/styles.css`, currently 412px) centered on any screen size, so it looks and behaves like a phone app whether opened on an actual phone or a desktop browser.

## Structure

- `index.html` — app shell (header, view containers, bottom nav)
- `css/styles.css` — theme and layout (orange, based on the original Power App)
- `js/config.js` — greeting text, weather location, feature toggles — **edit this to personalize**
- `js/store.js` — data layer; seeds from `data/*.json` on first run, then persists changes to `localStorage`
- `js/api.js` — free, no-key weather (Open-Meteo) and verse-of-the-day (bible-api.com) lookups
- `js/views/*.js` — one render module per screen (Home, Recipes, Shopping List, Planning/To-Do)
- `js/app.js` — hash-based router wiring the bottom nav to each view
- `data/*.json` — seed data (recipes, shopping list, tasks, sections, units, daily messages)

## Using the app

Just open it in a browser — no install or server required: **https://noahjensen17.github.io/Food-Management/**

## Running locally (optional)

No build step is required — serve the folder with any static file server, e.g. `py -m http.server 5173` or `npx serve .`, then open the printed `http://localhost` URL.

(Opening `index.html` directly via `file://` will fail because the seed data is loaded with `fetch()`, which requires `http://`.)

## Deploying

Push to `main` — `.github/workflows/deploy.yml` publishes the repo root to GitHub Pages automatically.

## Data storage — current state and next step

Data currently lives in the browser's `localStorage`, seeded from the JSON files in `data/` the first time the app loads. This is intentional groundwork for swapping in Google Sheets as the real backend later: every view calls functions on `window.Store` (in `js/store.js`) and never touches `localStorage` directly, so replacing the internals of `store.js` with Google Sheets API calls is the only change needed — no view code has to change.

## Known gaps vs. the original Power App

- The original's 250 rotating "message of the day" entries lived in Dataverse and were not present in the exported app package, so they could not be recovered. `data/prompts.json` ships with a small set of placeholder messages — replace/expand that list with the real ones whenever you have them.
- Live weather and the Bible verse now come from free public APIs (Open-Meteo, bible-api.com) instead of the Power Platform connectors, which don't exist outside Power Apps.
- Recipe photos were intentionally dropped from this rebuild.
