// Data layer: seeds from /data/*.json on first run, then persists all changes to localStorage.
// Swapping this out for a Google Sheets-backed API later only requires changing the functions
// in this file — every view calls Store.* and never touches localStorage directly.
window.Store = (function () {
  const PREFIX = "homeApp:";
  const SEED_FILES = {
    recipes: "data/recipes.json",
    shoppingList: "data/shoppingList.json",
    tasks: "data/tasks.json",
    sections: "data/sections.json",
    prompts: "data/prompts.json"
  };
  // Tracks which keys have already been checked for new seed items this page load,
  // so the merge below runs once per key per session rather than on every Store call.
  const mergedThisSession = new Set();

  function readLocal(key) {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  }

  function writeLocal(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  function readSeededIds(key) {
    const raw = localStorage.getItem(PREFIX + key + ":seededIds");
    return raw ? new Set(JSON.parse(raw)) : null;
  }

  function writeSeededIds(key, idSet) {
    localStorage.setItem(PREFIX + key + ":seededIds", JSON.stringify([...idSet]));
  }

  async function fetchSeed(key) {
    const res = await fetch(SEED_FILES[key]);
    if (!res.ok) throw new Error(`Failed to load seed data for ${key}`);
    return res.json();
  }

  function isIdCollection(arr) {
    return Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null && "id" in arr[0];
  }

  // Folds newly-added entries from the seed JSON into what's already stored locally,
  // keyed by id, so editing a seed file shows up on next reload without wiping any
  // edits/checks/deletions the user already made. A per-key "seededIds" tombstone set
  // remembers every id ever seen so a deleted seed item is never silently re-added.
  async function mergeNewSeedItems(key, localValue) {
    const seed = await fetchSeed(key);
    const seedValue = key === "prompts" ? seed.messages : seed;

    if (isIdCollection(seedValue)) {
      const seededIds = readSeededIds(key) || new Set(localValue.map((i) => i.id));
      const newItems = seedValue.filter((i) => i.id && !seededIds.has(i.id));
      if (newItems.length) {
        localValue = [...localValue, ...newItems];
        writeLocal(key, localValue);
      }
      seedValue.forEach((i) => seededIds.add(i.id));
      writeSeededIds(key, seededIds);
    } else if (Array.isArray(seedValue)) {
      const additions = seedValue.filter((v) => !localValue.includes(v));
      if (additions.length) {
        localValue = [...localValue, ...additions];
        writeLocal(key, localValue);
      }
    }
    return localValue;
  }

  async function ensureSeeded(key) {
    let value = readLocal(key);
    if (value === null) {
      const seed = await fetchSeed(key);
      value = key === "prompts" ? seed.messages : seed;
      writeLocal(key, value);
      if (isIdCollection(value)) writeSeededIds(key, new Set(value.map((i) => i.id)));
      mergedThisSession.add(key);
      return value;
    }
    if (!mergedThisSession.has(key)) {
      mergedThisSession.add(key);
      value = await mergeNewSeedItems(key, value);
    }
    return value;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- Generic collection helpers ----
  async function getAll(key) {
    return ensureSeeded(key);
  }

  async function add(key, record) {
    const items = await ensureSeeded(key);
    const withId = { id: uid(), ...record };
    items.push(withId);
    writeLocal(key, items);
    return withId;
  }

  async function update(key, id, patch) {
    const items = await ensureSeeded(key);
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch };
    writeLocal(key, items);
    return items[idx];
  }

  async function remove(key, id) {
    const items = await ensureSeeded(key);
    const next = items.filter((i) => i.id !== id);
    writeLocal(key, next);
    return next;
  }

  async function removeWhere(key, predicate) {
    const items = await ensureSeeded(key);
    const next = items.filter((i) => !predicate(i));
    writeLocal(key, next);
    return next;
  }

  // ---- Domain-specific convenience API ----
  return {
    // Recipes (each recipe embeds its own ingredients + instructions arrays)
    getRecipes: () => getAll("recipes"),
    addRecipe: (recipe) => add("recipes", recipe),
    updateRecipe: (id, patch) => update("recipes", id, patch),
    deleteRecipe: (id) => remove("recipes", id),

    // Shopping list
    getShoppingList: () => getAll("shoppingList"),
    addShoppingItem: (item) => add("shoppingList", item),
    updateShoppingItem: (id, patch) => update("shoppingList", id, patch),
    deleteCheckedShoppingItems: () => removeWhere("shoppingList", (i) => !i.active),

    // Tasks / to-do (Planning screen)
    getTasks: () => getAll("tasks"),
    addTask: (task) => add("tasks", task),
    updateTask: (id, patch) => update("tasks", id, patch),
    deleteCheckedTasks: () => removeWhere("tasks", (t) => !t.active),

    // Reference lists
    getSections: () => getAll("sections"),

    // Daily message
    getPrompts: () => getAll("prompts")
  };
})();
