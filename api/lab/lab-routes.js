import * as labController from './lab-controller.js';

export async function labRoutes(fastify) {
  fastify.get('/generate-product', {
    schema: {
      tags: ['lab'],
      description:
        'Generate product name, description and nutrition data from food description or catalogue ID. Optionally save to database.',
      querystring: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            minLength: 1,
            description: 'Food description text (IF PROVIDED, ALL OTHER PARAMETERS ARE IGNORED)',
          },
          id: { type: 'integer', minimum: 1, description: 'Catalogue entry ID from database' },
          nextN: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            description:
              'Generate for first N catalogue entries without description (ignored if id is provided). Default: 10',
          },
          useKcals: {
            type: 'boolean',
            description: 'Include calorie information in the product description (when generating from ID)',
          },
          isToBeSaved: {
            type: 'boolean',
            description: 'Save generated data to database (when generating from ID). Current name becomes legacy name.',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            data: {
              oneOf: [
                {
                  type: 'object',
                  description: 'Single product result',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    kcals: { type: 'number' },
                    protein: { type: 'number' },
                    fat: { type: 'number' },
                    carbs: { type: 'number' },
                    fiber: { type: 'number' },
                  },
                },
                {
                  type: 'array',
                  description: 'Batch results when using nextN parameter',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      generated: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          description: { type: 'string' },
                          kcals: { type: 'number' },
                          protein: { type: 'number' },
                          fat: { type: 'number' },
                          carbs: { type: 'number' },
                          fiber: { type: 'number' },
                        },
                      },
                      saved: { type: 'boolean' },
                      error: { type: 'string' },
                    },
                  },
                },
              ],
            },
            batchInfo: {
              type: 'object',
              description: 'Information about batch operation',
              properties: {
                totalRequested: { type: 'number' },
                totalProcessed: { type: 'number' },
                successCount: { type: 'number' },
                failedCount: { type: 'number' },
              },
            },
            saved: { type: 'boolean', description: 'Whether data was saved to database' },
            previousData: {
              type: 'object',
              description: 'Original data before update (only when saved=true)',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                legacyName: { type: 'string' },
                kcals: { type: 'number' },
              },
            },
            metadata: {
              type: 'object',
              properties: {
                model: { type: 'string' },
                provider: { type: 'string' },
                responseTime: { type: 'number' },
              },
            },
          },
        },
      },
    },
    handler: labController.generateProduct,
  });
}
