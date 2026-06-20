import * as authController from './auth-controller.js';

export async function authRoutes(fastify) {
  fastify.post('/register', { schema: { tags: ['auth'] } }, authController.register);
  fastify.post('/login', { schema: { tags: ['auth'] } }, authController.login);
  fastify.post('/refresh', { schema: { tags: ['auth'] } }, authController.refresh);
  // fastify.get('/test-unprotected', { schema: { tags: ['auth'] } }, authController.unprotected);
  // fastify.get( '/test-protected', { schema: { tags: ['auth'] }, preValidation: [authController.authMiddleware] }, authController._protected);
}
