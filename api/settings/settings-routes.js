import * as authController from '../auth/auth-controller.js';
import * as settingsController from './settings-controller.js';

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
