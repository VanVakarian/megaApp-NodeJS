import * as debugController from './debug-controller.js';

export async function debugRoutes(fastify) {
  fastify.get('/ping', { schema: { tags: ['debug'] }, handler: debugController.ping });

  fastify.get('/commit-info', {
    schema: { tags: ['debug'] },
    handler: debugController.latestCommitInfo,
  });
}
