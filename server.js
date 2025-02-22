import fastifyCompress from '@fastify/compress';
import fastifyJwt from '@fastify/jwt';
import staticServe from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebSocket from '@fastify/websocket';
import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';

import { setupEventHandlers } from './api/food/event-handlers.js';
import { initCache } from './api/food/stats-cache.js';
import { initDatabase } from './db/init.js';

import { authRoutes } from './api/auth/auth-routes.js';
import { backupDiaryAndWeightsData } from './api/debug/debug-controller.js';
import { debugRoutes } from './api/debug/debug-routes.js';
// import { csvToDb } from './api/debug/debug-service.js';
import { foodRoutes } from './api/food/food-routes.js';
import { settingsRoutes } from './api/settings/settings-routes.js';
import { websocketRoutes } from './api/ws/ws-routes.js';

import { APP_IP, APP_PORT, JWT_SECRET } from './env.js';
import { swaggerConfig, swaggerUiConfig } from './swagger-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await initDatabase();
await backupDiaryAndWeightsData();
// await csvToDb();

await initCache();

const server = Fastify({ logger: true });
setupEventHandlers(server);

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

server.register(staticServe, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

server.listen({ port: APP_PORT, host: APP_IP }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`server listening on ${address}`);
});
