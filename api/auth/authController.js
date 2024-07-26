import authService from './authService.js';

const authController = {
  async register(request, reply) {
    const { username, password } = request.body;
    try {
      await authService.register(username, password);
      reply.code(201).send({ message: 'User created successfully' });
    } catch (error) {
      reply.code(400).send({ detail: error.message });
    }
  },

  async login(request, reply) {
    const { username, password } = request.body;
    try {
      const tokens = await authService.login(username, password);
      reply.send(tokens);
    } catch (error) {
      reply.code(401).send({ detail: error.message });
    }
  },

  async refresh(request, reply) {
    const { refreshToken } = request.body;
    try {
      const tokens = await authService.refreshToken(refreshToken);
      reply.send(tokens);
    } catch (error) {
      reply.code(401).send({ detail: error.message });
    }
  },

  unprotected(request, reply) {
    reply.send({ hello: 'world' });
  },

  async protected(request, reply) {
    reply.send({ usersId: request.user.id });
  },

  async authMiddleware(request, reply) {
    try {
      const token = request.headers.authorization.split(' ')[1];
      const decoded = await authService.verifyToken(token);
      request.user = decoded;
    } catch (error) {
      // console.log('error', error);
      reply.code(401).send({ detail: 'Invalid token' });
    }
  },
};

export default authController;
