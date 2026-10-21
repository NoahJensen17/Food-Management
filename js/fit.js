// Fits the app to the phone it's opened on. The UI is laid out against a reference
// design size (DESIGN_W x DESIGN_H CSS px); on a phone smaller than that, the whole
// frame is zoomed down proportionally (via --ui-scale, consumed by .phone-frame in
// css/styles.css) so every screen keeps the layout it was designed with instead of
// overflowing sideways or getting cut off. Phones that are as big or bigger than the
// reference keep scale 1 and simply stretch (the layouts are already fluid).
(function () {
  const DESIGN_W = 420;
  const DESIGN_H = 735;
  const MIN_SCALE = 0.7; // never shrink text/controls past the point of being readable

  function update() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const raw = Math.min(1, w / DESIGN_W, h / DESIGN_H);
    const scale = Math.max(MIN_SCALE, Math.round(raw * 100) / 100);
    document.documentElement.style.setProperty("--ui-scale", String(scale));
  }

  update();
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
})();
