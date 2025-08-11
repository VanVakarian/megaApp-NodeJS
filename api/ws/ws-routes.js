import * as wsService from './ws-service.js';

export async function websocketRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    const token = request.query.token || request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      await reply.code(401).send({ error: 'Token required' });
      return;
    }

    const userId = await wsService.validateTokenForWebSocket(token);
    if (!userId) {
      await reply.code(401).send({ error: 'Invalid token' });
      return;
    }

    request.userId = userId;
  });

  fastify.get('/', { schema: { tags: ['ws'] }, websocket: true }, (socket, req) => {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    const clientId = req.query.clientId || req.headers['x-client-id'];
    wsService.authenticateAndAddSocket(token, socket, clientId);

    socket.isAlive = true;

    socket.on('message', async (message) => {
      try {
        const incomingMessage = JSON.parse(message.toString());

        if (incomingMessage.type === 'PONG') {
          socket.isAlive = true;
        }
      } catch (error) {
        fastify.log.error('Error processing WebSocket message:', error);
      }
    });

    socket.on('close', (code, reason) => {
      fastify.log.info(`WebSocket connection closed: code=${code}, reason=${reason}`);
      wsService.removeSocket(socket);
    });

    socket.on('error', (error) => {
      fastify.log.error('WebSocket error:', error);
      wsService.removeSocket(socket);
    });
  });
}
