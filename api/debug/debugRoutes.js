import authController from '../auth/authController.js';
import debugController from './debugController.js';

const debugRoutes = async (fastify) => {
  fastify.get('/ping', { schema: { tags: ['debug'] }, handler: debugController.ping });
  fastify.get('/transfer', { schema: { tags: ['debug'] }, handler: debugController.transfer });
  // fastify.post('/chrextest', { schema: { tags: ['debug'] } }, debugController.chrextest);
};

export default debugRoutes;
