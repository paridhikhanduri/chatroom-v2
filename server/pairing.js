/* ==========================================================================
   chat-room — pairing.js
   Waiting-room pairing logic. Room state itself lives in rooms.js (shared
   with chat.js's message relay); this file owns the waiting-room-specific
   flow only.

   Flow implemented here:
     1. Player submits their name -> server immediately confirms it back
        to them ('waiting-room:you'), regardless of whether a partner
        exists yet.
     2. If no one's waiting, this player becomes the waiting player.
     3. If someone's already waiting, pair them: both sockets join a
        room, and each is told the OTHER player's name
        ('waiting-room:matched').
     4. After ~3s, pick a random scenario + prompt pair (scenarios.js),
        randomly assign which player gets prompt A vs B, and send each
        player their OWN prompt only ('scenario:assigned') — they never
        see their partner's prompt.
     5. Disconnects are handled gracefully: a waiting player who leaves
        just clears the waiting slot; a player who leaves mid-room
        notifies their partner and tears the room down.
   ========================================================================== */

'use strict';

const { pickScenarioAndPromptPair } = require('./scenarios');
const rooms = require('./rooms');

const SCENARIO_DELAY_MS = 3000;

let waitingSocket = null; // the single socket currently waiting for a partner

function attachPairing(io) {
  io.on('connection', (socket) => {
    socket.on('waiting-room:join', (payload) => {
      const name = ((payload && payload.name) || '').trim().slice(0, 24) || 'player';
      socket.data.playerName = name;

      // Confirm the player's own name back to them immediately — their
      // own card should update regardless of partner status.
      socket.emit('waiting-room:you', { name });

      if (!waitingSocket) {
        waitingSocket = socket;
        console.log(`[pairing] ${name} is waiting for a partner`);
        return;
      }

      if (waitingSocket.id === socket.id) {
        return; // same socket re-submitting — nothing to do
      }

      // Pair the waiting player with this new one.
      const partnerSocket = waitingSocket;
      waitingSocket = null;

      const roomId = rooms.createRoom([
        { socket: partnerSocket, name: partnerSocket.data.playerName },
        { socket, name },
      ]);

      partnerSocket.join(roomId);
      socket.join(roomId);

      // Each player learns the OTHER player's name only — they already
      // know their own from 'waiting-room:you' above.
      partnerSocket.emit('waiting-room:matched', { partnerName: name });
      socket.emit('waiting-room:matched', { partnerName: partnerSocket.data.playerName });

      console.log(`[pairing] room ${roomId} formed: ${partnerSocket.data.playerName} + ${name}`);

      setTimeout(() => {
        const currentRoom = rooms.getRoom(roomId);
        if (!currentRoom) return; // torn down by a disconnect in the meantime

        const { scenarioKey, displayName, promptPair } = pickScenarioAndPromptPair();

        // Coin flip for who gets prompt A vs B — not always "first player = A".
        const [player1, player2] = currentRoom.players;
        const player1GetsA = Math.random() < 0.5;

        const assignments = player1GetsA
          ? [{ player: player1, side: promptPair.a }, { player: player2, side: promptPair.b }]
          : [{ player: player1, side: promptPair.b }, { player: player2, side: promptPair.a }];

        assignments.forEach(({ player, side }) => {
          // Persist each player's own role/prompt onto the room's player
          // record too (not just emitted to the client) — chat.js uses
          // this to build the AI mediation context later.
          player.promptRole = side.role;
          player.promptText = side.text;

          // Each player receives ONLY their own prompt/role — never
          // their partner's — plus which scenario they're both in.
          player.socket.emit('scenario:assigned', {
            roomId,
            scenario: scenarioKey,
            scenarioDisplayName: displayName,
            roleLabel: side.role,   // null if this scenario doesn't define role labels yet
            promptText: side.text,
          });
        });

        // Persisted onto the room so chat.js's mediation context knows
        // which scenario this conversation is in.
        currentRoom.scenario = { scenarioKey, displayName };

        console.log(
          `[scenario] room ${roomId}: scenario="${scenarioKey}" pair="${promptPair.id}" ` +
          `-> ${player1.name}=${player1GetsA ? 'A' : 'B'}, ${player2.name}=${player1GetsA ? 'B' : 'A'}`
        );
      }, SCENARIO_DELAY_MS);
    });

    socket.on('disconnect', () => {
      if (waitingSocket && waitingSocket.id === socket.id) {
        waitingSocket = null;
        console.log('[pairing] the waiting player disconnected — waiting slot cleared');
        return;
      }

      const found = rooms.findRoomForSocket(socket);
      if (found) {
        const { roomId, room } = found;
        const partner = room.players.find((p) => p.socket.id !== socket.id);
        if (partner) {
          partner.socket.emit('waiting-room:partner-left');
        }
        rooms.deleteRoom(roomId);
        console.log(`[pairing] room ${roomId} torn down — a player disconnected`);
      }
    });
  });
}

module.exports = { attachPairing };
