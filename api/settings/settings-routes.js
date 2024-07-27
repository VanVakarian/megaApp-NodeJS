import * as settingsController from './settings-controller.js';
import * as authController from '../auth/auth-controller.js';

export async function settingsRoutes(fastify) {
  fastify.get(
    '/',
    { schema: { tags: ['settings'] }, preValidation: [authController.authMiddleware] },
    settingsController.getSettings
  );
  fastify.post(
    '/',
    { schema: { tags: ['settings'] }, preValidation: [authController.authMiddleware] },
    settingsController.postSettings
  );
}
