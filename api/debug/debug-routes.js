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

  fastify.get('/test-prompts/:id', {
    schema: {
      tags: ['debug'],
      description: 'Matrix test: 6 food generation prompts × N models on a specific catalogue entry',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            catalogueEntry: { type: 'object' },
            matrixConfig: { type: 'object' },
            summary: { type: 'object' },
            promptStats: { type: 'object' },
            modelStats: { type: 'object' },
            results: { type: 'array' },
            saveInfo: { type: 'object' },
          },
        },
      },
    },
    handler: debugController.testPrompts,
  });

  fastify.get('/test-prompts-parallel/:id', {
    schema: {
      tags: ['debug'],
      description: 'Parallel matrix test: 6 food generation prompts × N models with configurable concurrency',
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
          parallelism: { type: 'number', description: 'Number of concurrent requests (default: 3, max: 10)' },
          delay: { type: 'number', description: 'Delay between request starts in ms (default: 100)' },
          staggered: { type: 'string', description: 'Enable staggered start for load balancing (default: true)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            catalogueEntry: { type: 'object' },
            matrixConfig: { type: 'object' },
            summary: { type: 'object' },
            promptStats: { type: 'object' },
            modelStats: { type: 'object' },
            results: { type: 'array' },
            saveInfo: { type: 'object' },
          },
        },
      },
    },
    handler: debugController.testPromptsParallel,
  });

  fastify.get('/enrich-catalogue-names', {
    schema: {
      tags: ['debug'],
      description: 'Enrich catalogue entries with new names and descriptions, targeting entries with empty embedding',
      querystring: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of entries to enrich in sequence (default: 1, max: 100)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            batchProcessing: { type: 'boolean' },
            processedCount: { type: 'number' },
            requestedCount: { type: 'number' },
            results: { type: 'array' },
          },
        },
      },
    },
    handler: debugController.enrichCatalogueNames,
  });

  fastify.get('/enrich-catalogue-names/:id', {
    schema: {
      tags: ['debug'],
      description: 'Enrich specific catalogue entry with new name and description by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            catalogueEntry: { type: 'object' },
            enrichmentResult: { type: 'object' },
            error: { type: 'string' },
            markedAsConflicted: { type: 'boolean' },
          },
        },
      },
    },
    handler: debugController.enrichCatalogueNameById,
  });
}
