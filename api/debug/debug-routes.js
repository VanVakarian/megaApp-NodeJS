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

  fastify.get('/catalogue-list', {
    schema: {
      tags: ['debug'],
      description: 'List all catalogue entries with enrichment status',
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            stats: { type: 'object' },
            entries: { type: 'array' },
          },
        },
      },
    },
    handler: debugController.listCatalogueEntries,
  });

  fastify.get('/enrich-catalogue', {
    schema: {
      tags: ['debug'],
      description: 'Auto-select and enrich first catalogue entry without description',
      querystring: {
        type: 'object',
        properties: {
          threshold: { type: 'number', description: 'Outlier detection threshold percentage (default: 75)' },
          count: { type: 'number', description: 'Number of entries to enrich in sequence (default: 1)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            catalogueEntry: { type: 'object' },
            llmResults: { type: 'object' },
          },
        },
      },
    },
    handler: debugController.enrichCatalogueEntries,
  });

  fastify.get('/enrich-catalogue/:id', {
    schema: {
      tags: ['debug'],
      description: 'Enrich catalogue entry with LLM data by specific ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          threshold: { type: 'number', description: 'Outlier detection threshold percentage (default: 75)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            catalogueEntry: { type: 'object' },
            llmResults: { type: 'object' },
          },
        },
      },
    },
    handler: debugController.enrichCatalogueEntries,
  });

  fastify.get('/rate-limits', {
    schema: {
      tags: ['debug'],
      description: 'Check OpenRouter API rate limits and usage',
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
    handler: debugController.checkRateLimits,
  });

  fastify.get('/enrich-embeddings', {
    schema: {
      tags: ['debug'],
      description: 'Auto-select and enrich first catalogue entry without embedding (OpenAI provider)',
      querystring: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of entries to enrich with embeddings (default: 1, max: 50)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            catalogueEntry: { type: 'object' },
            embeddingResult: { type: 'object' },
          },
        },
      },
    },
    handler: debugController.enrichCatalogueEmbeddings,
  });

  fastify.get('/enrich-embeddings/:id', {
    schema: {
      tags: ['debug'],
      description: 'Enrich catalogue entry with embedding by specific ID (OpenAI provider)',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            catalogueEntry: { type: 'object' },
            embeddingResult: { type: 'object' },
          },
        },
      },
    },
    handler: debugController.enrichCatalogueEmbeddings,
  });

  fastify.get('/search-embeddings', {
    schema: {
      tags: ['debug'],
      description: 'Search catalogue entries by text query using embeddings',
      querystring: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text query to search for similar catalogue entries' },
        },
        required: ['query'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            query: { type: 'string' },
            totalResults: { type: 'number' },
            embeddingInfo: { type: 'object' },
            results: { type: 'array' },
          },
        },
      },
    },
    handler: debugController.searchByEmbedding,
  });
}
