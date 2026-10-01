window.ViewShopping = (function () {
  const el = () => document.getElementById("view-shopping");
  let mode = "list"; // "list" | "add" | "edit"

  async function render() {
    const [items, sections] = await Promise.all([
      window.Store.getShoppingList(),
      window.Store.getSections()
    ]);

    el().innerHTML = `
      <div class="toolbar">
        ${mode !== "list" ? `<button class="btn btn-secondary" id="btn-view">View List</button>` : ""}
        ${mode === "list" ? `<button class="btn-icon" id="btn-add" title="Add item">${iconPlus()}</button>` : ""}
        ${mode !== "add" ? `<button class="btn-icon" id="btn-edit" title="Edit items">${iconEdit()}</button>` : ""}
        <button class="btn-icon danger" id="btn-clear" title="Clear checked items">${iconTrash()}</button>
      </div>
      ${mode === "add" ? renderAddForm(sections) : ""}
      ${renderList(items)}
    `;

    wireToolbar(sections);
    wireList();
  }

  function renderAddForm(sections) {
    return `
      <div class="card">
        <div class="card-title">Add Item</div>
        <div class="field field--item">
          <label for="add-item">Item</label>
          <input type="text" id="add-item" placeholder="Ex: Beans" />
        </div>
        <div class="inline-fields">
          <div class="field field--qty">
            <label for="add-qty">Qty</label>
            <input type="number" id="add-qty" value="1" min="1" />
          </div>
          <div class="field field--grow">
            <label for="add-section">Store Section</label>
            <select id="add-section">
              ${sections.map((s) => `<option value="${s}">${s}</option>`).join("")}
            </select>
          </div>
        </div>
        <button class="btn btn-primary btn-full" id="add-submit">Add to List</button>
      </div>
    `;
  }

  function renderList(items) {
    const active = items.filter((i) => i.active).sort(sorter);
    const checked = items.filter((i) => !i.active).sort(sorter);

    if (items.length === 0) {
      return `<div class="empty-state">Your shopping list is empty.</div>`;
    }

    let html = "";
    if (active.length) {
      html += `<div class="section-heading">Items to Purchase</div><div class="list">${active.map((i) => rowHtml(i)).join("")}</div>`;
    }
    if (checked.length) {
      html += `<div class="section-heading">Added to Cart</div><div class="list">${checked.map((i) => rowHtml(i)).join("")}</div>`;
    }
    return html;
  }

  function sorter(a, b) {
    return a.section.localeCompare(b.section) || a.item.localeCompare(b.item);
  }

  function rowHtml(item) {
    const checked = !item.active;
    if (mode === "edit") {
      return `
        <div class="list-row" data-item="${escapeAttr(item.item)}">
          <input type="number" class="edit-qty" value="${item.quantity}" style="width:60px" />
          <input type="text" class="edit-item" value="${escapeAttr(item.item)}" style="flex:1" />
          <button class="btn-icon" data-action="save-edit" title="Save">${iconCheck()}</button>
        </div>
      `;
    }
    return `
      <div class="list-row ${checked ? "checked" : ""}" data-item="${escapeAttr(item.item)}">
        <button class="checkbox ${checked ? "checked" : ""}" data-action="toggle"></button>
        <div>
          <div class="list-row__title">${item.quantity} ${escapeHtml(item.item)}</div>
          <div class="list-row__meta">${escapeHtml(item.section)}</div>
        </div>
      </div>
    `;
  }

  function wireToolbar(sections) {
    const btnAdd = document.getElementById("btn-add");
    const btnEdit = document.getElementById("btn-edit");
    const btnView = document.getElementById("btn-view");
    const btnClear = document.getElementById("btn-clear");
    const submit = document.getElementById("add-submit");

    if (btnAdd) btnAdd.addEventListener("click", () => { mode = "add"; render(); });
    if (btnEdit) btnEdit.addEventListener("click", () => { mode = "edit"; render(); });
    if (btnView) btnView.addEventListener("click", () => { mode = "list"; render(); });
    if (btnClear) btnClear.addEventListener("click", () => {
      background(window.Store.deleteCheckedShoppingItems());
      render();
    });
    if (submit) submit.addEventListener("click", () => {
      const itemText = document.getElementById("add-item").value.trim();
      if (!itemText) return;
      background(window.Store.addShoppingItem({
        item: itemText,
        quantity: Number(document.getElementById("add-qty").value) || 1,
        section: document.getElementById("add-section").value,
        active: true
      }));
      render();
    });
  }

  // Store writes are optimistic (the UI has already updated), so nothing waits on them.
  // If one fails, tell the user and redraw from the real data.
  function background(promise) {
    promise.catch((err) => {
      alert(err.message || "Couldn't save that change. Please try again.");
      render();
    });
  }

  function wireList() {
    el().querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const row = e.target.closest(".list-row");
        const itemName = row.dataset.item;
        // Read the current state from the DOM so rapid re-clicks flip correctly even
        // before the delayed re-render below has run.
        const nextActive = row.classList.contains("checked");

        // Show the toggle instantly so the click registers before the list reshuffles
        // (rows moving to/from "Checked Off" shifts everything below them into place).
        btn.classList.toggle("checked", !nextActive);
        row.classList.toggle("checked", !nextActive);

        background(window.Store.updateShoppingItem(itemName, { active: nextActive }));
        setTimeout(render, 250);
      });
    });

    el().querySelectorAll('[data-action="save-edit"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const row = e.target.closest(".list-row");
        const itemName = row.dataset.item;
        const newName = row.querySelector(".edit-item").value.trim();
        if (!newName) return;
        background(window.Store.updateShoppingItem(itemName, {
          item: newName,
          quantity: Number(row.querySelector(".edit-qty").value) || 1
        }));
        render();
      });
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  function iconPlus() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`; }
  function iconEdit() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`; }
  function iconTrash() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`; }
  function iconCheck() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>`; }

  return { render };
})();
