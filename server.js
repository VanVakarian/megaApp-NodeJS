import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyJwt from '@fastify/jwt';
import fastifyWebSocket from '@fastify/websocket';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import staticServe from '@fastify/static';

import initDatabase from './db/init.js';

import authRoutes from './api/auth/authRoutes.js';
import foodRoutes from './api/food/foodRoutes.js';
import debugRoutes from './api/debug/debugRoutes.js';
import settingsRoutes from './api/settings/settingsRoutes.js';
import websocketRoutes from './api/ws/wsRoutes.js';

import { APP_IP, APP_PORT, JWT_SECRET } from './env.js';
import { swaggerConfig, swaggerUiConfig } from './swagger-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

initDatabase();

const server = Fastify({ logger: true });

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

server.get('/', async (request, reply) => {
  return reply.sendFile('index.html');
});

server.listen({ port: APP_PORT, host: APP_IP }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`server listening on ${address}`);
});
