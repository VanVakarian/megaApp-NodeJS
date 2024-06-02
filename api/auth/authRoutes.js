import authController from './authController.js';

const authRoutes = async (fastify) => {
  fastify.post('/register', authController.register);
  fastify.post('/login', authController.login);
  fastify.post('/refresh', authController.refresh);
  fastify.get('/test-unprotected', authController.unprotected);
  fastify.get('/test-protected', { preValidation: [authController.authMiddleware] }, authController.protected);
};

export default authRoutes;
