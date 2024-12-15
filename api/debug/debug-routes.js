import * as debugController from './debug-controller.js';

export async function debugRoutes(fastify) {
  fastify.get('/ping', { schema: { tags: ['debug'] }, handler: debugController.ping });

  fastify.get('/transfer/:oldUserId', {
    schema: {
      tags: ['debug'],
      params: {
        type: 'object',
        properties: {
          oldUserId: { type: 'number' },
        },
        required: ['oldUserId'],
      },
    },
    // preValidation: [authController.authMiddleware],
    handler: debugController.transfer,
  });

  // fastify.post('/chrextest', { schema: { tags: ['debug'] } }, debugController.chrextest);
}
