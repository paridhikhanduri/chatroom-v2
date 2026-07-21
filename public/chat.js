/* ==========================================================================
   chat-room — chat.js
   Shared behavior across every chat-* scenario view. Deliberately binds
   only to [data-role="..."] attributes — never to scenario-specific CSS
   classes — so chat-office and chat-romance (and later chat-friendship)
   can have completely different markup/layout while this file doesn't
   care or need to change.

   What's built here:
     - scenario:assigned -> routes to the right chat-<scenario> view,
       shows the shared prompt-modal, and clears the static example
       messages that were only ever there for visual verification while
       building the UI (real messages replace them from here on).
     - The prompt-modal itself (one shared instance, reused across every
       scenario — see index.html).
     - Stage A: real message send (via the composer) and receive
       (rendered as incoming/outgoing bubbles) — plain relay, no AI
       mediation yet. That's Stage B, built server-side without any
       client changes needed here.
   ========================================================================== */

(function () {
  'use strict';

  const promptModalOverlay = document.getElementById('prompt-modal-overlay');
  const promptModalTitle = document.querySelector('[data-role="prompt-modal-title"]');
  const promptRoleLabel = document.querySelector('[data-role="prompt-role-label"]');
  const promptDivider = document.querySelector('[data-role="prompt-divider"]');
  const promptText = document.querySelector('[data-role="prompt-text"]');

  // Set once per scenario, from the scenario:assigned payload — used by
  // the composer (to know which room to send into) and by incoming
  // message rendering (to label the partner's bubbles by name).
  let currentRoomId = null;
  let currentPartnerName = 'partner';
  let messagesCleared = false;

  function showPromptModal({ roleLabel, text }) {
    if (roleLabel) {
      promptRoleLabel.textContent = `your role: ${roleLabel}`;
      promptRoleLabel.hidden = false;
      promptDivider.hidden = false;
    } else {
      // Scenarios without a defined role label (e.g. Romance, for now)
      // just skip straight to the prompt text — no label, no divider.
      promptRoleLabel.hidden = true;
      promptDivider.hidden = true;
    }

    promptText.textContent = text;
    promptModalOverlay.classList.add('prompt-modal-overlay--visible');
    promptModalOverlay.setAttribute('aria-hidden', 'false');

    // Fresh scenario entry — make sure the background is visible again
    // (in case a prior scenario's OK click had hidden it).
    document.querySelectorAll('[data-role="scenario-background"]').forEach((el) => {
      el.classList.remove('scenario-background--hidden');
    });
  }

  function hidePromptModal() {
    promptModalOverlay.classList.remove('prompt-modal-overlay--visible');
    promptModalOverlay.setAttribute('aria-hidden', 'true');

    // Reveal just the chat interface by removing the scenario's
    // decorative background — data-role-based so this works for
    // whichever scenario is currently active (Office now, Romance/
    // Friendship later) without chat.js needing to know which one.
    document.querySelectorAll('[data-role="scenario-background"]').forEach((el) => {
      el.classList.add('scenario-background--hidden');
    });
  }

  document
    .querySelector('[data-action="prompt-modal-ok"]')
    .addEventListener('click', hidePromptModal);

  document
    .querySelector('[data-action="prompt-modal-close"]')
    .addEventListener('click', hidePromptModal);

  /* ----------------------------------------------------------------------
     message rendering — shared across every scenario. Finds the
     currently-active view's own message-list via [data-role], so this
     never needs to know which scenario is showing.
     ---------------------------------------------------------------------- */

  function getActiveMessageList() {
    return document.querySelector('.view--active [data-role="message-list"]');
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendMessage(direction, text, timestamp) {
    const list = getActiveMessageList();
    if (!list) return;

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message chat-message--${direction}`;
    messageEl.setAttribute(
      'data-role',
      direction === 'incoming' ? 'incoming-chat-message' : 'outgoing-chat-message'
    );

    const metaEl = document.createElement('div');
    metaEl.className = 'chat-message__meta';

    if (direction === 'incoming') {
      const nameEl = document.createElement('span');
      nameEl.className = 'chat-message__name';
      nameEl.setAttribute('data-role', 'partner-name-inline');
      nameEl.textContent = currentPartnerName;
      metaEl.appendChild(nameEl);
    }

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-message__time';
    timeEl.textContent = formatTime(timestamp);
    metaEl.appendChild(timeEl);

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'chat-message__bubble';
    bubbleEl.textContent = text;

    messageEl.appendChild(metaEl);
    messageEl.appendChild(bubbleEl);
    list.appendChild(messageEl);
    list.scrollTop = list.scrollHeight;
  }

  // Called from socket-client.js when 'chat:message:incoming'/
  // 'chat:message:outgoing' arrives.
  window.chatRoomReceiveMessage = function (direction, text, timestamp) {
    appendMessage(direction, text, timestamp);
  };

  /* ----------------------------------------------------------------------
     scenario routing — called from socket-client.js when
     'scenario:assigned' arrives.
     ---------------------------------------------------------------------- */

  window.chatRoomEnterScenario = function ({ scenario, roleLabel, promptText: text, partnerName, roomId }) {
    const viewName = `chat-${scenario}`;

    currentRoomId = roomId;
    currentPartnerName = partnerName || 'partner';

    if (typeof window.chatRoomGoToView === 'function') {
      window.chatRoomGoToView(viewName);
    } else {
      console.warn(`[chat-room] chatRoomGoToView not available — cannot route to "${viewName}"`);
    }

    // The static example bubbles in the markup were only ever there for
    // visual verification while building the UI — clear them once, the
    // first time a real scenario starts, so real messages start fresh.
    if (!messagesCleared) {
      const list = getActiveMessageList();
      if (list) list.innerHTML = '';
      messagesCleared = true;
    }

    if (partnerName) {
      document.querySelectorAll('[data-role="partner-name"]').forEach((el) => {
        el.textContent = partnerName;
      });
    }

    promptModalTitle.textContent = 'who are you?';
    showPromptModal({ roleLabel, text });
  };

  /* ----------------------------------------------------------------------
     message composer — Stage A: real send via Socket.IO, plain relay,
     no AI mediation yet. Scoped with [data-role] so this same wiring
     works for every scenario's own composer markup without change.
     ---------------------------------------------------------------------- */

  document.querySelectorAll('[data-role="message-composer"]').forEach((composer) => {
    composer.addEventListener('submit', (e) => {
      e.preventDefault();

      const input = composer.querySelector('[data-role="message-input"]');
      if (!input) return;

      const text = input.value.trim();
      if (!text || !currentRoomId) return;

      if (!window.chatRoomSocket) {
        console.warn('[chat-room] no socket connection — cannot send message');
        return;
      }

      window.chatRoomSocket.emit('chat:message', { roomId: currentRoomId, text });
      input.value = '';
    });
  });
})();
