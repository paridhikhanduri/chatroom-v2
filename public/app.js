/* ==========================================================================
   chat-room — app.js
   Single-user front-end prototype. No backend, no network calls.
   Handles: view routing (with back-navigation history), decorative icon
   placement, custom form validation, and viewport-fit scaling.
   ========================================================================== */

(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     viewport-fit scaling
     Keeps the fixed 1440x1024 design canvas fully visible with no
     scrolling in either direction, on any screen size, by uniformly
     scaling it to fit the viewport (like a "contain" fit).
     ---------------------------------------------------------------------- */

  function updateStageScale() {
    const scaleX = window.innerWidth / 1440;
    const scaleY = window.innerHeight / 1024;
    const scale = Math.min(scaleX, scaleY);
    document.documentElement.style.setProperty('--stage-scale', scale);
  }

  updateStageScale();
  window.addEventListener('resize', updateStageScale);

  /* ----------------------------------------------------------------------
     view router
     Forward navigation (goToView) pushes the current view onto a history
     stack. Back navigation (goBack) pops that stack — this is what powers
     every modal's close (X) button. Some transitions (logo-group click,
     end-of-demo reset) intentionally reset the stack instead of pushing,
     since "return to splash" isn't a "go back one step" action.
     ---------------------------------------------------------------------- */

  const VIEWS = ['splash', 'landing', 'name', 'waiting', 'chat-office', 'chat-romance'];

  const viewEls = VIEWS.reduce((map, name) => {
    map[name] = document.querySelector(`[data-view="${name}"]`);
    return map;
  }, {});

  const logoOverlay = document.getElementById('logo-overlay');

  let historyStack = ['splash'];

  function getActiveViewName() {
    return VIEWS.find((v) => viewEls[v].classList.contains('view--active'));
  }

  /**
   * Switch to a named view.
   * @param {'splash'|'landing'|'name'|'waiting'} name
   * @param {{ track?: boolean }} [opts] - track:false skips pushing the
   *   current view onto the history stack (used for resets / back-nav).
   */
  function goToView(name, opts) {
    opts = opts || {};
    const track = opts.track !== false;

    if (!viewEls[name]) {
      console.warn(`[chat-room] Unknown view: "${name}"`);
      return;
    }

    const current = getActiveViewName();
    if (track && current && current !== name) {
      historyStack.push(current);
    }

    VIEWS.forEach((v) => viewEls[v].classList.toggle('view--active', v === name));

    // Shared logo overlay: icon-only on splash, full logo-group elsewhere.
    if (logoOverlay) {
      logoOverlay.classList.toggle('logo-overlay--icon-only', name === 'splash');
    }

    if (name === 'name') {
      const field = document.getElementById('name-field');
      if (field) field.focus();
    }
  }

  /** Pop the history stack and navigate there without re-tracking. */
  function goBack() {
    const prev = historyStack.pop() || 'splash';
    goToView(prev, { track: false });
  }

  /** Return to splash and clear history — used by logo-group clicks and
   *  the end-of-demo reset, since these aren't "one step back" actions. */
  function resetToSplash() {
    historyStack = ['splash'];
    goToView('splash', { track: false });
  }

  /* ----------------------------------------------------------------------
     logo-group — clicking it returns to splash from any screen.
     On splash itself, clicking the logo is a deliberate no-op.
     ---------------------------------------------------------------------- */

  /* ----------------------------------------------------------------------
     logo-group (shared overlay) — clicking it returns to splash from any
     screen. On splash itself, clicking the logo is a deliberate no-op.
     ---------------------------------------------------------------------- */

  if (logoOverlay) {
    logoOverlay.addEventListener('click', (e) => {
      e.stopPropagation(); // don't let this bubble into the splash click-anywhere handler
      if (getActiveViewName() === 'splash') return; // no-op
      resetToSplash();
    });
  }

  /* ----------------------------------------------------------------------
     VIEW 1 — splash-screen
     Click anywhere (except the logo, handled above) or press spacebar
     to continue to landing-page.
     ---------------------------------------------------------------------- */

  const splashView = viewEls.splash;

  splashView.addEventListener('click', (e) => {
    if (e.target.closest('.logo-group')) return; // logo click is a no-op here
    goToView('landing');
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && splashView.classList.contains('view--active')) {
      e.preventDefault(); // stop page scroll
      goToView('landing');
    }
  });

  /* ----------------------------------------------------------------------
     VIEW 2 — landing-page
     OK advances to name-page. Close (X) goes back to splash.
     ---------------------------------------------------------------------- */

  document
    .querySelector('[data-action="landing-ok"]')
    .addEventListener('click', () => goToView('name'));

  document
    .querySelector('[data-action="landing-close"]')
    .addEventListener('click', goBack);

  // Scatter the decorative info-icons using the exact coordinates
  // pulled from the Figma frame (relative to the 1286x978 icon layer).
  const DECORATIVE_ICON_POSITIONS = [
    [177, 130], [243, 275], [100, 100], [522, 100], [110, 339],
    [828, 788], [779, 1003], [1038, 857], [177, 525], [1103, 45],
    [320, 877], [1288, 555], [90, 927], [569, 150], [924, 80],
    [1308, 698], [1253, 229], [1328, 140], [1000, 983], [90, 721],
    [1298, 897], [502, 778], [427, 209], [818, 170], [652, 857],
    [1190, 512], [1308, 349], [62, 465],
  ];

  function renderDecorativeIcons() {
    const container = document.getElementById('decorative-icons');
    if (!container || container.childElementCount) return; // render once

    const fragment = document.createDocumentFragment();
    DECORATIVE_ICON_POSITIONS.forEach(([x, y]) => {
      const icon = document.createElement('span');
      icon.className = 'icon icon-info';
      icon.style.left = `${x}px`;
      icon.style.top = `${y}px`;
      fragment.appendChild(icon);
    });
    container.appendChild(fragment);
  }

  renderDecorativeIcons();

  /* ----------------------------------------------------------------------
     VIEW 3 — name-page
     Custom validation (no native browser popup): submitting while empty
     turns the placeholder red via .is-invalid; typing clears it. Only a
     non-empty name advances to waiting-room, carrying the name forward.
     Close (X) goes back to landing-page.
     ---------------------------------------------------------------------- */

  const nameForm = document.getElementById('name-form');
  const nameField = document.getElementById('name-field');
  const playerNameDisplay = document.getElementById('player-name-display');

  function submitName() {
    const trimmed = nameField.value.trim();

    if (!trimmed) {
      nameField.classList.add('is-invalid');
      nameField.focus();
      return;
    }

    playerNameDisplay.textContent = trimmed;
    if (window.chatRoomJoinWaitingRoom) window.chatRoomJoinWaitingRoom(trimmed);
    goToView('waiting');
  }

  nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitName();
  });

  nameField.addEventListener('input', () => {
    nameField.classList.remove('is-invalid');
  });

  document
    .querySelector('[data-action="name-close"]')
    .addEventListener('click', goBack);

  /* ----------------------------------------------------------------------
     VIEW 4 — waiting-room
     Close (X) goes back to name-page. OK is the end of the current flow —
     no chat-screen design exists yet, so it demo-loops back to splash.
     TODO: once a chat-screen design + backend pairing exists, wire OK to
     transition into the real chat view instead of resetting.
     ---------------------------------------------------------------------- */

  function endWaitingRoomDemo() {
    nameField.value = '';
    nameField.classList.remove('is-invalid');
    resetToSplash();
  }

  document
    .querySelector('[data-action="waiting-ok"]')
    .addEventListener('click', endWaitingRoomDemo);

  document
    .querySelector('[data-action="waiting-close"]')
    .addEventListener('click', goBack);

  /* ----------------------------------------------------------------------
     init
     ---------------------------------------------------------------------- */

  // Exposed so chat.js can route to chat-office/chat-romance/etc. without
  // duplicating view-switching logic — everything else about goToView
  // (history tracking, logo-overlay toggling) stays exactly as-is.
  window.chatRoomGoToView = goToView;

  goToView('splash', { track: false });
})();