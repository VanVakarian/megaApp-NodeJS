import * as authController from '../auth/auth-controller.js';
import * as moneyController from './money-controller.js';
import {
  accountSchemas,
  categorySchemas,
  currencySchemas,
  rateHistorySchemas,
  transactionSchemas,
} from './money-swagger.js';

export async function moneyRoutes(fastify) {
  //                                                          ~~~ CURRENCIES ~~~
  fastify.get('/currencies', {
    schema: currencySchemas.getCurrencies,
    preValidation: [authController.authMiddleware],
    handler: moneyController.getCurrencies,
  });

  fastify.post('/currencies', {
    schema: currencySchemas.createCurrency,
    preValidation: [authController.authMiddleware],
    handler: moneyController.createCurrency,
  });

  fastify.put('/currencies/:id', {
    schema: currencySchemas.updateCurrency,
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateCurrency,
  });

  fastify.delete('/currencies/:id', {
    schema: currencySchemas.deleteCurrency,
    preValidation: [authController.authMiddleware],
    handler: moneyController.deleteCurrency,
  });

  //                                                          ~~~ CATEGORIES ~~~
  fastify.get('/categories', {
    schema: categorySchemas.getCategories,
    preValidation: [authController.authMiddleware],
    handler: moneyController.getCategories,
  });

  fastify.post('/categories', {
    schema: categorySchemas.createCategory,
    preValidation: [authController.authMiddleware],
    handler: moneyController.createCategory,
  });

  fastify.put('/categories/:id', {
    schema: categorySchemas.updateCategory,
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateCategory,
  });

  fastify.delete('/categories/:id', {
    schema: categorySchemas.deleteCategory,
    preValidation: [authController.authMiddleware],
    handler: moneyController.deleteCategory,
  });

  //                                                            ~~~ ACCOUNTS ~~~

  fastify.get('/accounts', {
    schema: accountSchemas.getAccounts,
    preValidation: [authController.authMiddleware],
    handler: moneyController.getAccounts,
  });

  fastify.post('/accounts', {
    schema: accountSchemas.createAccount,
    preValidation: [authController.authMiddleware],
    handler: moneyController.createAccount,
  });

  fastify.put('/accounts/:id', {
    schema: accountSchemas.updateAccount,
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateAccount,
  });

  fastify.delete('/accounts/:id', {
    schema: accountSchemas.deleteAccount,
    preValidation: [authController.authMiddleware],
    handler: moneyController.deleteAccount,
  });

  //                                                        ~~~ TRANSACTIONS ~~~

  fastify.get('/transactions', {
    schema: transactionSchemas.getTransactions,
    preValidation: [authController.authMiddleware],
    compress: false,
    handler: moneyController.getTransactions,
  });

  fastify.get('/rate-history', {
    schema: rateHistorySchemas.getRateHistory,
    preValidation: [authController.authMiddleware],
    handler: moneyController.getRateHistory,
  });

  fastify.post('/transactions', {
    schema: transactionSchemas.createTransaction,
    preValidation: [authController.authMiddleware],
    handler: moneyController.createTransaction,
  });

  fastify.put('/transactions/:id', {
    schema: transactionSchemas.updateTransaction,
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateTransaction,
  });

  fastify.delete('/transactions/:id', {
    schema: transactionSchemas.deleteTransaction,
    preValidation: [authController.authMiddleware],
    handler: moneyController.deleteTransaction,
  });
}
