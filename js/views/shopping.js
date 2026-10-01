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
      if (!confirm("Remove all items added to cart?")) return;
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

  // Unchecked ("Items to Purchase") rows only ever show the right-swipe hint (move to
  // cart) — swiping left does nothing, so no left hint exists for them at all. Checked
  // ("Added to Cart") rows show either hint depending on drag direction: left moves
  // back to the purchase list, right deletes that single item.
  function rowHtml(item) {
    const checked = !item.active;
    return `
      <div class="swipe-row" data-item="${escapeAttr(item.item)}">
        ${checked
          ? `<div class="swipe-hint swipe-hint--move-left" data-hint="left">${iconUndo()} Move back</div>
             <div class="swipe-hint swipe-hint--delete" data-hint="right">${iconTrash()} Delete</div>`
          : `<div class="swipe-hint swipe-hint--move-right" data-hint="right">${iconCheck()} In cart</div>`}
        <div class="list-row ${checked ? "checked" : ""}">
          <button class="checkbox ${checked ? "checked" : ""}" data-action="toggle" title="Mark ${checked ? "to buy" : "in cart"}" aria-label="Mark ${checked ? "to buy" : "in cart"}"></button>
          <div class="list-row__body" data-action="edit">
            <div class="list-row__title">${item.quantity} ${escapeHtml(item.item)}</div>
            <div class="list-row__meta">${escapeHtml(item.section)}</div>
          </div>
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
    el().querySelectorAll(".swipe-row").forEach((swipeRow) => {
      const itemName = swipeRow.dataset.item;
      const item = items.find((i) => i.item === itemName);
      const row = swipeRow.querySelector(".list-row");
      const checked = row.classList.contains("checked");

      // Tapping the checkbox toggles active/checked without opening the editor.
      row.querySelector('[data-action="toggle"]').addEventListener("click", (e) => {
        e.stopPropagation();
        toggleActive(itemName, row, e.currentTarget);
      });

      // Tapping the rest of an unchecked row opens it for editing (same overlay used
      // to add items, pre-filled). A checked ("Added to Cart") item is assumed
      // already purchased, so tapping it does nothing — swipe or the checkbox are
      // the only ways to act on it.
      if (!checked) {
        row.querySelector('[data-action="edit"]').addEventListener("click", () => openEditor(item, sections));
      }

      wireSwipe(swipeRow, row, itemName, checked);
    });
  }

  function toggleActive(itemName, row, btn) {
    const nextActive = row.classList.contains("checked");
    // Show the toggle instantly so the click/swipe registers before the list
    // reshuffles (rows moving to/from "Added to Cart" shifts everything below them
    // into place).
    btn.classList.toggle("checked", !nextActive);
    row.classList.toggle("checked", !nextActive);
    background(window.Store.updateShoppingItem(itemName, { active: nextActive }));
    setTimeout(render, 250);
  }

  // Swipe gestures mirror the checkbox/delete actions:
  //  - Unchecked row, swipe right far enough -> same as checking it off. Swiping left
  //    is disabled outright (the row doesn't move at all) since there's no action for it.
  //  - Checked row, swipe left far enough -> same as unchecking it. Swipe right far
  //    enough -> deletes that single item immediately, no confirmation.
  const SWIPE_THRESHOLD = 72; // px of horizontal drag before an action commits

  function wireSwipe(swipeRow, row, itemName, checked) {
    const checkbox = row.querySelector('[data-action="toggle"]');
    const hintLeft = swipeRow.querySelector('[data-hint="left"]');
    const hintRight = swipeRow.querySelector('[data-hint="right"]');

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let decided = null; // "horizontal" | "vertical" | null, once the gesture's direction is clear

    // pointermove/up are bound to the document only while a drag is in progress
    // (rather than relying on setPointerCapture, which drops subsequent move events
    // for a row that was already dragged once in some browsers) so the gesture keeps
    // tracking even if the pointer strays off the row during a fast swipe.
    function onMove(e) {
      const rawDx = e.clientX - startX;
      const rawDy = e.clientY - startY;

      // Prevent the browser's own touch handling (e.g. scroll) from taking over and
      // cancelling this pointer sequence (a pointercancel) while direction is still
      // ambiguous — must happen on every move during an active drag, not just once
      // horizontal intent is confirmed below.
      e.preventDefault();

      if (!decided) {
        if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return;
        decided = Math.abs(rawDx) > Math.abs(rawDy) ? "horizontal" : "vertical";
        if (decided === "horizontal") swipeRow.classList.add("dragging");
      }
      if (decided !== "horizontal") return;

      // Unchecked rows never move leftward — there's no left action for them, so the
      // tile should visually stay put rather than hint at something draggable.
      dx = checked ? rawDx : Math.max(0, rawDx);

      row.style.transform = `translateX(${dx}px)`;
      hintLeft && hintLeft.classList.toggle("visible", dx < -20);
      hintRight && hintRight.classList.toggle("visible", dx > 20);
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      swipeRow.classList.remove("dragging");

      const committed = Math.abs(dx) >= SWIPE_THRESHOLD;
      row.style.transform = "";
      hintLeft && hintLeft.classList.remove("visible");
      hintRight && hintRight.classList.remove("visible");

      if (!committed) { dx = 0; return; }

      if (!checked && dx > 0) {
        toggleActive(itemName, row, checkbox);
      } else if (checked && dx < 0) {
        toggleActive(itemName, row, checkbox);
      } else if (checked && dx > 0) {
        swipeRow.style.opacity = "0";
        background(window.Store.deleteShoppingItem(itemName));
        setTimeout(render, 200);
      }
      dx = 0;
    }

    row.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      decided = null;
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
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
  function iconCheck() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>`; }
  function iconUndo() { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`; }

  return { render };
})();
