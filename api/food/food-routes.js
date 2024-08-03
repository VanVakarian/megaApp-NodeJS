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
