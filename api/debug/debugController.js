import debugService from './debugService.js';

const debugController = {
  async ping(request, reply) {
    const message = await debugService.ping();
    reply.send({ message: message });
  },

  async transfer(request, reply) {
    try {
      await debugService.transfer();
      reply.send({ job: 'done' });
    } catch (error) {
      reply.status(500).send({ error: error.message });
    }
  },
};

export default debugController;
