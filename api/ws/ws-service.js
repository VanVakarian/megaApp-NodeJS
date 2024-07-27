import { wsClients } from '../../server.js';
import * as authService from '../auth/auth-service.js';

// export function debugLogWsClientsAmt() {
//   const summary = Array.from(wsClients.entries()).map(([id, sockets]) => ({ id, clients: sockets.length }));
//   console.log('Current wsClients:', summary);
// }

export async function addSocketToClient(token, socket) {
  const decoded = await authService.verifyToken(token);
  if (decoded) {
    const userId = decoded.id;
    if (!wsClients.has(userId)) {
      wsClients.set(userId, []);
    }
    wsClients.get(userId).push(socket);
    return userId;
  }
  return null;
}

export function removeSocket(userId, socket) {
  if (userId && wsClients.has(userId)) {
    const sockets = wsClients.get(userId);
    const socketIndex = sockets.indexOf(socket);
    if (socketIndex !== -1) {
      sockets.splice(socketIndex, 1);
    }
    if (sockets.length === 0) {
      wsClients.delete(userId);
    }
  }
}

export function isSocketInUserList(userId, socket) {
  if (userId && wsClients.has(userId)) {
    return wsClients.get(userId).includes(socket);
  }
  return false;
}
