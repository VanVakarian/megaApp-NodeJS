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
            description: 'Generate for first N catalogue entries without description (ignored if id is provided)',
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

  fastify.get('/generate-embeddings', {
    schema: {
      tags: ['lab'],
      description:
        'Generate embeddings (vectors) for catalogue entries without them. Generates both name and description embeddings.',
      querystring: {
        type: 'object',
        properties: {
          count: {
            type: 'integer',
            minimum: 1,
            description: 'Number of entries to generate embeddings for',
          },
        },
        required: ['count'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            result: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  name: { type: 'string' },
                  nameEmbedding: {
                    type: 'object',
                    properties: {
                      dimensions: { type: 'number' },
                      model: { type: 'string' },
                      provider: { type: 'string' },
                    },
                  },
                  descriptionEmbedding: {
                    type: 'object',
                    properties: {
                      dimensions: { type: 'number' },
                      model: { type: 'string' },
                      provider: { type: 'string' },
                    },
                  },
                  saved: { type: 'boolean' },
                  error: { type: 'string' },
                },
              },
            },
            batchInfo: {
              type: 'object',
              properties: {
                totalRequested: { type: 'number' },
                totalProcessed: { type: 'number' },
                successCount: { type: 'number' },
                failedCount: { type: 'number' },
              },
            },
          },
        },
      },
    },
    handler: labController.generateEmbeddings,
  });

  fastify.get('/generate-image', {
    schema: {
      tags: ['lab'],
      description:
        'Generate product images for catalogue entries. Can generate for a specific ID or for the next N entries without images.',
      querystring: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            minimum: 1,
            description: 'Catalogue entry ID to generate image for (IF PROVIDED, nextN IS IGNORED)',
          },
          nextN: {
            type: 'integer',
            minimum: 1,
            description: 'Generate images for first N catalogue entries without images (ignored if id is provided)',
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
                  description: 'Single image result',
                  properties: {
                    catalogueId: { type: 'number' },
                    name: { type: 'string' },
                    imageData: {
                      type: 'object',
                      properties: {
                        catalogueId: { type: 'number' },
                        thumbnailFilename: { type: 'string' },
                        originalFilename: { type: 'string' },
                        mediumFilename: { type: 'string' },
                        largeFilename: { type: 'string' },
                        generationTime: { type: 'number' },
                      },
                    },
                  },
                },
                {
                  type: 'array',
                  description: 'Batch results when using nextN parameter',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      name: { type: 'string' },
                      generated: { type: 'boolean' },
                      imageData: {
                        type: 'object',
                        properties: {
                          catalogueId: { type: 'number' },
                          thumbnailFilename: { type: 'string' },
                          originalFilename: { type: 'string' },
                          mediumFilename: { type: 'string' },
                          largeFilename: { type: 'string' },
                          generationTime: { type: 'number' },
                        },
                      },
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
            metadata: {
              type: 'object',
              properties: {
                model: { type: 'string' },
                provider: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: labController.generateImage,
  });

  fastify.get('/rebuild-image-variants', {
    schema: {
      tags: ['lab'],
      description:
        'Rebuild all image variants (thumb, medium, large, squircle, corner) from the original image. Uses the existing original file and regenerates all other formats. Can process a specific ID or batch process products missing any variants. Skips products without original files.',
      querystring: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            minimum: 1,
            description: 'Catalogue entry ID to rebuild images for (IF PROVIDED, nextN IS IGNORED)',
          },
          nextN: {
            type: 'integer',
            minimum: 1,
            description:
              'Rebuild image variants for first N products that are missing at least one variant (ignored if id is provided)',
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
                    catalogueId: { type: 'number' },
                    name: { type: 'string' },
                    variants: {
                      type: 'object',
                      properties: {
                        catalogueId: { type: 'number' },
                        version: { type: 'number' },
                        previousVersion: { type: 'number' },
                        originalFilename: { type: 'string' },
                        thumbFilename: { type: 'string' },
                        mediumFilename: { type: 'string' },
                        largeFilename: { type: 'string' },
                        squircleFilename: { type: 'string' },
                        cornerFilename: { type: 'string' },
                        totalTime: { type: 'number' },
                        thumbTime: { type: 'number' },
                        mediumTime: { type: 'number' },
                        largeTime: { type: 'number' },
                        squircleTime: { type: 'number' },
                        cornerTime: { type: 'number' },
                      },
                    },
                  },
                },
                {
                  type: 'array',
                  description: 'Batch results when using nextN parameter',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      name: { type: 'string' },
                      regenerated: { type: 'boolean' },
                      variants: {
                        type: 'object',
                        properties: {
                          catalogueId: { type: 'number' },
                          version: { type: 'number' },
                          previousVersion: { type: 'number' },
                          originalFilename: { type: 'string' },
                          thumbFilename: { type: 'string' },
                          mediumFilename: { type: 'string' },
                          largeFilename: { type: 'string' },
                          squircleFilename: { type: 'string' },
                          cornerFilename: { type: 'string' },
                          totalTime: { type: 'number' },
                        },
                      },
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
                skippedCount: { type: 'number' },
              },
            },
          },
        },
      },
    },
    handler: labController.rebuildImageVariants,
  });
}
