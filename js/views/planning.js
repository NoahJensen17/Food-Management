window.ViewPlanning = (function () {
  const el = () => document.getElementById("view-planning");
  let mode = "list"; // "list" | "add" | "edit"

  async function render() {
    const tasks = await window.Store.getTasks();

    el().innerHTML = `
      <div class="toolbar">
        ${mode !== "list" ? `<button class="btn btn-secondary" id="btn-view">View List</button>` : ""}
        ${mode === "list" ? `<button class="btn-icon" id="btn-add" title="Add task">${iconPlus()}</button>` : ""}
        ${mode !== "add" ? `<button class="btn-icon" id="btn-edit" title="Edit tasks">${iconEdit()}</button>` : ""}
        <button class="btn-icon danger" id="btn-clear" title="Clear checked tasks">${iconTrash()}</button>
      </div>
      ${mode === "add" ? renderAddForm() : ""}
      ${renderList(tasks)}
    `;

    wireToolbar();
    wireList(tasks);
  }

  function renderAddForm() {
    return `
      <div class="card">
        <div class="card-title">Add Task</div>
        <div class="field">
          <label for="add-task">Task</label>
          <input type="text" id="add-task" placeholder="Ex: Lesson Planning" />
        </div>
        <button class="btn btn-primary btn-full" id="add-submit">Add to List</button>
      </div>
    `;
  }

  function renderList(tasks) {
    const active = tasks.filter((t) => t.active).sort((a, b) => a.task.localeCompare(b.task));
    const done = tasks.filter((t) => !t.active).sort((a, b) => a.task.localeCompare(b.task));

    if (tasks.length === 0) {
      return `<div class="empty-state">No tasks yet.</div>`;
    }

    let html = `<div class="list">${active.map(rowHtml).join("")}</div>`;
    if (done.length) {
      html += `<div class="section-heading">Completed</div><div class="list">${done.map(rowHtml).join("")}</div>`;
    }
    return html;
  }

  function rowHtml(task) {
    const checked = !task.active;
    if (mode === "edit") {
      return `
        <div class="list-row" data-id="${task.id}">
          <input type="text" class="edit-task" value="${task.task}" style="flex:1" />
          <button class="btn-icon" data-action="save-edit" title="Save">${iconCheck()}</button>
        </div>
      `;
    }
    return `
      <div class="list-row ${checked ? "checked" : ""}" data-id="${task.id}">
        <button class="checkbox ${checked ? "checked" : ""}" data-action="toggle"></button>
        <div class="list-row__title">${task.task}</div>
      </div>
    `;
  }

  function wireToolbar() {
    const btnAdd = document.getElementById("btn-add");
    const btnEdit = document.getElementById("btn-edit");
    const btnView = document.getElementById("btn-view");
    const btnClear = document.getElementById("btn-clear");
    const submit = document.getElementById("add-submit");

    if (btnAdd) btnAdd.addEventListener("click", () => { mode = "add"; render(); });
    if (btnEdit) btnEdit.addEventListener("click", () => { mode = "edit"; render(); });
    if (btnView) btnView.addEventListener("click", () => { mode = "list"; render(); });
    if (btnClear) btnClear.addEventListener("click", async () => {
      await window.Store.deleteCheckedTasks();
      render();
    });
    if (submit) submit.addEventListener("click", async () => {
      const text = document.getElementById("add-task").value.trim();
      if (!text) return;
      await window.Store.addTask({ task: text, active: true });
      render();
    });
  }

  function wireList(tasks) {
    el().querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const row = e.target.closest(".list-row");
        const id = row.dataset.id;
        const task = tasks.find((t) => t.id === id);
        await window.Store.updateTask(id, { active: !task.active });
        render();
      });
    });

    el().querySelectorAll('[data-action="save-edit"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const row = e.target.closest(".list-row");
        const id = row.dataset.id;
        await window.Store.updateTask(id, { task: row.querySelector(".edit-task").value.trim() });
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
