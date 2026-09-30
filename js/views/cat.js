// A small, self-contained "virtual pet" widget for the Home screen: a calico cat that
// wanders a room, sits, sleeps, and reacts to being tapped. Pure CSS/SVG + JS state
// machine — no external assets or libraries. Purely decorative; touches no Store data.
window.CatWidget = (function () {
  const SPRITE_SIZE = 92; // px, width/height of the cat sprite's bounding box

  // The floor is a trapezoid (see .cat-room__floor's clip-path: 28%/72% at the horizon
  // widening to 0%/100% at the bottom) starting at 30% down the room. Floor Y range
  // stays within that band; the X range at a given Y is interpolated to match the
  // trapezoid's edges so the cat is never placed outside the visible floor shape.
  const FLOOR_TOP = 34; // % — a little below the 30% horizon so paws don't clip the baseboard
  const FLOOR_BOTTOM = 92; // % — leaves a little margin above the room's bottom edge
  const HORIZON_LEFT = 30; // % — floor's left edge at the horizon (matches clip-path ~28% + margin)
  const HORIZON_RIGHT = 70; // % — floor's right edge at the horizon
  const RUG = { x: 50, y: 46 };

  let root = null;
  let spriteEl = null;
  let state = "sitting"; // "walking" | "sitting" | "lying-down" | "sleeping" | "startled" | "waking"
  let facingRight = true;
  let view = "side"; // "side" | "away" | "toward" — which drawn pose is currently shown
  let pos = { x: 50, y: 73 }; // percentage within the room; starts on the rug
  let timers = [];

  // Depth scale: 1 at the bottom (closest), shrinking toward the horizon (furthest),
  // so the same sprite reads as "further back in the room" rather than just "higher up".
  function depthScale(y) {
    const t = (y - FLOOR_TOP) / (FLOOR_BOTTOM - FLOOR_TOP);
    return 0.62 + Math.max(0, Math.min(1, t)) * 0.38;
  }

  // The floor's usable X range narrows toward the horizon to match the trapezoid shape.
  function floorXRange(y) {
    const t = (y - FLOOR_TOP) / (FLOOR_BOTTOM - FLOOR_TOP);
    const clampedT = Math.max(0, Math.min(1, t));
    const left = HORIZON_LEFT * (1 - clampedT) + 2 * clampedT;
    const right = HORIZON_RIGHT * (1 - clampedT) + 98 * clampedT;
    return { left, right };
  }

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

  // Swaps the sprite's drawn pose (side/away/toward) only when it actually changes, so
  // mid-walk CSS animations on the current pose aren't restarted every frame.
  function setView(next) {
    if (view === next) return;
    view = next;
    const svgHolder = spriteEl.querySelector(".cat-sprite__svg");
    if (svgHolder) svgHolder.remove();
    spriteEl.insertAdjacentHTML("afterbegin", catSvgFor(view));
  }

  function positionSprite() {
    spriteEl.style.left = pos.x + "%";
    spriteEl.style.top = pos.y + "%";
    const scale = depthScale(pos.y);
    const flip = view === "side" && !facingRight ? -1 : 1;
    spriteEl.style.transform = `translate(-50%, -50%) scale(${scale}) scaleX(${flip})`;
  }

  // Converts a target percentage position into a CSS transition duration proportional
  // to distance, so the cat "walks" at a roughly constant speed instead of a fixed time.
  // The pose (side/away/toward) is chosen from whichever axis dominates this particular
  // move, so a mostly-sideways step shows the side view, a mostly-upward step shows the
  // back of the cat walking away, etc. — instead of one sprite just mirroring in place.
  //
  // If this move stays in the side view but reverses horizontal direction from the
  // previous walk, an instant scaleX flip would look like a flat image spinning in
  // place. Instead, play a short three-beat pivot first — glance toward the viewer,
  // then fully turn away, with a quick squash/settle pulse at the midpoint — before
  // continuing in the side view facing the new direction. This is a sleight of hand
  // (still swapped poses, not a true rotation), but the extra beats and the body pulse
  // read as the cat's body turning rather than a flat image flipping in place.
  function walkTo(targetX, targetY, skipTurnaround) {
    const { width, height } = roomSize();
    const dx = ((targetX - pos.x) / 100) * width;
    const dy = ((targetY - pos.y) / 100) * height;
    const distance = Math.hypot(dx, dy);
    const speed = 28; // px per second
    const duration = Math.max(0.6, distance / speed);

    const nextFacingRight = targetX >= pos.x;
    const isSideMove = Math.abs(dy) <= Math.abs(dx) * 1.3;
    const reversedDirection = isSideMove && view === "side" && nextFacingRight !== facingRight && distance > 4;

    if (!skipTurnaround && reversedDirection) {
      playTurnaround(() => {
        facingRight = nextFacingRight;
        walkTo(targetX, targetY, true);
      });
      return;
    }

    facingRight = nextFacingRight;
    if (isSideMove) {
      setView("side");
    } else {
      setView(dy < 0 ? "away" : "toward");
    }

    setState("walking");
    spriteEl.style.transitionDuration = duration + "s";
    pos = { x: targetX, y: targetY };
    positionSprite();

    after(duration * 1000, onArrive);
  }

  function playTurnaround(onDone) {
    setState("turning");
    spriteEl.style.transitionDuration = "0s";

    setView("toward");
    positionSprite();

    after(180, () => {
      setView("away");
      positionSprite();
      after(220, () => {
        setState("walking");
        onDone();
      });
    });
  }

  // True once the cat has actually arrived at (approximately) the rug — makes sitting
  // and sleeping there more likely, but not exclusive: the cat can still doze off
  // anywhere on the floor, just less often than when it's on the rug.
  function isNear(spot, tolerance) {
    return Math.abs(pos.x - spot.x) < tolerance && Math.abs(pos.y - spot.y) < tolerance;
  }

  function onArrive() {
    const onRug = isNear(RUG, 12);
    const roll = Math.random();

    if (onRug) {
      if (roll < 0.35) lieDownThenSleep();
      else if (roll < 0.7) {
        setState("sitting");
        after(randBetween(2500, 5000), () => scheduleNextWalk(200));
      } else scheduleNextWalk(randBetween(400, 1500));
      return;
    }

    if (roll < 0.12) {
      lieDownThenSleep();
    } else if (roll < 0.3) {
      setState("sitting");
      after(randBetween(2000, 4000), () => scheduleNextWalk(200));
    } else if (roll < 0.65) {
      scheduleNextWalk(randBetween(400, 1500));
    } else {
      after(200, () => walkTo(RUG.x, RUG.y));
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
      const targetY = randBetween(FLOOR_TOP, FLOOR_BOTTOM);
      const { left, right } = floorXRange(targetY);
      const targetX = randBetween(left, right);
      walkTo(targetX, targetY);
    });
  }

  function onTap() {
    if (state === "sleeping" || state === "lying-down") {
      clearTimers();
      wakeUpThenWalk();
      return;
    }
    if (state === "startled" || state === "turning") return;

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

  function svgWrap(inner) {
    return `
      <svg class="cat-sprite__svg" viewBox="0 0 120 110" width="${SPRITE_SIZE}" height="${SPRITE_SIZE * 110 / 120}">
        ${inner}
      </svg>
      <div class="cat-hearts" aria-hidden="true">
        <span>♥</span><span>♥</span><span>♥</span>
      </div>
      <div class="cat-zzz" aria-hidden="true">Z z z</div>
    `;
  }

  // Side profile: used facing left/right (mirrored via CSS scaleX). This is the pose
  // with the most detail since it's shown most often (walking left-right on the floor).
  function catSvgSide() {
    return svgWrap(`
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
        <path class="cat-body-patch" d="M56 60 Q68 56 72 66 Q66 74 56 70Z" fill="#2b2320" opacity="0.85"/>

        <g class="cat-head-group">
          <!-- Ears (behind head circle) -->
          <path d="M32 38 L24 14 L46 30Z" fill="#faf6ee"/>
          <path d="M88 38 L96 14 L74 30Z" fill="#faf6ee"/>
          <path d="M33 33 L28 19 L42 29Z" fill="#f2b9c4"/>
          <path d="M87 33 L92 19 L78 29Z" fill="#f2b9c4"/>
          <path d="M89 32 L94 20 L82 30Z" fill="#2b2320"/>
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
    `);
  }

  // Rear view: used when walking "away" (deeper into the room, toward the horizon).
  // Shows the back of the head (ears only, no face), the body, and the tail trailing
  // behind — no eyes/whiskers/face, which is what visually sells "facing away." Bold,
  // generous calico patches (both ears, shoulders, haunch, tail base) keep it readable
  // as a calico even without the face visible.
  function catSvgAway() {
    return svgWrap(`
        <g class="cat-tail">
          <path d="M60 96 Q66 70 52 50" fill="none" stroke="#e8792c" stroke-width="12" stroke-linecap="round"/>
          <path d="M60 90 Q64 74 55 58" fill="none" stroke="#2b2320" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
        </g>
        <g class="cat-legs">
          <ellipse cx="46" cy="94" rx="8" ry="9" fill="#faf6ee"/>
          <ellipse cx="74" cy="94" rx="8" ry="9" fill="#faf6ee"/>
        </g>

        <ellipse class="cat-body" cx="60" cy="76" rx="30" ry="26" fill="#faf6ee"/>
        <path class="cat-body-patch" d="M32 62 Q52 50 66 62 Q62 84 40 86 Q28 76 32 62Z" fill="#2b2320"/>
        <path class="cat-body-patch cat-body-patch--orange" d="M60 56 Q82 54 86 74 Q76 90 58 80 Q54 66 60 56Z" fill="#e8792c"/>
        <path class="cat-body-patch" d="M70 82 Q80 88 76 96 Q66 96 66 88Z" fill="#2b2320"/>

        <g class="cat-head-group">
          <path d="M36 40 L28 16 L50 32Z" fill="#faf6ee"/>
          <path d="M84 40 L92 16 L70 32Z" fill="#faf6ee"/>
          <path d="M37 34 L31 20 L46 31Z" fill="#2b2320"/>
          <path d="M83 34 L89 20 L74 31Z" fill="#e8792c"/>
          <path class="cat-head-patch" d="M70 30 Q88 32 86 46 Q72 48 66 36Z" fill="#e8792c"/>
          <circle class="cat-head" cx="60" cy="46" r="28" fill="#faf6ee"/>
          <path class="cat-head-patch" d="M32 38 Q24 52 36 62 Q50 58 48 42 Q40 34 32 38Z" fill="#2b2320"/>
          <path d="M46 66 Q60 72 74 66" fill="none" stroke="#e0d3c2" stroke-width="2" stroke-linecap="round"/>
        </g>
    `);
  }

  // Front view: used when walking "toward" the viewer (down/forward on the floor).
  // Full face, but a slightly wider/rounder silhouette than the side view (no visible
  // legs stride) so it doesn't read as identical to the side pose from the front.
  function catSvgToward() {
    return svgWrap(`
        <g class="cat-tail">
          <path d="M92 88 Q104 68 92 48" fill="none" stroke="#e8792c" stroke-width="12" stroke-linecap="round"/>
        </g>
        <g class="cat-legs">
          <ellipse cx="46" cy="94" rx="8" ry="9" fill="#faf6ee"/>
          <ellipse cx="74" cy="94" rx="8" ry="9" fill="#faf6ee"/>
        </g>

        <ellipse class="cat-body" cx="60" cy="76" rx="32" ry="26" fill="#faf6ee"/>
        <path class="cat-body-patch" d="M34 62 Q48 54 58 64 Q52 78 36 80 Q28 72 34 62Z" fill="#2b2320"/>
        <path class="cat-body-patch cat-body-patch--orange" d="M70 60 Q86 62 84 78 Q70 84 64 72 Q64 64 70 60Z" fill="#e8792c"/>

        <g class="cat-head-group">
          <path d="M34 38 L26 14 L48 30Z" fill="#faf6ee"/>
          <path d="M86 38 L94 14 L72 30Z" fill="#faf6ee"/>
          <path d="M35 33 L30 19 L44 29Z" fill="#f2b9c4"/>
          <path d="M85 33 L90 19 L76 29Z" fill="#f2b9c4"/>
          <path class="cat-head-patch" d="M74 26 Q90 28 88 42 Q76 44 72 32Z" fill="#e8792c"/>

          <circle class="cat-head" cx="60" cy="46" r="30" fill="#faf6ee"/>
          <path class="cat-head-patch" d="M32 40 Q26 52 36 60 Q48 56 46 42 Q40 36 32 40Z" fill="#2b2320"/>

          <ellipse cx="40" cy="56" rx="10" ry="8" fill="#faf6ee"/>
          <ellipse cx="80" cy="56" rx="10" ry="8" fill="#faf6ee"/>

          <g class="cat-eyes">
            <ellipse cx="48" cy="47" rx="4.4" ry="5.6" fill="#2a1d16"/>
            <ellipse cx="72" cy="47" rx="4.4" ry="5.6" fill="#2a1d16"/>
            <circle cx="49.3" cy="45.2" r="1.2" fill="#fff"/>
            <circle cx="73.3" cy="45.2" r="1.2" fill="#fff"/>
          </g>
          <g class="cat-eyes-closed">
            <path d="M43 48 Q48 52 53 48" fill="none" stroke="#2a1d16" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M67 48 Q72 52 77 48" fill="none" stroke="#2a1d16" stroke-width="2.2" stroke-linecap="round"/>
          </g>

          <path d="M57 53 L63 53 L60 58Z" fill="#f2b9c4"/>
          <path class="cat-mouth" d="M60 58 Q55 62 50 59 M60 58 Q65 62 70 59" fill="none" stroke="#2a1d16" stroke-width="1.6" stroke-linecap="round"/>

          <g stroke="#c9bfb2" stroke-width="1.2" stroke-linecap="round">
            <path d="M32 52 L16 49" />
            <path d="M32 57 L15 58" />
            <path d="M88 52 L104 49" />
            <path d="M88 57 L105 58" />
          </g>
        </g>
    `);
  }

  function catSvgFor(v) {
    if (v === "away") return catSvgAway();
    if (v === "toward") return catSvgToward();
    return catSvgSide();
  }

  function render(container) {
    root = container;
    view = "side";
    root.innerHTML = `
      <div class="cat-room">
        <div class="cat-room__window"></div>
        <div class="cat-room__floor"></div>
        <div class="cat-room__rug"></div>
        <button type="button" class="cat-sprite" id="cat-sprite" aria-label="Pet the cat" data-state="${state}">
          ${catSvgFor(view)}
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
