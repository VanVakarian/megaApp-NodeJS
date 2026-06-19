import * as authController from '../auth/auth-controller.js';
import * as moneyController from './money-controller.js';
import {
  accountSchemas,
  assetSchemas,
  categorySchemas,
  currencySchemas,
  organizationSchemas,
  rateHistorySchemas,
  transactionSchemas,
} from './money-swagger.js';

export async function moneyRoutes(fastify) {
  //                                                      ~~~ ORGANIZATIONS ~~~
  fastify.get('/organizations', {
    schema: organizationSchemas.getOrganizations,
    preValidation: [authController.authMiddleware],
    compress: false,
    handler: moneyController.getOrganizations,
  });

  fastify.post('/organizations', {
    schema: organizationSchemas.createOrganization,
    preValidation: [authController.authMiddleware],
    handler: moneyController.createOrganization,
  });

  fastify.put('/organizations/:id', {
    schema: organizationSchemas.updateOrganization,
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateOrganization,
  });

  fastify.delete('/organizations/:id', {
    schema: organizationSchemas.deleteOrganization,
    preValidation: [authController.authMiddleware],
    handler: moneyController.deleteOrganization,
  });

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
    compress: false,
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
    compress: false,
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

  //                                                              ~~~ ASSETS ~~~

  fastify.get('/assets', {
    schema: assetSchemas.getAssets,
    preValidation: [authController.authMiddleware],
    compress: false,
    handler: moneyController.getAssets,
  });

  fastify.post('/assets', {
    schema: assetSchemas.createAsset,
    preValidation: [authController.authMiddleware],
    handler: moneyController.createAsset,
  });

  fastify.put('/assets/:id', {
    schema: assetSchemas.updateAsset,
    preValidation: [authController.authMiddleware],
    handler: moneyController.updateAsset,
  });

  fastify.delete('/assets/:id', {
    schema: assetSchemas.deleteAsset,
    preValidation: [authController.authMiddleware],
    handler: moneyController.deleteAsset,
  });

  //                                                        ~~~ TRANSACTIONS ~~~

  fastify.get('/transactions', {
    schema: transactionSchemas.getTransactions,
    preValidation: [authController.authMiddleware],
    compress: false,
    handler: moneyController.getTransactions,
  });

  fastify.get('/trades', {
    schema: transactionSchemas.getInvestAssetTrades,
    preValidation: [authController.authMiddleware],
    compress: false,
    handler: moneyController.getInvestAssetTrades,
  });

  fastify.get('/rate-history', {
    schema: rateHistorySchemas.getRateHistory,
    preValidation: [authController.authMiddleware],
    handler: moneyController.getRateHistory,
  });

  fastify.get('/snapshot', {
    preValidation: [authController.authMiddleware],
    compress: false,
    handler: moneyController.getSnapshot,
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
