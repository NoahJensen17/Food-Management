// Data layer.
//
// Recipes, Instructions, Shopping List, and Messages are backed by the "Meal Plan App
// Data" Google Sheet: reads go straight to the Sheets API v4 REST endpoint with an API
// key (read-only, safe to expose client-side); writes (add/update/delete) go through an
// Apps Script Web App URL, since the Sheets API's write endpoints require OAuth that a
// static, login-free app can't hold securely. See js/config.js for the connection
// settings and apps-script/Code.gs for the write-side script.
//
// Tasks (Planning) and Sections (shopping category list) are unrelated to the Sheet and
// stay on localStorage, exactly as before.
window.Store = (function () {
  const PREFIX = "homeApp:";
  const LOCAL_SEED_FILES = {
    tasks: "data/tasks.json",
    sections: "data/sections.json"
  };
  const mergedThisSession = new Set();

  function readLocal(key) {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  }

  function writeLocal(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  async function fetchLocalSeed(key) {
    const res = await fetch(LOCAL_SEED_FILES[key]);
    if (!res.ok) throw new Error(`Failed to load seed data for ${key}`);
    return res.json();
  }

  async function ensureLocalSeeded(key) {
    let value = readLocal(key);
    if (value === null) {
      value = await fetchLocalSeed(key);
      writeLocal(key, value);
    }
    return value;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- Local (localStorage-only) collection helpers: Tasks + Sections ----

  async function getAllLocal(key) {
    return ensureLocalSeeded(key);
  }

  async function addLocal(key, record) {
    const items = await ensureLocalSeeded(key);
    const withId = { id: uid(), ...record };
    items.push(withId);
    writeLocal(key, items);
    return withId;
  }

  async function updateLocal(key, id, patch) {
    const items = await ensureLocalSeeded(key);
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch };
    writeLocal(key, items);
    return items[idx];
  }

  async function removeWhereLocal(key, predicate) {
    const items = await ensureLocalSeeded(key);
    const next = items.filter((i) => !predicate(i));
    writeLocal(key, next);
    return next;
  }

  // ---- Google Sheets helpers ----

  function sheetUrl(tab) {
    const cfg = window.APP_CONFIG.sheets;
    return "https://sheets.googleapis.com/v4/spreadsheets/" + cfg.spreadsheetId +
      "/values/" + encodeURIComponent(tab) +
      "?valueRenderOption=UNFORMATTED_VALUE&key=" + cfg.apiKey;
  }

  // Zips the header row into keys, so row["Recipe Name"] etc. works regardless of
  // column order in the sheet.
  function rowsToObjects(values) {
    if (!values || values.length < 2) return [];
    const headers = values[0].map((h) => h.toString().trim());
    return values.slice(1).map((row) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = row[i] !== undefined ? row[i] : ""; });
      return o;
    });
  }

  async function fetchSheet(tab) {
    const res = await fetch(sheetUrl(tab));
    if (!res.ok) throw new Error(`Failed to load sheet tab: ${tab}`);
    const data = await res.json();
    return rowsToObjects(data.values);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Apps Script's web app redirects every request to a one-time "echo" URL that serves
  // the real JSON response. That redirect/cold-start occasionally serves a transient
  // HTML page instead (a Google-side quirk, not an app bug), which breaks a naive
  // res.json() call. Reading as text and retrying once absorbs that flakiness instead
  // of surfacing a raw "Unexpected token '<'" parse error to the user.
  async function callAppsScriptOnce(action, payload) {
    const url = window.APP_CONFIG.sheets.appsScriptUrl;
    const res = await fetch(url, {
      method: "POST",
      // Apps Script Web Apps don't support preflighted JSON content-types well from the
      // browser; text/plain avoids the CORS preflight while the body is still valid JSON.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    });
    const text = await res.text();
    return JSON.parse(text);
  }

  async function callAppsScript(action, payload) {
    let data;
    try {
      data = await callAppsScriptOnce(action, payload);
    } catch (e) {
      await sleep(800);
      try {
        data = await callAppsScriptOnce(action, payload);
      } catch (e2) {
        throw new Error("Couldn't reach the Google Sheet. Please try again.");
      }
    }
    if (!data.ok) throw new Error(data.error || `Apps Script action failed: ${action}`);
    return data.result;
  }

  // ---- Recipes (Sheets-backed) ----
  // "Recipes" tab: one row per ingredient (Recipe Name, Ingredient).
  // "Instructions" tab: one row per step (Recipe Name, Step Description, Step Number).
  // Grouped client-side into { name, ingredients: [string,...], instructions: [string,...] }.

  // In-memory copy of the recipe list. Successful writes patch it directly, so the
  // list re-renders instantly after a save instead of re-downloading both sheet tabs.
  let recipesCache = null;

  async function getRecipes() {
    if (recipesCache) return recipesCache.map(cloneRecipe);
    const cfg = window.APP_CONFIG.sheets.tabs;
    const [recipeRows, instructionRows] = await Promise.all([
      fetchSheet(cfg.recipes),
      fetchSheet(cfg.instructions)
    ]);

    const byName = new Map();
    recipeRows.forEach((row) => {
      const name = String(row["Recipe Name"] || "").trim();
      if (!name) return;
      if (!byName.has(name)) byName.set(name, { name, ingredients: [], instructions: [] });
      const ing = String(row["Ingredient"] || "").trim();
      if (ing) byName.get(name).ingredients.push(ing);
    });

    instructionRows
      .slice()
      .sort((a, b) => Number(a["Step Number"]) - Number(b["Step Number"]))
      .forEach((row) => {
        const name = String(row["Recipe Name"] || "").trim();
        if (!byName.has(name)) byName.set(name, { name, ingredients: [], instructions: [] });
        const step = String(row["Step Description"] || "").trim();
        if (step) byName.get(name).instructions.push(step);
      });

    recipesCache = [...byName.values()];
    return recipesCache.map(cloneRecipe);
  }

  function cloneRecipe(r) {
    return { name: r.name, ingredients: [...r.ingredients], instructions: [...r.instructions] };
  }

  async function addRecipe(recipe) {
    const result = await callAppsScript("addRecipe", { recipe });
    if (recipesCache) recipesCache.push(cloneRecipe(recipe));
    return result;
  }

  async function updateRecipe(originalName, recipe) {
    const result = await callAppsScript("updateRecipe", { originalName, recipe });
    if (recipesCache) {
      const idx = recipesCache.findIndex((r) => r.name === originalName);
      if (idx === -1) recipesCache.push(cloneRecipe(recipe));
      else recipesCache[idx] = cloneRecipe(recipe);
    }
    return result;
  }

  async function deleteRecipe(name) {
    const result = await callAppsScript("deleteRecipe", { name });
    if (recipesCache) recipesCache = recipesCache.filter((r) => r.name !== name);
    return result;
  }

  // ---- Shopping List (Sheets-backed) ----
  // "Shopping List" tab: Ingredient (primary key), Store Section, Quantity, Active Flag (1/0).

  // Shopping-list writes are optimistic: the in-memory cache is patched synchronously
  // (so the UI can redraw instantly) and the Apps Script call runs in the background.
  // Writes go through a single queue so they reach the sheet in the order the user made
  // them. If a write ultimately fails, the cache is dropped so the next read reloads
  // the real sheet contents, and the returned promise rejects so the view can tell the
  // user.
  let shoppingCache = null;
  let writeQueue = Promise.resolve();

  function enqueueWrite(fn) {
    const p = writeQueue.then(fn);
    writeQueue = p.catch(() => {});
    return p;
  }

  function syncShoppingWrite(action, payload) {
    return enqueueWrite(() => callAppsScript(action, payload)).catch((err) => {
      shoppingCache = null;
      throw err;
    });
  }

  const sameItem = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

  async function getShoppingList() {
    if (!shoppingCache) {
      // Let any in-flight writes land first so we don't read a half-updated sheet.
      await writeQueue;
      if (!shoppingCache) {
        const cfg = window.APP_CONFIG.sheets.tabs;
        const rows = await fetchSheet(cfg.shoppingList);
        shoppingCache = rows
          .filter((row) => String(row["Ingredient"] || "").trim())
          .map((row) => ({
            item: String(row["Ingredient"]).trim(),
            section: String(row["Store Section"] || "").trim(),
            quantity: Number(row["Quantity"]) || 1,
            active: Number(row["Active Flag"]) === 1
          }));
      }
    }
    return shoppingCache.map((i) => ({ ...i }));
  }

  // item: { item, quantity, section, active }. Ingredient name is the primary key:
  // adding an ingredient that already exists updates that row instead of duplicating it.
  function addShoppingItem(item) {
    if (shoppingCache) {
      const existing = shoppingCache.find((i) => sameItem(i.item, item.item));
      if (existing) {
        existing.section = item.section;
        existing.quantity = item.quantity;
        existing.active = true;
      } else {
        shoppingCache.push({ item: item.item, section: item.section, quantity: item.quantity, active: true });
      }
    }
    return syncShoppingWrite("addShoppingItem", item);
  }

  // originalItem identifies the existing row by ingredient name; patch carries the
  // fields to change (item/section/quantity/active).
  function updateShoppingItem(originalItem, patch) {
    if (shoppingCache) {
      const existing = shoppingCache.find((i) => sameItem(i.item, originalItem));
      if (existing) {
        if (patch.item !== undefined) existing.item = patch.item;
        if (patch.section !== undefined) existing.section = patch.section;
        if (patch.quantity !== undefined) existing.quantity = patch.quantity;
        if (patch.active !== undefined) existing.active = !!patch.active;
      }
    }
    return syncShoppingWrite("updateShoppingItem", { originalItem, ...patch });
  }

  function deleteCheckedShoppingItems() {
    if (shoppingCache) shoppingCache = shoppingCache.filter((i) => i.active);
    return syncShoppingWrite("deleteCheckedShoppingItems", {});
  }

  function deleteShoppingItem(item) {
    if (shoppingCache) shoppingCache = shoppingCache.filter((i) => !sameItem(i.item, item));
    return syncShoppingWrite("deleteShoppingItem", { item });
  }

  // ---- Messages (Sheets-backed, read-only) ----

  async function getMessages() {
    const cfg = window.APP_CONFIG.sheets.tabs;
    const rows = await fetchSheet(cfg.messages);
    return rows.map((row) => String(row["Message"] || "").trim()).filter(Boolean);
  }

  // ---- Domain-specific convenience API ----
  return {
    // Recipes
    getRecipes,
    addRecipe,
    updateRecipe,
    deleteRecipe,

    // Shopping list
    getShoppingList,
    addShoppingItem,
    updateShoppingItem,
    deleteCheckedShoppingItems,
    deleteShoppingItem,

    // Tasks / to-do (Planning screen) — unchanged, localStorage-only
    getTasks: () => getAllLocal("tasks"),
    addTask: (task) => addLocal("tasks", task),
    updateTask: (id, patch) => updateLocal("tasks", id, patch),
    deleteCheckedTasks: () => removeWhereLocal("tasks", (t) => !t.active),

    // Reference lists — unchanged, localStorage-only
    getSections: () => getAllLocal("sections"),

    // Daily message
    getPrompts: getMessages
  };
})();
