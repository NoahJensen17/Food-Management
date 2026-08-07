// Simple hash-based router wiring the bottom nav to each view module.
(function () {
  const VIEWS = {
    home: { title: "Home", render: () => window.ViewHome.render() },
    recipes: { title: "Recipes", render: () => window.ViewRecipes.render() },
    shopping: { title: "Shopping List", render: () => window.ViewShopping.render() },
    planning: { title: "To-Do List", render: () => window.ViewPlanning.render() }
  };

  function setActiveNav(name) {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
  }

  function showView(name) {
    if (!VIEWS[name]) name = "home";
    document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
    document.getElementById(`view-${name}`).classList.add("active");
    document.getElementById("header-title").textContent = VIEWS[name].title;
    setActiveNav(name);
    VIEWS[name].render();
    window.location.hash = name;
  }

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  window.addEventListener("hashchange", () => {
    showView(window.location.hash.replace("#", ""));
  });

  const initial = window.location.hash.replace("#", "") || "home";
  showView(initial);
})();
