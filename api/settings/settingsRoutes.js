import settingsController from './settingsController.js';
import authController from '../auth/authController.js';

const settingsRoutes = async (fastify) => {
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
};

export default settingsRoutes;
