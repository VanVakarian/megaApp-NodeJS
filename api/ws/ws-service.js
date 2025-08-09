import { wsClients } from '../../server.js';
import * as authService from '../auth/auth-service.js';

export async function validateTokenForWebSocket(token) {
  try {
    const decoded = await authService.verifyToken(token);
    return decoded.id;
  } catch (error) {
    return null;
  }
}

export async function authenticateAndAddSocket(token, socket, clientId = null) {
  try {
    const decoded = await authService.verifyToken(token);
    const userId = decoded.id;

    if (!wsClients.has(userId)) {
      wsClients.set(userId, new Set());
    }
    wsClients.get(userId).add(socket);

    socket.userId = userId;
    socket.clientId = clientId;
    return userId;
  } catch (error) {
    return null;
  }
}

export function removeSocket(socket) {
  const userId = socket.userId;
  if (userId && wsClients.has(userId)) {
    const userSockets = wsClients.get(userId);
    userSockets.delete(socket);
    if (userSockets.size === 0) {
      wsClients.delete(userId);
    }
  }
}
