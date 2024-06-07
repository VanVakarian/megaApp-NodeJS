import { wsClients } from '../../server.js';
import authService from '../auth/authService.js';

export const debugLogWsClientsAmt = () => {
  const summary = Array.from(wsClients.entries()).map(([id, sockets]) => ({ id, clients: sockets.length }));
  console.log('Current wsClients:', summary);
};

export const wsService = {
  async addSocketToClient(token, socket) {
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
  },

  removeSocket(userId, socket) {
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
  },

  isSocketInUserList(userId, socket) {
    if (userId && wsClients.has(userId)) {
      return wsClients.get(userId).includes(socket);
    }
    return false;
  },
};
