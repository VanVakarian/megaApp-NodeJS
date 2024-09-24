import * as authController from '../auth/auth-controller.js';
import * as foodController from './food-controller.js';

export async function foodRoutes(fastify) {
  fastify.get('/diary-full-update', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getFoodDiaryFullUpdateRange,
  });

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
    handler: foodController.addUserCatalogueEntry,
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
    handler: foodController.editUserCatalogueEntry,
  });

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

  fastify.post('/', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.postFood,
  });

  fastify.put('/diary', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.editDiaryEntry,
  });
}
