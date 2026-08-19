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
    wireList(items);
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

    let html = `<div class="list">${active.map((i) => rowHtml(i)).join("")}</div>`;
    if (checked.length) {
      html += `<div class="section-heading">Checked Off</div><div class="list">${checked.map((i) => rowHtml(i)).join("")}</div>`;
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
        <div class="list-row" data-id="${item.id}">
          <input type="number" class="edit-qty" value="${item.quantity}" style="width:60px" />
          <input type="text" class="edit-item" value="${item.item}" style="flex:1" />
          <button class="btn-icon" data-action="save-edit" title="Save">${iconCheck()}</button>
        </div>
      `;
    }
    return `
      <div class="list-row ${checked ? "checked" : ""}" data-id="${item.id}">
        <button class="checkbox ${checked ? "checked" : ""}" data-action="toggle"></button>
        <div>
          <div class="list-row__title">${item.quantity} ${item.item}</div>
          <div class="list-row__meta">${item.section}</div>
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
    if (btnClear) btnClear.addEventListener("click", async () => {
      await window.Store.deleteCheckedShoppingItems();
      render();
    });
    if (submit) submit.addEventListener("click", async () => {
      const itemText = document.getElementById("add-item").value.trim();
      if (!itemText) return;
      await window.Store.addShoppingItem({
        item: itemText,
        quantity: Number(document.getElementById("add-qty").value) || 1,
        section: document.getElementById("add-section").value,
        active: true
      });
      render();
    });
  }

  function wireList(items) {
    el().querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const row = e.target.closest(".list-row");
        const id = row.dataset.id;
        const item = items.find((i) => i.id === id);
        const nextActive = !item.active;

        // Show the toggle instantly so the click registers before the list reshuffles
        // (rows moving to/from "Checked Off" shifts everything below them into place).
        btn.classList.toggle("checked", !nextActive);
        row.classList.toggle("checked", !nextActive);
        btn.disabled = true;

        await window.Store.updateShoppingItem(id, { active: nextActive });
        setTimeout(render, 400);
      });
    });

    el().querySelectorAll('[data-action="save-edit"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const row = e.target.closest(".list-row");
        const id = row.dataset.id;
        await window.Store.updateShoppingItem(id, {
          item: row.querySelector(".edit-item").value.trim(),
          quantity: Number(row.querySelector(".edit-qty").value) || 1
        });
        render();
      });
    });
  }

  function iconPlus() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`; }
  function iconEdit() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`; }
  function iconTrash() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`; }
  function iconCheck() { return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>`; }

  return { render };
})();
