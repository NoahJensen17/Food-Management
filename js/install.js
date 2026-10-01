// "Install to Home Screen" banner + step-by-step modal (iOS manual guide, Android
// native prompt with manual fallback). Shown on every visit until the app is launched
// from the home screen (standalone). Never shown on desktop.
(function () {
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  // In-app browsers (Gmail, Facebook, Teams, ...) can't add to the home screen. On iOS
  // they're WebViews without the "Safari/" token; plus a few well-known app markers.
  const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Teams|GSA\//i.test(ua) ||
    (isIOS && !/Safari\//.test(ua));

  let deferredPrompt = null;
  let step = 0;
  let steps = [];

  const iosSteps = [
    inAppBrowser
      ? { title: "Open in Safari", icon: "🧭", body: "This looks like an <strong>in-app browser</strong>. Tap its menu (or Share) and choose <strong>Open in Safari</strong>.", note: "Installing only works from Safari on iPhone." }
      : { title: "Open in Safari", icon: "🧭", body: "Make sure you're using <strong>Safari</strong> on iPhone.", note: "Already in Safari? Move to next step." },
    { title: "Tap Share", icon: "⬆️", body: "Tap the <strong>Share button</strong> at the bottom of Safari.", note: "Scroll up if you don't see the toolbar." },
    { title: "Add to Home Screen", icon: "➕", body: "Tap <strong>\"Add to Home Screen\"</strong> in the share menu.", note: "You'll see the app icon preview." },
    { title: "Done!", icon: "✅", body: "Tap <strong>\"Add\"</strong> in the top right.", note: "The icon will appear on your home screen." }
  ];
  let androidSteps = [
    { title: "Open in Chrome", icon: "🌐", body: "Make sure you're using <strong>Google Chrome</strong>.", note: "Already in Chrome? You're set." },
    { title: "Tap Menu", icon: "⋮", body: "Tap the <strong>three-dot menu</strong> in Chrome.", note: "Look for the dots in the upper right." },
    { title: "Add to Home Screen", icon: "➕", body: "Tap <strong>\"Add to Home screen\"</strong>.", note: "Some versions say \"Install app\"." },
    { title: "Confirm", icon: "✅", body: "Tap <strong>\"Add\"</strong> or <strong>\"Install\"</strong>.", note: "Open from home screen for full app experience." }
  ];

  const $ = (id) => document.getElementById(id);

  function showBar() {
    if (!isStandalone) $("install-bar").style.display = "flex";
  }

  function dismiss() {
    $("install-overlay").style.display = "none";
    $("install-bar").style.display = "none";
  }

  function openModal() {
    step = 0;
    steps = isIOS ? iosSteps : androidSteps;
    renderStep();
    $("install-overlay").style.display = "flex";
  }

  function renderStep() {
    const s = steps[step];
    const last = step === steps.length - 1;
    $("install-steps").innerHTML = `
      <div class="install-step">
        <div class="install-step__icon">${s.icon}</div>
        <div class="install-step__title">${s.title}</div>
        <div class="install-step__body">${s.body}</div>
        <div class="install-step__note">${s.note}</div>
        ${s.action && deferredPrompt ? `<button class="install-now" id="install-now">Install Now</button>` : ""}
      </div>
    `;
    const now = $("install-now");
    if (now) now.addEventListener("click", nativeInstall);

    $("step-dots").innerHTML = steps.map((_, i) =>
      `<span class="install-dot ${i === step ? "active" : ""}"></span>`).join("");
    $("install-prev").style.visibility = step > 0 ? "visible" : "hidden";
    const next = $("install-next");
    next.textContent = last ? "Done" : "Next";
    next.classList.toggle("done", last);
  }

  function nav(d) {
    if (d === 1 && step === steps.length - 1) { dismiss(); return; }
    step = Math.max(0, Math.min(steps.length - 1, step + d));
    renderStep();
  }

  function nativeInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((r) => {
      deferredPrompt = null;
      if (r.outcome === "accepted") dismiss();
    });
  }

  // Android/Chrome native install prompt.
  window.addEventListener("beforeinstallprompt", (e) => {
    if (!isIOS && !isAndroid) return; // never on desktop
    e.preventDefault();               // suppress Chrome's own mini-infobar
    deferredPrompt = e;
    androidSteps = [{ title: "Install", icon: "📲", body: "Tap <strong>Install Now</strong> below.", note: "Your browser handles the rest.", action: true }];
    showBar();
  });

  document.addEventListener("DOMContentLoaded", () => {
    $("install-close").addEventListener("click", dismiss);
    $("install-later").addEventListener("click", dismiss);
    $("install-open").addEventListener("click", openModal);
    $("install-prev").addEventListener("click", () => nav(-1));
    $("install-next").addEventListener("click", () => nav(1));
  });

  // iOS never fires beforeinstallprompt, so show the banner on load for any
  // not-yet-installed mobile device. Dismissal isn't persisted: it returns next visit.
  window.addEventListener("load", () => {
    if (!isStandalone && (isIOS || isAndroid)) showBar();
  });
})();
