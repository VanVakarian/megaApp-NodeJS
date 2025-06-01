import * as authController from '../auth/auth-controller.js';
import * as moneyController from './money-controller.js';

export async function moneyRoutes(fastify) {
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
}
