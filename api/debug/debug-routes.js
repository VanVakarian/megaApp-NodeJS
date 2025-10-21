import * as debugController from './debug-controller.js';

export async function debugRoutes(fastify) {
  fastify.get('/ping', { schema: { tags: ['debug'] }, handler: debugController.ping });

  fastify.get('/commit-info', {
    schema: { tags: ['debug'] },
    handler: debugController.latestCommitInfo,
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

  fastify.get('/export-catalogue', {
    schema: {
      tags: ['debug'],
      description: 'Export all food catalogue entries to JSON backup file',
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            filename: { type: 'string' },
            filePath: { type: 'string' },
            totalEntries: { type: 'number' },
            timestamp: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: debugController.exportCatalogueToBackup,
  });

  fastify.post('/import-catalogue', {
    schema: {
      tags: ['debug'],
      description: 'Import food catalogue entries from JSON backup file (replaces all existing entries)',
      body: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Name of the backup file in backups/ directory' },
        },
        required: ['filename'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            filename: { type: 'string' },
            totalEntriesInBackup: { type: 'number' },
            deletedCount: { type: 'number' },
            importedCount: { type: 'number' },
            skippedCount: { type: 'number' },
            timestamp: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: debugController.importCatalogueFromBackup,
  });

  fastify.get('/test-image-generation/:id', {
    schema: {
      tags: ['debug'],
      description: 'Test image generation for catalogue entry using OpenRouter or Naga provider',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['openrouter', 'naga'],
            description: 'Image generation provider to test (openrouter or naga)',
          },
        },
        required: ['provider'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            catalogueEntry: { type: 'object' },
            provider: { type: 'string' },
            model: { type: 'string' },
            prompt: { type: 'string' },
            imageFilePath: { type: 'string' },
            relativeUrl: { type: 'string' },
            generationTime: { type: 'number' },
            error: { type: 'string' },
          },
        },
      },
    },
    handler: debugController.testImageGeneration,
  });
}
