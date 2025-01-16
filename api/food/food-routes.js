import * as authController from '../auth/auth-controller.js';
import * as foodController from './food-controller.js';

export async function foodRoutes(fastify) {
  //                                                           FULL UPDATE ROUTE
  fastify.get('/diary-full-update', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getFoodDiaryFullUpdateRange,
  });

  //                                                                DIARY ROUTES
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

  //                                                       MAIN CATALOGUE ROUTES
  fastify.get('/catalogue', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getCatalogue,
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

  //                                                       USER CATALOGUE ROUTES
  fastify.get('/user-catalogue', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getMyCatalogue,
  });

  fastify.put('/user-catalogue/pick/', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          foodId: { type: 'number' },
        },
        required: ['foodId'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.pickUserCatalogueEntry,
  });

  fastify.put('/user-catalogue/dismiss/', {
    schema: {
      tags: ['food'],
      body: {
        type: 'object',
        properties: {
          foodId: { type: 'number' },
        },
        required: ['foodId'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.dismissUserCatalogueEntry,
  });

  //                                                         COEFFICIENTS ROUTES
  fastify.get('/coefficients', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getCoefficients,
  });

  //                                                               WEIGHT ROUTES
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

  //                                                                STATS ROUTES
  fastify.get('/stats', {
    schema: {
      tags: ['food'],
      querystring: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
        },
        required: ['date'],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.getStats,
  });
}
