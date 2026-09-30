// A small, self-contained "virtual pet" widget for the Home screen: a calico cat that
// wanders a room, sits, sleeps, and reacts to being tapped. Pure CSS/SVG + JS state
// machine — no external assets or libraries. Purely decorative; touches no Store data.
window.CatWidget = (function () {
  const SPRITE_SIZE = 92; // px, width/height of the cat sprite's bounding box

  // The cat's walkable area is a trapezoid (narrow near the horizon, wide at the
  // bottom) for the perspective illusion, even though the floor itself is now painted
  // edge-to-edge with hardwood (see .cat-room__floor) rather than clipped to match.
  // Floor Y range stays within this band; the X range at a given Y is interpolated to
  // match the trapezoid's edges so the cat is never placed outside the intended area.
  const FLOOR_TOP = 34; // % — a little below the 30% horizon so paws don't clip the baseboard
  const FLOOR_BOTTOM = 92; // % — leaves a little margin above the room's bottom edge
  const HORIZON_LEFT = 30; // % — walkable area's left edge at the horizon
  const HORIZON_RIGHT = 70; // % — walkable area's right edge at the horizon
  const RUG = { x: 50, y: 47 };

  let root = null;
  let spriteEl = null;
  let state = "sitting"; // "walking" | "sitting" | "lying-down" | "sleeping" | "startled" | "waking"
  let view = "toward"; // "away" | "toward" — which drawn pose is currently shown; never mirrored
  let pos = { x: 50, y: 73 }; // percentage within the room; starts on the rug
  let timers = [];
  let walkSessionStart = 0; // Date.now() when the current continuous walking session began
  // When a walkTo() is in flight (transitionend not yet seen), this resolves it
  // immediately: state/pos are already the arrival values, so this just runs the
  // arrival callback (onArrive/startLyingDown) once. Cleared once the arrival has
  // actually happened. render() calls this before rebuilding the DOM so a walk that
  // was in flight when the Home tab was left can never survive as a dangling
  // listener on a detached sprite node — see render()'s call below for why that
  // matters (each Home visit creates a brand-new sprite element).
  let flushPendingArrival = null;

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
    // A genuine interruption (tap, etc.) should discard the pending arrival outright,
    // not run it — only cancel, never flush, from here.
    if (flushPendingArrival) {
      flushPendingArrival.cancel();
      flushPendingArrival = null;
    }
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

  // Swaps the sprite's drawn pose (away/toward) only when it actually changes, so
  // mid-walk CSS animations on the current pose aren't restarted every frame. Only the
  // .cat-sprite__pose container's contents are replaced — the pivot wrapper and hearts/
  // Zzz overlays are untouched, so any animation running on them keeps playing across a
  // pose swap instead of restarting on new markup.
  function setView(next) {
    if (view === next) return;
    view = next;
    spriteEl.querySelector(".cat-sprite__pose").innerHTML = catSvgFor(view);
  }

  function positionSprite() {
    spriteEl.style.left = pos.x + "%";
    spriteEl.style.top = pos.y + "%";
    const scale = depthScale(pos.y);
    spriteEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  // Converts a target percentage position into a CSS transition duration proportional
  // to distance, so the cat "walks" at a roughly constant speed instead of a fixed time.
  // The pose is purely a function of the move's vertical component — any downward
  // component uses the front-facing ("toward") pose, any upward component uses the
  // back-facing ("away") pose, and a perfectly horizontal move defaults to "toward".
  // There is no mirroring and no side view at all, so there is nothing that can ever
  // visually "flip" — sideways and diagonal moves just slide the front/back pose to its
  // new spot, the same way up/down moves already did.
  // sleepOnArrival: when true, arriving skips the normal onArrive random roll and goes
  // straight into the lie-down-then-sleep sequence at the destination just walked to —
  // used when a sleep decision (and target spot) has already been made.
  function walkTo(targetX, targetY, sleepOnArrival) {
    const { width, height } = roomSize();
    const dx = ((targetX - pos.x) / 100) * width;
    const dy = ((targetY - pos.y) / 100) * height;
    const distance = Math.hypot(dx, dy);
    const speed = 28; // px per second
    const duration = Math.max(0.6, distance / speed);

    setView(dy < 0 ? "away" : "toward");

    setState("walking");
    spriteEl.style.transitionDuration = duration + "s";
    pos = { x: targetX, y: targetY };
    positionSprite();

    // The pose (e.g. sleeping) must never switch while the sprite is still visually
    // sliding to its destination. Rather than trust the setTimeout below to line up
    // exactly with the CSS transition's real end (it can drift under tab throttling
    // or scheduling jitter, letting a "lying-down"/"sleeping" state apply mid-slide),
    // wait for the actual transitionend event and only fall back to the timer if the
    // browser never fires one (e.g. a zero-distance move that changes no property).
    //
    // If the Home tab is left and re-rendered before either fires, this listener ends
    // up on a now-detached sprite node and would never fire on its own — flushed
    // explicitly by render() instead (see flushPendingArrival). pos/state are already
    // set to the arrival values above, so flushing just means running the arrival
    // callback once; render()'s own snap-to-pos logic (on the fresh node) then shows
    // her already arrived, never mid-slide.
    const thisSpriteEl = spriteEl;
    const onDone = sleepOnArrival ? startLyingDown : onArrive;
    let settled = false;
    const cleanup = () => {
      thisSpriteEl.removeEventListener("transitionend", onTransitionEnd);
      if (flushPendingArrival && flushPendingArrival.cleanup === cleanup) flushPendingArrival = null;
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      onDone();
    };
    const onTransitionEnd = (e) => {
      if (e.target === thisSpriteEl && e.propertyName === "left") finish();
    };
    thisSpriteEl.addEventListener("transitionend", onTransitionEnd);
    flushPendingArrival = { cleanup, flush: finish, cancel: cleanup };
    after(duration * 1000 + 150, finish);
  }

  // True once the cat has actually arrived at (approximately) the rug — makes sitting
  // and sleeping there more likely, but not exclusive: the cat can still doze off
  // anywhere on the floor, just less often than when it's on the rug.
  function isNear(spot, tolerance) {
    return Math.abs(pos.x - spot.x) < tolerance && Math.abs(pos.y - spot.y) < tolerance;
  }

  // Sitting/roaming pauses last at most 15s before she moves again; sleeping lasts much
  // longer (30s-5min), per the intended "living in the background" feel rather than a
  // quick animation loop. A walking session lasts at least 10s before she's allowed to
  // stop and decide to sit/sleep again — see scheduleNextWalk/onArrive's minimum-walk
  // handling below.
  const SIT_MIN_MS = 3000;
  const SIT_MAX_MS = 15000;
  const SLEEP_MIN_MS = 30000;
  const SLEEP_MAX_MS = 300000;
  const WALK_MIN_MS = 10000;

  // Once a walking session has gone on long enough (WALK_MIN_MS), each arrival rolls
  // normally whether to stop (sit/sleep) or keep wandering. Before that minimum has
  // elapsed, she's not allowed to stop yet — every arrival just queues another random
  // hop instead of rolling to sit/sleep, so a "walk" always reads as a real ~10s+
  // wander rather than a single short hop that could immediately end again.
  function onArrive() {
    const walked = Date.now() - walkSessionStart;
    if (walked < WALK_MIN_MS) {
      scheduleNextWalk(randBetween(200, 800));
      return;
    }

    const onRug = isNear(RUG, 12);
    const roll = Math.random();

    if (onRug) {
      if (roll < 0.35) decideSleepSpot(true);
      else if (roll < 0.7) {
        setState("sitting");
        after(randBetween(SIT_MIN_MS, SIT_MAX_MS), () => scheduleNextWalk(200));
      } else scheduleNextWalk(randBetween(400, 1500));
      return;
    }

    if (roll < 0.12) {
      decideSleepSpot(false);
    } else if (roll < 0.3) {
      setState("sitting");
      after(randBetween(SIT_MIN_MS, SIT_MAX_MS), () => scheduleNextWalk(200));
    } else if (roll < 0.65) {
      scheduleNextWalk(randBetween(400, 1500));
    } else {
      after(200, () => walkTo(RUG.x, RUG.y));
    }
  }

  // Sleeping happens on the rug 80% of the time and at a random other floor spot the
  // other 20% — decided once here, then walked to (if not already there) exactly once,
  // rather than re-rolling on arrival (which could otherwise send the cat back and
  // forth if the second roll disagreed with the first).
  function decideSleepSpot(alreadyOnRug) {
    const sleepOnRug = Math.random() < 0.8;

    if (sleepOnRug && alreadyOnRug) {
      startLyingDown();
    } else if (sleepOnRug) {
      after(200, () => walkTo(RUG.x, RUG.y, true));
    } else {
      const targetY = randBetween(FLOOR_TOP, FLOOR_BOTTOM);
      const { left, right } = floorXRange(targetY);
      after(200, () => walkTo(randBetween(left, right), targetY, true));
    }
  }

  // Always faces front (toward) when lying down/sleeping, regardless of which
  // direction the walk to get there faced, so her face is visible while asleep.
  function startLyingDown() {
    setView("toward");
    setState("lying-down");
    after(1800, () => {
      setState("sleeping");
      after(randBetween(SLEEP_MIN_MS, SLEEP_MAX_MS), () => {
        if (state === "sleeping") wakeUpThenWalk();
      });
    });
  }

  function wakeUpThenWalk() {
    setState("waking");
    after(900, () => scheduleNextWalk(200));
  }

  function scheduleNextWalk(delay) {
    // A fresh walking session starts whenever the cat isn't already walking (coming
    // from sitting/waking/startled/purring/etc.); chained hops during onArrive's
    // "keep wandering" branches leave state as "walking" throughout, so the timer
    // isn't reset mid-session — only a genuinely new session resets the clock.
    if (state !== "walking") walkSessionStart = Date.now();
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
      setState("waking");
      after(900, () => {
        setState("sitting");
        purrThenResume();
      });
      return;
    }
    if (state === "startled" || state === "purring") return;

    if (state === "sitting") {
      clearTimers();
      purrThenResume();
      return;
    }

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

  // Sitting or (just-woken) sleeping cat reacts to a tap with a "Purr" text + a quick
  // in-place vibration, then goes back to sitting for a while before wandering again.
  function purrThenResume() {
    setState("purring");
    after(900, () => {
      setState("sitting");
      after(randBetween(1500, 3000), () => scheduleNextWalk(200));
    });
  }

  // Returns only the swappable SVG artwork. Hearts/Zzz overlays are created once in
  // render() and never touched by setView, so they can't accumulate duplicates across
  // pose swaps the way they would if they were part of this re-inserted markup.
  function svgWrap(inner) {
    return `
      <svg class="cat-sprite__svg" viewBox="0 0 120 110" width="${SPRITE_SIZE}" height="${SPRITE_SIZE * 110 / 120}">
        ${inner}
      </svg>
    `;
  }

  // Rear view: used when walking "away" (deeper into the room, toward the horizon).
  // Shows the back of the head (ears only, no face), the body, and the tail trailing
  // behind — no eyes/whiskers/face, which is what visually sells "facing away." Bold,
  // generous calico patches (both ears, shoulders, haunch, tail base) keep it readable
  // as a calico even without the face visible.
  // Reference photo of the real cat sleeping (viewed from behind) shows black
  // dominating almost the entire back/shoulders, with one large caramel "saddle"
  // patch draped off-center over one shoulder, one ear mostly black and the other
  // caramel at its base, and very little white showing at all from this angle.
  function catSvgAway() {
    return svgWrap(`
        <!-- Stems from the lower-left of the body circle (cx=60 cy=76 rx=30 ry=26),
             kept above the leg zone (y~86-106) so the legs drawn next are visibly
             poking out from under the body rather than being covered by the tail.
             Branches left and curls up to about the same height as the front view's
             shoulder-peek (~y=52) relative to the cat's overall height. Solid black
             with a single orange marking partway along its length. -->
        <g class="cat-tail">
          <path d="M46 84 Q20 82 18 62 Q18 55 30 50" fill="none" stroke="#1c1917" stroke-width="12" stroke-linecap="round"/>
          <path d="M19 70 Q18 63 20 57" fill="none" stroke="#d17a2e" stroke-width="12" stroke-linecap="round"/>
        </g>

        <!-- Legs painted before the body here (unlike the front view) so they sit
             behind/under the body silhouette, like a real cat's legs viewed from
             behind — only small paw-tips should peek out past the body's edge. -->
        <g class="cat-legs">
          <ellipse class="cat-leg cat-leg--left" cx="44" cy="96" rx="8" ry="10" fill="#faf6ee" stroke="#e4d9c8" stroke-width="1.5"/>
          <ellipse class="cat-leg cat-leg--right" cx="76" cy="96" rx="8" ry="10" fill="#1c1917" stroke="#100e0d" stroke-width="1.5"/>
        </g>

        <!-- Black covers almost the whole back, unlike the front view's mostly-white
             body — the reference photo shows barely any white visible from behind. -->
        <ellipse class="cat-body" cx="60" cy="76" rx="30" ry="26" fill="#1c1917"/>
        <path class="cat-body-patch cat-body-patch--orange" d="M40 54 Q66 48 76 62 Q74 78 54 78 Q38 72 40 54Z" fill="#d17a2e"/>
        <!-- Small white sliver at the neck/collar, the only white visible from behind. -->
        <path d="M48 54 Q60 50 70 54 Q66 60 58 60 Q50 60 48 54Z" fill="#faf6ee"/>
        <!-- A couple small extra white/orange flecks lower on the back, breaking up
             the black a bit more like a real calico's scattered patches. -->
        <path d="M36 82 Q42 78 44 84 Q40 90 34 88 Q32 84 36 82Z" fill="#faf6ee"/>
        <path d="M78 86 Q86 84 86 92 Q80 96 76 92 Q75 88 78 86Z" fill="#d17a2e"/>

        <g class="cat-head-group">
          <path d="M36 40 L28 16 L50 32Z" fill="#1c1917"/>
          <path d="M84 40 L92 16 L70 32Z" fill="#faf6ee"/>
          <path d="M83 34 L89 20 L74 31Z" fill="#d17a2e"/>
          <circle class="cat-head" cx="60" cy="46" r="30" fill="#1c1917"/>
          <!-- Both orange patches are drawn after (on top of) the black head circle
               and kept well clear of its outer edge, so black fully surrounds each
               patch with no white showing through between them. -->
          <path class="cat-head-patch cat-head-patch--orange" d="M66 26 Q80 26 82 38 Q80 46 70 44 Q62 38 66 26Z" fill="#d17a2e"/>
          <path class="cat-head-patch cat-head-patch--orange" d="M42 30 Q56 26 60 38 Q54 46 44 42 Q38 36 42 30Z" fill="#d17a2e"/>
          <path d="M46 66 Q60 72 74 66" fill="none" stroke="#3a3330" stroke-width="2" stroke-linecap="round"/>
        </g>
    `);
  }

  // Front view: used for any move with a downward (or purely horizontal) component —
  // full face, no mirroring.
  function catSvgToward() {
    return svgWrap(`
        <!-- Just a small peek of the tail showing past the top-right of the body/
             shoulder, rather than a long curl — base starts inside the body
             ellipse's silhouette (cx=60 cy=76 rx=32 ry=26) so the body drawn next
             covers where it actually attaches. Curves further out and up so a clear
             gap shows between the body silhouette and the visible tip, reading
             clearly as a tail peeking out rather than hugging the body. Solid black
             with a small orange marking near the visible tip. -->
        <g class="cat-tail">
          <path d="M80 80 Q102 68 98 46" fill="none" stroke="#1c1917" stroke-width="12" stroke-linecap="round"/>
          <path d="M99 56 Q98 50 99 45" fill="none" stroke="#d17a2e" stroke-width="12" stroke-linecap="round"/>
        </g>

        <ellipse class="cat-body" cx="60" cy="76" rx="32" ry="26" fill="#faf6ee"/>
        <!-- Black patch down the left side of the chest/shoulder, mirroring the
             reference photo's black patch running from the face down one side. -->
        <path class="cat-body-patch" d="M30 58 Q46 52 54 62 Q56 76 44 84 Q30 86 26 74 Q26 64 30 58Z" fill="#1c1917"/>
        <!-- Small caramel patch low on the opposite hip, like the fleck seen near
             the tail base in the reference. -->
        <path class="cat-body-patch cat-body-patch--orange" d="M74 78 Q84 80 82 90 Q72 92 68 84 Q68 80 74 78Z" fill="#d17a2e"/>

        <g class="cat-legs">
          <ellipse class="cat-leg cat-leg--left" cx="44" cy="100" rx="8" ry="10" fill="#1c1917" stroke="#100e0d" stroke-width="1.5"/>
          <ellipse class="cat-leg cat-leg--right" cx="76" cy="100" rx="8" ry="10" fill="#faf6ee" stroke="#e4d9c8" stroke-width="1.5"/>
        </g>

        <g class="cat-head-group">
          <!-- Rebuilt from a reference photo: an overall white/cream face, one ear
             (viewer's left) black with a black patch wrapping down through that eye
             and cheek, the other ear white, and a caramel crown patch angled across
             the top of the head toward the black side. Eyes are amber/gold. -->
          <path d="M34 38 L26 14 L48 30Z" fill="#1c1917"/>
          <path d="M86 38 L94 14 L72 30Z" fill="#faf6ee"/>
          <path d="M85 33 L90 19 L76 29Z" fill="#f2b9c4"/>

          <circle class="cat-head" cx="60" cy="46" r="30" fill="#faf6ee"/>

          <!-- Black band that fully encircles the orange crown patch (drawn next):
             wraps above, to both sides, AND below it, so no white shows between the
             orange and the black anywhere around its border. A thin strip of white
             is left only further down, right above the eyes. Kept well inside the
             head circle's boundary (cx=60 cy=46 r=30) on every point. -->
          <path class="cat-head-patch" d="M36 26 Q40 17 50 17 Q56 17 64 17 Q74 17 78 26 Q78 33 70 34 Q62 36 54 34 Q46 33 38 34 Q34 32 36 26Z" fill="#1c1917"/>

          <!-- Caramel crown patch: angled across the top of the head, wider over the
             black-ear side, tapering off before the white-ear side. Sized to about a
             third of its earlier area, fully inset from the black band's edges on
             every side so the black fills the space it gave up. -->
          <path class="cat-head-patch cat-head-patch--orange" d="M44 20 Q50 15 58 16 Q65 17 67 22 Q66 25 59 24 Q51 23 46 24 Q43 23 44 20Z" fill="#d17a2e"/>

          <!-- Black patch: covers the left ear base, wraps down through that eye and
             onto the cheek, staying clear of the nose/muzzle and the other eye. Kept
             well inside the head circle's boundary on every point. -->
          <path class="cat-head-patch" d="M34 25 Q29 34 31 43 Q29 49 33 56 Q38 62 44 59 Q49 53 47 46 Q48 37 42 31 Q38 27 34 25Z" fill="#1c1917"/>

          <g class="cat-eyes">
            <ellipse cx="48" cy="47" rx="4.6" ry="5.8" fill="#a8c93c"/>
            <ellipse cx="72" cy="47" rx="4.6" ry="5.8" fill="#a8c93c"/>
            <ellipse cx="48" cy="47" rx="2" ry="4.4" fill="#2a1d16"/>
            <ellipse cx="72" cy="47" rx="2" ry="4.4" fill="#2a1d16"/>
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
    return v === "away" ? catSvgAway() : catSvgToward();
  }

  // True once the cat has been initialized for this page load. The Home screen's
  // container div gets destroyed and recreated every time you navigate back to it
  // (innerHTML replacement in home.js), but the cat's own state/timers live in this
  // module's closure and keep running the whole time regardless — so re-visiting Home
  // just needs to rebuild the DOM to reflect whatever the cat is currently doing,
  // rather than resetting her back to sitting-on-the-rug like a fresh app load would.
  let initialized = false;

  function render(container) {
    // Resolve any walk that was still in flight when this tab was last left, before
    // reading state/pos/view below — see walkTo()'s comment for why this can't just
    // rely on the old sprite node's own timer/transitionend firing on its own.
    if (flushPendingArrival) {
      const flush = flushPendingArrival.flush;
      flushPendingArrival = null;
      flush();
    }

    root = container;
    root.innerHTML = `
      <div class="cat-room">
        <div class="cat-room__scene">
          <div class="cat-room__window">
            <div class="cat-room__door-handle"></div>
          </div>
          <div class="cat-room__floor"></div>
          <div class="cat-room__sunlight"></div>
          <div class="cat-room__rug"></div>
        </div>
        <button type="button" class="cat-sprite" id="cat-sprite" aria-label="Pet the cat" data-state="${state}">
          <div class="cat-sprite__pivot">
            <div class="cat-sprite__pose">${catSvgFor(view)}</div>
          </div>
          <div class="cat-hearts" aria-hidden="true">
            <span>♥</span><span>♥</span><span>♥</span>
          </div>
          <div class="cat-zzz" aria-hidden="true">Z z z</div>
          <div class="cat-purr" aria-hidden="true">Purr</div>
        </button>
      </div>
    `;
    spriteEl = root.querySelector("#cat-sprite");
    spriteEl.addEventListener("click", onTap);

    // Snap to the current position/pose instantly (no transition) — this is a DOM
    // rebuild reflecting existing state, not a walk in progress.
    spriteEl.style.transitionDuration = "0s";
    positionSprite();

    if (!initialized) {
      initialized = true;
      setState("sitting");
      after(randBetween(2000, 4000), () => scheduleNextWalk(200));
    }
  }

  // Only unhooks this container's DOM listener; does NOT clear timers or reset state,
  // so the cat keeps "living" (walking/sitting/sleeping on her own schedule) while the
  // user is on another tab. If a timer fires while the Home screen is elsewhere,
  // spriteEl/root are detached but still-valid DOM nodes — style writes on them are
  // harmless no-ops (nothing visible), and roomSize()'s getBoundingClientRect() just
  // returns zeros, which walkTo() already floors to a minimum 0.6s duration rather than
  // dividing by zero. The next render() rebuilds the DOM from the current state/pos, so
  // nothing is lost — the cat just "teleports" the DOM to wherever she already was.
  function destroy() {
    if (spriteEl) spriteEl.removeEventListener("click", onTap);
  }

  return { render, destroy };
})();
