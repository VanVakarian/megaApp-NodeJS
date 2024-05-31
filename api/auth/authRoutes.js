// api/auth/authRoutes.js
import authController from './authController.js';

const authRoutes = async (fastify) => {
  fastify.post('/register', authController.register);
  fastify.post('/login', authController.login);
  fastify.get('/test-unprotected', authController.unprotected);
  fastify.get('/test-protected', { preValidation: [authController.authMiddleware] }, authController.protected); // prettier-ignore
};

export default authRoutes;
