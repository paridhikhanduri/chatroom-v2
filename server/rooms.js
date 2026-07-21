/* ==========================================================================
   chat-room — rooms.js
   Shared in-memory room state. Pure Map, no persistence — resets on
   server restart, consistent with the rest of this project's
   "in-memory, restart-is-fine" approach (no database).

   Extracted out of pairing.js so both pairing (waiting-room matching)
   and chat (message relay) can read/write the same room data without
   either module owning it exclusively.
   ========================================================================== */

'use strict';

const rooms = new Map(); // roomId -> { players: [{ socket, name }, { socket, name }] }

function makeRoomId() {
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createRoom(players) {
  const roomId = makeRoomId();
  rooms.set(roomId, { players });
  return roomId;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function hasRoom(roomId) {
  return rooms.has(roomId);
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

function findRoomForSocket(socket) {
  for (const [roomId, room] of rooms) {
    if (room.players.some((p) => p.socket.id === socket.id)) {
      return { roomId, room };
    }
  }
  return null;
}

function getPartner(roomId, socket) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room.players.find((p) => p.socket.id !== socket.id) || null;
}

module.exports = { createRoom, getRoom, hasRoom, deleteRoom, findRoomForSocket, getPartner };
