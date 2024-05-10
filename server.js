import Fastify from 'fastify';
import path from 'node:path';
import staticServe from '@fastify/static';
import { APP_IP, APP_PORT } from './config.js';

// const authRoutes = await import('./api/auth');
// const foodRoutes = await import('./api/food');
// const moneyRoutes = await import('./api/money');

const server = Fastify({ logger: true });

// server.register(authRoutes.default, { prefix: '/api/auth' });
// server.register(foodRoutes.default, { prefix: '/api/food' });
// server.register(moneyRoutes.default, { prefix: '/api/money' });

server.register(staticServe, {
  root: path.join(process.cwd(), 'public'),
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
