import { HEARTBEAT_INTERVAL } from '../../env.js';
import { wsClients } from '../../server.js';
import { foodWebSocketHandlers } from '../food/food-routes.js';

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
    socket.send(JSON.stringify({ type: 'PING' }));
    // Mark as dead - will be marked alive when pong received
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
export function broadcastToUser(userId, payload, excludeClientId = null) {
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

/**
 * Broadcasts a message payload to all WebSocket clients of all users,
 *   excluding a specific client if provided.
 * Used for shared data updates that affect all users (e.g., shared catalogue entries).
 */
export function broadcastToAllUsers(payload, excludeClientId = null) {
  for (const [userId] of wsClients.entries()) {
    broadcastToUser(userId, payload, excludeClientId);
  }
}

export function getClientId(request) {
  return request.headers['x-client-id'] || null;
}

// ========================================================================================== MESSAGE HANDLER SYSTEM ===

/**
 * Central WebSocket message handler registration system
 * Collects all WebSocket handlers from different modules
 */
export function setupMessageHandlers() {
  const handlers = new Map();

  Object.entries(foodWebSocketHandlers).forEach(([messageType, handler]) => {
    handlers.set(messageType, handler);
  });

  // Future: Add other module handlers here
  // Object.entries(voiceWebSocketHandlers).forEach(([messageType, handler]) => {
  //   handlers.set(messageType, handler);
  // });
  // Object.entries(moneyWebSocketHandlers).forEach(([messageType, handler]) => {
  //   handlers.set(messageType, handler);
  // });

  return handlers;
}

/**
 * Processes incoming WebSocket message using registered handlers
 * @param {Map} handlers - Map of message handlers
 * @param {WebSocket} socket - WebSocket connection
 * @param {Object} message - Parsed incoming message
 * @param {Object} fastify - Fastify instance for logging
 */
export async function processMessage(handlers, socket, message, fastify) {
  try {
    const handler = handlers.get(message.type);

    if (handler) {
      await handler(socket, message);
    } else {
      fastify.log.warn(`Unknown WebSocket message type: ${message.type}`);
    }
  } catch (error) {
    fastify.log.error('Error processing WebSocket message:', error);
    console.error('WebSocket message processing error:', error);
  }
}
