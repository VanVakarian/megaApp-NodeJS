import { HEARTBEAT_INTERVAL } from '../../env.js';
import { wsClients } from '../../server.js';

export function broadcast(userId, payload, excludeClientId = null) {
  const userSockets = wsClients.get(userId);
  if (userSockets) {
    const message = JSON.stringify(payload);
    for (const socket of userSockets) {
      try {
        if (socket.readyState === 1 && socket.clientId !== excludeClientId) {
          socket.send(message);
        } else {
          userSockets.delete(socket);
        }
      } catch (error) {
        console.error('Failed to send message to socket:', error);
        userSockets.delete(socket);
      }
    }
    if (userSockets.size === 0) {
      wsClients.delete(userId);
    }
  }
}

export function getClientId(request) {
  return request.headers['x-client-id'] || null;
}

let heartbeatInterval = null;

export function startWebSocketHeartbeat() {
  heartbeatInterval = setInterval(() => {
    for (const [userId, sockets] of wsClients.entries()) {
      for (const socket of sockets) {
        if (!socket.isAlive) {
          socket.terminate();
          sockets.delete(socket);
          continue;
        }
        socket.isAlive = false;
        try {
          socket.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('Failed to send ping to socket:', error);
          socket.terminate();
          sockets.delete(socket);
        }
      }
      if (sockets.size === 0) {
        wsClients.delete(userId);
      }
    }
  }, HEARTBEAT_INTERVAL);
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
