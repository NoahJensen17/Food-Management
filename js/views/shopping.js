window.ViewShopping = (function () {
  const el = () => document.getElementById("view-shopping");
  const overlay = () => document.getElementById("app-overlay");
  const panel = () => document.getElementById("app-overlay-panel");

  async function render() {
    const [items, sections] = await Promise.all([
      window.Store.getShoppingList(),
      window.Store.getSections()
    ]);

    el().innerHTML = `
      <div class="toolbar">
        <button class="btn-icon" id="btn-add" title="Add item">${iconPlus()}</button>
        <button class="btn-icon danger" id="btn-clear" title="Clear checked items">${iconTrash()}</button>
      </div>
      ${renderList(items)}
    `;

    document.getElementById("btn-add").addEventListener("click", () => openEditor(null, sections));
    document.getElementById("btn-clear").addEventListener("click", () => {
      background(window.Store.deleteCheckedShoppingItems());
      render();
    });

    wireList(items, sections);
  }

  function renderList(items) {
    const active = items.filter((i) => i.active).sort(sorter);
    const checked = items.filter((i) => !i.active).sort(sorter);

    if (items.length === 0) {
      return `<div class="empty-state">Your shopping list is empty. Tap + to add something.</div>`;
    }

    let html = "";
    if (active.length) {
      html += `<div class="section-heading">Items to Purchase</div><div class="list">${active.map(rowHtml).join("")}</div>`;
    }
    if (checked.length) {
      html += `<div class="section-heading">Added to Cart</div><div class="list">${checked.map(rowHtml).join("")}</div>`;
    }
    return html;
  }

  function sorter(a, b) {
    return a.section.localeCompare(b.section) || a.item.localeCompare(b.item);
  }

  function rowHtml(item) {
    const checked = !item.active;
    return `
      <div class="list-row ${checked ? "checked" : ""}" data-item="${escapeAttr(item.item)}">
        <button class="checkbox ${checked ? "checked" : ""}" data-action="toggle" title="Mark ${checked ? "to buy" : "in cart"}" aria-label="Mark ${checked ? "to buy" : "in cart"}"></button>
        <div class="list-row__body" data-action="edit">
          <div class="list-row__title">${item.quantity} ${escapeHtml(item.item)}</div>
          <div class="list-row__meta">${escapeHtml(item.section)}</div>
        </div>
      </div>
    `;
  }

  // Store writes are optimistic (the UI has already updated), so nothing waits on them.
  // If one fails, tell the user and redraw from the real data.
  function background(promise) {
    promise.catch((err) => {
      alert(err.message || "Couldn't save that change. Please try again.");
      render();
    });
  }

  function wireList(items, sections) {
    el().querySelectorAll(".list-row").forEach((row) => {
      const itemName = row.dataset.item;
      const item = items.find((i) => i.item === itemName);

      // Tapping the checkbox toggles active/checked without opening the editor.
      row.querySelector('[data-action="toggle"]').addEventListener("click", (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const nextActive = row.classList.contains("checked");

        // Show the toggle instantly so the click registers before the list reshuffles
        // (rows moving to/from "Added to Cart" shifts everything below them into place).
        btn.classList.toggle("checked", !nextActive);
        row.classList.toggle("checked", !nextActive);

        background(window.Store.updateShoppingItem(itemName, { active: nextActive }));
        setTimeout(render, 250);
      });

      // Tapping anywhere else on the row opens it for editing — the same overlay
      // used to add new items, pre-filled with this item's details.
      row.querySelector('[data-action="edit"]').addEventListener("click", () => openEditor(item, sections));
    });
  }

  // ---- Add/Edit overlay (shared with recipes.js's #app-overlay) ----
  function openEditor(item, sections) {
    const isNew = !item;
    const originalName = item ? item.item : null;
    const draft = item
      ? { item: item.item, quantity: item.quantity, section: item.section }
      : { item: "", quantity: 1, section: sections[0] || "" };

    panel().innerHTML = `
      <div class="overlay-header">
        <div class="overlay-title">${isNew ? "Add Item" : "Edit Item"}</div>
        <button class="btn-icon" id="btn-close">${iconCancel()}</button>
      </div>

      <div class="field field--item">
        <label for="f-item">Item</label>
        <input type="text" id="f-item" placeholder="Ex: Beans" value="${escapeAttr(draft.item)}" />
      </div>
      <div class="inline-fields">
        <div class="field field--qty">
          <label for="f-qty">Qty</label>
          <input type="number" id="f-qty" value="${draft.quantity}" min="1" />
        </div>
        <div class="field field--grow">
          <label for="f-section">Store Section</label>
          <select id="f-section">
            ${sections.map((s) => `<option value="${escapeAttr(s)}" ${s === draft.section ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
          </select>
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-save">${isNew ? "Add to List" : "Save Changes"}</button>
      ${isNew ? "" : `<button class="btn btn-secondary btn-full" id="btn-delete">Remove from List</button>`}
    `;

    document.getElementById("btn-close").addEventListener("click", closeEditor);

    document.getElementById("btn-save").addEventListener("click", async () => {
      const itemText = document.getElementById("f-item").value.trim();
      if (!itemText) return;
      const quantity = Number(document.getElementById("f-qty").value) || 1;
      const section = document.getElementById("f-section").value;

      const saveBtn = document.getElementById("btn-save");
      saveBtn.disabled = true;
      saveBtn.classList.add("is-loading");
      saveBtn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>Saving…`;
      try {
        if (isNew) {
          await window.Store.addShoppingItem({ item: itemText, quantity, section, active: true });
        } else {
          await window.Store.updateShoppingItem(originalName, { item: itemText, quantity, section });
        }
        closeEditor();
        render();
      } catch (err) {
        alert(err.message || "Couldn't save that item. Please try again.");
        saveBtn.disabled = false;
        saveBtn.classList.remove("is-loading");
        saveBtn.textContent = isNew ? "Add to List" : "Save Changes";
      }
    });

    const deleteBtn = document.getElementById("btn-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!confirm(`Remove "${originalName}" from your shopping list?`)) return;
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = `<span class="btn-spinner btn-spinner--dark" aria-hidden="true"></span>`;
        try {
          await window.Store.deleteShoppingItem(originalName);
          closeEditor();
          render();
        } catch (err) {
          alert(err.message || "Couldn't remove that item. Please try again.");
          deleteBtn.disabled = false;
          deleteBtn.textContent = "Remove from List";
        }
      });
    }

    overlay().classList.add("active");
    document.getElementById("f-item").focus();
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

  return { render };
})();
