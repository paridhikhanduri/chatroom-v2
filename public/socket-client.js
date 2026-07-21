/* ==========================================================================
   chat-room — socket-client.js
   STEP 2: real waiting-room pairing over Socket.IO. Still deliberately
   kept separate from app.js — the only touch point in app.js itself is
   one line in submitName() that calls window.chatRoomJoinWaitingRoom(name).

   Note on UI convention: every client always renders itself as
   "player-card--1" and the other person as "player-card--2" — that's
   already how the existing markup/CSS works (card 1 = "hi there, X!",
   card 2 = "waiting for, Y..."), so no HTML/CSS changes were needed to
   support pairing; this file just updates card 2's text once a partner
   is found, and reverts it if they disconnect.
   ========================================================================== */

(function () {
  'use strict';

  const socket = io(); // connects back to the same host/port that served this page

  socket.on('connect', () => {
    console.log(`[chat-room] connected to server (socket id: ${socket.id})`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[chat-room] disconnected from server — ${reason}`);
  });

  // Exposed for later steps (chat messaging) to reuse the same connection
  // instead of opening a second one.
  window.chatRoomSocket = socket;

  /* ------------------------------------------------------------------
     waiting room
     ------------------------------------------------------------------ */

  const card2Label = document.querySelector('.player-card--2 .player-label');
  const originalCard2Html = card2Label ? card2Label.innerHTML : '';

  // Called from app.js's submitName() right after the player's own card
  // is set locally — tells the server this player has arrived.
  window.chatRoomJoinWaitingRoom = function (name) {
    socket.emit('waiting-room:join', { name });
  };

  // Confirms our own name back — belt-and-suspenders with app.js already
  // setting #player-name-display locally; harmless if it matches.
  socket.on('waiting-room:you', ({ name }) => {
    const selfDisplay = document.getElementById('player-name-display');
    if (selfDisplay) selfDisplay.textContent = name;
  });

  // Track the partner's name once known, so it's available to pass along
  // when scenario:assigned arrives (that event doesn't repeat the name).
  let lastKnownPartnerName = null;

  // A partner has been found — reflect it on card 2 in real time.
  socket.on('waiting-room:matched', ({ partnerName }) => {
    lastKnownPartnerName = partnerName;
    if (!card2Label) return;
    card2Label.innerHTML = `hi there, <span class="underline-squiggle">${partnerName}</span>!`;
    console.log(`[chat-room] matched with partner: ${partnerName}`);
  });

  // Partner disconnected mid-wait/mid-room — revert card 2 to its
  // original waiting state so the UI doesn't show a stale name.
  socket.on('waiting-room:partner-left', () => {
    lastKnownPartnerName = null;
    if (card2Label) card2Label.innerHTML = originalCard2Html;
    console.log('[chat-room] partner disconnected — back to waiting');
  });

  // Real scenario/prompt assignment — routes to the matching chat-<scenario>
  // view and shows the shared prompt-modal (see chat.js). Each player only
  // ever receives their OWN promptText/roleLabel here — the server never
  // sends the partner's prompt to this socket at all.
  socket.on('scenario:assigned', (payload) => {
    console.log(`[chat-room] scenario assigned: ${payload.scenarioDisplayName} (room ${payload.roomId})`);
    console.log(`[chat-room] your prompt: ${payload.promptText}`);

    if (typeof window.chatRoomEnterScenario === 'function') {
      window.chatRoomEnterScenario({ ...payload, partnerName: lastKnownPartnerName });
    } else {
      console.warn('[chat-room] chatRoomEnterScenario not available — is chat.js loaded?');
    }
  });

  /* ----------------------------------------------------------------------
     chat messaging — Stage A: plain relay, no AI mediation yet. The
     server echoes the sender's own message back (chat:message:outgoing)
     with a server-confirmed timestamp, and delivers it to the partner
     (chat:message:incoming) — see server/chat.js.
     ---------------------------------------------------------------------- */

  socket.on('chat:message:outgoing', ({ text, timestamp }) => {
    if (typeof window.chatRoomReceiveMessage === 'function') {
      window.chatRoomReceiveMessage('outgoing', text, timestamp);
    }
  });

  socket.on('chat:message:incoming', ({ text, timestamp }) => {
    if (typeof window.chatRoomReceiveMessage === 'function') {
      window.chatRoomReceiveMessage('incoming', text, timestamp);
    }
  });
})();
