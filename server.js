import fastifyCompress from '@fastify/compress';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebSocket from '@fastify/websocket';
import Fastify from 'fastify';
import cron from 'node-cron';
import { authRoutes } from './api/auth/auth-routes.js';
import { debugRoutes } from './api/debug/debug-routes.js';
import { setupEventHandlers } from './api/food/event-handlers.js';
import { foodRoutes } from './api/food/food-routes.js';
import { initCache } from './api/food/stats-cache.js';
import { moneyRoutes } from './api/money/money-routes.js';
import { settingsRoutes } from './api/settings/settings-routes.js';
import { websocketRoutes } from './api/ws/ws-routes.js';
import { startCoefficientsCalculation } from './coefficients/coeffs-service.js';
import { initDatabase } from './db/init.js';
import { APP_IP, APP_PORT, CRON_SCHEDULE, DEV_MODE, JWT_SECRET } from './env.js';
import { loggingHooks } from './logger/logger.js';
import { performBackup } from './s3-backup-service.js';
import { swaggerConfig, swaggerUiConfig } from './swagger-config.js';

if (DEV_MODE) {
  await initDatabase();
}

await initCache();
await performBackup();

cron.schedule(CRON_SCHEDULE.COEFFS, async () => {
  await startCoefficientsCalculation();
});

cron.schedule(CRON_SCHEDULE.BACKUP, async () => {
  await performBackup();
});

const server = Fastify({ logger: true });

setupEventHandlers(server);

server.addHook('onRequest', loggingHooks.onRequest);
server.addHook('onResponse', loggingHooks.onResponse);
server.addHook('onError', loggingHooks.onError);

server.register(fastifyCompress);
server.register(fastifyJwt, { secret: JWT_SECRET });
server.register(fastifyWebSocket, { options: { maxPayload: 1048576 } });

server.register(fastifySwagger, swaggerConfig);
server.register(fastifySwaggerUi, swaggerUiConfig);

server.register(authRoutes, { prefix: '/api/auth' });
server.register(foodRoutes, { prefix: '/api/food' });
server.register(moneyRoutes, { prefix: '/api/money' });
server.register(debugRoutes, { prefix: '/api/debug' });
server.register(settingsRoutes, { prefix: '/api/settings' });
server.register(websocketRoutes, { prefix: '/api/ws' });

export const wsClients = new Map();

server.listen({ port: APP_PORT, host: APP_IP }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`server listening on ${address}`);
});
