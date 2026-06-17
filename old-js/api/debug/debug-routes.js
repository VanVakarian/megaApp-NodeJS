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

  fastify.get('/run-quotes-job', {
    schema: {
      tags: ['debug'],
      description: 'Manually trigger the daily quotes fetch job',
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            upsertedCount: { type: 'number' },
            fromISO: { type: 'string' },
            toISO: { type: 'string' },
            failures: { type: 'array' },
          },
        },
      },
    },
    handler: debugController.triggerQuotesJob,
  });
}
