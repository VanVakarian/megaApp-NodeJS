import * as authController from '../auth/auth-controller.js';
import * as moneyController from './money-controller.js';

export async function moneyRoutes(fastify) {
  // ==================================================================================================== CURRENCIES ===

  fastify.get('/currencies', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.getCurrencies,
  });

  fastify.post('/currencies', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.createCurrency,
  });

  fastify.put('/currencies/:id', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateCurrency,
  });

  fastify.delete('/currencies/:id', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.deleteCurrency,
  });

  // ==================================================================================================== CATEGORIES ===

  fastify.get('/categories', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.getCategories,
  });

  fastify.post('/categories', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.createCategory,
  });

  fastify.put('/categories/:id', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateCategory,
  });

  fastify.delete('/categories/:id', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.deleteCategory,
  });

  fastify.put('/categories/group-key', {
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateGroupKey,
  });
}
