window.ViewRecipes = (function () {
  const el = () => document.getElementById("view-recipes");
  const overlay = () => document.getElementById("recipe-overlay");
  const panel = () => document.getElementById("recipe-overlay-panel");
  let deleteMode = false;

  async function render() {
    const recipes = await window.Store.getRecipes();
    const sorted = [...recipes].sort((a, b) => a.recipe.localeCompare(b.recipe));

    el().innerHTML = `
      <div class="toolbar">
        <button class="btn-icon" id="btn-new" title="Add recipe">${iconPlus()}</button>
        <button class="btn-icon danger" id="btn-delete-mode" title="${deleteMode ? "Done deleting" : "Delete recipes"}">
          ${deleteMode ? iconCancel() : iconTrash()}
        </button>
      </div>
      ${sorted.length === 0 ? `<div class="empty-state">No recipes yet. Add your first one!</div>` : `<div class="recipe-grid">${sorted.map(cardHtml).join("")}</div>`}
    `;

    document.getElementById("btn-new").addEventListener("click", () => openEditor(null));
    document.getElementById("btn-delete-mode").addEventListener("click", () => { deleteMode = !deleteMode; render(); });

    el().querySelectorAll(".recipe-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        if (deleteMode) {
          deleteRecipe(id);
        } else {
          openEditor(recipes.find((r) => r.id === id));
        }
      });
    });
  }

  function cardHtml(r) {
    return `
      <div class="recipe-card" data-id="${r.id}">
        <div class="recipe-card__top">
          <div>
            <div class="recipe-card__name">${r.recipe}</div>
            <div class="recipe-card__meal">${r.mealTime || ""}</div>
          </div>
          <div class="star">${r.favorite ? "★" : ""}</div>
        </div>
      </div>
    `;
  }

  async function deleteRecipe(id) {
    await window.Store.deleteRecipe(id);
    render();
  }

  // ---- Add/Edit overlay ----
  function openEditor(recipe) {
    const isNew = !recipe;
    const draft = recipe
      ? JSON.parse(JSON.stringify(recipe))
      : { recipe: "", mealTime: "", favorite: false, ingredients: [], instructions: [] };

    function paint() {
      panel().innerHTML = `
        <div class="overlay-header">
          <div class="overlay-title">${isNew ? "New Recipe" : "Edit Recipe"}</div>
          <button class="btn-icon" id="btn-close">${iconCancel()}</button>
        </div>

        <div class="field">
          <label>Recipe Name</label>
          <input type="text" id="f-name" value="${escapeAttr(draft.recipe)}" />
        </div>

        <div class="field">
          <label>Meal Time</label>
          <input type="text" id="f-mealtime" value="${escapeAttr(draft.mealTime)}" placeholder="Ex: Dinner" />
        </div>

        <div class="field">
          <label>Ingredients</label>
          <div id="ingredient-list">
            ${draft.ingredients.map((ing, i) => `
              <div class="ingredient-row" data-i="${i}">
                <input type="number" class="ing-qty" value="${ing.qty}" min="0" />
                <input type="text" class="ing-text" value="${escapeAttr(ing.text)}" style="flex:1" />
                <button class="btn-icon" data-action="send-cart" data-i="${i}" title="Send to shopping list">${iconCart()}</button>
                <button class="btn-icon danger" data-action="remove-ing" data-i="${i}" title="Remove">${iconCancel()}</button>
              </div>
            `).join("")}
          </div>
          <div class="ingredient-row">
            <input type="number" id="new-ing-qty" min="0" />
            <input type="text" id="new-ing-text" style="flex:1" placeholder="Ingredient" />
            <button class="btn-icon" id="btn-add-ing" title="Add ingredient">${iconPlus()}</button>
          </div>
        </div>

        <div class="field">
          <label>Instructions</label>
          <div id="instruction-list">
            ${draft.instructions.map((step, i) => `
              <div class="instruction-row" data-i="${i}">
                <div class="instruction-row__num">${i + 1}.</div>
                <div class="instruction-row__text">${escapeHtml(step)}</div>
                <button class="btn-icon danger" data-action="remove-step" data-i="${i}" title="Remove">${iconCancel()}</button>
              </div>
            `).join("")}
          </div>
          <div class="ingredient-row">
            <input type="text" id="new-step-text" style="flex:1" placeholder="Next step" />
            <button class="btn-icon" id="btn-add-step" title="Add step">${iconPlus()}</button>
          </div>
        </div>

        <div class="field">
          <label>
            <input type="checkbox" id="f-favorite" ${draft.favorite ? "checked" : ""} style="width:auto;margin-right:6px" />
            Favorite
          </label>
        </div>

        <button class="btn btn-primary btn-full" id="btn-save">Save Recipe</button>
      `;

      document.getElementById("btn-close").addEventListener("click", closeEditor);

      function syncDraftFromInputs() {
        draft.recipe = document.getElementById("f-name").value;
        draft.mealTime = document.getElementById("f-mealtime").value;
        panel().querySelectorAll(".ingredient-row[data-i]").forEach((row) => {
          const i = Number(row.dataset.i);
          draft.ingredients[i] = {
            qty: Number(row.querySelector(".ing-qty").value) || 0,
            text: row.querySelector(".ing-text").value
          };
        });
      }

      document.getElementById("btn-add-ing").addEventListener("click", () => {
        syncDraftFromInputs();
        const qty = Number(document.getElementById("new-ing-qty").value) || 0;
        const text = document.getElementById("new-ing-text").value.trim();
        if (!text) return;
        draft.ingredients.push({ qty, text });
        paint();
      });

      document.getElementById("btn-add-step").addEventListener("click", () => {
        syncDraftFromInputs();
        const text = document.getElementById("new-step-text").value.trim();
        if (!text) return;
        draft.instructions.push(text);
        paint();
      });

      panel().querySelectorAll('[data-action="remove-ing"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          syncDraftFromInputs();
          draft.ingredients.splice(Number(btn.dataset.i), 1);
          paint();
        });
      });

      panel().querySelectorAll('[data-action="remove-step"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          syncDraftFromInputs();
          draft.instructions.splice(Number(btn.dataset.i), 1);
          paint();
        });
      });

      panel().querySelectorAll('[data-action="send-cart"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
          const ing = draft.ingredients[Number(btn.dataset.i)];
          await window.Store.addShoppingItem({
            item: ing.text,
            quantity: ing.qty || 1,
            unit: "Cnt",
            section: "Misc",
            active: true
          });
          btn.disabled = true;
          btn.innerHTML = iconCheck();
        });
      });

      document.getElementById("f-favorite").addEventListener("change", (e) => {
        draft.favorite = e.target.checked;
      });

      document.getElementById("btn-save").addEventListener("click", async () => {
        syncDraftFromInputs();
        draft.recipe = draft.recipe.trim();
        draft.mealTime = draft.mealTime.trim();
        if (!draft.recipe) return;

        if (isNew) {
          await window.Store.addRecipe(draft);
        } else {
          await window.Store.updateRecipe(draft.id, draft);
        }
        closeEditor();
        render();
      });
    }

    paint();
    overlay().classList.add("active");
  }

  function closeEditor() {
    overlay().classList.remove("active");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  function iconPlus() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`; }
  function iconTrash() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`; }
  function iconCancel() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`; }
  function iconCart() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>`; }
  function iconCheck() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>`; }

  return { render };
})();
