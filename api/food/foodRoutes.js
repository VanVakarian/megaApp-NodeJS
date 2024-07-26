import authController from '../auth/authController.js';
import foodController from './foodController.js';

const foodRoutes = async (fastify) => {
  fastify.get('/diary', {
    schema: {
      tags: ['food'],
      querystring: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          range: { type: 'number' },
        },
        required: [],
      },
    },
    preValidation: [authController.authMiddleware],
    handler: foodController.getDiary,
  });

  fastify.get('/catalogue', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.getCatalogue,
  });

  fastify.post('/', {
    schema: { tags: ['food'] },
    preValidation: [authController.authMiddleware],
    handler: foodController.postFood,
  });
};

export default foodRoutes;
