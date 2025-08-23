import * as debugController from './debug-controller.js';

export async function debugRoutes(fastify) {
  fastify.get('/ping', { schema: { tags: ['debug'] }, handler: debugController.ping });

  fastify.get('/commit-info', {
    schema: { tags: ['debug'] },
    handler: debugController.latestCommitInfo,
  });

  fastify.get('/test-llm', {
    schema: {
      tags: ['debug'],
      description: 'Test LLM service with single model',
      querystring: {
        type: 'object',
        properties: {
          description: { type: 'string' },
        },
      },
    },
    handler: debugController.testLlm,
  });

  fastify.get('/test-llm-multi', {
    schema: {
      tags: ['debug'],
      description: 'Test LLM service with multiple models in parallel',
      querystring: {
        type: 'object',
        properties: {
          description: { type: 'string' },
        },
      },
    },
    handler: debugController.testLlmMultiModel,
  });
}
