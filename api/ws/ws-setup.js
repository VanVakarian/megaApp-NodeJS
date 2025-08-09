import { HEARTBEAT_INTERVAL } from '../../env.js';
import { wsClients } from '../../server.js';

let heartbeatInterval = null;

export function startWebSocketHeartbeat() {
  heartbeatInterval = setInterval(() => {
    checkAllConnectionsHealth();
  }, HEARTBEAT_INTERVAL);
}

/**
 * Checks the health of all WebSocket connections for each user.
 * Iterates through all user sockets, sending a ping to each socket.
 * If a socket is dead or fails to respond to the ping, it is terminated and removed.
 * Cleans up dead sockets for each user after the check.
 */
function checkAllConnectionsHealth() {
  for (const [userId, sockets] of wsClients.entries()) {
    const deadSockets = new Set();

    for (const socket of sockets) {
      if (isSocketDead(socket)) {
        terminateDeadSocket(socket, deadSockets);
        continue;
      }

      if (!sendPingToSocket(socket)) {
        terminateDeadSocket(socket, deadSockets);
      }
    }

    removeDeadUserSockets(userId, sockets, deadSockets);
  }
}

/**
 * Checks if a WebSocket connection is considered dead.
 */
function isSocketDead(socket) {
  // Socket didn't respond to previous ping within heartbeat interval
  return !socket.isAlive;
}

/**
 * Terminates a WebSocket connection and adds it to the set of dead sockets.
 */
function terminateDeadSocket(socket, deadSockets) {
  socket.terminate();
  deadSockets.add(socket);
}

/**
 * Sends a ping message to the specified WebSocket and marks it as awaiting a pong response.
 */
function sendPingToSocket(socket) {
  try {
    socket.send(JSON.stringify({ type: 'ping' }));
    // Mark as "waiting for pong" - will be marked alive when pong received
    socket.isAlive = false;
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Removes dead WebSocket connections from a user's set of sockets
 * and cleans up the user if no active connections remain.
 */
function removeDeadUserSockets(userId, sockets, deadSockets) {
  for (const socket of deadSockets) {
    sockets.delete(socket);
  }

  if (sockets.size === 0) {
    wsClients.delete(userId);
  }
}

export async function closeAllWebSocketConnections() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  for (const [userId, sockets] of wsClients.entries()) {
    for (const socket of sockets) {
      socket.close(1001, 'Server shutting down');
    }
  }
  wsClients.clear();
}

/**
 * Broadcasts a message payload to all WebSocket clients associated with a user,
 *   excluding a specific client if provided.
 * Removes dead or failed sockets from the set.
 */
export function broadcast(userId, payload, excludeClientId = null) {
  const userSockets = wsClients.get(userId);
  if (!userSockets) return;

  const message = JSON.stringify(payload);
  const socketsToRemove = new Set();

  for (const socket of userSockets) {
    // Removing dead sockets
    if (socket.readyState !== 1) {
      socketsToRemove.add(socket);
      continue;
    }

    // Skipping sender's socket to prevent echo broadcast
    if (socket.clientId === excludeClientId) continue;

    try {
      socket.send(message);
    } catch (error) {
      // Marking failed sockets for removal
      socketsToRemove.add(socket);
    }
  }

  for (const socket of socketsToRemove) {
    userSockets.delete(socket);
  }

  // Removing empty user socket sets
  if (userSockets.size === 0) {
    wsClients.delete(userId);
  }
}

export function getClientId(request) {
  return request.headers['x-client-id'] || null;
}
