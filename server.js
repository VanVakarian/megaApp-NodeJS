import fastifyCompress from '@fastify/compress';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebSocket from '@fastify/websocket';
import Fastify from 'fastify';
import cron from 'node-cron';
import { join } from 'path';
import { initializeImageCache } from './api/ai/image-cache.js';
import { authRoutes } from './api/auth/auth-routes.js';
import { debugRoutes } from './api/debug/debug-routes.js';
import { setupEventHandlers } from './api/food/event-handlers.js';
import { foodRoutes } from './api/food/food-routes.js';
import { initCache } from './api/food/stats-cache.js';
import { moneyRoutes } from './api/money/money-routes.js';
import { settingsRoutes } from './api/settings/settings-routes.js';
import { websocketRoutes } from './api/ws/ws-routes.js';
import {
  broadcastToAllUsers,
  broadcastToUser,
  closeAllWebSocketConnections,
  getClientId,
  startWebSocketHeartbeat,
} from './api/ws/ws-setup.js';
import { startCoefficientsCalculation } from './coefficients/coeffs-service.js';
import { initDatabase } from './db/init.js';
import { APP_IP, APP_PORT, CRON_SCHEDULE, DEV_MODE, JWT_SECRET } from './env.js';
import { loggingHooks } from './logger/logger.js';
import { performBackup } from './s3-backup-service.js';
import { swaggerConfig, swaggerCorsConfig, swaggerUiConfig } from './swagger-config.js';

if (DEV_MODE) {
  await initDatabase();
}

await initCache();
initializeImageCache();

cron.schedule(CRON_SCHEDULE.COEFFS, async () => {
  await startCoefficientsCalculation();
});

cron.schedule(CRON_SCHEDULE.BACKUP, async () => {
  await performBackup();
});

const server = Fastify({ logger: true });

export const wsClients = new Map();
export const userDataLastModified = new Map();

setupEventHandlers(server);

server.decorate('broadcastToUser', broadcastToUser);
server.decorate('broadcastToAllUsers', broadcastToAllUsers);
server.decorate('getClientId', getClientId);

startWebSocketHeartbeat();

server.addHook('onRequest', loggingHooks.onRequest);
server.addHook('onResponse', loggingHooks.onResponse);
server.addHook('onError', loggingHooks.onError);
server.addHook('onClose', closeAllWebSocketConnections);

server.register(fastifyCompress);
server.register(fastifyJwt, { secret: JWT_SECRET });
server.register(fastifyWebSocket, { options: { maxPayload: 1048576 } });
server.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

server.register(fastifySwagger, swaggerConfig);
server.register(fastifySwaggerUi, swaggerUiConfig);
server.register(fastifyCors, swaggerCorsConfig);

server.register(authRoutes, { prefix: '/api/auth' });
server.register(foodRoutes, { prefix: '/api/food' });
server.register(moneyRoutes, { prefix: '/api/money' });
server.register(debugRoutes, { prefix: '/api/debug' });
server.register(settingsRoutes, { prefix: '/api/settings' });
server.register(websocketRoutes, { prefix: '/api/ws' });

server.register(fastifyStatic, {
  root: join(process.cwd(), 'public'),
  prefix: '/api',
  decorateReply: false,
});

server.listen({ port: APP_PORT, host: APP_IP }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`server listening on ${address}`);
});
