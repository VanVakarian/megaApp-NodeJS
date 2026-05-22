import * as authController from '../auth/auth-controller.js';
import * as foodController from './food-controller.js';
import { WS_MESSAGE_TYPES } from './food-controller.js';

export async function foodRoutes(fastify) {
  // ============================================================================================= FULL UPDATE ROUTE ===
  fastify.get('/diary-full-update', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getFoodDiaryFullUpdateRange,
  });

  // ================================================================================================== DIARY ROUTES ===
  fastify.post('/diary/', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          dateISO: { type: 'string', format: 'date' },
          foodCatalogueId: { type: 'integer' },
          foodWeight: { type: 'integer' },
          history: { type: 'array' },
        },
        required: ['dateISO', 'foodCatalogueId', 'foodWeight', 'history'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.createDiaryEntry,
  });

  fastify.put('/diary', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.editDiaryEntry,
  });

  fastify.delete('/diary/:diaryId', {
    schema: {
      tags: ['food'],
      params: {
        type: 'object',
        properties: {
          diaryId: { type: 'string', pattern: '^[0-9]+$' },
        },
        required: ['diaryId'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.deleteDiaryEntry,
  });

  fastify.delete('/diary/day/:dateISO', {
    schema: {
      tags: ['food'],
      params: {
        type: 'object',
        properties: {
          dateISO: { type: 'string', format: 'date' },
        },
        required: ['dateISO'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.deleteDiaryEntriesForDay,
  });

  // ========================================================================================= MAIN CATALOGUE ROUTES ===
  fastify.get('/catalogue', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getCatalogue,
  });

  fastify.get('/catalogue/:catalogueId', {
    schema: {
      tags: ['food'],
      params: {
        type: 'object',
        properties: {
          catalogueId: { type: 'string', pattern: '^[0-9]+$' },
        },
        required: ['catalogueId'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.getCatalogueEntry,
  });

  fastify.post('/catalogue/', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          foodName: { type: 'string' },
          foodKcals: { type: 'number' },
        },
        required: ['foodName', 'foodKcals'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.createCatalogueEntry,
  });

  fastify.put('/catalogue/', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          foodId: { type: 'number' },
          foodName: { type: 'string' },
          foodKcals: { type: 'number' },
        },
        required: ['foodName', 'foodKcals'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.editCatalogueEntry,
  });

  fastify.delete('/catalogue/:catalogueId', {
    schema: {
      tags: ['food'],
      params: {
        type: 'object',
        properties: {
          catalogueId: { type: 'string', pattern: '^[0-9]+$' },
        },
        required: ['catalogueId'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.deleteCatalogueEntry,
  });

  // =========================================================================================== NEW SEMANTIC SEARCH ===
  fastify.get('/search', {
    schema: {
      tags: ['food'],
      querystring: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1 },
        },
        required: ['query'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.searchCatalogueEntries,
  });

  fastify.post('/generate-product-preview', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          description: { type: 'string', minLength: 1 },
        },
        required: ['description'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.generateProductPreview,
  });

  fastify.post('/save-product', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          kcals: { type: 'number', minimum: 0, maximum: 1000 },
          protein: { type: 'number', minimum: 0, maximum: 100 },
          fat: { type: 'number', minimum: 0, maximum: 100 },
          carbs: { type: 'number', minimum: 0, maximum: 100 },
          fiber: { type: 'number', minimum: 0, maximum: 50 },
          description: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        required: ['name', 'kcals', 'protein', 'fat', 'carbs', 'fiber', 'description'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.saveProduct,
  });

  // =========================================================================================== MULTIMODAL ANALYSIS ===
  fastify.post('/analyze-image', {
    schema: {
      tags: ['food'],
      consumes: ['multipart/form-data'],
      description: 'Analyze image to detect food products',
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.analyzeImage,
  });

  fastify.post('/analyze-voice', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          transcript: { type: 'string', minLength: 1 },
        },
        required: ['transcript'],
      },
      description: 'Analyze voice transcript to detect food products',
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.analyzeVoice,
  });

  // =========================================================================================== COEFFICIENTS ROUTES ===
  fastify.get('/coefficients', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getCoefficients,
  });

  fastify.get('/coefficients-gen', {
    schema: { tags: ['food'] },
    handler: foodController.calculateCoefficients,
  });

  // ================================================================================================= WEIGHT ROUTES ===
  fastify.post('/body-weight', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          dateISO: { type: 'string', format: 'date' },
          bodyWeight: { type: 'number' },
        },
        required: ['dateISO', 'bodyWeight'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.processWeight,
  });

  // ================================================================================================== STATS ROUTES ===
  fastify.get('/stats', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getStats,
  });
}

// ============================================================================================== WEBSOCKET HANDLERS ===

/**
 * WebSocket message handlers for food-related functionality
 * These handlers are registered with the central WebSocket system
 */
export const foodWebSocketHandlers = {
  [WS_MESSAGE_TYPES.SEARCH_QUERY]: foodController.handleSearchQuery,
};
