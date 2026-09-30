// A small, self-contained "virtual pet" widget for the Home screen: a calico cat that
// wanders a room, sits, sleeps, and reacts to being tapped. Pure CSS/SVG + JS state
// machine — no external assets or libraries. Purely decorative; touches no Store data.
window.CatWidget = (function () {
  const ROOM_PADDING = 16; // keeps the cat's sprite fully inside the room card while walking
  const SPRITE_SIZE = 92; // px, width/height of the cat sprite's bounding box

  let root = null;
  let spriteEl = null;
  let state = "sitting"; // "walking" | "sitting" | "lying-down" | "sleeping" | "startled" | "waking"
  let facingRight = true;
  let pos = { x: 50, y: 50 }; // percentage within the room
  let timers = [];

  function clearTimers() {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
  }

  function after(ms, fn) {
    const t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  }

  function randBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function roomSize() {
    const rect = root.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function setState(next) {
    state = next;
    spriteEl.dataset.state = state;
  }

  function positionSprite() {
    spriteEl.style.left = pos.x + "%";
    spriteEl.style.top = pos.y + "%";
    spriteEl.style.transform = `translate(-50%, -50%) scaleX(${facingRight ? 1 : -1})`;
  }

  // Converts a target percentage position into a CSS transition duration proportional
  // to distance, so the cat "walks" at a roughly constant speed instead of a fixed time.
  function walkTo(targetX, targetY) {
    const { width, height } = roomSize();
    const dx = ((targetX - pos.x) / 100) * width;
    const dy = ((targetY - pos.y) / 100) * height;
    const distance = Math.hypot(dx, dy);
    const speed = 28; // px per second
    const duration = Math.max(0.6, distance / speed);

    facingRight = targetX >= pos.x;
    setState("walking");
    spriteEl.style.transitionDuration = duration + "s";
    pos = { x: targetX, y: targetY };
    positionSprite();

    after(duration * 1000, onArrive);
  }

  function onArrive() {
    const roll = Math.random();
    if (roll < 0.45) {
      scheduleNextWalk(randBetween(400, 1500));
    } else if (roll < 0.75) {
      setState("sitting");
      after(randBetween(2500, 5000), () => scheduleNextWalk(200));
    } else {
      lieDownThenSleep();
    }
  }

  function lieDownThenSleep() {
    setState("lying-down");
    after(1800, () => {
      setState("sleeping");
      after(randBetween(6000, 12000), () => {
        if (state === "sleeping") wakeUpThenWalk();
      });
    });
  }

  function wakeUpThenWalk() {
    setState("waking");
    after(900, () => scheduleNextWalk(200));
  }

  function scheduleNextWalk(delay) {
    after(delay, () => {
      spriteEl.style.transitionDuration = "0s";
      const targetX = randBetween(ROOM_PADDING, 100 - ROOM_PADDING);
      const targetY = randBetween(ROOM_PADDING, 100 - ROOM_PADDING);
      walkTo(targetX, targetY);
    });
  }

  function onTap() {
    if (state === "sleeping" || state === "lying-down") {
      clearTimers();
      wakeUpThenWalk();
      return;
    }
    if (state === "startled") return;

    const prevState = state;
    clearTimers();
    setState("startled");
    after(1100, () => {
      if (prevState === "sitting") {
        setState("sitting");
        after(randBetween(1500, 3000), () => scheduleNextWalk(200));
      } else {
        scheduleNextWalk(200);
      }
    });
  }

  function catSvg() {
    // A round, chubby calico cat: cream base with bold orange + black patches, big head
    // relative to body for a "chunky" look. Built from basic shapes so poses are driven
    // entirely by CSS (rotation/scale per data-state) rather than swapped artwork.
    return `
      <svg class="cat-sprite__svg" viewBox="0 0 120 110" width="${SPRITE_SIZE}" height="${SPRITE_SIZE * 110 / 120}">
        <g class="cat-tail">
          <path d="M28 78 Q6 70 10 44 Q12 34 20 30" fill="none" stroke="#e8792c" stroke-width="12" stroke-linecap="round"/>
        </g>
        <g class="cat-legs">
          <ellipse cx="42" cy="94" rx="8" ry="9" fill="#faf6ee"/>
          <ellipse cx="78" cy="94" rx="8" ry="9" fill="#faf6ee"/>
        </g>

        <!-- Chubby round body -->
        <ellipse class="cat-body" cx="60" cy="76" rx="34" ry="26" fill="#faf6ee"/>
        <path class="cat-body-patch" d="M32 68 Q46 58 58 68 Q54 82 36 84 Q26 78 32 68Z" fill="#2b2320"/>
        <path class="cat-body-patch cat-body-patch--orange" d="M76 64 Q94 68 90 86 Q74 92 68 78 Q70 68 76 64Z" fill="#e8792c"/>

        <g class="cat-head-group">
          <!-- Ears (behind head circle) -->
          <path d="M32 38 L24 14 L46 30Z" fill="#faf6ee"/>
          <path d="M88 38 L96 14 L74 30Z" fill="#faf6ee"/>
          <path d="M33 33 L28 19 L42 29Z" fill="#f2b9c4"/>
          <path d="M87 33 L92 19 L78 29Z" fill="#f2b9c4"/>
          <path class="cat-head-patch" d="M78 28 Q92 30 90 42 Q80 46 74 36Z" fill="#e8792c"/>

          <!-- Big round chubby head -->
          <circle class="cat-head" cx="60" cy="46" r="30" fill="#faf6ee"/>
          <path class="cat-head-patch" d="M30 40 Q24 52 34 60 Q46 56 44 42 Q38 36 30 40Z" fill="#2b2320"/>

          <!-- Cheeks (chubby jowls) -->
          <ellipse cx="38" cy="56" rx="10" ry="8" fill="#faf6ee"/>
          <ellipse cx="82" cy="56" rx="10" ry="8" fill="#faf6ee"/>

          <g class="cat-eyes">
            <ellipse cx="48" cy="46" rx="4" ry="5.2" fill="#2a1d16"/>
            <ellipse cx="72" cy="46" rx="4" ry="5.2" fill="#2a1d16"/>
            <circle cx="49.2" cy="44.3" r="1.1" fill="#fff"/>
            <circle cx="73.2" cy="44.3" r="1.1" fill="#fff"/>
          </g>
          <g class="cat-eyes-closed">
            <path d="M43 47 Q48 51 53 47" fill="none" stroke="#2a1d16" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M67 47 Q72 51 77 47" fill="none" stroke="#2a1d16" stroke-width="2.2" stroke-linecap="round"/>
          </g>

          <path d="M57 52 L63 52 L60 57Z" fill="#f2b9c4"/>
          <path class="cat-mouth" d="M60 57 Q55 61 50 58 M60 57 Q65 61 70 58" fill="none" stroke="#2a1d16" stroke-width="1.6" stroke-linecap="round"/>

          <!-- Whiskers -->
          <g stroke="#c9bfb2" stroke-width="1.2" stroke-linecap="round">
            <path d="M30 50 L14 47" />
            <path d="M30 55 L13 56" />
            <path d="M90 50 L106 47" />
            <path d="M90 55 L107 56" />
          </g>
        </g>
      </svg>
      <div class="cat-hearts" aria-hidden="true">
        <span>♥</span><span>♥</span><span>♥</span>
      </div>
      <div class="cat-zzz" aria-hidden="true">Z z z</div>
    `;
  }

  function render(container) {
    root = container;
    root.innerHTML = `
      <div class="cat-room">
        <div class="cat-room__rug"></div>
        <button type="button" class="cat-sprite" id="cat-sprite" aria-label="Pet the cat" data-state="${state}">
          ${catSvg()}
        </button>
      </div>
    `;
    spriteEl = root.querySelector("#cat-sprite");
    spriteEl.addEventListener("click", onTap);

    positionSprite();
    setState("sitting");
    after(randBetween(2000, 4000), () => scheduleNextWalk(200));
  }

  function destroy() {
    clearTimers();
    if (spriteEl) spriteEl.removeEventListener("click", onTap);
    root = null;
    spriteEl = null;
  }

  return { render, destroy };
})();
