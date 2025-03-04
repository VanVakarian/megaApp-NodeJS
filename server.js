import fastifyCompress from '@fastify/compress';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebSocket from '@fastify/websocket';
import Fastify from 'fastify';
import cron from 'node-cron';

import { initCache } from './api/food/stats-cache.js';
import { initDatabase } from './db/init.js';

import { APP_IP, APP_PORT, JWT_SECRET } from './env.js';
import { swaggerConfig, swaggerUiConfig } from './swagger-config.js';

import { setupEventHandlers } from './api/food/event-handlers.js';

import { loggingHooks } from './logger/logger.js';

import { authRoutes } from './api/auth/auth-routes.js';
import { backupDiaryAndWeightsData } from './api/debug/debug-controller.js';
import { debugRoutes } from './api/debug/debug-routes.js';
import { foodRoutes } from './api/food/food-routes.js';
import { settingsRoutes } from './api/settings/settings-routes.js';
import { websocketRoutes } from './api/ws/ws-routes.js';
import { startCoefficientsCalculation } from './coefficients/coeffs-service.js';

await initDatabase();
await backupDiaryAndWeightsData();

await initCache();

//  Every day at 1 AM GMT
cron.schedule('00 01 * * *', async () => {
  console.log('Running coefficient calculation for all users...');
  await startCoefficientsCalculation();
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
