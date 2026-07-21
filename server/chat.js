/* ==========================================================================
   chat-room — chat.js (server-side)
   Stage B: real message relay WITH the AI mediation layer inserted
   (mediation.js — currently a pass-through stub, see that file). The
   context passed to mediateMessage() carries real scenario/prompt/
   history data, not placeholders — proving this shape is right now is
   the whole point of building Stage B before Stage C (real Ollama call)
   touches anything.
   ========================================================================== */

'use strict';

const rooms = require('./rooms');
const { mediateMessage } = require('./mediation');

function attachChatRelay(io) {
  io.on('connection', (socket) => {
    socket.on('chat:message', async (payload) => {
      const roomId = payload && payload.roomId;
      const text = ((payload && payload.text) || '').trim();
      if (!roomId || !text) return;

      const room = rooms.getRoom(roomId);
      if (!room) {
        console.warn(`[chat] message for unknown/closed room ${roomId} — ignoring`);
        return;
      }

      const sender = room.players.find((p) => p.socket.id === socket.id);
      const partner = rooms.getPartner(roomId, socket);
      if (!sender || !partner) {
        console.warn(`[chat] sender or partner missing in room ${roomId} — ignoring`);
        return;
      }

      const context = {
        scenario: room.scenario ? room.scenario.scenarioKey : null,
        roomId,
        senderPromptText: sender.promptText || null,
        receiverPromptText: partner.promptText || null,
        // Copy, not the live array — mediateMessage shouldn't be able to
        // mutate the room's actual history out from under us.
        history: room.history ? room.history.slice() : [],
      };

      let deliveredText;
      try {
        deliveredText = await mediateMessage(text, context);
      } catch (err) {
        // Fail-safe: if mediation throws (e.g. Stage C's model call
        // errors or times out), fall back to the unmodified message
        // rather than losing it entirely — an installation shouldn't
        // go silent because a local model hiccuped.
        console.error(`[chat] mediation error in room ${roomId}:`, err);
        deliveredText = text;
      }

      const timestamp = Date.now();

      room.history = room.history || [];
      room.history.push({ sender: sender.name, text, timestamp });

      // Sender gets their own ORIGINAL message echoed back (never the
      // mediated version) with a server-confirmed timestamp — keeps
      // both clients' message ordering/timestamps consistent with the
      // server, and means messages only ever appear via this one
      // round-trip (no optimistic client-side rendering to keep in sync).
      sender.socket.emit('chat:message:outgoing', { roomId, text, timestamp });

      // Partner receives the mediated (currently identical, Stage B)
      // delivered text.
      partner.socket.emit('chat:message:incoming', { roomId, text: deliveredText, timestamp });

      const mediationNote = deliveredText !== text ? ` (mediated: "${deliveredText}")` : '';
      console.log(`[chat] room ${roomId}: ${sender.name} -> ${partner.name}: "${text}"${mediationNote}`);
    });
  });
}

module.exports = { attachChatRelay };
