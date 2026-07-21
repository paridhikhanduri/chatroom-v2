/* ==========================================================================
   chat-room — server.js
   STEP 2 of the incremental build: real waiting-room pairing over
   Socket.IO (see pairing.js). Scenario/prompt selection is still a stub
   (pairing.js emits a placeholder event after the 3s pause) — that's
   the next increment, not built here yet.
   ========================================================================== */

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { attachPairing } = require('./pairing');
const { attachChatRelay } = require('./chat');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the untouched front-end (index.html, styles.css, app.js, assets/)
// exactly as it behaves when opened directly — no changes to any of it.
app.use(express.static(path.join(__dirname, '..', 'public')));

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id} (${reason})`);
  });
});

// Waiting-room pairing logic lives in its own module — see pairing.js.
attachPairing(io);

// Plain message relay (Stage A, no AI mediation yet) — see chat.js.
attachChatRelay(io);

// Bind to 0.0.0.0 (not just localhost) so a second device on the same
// local network can reach this too — useful for testing "two computers"
// before any actual Mac mini deployment.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[chat-room] server running:`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  (also reachable from other devices on your LAN via your machine's local IP, same port)`);
});
