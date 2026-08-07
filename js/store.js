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
    units: "data/units.json",
    prompts: "data/prompts.json"
  };

  function readLocal(key) {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  }

  function writeLocal(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  async function fetchSeed(key) {
    const res = await fetch(SEED_FILES[key]);
    if (!res.ok) throw new Error(`Failed to load seed data for ${key}`);
    return res.json();
  }

  async function ensureSeeded(key) {
    let value = readLocal(key);
    if (value === null) {
      const seed = await fetchSeed(key);
      value = key === "prompts" ? seed.messages : seed;
      writeLocal(key, value);
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
    getUnits: () => getAll("units"),

    // Daily message
    getPrompts: () => getAll("prompts")
  };
})();
