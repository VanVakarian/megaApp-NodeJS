import * as debugController from './debug-controller.js';

export async function debugRoutes(fastify) {
  fastify.get('/ping', { schema: { tags: ['debug'] }, handler: debugController.ping });

  fastify.get('/restore', { schema: { tags: ['debug'] }, handler: debugController.restore });

  // fastify.post('/chrextest', { schema: { tags: ['debug'] } }, debugController.chrextest);
}
