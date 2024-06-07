import { wsService } from './wsService.js';

const websocketRoutes = async (fastify) => {
  fastify.get('/', { websocket: true }, (socket, req) => {
    let userId;

    socket.on('message', async (message) => {
      const incomingMessage = JSON.parse(message.toString());

      if (typeof incomingMessage === 'object' && Object.keys(incomingMessage).length > 0) {
        const key = Object.keys(incomingMessage)[0];

        if (key === 'auth') {
          userId = await wsService.addSocketToClient(incomingMessage[key], socket);
        } else if (!wsService.isSocketInUserList(userId, socket)) {
          socket.send(JSON.stringify({ message: 'token-needed' }));
        } else if (incomingMessage[key] === 'ping') {
          socket.send(JSON.stringify({ message: 'pong' }));
        }
      }
    });

    socket.on('close', (code, reason) => {
      console.log(`WebSocket connection closed: code=${code}, reason=${reason}`);
      wsService.removeSocket(userId, socket);
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsService.removeSocket(userId, socket);
    });
  });
};

export default websocketRoutes;
