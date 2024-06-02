import authController from '../auth/authController.js';
import debugController from './debugController.js';

const debugRoutes = async (fastify) => {
  fastify.get('/ping', { preValidation: [authController.authMiddleware] }, debugController.ping);
  fastify.get('/transfer', debugController.transfer);
};

export default debugRoutes;
