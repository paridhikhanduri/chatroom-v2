/* ==========================================================================
   chat-room — socket-client.js
   STEP 2: real waiting-room pairing over Socket.IO. Still deliberately
   kept separate from app.js — the only touch point in app.js itself is
   one line in submitName() that calls window.chatRoomJoinWaitingRoom(name).

   This version now tries a local server first and then falls back to
   nearby LAN addresses, so two installations can prototype peer-to-peer
   pairing on the same network without manual IP entry.
   ========================================================================== */

(function () {
  "use strict";

  const defaultPort = "4141";
  const defaultServerUrl = `http://127.0.0.1:${defaultPort}`;
  const card2Label = document.querySelector(".player-card--2 .player-label");
  const originalCard2Html = card2Label ? card2Label.innerHTML : "";

  let socket = null;
  let lastKnownPartnerName = null;

  function normalizeServerUrl(url) {
    if (!url) return defaultServerUrl;
    return url.replace(/\/+$/, "");
  }

  function getConfiguredServerUrl() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("server");
    return normalizeServerUrl(
      fromQuery || window.__CHATROOM_SERVER_URL__ || defaultServerUrl,
    );
  }

  function getDiscoveryCandidates() {
    const configuredUrl = getConfiguredServerUrl();
    const candidates = new Set();

    const privatePrefixes = [
      "192.168.1.",
      "192.168.0.",
      "10.0.0.",
      "10.0.1.",
      "172.16.0.",
      "172.20.0.",
    ];
    const hostSuffixes = [
      "1",
      "10",
      "20",
      "30",
      "50",
      "100",
      "101",
      "102",
      "110",
      "111",
      "112",
      "113",
      "120",
      "150",
      "200",
    ];

    privatePrefixes.forEach((prefix) => {
      hostSuffixes.forEach((suffix) => {
        candidates.add(`http://${prefix}${suffix}:${defaultPort}`);
      });
    });

    if (window.location.origin && window.location.origin !== "null") {
      candidates.add(window.location.origin);
    }

    candidates.add(configuredUrl);
    candidates.add(`http://localhost:${defaultPort}`);
    candidates.add(defaultServerUrl);

    return Array.from(candidates);
  }

  function fetchWithTimeout(url, timeoutMs = 700) {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);

      fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
        .then((response) => {
          window.clearTimeout(timer);
          resolve(response);
        })
        .catch((error) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });
  }

  async function discoverServerUrl() {
    const candidates = getDiscoveryCandidates();

    for (const candidate of candidates) {
      try {
        const response = await fetchWithTimeout(`${candidate}/healthz`);
        if (response.ok) {
          return normalizeServerUrl(candidate);
        }
      } catch (error) {
        // Ignore failed probes and try the next candidate.
      }
    }

    return getConfiguredServerUrl();
  }

  function attachSocketEvents(socketInstance) {
    socketInstance.on("connect", () => {
      console.log(
        `[chat-room] connected to server (socket id: ${socketInstance.id})`,
      );
    });

    socketInstance.on("connect_error", (error) => {
      console.warn(`[chat-room] socket connection error: ${error.message}`);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log(`[chat-room] disconnected from server — ${reason}`);
    });

    // Exposed for later steps (chat messaging) to reuse the same connection
    // instead of opening a second one.
    window.chatRoomSocket = socketInstance;

    // Called from app.js's submitName() right after the player's own card
    // is set locally — tells the server this player has arrived.
    window.chatRoomJoinWaitingRoom = function (name) {
      if (!socketInstance.connected) {
        console.warn(
          "[chat-room] socket is not connected yet — waiting for the server",
        );
        return;
      }
      socketInstance.emit("waiting-room:join", { name });
    };

    // Confirms our own name back — belt-and-suspenders with app.js already
    // setting #player-name-display locally; harmless if it matches.
    socketInstance.on("waiting-room:you", ({ name }) => {
      const selfDisplay = document.getElementById("player-name-display");
      if (selfDisplay) selfDisplay.textContent = name;
    });

    // A partner has been found — reflect it on card 2 in real time.
    socketInstance.on("waiting-room:matched", ({ partnerName }) => {
      lastKnownPartnerName = partnerName;
      if (!card2Label) return;
      card2Label.innerHTML = `hi there, <span class="underline-squiggle">${partnerName}</span>!`;
      console.log(`[chat-room] matched with partner: ${partnerName}`);
    });

    // Partner disconnected mid-wait/mid-room — revert card 2 to its
    // original waiting state so the UI doesn't show a stale name.
    socketInstance.on("waiting-room:partner-left", () => {
      lastKnownPartnerName = null;
      if (card2Label) card2Label.innerHTML = originalCard2Html;
      console.log("[chat-room] partner disconnected — back to waiting");
    });

    // Real scenario/prompt assignment — routes to the matching chat-<scenario>
    // view and shows the shared prompt-modal (see chat.js). Each player only
    // ever receives their OWN promptText/roleLabel here — the server never
    // sends the partner's prompt to this socket at all.
    socketInstance.on("scenario:assigned", (payload) => {
      console.log(
        `[chat-room] scenario assigned: ${payload.scenarioDisplayName} (room ${payload.roomId})`,
      );
      console.log(`[chat-room] your prompt: ${payload.promptText}`);

      if (typeof window.chatRoomEnterScenario === "function") {
        window.chatRoomEnterScenario({
          ...payload,
          partnerName: lastKnownPartnerName,
        });
      } else {
        console.warn(
          "[chat-room] chatRoomEnterScenario not available — is chat.js loaded?",
        );
      }
    });

    /* ----------------------------------------------------------------------
       chat messaging — Stage A: plain relay, no AI mediation yet. The
       server echoes the sender's own message back (chat:message:outgoing)
       with a server-confirmed timestamp, and delivers it to the partner
       (chat:message:incoming) — see server/chat.js.
       ---------------------------------------------------------------------- */

    socketInstance.on("chat:message:outgoing", ({ text, timestamp }) => {
      if (typeof window.chatRoomReceiveMessage === "function") {
        window.chatRoomReceiveMessage("outgoing", text, timestamp);
      }
    });

    socketInstance.on("chat:message:incoming", ({ text, timestamp }) => {
      if (typeof window.chatRoomReceiveMessage === "function") {
        window.chatRoomReceiveMessage("incoming", text, timestamp);
      }
    });
  }

  async function initializeSocket() {
    const serverUrl = await discoverServerUrl();
    window.chatRoomServerUrl = serverUrl;
    console.log(`[chat-room] using server: ${serverUrl}`);

    socket = io(serverUrl, { transports: ["websocket", "polling"] });
    attachSocketEvents(socket);
  }

  void initializeSocket();
})();
