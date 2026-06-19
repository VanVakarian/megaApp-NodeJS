import { WS_MESSAGE_TYPES } from '../food/food-controller.js';
import * as wsService from './ws-service.js';
import { processMessage, setupMessageHandlers } from './ws-setup.js';

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

    const messageHandlers = setupMessageHandlers();

    socket.on('message', async (message) => {
      try {
        const incomingMessage = JSON.parse(message.toString());

        switch (incomingMessage.type) {
          case 'PONG':
            socket.isAlive = true;
            break;

          case WS_MESSAGE_TYPES.START_VOICE_RECORDING:
            fastify.log.info(`Voice recording started for user ${socket.userId}`);
            console.log('Voice recording session started:', {
              userId: socket.userId,
              clientId: socket.clientId,
              timestamp: new Date().toISOString(),
            });
            break;

          case WS_MESSAGE_TYPES.STOP_VOICE_RECORDING:
            fastify.log.info(`Voice recording stopped for user ${socket.userId}`);
            console.log('Voice recording session stopped:', {
              userId: socket.userId,
              clientId: socket.clientId,
              timestamp: new Date().toISOString(),
            });
            break;

          case WS_MESSAGE_TYPES.AUDIO_CHUNK:
            console.log('Audio chunk received:', {
              userId: socket.userId,
              clientId: socket.clientId,
              chunkSize: incomingMessage.data ? incomingMessage.data.length : 0,
              sequence: incomingMessage.sequence || 'unknown',
              timestamp: new Date().toISOString(),
            });
            break;

          default:
            await processMessage(messageHandlers, socket, incomingMessage, fastify);
            break;
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
